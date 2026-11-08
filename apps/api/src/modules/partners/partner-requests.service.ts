import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, PrismaClient } from '@medtravel/db';
import {
  PROFILE_FIELDS,
  hospitalProfileFieldsSchema,
  type ChangeRequestDetail,
  type ChangeRequestListQuery,
  type ChangeRequestRow,
  type CursorPage,
  type DiffRow,
  type HospitalProfileFields,
  type ProfileField,
  type RejectRequest,
  type Role,
  type SubmitOnboarding,
  type SubmitPriceChange,
  type SubmitProfileEdit,
} from '@medtravel/contracts';
import type { Actor } from '../../auth/actor.js';
import { AuditService } from '../../audit/audit.service.js';
import { readPage } from '../../common/cursor.js';
import type { RequestContext } from '../../common/request-context.js';
import { PRISMA, type Db } from '../../database/database.module.js';
import { OutboxService } from '../../outbox/outbox.service.js';
import { packageTags, hospitalTags, queueRevalidation } from './revalidation.js';

const fieldError = (path: string, message: string, status = HttpStatus.UNPROCESSABLE_ENTITY) =>
  new HttpException({ statusCode: status, message, errors: [{ path: [path], message }] }, status);

type Scalar = string | number | boolean | null;
type Fields = Record<string, Scalar>;

const HOSPITAL_SELECT = Object.fromEntries(PROFILE_FIELDS.map((f) => [f, true])) as Record<
  ProfileField,
  true
>;

const ROW_SELECT = {
  id: true,
  kind: true,
  status: true,
  proposed: true,
  createdAt: true,
  decidedAt: true,
  hospitalId: true,
  hospital: { select: { name: true } },
  package: { select: { name: true } },
  submittedBy: { select: { name: true } },
} satisfies Prisma.PartnerChangeRequestSelect;
type RowData = Prisma.PartnerChangeRequestGetPayload<{ select: typeof ROW_SELECT }>;

const asFields = (json: Prisma.JsonValue): Fields =>
  json && typeof json === 'object' && !Array.isArray(json) ? (json as Fields) : {};

/** Roles that work for a hospital and so only ever see their own hospital's requests. */
const HOSPITAL_ROLES: Role[] = ['hospital_desk', 'doctor'];

