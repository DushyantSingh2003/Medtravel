import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, PrismaClient } from '@medtravel/db';
import {
  PRICING_BASE_CURRENCY,
  applyMargin,
  money,
  type CreateAddOn,
  type DiscountThresholds,
  type MarginRules,
  type PriceHistory,
  type PriceItem,
  type PriceItemKind,
  type PriceLookup,
  type PriceVersion,
  type PublishPrice,
  type UpdateDiscountThresholds,
  type UpdateMarginRules,
  type UpdatePriceItem,
} from '@medtravel/contracts';
import { RateUnavailableError, convert } from '@medtravel/fx';
import type { Actor } from '../../auth/actor.js';
import { AuditService } from '../../audit/audit.service.js';
import type { RequestContext } from '../../common/request-context.js';
import { PRISMA, type Db } from '../../database/database.module.js';
import { OutboxService } from '../../outbox/outbox.service.js';

const fieldError = (path: string, message: string, status = HttpStatus.UNPROCESSABLE_ENTITY) =>
  new HttpException({ statusCode: status, message, errors: [{ path: [path], message }] }, status);

const VERSION_SELECT = {
  id: true,
  version: true,
  note: true,
  createdAt: true,
  createdBy: { select: { name: true } },
  prices: { select: { currency: true, amountMinor: true }, orderBy: { currency: 'asc' } },
} satisfies Prisma.PriceItemVersionSelect;

const ITEM_SELECT = {
  id: true,
  kind: true,
  code: true,
  name: true,
  unit: true,
  inclusions: true,
  sortOrder: true,
  active: true,
  versions: { select: VERSION_SELECT, orderBy: { version: 'desc' }, take: 1 },
} satisfies Prisma.PriceItemSelect;

type VersionRow = Prisma.PriceItemVersionGetPayload<{ select: typeof VERSION_SELECT }>;
type ItemRow = Prisma.PriceItemGetPayload<{ select: typeof ITEM_SELECT }>;

const versionView = (row: VersionRow): PriceVersion => ({
  id: row.id,
  version: row.version,
  note: row.note,
  createdAt: row.createdAt.toISOString(),
  createdByName: row.createdBy?.name ?? null,
  prices: row.prices.map((p) => ({ currency: p.currency, amountMinor: Number(p.amountMinor) })),
});

const itemView = (row: ItemRow): PriceItem => ({
  id: row.id,
  kind: row.kind,
  code: row.code,
  name: row.name,
  unit: row.unit,
  inclusions: row.inclusions,
  sortOrder: row.sortOrder,
  active: row.active,
  current: row.versions[0] ? versionView(row.versions[0]) : null,
});

const pricesOf = (version: PriceVersion | null): Record<string, number> =>
  Object.fromEntries((version?.prices ?? []).map((p) => [p.currency, p.amountMinor]));

