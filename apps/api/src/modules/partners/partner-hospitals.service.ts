import { HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@medtravel/db';
import type {
  AccreditationView,
  AgreementInput,
  CursorPage,
  HospitalDetail,
  HospitalListQuery,
  HospitalRow,
  PublishResult,
  VerifyAccreditation,
} from '@medtravel/contracts';
import type { Actor } from '../../auth/actor.js';
import { AuditService } from '../../audit/audit.service.js';
import { readPage } from '../../common/cursor.js';
import type { RequestContext } from '../../common/request-context.js';
import { PRISMA, type Db } from '../../database/database.module.js';
import { OutboxService } from '../../outbox/outbox.service.js';
import { doctorTags, hospitalTags, packageTags, queueRevalidation } from './revalidation.js';

const fieldError = (path: string, message: string, status = HttpStatus.UNPROCESSABLE_ENTITY) =>
  new HttpException({ statusCode: status, message, errors: [{ path: [path], message }] }, status);

const dayText = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const startOfToday = (): Date => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

const ROW_SELECT = {
  id: true,
  name: true,
  status: true,
  agreementBp: true,
  agreementEndsOn: true,
  city: { select: { name: true } },
  _count: {
    select: { changeRequests: { where: { status: 'pending', deletedAt: null } } },
  },
} satisfies Prisma.HospitalSelect;
type RowData = Prisma.HospitalGetPayload<{ select: typeof ROW_SELECT }>;

const rowOf = (h: RowData): HospitalRow => ({
  id: h.id,
  name: h.name,
  cityName: h.city.name,
  status: h.status,
  agreementBp: h.agreementBp,
  agreementEndsOn: dayText(h.agreementEndsOn),
  pendingRequests: h._count.changeRequests,
});

/** Hospitals, their agreements and accreditation checks, and what the website shows: hospital, doctors and packages. */
@Injectable()
export class PartnerHospitalsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async list(query: HospitalListQuery): Promise<CursorPage<HospitalRow>> {
    const where: Prisma.HospitalWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const { rows, nextCursor, total } = await readPage<RowData>({
      limit: query.limit,
      cursor: query.cursor,
      keyOf: (r) => r.id,
      find: ({ take, skip, cursorKey }) =>
        this.prisma.hospital.findMany({
          where,
          select: ROW_SELECT,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          take,
          ...(cursorKey ? { cursor: { id: cursorKey }, skip: skip ?? 1 } : {}),
        }),
      count: () => this.prisma.hospital.count({ where }),
    });
    return { items: rows.map(rowOf), nextCursor, total };
  }

  async get(id: string): Promise<HospitalDetail> {
    const h = await this.prisma.hospital.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...ROW_SELECT,
        agreementStartsOn: true,
        agreementDocumentId: true,
        accreditations: {
          where: { deletedAt: null },
          orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            body: true,
            certificateNo: true,
            issuedAt: true,
            expiresAt: true,
            certificateId: true,
            verifiedAt: true,
            verificationNote: true,
            verifiedBy: { select: { name: true } },
          },
        },
        doctors: {
          where: { deletedAt: null },
          orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
          select: { id: true, fullName: true, published: true },
        },
        packages: {
          where: { deletedAt: null },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            name: true,
            priceMinor: true,
            currency: true,
            active: true,
            published: true,
          },
        },
      },
    });
    if (!h) throw new NotFoundException('That hospital does not exist');
    const today = startOfToday();
    const accreditations: AccreditationView[] = h.accreditations.map((a) => ({
      id: a.id,
      body: a.body,
      certificateNo: a.certificateNo,
      issuedAt: dayText(a.issuedAt),
      expiresAt: dayText(a.expiresAt),
      expired: a.expiresAt !== null && a.expiresAt < today,
      certificateId: a.certificateId,
      verifiedAt: a.verifiedAt?.toISOString() ?? null,
      verifiedByName: a.verifiedBy?.name ?? null,
      verificationNote: a.verificationNote,
    }));
    return {
      ...rowOf(h),
      agreementStartsOn: dayText(h.agreementStartsOn),
      agreementDocumentId: h.agreementDocumentId,
      accreditations,
      doctors: h.doctors,
      packages: h.packages.map((p) => ({ ...p, priceMinor: Number(p.priceMinor) })),
    };
  }

  private async load(db: Db, id: string) {
    const h = await db.hospital.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, slug: true, status: true, agreementBp: true },
    });
    if (!h) throw new NotFoundException('That hospital does not exist');
    return h;
  }

  // ---- agreement ---------------------------------------------------------------------------------------------
  async setAgreement(id: string, input: AgreementInput, context: RequestContext): Promise<HospitalDetail> {
    await this.prisma.$transaction(async (tx) => {
      await this.load(tx, id);
      if (input.documentId) {
        const doc = await tx.document.findFirst({
          where: { id: input.documentId, kind: 'agreement', deletedAt: null },
          select: { id: true },
        });
        if (!doc)
          throw fieldError('documentId', 'Choose an uploaded document of the kind "agreement"');
      }
      const before = await tx.hospital.findUniqueOrThrow({
        where: { id },
        select: {
          agreementBp: true,
          agreementStartsOn: true,
          agreementEndsOn: true,
          agreementDocumentId: true,
        },
      });
      await tx.hospital.update({
        where: { id },
        data: {
          agreementBp: input.agreementBp,
          agreementStartsOn: new Date(`${input.startsOn}T00:00:00.000Z`),
          agreementEndsOn: new Date(`${input.endsOn}T00:00:00.000Z`),
          agreementDocumentId: input.documentId,
        },
      });
      await this.audit.record(tx, context, {
        action: 'hospital.agreement_updated',
        entityType: 'Hospital',
        entityId: id,
        before: {
          agreementBp: before.agreementBp,
          startsOn: dayText(before.agreementStartsOn),
          endsOn: dayText(before.agreementEndsOn),
          documentId: before.agreementDocumentId,
        },
        after: {
          agreementBp: input.agreementBp,
          startsOn: input.startsOn,
          endsOn: input.endsOn,
          documentId: input.documentId,
        },
      });
    });
    return this.get(id);
  }

  // ---- accreditation ---------------------------------------------------------------------------------------------
  async verifyAccreditation(
    actor: Actor,
    id: string,
    input: VerifyAccreditation,
    context: RequestContext,
  ): Promise<HospitalDetail> {
    const hospitalId = await this.prisma.$transaction(async (tx) => {
      const a = await tx.accreditation.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, hospitalId: true, certificateId: true, verifiedAt: true },
      });
      if (!a) throw new NotFoundException('That accreditation does not exist');
      if (input.verified && !a.certificateId)
        throw fieldError('verified', 'There is no certificate to check: ask the hospital to upload it');
      await tx.accreditation.update({
        where: { id },
        data: input.verified
          ? {
              verifiedAt: new Date(),
              verifiedById: actor.userId,
              verificationNote: input.note ?? null,
            }
          : { verifiedAt: null, verifiedById: null, verificationNote: input.note ?? null },
      });
      await this.audit.record(tx, context, {
        action: input.verified ? 'accreditation.verified' : 'accreditation.verification_removed',
        entityType: 'Accreditation',
        entityId: id,
        before: { verified: a.verifiedAt !== null },
        after: { verified: input.verified, ...(input.note ? { note: input.note } : {}) },
      });
      return a.hospitalId;
    });
    return this.get(hospitalId);
  }

  // ---- publishing --------------------------------------------------------------------------------------------
  async publishHospital(id: string, context: RequestContext): Promise<PublishResult> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner-publish:${id}`}))`;
      const h = await this.load(tx, id);
      if (h.status !== 'approved' && h.status !== 'unpublished')
        throw fieldError(
          'status',
          'Only an approved or unpublished hospital can be published',
          HttpStatus.CONFLICT,
        );
      if (h.agreementBp === null)
        throw fieldError('agreementBp', 'Set the referral fee and agreement first');
      const good = await tx.accreditation.count({
        where: {
          hospitalId: id,
          deletedAt: null,
          verifiedAt: { not: null },
          OR: [{ expiresAt: null }, { expiresAt: { gte: startOfToday() } }],
        },
      });
      if (good === 0)
        throw fieldError(
          'accreditations',
          'Verify at least one accreditation that has not expired',
        );
      await tx.hospital.update({
        where: { id },
        data: { status: 'published', publishedAt: new Date() },
      });
      await this.audit.record(tx, context, {
        action: 'hospital.published',
        entityType: 'Hospital',
        entityId: id,
        before: { status: h.status },
        after: { status: 'published' },
      });
      await queueRevalidation(this.outbox, tx, { type: 'Hospital', id }, hospitalTags(h.slug));
    });
    return { id, published: true };
  }

  async unpublishHospital(id: string, context: RequestContext): Promise<PublishResult> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner-publish:${id}`}))`;
      const h = await this.load(tx, id);
      if (h.status !== 'published')
        throw fieldError('status', 'This hospital is not published', HttpStatus.CONFLICT);
      await tx.hospital.update({ where: { id }, data: { status: 'unpublished' } });
      await this.audit.record(tx, context, {
        action: 'hospital.unpublished',
        entityType: 'Hospital',
        entityId: id,
        before: { status: 'published' },
        after: { status: 'unpublished' },
      });
      await queueRevalidation(this.outbox, tx, { type: 'Hospital', id }, hospitalTags(h.slug));
    });
    return { id, published: false };
  }

  async setDoctorPublished(id: string, published: boolean, context: RequestContext): Promise<PublishResult> {
    await this.prisma.$transaction(async (tx) => {
      const d = await tx.doctor.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, slug: true, published: true, hospital: { select: { slug: true, status: true } } },
      });
      if (!d) throw new NotFoundException('That doctor does not exist');
      if (published && d.hospital.status !== 'published')
        throw fieldError('hospital', 'Publish the hospital first', HttpStatus.CONFLICT);
      if (d.published === published) return;
      await tx.doctor.update({ where: { id }, data: { published } });
      await this.audit.record(tx, context, {
        action: published ? 'doctor.published' : 'doctor.unpublished',
        entityType: 'Doctor',
        entityId: id,
        before: { published: d.published },
        after: { published },
      });
      await queueRevalidation(this.outbox, tx, { type: 'Doctor', id }, [
        ...doctorTags(d.slug ?? d.id),
        ...hospitalTags(d.hospital.slug),
      ]);
    });
    return { id, published };
  }

  async setPackagePublished(id: string, published: boolean, context: RequestContext): Promise<PublishResult> {
    await this.prisma.$transaction(async (tx) => {
      const p = await tx.package.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, active: true, published: true, hospital: { select: { slug: true, status: true } } },
      });
      if (!p) throw new NotFoundException('That package does not exist');
      if (published && p.hospital.status !== 'published')
        throw fieldError('hospital', 'Publish the hospital first', HttpStatus.CONFLICT);
      if (published && !p.active)
        throw fieldError('active', 'A package that is not on offer cannot be published');
      if (p.published === published) return;
      await tx.package.update({ where: { id }, data: { published } });
      await this.audit.record(tx, context, {
        action: published ? 'package.published' : 'package.unpublished',
        entityType: 'Package',
        entityId: id,
        before: { published: p.published },
        after: { published },
      });
      await queueRevalidation(this.outbox, tx, { type: 'Package', id }, packageTags(p.hospital.slug));
    });
    return { id, published };
  }
}