@Injectable()
export class PartnerRequestsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  // ---- who the hospital is -------------------------------------------------------------------------------------
  private async hospitalFor(db: Db, actor: Actor, requested?: string): Promise<string> {
    const links = await db.hospitalStaff.findMany({
      where: { userId: actor.userId, deletedAt: null },
      select: { hospitalId: true },
    });
    const own = links.map((l) => l.hospitalId);
    if (actor.role === 'super_admin') {
      if (!requested) throw fieldError('hospitalId', 'Name the hospital this is for');
      return requested;
    }
    if (requested) {
      if (!own.includes(requested)) throw new ForbiddenException('That is not your hospital');
      return requested;
    }
    const first = own[0];
    if (!first) throw new ForbiddenException('Your account is not linked to a hospital');
    return first;
  }

  // ---- submitting -----------------------------------------------------------------------------------------------
  async submitProfileEdit(
    actor: Actor,
    input: SubmitProfileEdit,
    context: RequestContext,
  ): Promise<ChangeRequestRow> {
    const id = await this.prisma.$transaction(async (tx) => {
      const hospitalId = await this.hospitalFor(tx, actor, input.hospitalId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner-profile:${hospitalId}`}))`;
      const hospital = await tx.hospital.findFirst({
        where: { id: hospitalId, deletedAt: null },
        select: HOSPITAL_SELECT,
      });
      if (!hospital) throw new NotFoundException('That hospital does not exist');
      const current = hospital as Fields;
      const proposed: Fields = {};
      const was: Fields = {};
      for (const [field, raw] of Object.entries(input.fields)) {
        if ((PROFILE_FIELDS as readonly string[]).indexOf(field) < 0) continue;
        // Clearing a field is null, whether it was sent as null or as an empty text.
        const value = raw === '' ? null : raw;
        if (value === undefined || value === (current[field] ?? null)) continue;
        proposed[field] = value as Scalar;
        was[field] = current[field] ?? null;
      }
      if (Object.keys(proposed).length === 0)
        throw fieldError('fields', 'Nothing here differs from what is already shown');
      const pending = await tx.partnerChangeRequest.count({
        where: { hospitalId, kind: 'hospital_profile', status: 'pending', deletedAt: null },
      });
      if (pending > 0)
        throw fieldError('fields', 'A profile change is already waiting for review', HttpStatus.CONFLICT);
      const created = await tx.partnerChangeRequest.create({
        data: {
          kind: 'hospital_profile',
          hospitalId,
          current: was as Prisma.InputJsonObject,
          proposed: proposed as Prisma.InputJsonObject,
          ...(input.note ? { note: input.note } : {}),
          submittedById: actor.userId,
        },
        select: { id: true },
      });
      await this.recordSubmitted(tx, context, created.id, 'hospital_profile', hospitalId);
      return created.id;
    });
    return this.row(id);
  }

  async submitPriceChange(
    actor: Actor,
    input: SubmitPriceChange,
    context: RequestContext,
  ): Promise<ChangeRequestRow> {
    const id = await this.prisma.$transaction(async (tx) => {
      const pack = await tx.package.findFirst({
        where: { id: input.packageId, deletedAt: null },
        select: { id: true, hospitalId: true, priceMinor: true, currency: true },
      });
      if (!pack) throw new NotFoundException('That package does not exist');
      const hospitalId = await this.hospitalFor(tx, actor, pack.hospitalId);
      if (hospitalId !== pack.hospitalId) throw new ForbiddenException('That is not your package');
      const currency = await tx.currency.findFirst({
        where: { code: input.currency, active: true },
        select: { code: true },
      });
      if (!currency) throw fieldError('currency', `Not an active currency: ${input.currency}`);
      if (BigInt(input.priceMinor) === pack.priceMinor && input.currency === pack.currency)
        throw fieldError('priceMinor', 'This is already the price');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner-price:${pack.id}`}))`;
      const pending = await tx.partnerChangeRequest.count({
        where: { packageId: pack.id, kind: 'package_price', status: 'pending', deletedAt: null },
      });
      if (pending > 0)
        throw fieldError('priceMinor', 'A price change is already waiting for review', HttpStatus.CONFLICT);
      const created = await tx.partnerChangeRequest.create({
        data: {
          kind: 'package_price',
          hospitalId,
          packageId: pack.id,
          current: { priceMinor: Number(pack.priceMinor), currency: pack.currency },
          proposed: { priceMinor: input.priceMinor, currency: input.currency },
          ...(input.note ? { note: input.note } : {}),
          submittedById: actor.userId,
        },
        select: { id: true },
      });
      await this.recordSubmitted(tx, context, created.id, 'package_price', hospitalId);
      return created.id;
    });
    return this.row(id);
  }

  async submitOnboarding(
    actor: Actor,
    input: SubmitOnboarding,
    context: RequestContext,
  ): Promise<ChangeRequestRow> {
    const id = await this.prisma.$transaction(async (tx) => {
      const hospitalId = await this.hospitalFor(tx, actor, input.hospitalId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner-onboarding:${hospitalId}`}))`;
      const hospital = await tx.hospital.findFirst({
        where: { id: hospitalId, deletedAt: null },
        select: { ...HOSPITAL_SELECT, status: true },
      });
      if (!hospital) throw new NotFoundException('That hospital does not exist');
      if (hospital.status !== 'draft')
        throw fieldError('status', 'Only a draft profile can be submitted for review', HttpStatus.CONFLICT);
      const { status: _status, ...profile } = hospital;
      void _status;
      await tx.hospital.update({ where: { id: hospitalId }, data: { status: 'pending_review' } });
      const created = await tx.partnerChangeRequest.create({
        data: {
          kind: 'hospital_onboarding',
          hospitalId,
          current: {},
          proposed: profile as Prisma.InputJsonObject,
          ...(input.note ? { note: input.note } : {}),
          submittedById: actor.userId,
        },
        select: { id: true },
      });
      await this.audit.record(tx, context, {
        action: 'hospital.status_changed',
        entityType: 'Hospital',
        entityId: hospitalId,
        before: { status: 'draft' },
        after: { status: 'pending_review' },
      });
      await this.recordSubmitted(tx, context, created.id, 'hospital_onboarding', hospitalId);
      return created.id;
    });
    return this.row(id);
  }

  private async recordSubmitted(
    tx: Db,
    context: RequestContext,
    id: string,
    kind: string,
    hospitalId: string,
  ): Promise<void> {
    await this.audit.record(tx, context, {
      action: 'partner.request_submitted',
      entityType: 'PartnerChangeRequest',
      entityId: id,
      after: { kind, hospitalId },
    });
    await this.outbox.publish(tx, {
      type: 'partner.request_submitted',
      aggregateType: 'PartnerChangeRequest',
      aggregateId: id,
      payload: { requestId: id, kind, hospitalId },
    });
  }

  async withdraw(actor: Actor, id: string, context: RequestContext): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // The same lock a decision takes, so a withdrawal and an approval at the same moment cannot both win.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner-request:${id}`}))`;
      const request = await tx.partnerChangeRequest.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, kind: true, status: true, hospitalId: true },
      });
      if (!request) throw new NotFoundException('That request does not exist');
      await this.hospitalFor(tx, actor, request.hospitalId);
      if (request.status !== 'pending')
        throw new ConflictException('Only a request still waiting for review can be withdrawn');
      if (request.kind === 'hospital_onboarding')
        await tx.hospital.updateMany({
          where: { id: request.hospitalId, status: 'pending_review' },
          data: { status: 'draft' },
        });
      await tx.partnerChangeRequest.update({ where: { id }, data: { status: 'withdrawn' } });
      await this.audit.record(tx, context, {
        action: 'partner.request_withdrawn',
        entityType: 'PartnerChangeRequest',
        entityId: id,
        before: { status: 'pending' },
        after: { status: 'withdrawn' },
      });
    });
  }

  // ---- reading -----------------------------------------------------------------------------------------------
  private view(row: RowData): ChangeRequestRow {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      hospitalId: row.hospitalId,
      hospitalName: row.hospital.name,
      packageName: row.package?.name ?? null,
      changedFields: row.kind === 'hospital_onboarding' ? [] : Object.keys(asFields(row.proposed)),
      submittedAt: row.createdAt.toISOString(),
      submittedByName: row.submittedBy?.name ?? null,
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private async row(id: string): Promise<ChangeRequestRow> {
    const row = await this.prisma.partnerChangeRequest.findUniqueOrThrow({
      where: { id },
      select: ROW_SELECT,
    });
    return this.view(row);
  }

  async list(actor: Actor, query: ChangeRequestListQuery): Promise<CursorPage<ChangeRequestRow>> {
    const where: Prisma.PartnerChangeRequestWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
    };
    if (HOSPITAL_ROLES.includes(actor.role)) {
      const links = await this.prisma.hospitalStaff.findMany({
        where: { userId: actor.userId, deletedAt: null },
        select: { hospitalId: true },
      });
      where.hospitalId = {
        in: links.map((l) => l.hospitalId).filter((h) => !query.hospitalId || h === query.hospitalId),
      };
    }
    const { rows, nextCursor, total } = await readPage<RowData>({
      limit: query.limit,
      cursor: query.cursor,
      keyOf: (r) => r.id,
      find: ({ take, skip, cursorKey }) =>
        this.prisma.partnerChangeRequest.findMany({
          where,
          select: ROW_SELECT,
          // Oldest waiting first: the queue is worked from the top.
          orderBy: [{ createdAt: query.status === 'pending' ? 'asc' : 'desc' }, { id: 'asc' }],
          take,
          ...(cursorKey ? { cursor: { id: cursorKey }, skip: skip ?? 1 } : {}),
        }),
      count: () => this.prisma.partnerChangeRequest.count({ where }),
    });
    return { items: rows.map((r) => this.view(r)), nextCursor, total };
  }

  /** The values the live records hold now for the fields a request touches. */
  private async liveValues(db: Db, request: {
    kind: string;
    hospitalId: string;
    packageId: string | null;
  }): Promise<Fields> {
    if (request.kind === 'package_price' && request.packageId) {
      const pack = await db.package.findUnique({
        where: { id: request.packageId },
        select: { priceMinor: true, currency: true },
      });
      return pack ? { priceMinor: Number(pack.priceMinor), currency: pack.currency } : {};
    }
    const hospital = await db.hospital.findUnique({
      where: { id: request.hospitalId },
      select: HOSPITAL_SELECT,
    });
    return (hospital ?? {}) as Fields;
  }

  async get(id: string): Promise<ChangeRequestDetail> {
    const found = await this.prisma.partnerChangeRequest.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...ROW_SELECT,
        current: true,
        note: true,
        decisionReason: true,
        packageId: true,
        decidedBy: { select: { name: true } },
      },
    });
    if (!found) throw new NotFoundException('That request does not exist');
    const live = await this.liveValues(this.prisma, found);
    const submitted = asFields(found.current);
    const proposed = asFields(found.proposed);
    const pending = found.status === 'pending';
    const diff: DiffRow[] = Object.keys(proposed).map((field) => ({
      field,
      submitted: submitted[field] ?? null,
      live: live[field] ?? null,
      proposed: proposed[field] ?? null,
      // Only a request still open can be out of date; for an onboarding there was nothing submitted to compare with.
      stale:
        pending &&
        found.kind !== 'hospital_onboarding' &&
        (live[field] ?? null) !== (submitted[field] ?? null),
    }));
    return {
      ...this.view(found),
      changedFields: Object.keys(proposed),
      note: found.note,
      decisionReason: found.decisionReason,
      decidedByName: found.decidedBy?.name ?? null,
      diff,
    };
  }

  // ---- deciding ---------------------------------------------------------------------------------------------
  async approve(actor: Actor, id: string, context: RequestContext): Promise<ChangeRequestDetail> {
    await this.prisma.$transaction(async (tx) => {
      const request = await this.lockPending(tx, id);
      const proposed = asFields(request.proposed);
      const hospital = await tx.hospital.findFirst({
        where: { id: request.hospitalId, deletedAt: null },
        select: { id: true, slug: true, status: true, name: true },
      });
      if (!hospital) throw new NotFoundException('That hospital no longer exists');
      const tags: string[] = [];
      let before: Fields = {};
      let after: Fields = {};

      if (request.kind === 'hospital_onboarding') {
        if (hospital.status !== 'pending_review')
          throw new ConflictException('The hospital is no longer waiting for review');
        await tx.hospital.update({ where: { id: hospital.id }, data: { status: 'approved' } });
        before = { status: 'pending_review' };
        after = { status: 'approved' };
      } else if (request.kind === 'hospital_profile') {
        const parsed = hospitalProfileFieldsSchema.safeParse(proposed);
        if (!parsed.success)
          throw fieldError('proposed', 'The proposed values are no longer valid');
        before = await this.liveValues(tx, request);
        const data = parsed.data as HospitalProfileFields;
        await tx.hospital.update({ where: { id: hospital.id }, data });
        after = proposed;
        before = Object.fromEntries(Object.keys(proposed).map((k) => [k, before[k] ?? null]));
        if (hospital.status === 'published') tags.push(...hospitalTags(hospital.slug));
      } else {
        if (!request.packageId) throw new ConflictException('The package is missing');
        const pack = await tx.package.findFirst({
          where: { id: request.packageId, deletedAt: null },
          select: { id: true, priceMinor: true, currency: true, published: true },
        });
        if (!pack) throw new ConflictException('The package no longer exists');
        before = { priceMinor: Number(pack.priceMinor), currency: pack.currency };
        const priceMinor = proposed['priceMinor'];
        const currency = proposed['currency'];
        if (typeof priceMinor !== 'number' || typeof currency !== 'string')
          throw fieldError('proposed', 'The proposed price is no longer valid');
        if (!(await tx.currency.count({ where: { code: currency, active: true } })))
          throw fieldError('proposed', `${currency} is no longer an active currency`, HttpStatus.CONFLICT);
        await tx.package.update({
          where: { id: pack.id },
          data: { priceMinor: BigInt(priceMinor), currency },
        });
        after = { priceMinor, currency };
        if (pack.published && hospital.status === 'published')
          tags.push(...packageTags(hospital.slug));
      }

      await tx.partnerChangeRequest.update({
        where: { id },
        data: { status: 'approved', decidedAt: new Date(), decidedById: actor.userId },
      });
      await this.audit.record(tx, context, {
        action: `partner.${request.kind}_approved`,
        entityType: request.kind === 'package_price' ? 'Package' : 'Hospital',
        entityId: request.kind === 'package_price' ? (request.packageId as string) : hospital.id,
        before,
        after,
      });
      await this.outbox.publish(tx, {
        type: 'partner.request_decided',
        aggregateType: 'PartnerChangeRequest',
        aggregateId: id,
        payload: { requestId: id, decision: 'approved', kind: request.kind, hospitalId: hospital.id },
      });
      if (tags.length > 0)
        await queueRevalidation(this.outbox, tx, { type: 'PartnerChangeRequest', id }, tags);
    });
    return this.get(id);
  }

  async reject(
    actor: Actor,
    id: string,
    input: RejectRequest,
    context: RequestContext,
  ): Promise<ChangeRequestDetail> {
    await this.prisma.$transaction(async (tx) => {
      const request = await this.lockPending(tx, id);
      if (request.kind === 'hospital_onboarding')
        await tx.hospital.updateMany({
          where: { id: request.hospitalId, status: 'pending_review' },
          data: { status: 'draft' },
        });
      await tx.partnerChangeRequest.update({
        where: { id },
        data: {
          status: 'rejected',
          decisionReason: input.reason,
          decidedAt: new Date(),
          decidedById: actor.userId,
        },
      });
      await this.audit.record(tx, context, {
        action: `partner.${request.kind}_rejected`,
        entityType: 'PartnerChangeRequest',
        entityId: id,
        before: { status: 'pending' },
        after: { status: 'rejected', reason: input.reason },
      });
      await this.outbox.publish(tx, {
        type: 'partner.request_decided',
        aggregateType: 'PartnerChangeRequest',
        aggregateId: id,
        payload: { requestId: id, decision: 'rejected', kind: request.kind, hospitalId: request.hospitalId },
      });
    });
    return this.get(id);
  }

  /** Takes the request's lock and returns it, or refuses when it is not (any longer) waiting for a decision. */
  private async lockPending(tx: Db, id: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner-request:${id}`}))`;
    const request = await tx.partnerChangeRequest.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, kind: true, status: true, hospitalId: true, packageId: true, proposed: true },
    });
    if (!request) throw new NotFoundException('That request does not exist');
    if (request.status !== 'pending')
      throw new ConflictException('This request has already been decided or withdrawn');
    return request;
  }
}
