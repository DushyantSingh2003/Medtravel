import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '@medtravel/db';
import { ObjectStore } from '@medtravel/storage';
import { FakeClamd, FakeS3Server } from '@medtravel/storage/testing';
import { notifyAdminsOfIncident } from '../src/outbox/handlers/incident-created.handler.js';
import { OutboxDispatcher } from '../src/outbox/outbox-dispatcher.service.js';

/** The dispatcher against a real database: an `incident.created` event becomes one notification per active super admin, once. */

// A server that allows CREATE DATABASE: the local development one unless DATABASE_URL says otherwise.
const baseUrl =
  process.env['DATABASE_URL'] ?? 'postgresql://medtravel:medtravel@localhost:5432/medtravel';

const dbName = `worker_${randomBytes(4).toString('hex')}`;
const urlFor = (name: string) => {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
};

let admin: PrismaClient;
let prisma: PrismaClient;
let dispatcher: OutboxDispatcher;
const s3 = new FakeS3Server();
const clamd = new FakeClamd();
const BUCKET = 'worker-private';
let store: ObjectStore;
let n = 0;

const makeUser = (
  role: 'super_admin' | 'case_manager',
  status: 'active' | 'suspended' = 'active',
) =>
  prisma.user.create({
    data: { email: `u${(n += 1)}@worker.test`, name: role, role, status },
    select: { id: true },
  });

const makeIncident = () =>
  prisma.incident.create({
    data: { type: 'other', severity: 'high', description: 'Many downloads' },
    select: { id: true },
  });

const publish = (incidentId: string) =>
  prisma.outboxEvent.create({
    data: {
      type: 'incident.created',
      aggregateType: 'Incident',
      aggregateId: incidentId,
      payload: { incidentId },
    },
  });

beforeAll(async () => {
  admin = createPrismaClient({ connectionString: baseUrl });
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy', '--config', 'prisma7.config.ts'], {
    cwd: new URL('../../../packages/db', import.meta.url),
    env: { ...process.env, DATABASE_URL: urlFor(dbName) },
    stdio: 'pipe',
  });
  prisma = createPrismaClient({ connectionString: urlFor(dbName) });
  const { url } = await s3.start();
  const { port } = await clamd.start();
  store = new ObjectStore({
    endpoint: url,
    region: 'us-east-1',
    accessKeyId: 'k',
    secretAccessKey: 's',
    bucket: BUCKET,
    forcePathStyle: true,
  });
  dispatcher = new OutboxDispatcher(prisma, store, { CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: port });
});

afterAll(async () => {
  await s3.close();
  await clamd.close();
  await prisma?.$disconnect();
  await admin?.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin?.$disconnect();
});

describe('incident.created', () => {
  it('notifies every active super admin once, and nobody else', async () => {
    const first = await makeUser('super_admin');
    const second = await makeUser('super_admin');
    const suspended = await makeUser('super_admin', 'suspended');
    const manager = await makeUser('case_manager');
    const incident = await makeIncident();
    const event = await publish(incident.id);

    await dispatcher.runOnce();

    const rows = await prisma.notification.findMany({
      where: {
        templateKey: 'incident.created',
        data: { path: ['incidentId'], equals: incident.id },
      },
    });
    const recipients = rows.map((row) => row.userId);
    expect(recipients).toContain(first.id);
    expect(recipients).toContain(second.id);
    expect(recipients).not.toContain(suspended.id);
    expect(recipients).not.toContain(manager.id);
    expect(rows.every((row) => row.channel === 'in_app' && row.title?.includes('high'))).toBe(true);
    expect((await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(
      'processed',
    );
  });

  it('does not notify anyone twice when the same event is delivered again', async () => {
    await makeUser('super_admin');
    const incident = await makeIncident();
    const event = await publish(incident.id);
    await dispatcher.runOnce();
    const count = () =>
      prisma.notification.count({ where: { data: { path: ['incidentId'], equals: incident.id } } });
    const once = await count();
    expect(once).toBeGreaterThan(0);

    // A worker died after notifying but before recording the outcome: the event comes round again.
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { status: 'pending', processedAt: null, availableAt: new Date() },
    });
    await dispatcher.runOnce();
    expect(await count()).toBe(once);
    expect((await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(
      'processed',
    );
  });

  it('treats an incident that does not exist as done, and a broken payload as a failure to retry', async () => {
    const gone = await publish('3f0c6f1e-9b1a-4c55-8a53-0d2f5c0a1b11');
    const broken = await prisma.outboxEvent.create({
      data: {
        type: 'incident.created',
        aggregateType: 'Incident',
        aggregateId: 'x',
        payload: { nope: true },
      },
    });
    await dispatcher.runOnce();
    expect((await prisma.outboxEvent.findUniqueOrThrow({ where: { id: gone.id } })).status).toBe(
      'processed',
    );
    expect(await prisma.outboxEvent.findUniqueOrThrow({ where: { id: broken.id } })).toMatchObject({
      status: 'pending',
      attempts: 1,
    });
    expect(
      (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: broken.id } })).lastError,
    ).toBeTruthy();
  });

  it('does not notify anyone twice when two workers handle the same event at the same moment', async () => {
    const first = await makeUser('super_admin');
    const incident = await makeIncident();
    const event = await publish(incident.id);
    const record = {
      id: event.id,
      type: 'incident.created',
      aggregateType: 'Incident',
      aggregateId: incident.id,
      payload: { incidentId: incident.id },
      dedupeKey: null,
      attempts: 1,
    };
    await Promise.all([
      notifyAdminsOfIncident(prisma, record),
      notifyAdminsOfIncident(prisma, record),
    ]);
    expect(
      await prisma.notification.count({
        where: { userId: first.id, data: { path: ['eventId'], equals: event.id } },
      }),
    ).toBe(1);
  });
});
