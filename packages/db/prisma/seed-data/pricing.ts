import type { PrismaClient } from '../../src/client.ts';

/** Three service packages and the add-on price list. Rupee prices; the other currencies are converted until an admin sets them. */
const PACKAGES = [
  {
    code: 'basic',
    name: 'Basic',
    inclusions: ['Airport pickup and drop', 'Hospital appointment booking', 'Phone and chat support'],
    inr: 25_000_00,
    usd: 300_00,
  },
  {
    code: 'standard',
    name: 'Standard',
    inclusions: [
      'Everything in Basic',
      'Interpreter for hospital visits',
      'Local SIM card',
      'Daily coordinator check-in',
    ],
    inr: 60_000_00,
    usd: 720_00,
  },
  {
    code: 'premium',
    name: 'Premium',
    inclusions: [
      'Everything in Standard',
      'Dedicated case manager and coordinator',
      'Wheelchair-accessible transfers',
      '24/7 emergency line',
      'Follow-up consultation after returning home',
    ],
    inr: 120_000_00,
    usd: 1_440_00,
  },
] as const;

const ADD_ONS = [
  { code: 'extra_night', name: 'Extra night', unit: 'night', inr: 4_000_00 },
  { code: 'interpreter_hour', name: 'Interpreter hour', unit: 'hour', inr: 1_200_00 },
  { code: 'sim_card', name: 'Local SIM card', unit: 'item', inr: 800_00 },
  { code: 'sightseeing', name: 'Sightseeing day', unit: 'trip', inr: 6_000_00 },
  { code: 'wheelchair_transfer', name: 'Wheelchair transfer', unit: 'trip', inr: 2_500_00 },
] as const;

const MARGINS: ['hospital' | 'stay' | 'transfer' | 'interpreter' | 'service_fee' | 'add_on' | 'other', number][] = [
  ['hospital', 0],
  ['stay', 1500],
  ['transfer', 2000],
  ['interpreter', 2500],
  ['service_fee', 0],
  ['add_on', 3000],
  ['other', 1500],
];

/** Creates what is missing and leaves anything an admin has changed alone. Returns how many price items exist. */
export async function seedPricing(prisma: PrismaClient): Promise<number> {
  const publish = async (
    item: { code: string; name: string; kind: 'service_package' | 'add_on'; unit?: string; inclusions: string[] },
    sortOrder: number,
    prices: { currency: string; amountMinor: number }[],
  ) => {
    const row = await prisma.priceItem.upsert({
      where: { code: item.code },
      update: {},
      create: {
        code: item.code,
        name: item.name,
        kind: item.kind,
        ...(item.unit ? { unit: item.unit } : {}),
        inclusions: item.inclusions,
        sortOrder,
      },
    });
    if ((await prisma.priceItemVersion.count({ where: { itemId: row.id } })) > 0) return;
    await prisma.priceItemVersion.create({
      data: {
        itemId: row.id,
        version: 1,
        note: 'Opening price list',
        prices: {
          create: prices.map((p) => ({ currency: p.currency, amountMinor: BigInt(p.amountMinor) })),
        },
      },
    });
  };

  let order = 0;
  for (const p of PACKAGES) {
    order += 10;
    await publish(
      { code: p.code, name: p.name, kind: 'service_package', inclusions: [...p.inclusions] },
      order,
      [
        { currency: 'INR', amountMinor: p.inr },
        { currency: 'USD', amountMinor: p.usd },
      ],
    );
  }
  order = 0;
  for (const a of ADD_ONS) {
    order += 10;
    await publish(
      { code: a.code, name: a.name, kind: 'add_on', unit: a.unit, inclusions: [] },
      order,
      [{ currency: 'INR', amountMinor: a.inr }],
    );
  }
  for (const [component, marginBp] of MARGINS)
    await prisma.marginRule.upsert({
      where: { component },
      update: {},
      create: { component, marginBp },
    });
  for (const [role, maxBp] of [
    ['case_manager', 500],
    ['finance', 1000],
    ['super_admin', 3000],
  ] as const)
    await prisma.discountThreshold.upsert({ where: { role }, update: {}, create: { role, maxBp } });
  await prisma.fxSetting.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default', markupBp: 150 },
  });
  return prisma.priceItem.count();
}
