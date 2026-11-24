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
  MATCH_FIELDS,
  phoneDigits,
  type CursorPage,
  type LeadDetail,
  type LeadListQuery,
  type LeadRow,
  type MatchField,
} from '@medtravel/contracts';
import type { Actor } from '../../auth/actor.js';
import { AuditService } from '../../audit/audit.service.js';
import { readPage } from '../../common/cursor.js';
import type { RequestContext } from '../../common/request-context.js';
import { PRISMA } from '../../database/database.module.js';
import { ScopeService } from '../../rbac/scope.service.js';
import { PatientMergeService } from './patient-merge.service.js';

const ROW_SELECT = {
  id: true,
  source: true,
  submittedName: true,
  submittedPhone: true,
  submittedEmail: true,
  utmCampaign: true,
  duplicateState: true,
  matchedOn: true,
  createdAt: true,
  case: { select: { id: true, caseNo: true, stage: true, countryCode: true, ownerId: true } },
} satisfies Prisma.LeadSelect;
type RowData = Prisma.LeadGetPayload<{ select: typeof ROW_SELECT }>;

const fields = (values: string[]): MatchField[] =>
  values.filter((v): v is MatchField => (MATCH_FIELDS as readonly string[]).includes(v));

const rowOf = (l: RowData): LeadRow => ({
  id: l.id,
  caseId: l.case.id,
  caseNo: l.case.caseNo,
  stage: l.case.stage,
  source: l.source,
  name: l.submittedName,
  phone: l.submittedPhone,
  email: l.submittedEmail,
  countryCode: l.case.countryCode,
  utmCampaign: l.utmCampaign,
  assigned: l.case.ownerId !== null,
  duplicateState: l.duplicateState,
  matchedOn: fields(l.matchedOn),
  createdAt: l.createdAt.toISOString(),
});

const bad = (path: string, message: string, status = HttpStatus.CONFLICT) =>
  new HttpException({ statusCode: status, message, errors: [{ path: [path], message }] }, status);

/** Who works the lead inbox. Patients and agencies may create cases, but a lead holds other people's contact details and messages. */
const LEAD_ROLES: readonly string[] = ['case_manager', 'super_admin'];

export function assertLeadStaff(actor: Actor): void {
  if (!LEAD_ROLES.includes(actor.role)) throw new ForbiddenException('The lead inbox is for coordinators');
}

