import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  discountThresholdsSchema,
  fxOverrideListSchema,
  fxOverrideSchema,
  fxSettingsSchema,
  marginRulesSchema,
  priceHistorySchema,
  priceItemListSchema,
  priceItemSchema,
  priceLookupSchema,
  type Role,
} from '@medtravel/contracts';
import { createTestApp, type TestApp } from './support/test-app.js';

/** Pricing rules: versioned prices, margins, discount limits, exchange-rate settings, and quotes keeping their price. */

let t: TestApp;
const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
const errorFields = (body: unknown): string[] =>
  ((body as { errors?: { path: (string | number)[] }[] }).errors ?? []).map((e) => e.path.join('.'));

const price = (currency: string, amountMinor: number) => ({ currency, amountMinor });
const publish = (code: string, prices: ReturnType<typeof price>[], note?: string) =>
  t.call('super_admin', 'POST', `/admin/pricing/items/${code}/prices`, { prices, ...(note ? { note } : {}) });

beforeAll(async () => {
  t = await createTestApp();
  await t.db.currency.createMany({
    data: [
      { code: 'INR', name: 'Indian rupee', minorUnits: 2 },
      { code: 'USD', name: 'US dollar', minorUnits: 2 },
      { code: 'AED', name: 'UAE dirham', minorUnits: 2 },
      { code: 'KES', name: 'Kenyan shilling', minorUnits: 2 },
    ],
  });
  await t.db.fxRate.createMany({
    data: [
      { baseCurrency: 'USD', quoteCurrency: 'INR', rate: '83.00000000', source: 'test', asOf: today },
      { baseCurrency: 'USD', quoteCurrency: 'AED', rate: '3.67250000', source: 'test', asOf: today },
    ],
  });
  for (const [order, code, name] of [
    [10, 'basic', 'Basic'],
    [20, 'standard', 'Standard'],
    [30, 'premium', 'Premium'],
  ] as const)
    await t.db.priceItem.create({
      data: {
        code,
        name,
        kind: 'service_package',
        sortOrder: order,
        inclusions: [`${name} support`],
        versions: {
          create: {
            version: 1,
            prices: { create: [{ currency: 'INR', amountMinor: BigInt(order * 100_000) }] },
          },
        },
      },
    });
  await t.db.priceItem.create({
    data: { code: 'extra_night', name: 'Extra night', kind: 'add_on', unit: 'night', inclusions: [] },
  });
});
afterAll(async () => {
  await t.close();
});

describe('who may use the pricing screens', () => {
  const READS: [string, string][] = [
    ['GET', '/admin/pricing/items'],
    ['GET', '/admin/pricing/items/premium/history'],
    ['GET', '/admin/pricing/margins'],
    ['GET', '/admin/pricing/fx'],
    ['GET', '/admin/pricing/fx/overrides'],
  ];
  const WRITES: [string, string, unknown][] = [
    ['POST', '/admin/pricing/items', { code: 'sim', name: 'SIM', unit: 'item' }],
    ['POST', '/admin/pricing/items/premium/prices', { prices: [price('INR', 1)] }],
    ['PUT', '/admin/pricing/items/premium', { name: 'Premium' }],
    ['PUT', '/admin/pricing/margins', { rules: [{ component: 'stay', marginBp: 100 }] }],
    ['PUT', '/admin/pricing/discounts', { thresholds: [{ role: 'case_manager', maxBp: 100 }] }],
    ['PUT', '/admin/pricing/fx', { provider: null, markupBp: 100 }],
    [
      'POST',
      '/admin/pricing/fx/overrides',
      { base: 'USD', quote: 'INR', rate: '84', reason: 'Bank rate' },
    ],
  ];
  const ROLES: Role[] = ['case_manager', 'finance', 'agent', 'patient', 'hospital_desk', 'doctor'];

  it.each(ROLES)('refuses every settings call to a %s', async (role) => {
    for (const [method, url] of READS)
      expect((await t.call(role, method as 'GET', url)).status, `${role} ${url}`).toBe(403);
    for (const [method, url, body] of WRITES)
      expect((await t.call(role, method as 'POST', url, body)).status, `${role} ${url}`).toBe(403);
  });

  it('refuses a visitor who is not signed in', async () => {
    expect((await t.call(null, 'GET', '/admin/pricing/items')).status).toBe(401);
    expect((await t.call(null, 'GET', '/admin/pricing/items/premium/price?currency=INR')).status).toBe(
      401,
    );
  });

  it('lets whoever can create quotes look a price up, and nobody else', async () => {
    const url = '/admin/pricing/items/premium/price?currency=INR';
    expect((await t.call('case_manager', 'GET', url)).status).toBe(200);
    expect((await t.call('super_admin', 'GET', url)).status).toBe(200);
    expect((await t.call('finance', 'GET', url)).status).toBe(403);
    expect((await t.call('agent', 'GET', url)).status).toBe(403);
    expect((await t.call('patient', 'GET', url)).status).toBe(403);
  });
});

