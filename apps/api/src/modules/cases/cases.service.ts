import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, PrismaClient } from '@medtravel/db';
import {
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
      return (
        await db.patient.create({
          data: { fullName: user.name, email: user.email, userId: actor.userId },
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

  async create(actor: Actor, input: CreateCase, context: RequestContext): Promise<CaseView> {
    const now = new Date();
    const id = await this.prisma.$transaction(async (tx) => {
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
      const enquiry = await this.config.get(tx, 'enquiry');
      const caseNo = await this.nextCaseNo(tx, now);
      const created = await tx.case.create({
        data: {
          caseNo,
          patientId,
          urgency: input.urgency,
          source:
            input.source ??
            (actor.role === 'agent' ? 'agent' : actor.role === 'patient' ? 'website' : 'other'),
          ...(input.treatmentId ? { treatmentId: input.treatmentId } : {}),
          ...(input.countryCode ? { countryCode: input.countryCode } : {}),
          ...(input.preferredCityId ? { preferredCityId: input.preferredCityId } : {}),
          ...(input.preferredLanguage ? { preferredLanguage: input.preferredLanguage } : {}),
          ...(input.budget
            ? {
                budgetMinor: BigInt(input.budget.amountMinor),
                budgetCurrency: input.budget.currency,
              }
            : {}),
          ...(actor.role === 'case_manager' ? { ownerId: actor.userId } : {}),
          ...(agent ? { agentId: agent.agentId } : {}),
          stageEnteredAt: now,
          firstResponseDueAt: new Date(now.getTime() + FIRST_RESPONSE_MINUTES * 60_000),
          slaDueAt: enquiry.targetMinutes
            ? new Date(now.getTime() + enquiry.targetMinutes * 60_000)
            : null,
        },
        select: { id: true, ownerId: true },
      });
      await tx.caseStageHistory.create({
        data: { caseId: created.id, fromStage: null, toStage: 'enquiry', actorId: actor.userId },
      });
      if (input.note)
        await tx.caseNote.create({
          data: { caseId: created.id, body: input.note, authorId: actor.userId },
        });
      await this.stages.createAutoTasks(
        tx,
        created.id,
        'enquiry',
        created.ownerId,
        actor.userId,
        now,
      );
      await this.audit.record(tx, context, {
        action: 'case.created',
        entityType: 'Case',
        entityId: created.id,
        patientId,
        after: { caseNo, stage: 'enquiry', status: 'new', source: input.source ?? null },
      });
      await this.outbox.publish(tx, {
        type: 'case.created',
        aggregateType: 'Case',
        aggregateId: created.id,
        payload: { caseId: created.id, caseNo, patientId },
      });
      await enqueueRealtime(tx, {
        room: roomOf.case(created.id),
        event: 'case.updated',
        payload: { caseId: created.id, fields: ['stage'] },
      });
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
        note: row.note,
        actorId: row.actorId,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor,
      total,
    };
  }
}
