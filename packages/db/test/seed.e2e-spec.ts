import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CASE_STAGES } from '@medtravel/contracts';
import { createPrismaClient, type PrismaClient } from '../src/client.ts';
import { createFactories } from '../src/testing/factories.ts';

/** The demo seed against a fresh migrated database: what it creates, that it can run again, and that it is quick. */

const baseUrl = process.env['DATABASE_URL'];
if (!baseUrl)
  throw new Error('DATABASE_URL must point at a PostgreSQL server that allows CREATE DATABASE');
const dbName = `seed_${randomBytes(4).toString('hex')}`;
const urlFor = (name: string) => {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
};

let admin: PrismaClient;
let prisma: PrismaClient;
let firstRunMs = 0;
const seed = () =>
  execFileSync('pnpm', ['exec', 'tsx', 'prisma/seed.ts'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      DATABASE_URL: urlFor(dbName),
      NODE_ENV: 'test',
      SEED_DEV_USERS: 'true',
      SEED_DEMO_DATA: 'true',
    },
    stdio: 'pipe',
  });

beforeAll(async () => {
  admin = createPrismaClient({ connectionString: baseUrl });
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy', '--config', 'prisma7.config.ts'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, DATABASE_URL: urlFor(dbName) },
    stdio: 'pipe',
  });
  prisma = createPrismaClient({ connectionString: urlFor(dbName) });
  const started = Date.now();
  seed();
  firstRunMs = Date.now() - started;
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await admin?.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin?.$disconnect();
});

