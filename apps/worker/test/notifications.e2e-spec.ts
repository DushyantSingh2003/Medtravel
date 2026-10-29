import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '@medtravel/db';
import {
  applyStatusUpdate,
  deliverNotification,
  enqueueNotification,
} from '@medtravel/notifications';
import { ObjectStore } from '@medtravel/storage';
import { FakeClamd, FakeS3Server } from '@medtravel/storage/testing';
import { OutboxDispatcher } from '../src/outbox/outbox-dispatcher.service.js';
import { recordingPublisher } from './support/fake-publisher.js';
import { recordingProviders, type Recording } from './support/fake-providers.js';

/** The notification engine against a real database: queue in a transaction, deliver through the outbox, track the status. */

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
let rec: Recording;
const realtime = recordingPublisher();
const s3 = new FakeS3Server();
const clamd = new FakeClamd();
let n = 0;

interface UserOptions {
  language?: string;
  email?: string | null;
  phone?: string | null;
  status?: 'active' | 'invited' | 'suspended';
  /** Whether the email and phone are confirmed (default yes). */
  verified?: boolean;
}
const makeUser = (options: UserOptions = {}) => {
  n += 1;
  return prisma.user.create({
    data: {
      email: options.email === undefined ? `n${n}@notify.test` : options.email,
      phone: options.phone === undefined ? `+9198000${String(n).padStart(5, '0')}` : options.phone,
      name: `Person ${n}`,
      role: 'patient',
      language: options.language ?? 'en',
      status: options.status ?? 'active',
      emailVerifiedAt: options.verified === false ? null : new Date(),
      phoneVerifiedAt: options.verified === false ? null : new Date(),
    },
    select: { id: true },
  });
};

const send = (
  recipients: string[],
  extra: Partial<Parameters<typeof enqueueNotification>[1]> = {},
) =>
  prisma.$transaction((tx) =>
    enqueueNotification(tx, {
      eventKey: 'test_event',
      recipients,
      data: { name: 'Asha' },
      dedupeKey: `t-${randomBytes(4).toString('hex')}`,
      ...extra,
    }),
  );

const rows = (userId: string) =>
  prisma.notification.findMany({ where: { userId }, orderBy: { channel: 'asc' } });

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
  rec = recordingProviders();
  dispatcher = new OutboxDispatcher(
    prisma,
    new ObjectStore({
      endpoint: url,
      region: 'us-east-1',
      accessKeyId: 'k',
      secretAccessKey: 's',
      bucket: 'unused',
      forcePathStyle: true,
    }),
    rec.providers,
    realtime.publisher,
    { CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: port },
  );
});

afterAll(async () => {
  await s3.close();
  await clamd.close();
  await prisma?.$disconnect();
  await admin?.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin?.$disconnect();
});

beforeEach(() => {
  realtime.state.published.length = 0;
  realtime.state.failing = false;
  rec.emails.length = 0;
  rec.sms.length = 0;
  rec.whatsappTemplates.length = 0;
  rec.whatsappTexts.length = 0;
  rec.failWith = {};
});