describe('the price list', () => {
  it('lists packages in order, then add-ons, with the current prices', async () => {
    const res = await t.call('super_admin', 'GET', '/admin/pricing/items');
    expect(res.status).toBe(200);
    const body = priceItemListSchema.parse(res.body);
    expect(body.items.map((i) => i.code)).toEqual(['basic', 'standard', 'premium', 'extra_night']);
    expect(body.items[2]?.current?.prices).toEqual([price('INR', 3_000_000)]);
    expect(body.items[3]?.current).toBeNull();
    const add = await t.call('super_admin', 'GET', '/admin/pricing/items?kind=add_on');
    expect(priceItemListSchema.parse(add.body).items.map((i) => i.code)).toEqual(['extra_night']);
  });

  it('adds an add-on, refuses a repeated code, and audits it', async () => {
    const created = await t.call('super_admin', 'POST', '/admin/pricing/items', {
      code: 'sim_card',
      name: 'Local SIM card',
      unit: 'item',
      inclusions: ['Data pack'],
    });
    expect(created.status).toBe(201);
    expect(priceItemSchema.parse(created.body)).toMatchObject({ kind: 'add_on', sortOrder: 10 });
    const again = await t.call('super_admin', 'POST', '/admin/pricing/items', {
      code: 'sim_card',
      name: 'Another',
      unit: 'item',
    });
    expect(again.status).toBe(409);
    expect(errorFields(again.body)).toEqual(['code']);
    const bad = await t.call('super_admin', 'POST', '/admin/pricing/items', {
      code: 'Bad Code',
      name: 'x',
      unit: 'item',
    });
    expect(bad.status).toBe(400);
    expect(
      await t.db.auditEvent.count({ where: { action: 'pricing.item_created' } }),
    ).toBe(1);
  });

  it('renames an item and turns it off, and refuses a unit on a package', async () => {
    const res = await t.call('super_admin', 'PUT', '/admin/pricing/items/extra_night', {
      name: 'Extra hospital-side night',
      inclusions: ['Breakfast'],
    });
    expect(res.status).toBe(200);
    expect(priceItemSchema.parse(res.body)).toMatchObject({
      name: 'Extra hospital-side night',
      inclusions: ['Breakfast'],
    });
    const unit = await t.call('super_admin', 'PUT', '/admin/pricing/items/basic', { unit: 'night' });
    expect(unit.status).toBe(422);
    expect((await t.call('super_admin', 'PUT', '/admin/pricing/items/basic', {})).status).toBe(400);
    expect((await t.call('super_admin', 'PUT', '/admin/pricing/items/nothing', { name: 'x' })).status).toBe(
      404,
    );
  });
});