describe('the demo seed', () => {
  it('creates three hospitals with departments, 15 doctors and 31 packages, and three agencies', async () => {
    expect(await prisma.hospital.count({ where: { status: 'published' } })).toBe(3);
    const cities = await prisma.hospital.findMany({ select: { city: { select: { slug: true } } } });
    expect(cities.map((h) => h.city.slug).sort()).toEqual(['chennai', 'delhi-ncr', 'mumbai']);
    expect(await prisma.department.count()).toBe(15);
    expect(await prisma.doctor.count()).toBe(15);
    // Thirty demo packages and the development hospital's own check-up package (AD-02 uses it to try price changes).
    expect(await prisma.package.count()).toBe(31);
    const agents = await prisma.agent.findMany({ select: { countryCode: true } });
    expect(agents.map((a) => a.countryCode).sort()).toEqual(['IQ', 'KE', 'UZ']);
  });

  it('creates 40 patients’ cases that cover every stage, including lost ones', async () => {
    expect(await prisma.case.count()).toBe(40);
    const stages = new Set(
      (await prisma.case.findMany({ select: { stage: true } })).map((c) => c.stage),
    );
    for (const stage of [...CASE_STAGES, 'lost', 'on_hold'])
      expect(stages.has(stage as never), stage).toBe(true);
    expect(await prisma.case.count({ where: { stage: 'lost' } })).toBe(5);
    expect(await prisma.case.count({ where: { status: 'closed' } })).toBe(1);
    expect(await prisma.case.count({ where: { stage: 'lost', lostReasonId: null } })).toBe(0);
  });

  it('gives each case the records its stage would have', async () => {
    const late = await prisma.case.findFirstOrThrow({
      where: { stage: 'treatment' },
      include: {
        visaApplications: true,
        bookings: true,
        payments: true,
        quotes: true,
        opinionRequests: true,
      },
    });
    expect(late.visaApplications[0]?.status).toBe('approved');
    expect(late.bookings.map((b) => b.type).sort()).toEqual(['flight', 'stay', 'transfer']);
    expect(late.payments.some((p) => p.type === 'deposit' && p.status === 'succeeded')).toBe(true);
    expect(late.quotes[0]?.status).toBe('accepted');
    expect(late.opinionRequests).toHaveLength(3);
    const early = await prisma.case.findFirstOrThrow({
      where: { stage: 'enquiry', status: 'new' },
      include: { quotes: true, opinionRequests: true },
    });
    expect(early.quotes).toHaveLength(0);
    expect(early.opinionRequests).toHaveLength(0);
    expect(await prisma.task.count()).toBeGreaterThan(40);
    expect(await prisma.message.count()).toBeGreaterThan(100);
    expect(await prisma.document.count()).toBeGreaterThan(40);
  });

  it('keeps the stage history consistent with each case’s stage, with a fixed order for exits', async () => {
    const cases = await prisma.case.findMany({ select: { id: true, stage: true, status: true } });
    for (const c of cases) {
      const rows = await prisma.caseStageHistory.findMany({
        where: { caseId: c.id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const last = rows.at(-1);
      // A closed case stays in follow-up; every other case ends in the stage it is in.
      expect(last?.toStage, c.id).toBe(c.stage);
      if (c.stage === 'lost' || c.stage === 'on_hold') {
        const before = rows.at(-2);
        expect(last?.fromStage, c.id).toBe(before?.toStage);
        expect(last && before && last.createdAt > before.createdAt, c.id).toBe(true);
      }
    }
    expect(await prisma.caseStageHistory.count({ where: { fromStage: null } })).toBe(40);
  });

  it('adds up: quote lines equal the quote, payments never exceed it, nothing is dated after the case closed', async () => {
    const quotes = await prisma.quote.findMany({ include: { lines: true, payments: true } });
    expect(quotes.length).toBeGreaterThan(10);
    for (const q of quotes) {
      expect(
        q.lines.reduce((sum, l) => sum + l.amountMinor, 0n),
        q.quoteNo,
      ).toBe(q.totalMinor);
      expect(
        q.payments.reduce((sum, p) => sum + p.amountMinor, 0n) <= q.totalMinor,
        q.quoteNo,
      ).toBe(true);
      expect(q.fxRate, q.quoteNo).not.toBeNull();
    }
    const closed = await prisma.case.findFirstOrThrow({
      where: { status: 'closed' },
      include: { payments: true },
    });
    for (const p of closed.payments)
      expect(p.paidAt && closed.closedAt && p.paidAt <= closed.closedAt).toBe(true);
    const home = await prisma.case.findMany({
      where: { stage: { in: ['discharge_return', 'follow_up'] } },
    });
    for (const c of home)
      expect(c.plannedDepartureAt && c.plannedDepartureAt < new Date()).toBe(true);
    const overdue = await prisma.opinionRequest.count({
      where: { status: 'viewed', dueAt: { lt: new Date(Date.now() - 5 * 86_400_000) } },
    });
    expect(overdue).toBe(0);
  });

  it('shares each report with the hospitals that were asked, under their consent', async () => {
    expect(await prisma.documentShare.count()).toBeGreaterThan(50);
    const orphan = await prisma.documentShare.count({
      where: { consent: { withdrawnAt: { not: null } } },
    });
    expect(orphan).toBe(0);
  });

  it('can run again without changing anything, and quickly', async () => {
    const before = await Promise.all([
      prisma.case.count(),
      prisma.patient.count(),
      prisma.doctor.count(),
      prisma.package.count(),
      prisma.user.count(),
    ]);
    const started = Date.now();
    seed();
    expect(Date.now() - started).toBeLessThan(30_000);
    expect(firstRunMs).toBeLessThan(30_000);
    const after = await Promise.all([
      prisma.case.count(),
      prisma.patient.count(),
      prisma.doctor.count(),
      prisma.package.count(),
      prisma.user.count(),
    ]);
    expect(after).toEqual(before);
  });

  it('gives the development users data to look at', async () => {
    const hospitalDesk = await prisma.user.findUniqueOrThrow({
      where: { email: 'hospital-desk@dev.medtravel.test' },
      select: { hospitalStaffs: { select: { hospitalId: true } } },
    });
    const hospitalId = hospitalDesk.hospitalStaffs[0]?.hospitalId as string;
    expect(await prisma.opinionRequest.count({ where: { hospitalId } })).toBeGreaterThan(10);
    const agentUser = await prisma.agentUser.findFirst({
      where: { user: { email: 'agent@dev.medtravel.test' } },
    });
    expect(agentUser).not.toBeNull();
    const patient = await prisma.patient.findFirstOrThrow({
      where: { user: { email: 'patient@dev.medtravel.test' } },
      include: { cases: true },
    });
    expect(patient.cases).toHaveLength(1);
  });
});

describe('the demo seed in production', () => {
  it('refuses to run', () => {
    expect(() =>
      execFileSync('pnpm', ['exec', 'tsx', 'prisma/seed.ts'], {
        cwd: new URL('..', import.meta.url),
        env: {
          ...process.env,
          DATABASE_URL: urlFor(dbName),
          NODE_ENV: 'production',
          SEED_DEMO_DATA: 'true',
        },
        stdio: 'pipe',
      }),
    ).toThrow();
  });
});

describe('the test factories', () => {
  it('build unique rows, with overrides, in any state', async () => {
    const make = createFactories(prisma);
    const hospital = await make.hospital();
    const doctor = await make.doctor(hospital.id);
    expect(doctor.hospitalId).toBe(hospital.id);
    const a = await make.caseAt('visa');
    const b = await make.caseAt('lost', { urgency: 'urgent' });
    expect(a.caseNo).not.toBe(b.caseNo);
    expect(a).toMatchObject({ stage: 'visa', status: 'visa_in_process' });
    expect(b).toMatchObject({ stage: 'lost', status: 'lost', urgency: 'urgent' });
    expect((await make.quote(a.id)).quoteNo).not.toBe((await make.quote(b.id)).quoteNo);
    expect(await make.payment(a.id)).toMatchObject({ status: 'succeeded' });
    expect((await make.agent()).referralCode).not.toBe((await make.agent()).referralCode);
    expect((await make.user('finance')).role).toBe('finance');
  });
});
