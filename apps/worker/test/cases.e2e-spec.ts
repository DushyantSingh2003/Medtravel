import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, type OutboxEventRecord, type PrismaClient } from '@medtravel/db';
import { notifyAgentOfStageChange } from '../src/outbox/handlers/case-stage-changed.handler.js';
import { SlaScheduler } from '../src/sla/sla.module.js';
import { SLA_SCHEDULER_ID, overdueText, sweepOverdueCases } from '../src/sla/sla.job.js';

/** What the worker does when a case changes stage or runs past its stage target, against a real database. */

const baseUrl =
  process.env['DATABASE_URL'] ?? 'postgresql://medtravel:medtravel@localhost:5432/medtravel';
const dbName = `workercases_${randomBytes(4).toString('hex')}`;
const urlFor = (name: string) => {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
};
let admin: PrismaClient;
let prisma: PrismaClient;
let patientId: string;
let managerId: string;
let adminUserId: string;
let counter = 0;
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

async function user(role: 'case_manager' | 'super_admin' | 'agent') {
  counter += 1;
  return (
    await prisma.user.create({
      data: {
        email: `${role}-${counter}@test.example`,
        name: role,
        role,
        status: 'active',
        emailVerifiedAt: new Date(),
      },
    })
  ).id;
}

async function makeCase(extra: Record<string, unknown> = {}) {
  counter += 1;
  return prisma.case.create({
    data: {
      caseNo: `CASE-2026-${String(counter).padStart(6, '0')}`,
      patientId,
      stage: 'qualification',
      status: 'qualifying',
      ...extra,
    },
  });
}

const eventFor = (payload: Record<string, unknown>): OutboxEventRecord =>
  ({ id: randomUUID(), type: 'case.stage_changed', payload }) as unknown as OutboxEventRecord;

beforeAll(async () => {
  admin = createPrismaClient({ connectionString: baseUrl });
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy', '--config', 'prisma7.config.ts'], {
    cwd: new URL('../../../packages/db', import.meta.url),
    env: { ...process.env, DATABASE_URL: urlFor(dbName) },
    stdio: 'pipe',
  });
  prisma = createPrismaClient({ connectionString: urlFor(dbName) });
  patientId = (await prisma.patient.create({ data: { fullName: 'Asha Verma' } })).id;
  managerId = await user('case_manager');
  adminUserId = await user('super_admin');
});

afterAll(async () => {
  await prisma?.$disconnect();
  await admin?.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin?.$disconnect();
});

