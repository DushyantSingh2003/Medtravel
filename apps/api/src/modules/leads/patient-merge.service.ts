import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@medtravel/db';
import { AuditService } from '../../audit/audit.service.js';
import type { RequestContext } from '../../common/request-context.js';
import type { Db } from '../../database/database.module.js';
import { OutboxService } from '../../outbox/outbox.service.js';

const fieldError = (path: string, message: string, status = HttpStatus.UNPROCESSABLE_ENTITY) =>
  new HttpException({ statusCode: status, message, errors: [{ path: [path], message }] }, status);

/** Patient columns copied to the survivor when it has none of its own. */
const FILL_FIELDS = [
  'dateOfBirth',
  'gender',
  'passportNumber',
  'passportExpiry',
  'phone',
  'email',
  'address',
  'preferredLanguage',
  'emergencyContactName',
  'emergencyContactPhone',
  'emergencyContactRelation',
  'nationalityCode',
  'countryOfResidenceCode',
] as const;

/**
 * Every table that points at a patient (the audit log is the exception: its rows are never rewritten, and `Patient.mergedIntoId`
 * leads from an old id to the survivor), and how many rows moved. A new table with a patient id must be added here: the unit test
 * in `patient-merge.spec.ts` reads the schema and fails until it is.
 */
export const PATIENT_OWNED_TABLES = [
  'Attendant',
  'Case',
  'Consent',
  'Document',
  'FileUpload',
  'Feedback',
  'Lead',
  'VisaApplication',
] as const;

/** Puts two records of one person together without losing anything either of them has. */
@Injectable()
export class PatientMergeService {
  constructor(
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Moves everything that belongs to `sourceId` onto `targetId` and retires the source. All inside the caller's transaction, under a
   * lock on both patients (taken in id order so two merges of the same pair cannot deadlock).
   */
  async merge(
    tx: Db,
    sourceId: string,
    targetId: string,
    context: RequestContext,
  ): Promise<{ moved: Record<string, number> }> {
    if (sourceId === targetId) throw fieldError('patient', 'Choose two different patients');
    for (const id of [sourceId, targetId].sort())
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`patient:${id}`}))`;

    const load = (id: string) =>
      tx.patient.findFirst({
        where: { id, deletedAt: null, mergedIntoId: null },
        select: {
          id: true,
          userId: true,
          ...Object.fromEntries(FILL_FIELDS.map((f) => [f, true])),
        } as Prisma.PatientSelect,
      }) as Promise<(Record<string, unknown> & { id: string; userId: string | null }) | null>;
    const [source, target] = await Promise.all([load(sourceId), load(targetId)]);
    if (!source || !target) throw new NotFoundException('That patient record no longer exists');
    if (source.userId && target.userId)
      throw new ConflictException(
        'Both patients have their own portal login, so they cannot be merged here',
      );

    const moved: Record<string, number> = {
      Case: (await tx.case.updateMany({ where: { patientId: sourceId }, data: { patientId: targetId } })).count,
      Document: (await tx.document.updateMany({ where: { patientId: sourceId }, data: { patientId: targetId } })).count,
      Consent: (await tx.consent.updateMany({ where: { patientId: sourceId }, data: { patientId: targetId } })).count,
      Attendant: (await tx.attendant.updateMany({ where: { patientId: sourceId }, data: { patientId: targetId } })).count,
      VisaApplication: (await tx.visaApplication.updateMany({ where: { patientId: sourceId }, data: { patientId: targetId } })).count,
      FileUpload: (await tx.fileUpload.updateMany({ where: { patientId: sourceId }, data: { patientId: targetId } })).count,
      Feedback: (await tx.feedback.updateMany({ where: { patientId: sourceId }, data: { patientId: targetId } })).count,
      Lead: (await tx.lead.updateMany({ where: { patientId: sourceId }, data: { patientId: targetId } })).count,
    };
    // Leads that pointed at either record as "the other one" are settled by this merge.
    await tx.lead.updateMany({
      where: {
        duplicateState: 'possible',
        OR: [
          { patientId: targetId, duplicateOfPatientId: sourceId },
          { patientId: sourceId, duplicateOfPatientId: targetId },
          { patientId: targetId, duplicateOfPatientId: targetId },
        ],
      },
      data: { duplicateState: 'merged', duplicateOfPatientId: targetId },
    });
    await tx.lead.updateMany({ where: { duplicateOfPatientId: sourceId }, data: { duplicateOfPatientId: targetId } });

    // The survivor keeps what it has and gains what only the other record knew, including the portal login.
    const fill: Record<string, unknown> = {};
    for (const field of FILL_FIELDS) if (target[field] == null && source[field] != null) fill[field] = source[field];
    const now = new Date();
    await tx.patient.update({
      where: { id: sourceId },
      data: { deletedAt: now, mergedIntoId: targetId, mergedAt: now, userId: null },
    });
    await tx.patient.update({
      where: { id: targetId },
      data: { ...(fill as Prisma.PatientUpdateInput), ...(!target.userId && source.userId ? { user: { connect: { id: source.userId } } } : {}) },
    });

    await this.audit.record(tx, context, {
      action: 'patient.merged',
      entityType: 'Patient',
      entityId: targetId,
      patientId: targetId,
      // Ids and counts only: what the records held stays in the records.
      after: { mergedFrom: sourceId, moved, filled: Object.keys(fill), portalLoginMoved: !target.userId && Boolean(source.userId) },
    });
    await this.outbox.publish(tx, {
      type: 'patient.merged',
      aggregateType: 'Patient',
      aggregateId: targetId,
      payload: { patientId: targetId, mergedFrom: sourceId },
    });
    return { moved };
  }
}