describe('publishing a price', () => {
  it('needs the rupee price, each currency once, and only active currencies', async () => {
    const noInr = await publish('standard', [price('USD', 100)]);
    expect(noInr.status).toBe(400);
    expect(errorFields(noInr.body)).toContain('prices');
    const twice = await publish('standard', [price('INR', 1), price('INR', 2)]);
    expect(twice.status).toBe(400);
    const unknown = await publish('standard', [price('INR', 1), price('ZZZ', 2)]);
    expect(unknown.status).toBe(422);
    const negative = await publish('standard', [price('INR', -5)]);
    expect(negative.status).toBe(400);
    expect((await publish('nothing', [price('INR', 5)])).status).toBe(404);
  });

  it('adds a version and keeps the old ones, with who published it and why', async () => {
    const res = await publish('standard', [price('INR', 6_500_000), price('USD', 79_000)], 'Spring review');
    expect(res.status).toBe(201);
    const item = priceItemSchema.parse(res.body);
    expect(item.current).toMatchObject({ version: 2, note: 'Spring review' });
    expect(item.current?.createdByName).toBeTruthy();
    const history = priceHistorySchema.parse(
      (await t.call('super_admin', 'GET', '/admin/pricing/items/standard/history')).body,
    );
    expect(history.versions.map((v) => v.version)).toEqual([2, 1]);
    expect(history.versions[1]?.prices).toEqual([price('INR', 2_000_000)]);
    const audit = await t.db.auditEvent.findFirst({ where: { action: 'pricing.price_published' } });
    expect(audit?.before).toMatchObject({ version: 1, prices: { INR: 2_000_000 } });
    expect(audit?.after).toMatchObject({ version: 2, prices: { INR: 6_500_000, USD: 79_000 } });
    expect(
      await t.db.outboxEvent.count({ where: { type: 'pricing.price_published' } }),
    ).toBeGreaterThanOrEqual(1);
  });

  it('gives two publishers at the same moment two different version numbers', async () => {
    const [a, b] = await Promise.all([
      publish('basic', [price('INR', 1_100_000)]),
      publish('basic', [price('INR', 1_200_000)]),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    const history = priceHistorySchema.parse(
      (await t.call('super_admin', 'GET', '/admin/pricing/items/basic/history')).body,
    );
    expect(history.versions.map((v) => v.version)).toEqual([3, 2, 1]);
  });
});

describe('looking a price up for a quote', () => {
  it('uses a currency’s own price as it is', async () => {
    const res = await t.call('case_manager', 'GET', '/admin/pricing/items/standard/price?currency=USD');
    expect(priceLookupSchema.parse(res.body)).toMatchObject({
      unitPriceMinor: 79_000,
      converted: false,
      fx: null,
      version: 2,
    });
  });

  it('converts the rupee price at the stored rate plus the markup when there is no price in that currency', async () => {
    await t.call('super_admin', 'PUT', '/admin/pricing/fx', { provider: null, markupBp: 200 });
    const res = await t.call('case_manager', 'GET', '/admin/pricing/items/standard/price?currency=AED');
    expect(res.status).toBe(200);
    const body = priceLookupSchema.parse(res.body);
    // 65,000.00 INR at 3.6725 / 83 = 2,876.1... AED, plus 2 %.
    expect(body.converted).toBe(true);
    expect(body.fx).toMatchObject({ from: 'INR', markupBp: 200, source: 'test' });
    expect(Math.abs(body.unitPriceMinor - ((6_500_000 * 3.6725) / 83) * 1.02)).toBeLessThanOrEqual(2);
  });

  it('says so when there is no usable rate, and for an unknown currency or an item without a price', async () => {
    const noRate = await t.call('case_manager', 'GET', '/admin/pricing/items/standard/price?currency=KES');
    expect(noRate.status).toBe(400);
    const unknown = await t.call('case_manager', 'GET', '/admin/pricing/items/standard/price?currency=ZZZ');
    expect(unknown.status).toBe(400);
    const unpriced = await t.call('case_manager', 'GET', '/admin/pricing/items/extra_night/price?currency=INR');
    expect(unpriced.status).toBe(404);
    const malformed = await t.call('case_manager', 'GET', '/admin/pricing/items/standard/price');
    expect(malformed.status).toBe(400);
  });
});

describe('margins and discount limits', () => {
  it('saves a margin per component, audits the change, and refuses a margin on the discount line', async () => {
    const res = await t.call('super_admin', 'PUT', '/admin/pricing/margins', {
      rules: [
        { component: 'stay', marginBp: 1500 },
        { component: 'transfer', marginBp: 2000 },
      ],
    });
    expect(res.status).toBe(200);
    expect(marginRulesSchema.parse(res.body).rules).toEqual([
      { component: 'stay', marginBp: 1500 },
      { component: 'transfer', marginBp: 2000 },
    ]);
    await t.call('super_admin', 'PUT', '/admin/pricing/margins', {
      rules: [{ component: 'stay', marginBp: 1800 }],
    });
    const audit = await t.db.auditEvent.findMany({
      where: { action: 'pricing.margins_updated' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit[0]?.before).toMatchObject({ stay: 1500 });
    expect(audit[0]?.after).toMatchObject({ stay: 1800 });
    const discount = await t.call('super_admin', 'PUT', '/admin/pricing/margins', {
      rules: [{ component: 'discount', marginBp: 10 }],
    });
    expect(discount.status).toBe(422);
    const twice = await t.call('super_admin', 'PUT', '/admin/pricing/margins', {
      rules: [
        { component: 'stay', marginBp: 1 },
        { component: 'stay', marginBp: 2 },
      ],
    });
    expect(twice.status).toBe(400);
  });

  it('saves limits that rise with the role and refuses ones that do not', async () => {
    const ok = await t.call('super_admin', 'PUT', '/admin/pricing/discounts', {
      thresholds: [
        { role: 'case_manager', maxBp: 500 },
        { role: 'finance', maxBp: 1000 },
        { role: 'super_admin', maxBp: 3000 },
      ],
    });
    expect(ok.status).toBe(200);
    expect(discountThresholdsSchema.parse(ok.body).thresholds).toEqual([
      { role: 'case_manager', maxBp: 500 },
      { role: 'finance', maxBp: 1000 },
      { role: 'super_admin', maxBp: 3000 },
    ]);
    const inverted = await t.call('super_admin', 'PUT', '/admin/pricing/discounts', {
      thresholds: [{ role: 'case_manager', maxBp: 2000 }],
    });
    expect(inverted.status).toBe(422);
    const read = await t.call('case_manager', 'GET', '/admin/pricing/discounts');
    expect(read.status).toBe(200);
    expect(
      discountThresholdsSchema.parse(read.body).thresholds.find((r) => r.role === 'case_manager')?.maxBp,
    ).toBe(500);
  });
});

describe('exchange-rate settings and manual rates', () => {
  it('saves the provider and markup with an audit row, and limits the markup', async () => {
    const res = await t.call('super_admin', 'PUT', '/admin/pricing/fx', {
      provider: 'frankfurter',
      markupBp: 250,
    });
    expect(res.status).toBe(200);
    expect(fxSettingsSchema.parse(res.body)).toMatchObject({ provider: 'frankfurter', markupBp: 250 });
    const audit = await t.db.auditEvent.findFirst({
      where: { action: 'pricing.fx_settings_updated' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.after).toMatchObject({ provider: 'frankfurter', markupBp: 250 });
    expect(
      (await t.call('super_admin', 'PUT', '/admin/pricing/fx', { provider: 'bogus', markupBp: 1 })).status,
    ).toBe(400);
    expect(
      (await t.call('super_admin', 'PUT', '/admin/pricing/fx', { provider: null, markupBp: 9000 })).status,
    ).toBe(400);
    await t.call('super_admin', 'PUT', '/admin/pricing/fx', { provider: null, markupBp: 200 });
  });

  it('uses a manual rate in place of the stored one until it is removed, and audits both', async () => {
    const before = priceLookupSchema.parse(
      (await t.call('case_manager', 'GET', '/admin/pricing/items/standard/price?currency=AED')).body,
    );
    const set = await t.call('super_admin', 'POST', '/admin/pricing/fx/overrides', {
      base: 'INR',
      quote: 'AED',
      rate: '0.05',
      reason: 'Bank quoted this rate for the week',
    });
    expect(set.status).toBe(201);
    const override = fxOverrideSchema.parse(set.body);
    expect(override).toMatchObject({ rate: '0.05000000', active: true });

    const during = priceLookupSchema.parse(
      (await t.call('case_manager', 'GET', '/admin/pricing/items/standard/price?currency=AED')).body,
    );
    expect(during.fx?.source).toBe('manual');
    expect(during.unitPriceMinor).toBe(Math.round(6_500_000 * 0.05 * 1.02));
    expect(during.unitPriceMinor).not.toBe(before.unitPriceMinor);

    const listed = fxOverrideListSchema.parse(
      (await t.call('super_admin', 'GET', '/admin/pricing/fx/overrides')).body,
    );
    expect(listed.items[0]?.id).toBe(override.id);

    expect((await t.call('super_admin', 'DELETE', `/admin/pricing/fx/overrides/${override.id}`)).status).toBe(
      204,
    );
    const after = priceLookupSchema.parse(
      (await t.call('case_manager', 'GET', '/admin/pricing/items/standard/price?currency=AED')).body,
    );
    expect(after.unitPriceMinor).toBe(before.unitPriceMinor);
    expect(
      (await t.call('super_admin', 'DELETE', `/admin/pricing/fx/overrides/${override.id}`)).status,
    ).toBe(204);
    expect(
      (await t.call('super_admin', 'DELETE', '/admin/pricing/fx/overrides/00000000-0000-4000-8000-000000000000'))
        .status,
    ).toBe(404);
    const actions = (
      await t.db.auditEvent.findMany({
        where: { action: { startsWith: 'pricing.fx_override' } },
        select: { action: true },
      })
    ).map((a) => a.action);
    expect(actions.sort()).toEqual(['pricing.fx_override_removed', 'pricing.fx_override_set']);
  });

  it('replaces the rate in force for a pair, and refuses a bad rate, pair, expiry or reason', async () => {
    const make = (body: Record<string, unknown>) =>
      t.call('super_admin', 'POST', '/admin/pricing/fx/overrides', {
        base: 'USD',
        quote: 'INR',
        rate: '84',
        reason: 'Bank rate this week',
        ...body,
      });
    expect((await make({})).status).toBe(201);
    expect((await make({ rate: '85' })).status).toBe(201);
    const items = fxOverrideListSchema.parse(
      (await t.call('super_admin', 'GET', '/admin/pricing/fx/overrides')).body,
    ).items.filter((i) => i.base === 'USD');
    expect(items.map((i) => [i.rate, i.active])).toEqual([
      ['85.00000000', true],
      ['84.00000000', false],
    ]);
    expect((await make({ rate: '0' })).status).toBe(400);
    expect((await make({ quote: 'USD' })).status).toBe(400);
    expect((await make({ reason: 'x' })).status).toBe(400);
    expect((await make({ quote: 'ZZZ' })).status).toBe(422);
    expect(
      (await make({ expiresAt: new Date(Date.now() - 3_600_000).toISOString() })).status,
    ).toBe(422);
    const expired = await t.db.fxOverride.create({
      data: {
        baseCurrency: 'USD',
        quoteCurrency: 'AED',
        rate: '9',
        reason: 'Stale',
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const listed = fxOverrideListSchema.parse(
      (await t.call('super_admin', 'GET', '/admin/pricing/fx/overrides')).body,
    );
    expect(listed.items.find((i) => i.id === expired.id)?.active).toBe(false);
  });
});

describe('a quote keeps the price it was made with', () => {
  it('is not changed when the Premium price is changed afterwards', async () => {
    const patient = await t.db.patient.create({ data: { fullName: 'Quote Patient' } });
    const kase = await t.db.case.create({
      data: { caseNo: 'CASE-2026-990001', patientId: patient.id },
      select: { id: true },
    });
    // The quote builder asks for the price and copies it, with the version it came from, onto the line.
    const priced = priceLookupSchema.parse(
      (await t.call('case_manager', 'GET', '/admin/pricing/items/premium/price?currency=INR')).body,
    );
    expect(priced).toMatchObject({ unitPriceMinor: 3_000_000, version: 1 });
    const quote = await t.db.quote.create({
      data: {
        quoteNo: 'Q-990001',
        status: 'sent',
        sentAt: new Date(),
        totalMinor: BigInt(priced.unitPriceMinor),
        currency: 'INR',
        caseId: kase.id,
        lines: {
          create: {
            kind: 'service_fee',
            description: `Premium service package (price list v${priced.version})`,
            quantity: 1,
            unitPriceMinor: BigInt(priced.unitPriceMinor),
            amountMinor: BigInt(priced.unitPriceMinor),
            currency: 'INR',
          },
        },
      },
      select: { id: true },
    });

    const changed = await publish('premium', [price('INR', 3_600_000), price('USD', 43_000)], 'Premium rise');
    expect(changed.status).toBe(201);

    const stored = await t.db.quote.findUniqueOrThrow({
      where: { id: quote.id },
      include: { lines: true },
    });
    expect(stored.totalMinor).toBe(3_000_000n);
    expect(stored.lines[0]?.unitPriceMinor).toBe(3_000_000n);
    expect(stored.lines[0]?.amountMinor).toBe(3_000_000n);

    const next = priceLookupSchema.parse(
      (await t.call('case_manager', 'GET', '/admin/pricing/items/premium/price?currency=INR')).body,
    );
    expect(next).toMatchObject({ unitPriceMinor: 3_600_000, version: 2 });
    const old = await t.db.priceItemVersion.findFirstOrThrow({
      where: { item: { code: 'premium' }, version: 1 },
      include: { prices: true },
    });
    expect(old.prices.map((p) => [p.currency, p.amountMinor])).toEqual([['INR', 3_000_000n]]);
  });
});

describe('the price database rules', () => {
  it('refuses a negative amount, a zero rate and a second settings row', async () => {
    const item = await t.db.priceItem.findUniqueOrThrow({ where: { code: 'premium' } });
    const version = await t.db.priceItemVersion.findFirstOrThrow({ where: { itemId: item.id } });
    await expect(
      t.db.priceItemPrice.create({ data: { versionId: version.id, currency: 'KES', amountMinor: -1n } }),
    ).rejects.toThrow();
    await expect(
      t.db.fxOverride.create({
        data: { baseCurrency: 'USD', quoteCurrency: 'KES', rate: '0', reason: 'bad' },
      }),
    ).rejects.toThrow();
    await expect(t.db.fxSetting.create({ data: { id: 'second' } })).rejects.toThrow();
  });
});
