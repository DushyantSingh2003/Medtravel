import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaClient } from '@medtravel/db';
import {
  CASE_STAGES,
  canMoveCase,
  canOverrideRequirement,
  describeTransition,
  missingRequirements,
  roomOf,
  type CaseStage,
  type CaseState,
  type CaseView,
  type TransitionRequest,
  type TransitionRequirement,
} from '@medtravel/contracts';
import { enqueueRealtime } from '@medtravel/realtime';
import type { Actor } from '../../auth/actor.js';
import { AuditService } from '../../audit/audit.service.js';
import type { RequestContext } from '../../common/request-context.js';
import { PRISMA, type Db } from '../../database/database.module.js';
import { OutboxService } from '../../outbox/outbox.service.js';
import { ScopeService } from '../../rbac/scope.service.js';
import { CASE_SELECT, nextTargetsOf, toCaseView } from './case-view.js';
import { StageConfigService } from './stage-config.service.js';

const FIELD_OF: Record<TransitionRequirement, string> = {
  note: 'note',
  lost_reason: 'lostReasonId',
  owner_assigned: 'to',
  medical_summary: 'to',
  sent_quote: 'to',
  accepted_quote: 'to',
  deposit_paid: 'to',
};

const MESSAGE_OF: Record<TransitionRequirement, string> = {
  note: 'Write a short reason for this move',
  lost_reason: 'Choose why the case was lost',
  owner_assigned: 'Assign a case manager first',
  medical_summary: 'Write the medical summary first',
  sent_quote: 'Send the patient a quote first',
  accepted_quote: 'The patient has not accepted a quote yet',
  deposit_paid:
    'The deposit has not been received. A case manager or finance can override this with a reason',
};

const isStage = (value: string): value is CaseStage =>
  (CASE_STAGES as readonly string[]).includes(value);

/**
 * The one place a case changes stage. Everything a move needs happens in one transaction: the check against the state
 * machine, the new stage and status, the stage timer, the history row, the automatic tasks, the audit row, and the events
 * the worker turns into messages and live updates.
 */