describe('sending an event', () => {
  it("writes the in-app message at once, queues email and WhatsApp, and delivers them in the person's language", async () => {
    const user = await makeUser({ language: 'ar' });
    const result = await send([user.id]);
    expect(result.queued.map((q) => q.channel).sort()).toEqual(['email', 'in_app', 'whatsapp']);

    const before = await rows(user.id);
    const inApp = before.find((row) => row.channel === 'in_app');
    expect(inApp).toMatchObject({
      status: 'sent',
      locale: 'ar',
      title: 'إشعار تجريبي',
      templateKey: 'test_event',
    });
    expect(inApp?.body).toContain('Asha');
    expect(before.filter((row) => row.channel !== 'in_app').map((row) => row.status)).toEqual([
      'queued',
      'queued',
    ]);

    await dispatcher.runOnce();

    expect(rec.emails).toHaveLength(1);
    expect(rec.emails[0]).toMatchObject({ subject: 'إشعار تجريبي' });
    expect(rec.emails[0]?.html).toContain('dir="rtl"');
    expect(rec.whatsappTemplates).toEqual([
      {
        to: expect.stringMatching(/^\+91/),
        template: 'mt_test_event',
        language: 'ar',
        parameters: ['Asha'],
        text: expect.stringContaining('إشعار تجريبي'),
      },
    ]);
    const after = await rows(user.id);
    for (const row of after.filter((r) => r.channel !== 'in_app')) {
      expect(row).toMatchObject({ status: 'sent', attempts: 1, lastError: null });
      expect(row.providerMessageId).toBeTruthy();
      // The values used to write the message are not kept once it has gone.
      expect(row.data).toBeNull();
    }
    expect(after.find((r) => r.channel === 'in_app')?.data).toEqual({ name: 'Asha' });
  });

  it('writes in English when the person has no text in their language', async () => {
    const user = await makeUser({ language: 'fr' });
    await send([user.id], { channels: ['in_app'] });
    expect((await rows(user.id))[0]).toMatchObject({ locale: 'en', title: 'Test notification' });
  });

  it('sends the same occurrence only once, even when it is sent again', async () => {
    const user = await makeUser();
    const again = { dedupeKey: 'quote-expiring-1', eventKey: 'test_event' as const };
    const first = await send([user.id], again);
    const second = await send([user.id], again);
    expect(first.queued).toHaveLength(3);
    expect(second.queued).toHaveLength(0);
    expect(second.skipped.every((s) => s.reason === 'duplicate')).toBe(true);
    expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(3);
    expect(
      await prisma.outboxEvent.count({
        where: { type: 'notification.deliver', aggregateId: { in: first.queued.map((q) => q.id) } },
      }),
    ).toBe(2);
  });

  it('does not let two different events with the same caller key suppress each other', async () => {
    const user = await makeUser();
    const first = await send([user.id], {
      eventKey: 'test_event',
      dedupeKey: 'shared-key',
      channels: ['in_app'],
    });
    const second = await send([user.id], {
      eventKey: 'document_quarantined',
      dedupeKey: 'shared-key',
      channels: ['in_app'],
    });
    expect(first.queued).toHaveLength(1);
    expect(second.queued).toHaveLength(1);
  });

  it('sends nothing to an email address or phone number the person has not confirmed', async () => {
    const user = await makeUser({ verified: false });
    const result = await send([user.id]);
    expect(result.queued.map((q) => q.channel)).toEqual(['in_app']);
    expect(result.skipped.map((s) => `${s.channel}:${s.reason}`).sort()).toEqual([
      'email:email_unverified',
      'whatsapp:phone_unverified',
    ]);
    // Not even a security alert goes to a contact nobody has confirmed.
    const security = await send([user.id], { eventKey: 'document_quarantined' });
    expect(security.queued.map((q) => q.channel)).toEqual(['in_app']);
  });

  it('does not send to a channel the person switched off, but never switches off in-app or a security alert', async () => {
    const user = await makeUser();
    await prisma.notificationPreference.createMany({
      data: [
        { userId: user.id, channel: 'whatsapp', enabled: false },
        { userId: user.id, channel: 'email', enabled: false },
        { userId: user.id, channel: 'in_app', enabled: false },
      ],
    });
    const normal = await send([user.id]);
    expect(normal.queued.map((q) => q.channel)).toEqual(['in_app']);
    expect(normal.skipped.map((s) => `${s.channel}:${s.reason}`).sort()).toEqual([
      'email:switched_off',
      'whatsapp:switched_off',
    ]);
    const security = await send([user.id], { eventKey: 'document_quarantined' });
    expect(security.queued.map((q) => q.channel).sort()).toEqual(['email', 'in_app']);
  });

  it('skips a channel the person has no address for, and an account that is not active', async () => {
    const noPhone = await makeUser({ phone: null });
    const noEmail = await makeUser({ email: null });
    const invited = await makeUser({ status: 'invited' });
    const result = await send([noPhone.id, noEmail.id, invited.id]);
    const reasons = result.skipped.map(
      (s) => `${s.userId === invited.id ? 'invited' : ''}${s.channel}:${s.reason}`,
    );
    expect(reasons).toContain('whatsapp:no_phone');
    expect(reasons).toContain('email:no_email');
    expect(
      reasons.filter((r) => r.startsWith('invited')).every((r) => r.endsWith('account_not_active')),
    ).toBe(true);
    expect(await prisma.notification.count({ where: { userId: invited.id } })).toBe(0);
  });

  it('sends a pickup reminder by SMS too, with the title and the text', async () => {
    const user = await makeUser();
    await send([user.id], {
      eventKey: 'pickup_2h',
      data: {
        patientName: 'Asha',
        driverName: 'Ravi',
        driverPhone: '+919800000099',
        vehicle: 'white Innova',
        pickupTime: '14:30',
      },
    });
    await dispatcher.runOnce();
    expect(rec.sms).toHaveLength(1);
    expect(rec.sms[0]?.text).toContain('Ravi');
    expect(rec.sms[0]?.text).toContain('14:30');
  });
});

