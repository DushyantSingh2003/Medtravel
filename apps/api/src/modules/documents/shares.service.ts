import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaClient } from '@medtravel/db';
import type { Actor } from '../../auth/actor.js';
import { AuditService } from '../../audit/audit.service.js';
import type { RequestContext } from '../../common/request-context.js';
import { PRISMA } from '../../database/database.module.js';
import { OutboxService } from '../../outbox/outbox.service.js';
import { DocumentsService } from './documents.service.js';

/** The wording version of the sharing consent the patient is shown; bump it when the text changes. */
const CONSENT_TEXT_VERSION = 'share-medical-v1';

/**
 * Who sees a document is the patient's decision. Turning sharing on with a hospital records their consent (type
 * `share_medical_with_hospital`, for that case and hospital) and opens a `DocumentShare`; turning it off closes the share.
 * The hospitals offered are those the case has an opinion request with.
 */
@Injectable()
export class SharesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly documents: DocumentsService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async targets(
    actor: Actor,
    id: string,
  ): Promise<{ hospitalId: string; hospitalName: string; shared: boolean }[]> {
    const doc = await this.documents.findVisible(actor, id, { id: true, caseId: true });
    if (!doc.caseId) return [];
    const [requests, shares] = await Promise.all([
      this.prisma.opinionRequest.findMany({
        where: { caseId: doc.caseId, deletedAt: null, status: { notIn: ['cancelled'] } },
        select: { hospitalId: true, hospital: { select: { name: true } } },
        distinct: ['hospitalId'],
      }),
      this.prisma.documentShare.findMany({
        where: {
          documentId: id,
          revokedAt: null,
          deletedAt: null,
          consent: { withdrawnAt: null, deletedAt: null },
        },
        select: { hospitalId: true },
      }),
    ]);
    const shared = new Set(shares.map((share) => share.hospitalId));
    return requests
      .map((request) => ({
        hospitalId: request.hospitalId,
        hospitalName: request.hospital.name,
        shared: shared.has(request.hospitalId),
      }))
      .sort((a, b) => a.hospitalName.localeCompare(b.hospitalName));
  }

  async set(
    actor: Actor,
    context: RequestContext,
    id: string,
    hospitalId: string,
    shared: boolean,
  ): Promise<void> {
    if (actor.role !== 'patient')
      throw new ForbiddenException('Only the patient can decide who sees a document');
    const doc = await this.documents.findVisible(actor, id, {
      id: true,
      caseId: true,
      patientId: true,
      scanStatus: true,
    });
    if (!doc.caseId || !doc.patientId)
      throw new ConflictException('Only a document of a case can be shared');
    const offered = await this.prisma.opinionRequest.findFirst({
      where: { caseId: doc.caseId, hospitalId, deletedAt: null, status: { notIn: ['cancelled'] } },
      select: { id: true },
    });
    if (!offered) throw new NotFoundException('That hospital has not been asked about this case');

    const { caseId, patientId } = doc;
    await this.prisma.$transaction(async (tx) => {
      if (shared) {
        const consent =
          (await tx.consent.findFirst({
            where: {
              patientId,
              hospitalId,
              caseId,
              type: 'share_medical_with_hospital',
              withdrawnAt: null,
              deletedAt: null,
            },
            select: { id: true },
          })) ??
          (await tx.consent.create({
            data: {
              patientId,
              hospitalId,
              caseId,
              type: 'share_medical_with_hospital',
              ip: context.ip,
              textVersion: CONSENT_TEXT_VERSION,
            },
            select: { id: true },
          }));
        await tx.documentShare.upsert({
          where: { documentId_hospitalId: { documentId: id, hospitalId } },
          update: {
            revokedAt: null,
            deletedAt: null,
            consentId: consent.id,
            sharedById: actor.userId,
          },
          create: { documentId: id, hospitalId, consentId: consent.id, sharedById: actor.userId },
        });
      } else {
        await tx.documentShare.updateMany({
          where: { documentId: id, hospitalId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await this.audit.record(tx, context, {
        action: shared ? 'document.shared' : 'document.unshared',
        entityType: 'Document',
        entityId: id,
        patientId,
        after: { hospitalId },
      });
      await this.outbox.publish(tx, {
        type: shared ? 'document.shared' : 'document.unshared',
        aggregateType: 'Document',
        aggregateId: id,
        payload: { documentId: id, hospitalId, caseId },
      });
    });
  }
}