@Injectable()
export class CaseStageService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly scope: ScopeService,
    private readonly config: StageConfigService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /** The stage a case left when it went on hold or was lost: the newest history row that came out of one of the twelve. */
  async resumeStageOf(db: Db, caseId: string): Promise<CaseStage | null> {
    const row = await db.caseStageHistory.findFirst({
      where: { caseId, fromStage: { in: [...CASE_STAGES] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { fromStage: true },
    });
    return row?.fromStage && isStage(row.fromStage) ? row.fromStage : null;
  }

  async transition(
    actor: Actor,
    caseId: string,
    request: TransitionRequest,
    context: RequestContext,
  ): Promise<CaseView> {
    await this.scope.assertCaseAccess(actor, caseId);
    const id = await this.prisma.$transaction(async (tx) => {
      // One move at a time per case: a second request waits here and then sees the new stage.
      await tx.$queryRaw`SELECT id FROM "Case" WHERE id = ${caseId}::uuid FOR UPDATE`;
      const current = await tx.case.findUnique({
        where: { id: caseId },
        select: {
          id: true,
          stage: true,
          status: true,
          ownerId: true,
          patientId: true,
          deletedAt: true,
        },
      });
      if (!current || current.deletedAt) throw new NotFoundException('Case not found');
      const from: CaseState = { stage: current.stage, status: current.status };

      const ownerRole = isStage(current.stage)
        ? (await this.config.get(tx, current.stage)).ownerRole
        : undefined;
      if (!canMoveCase(actor.role, from, request.to, ownerRole))
        throw new ForbiddenException('You cannot move this case');
      const resume = await this.resumeStageOf(tx, caseId);
      const plan = describeTransition(from, request.to, resume);
      if (!plan.allowed) throw new ConflictException(plan.reason);
      if (request.override && !canOverrideRequirement(actor.role))
        throw new ForbiddenException('You cannot override this requirement');

      const missing = missingRequirements(
        plan,
        await this.factsFor(tx, caseId, current.ownerId, plan.requires),
        request,
      );
      if (missing.length > 0) throw this.unmet(missing);
      if (request.lostReasonId) await this.assertLostReason(tx, request.lostReasonId);

      const now = new Date();
      const entersStage = isStage(plan.to.stage) && plan.kind !== 'close';
      const target = entersStage
        ? (await this.config.get(tx, plan.to.stage as CaseStage)).targetMinutes
        : null;
      const finished =
        plan.kind === 'close' || plan.to.stage === 'lost' || plan.to.stage === 'cancelled';
      await tx.case.update({
        where: { id: caseId },
        data: {
          stage: plan.to.stage,
          status: plan.to.status,
          ...(plan.kind === 'close' ? {} : { stageEnteredAt: now }),
          slaDueAt: target ? new Date(now.getTime() + target * 60_000) : null,
          slaBreachedAt: null,
          closedAt: finished ? now : null,
          lostReasonId: plan.to.stage === 'lost' ? (request.lostReasonId ?? null) : null,
          lostNote: plan.to.stage === 'lost' ? (request.note ?? null) : null,
        },
      });
      await tx.caseStageHistory.create({
        data: {
          caseId,
          fromStage: current.stage,
          toStage: plan.to.stage,
          note: request.note ?? null,
          actorId: actor.userId,
          createdAt: now,
        },
      });
      if (entersStage && plan.kind !== 'back')
        await this.createAutoTasks(
          tx,
          caseId,
          plan.to.stage as CaseStage,
          current.ownerId,
          actor.userId,
          now,
        );

      await this.audit.record(tx, context, {
        action: 'case.stage_changed',
        entityType: 'Case',
        entityId: caseId,
        patientId: current.patientId,
        before: { stage: current.stage, status: current.status },
        after: {
          stage: plan.to.stage,
          status: plan.to.status,
          ...(request.override ? { overridden: true } : {}),
        },
      });
      await this.outbox.publish(tx, {
        type: 'case.stage_changed',
        aggregateType: 'Case',
        aggregateId: caseId,
        payload: {
          caseId,
          from: current.stage,
          to: plan.to.stage,
          status: plan.to.status,
          actorId: actor.userId,
        },
      });
      await enqueueRealtime(tx, {
        room: roomOf.case(caseId),
        event: 'case.updated',
        payload: { caseId, fields: ['stage', 'status'] },
      });
      return caseId;
    });
    return this.view(actor, id);
  }

  /** The case with the moves the actor could make next. */
  async view(actor: Actor, caseId: string): Promise<CaseView> {
    const row = await this.prisma.case.findUnique({ where: { id: caseId }, select: CASE_SELECT });
    if (!row) throw new NotFoundException('Case not found');
    const resume = await this.resumeStageOf(this.prisma, caseId);
    const ownerRole = isStage(row.stage)
      ? (await this.config.get(this.prisma, row.stage)).ownerRole
      : undefined;
    return toCaseView(
      row,
      actor.role,
      nextTargetsOf(actor.role, { stage: row.stage, status: row.status }, resume, ownerRole),
    );
  }

  private async factsFor(
    db: Db,
    caseId: string,
    ownerId: string | null,
    needs: TransitionRequirement[],
  ) {
    const has = (requirement: TransitionRequirement) => needs.includes(requirement);
    const [summary, sent, accepted, deposit] = await Promise.all([
      has('medical_summary') ? db.medicalSummary.count({ where: { caseId, current: true } }) : 0,
      has('sent_quote')
        ? db.quote.count({ where: { caseId, status: { in: ['sent', 'viewed', 'accepted'] } } })
        : 0,
      has('accepted_quote') ? db.quote.count({ where: { caseId, status: 'accepted' } }) : 0,
      has('deposit_paid')
        ? db.payment.count({ where: { caseId, type: 'deposit', status: 'succeeded' } })
        : 0,
    ]);
    return {
      ownerAssigned: ownerId !== null,
      hasMedicalSummary: summary > 0,
      hasSentQuote: sent > 0,
      hasAcceptedQuote: accepted > 0,
      depositPaid: deposit > 0,
    };
  }

  private async assertLostReason(db: Db, id: string): Promise<void> {
    const found = await db.lostReason.findFirst({
      where: { id, active: true, deletedAt: null },
      select: { id: true },
    });
    if (!found)
      throw new HttpException(
        {
          statusCode: 422,
          message: 'Unknown reason',
          errors: [{ path: ['lostReasonId'], message: 'Choose one of the listed reasons' }],
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
  }

  private unmet(missing: TransitionRequirement[]): HttpException {
    return new HttpException(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        message: MESSAGE_OF[missing[0] as TransitionRequirement],
        errors: missing.map((requirement) => ({
          path: [FIELD_OF[requirement]],
          message: MESSAGE_OF[requirement],
        })),
        requirements: missing,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  /** Creates the tasks configured for a stage; entering the stage again does not create them twice. */
  async createAutoTasks(
    db: Db,
    caseId: string,
    stage: CaseStage,
    ownerId: string | null,
    createdById: string | null,
    now: Date,
  ): Promise<void> {
    const { autoTasks } = await this.config.get(db, stage);
    if (autoTasks.length === 0) return;
    await db.task.createMany({
      skipDuplicates: true,
      data: autoTasks.map((task) => ({
        caseId,
        title: task.title,
        autoKey: `${stage}:${task.key}`,
        assigneeRole: task.assigneeRole,
        assigneeId: task.assigneeRole === 'case_manager' ? ownerId : null,
        dueAt: new Date(now.getTime() + task.dueInMinutes * 60_000),
        priority: task.priority,
        createdById,
      })),
    });
  }
}