describe('the SLA sweep', () => {
  it('tells the owner once when a stage runs past its target, and marks the case', async () => {
    const late = await makeCase({ ownerId: managerId, slaDueAt: minutesAgo(135) });
    expect((await sweepOverdueCases(prisma)).breached).toBe(1);
    const row = await prisma.case.findUniqueOrThrow({ where: { id: late.id } });
    expect(row.slaBreachedAt).not.toBeNull();
    const sent = await prisma.notification.findMany({
      where: { caseId: late.id, templateKey: 'sla_breach' },
    });
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((n) => n.userId === managerId)).toBe(true);
    expect(JSON.stringify(sent[0]?.data ?? sent[0])).toContain('Qualification');

    const again = await sweepOverdueCases(prisma);
    expect(again.breached).toBe(0);
    expect(
      await prisma.notification.count({ where: { caseId: late.id, templateKey: 'sla_breach' } }),
    ).toBe(sent.length);
  });

  it('tells the super admins when nobody owns the case', async () => {
    const orphan = await makeCase({ slaDueAt: minutesAgo(10) });
    await sweepOverdueCases(prisma);
    const sent = await prisma.notification.findMany({
      where: { caseId: orphan.id, templateKey: 'sla_breach' },
    });
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((n) => n.userId === adminUserId)).toBe(true);
  });

  it('leaves alone cases that are on time, have no target, are on hold, lost, cancelled or closed', async () => {
    const quiet = [
      await makeCase({ ownerId: managerId, slaDueAt: new Date(Date.now() + 3_600_000) }),
      await makeCase({ ownerId: managerId, slaDueAt: null }),
      await makeCase({
        ownerId: managerId,
        slaDueAt: minutesAgo(30),
        stage: 'on_hold',
        status: 'on_hold',
      }),
      await makeCase({
        ownerId: managerId,
        slaDueAt: minutesAgo(30),
        stage: 'lost',
        status: 'lost',
      }),
      await makeCase({
        ownerId: managerId,
        slaDueAt: minutesAgo(30),
        stage: 'cancelled',
        status: 'cancelled',
      }),
      await makeCase({
        ownerId: managerId,
        slaDueAt: minutesAgo(30),
        status: 'closed',
        closedAt: new Date(),
      }),
    ];
    expect((await sweepOverdueCases(prisma)).breached).toBe(0);
    const marked = await prisma.case.count({
      where: { id: { in: quiet.map((c) => c.id) }, slaBreachedAt: { not: null } },
    });
    expect(marked).toBe(0);
  });

  it('counts a new timer as new: a case that moved on is announced again if it runs late again', async () => {
    const c = await makeCase({ ownerId: managerId, slaDueAt: minutesAgo(5) });
    expect((await sweepOverdueCases(prisma)).breached).toBe(1);
    await prisma.case.update({
      where: { id: c.id },
      data: { slaBreachedAt: null, slaDueAt: minutesAgo(1) },
    });
    expect((await sweepOverdueCases(prisma)).breached).toBe(1);
  });

  it('is safe when two workers sweep at once', async () => {
    const c = await makeCase({ ownerId: managerId, slaDueAt: minutesAgo(20) });
    const [a, b] = await Promise.all([sweepOverdueCases(prisma), sweepOverdueCases(prisma)]);
    expect(a.breached + b.breached).toBe(1);
    expect(
      await prisma.notification.count({
        where: { caseId: c.id, templateKey: 'sla_breach', channel: 'in_app' },
      }),
    ).toBe(1);
  });

  it('keeps going when one case cannot be announced', async () => {
    const bad = await makeCase({ ownerId: managerId, slaDueAt: minutesAgo(500) });
    const good = await makeCase({ ownerId: managerId, slaDueAt: minutesAgo(400) });
    // A database whose announcement of one case always fails.
    const flaky = new Proxy(prisma, {
      get(target, key, receiver) {
        if (key !== '$transaction') return Reflect.get(target, key, receiver);
        return (run: (tx: PrismaClient) => Promise<unknown>) =>
          target.$transaction(async (tx) => {
            const original = tx.case.updateMany.bind(tx.case);
            tx.case.updateMany = ((args: { where: { id?: string } }) => {
              if (args.where.id === bad.id) throw new Error('boom');
              return original(args as never);
            }) as unknown as typeof tx.case.updateMany;
            return run(tx as unknown as PrismaClient);
          });
      },
    });
    const result = await sweepOverdueCases(flaky);
    expect(result.breached).toBeGreaterThanOrEqual(1);
    expect(
      (await prisma.case.findUniqueOrThrow({ where: { id: good.id } })).slaBreachedAt,
    ).not.toBeNull();
    expect(
      (await prisma.case.findUniqueOrThrow({ where: { id: bad.id } })).slaBreachedAt,
    ).toBeNull();
  });

  it('writes how late in plain words', () => {
    expect(overdueText(30_000)).toBe('1 min');
    expect(overdueText(42 * 60_000)).toBe('42 min');
    expect(overdueText(135 * 60_000)).toBe('2 h 15 min');
    expect(overdueText(50 * 3_600_000)).toBe('2 d 2 h');
  });

  it('registers one every-minute schedule however many workers start', async () => {
    const connection = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
    const queue = new Queue(`sla-test-${randomBytes(3).toString('hex')}`, { connection });
    try {
      const scheduler = new SlaScheduler(queue);
      await scheduler.onApplicationBootstrap();
      await scheduler.onApplicationBootstrap();
      const schedulers = await queue.getJobSchedulers();
      expect(schedulers).toHaveLength(1);
      expect(schedulers[0]).toMatchObject({ key: SLA_SCHEDULER_ID, every: 60_000, name: 'sweep' });
    } finally {
      await queue.obliterate({ force: true });
      await queue.close();
      connection.disconnect();
    }
  });
});