describe('telling open browsers', () => {
  it('pushes notification.created to the person’s room when an in-app message is written, after the commit', async () => {
    const user = await makeUser();
    const { queued } = await send([user.id], { channels: ['in_app'] });
    expect(realtime.state.published).toEqual([]);
    await dispatcher.runOnce();
    expect(realtime.state.published).toEqual([
      {
        room: `user:${user.id}`,
        event: 'notification.created',
        payload: { notificationId: queued[0]?.id },
      },
    ]);
  });

  it('pushes nothing for a transaction that rolled back, and retries when Redis is down', async () => {
    const user = await makeUser();
    await expect(
      prisma.$transaction(async (tx) => {
        await enqueueNotification(tx, {
          eventKey: 'test_event',
          recipients: [user.id],
          data: { name: 'Asha' },
          dedupeKey: `rb-${randomBytes(3).toString('hex')}`,
          channels: ['in_app'],
        });
        throw new Error('the change failed');
      }),
    ).rejects.toThrow('the change failed');
    await dispatcher.runOnce();
    expect(realtime.state.published.filter((p) => p.room === `user:${user.id}`)).toEqual([]);

    const { queued } = await send([user.id], { channels: ['in_app'] });
    realtime.state.failing = true;
    await dispatcher.runOnce();
    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: {
        type: 'realtime.publish',
        payload: { path: ['payload', 'notificationId'], equals: queued[0]?.id },
      },
    });
    expect(event).toMatchObject({ status: 'pending', attempts: 1 });
    realtime.state.failing = false;
    await prisma.outboxEvent.update({ where: { id: event.id }, data: { availableAt: new Date() } });
    await dispatcher.runOnce();
    expect(realtime.state.published.filter((p) => p.room === `user:${user.id}`)).toHaveLength(1);
  });

  it('refuses a published payload that carries more than ids', async () => {
    const event = await prisma.outboxEvent.create({
      data: {
        type: 'realtime.publish',
        aggregateType: 'Realtime',
        aggregateId: 'case:x',
        payload: {
          room: 'case:x',
          event: 'case.updated',
          payload: { caseId: 'not-a-uuid', note: 'diagnosis text' },
        },
      },
    });
    await dispatcher.runOnce();
    expect(await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({
      status: 'pending',
      attempts: 1,
    });
    expect(realtime.state.published.some((p) => p.room === 'case:x')).toBe(false);
  });
});

