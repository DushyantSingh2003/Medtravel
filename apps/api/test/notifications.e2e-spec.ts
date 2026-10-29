import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  notificationLogPageSchema,
  notificationPageSchema,
  notificationPreferencesSchema,
  sendTestResultSchema,
  type Role,
} from '@medtravel/contracts';
import { DEV_WEBHOOK_SECRET } from '@medtravel/notifications';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { createTestApp, type TestApp } from './support/test-app.js';

let t: TestApp;
let n = 0;
const next = () => (n += 1);

const as = async (
  role: Role,
  extra: { name?: string; language?: string; phone?: string | null } = {},
) => {
  const user = await t.makeUser({
    email: `${role.replace(/_/g, '-')}-${next()}@notify.test`,
    role,
    ...(extra.name ? { name: extra.name } : {}),
  });
  await t.db.user.update({
    where: { id: user.id },
    data: {
      ...(extra.language ? { language: extra.language } : {}),
      phone: extra.phone === undefined ? `+9198111${String(n).padStart(5, '0')}` : extra.phone,
    },
  });
  const { accessToken } = await t.tokenFor(user.id);
  return { user, headers: { authorization: `Bearer ${accessToken}` } };
};

const give = (userId: string, title: string, createdAt: Date, readAt: Date | null = null) =>
  t.db.notification.create({
    data: {
      userId,
      channel: 'in_app',
      status: readAt ? 'read' : 'sent',
      templateKey: 'test_event',
      title,
      body: `${title} body`,
      sentAt: createdAt,
      createdAt,
      readAt,
    },
  });

const sign = (body: string, secret = DEV_WEBHOOK_SECRET) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

beforeAll(async () => {
  t = await createTestApp();
}, 120_000);

afterAll(async () => {
  await t?.close();
});