describe('a case changed stage', () => {
  async function agencyCase(consent: 'granted' | 'withdrawn' | 'none') {
    counter += 1;
    await prisma.country.upsert({
      where: { code: 'AE' },
      update: {},
      create: { code: 'AE', name: 'United Arab Emirates' },
    });
    const agency = await prisma.agent.create({
      data: {
        companyName: `Agency ${counter}`,
        referralCode: `AG${counter}`,
        languages: ['en'],
        countryCode: 'AE',
      },
    });
    const agentUserId = await user('agent');
    await prisma.agentUser.create({ data: { agentId: agency.id, userId: agentUserId } });
    const c = await makeCase({
      agentId: agency.id,
      stage: 'medical_review',
      status: 'in_medical_review',
    });
    if (consent !== 'none')
      await prisma.consent.create({
        data: {
          type: 'share_stage_with_agent',
          patientId,
          caseId: c.id,
          agentId: agency.id,
          ...(consent === 'withdrawn'
            ? { grantedAt: minutesAgo(60), withdrawnAt: new Date() }
            : {}),
        },
      });
    return { c, agentUserId };
  }

  it('tells the agency, with initials only, when the patient agreed to share the stage', async () => {
    const { c, agentUserId } = await agencyCase('granted');
    const event = eventFor({ caseId: c.id, to: 'hospital_opinions', status: 'awaiting_opinions' });
    expect(await notifyAgentOfStageChange(prisma, event)).toBeGreaterThan(0);
    const sent = await prisma.notification.findMany({
      where: { caseId: c.id, templateKey: 'referral_stage_changed' },
    });
    expect(sent.every((n) => n.userId === agentUserId)).toBe(true);
    const text = JSON.stringify(sent);
    expect(text).toContain('A.V.');
    expect(text).not.toContain('Asha');
    expect(text).toContain('Hospital opinions');
    // A redelivered event tells nobody twice.
    await notifyAgentOfStageChange(prisma, event);
    expect(
      await prisma.notification.count({
        where: { caseId: c.id, templateKey: 'referral_stage_changed' },
      }),
    ).toBe(sent.length);
  });

  it('does not tell the agency again when a finished follow-up is closed', async () => {
    const { c } = await agencyCase('granted');
    expect(
      await notifyAgentOfStageChange(
        prisma,
        eventFor({ caseId: c.id, to: 'follow_up', status: 'closed' }),
      ),
    ).toBe(0);
    expect(await prisma.notification.count({ where: { caseId: c.id } })).toBe(0);
  });

  it('tells the agency nothing without consent, after it is withdrawn, or for a case with no agency', async () => {
    for (const consent of ['none', 'withdrawn'] as const) {
      const { c } = await agencyCase(consent);
      expect(
        await notifyAgentOfStageChange(
          prisma,
          eventFor({ caseId: c.id, to: 'visa', status: 'visa_in_process' }),
        ),
      ).toBe(0);
      expect(await prisma.notification.count({ where: { caseId: c.id } })).toBe(0);
    }
    const direct = await makeCase();
    expect(
      await notifyAgentOfStageChange(
        prisma,
        eventFor({ caseId: direct.id, to: 'visa', status: 'visa_in_process' }),
      ),
    ).toBe(0);
    expect(
      await notifyAgentOfStageChange(
        prisma,
        eventFor({ caseId: randomUUID(), to: 'visa', status: 'x' }),
      ),
    ).toBe(0);
  });
});
