import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@medtravel/db';
import {
  CASE_STAGES,
  DEFAULT_AUTO_TASKS,
  DEFAULT_STAGE_TARGET_MINUTES,
  STAGE_OWNER_ROLE,
  autoTaskSchema,
  type CaseStage,
  type StageConfig,
  type StageConfigUpdate,
} from '@medtravel/contracts';
import { z } from 'zod';
import { AuditService } from '../../audit/audit.service.js';
import type { RequestContext } from '../../common/request-context.js';
import { PRISMA, type Db } from '../../database/database.module.js';

const storedTasks = z.array(autoTaskSchema);

/** What an admin set for each stage, over the defaults in `packages/contracts`. */
@Injectable()
export class StageConfigService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  private merge(
    stage: CaseStage,
    row:
      | { targetMinutes: number | null; ownerRole: StageConfig['ownerRole']; autoTasks: unknown }
      | undefined,
  ): StageConfig {
    if (!row)
      return {
        stage,
        targetMinutes: DEFAULT_STAGE_TARGET_MINUTES[stage],
        ownerRole: STAGE_OWNER_ROLE[stage],
        autoTasks: DEFAULT_AUTO_TASKS[stage],
      };
    const tasks = storedTasks.safeParse(row.autoTasks);
    return {
      stage,
      targetMinutes: row.targetMinutes,
      ownerRole: row.ownerRole,
      autoTasks: tasks.success ? tasks.data : DEFAULT_AUTO_TASKS[stage],
    };
  }

  async list(db: Db = this.prisma): Promise<StageConfig[]> {
    const rows = await db.stageConfig.findMany();
    const byStage = new Map(rows.map((row) => [row.stage, row]));
    return CASE_STAGES.map((stage) => this.merge(stage, byStage.get(stage)));
  }

  async get(db: Db, stage: CaseStage): Promise<StageConfig> {
    return this.merge(stage, (await db.stageConfig.findUnique({ where: { stage } })) ?? undefined);
  }

  async update(
    stage: CaseStage,
    input: StageConfigUpdate,
    context: RequestContext,
  ): Promise<StageConfig> {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.get(tx, stage);
      const data = {
        targetMinutes: input.targetMinutes,
        ownerRole: input.ownerRole,
        autoTasks: input.autoTasks as unknown as Prisma.InputJsonValue,
        updatedById: context.actor?.userId ?? null,
      };
      await tx.stageConfig.upsert({ where: { stage }, create: { stage, ...data }, update: data });
      const after = await this.get(tx, stage);
      await this.audit.record(tx, context, {
        action: 'stage_config.updated',
        entityType: 'StageConfig',
        entityId: stage,
        before: {
          targetMinutes: before.targetMinutes,
          ownerRole: before.ownerRole,
          autoTasks: before.autoTasks,
        },
        after: {
          targetMinutes: after.targetMinutes,
          ownerRole: after.ownerRole,
          autoTasks: after.autoTasks,
        },
      });
      return after;
    });
  }
}