describe('WhatsApp session window', () => {
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);

  async function patientWithInbound(at: Date) {
    const user = await makeUser();
    const patient = await prisma.patient.create({ data: { fullName: 'Asha', userId: user.id } });
    n += 1;
    const kase = await prisma.case.create({
      data: { caseNo: `CASE-2026-9${String(n).padStart(5, '0')}`, patientId: patient.id },
    });
    const conversation = await prisma.conversation.create({
      data: { kind: 'patient', caseId: kase.id },
    });
    await prisma.message.create({
      data: {
        channel: 'whatsapp',
        direction: 'inbound',
        body: 'Hello',
        conversationId: conversation.id,
        createdAt: at,
      },
    });
    return user;
  }

  it('sends free text when the person wrote to us in the last 24 hours', async () => {
    const user = await patientWithInbound(hoursAgo(3));
    await send([user.id], { channels: ['whatsapp'] });
    await dispatcher.runOnce();
    expect(rec.whatsappTexts).toHaveLength(1);
    expect(rec.whatsappTemplates).toHaveLength(0);
  });

  it('sends the approved template once the window has closed, or when they never wrote', async () => {
    const stale = await patientWithInbound(hoursAgo(30));
    const never = await makeUser();
    await send([stale.id, never.id], { channels: ['whatsapp'] });
    await dispatcher.runOnce();
    expect(rec.whatsappTexts).toHaveLength(0);
    expect(rec.whatsappTemplates).toHaveLength(2);
  });
});

describe('failures', () => {
  const resetOutbox = (ids: string[]) =>
    prisma.outboxEvent.updateMany({
      where: { aggregateId: { in: ids } },
      data: { availableAt: new Date() },
    });

  it('keeps the message queued and counts the attempt when the provider is down, then sends it when it is back', async () => {
    const user = await makeUser();
    const { queued } = await send([user.id], { channels: ['email'] });
    const id = queued[0]?.id as string;
    rec.failWith = { email: 'retry' };
    await dispatcher.runOnce();
    expect(await prisma.notification.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: 'queued',
      attempts: 1,
      lastError: 'provider unavailable',
    });
    expect(await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: id } })).toMatchObject(
      { status: 'pending', attempts: 1 },
    );

    rec.failWith = {};
    await resetOutbox([id]);
    await dispatcher.runOnce();
    expect(await prisma.notification.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: 'sent',
      attempts: 2,
      lastError: null,
    });
  });

  it('gives up after five attempts: the message is failed, the event is finished, and nothing is kept to resend', async () => {
    const user = await makeUser();
    const { queued } = await send([user.id], { channels: ['email'] });
    const id = queued[0]?.id as string;
    rec.failWith = { email: 'retry' };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await resetOutbox([id]);
      await dispatcher.runOnce();
    }
    expect(await prisma.notification.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: 'failed',
      attempts: 5,
      data: null,
    });
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id } })).failedAt,
    ).not.toBeNull();
    expect((await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: id } })).status).toBe(
      'processed',
    );
    expect(rec.emails).toHaveLength(0);
  });

  it('fails at once when the provider refuses for good', async () => {
    const user = await makeUser();
    const { queued } = await send([user.id], { channels: ['whatsapp'] });
    const id = queued[0]?.id as string;
    rec.failWith = { whatsapp: 'permanent' };
    await dispatcher.runOnce();
    expect(await prisma.notification.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: 'failed',
      attempts: 1,
      lastError: 'number rejected',
    });
  });

  it('does not send a message twice when its event is delivered again', async () => {
    const user = await makeUser();
    const { queued } = await send([user.id], { channels: ['email'] });
    const id = queued[0]?.id as string;
    await dispatcher.runOnce();
    await prisma.outboxEvent.updateMany({
      where: { aggregateId: id },
      data: { status: 'pending', processedAt: null, availableAt: new Date() },
    });
    await dispatcher.runOnce();
    expect(rec.emails).toHaveLength(1);
  });
});

describe('two workers at once', () => {
  it('send a message only once', async () => {
    const user = await makeUser();
    const { queued } = await send([user.id], { channels: ['email'] });
    const id = queued[0]?.id as string;
    const deps = { prisma, providers: rec.providers };
    const results = await Promise.all([
      deliverNotification(deps, id),
      deliverNotification(deps, id),
    ]);
    expect(results.sort()).toEqual(['sent', 'skipped']);
    expect(rec.emails).toHaveLength(1);
  });
});

