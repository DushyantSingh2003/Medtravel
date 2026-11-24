import {
  BadRequestException,
  HttpException,
  HttpStatus,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, PrismaClient } from '@medtravel/db';
import {
  isCaseStaff,
  type CaseSource,
  roomOf,
  type CaseListQuery,
  type CaseView,
  type CreateCase,
  type CursorPage,
  type StageHistoryItem,
} from '@medtravel/contracts';
import { enqueueRealtime } from '@medtravel/realtime';
import type { Actor } from '../../auth/actor.js';
import { AuditService } from '../../audit/audit.service.js';
import { readPage } from '../../common/cursor.js';
import type { RequestContext } from '../../common/request-context.js';
import { PRISMA, type Db } from '../../database/database.module.js';
import { OutboxService } from '../../outbox/outbox.service.js';
import { ScopeService } from '../../rbac/scope.service.js';
import { CASE_SELECT, toCaseView, type CaseRow } from './case-view.js';
import { CaseStageService } from './case-stage.service.js';
import { StageConfigService } from './stage-config.service.js';

/** What opening a case needs; the optional parts are left out of the record when null. */
export interface OpenEnquiry {
  patientId: string;
  source: CaseSource;
  urgency?: CreateCase['urgency'] | undefined;
  ownerId: string | null;
  agentId: string | null;
  /** Who is acting, or null for a public submission nobody is signed in for. */
  actorUserId: string | null;
  treatmentId?: string | null;
  countryCode?: string | null;
  preferredCityId?: string | null;
  preferredLanguage?: string | null;
  campaign?: string | null;
  budget?: CreateCase['budget'] | null;
  note?: string | null;
}

/** First answer to a new enquiry is due this soon (PRD section 3). */
const FIRST_RESPONSE_MINUTES = 15;

const SORT_COLUMN = {
  createdAt: 'createdAt',
  stageEnteredAt: 'stageEnteredAt',
  slaDueAt: 'slaDueAt',
  caseNo: 'caseNo',
} as const;