/** The lead inbox for staff: list, read, claim, and settle a possible duplicate. */
@Injectable()
export class LeadsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly merges: PatientMergeService,
  ) {}

  /** A coordinator sees the leads on their cases and those still waiting for someone to take them. */
  private async visible(actor: Actor): Promise<Prisma.LeadWhereInput> {
    assertLeadStaff(actor);
    return {
      deletedAt: null,
      OR: [{ case: await this.scope.caseWhere(actor) }, { case: { ownerId: null, deletedAt: null } }],
    };
  }

  async list(actor: Actor, query: LeadListQuery): Promise<CursorPage<LeadRow>> {
    const filters: Prisma.LeadWhereInput[] = [await this.visible(actor)];
    if (query.source) filters.push({ source: query.source });
    if (query.duplicate) filters.push({ duplicateState: query.duplicate });
    if (query.q) {
      const digits = phoneDigits(query.q);
      filters.push({
        OR: [
          { submittedName: { contains: query.q, mode: 'insensitive' } },
          { submittedEmail: { contains: query.q.toLowerCase() } },
          { case: { caseNo: { contains: query.q.toUpperCase() } } },
          ...(digits.length >= 4 ? [{ submittedPhone: { contains: digits } }] : []),
        ],
      });
    }
    const where: Prisma.LeadWhereInput = { AND: filters };
    const { rows, nextCursor, total } = await readPage<RowData>({
      limit: query.limit,
      cursor: query.cursor,
      keyOf: (r) => r.id,
      find: ({ take, skip, cursorKey }) =>
        this.prisma.lead.findMany({
          where,
          select: ROW_SELECT,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take,
          ...(cursorKey ? { cursor: { id: cursorKey }, skip: skip ?? 1 } : {}),
        }),
      count: () => this.prisma.lead.count({ where }),
    });
    return { items: rows.map(rowOf), nextCursor, total };
  }

  async get(actor: Actor, id: string): Promise<LeadDetail> {
    const where: Prisma.LeadWhereInput = { AND: [{ id }, await this.visible(actor)] };
    const lead = await this.prisma.lead.findFirst({
      where,
      select: {
        ...ROW_SELECT,
        message: true,
        referrer: true,
        agentCode: true,
        utmSource: true,
        utmMedium: true,
        language: true,
        patientId: true,
        duplicateOfPatientId: true,
      },
    });
    if (!lead) throw new NotFoundException('That lead does not exist');
    const others = await this.prisma.lead.findMany({
      where: { AND: [{ patientId: lead.patientId, id: { not: id } }, await this.visible(actor)] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
      select: { id: true, source: true, createdAt: true, case: { select: { id: true, caseNo: true } } },
    });
    // The other record's name only goes to someone who may see that patient.
    const other = lead.duplicateOfPatientId
      ? await this.prisma.patient.findFirst({
          where: {
            AND: [{ id: lead.duplicateOfPatientId, deletedAt: null }, await this.scope.patientWhere(actor)],
          },
          select: { id: true, fullName: true, _count: { select: { cases: { where: { deletedAt: null } } } } },
        })
      : null;
    return {
      ...rowOf(lead),
      message: lead.message,
      referrer: lead.referrer,
      agentCode: lead.agentCode,
      utmSource: lead.utmSource,
      utmMedium: lead.utmMedium,
      language: lead.language,
      patientId: lead.patientId,
      duplicateOf: other
        ? { patientId: other.id, name: other.fullName, enquiries: other._count.cases }
        : null,
      otherEnquiries: others.map((o) => ({
        leadId: o.id,
        caseId: o.case.id,
        caseNo: o.case.caseNo,
        source: o.source,
        createdAt: o.createdAt.toISOString(),
      })),
    };
  }

  async dismissDuplicate(actor: Actor, id: string, context: RequestContext): Promise<LeadDetail> {
    await this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { AND: [{ id }, await this.visible(actor)] },
        select: { id: true, duplicateState: true, patientId: true },
      });
      if (!lead) throw new NotFoundException('That lead does not exist');
      if (lead.duplicateState !== 'possible')
        throw bad('duplicate', 'This lead is not flagged as a possible duplicate');
      await tx.lead.update({ where: { id }, data: { duplicateState: 'dismissed' } });
      await this.audit.record(tx, context, {
        action: 'lead.duplicate_dismissed',
        entityType: 'Lead',
        entityId: id,
        patientId: lead.patientId,
        before: { duplicateState: 'possible' },
        after: { duplicateState: 'dismissed' },
      });
    });
    return this.get(actor, id);
  }

  /**
   * Puts the two patient records behind this lead together. `keep: 'other'` keeps the established patient the lead matched;
   * `keep: 'this'` keeps the lead's own patient.
   */
  async mergePatients(
    actor: Actor,
    id: string,
    keep: 'this' | 'other',
    context: RequestContext,
  ): Promise<LeadDetail> {
    await this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { AND: [{ id }, await this.visible(actor)] },
        select: { id: true, duplicateState: true, patientId: true, duplicateOfPatientId: true },
      });
      if (!lead) throw new NotFoundException('That lead does not exist');
      if (lead.duplicateState !== 'possible' || !lead.duplicateOfPatientId)
        throw bad('duplicate', 'There is no second patient record to merge with');
      if (lead.duplicateOfPatientId === lead.patientId)
        throw bad('duplicate', 'This lead is already on that patient record');
      const [sourceId, targetId] =
        keep === 'other'
          ? [lead.patientId, lead.duplicateOfPatientId]
          : [lead.duplicateOfPatientId, lead.patientId];
      // A merge shows one record's history on the other and retires one, so both must be records this person may see.
      const patientWhere = await this.scope.patientWhere(actor);
      const visible = await tx.patient.count({
        where: { AND: [{ id: { in: [sourceId, targetId] } }, patientWhere] },
      });
      if (visible !== 2) throw new NotFoundException('That patient record does not exist');
      await this.merges.merge(tx, sourceId, targetId, context);
    });
    return this.get(actor, id).catch((error: unknown) => {
      if (error instanceof NotFoundException) throw new ConflictException('The merge removed this lead from your view');
      throw error;
    });
  }

  /** Takes an unassigned lead as a case manager's own, so the case opens for them. The first to ask gets it. */
  async claim(actor: Actor, id: string, context: RequestContext): Promise<LeadDetail> {
    if (actor.role !== 'case_manager') throw new ForbiddenException('Only a case manager can take a lead');
    await this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { AND: [{ id }, await this.visible(actor)] },
        select: { id: true, caseId: true, patientId: true },
      });
      if (!lead) throw new NotFoundException('That lead does not exist');
      const taken = await tx.case.updateMany({
        where: { id: lead.caseId, ownerId: null },
        data: { ownerId: actor.userId },
      });
      if (taken.count === 0) throw bad('owner', 'Someone has already taken this lead');
      await this.audit.record(tx, context, {
        action: 'case.assigned',
        entityType: 'Case',
        entityId: lead.caseId,
        patientId: lead.patientId,
        before: { ownerId: null },
        after: { ownerId: actor.userId },
      });
    });
    return this.get(actor, id);
  }
}
