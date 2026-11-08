import { HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@medtravel/db';
import type {
  CreateFxOverride,
  FxOverrideView,
  FxSettings,
  UpdateFxSettings,
} from '@medtravel/contracts';
import { fromScaled, toScaled } from '@medtravel/fx';
import type { Actor } from '../../auth/actor.js';
import { AuditService } from '../../audit/audit.service.js';
import type { RequestContext } from '../../common/request-context.js';
import { PRISMA } from '../../database/database.module.js';
import { OutboxService } from '../../outbox/outbox.service.js';

const fieldError = (path: string, message: string) =>
  new HttpException(
    {
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      message,
      errors: [{ path: [path], message }],
    },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );

const OVERRIDE_SELECT = {
  id: true,
  baseCurrency: true,
  quoteCurrency: true,
  rate: true,
  reason: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
  createdBy: { select: { name: true } },
} satisfies Prisma.FxOverrideSelect;
type OverrideRow = Prisma.FxOverrideGetPayload<{ select: typeof OVERRIDE_SELECT }>;

/** Exchange-rate settings and manual rates, with every change audited. */
@Injectable()
export class FxAdminService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async settings(): Promise<FxSettings> {
    const row = await this.prisma.fxSetting.findUnique({
      where: { id: 'default' },
      select: { provider: true, markupBp: true, updatedAt: true, updatedBy: { select: { name: true } } },
    });
    return {
      provider: row?.provider ?? null,
      markupBp: row?.markupBp ?? 0,
      updatedAt: row?.updatedAt.toISOString() ?? null,
      updatedByName: row?.updatedBy?.name ?? null,
    };
  }

  async updateSettings(
    actor: Actor,
    input: UpdateFxSettings,
    context: RequestContext,
  ): Promise<FxSettings> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.fxSetting.findUnique({
        where: { id: 'default' },
        select: { provider: true, markupBp: true },
      });
      await tx.fxSetting.upsert({
        where: { id: 'default' },
        create: { id: 'default', provider: input.provider, markupBp: input.markupBp, updatedById: actor.userId },
        update: { provider: input.provider, markupBp: input.markupBp, updatedById: actor.userId },
      });
      await this.audit.record(tx, context, {
        action: 'pricing.fx_settings_updated',
        entityType: 'FxSetting',
        entityId: 'default',
        before: before ?? { provider: null, markupBp: 0 },
        after: { provider: input.provider, markupBp: input.markupBp },
      });
    });
    return this.settings();
  }

  private view(row: OverrideRow, now: Date): FxOverrideView {
    const live =
      !row.revokedAt && (!row.expiresAt || row.expiresAt > now);
    return {
      id: row.id,
      base: row.baseCurrency,
      quote: row.quoteCurrency,
      rate: row.rate.toFixed(8),
      reason: row.reason,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      active: live,
      createdAt: row.createdAt.toISOString(),
      createdByName: row.createdBy?.name ?? null,
    };
  }

  async listOverrides(): Promise<FxOverrideView[]> {
    const rows = await this.prisma.fxOverride.findMany({
      select: OVERRIDE_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const now = new Date();
    return rows.map((row) => this.view(row, now));
  }

  async createOverride(
    actor: Actor,
    input: CreateFxOverride,
    context: RequestContext,
  ): Promise<FxOverrideView> {
    const rate = fromScaled(toScaled(input.rate));
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date())
      throw fieldError('expiresAt', 'The expiry must be in the future');
    const row = await this.prisma.$transaction(async (tx) => {
      // One writer at a time per pair, so two admins cannot both leave a rate in force.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fxo:${input.base}${input.quote}`}))`;
      const known = await tx.currency.count({
        where: { code: { in: [input.base, input.quote] }, active: true },
      });
      if (known !== 2) throw fieldError('base', 'Both currencies must be active currencies');
      // A new rate for a pair replaces the one in force, so there is only ever one answer.
      await tx.fxOverride.updateMany({
        where: { baseCurrency: input.base, quoteCurrency: input.quote, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const created = await tx.fxOverride.create({
        data: {
          baseCurrency: input.base,
          quoteCurrency: input.quote,
          rate,
          reason: input.reason,
          expiresAt,
          createdById: actor.userId,
        },
        select: OVERRIDE_SELECT,
      });
      await this.audit.record(tx, context, {
        action: 'pricing.fx_override_set',
        entityType: 'FxOverride',
        entityId: created.id,
        after: { pair: `${input.base}/${input.quote}`, rate, reason: input.reason, expiresAt: expiresAt?.toISOString() ?? null },
      });
      await this.outbox.publish(tx, {
        type: 'pricing.fx_override_set',
        aggregateType: 'FxOverride',
        aggregateId: created.id,
        payload: { base: input.base, quote: input.quote },
      });
      return created;
    });
    return this.view(row, new Date());
  }

  async revokeOverride(id: string, context: RequestContext): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.fxOverride.findUnique({ where: { id }, select: OVERRIDE_SELECT });
      if (!row) throw new NotFoundException('That manual rate does not exist');
      if (row.revokedAt) return;
      await tx.fxOverride.update({ where: { id }, data: { revokedAt: new Date() } });
      await this.audit.record(tx, context, {
        action: 'pricing.fx_override_removed',
        entityType: 'FxOverride',
        entityId: id,
        before: { pair: `${row.baseCurrency}/${row.quoteCurrency}`, rate: row.rate.toFixed(8) },
      });
    });
  }
}