/** Creating, reading and listing cases. Changing the stage is `CaseStageService`'s job alone. */
@Injectable()
export class CasesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly scope: ScopeService,
    private readonly stages: CaseStageService,
    private readonly config: StageConfigService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /** Next number for the year, CASE-YYYY-NNNNNN, gap-free because it is taken inside the creating transaction. */
  private async nextCaseNo(db: Db, now: Date): Promise<string> {
    const year = String(now.getUTCFullYear());
    const rows = await db.$queryRaw<{ value: number }[]>`
      INSERT INTO "NumberSequence" ("key", "period", "value") VALUES ('case', ${year}, 1)
      ON CONFLICT ("key", "period") DO UPDATE SET "value" = "NumberSequence"."value" + 1
      RETURNING "value"`;
    const value = rows[0]?.value;
    if (value === undefined) throw new Error('Could not allocate a case number');
    return `CASE-${year}-${String(value).padStart(6, '0')}`;
  }

  /** Patients and agencies cannot choose where their case "came from"; staff may. */
  private sourceFor(actor: Actor, input: CreateCase): CaseSource {
    if (actor.role === 'patient') return 'website';
    if (actor.role === 'agent') return 'agent';
    return input.source ?? 'other';
  }

  /** A treatment or city that does not exist is the form's mistake, shown on its field, not a server error. */
  private async assertReferences(db: Db, input: CreateCase): Promise<void> {
    const bad = (field: string) =>
      new HttpException(
        {
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          message: 'Choose one of the listed options',
          errors: [{ path: [field], message: 'Choose one of the listed options' }],
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    if (input.treatmentId) {
      const found = await db.treatment.findFirst({
        where: { id: input.treatmentId, deletedAt: null },
        select: { id: true },
      });
      if (!found) throw bad('treatmentId');
    }
    if (input.preferredCityId) {
      const found = await db.city.findFirst({
        where: { id: input.preferredCityId, deletedAt: null },
        select: { id: true },
      });
      if (!found) throw bad('preferredCityId');
    }
    if (input.countryCode) {
      const found = await db.country.findFirst({
        where: { code: input.countryCode },
        select: { code: true },
      });
      if (!found) throw bad('countryCode');
    }
  }

  private async patientFor(db: Db, actor: Actor, input: CreateCase): Promise<string> {
    if (actor.role === 'patient') {
      if (input.patientId || input.patient)
        throw new ForbiddenException('You can only open a case for yourself');
      const own = await db.patient.findFirst({
        where: { userId: actor.userId, deletedAt: null },
        select: { id: true },
      });
      if (own) return own.id;
      const user = await db.user.findUnique({
        where: { id: actor.userId },
        select: { name: true, email: true },
      });
      if (!user) throw new NotFoundException('User not found');
      // An upsert, so two first requests at once end up with one record.
      return (
        await db.patient.upsert({
          where: { userId: actor.userId },
          update: {},
          create: { fullName: user.name, email: user.email, userId: actor.userId },
          select: { id: true },
        })
      ).id;
    }
    if (input.patientId) {
      const visible = await db.patient.findFirst({
        where: { AND: [{ id: input.patientId }, await this.scope.patientWhere(actor)] },
        select: { id: true },
      });
      if (!visible) throw new NotFoundException('Patient not found');
      return visible.id;
    }
    if (!input.patient)
      throw new BadRequestException({
        message: 'Say who the case is for',
        errors: [{ path: ['patient'], message: 'Choose a patient or give their details' }],
      });
    const { fullName, email, phone, nationalityCode, preferredLanguage } = input.patient;
    return (
      await db.patient.create({
        data: {
          fullName,
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
          ...(nationalityCode ? { nationalityCode } : {}),
          ...(preferredLanguage ? { preferredLanguage } : {}),
        },
        select: { id: true },
      })
    ).id;
  }

  /**
   * Opens a case in stage `enquiry` for a patient: the number, first-response and SLA due times, stage history, automatic tasks, audit,
   * outbox event and realtime push. Every way a case begins (staff, a patient, an agency, a lead) comes through here, inside the
   * caller's transaction.
   */
  async openEnquiry(
    tx: Db,
    input: OpenEnquiry,
    context: RequestContext,
  ): Promise<{ id: string; caseNo: string }> {
    const now = new Date();
    const enquiry = await this.config.get(tx, 'enquiry');
    const caseNo = await this.nextCaseNo(tx, now);
    const created = await tx.case.create({
      data: {
        caseNo,
        patientId: input.patientId,
        urgency: input.urgency ?? 'routine',
        source: input.source,
        ...(input.treatmentId ? { treatmentId: input.treatmentId } : {}),
        ...(input.countryCode ? { countryCode: input.countryCode } : {}),
        ...(input.preferredCityId ? { preferredCityId: input.preferredCityId } : {}),
        ...(input.preferredLanguage ? { preferredLanguage: input.preferredLanguage } : {}),
        ...(input.campaign ? { campaign: input.campaign } : {}),
        ...(input.budget
          ? {
              budgetMinor: BigInt(input.budget.amountMinor),
              budgetCurrency: input.budget.currency,
            }
          : {}),
        ...(input.ownerId ? { ownerId: input.ownerId } : {}),
        ...(input.agentId ? { agentId: input.agentId } : {}),
        stageEnteredAt: now,
        firstResponseDueAt: new Date(now.getTime() + FIRST_RESPONSE_MINUTES * 60_000),
        slaDueAt: enquiry.targetMinutes
          ? new Date(now.getTime() + enquiry.targetMinutes * 60_000)
          : null,
      },
      select: { id: true, ownerId: true },
    });
    await tx.caseStageHistory.create({
      data: { caseId: created.id, fromStage: null, toStage: 'enquiry', actorId: input.actorUserId },
    });
    if (input.note && input.actorUserId)
      await tx.caseNote.create({
        data: { caseId: created.id, body: input.note, authorId: input.actorUserId },
      });
    await this.stages.createAutoTasks(
      tx,
      created.id,
      'enquiry',
      created.ownerId,
      input.actorUserId,
      now,
    );
    await this.audit.record(tx, context, {
      action: 'case.created',
      entityType: 'Case',
      entityId: created.id,
      patientId: input.patientId,
      after: { caseNo, stage: 'enquiry', status: 'new', source: input.source },
    });
    await this.outbox.publish(tx, {
      type: 'case.created',
      aggregateType: 'Case',
      aggregateId: created.id,
      payload: { caseId: created.id, caseNo, patientId: input.patientId },
    });
    await enqueueRealtime(tx, {
      room: roomOf.case(created.id),
      event: 'case.updated',
      payload: { caseId: created.id, fields: ['stage'] },
    });
    return { id: created.id, caseNo };
  }

  async create(actor: Actor, input: CreateCase, context: RequestContext): Promise<CaseView> {
    const id = await this.prisma.$transaction(async (tx) => {
      await this.assertReferences(tx, input);
      const patientId = await this.patientFor(tx, actor, input);
      const agent =
        actor.role === 'agent'
          ? await tx.agentUser.findFirst({
              where: { userId: actor.userId, deletedAt: null },
              select: { agentId: true },
            })
          : null;
      if (actor.role === 'agent' && !agent)
        throw new ForbiddenException('No agency is linked to your account');
      const created = await this.openEnquiry(
        tx,
        {
          patientId,
          source: this.sourceFor(actor, input),
          urgency: input.urgency,
          ownerId: actor.role === 'case_manager' ? actor.userId : null,
          agentId: agent?.agentId ?? null,
          actorUserId: actor.userId,
          treatmentId: input.treatmentId ?? null,
          countryCode: input.countryCode ?? null,
          preferredCityId: input.preferredCityId ?? null,
          preferredLanguage: input.preferredLanguage ?? null,
          budget: input.budget ?? null,
          note: input.note ?? null,
        },
        context,
      );
      return created.id;
    });
    return this.stages.view(actor, id);
  }

  async get(actor: Actor, id: string): Promise<CaseView> {
    await this.scope.assertCaseAccess(actor, id);
    return this.stages.view(actor, id);
  }

  async list(actor: Actor, query: CaseListQuery): Promise<CursorPage<CaseView>> {
    const now = new Date();
    // Filters and sorts on internal fields would let a caller learn what the response hides.
    if (
      !isCaseStaff(actor.role) &&
      (query.ownerId || query.source || query.overdue || query.sort === 'slaDueAt')
    )
      throw new BadRequestException({
        message: 'This filter is not available to you',
        errors: [{ path: ['filter'], message: 'This filter is not available to you' }],
      });
    const filters: Prisma.CaseWhereInput[] = [await this.scope.caseWhere(actor)];
    if (query.stage) filters.push({ stage: query.stage });
    if (query.status) filters.push({ status: query.status });
    if (query.urgency) filters.push({ urgency: query.urgency });
    if (query.source) filters.push({ source: query.source });
    if (query.ownerId) filters.push({ ownerId: query.ownerId });
    if (query.q) filters.push({ caseNo: { contains: query.q.toUpperCase() } });
    if (query.overdue)
      filters.push({
        slaDueAt: { lt: now },
        closedAt: null,
        stage: { notIn: ['on_hold', 'lost', 'cancelled'] },
      });
    const where: Prisma.CaseWhereInput = { AND: filters };
    const column = SORT_COLUMN[query.sort];
    const { rows, nextCursor, total } = await readPage<CaseRow>({
      limit: query.limit,
      cursor: query.cursor,
      keyOf: (row) => row.id,
      find: ({ take, skip, cursorKey }) =>
        this.prisma.case.findMany({
          where,
          select: CASE_SELECT,
          orderBy: [{ [column]: query.dir }, { id: query.dir }],
          take,
          ...(cursorKey ? { cursor: { id: cursorKey }, skip: skip ?? 1 } : {}),
        }),
      count: () => this.prisma.case.count({ where }),
    });
    return { items: rows.map((row) => toCaseView(row, actor.role)), nextCursor, total };
  }

  async history(
    actor: Actor,
    caseId: string,
    query: { limit: number; cursor?: string | undefined },
  ): Promise<CursorPage<StageHistoryItem>> {
    await this.scope.assertCaseAccess(actor, caseId);
    const { rows, nextCursor, total } = await readPage<Prisma.CaseStageHistoryGetPayload<object>>({
      limit: query.limit,
      cursor: query.cursor,
      keyOf: (row) => row.id,
      find: ({ take, skip, cursorKey }) =>
        this.prisma.caseStageHistory.findMany({
          where: { caseId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take,
          ...(cursorKey ? { cursor: { id: cursorKey }, skip: skip ?? 1 } : {}),
        }),
      count: () => this.prisma.caseStageHistory.count({ where: { caseId } }),
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        fromStage: row.fromStage,
        toStage: row.toStage,
        // Reasons written by staff are for staff.
        note: isCaseStaff(actor.role) ? row.note : null,
        actorId: isCaseStaff(actor.role) ? row.actorId : null,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor,
      total,
    };
  }
}