describe('my notifications', () => {
  it('lists only my in-app notifications, newest first, with how many are unread', async () => {
    const me = await as('patient');
    const other = await as('patient');
    const base = Date.now();
    await give(me.user.id, 'oldest', new Date(base - 3000));
    await give(me.user.id, 'middle', new Date(base - 2000), new Date());
    await give(me.user.id, 'newest', new Date(base - 1000));
    await give(other.user.id, 'not mine', new Date(base));
    await t.db.notification.create({
      data: { userId: me.user.id, channel: 'email', templateKey: 'test_event', title: 'email row' },
    });

    const res = await t.raw('GET', '/notifications', { headers: me.headers });
    expect(res.status).toBe(200);
    const page = notificationPageSchema.parse(res.body);
    expect(page.items.map((i) => i.title)).toEqual(['newest', 'middle', 'oldest']);
    expect(page).toMatchObject({ total: 3, unread: 2, nextCursor: null });

    const unread = await t.raw('GET', '/notifications?unread=true', { headers: me.headers });
    expect(notificationPageSchema.parse(unread.body).items.map((i) => i.title)).toEqual([
      'newest',
      'oldest',
    ]);
    expect(
      (await t.raw('GET', '/notifications/unread-count', { headers: me.headers })).body,
    ).toEqual({ unread: 2 });
  });

  it('pages with a cursor', async () => {
    const me = await as('patient');
    for (let i = 0; i < 5; i += 1) await give(me.user.id, `n${i}`, new Date(Date.now() - i * 1000));
    const first = notificationPageSchema.parse(
      (await t.raw('GET', '/notifications?limit=2', { headers: me.headers })).body,
    );
    expect(first.items.map((i) => i.title)).toEqual(['n0', 'n1']);
    const second = notificationPageSchema.parse(
      (
        await t.raw('GET', `/notifications?limit=2&cursor=${first.nextCursor}`, {
          headers: me.headers,
        })
      ).body,
    );
    expect(second.items.map((i) => i.title)).toEqual(['n2', 'n3']);
    expect(second.total).toBe(5);
  });

  it('marks some or all as read, and never touches another person’s', async () => {
    const me = await as('patient');
    const other = await as('patient');
    const a = await give(me.user.id, 'a', new Date());
    await give(me.user.id, 'b', new Date());
    const theirs = await give(other.user.id, 'theirs', new Date());

    const one = await t.raw('POST', '/notifications/read', {
      headers: me.headers,
      body: { ids: [a.id, theirs.id] },
    });
    expect(one.body).toEqual({ unread: 1 });
    expect((await t.db.notification.findUniqueOrThrow({ where: { id: a.id } })).status).toBe(
      'read',
    );
    expect(
      (await t.db.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt,
    ).toBeNull();

    expect(
      (await t.raw('POST', '/notifications/read', { headers: me.headers, body: { all: true } }))
        .body,
    ).toEqual({ unread: 0 });
    for (const bad of [
      {},
      { ids: [] },
      { ids: [a.id], all: true },
      { ids: ['nope'] },
      { all: true, extra: 1 },
    ])
      expect(
        (await t.raw('POST', '/notifications/read', { headers: me.headers, body: bad })).status,
      ).toBe(400);
  });

  it('needs a sign-in, and every role can read its own inbox', async () => {
    expect((await t.raw('GET', '/notifications')).status).toBe(401);
    for (const role of [
      'patient',
      'attendant',
      'agent',
      'case_manager',
      'finance',
      'hospital_desk',
      'doctor',
      'super_admin',
    ] as const) {
      const person = await as(role);
      expect((await t.raw('GET', '/notifications', { headers: person.headers })).status, role).toBe(
        200,
      );
    }
  });
});

describe('channel preferences', () => {
  it('are all on until the person changes them, and are saved and audited', async () => {
    const me = await as('patient');
    const initial = notificationPreferencesSchema.parse(
      (await t.raw('GET', '/notifications/preferences', { headers: me.headers })).body,
    );
    expect(initial.channels).toEqual([
      { channel: 'email', enabled: true },
      { channel: 'whatsapp', enabled: true },
      { channel: 'sms', enabled: true },
    ]);
    const saved = await t.raw('PUT', '/notifications/preferences', {
      headers: me.headers,
      body: { channels: [{ channel: 'whatsapp', enabled: false }] },
    });
    expect(saved.status).toBe(200);
    expect(
      notificationPreferencesSchema.parse(saved.body).channels.find((c) => c.channel === 'whatsapp')
        ?.enabled,
    ).toBe(false);
    const audit = await t.db.auditEvent.findFirstOrThrow({
      where: { action: 'notification.preferences_updated', entityId: me.user.id },
    });
    expect(audit).toMatchObject({ before: { disabled: [] }, after: { disabled: ['whatsapp'] } });
  });

  it('refuse a channel that cannot be switched, and stray fields', async () => {
    const me = await as('patient');
    for (const bad of [
      { channels: [{ channel: 'in_app', enabled: false }] },
      { channels: [{ channel: 'push', enabled: false }] },
      { channels: [{ channel: 'email', enabled: 'no' }] },
      { channels: [], extra: true },
    ])
      expect(
        (await t.raw('PUT', '/notifications/preferences', { headers: me.headers, body: bad }))
          .status,
      ).toBe(400);
  });
});

describe('the delivery log and the test event', () => {
  it('lets only the super admin read the log, the events and send a test', async () => {
    for (const role of [
      'case_manager',
      'finance',
      'agent',
      'patient',
      'hospital_desk',
      'doctor',
      'attendant',
    ] as const) {
      const person = await as(role);
      for (const [method, url] of [
        ['GET', '/notifications/log'],
        ['GET', '/notifications/events'],
        ['POST', '/notifications/test'],
      ] as const)
        expect(
          (
            await t.raw(method, url, {
              headers: person.headers,
              ...(method === 'POST' ? { body: {} } : {}),
            })
          ).status,
          `${role} ${url}`,
        ).toBe(403);
    }
    expect((await t.raw('GET', '/notifications/log')).status).toBe(401);
  });

  it('sends the test event to the admin on every channel, in their language, and shows it in the log', async () => {
    const admin = await as('super_admin', { name: 'Amira Admin', language: 'ar' });
    const res = await t.raw('POST', '/notifications/test', { headers: admin.headers, body: {} });
    expect(res.status).toBe(200);
    const result = sendTestResultSchema.parse(res.body);
    expect(result.queued.map((q) => q.channel).sort()).toEqual(['email', 'in_app', 'whatsapp']);

    const inbox = notificationPageSchema.parse(
      (await t.raw('GET', '/notifications', { headers: admin.headers })).body,
    );
    expect(inbox.items[0]).toMatchObject({ eventKey: 'test_event', title: 'إشعار تجريبي' });
    expect(inbox.items[0]?.body).toContain('Amira Admin');

    const log = notificationLogPageSchema.parse(
      (
        await t.raw('GET', '/notifications/log?eventKey=test_event&user=amira', {
          headers: admin.headers,
        })
      ).body,
    );
    expect(log.items.map((row) => row.channel).sort()).toEqual(['email', 'in_app', 'whatsapp']);
    expect(log.items.find((row) => row.channel === 'email')).toMatchObject({
      status: 'queued',
      userName: 'Amira Admin',
      locale: 'ar',
    });
    // The log shows what happened, never what was said: no title or body field exists on a row.
    expect(Object.keys(log.items[0] ?? {})).not.toContain('body');
    expect(
      await t.db.auditEvent.count({
        where: { action: 'notification.test_sent', entityId: admin.user.id },
      }),
    ).toBe(1);
  });

  it('sends the test to another user even when they switched a channel off, and can be limited to chosen channels', async () => {
    const admin = await as('super_admin');
    const target = await as('patient');
    await t.db.notificationPreference.create({
      data: { userId: target.user.id, channel: 'email', enabled: false },
    });
    const res = sendTestResultSchema.parse(
      (
        await t.raw('POST', '/notifications/test', {
          headers: admin.headers,
          body: { userId: target.user.id, channels: ['email'] },
        })
      ).body,
    );
    expect(res.queued.map((q) => q.channel)).toEqual(['email']);
    expect(
      (
        await t.raw('POST', '/notifications/test', {
          headers: admin.headers,
          body: { userId: '3f0c6f1e-9b1a-4c55-8a53-0d2f5c0a1b11' },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await t.raw('POST', '/notifications/test', {
          headers: admin.headers,
          body: { channels: ['carrier_pigeon'] },
        })
      ).status,
    ).toBe(400);
  });

  it('filters by channel, status and date, and pages with a cursor', async () => {
    const admin = await as('super_admin');
    const person = await as('patient');
    const old = new Date('2026-01-01T00:00:00Z');
    for (let i = 0; i < 3; i += 1)
      await t.db.notification.create({
        data: {
          userId: person.user.id,
          channel: 'sms',
          status: 'failed',
          templateKey: 'payment_failed',
          createdAt: new Date(old.getTime() + i * 1000),
          lastError: 'x',
        },
      });
    const q = (query: string) =>
      t.raw('GET', `/notifications/log?${query}`, { headers: admin.headers });
    const failed = notificationLogPageSchema.parse(
      (await q('status=failed&channel=sms&eventKey=payment_failed&limit=2')).body,
    );
    expect(failed.items).toHaveLength(2);
    expect(failed.total).toBe(3);
    const rest = notificationLogPageSchema.parse(
      (
        await q(
          `status=failed&channel=sms&eventKey=payment_failed&limit=2&cursor=${failed.nextCursor}`,
        )
      ).body,
    );
    expect(rest.items).toHaveLength(1);
    expect(rest.nextCursor).toBeNull();
    const dated = notificationLogPageSchema.parse(
      (await q('eventKey=payment_failed&from=2026-02-01T00:00:00Z')).body,
    );
    expect(dated.total).toBe(0);
    expect((await q('status=exploded')).status).toBe(400);
    expect((await q('limit=1000')).status).toBe(400);
  });

  it('lists the events that can be notified', async () => {
    const admin = await as('super_admin');
    const res = await t.raw('GET', '/notifications/events', { headers: admin.headers });
    const events = (res.body as { events: { key: string; audience: string }[] }).events;
    expect(events.length).toBeGreaterThanOrEqual(31);
    expect(events.find((e) => e.key === 'quote_sent')).toMatchObject({ audience: 'patient' });
  });
});

describe('sending from another module', () => {
  it('queues nothing when the surrounding transaction is rolled back', async () => {
    const person = await as('patient');
    const service = t.app.get(NotificationsService);
    const before = await t.db.notification.count({ where: { userId: person.user.id } });
    const outboxBefore = await t.db.outboxEvent.count({ where: { type: 'notification.deliver' } });
    await expect(
      t.db.$transaction(async (tx) => {
        const sent = await service.send(tx, {
          eventKey: 'enquiry_received',
          recipients: [person.user.id],
          data: { patientName: 'Asha', caseNumber: 'CASE-2026-000001' },
          dedupeKey: 'rollback-1',
        });
        expect(sent.queued.length).toBeGreaterThan(0);
        throw new Error('the change failed');
      }),
    ).rejects.toThrow('the change failed');
    expect(await t.db.notification.count({ where: { userId: person.user.id } })).toBe(before);
    expect(await t.db.outboxEvent.count({ where: { type: 'notification.deliver' } })).toBe(
      outboxBefore,
    );
  });

  it('keeps the message and its delivery event when the transaction commits', async () => {
    const person = await as('patient');
    const service = t.app.get(NotificationsService);
    const sent = await t.db.$transaction((tx) =>
      service.send(tx, {
        eventKey: 'enquiry_received',
        recipients: [person.user.id],
        data: { patientName: 'Asha', caseNumber: 'CASE-2026-000002' },
        dedupeKey: 'commit-1',
      }),
    );
    const email = sent.queued.find((q) => q.channel === 'email');
    expect(email).toBeDefined();
    expect(
      await t.db.outboxEvent.count({
        where: { type: 'notification.deliver', aggregateId: email?.id },
      }),
    ).toBe(1);
  });
});

describe('delivery callbacks from the providers', () => {
  const send = async (
    channel: string,
    body: unknown,
    headers: Record<string, string> = {},
    signed = true,
  ) => {
    const text = JSON.stringify(body);
    return t.raw('POST', `/webhooks/notifications/${channel}`, {
      headers: {
        'content-type': 'application/json',
        ...(signed ? { 'x-hub-signature-256': sign(text) } : {}),
        ...headers,
      },
      body: text,
    });
  };
  const sentRow = async (providerMessageId: string) => {
    const person = await as('patient');
    return t.db.notification.create({
      data: {
        userId: person.user.id,
        channel: 'whatsapp',
        status: 'sent',
        provider: 'dev',
        providerMessageId,
        templateKey: 'test_event',
        sentAt: new Date(),
      },
    });
  };

  it('refuses a callback with no signature or a wrong one, and changes nothing', async () => {
    const row = await sentRow('dev-wa-sig');
    const body = {
      updates: [{ providerMessageId: 'dev-wa-sig', eventId: 'sig-1', status: 'delivered' }],
    };
    expect((await send('whatsapp', body, {}, false)).status).toBe(401);
    const text = JSON.stringify(body);
    expect(
      (
        await t.raw('POST', '/webhooks/notifications/whatsapp', {
          headers: {
            'content-type': 'application/json',
            'x-signature': sign(text, 'another-secret-value-123'),
          },
          body: text,
        })
      ).status,
    ).toBe(401);
    expect((await t.db.notification.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(
      'sent',
    );
  });

  it('applies a signed callback once, and ignores a repeat', async () => {
    const row = await sentRow('dev-wa-ok');
    const body = {
      updates: [{ providerMessageId: 'dev-wa-ok', eventId: 'ok-1', status: 'delivered' }],
    };
    expect((await send('whatsapp', body)).body).toEqual({ applied: 1, ignored: 0 });
    expect((await send('whatsapp', body)).body).toEqual({ applied: 0, ignored: 1 });
    expect((await t.db.notification.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(
      'delivered',
    );
    // The second header spelling works too.
    const text = JSON.stringify({
      updates: [{ providerMessageId: 'dev-wa-ok', eventId: 'ok-2', status: 'read' }],
    });
    const viaX = await t.raw('POST', '/webhooks/notifications/whatsapp', {
      headers: { 'content-type': 'application/json', 'x-signature': sign(text) },
      body: text,
    });
    expect(viaX.status).toBe(200);
    expect((await t.db.notification.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(
      'read',
    );
  });

  it('answers 200 with nothing applied for a body it cannot read, and 400 for an unknown channel', async () => {
    expect((await send('sms', { hello: 'world' })).body).toEqual({ applied: 0, ignored: 0 });
    expect((await send('pigeon', {})).status).toBe(400);
  });

  it('answers the WhatsApp subscription check only with the right token', async () => {
    const ok = await t.raw(
      'GET',
      `/webhooks/notifications/whatsapp?hub.mode=subscribe&hub.verify_token=${DEV_WEBHOOK_SECRET}&hub.challenge=12345`,
    );
    expect(ok.status).toBe(200);
    expect(ok.body).toBe(12345);
    expect(
      (
        await t.raw(
          'GET',
          '/webhooks/notifications/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1',
        )
      ).status,
    ).toBe(401);
    expect((await t.raw('GET', '/webhooks/notifications/whatsapp')).status).toBe(401);
  });
});