@Injectable()
export class PricingService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  // ---- price list -------------------------------------------------------------------------------------------
  async listItems(kind?: PriceItemKind): Promise<PriceItem[]> {
    const rows = await this.prisma.priceItem.findMany({
      where: kind ? { kind } : {},
      select: ITEM_SELECT,
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(itemView);
  }

  private async load(db: Db, code: string): Promise<ItemRow> {
    const row = await db.priceItem.findUnique({ where: { code }, select: ITEM_SELECT });
    if (!row) throw new NotFoundException('That price list entry does not exist');
    return row;
  }

  async createAddOn(input: CreateAddOn, context: RequestContext): Promise<PriceItem> {
    const created = await this.prisma.$transaction(async (tx) => {
      if (await tx.priceItem.findUnique({ where: { code: input.code }, select: { id: true } }))
        throw fieldError('code', 'An entry with this code already exists', HttpStatus.CONFLICT);
      const last = await tx.priceItem.aggregate({
        where: { kind: 'add_on' },
        _max: { sortOrder: true },
      });
      const row = await tx.priceItem.create({
        data: {
          kind: 'add_on',
          code: input.code,
          name: input.name,
          unit: input.unit,
          inclusions: input.inclusions,
          sortOrder: (last._max.sortOrder ?? 0) + 10,
        },
        select: ITEM_SELECT,
      });
      await this.audit.record(tx, context, {
        action: 'pricing.item_created',
        entityType: 'PriceItem',
        entityId: row.id,
        after: { code: row.code, name: row.name, unit: row.unit },
      });
      return row;
    });
    return itemView(created);
  }

  async updateItem(
    code: string,
    input: UpdatePriceItem,
    context: RequestContext,
  ): Promise<PriceItem> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const before = await this.load(tx, code);
      if (input.unit !== undefined && before.kind === 'service_package')
        throw fieldError('unit', 'A service package has no unit');
      const row = await tx.priceItem.update({
        where: { code },
        data: input,
        select: ITEM_SELECT,
      });
      const shape = (r: ItemRow) => ({
        name: r.name,
        unit: r.unit,
        inclusions: r.inclusions,
        active: r.active,
        sortOrder: r.sortOrder,
      });
      await this.audit.record(tx, context, {
        action: 'pricing.item_updated',
        entityType: 'PriceItem',
        entityId: row.id,
        before: shape(before),
        after: shape(row),
      });
      return row;
    });
    return itemView(updated);
  }

  async history(code: string): Promise<PriceHistory> {
    const item = await this.prisma.priceItem.findUnique({
      where: { code },
      select: { versions: { select: VERSION_SELECT, orderBy: { version: 'desc' } } },
    });
    if (!item) throw new NotFoundException('That price list entry does not exist');
    return { versions: item.versions.map(versionView) };
  }

  /**
   * Publishes the next version of an item's prices. Old versions are never touched: a quote copies the price it was made
   * with onto its lines, so a new version only affects quotes made after it.
   */
  async publish(
    actor: Actor,
    code: string,
    input: PublishPrice,
    context: RequestContext,
  ): Promise<PriceItem> {
    const published = await this.prisma.$transaction(async (tx) => {
      // One publisher at a time per item, so two admins cannot both become version 4.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`price:${code}`}))`;
      const before = await this.load(tx, code);
      const codes = input.prices.map((p) => p.currency);
      const known = await tx.currency.findMany({
        where: { code: { in: codes }, active: true },
        select: { code: true },
      });
      const unknown = codes.filter((c) => !known.some((k) => k.code === c));
      if (unknown.length > 0)
        throw fieldError('prices', `Not an active currency: ${unknown.join(', ')}`);

      const last = await tx.priceItemVersion.aggregate({
        where: { itemId: before.id },
        _max: { version: true },
      });
      const version = (last._max.version ?? 0) + 1;
      await tx.priceItemVersion.create({
        data: {
          itemId: before.id,
          version,
          ...(input.note ? { note: input.note } : {}),
          createdById: actor.userId,
          prices: {
            create: input.prices.map((p) => ({
              currency: p.currency,
              amountMinor: BigInt(p.amountMinor),
            })),
          },
        },
      });
      const after = await this.load(tx, code);
      await this.audit.record(tx, context, {
        action: 'pricing.price_published',
        entityType: 'PriceItem',
        entityId: after.id,
        before: { code, version: before.versions[0]?.version ?? 0, prices: pricesOf(itemView(before).current) },
        after: { code, version, prices: pricesOf(itemView(after).current) },
      });
      await this.outbox.publish(tx, {
        type: 'pricing.price_published',
        aggregateType: 'PriceItem',
        aggregateId: after.id,
        payload: { code, version },
      });
      return after;
    });
    return itemView(published);
  }

  /**
   * The price to copy onto a quote line. A currency with its own price uses it; any other is the rupee price converted at the
   * current rate (a manual rate if one is set) plus the markup. The result names the version, so the line can say where its
   * price came from.
   */
  async lookup(code: string, currency: string): Promise<PriceLookup> {
    const item = await this.load(this.prisma, code);
    const current = item.versions[0];
    if (!item.active || !current) throw new NotFoundException('That item has no price to offer');
    const own = current.prices.find((p) => p.currency === currency);
    const base = {
      code: item.code,
      name: item.name,
      currency,
      version: current.version,
      versionId: current.id,
    };
    if (own) return { ...base, unitPriceMinor: Number(own.amountMinor), converted: false, fx: null };

    const inr = current.prices.find((p) => p.currency === PRICING_BASE_CURRENCY);
    if (!inr) throw new NotFoundException('That item has no price to offer');
    const target = await this.prisma.currency.findFirst({
      where: { code: currency, active: true },
      select: { code: true },
    });
    if (!target) throw new BadRequestException(`Not an active currency: ${currency}`);
    try {
      const setting = await this.prisma.fxSetting.findUnique({
        where: { id: 'default' },
        select: { markupBp: true },
      });
      const markupBp = setting?.markupBp ?? 0;
      const { money: converted, rate } = await convert(
        this.prisma,
        money(Number(inr.amountMinor), PRICING_BASE_CURRENCY),
        currency,
      );
      return {
        ...base,
        unitPriceMinor: applyMargin(converted, markupBp).amountMinor,
        converted: true,
        fx: {
          from: PRICING_BASE_CURRENCY,
          rate: rate.rate,
          asOf: rate.asOf.toISOString(),
          source: rate.source,
          markupBp,
        },
      };
    } catch (error) {
      if (error instanceof RateUnavailableError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  // ---- margins ------------------------------------------------------------------------------------------------
  async margins(): Promise<MarginRules> {
    const rows = await this.prisma.marginRule.findMany({
      select: { component: true, marginBp: true },
      orderBy: { component: 'asc' },
    });
    return { rules: rows };
  }

  async updateMargins(
    actor: Actor,
    input: UpdateMarginRules,
    context: RequestContext,
  ): Promise<MarginRules> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.marginRule.findMany({ select: { component: true, marginBp: true } });
      const before = Object.fromEntries(existing.map((r) => [r.component, r.marginBp]));
      for (const rule of input.rules) {
        if (rule.component === 'discount')
          throw fieldError('rules', 'A discount line has no margin');
        await tx.marginRule.upsert({
          where: { component: rule.component },
          create: { component: rule.component, marginBp: rule.marginBp, updatedById: actor.userId },
          update: { marginBp: rule.marginBp, updatedById: actor.userId },
        });
      }
      const after = { ...before, ...Object.fromEntries(input.rules.map((r) => [r.component, r.marginBp])) };
      await this.audit.record(tx, context, {
        action: 'pricing.margins_updated',
        entityType: 'MarginRule',
        entityId: 'margins',
        before,
        after,
      });
    });
    return this.margins();
  }

  // ---- discount thresholds --------------------------------------------------------------------------------------
  async discountThresholds(): Promise<DiscountThresholds> {
    const rows = await this.prisma.discountThreshold.findMany({
      select: { role: true, maxBp: true },
      orderBy: { maxBp: 'asc' },
    });
    return {
      thresholds: rows.filter(
        (r): r is { role: 'case_manager' | 'finance' | 'super_admin'; maxBp: number } =>
          r.role === 'case_manager' || r.role === 'finance' || r.role === 'super_admin',
      ),
    };
  }

  async updateDiscountThresholds(
    actor: Actor,
    input: UpdateDiscountThresholds,
    context: RequestContext,
  ): Promise<DiscountThresholds> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.discountThreshold.findMany({ select: { role: true, maxBp: true } });
      const before = Object.fromEntries(existing.map((r) => [r.role, r.maxBp]));
      const merged = { ...before, ...Object.fromEntries(input.thresholds.map((r) => [r.role, r.maxBp])) };
      // A role above another may never be allowed less: approval has to go somewhere.
      const caseManager = merged['case_manager'] ?? 0;
      const finance = merged['finance'] ?? caseManager;
      const admin = merged['super_admin'] ?? finance;
      if (caseManager > finance || finance > admin)
        throw fieldError(
          'thresholds',
          'Limits must not fall as the role goes up: case manager, then finance, then super admin',
        );
      for (const row of input.thresholds)
        await tx.discountThreshold.upsert({
          where: { role: row.role },
          create: { role: row.role, maxBp: row.maxBp, updatedById: actor.userId },
          update: { maxBp: row.maxBp, updatedById: actor.userId },
        });
      await this.audit.record(tx, context, {
        action: 'pricing.discounts_updated',
        entityType: 'DiscountThreshold',
        entityId: 'discounts',
        before,
        after: merged,
      });
    });
    return this.discountThresholds();
  }
}