describe('delivery status from the provider', () => {
  async function sentMessage() {
    const user = await makeUser();
    const { queued } = await send([user.id], { channels: ['whatsapp'] });
    await dispatcher.runOnce();
    const row = await prisma.notification.findUniqueOrThrow({
      where: { id: queued[0]?.id as string },
    });
    return {
      id: row.id,
      providerMessageId: row.providerMessageId as string,
      provider: row.provider as string,
    };
  }
  const update = (
    providerMessageId: string,
    status: 'sent' | 'delivered' | 'read' | 'failed',
    eventId = `${providerMessageId}:${status}`,
  ) => ({
    providerMessageId,
    eventId,
    status,
  });

  it('moves a message from sent to delivered to read, and records when', async () => {
    const message = await sentMessage();
    expect(
      await applyStatusUpdate(prisma, 'whatsapp', {
        ...update(message.providerMessageId, 'delivered'),
        at: '2026-10-29T10:00:00.000Z',
      }),
    ).toBe('applied');
    expect(
      await applyStatusUpdate(prisma, 'whatsapp', update(message.providerMessageId, 'read')),
    ).toBe('applied');
    const row = await prisma.notification.findUniqueOrThrow({ where: { id: message.id } });
    expect(row.status).toBe('read');
    expect(row.deliveredAt?.toISOString()).toBe('2026-10-29T10:00:00.000Z');
    expect(row.readAt).not.toBeNull();
  });

  it('ignores a repeated callback, an older status, and a failure that comes after delivery', async () => {
    const message = await sentMessage();
    expect(
      await applyStatusUpdate(prisma, 'whatsapp', update(message.providerMessageId, 'delivered')),
    ).toBe('applied');
    expect(
      await applyStatusUpdate(prisma, 'whatsapp', update(message.providerMessageId, 'delivered')),
    ).toBe('duplicate');
    expect(
      await applyStatusUpdate(prisma, 'whatsapp', update(message.providerMessageId, 'sent')),
    ).toBe('ignored');
    expect(
      await applyStatusUpdate(prisma, 'whatsapp', update(message.providerMessageId, 'failed')),
    ).toBe('ignored');
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: message.id } })).status,
    ).toBe('delivered');
  });

  it('records a failure reported by the provider for a message that was only sent', async () => {
    const message = await sentMessage();
    expect(
      await applyStatusUpdate(prisma, 'whatsapp', {
        ...update(message.providerMessageId, 'failed'),
        error: 'Undeliverable',
      }),
    ).toBe('applied');
    expect(
      await prisma.notification.findUniqueOrThrow({ where: { id: message.id } }),
    ).toMatchObject({
      status: 'failed',
      lastError: 'Undeliverable',
    });
  });

  it('puts a message right when the provider reports it delivered after having reported it failed', async () => {
    const message = await sentMessage();
    await applyStatusUpdate(prisma, 'whatsapp', {
      ...update(message.providerMessageId, 'failed'),
      error: 'Temporary +919800000001',
    });
    const failed = await prisma.notification.findUniqueOrThrow({ where: { id: message.id } });
    expect(failed.status).toBe('failed');
    // The number a provider echoes in its error text is not kept.
    expect(failed.lastError).not.toContain('9198');
    expect(
      await applyStatusUpdate(prisma, 'whatsapp', update(message.providerMessageId, 'delivered')),
    ).toBe('applied');
    expect(
      await prisma.notification.findUniqueOrThrow({ where: { id: message.id } }),
    ).toMatchObject({
      status: 'delivered',
      failedAt: null,
      lastError: null,
    });
  });

  it('does not remember a callback for a message it does not know, so the provider can send it again', async () => {
    expect(await applyStatusUpdate(prisma, 'whatsapp', update('wa-unknown', 'delivered'))).toBe(
      'unknown',
    );
    expect(
      await prisma.processedWebhook.count({ where: { eventId: 'wa-unknown:delivered' } }),
    ).toBe(0);
  });
});
