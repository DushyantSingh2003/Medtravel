import { Body, Controller, Module, Post } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { flushSentry, initSentry } from '@medtravel/observability';
import type { ObjectStore } from '@medtravel/storage';
import { Public } from '../src/auth/decorators.js';
import { OBJECT_STORE } from '../src/storage/storage.module.js';
import { createTestApp, type TestApp } from './support/test-app.js';

/** Request IDs, error reports, metrics, readiness and the queue board, against the real application. */

@Public()
@Controller('test-boom')
class BoomController {
  @Post()
  boom(@Body() body: { email?: string }): never {
    throw new Error(`Could not process ${body.email ?? 'unknown'} with passport N1234567`);
  }
}
@Module({ controllers: [BoomController] })
class BoomModule {}

const METRICS_TOKEN = 'metrics-token-for-the-test-1234';
let t: TestApp;
/** Every Sentry envelope the app tried to send. */
const sent: { headers: unknown; items: [unknown, Record<string, unknown>][] }[] = [];

beforeAll(async () => {
  initSentry({
    dsn: 'https://publickey@sentry.example.test/1',
    service: 'api',
    environment: 'test',
    release: 'test-release',
    transport: () => ({
      send: async (envelope) => {
        sent.push({ headers: envelope[0], items: envelope[1] as never });
        return {};
      },
      flush: async () => true,
    }),
  });
  t = await createTestApp({ imports: [BoomModule], env: { METRICS_TOKEN } });
});

afterAll(async () => {
  await t.close();
});

const eventsSent = () =>
  sent.flatMap((envelope) =>
    envelope.items
      .filter(([header]) => (header as { type?: string }).type === 'event')
      .map(([, payload]) => payload),
  );

describe('request ids', () => {
  it('puts an ID on every response, generating one when the caller sent none', async () => {
    const res = await t.raw('GET', '/health');
    expect(String(res.headers['x-request-id'])).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps a well-formed ID from the caller so a trace can span services, and replaces a bad one', async () => {
    const good = await t.raw('GET', '/health', { headers: { 'x-request-id': 'edge-trace-0001' } });
    expect(good.headers['x-request-id']).toBe('edge-trace-0001');
    const bad = await t.raw('GET', '/health', {
      headers: { 'x-request-id': '<script>alert(1)</script>' },
    });
    expect(String(bad.headers['x-request-id'])).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('puts the caller’s ID on an error response too', async () => {
    const res = await t.raw('POST', '/test-boom', {
      headers: { 'x-request-id': 'audit-trace-001' },
      body: {},
    });
    expect(res.status).toBe(500);
    expect(res.headers['x-request-id']).toBe('audit-trace-001');
    await flushSentry();
  });
});

describe('jobs', () => {
  it('records the request ID in the events a request queues, for the worker to pick up', async () => {
    const admin = await t.makeUser({ email: 'trace-admin@test.example', role: 'super_admin' });
    const { accessToken } = await t.tokenFor(admin.id);
    const res = await t.raw('POST', '/cases', {
      headers: { authorization: `Bearer ${accessToken}`, 'x-request-id': 'queued-trace-01' },
      body: { patient: { fullName: 'Trace Check' } },
    });
    expect(res.status).toBe(201);
    const event = await t.db.outboxEvent.findFirstOrThrow({
      where: { type: 'case.created' },
      orderBy: { createdAt: 'desc' },
    });
    expect(event.payload).toMatchObject({ requestId: 'queued-trace-01' });
  });
});

describe('error reports', () => {
  it('sends a thrown error to Sentry with the request ID and no personal data', async () => {
    sent.length = 0;
    const res = await t.raw(
      'POST',
      '/test-boom?token=one-time-secret-token-value&email=asha@example.com',
      {
        headers: {
          'x-request-id': 'sentry-trace-001',
          cookie: 'mt_at=session-secret-value',
          authorization: 'Bearer abcdefghijklmnopqrstuvwxyz0123456789',
        },
        body: {
          email: 'asha.verma@example.com',
          passportNumber: 'N1234567',
          diagnosis: 'breast cancer stage II',
        },
      },
    );
    expect(res.status).toBe(500);
    // The caller sees a plain error, not the message.
    expect(JSON.stringify(res.body)).not.toMatch(/passport|asha/i);
    await flushSentry();

    const events = eventsSent();
    expect(events).toHaveLength(1);
    const event = events[0] as {
      tags?: Record<string, string>;
      release?: string;
      environment?: string;
    };
    expect(event.tags?.['request_id']).toBe('sentry-trace-001');
    expect(event.tags?.['route']).toBe('/test-boom');
    expect(event.tags?.['service']).toBe('api');
    expect(event.release).toBe('test-release');
    expect(event.environment).toBe('test');

    const text = JSON.stringify(events[0]);
    for (const secret of [
      'asha',
      'N1234567',
      'breast cancer',
      'session-secret-value',
      'abcdefghijklmnopqrstuvwxyz',
      'one-time-secret',
      'mt_at',
    ])
      expect(text, secret).not.toContain(secret);
    // The error itself is still there, so it can be debugged.
    expect(text).toContain('Could not process');
  });

  it('does not report the errors callers cause (4xx)', async () => {
    sent.length = 0;
    expect((await t.call(null, 'GET', '/cases')).status).toBe(401);
    expect((await t.call('super_admin', 'GET', '/cases?limit=1000')).status).toBe(400);
    expect(
      (await t.call('super_admin', 'GET', '/cases/00000000-0000-4000-8000-000000000000')).status,
    ).toBe(404);
    await flushSentry();
    expect(eventsSent()).toHaveLength(0);
  });
});

describe('GET /metrics', () => {
  it('needs the bearer token', async () => {
    expect((await t.raw('GET', '/metrics')).status).toBe(401);
    expect(
      (
        await t.raw('GET', '/metrics', {
          headers: { authorization: 'Bearer wrong-token-value-123456' },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await t.raw('GET', '/metrics', {
          headers: { authorization: `Bearer ${METRICS_TOKEN}`.slice(0, -1) },
        })
      ).status,
    ).toBe(401);
  });

  it('reports request latency by route pattern, queue sizes and the outbox backlog', async () => {
    await t.call('super_admin', 'GET', '/cases/00000000-0000-4000-8000-000000000001');
    await t.call('super_admin', 'GET', '/cases/00000000-0000-4000-8000-000000000002');
    const res = await t.raw('GET', '/metrics', {
      headers: { authorization: `Bearer ${METRICS_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const text = String(res.body);
    expect(text).toMatch(
      /http_request_duration_seconds_bucket\{[^}]*route="\/cases\/:id"[^}]*status="4xx"/,
    );
    // Ids never become labels.
    expect(text).not.toContain('00000000-0000-4000-8000-000000000001');
    for (const queue of ['fx', 'sla', 'notifications'])
      expect(text).toContain(`queue_jobs{queue="${queue}",state="failed"}`);
    expect(text).toMatch(/outbox_events\{status="pending"\} \d+/);
    expect(text).toContain('process_cpu_user_seconds_total');
  });
});

describe('GET /health/ready', () => {
  it('is ok when the database, Redis and the bucket answer', async () => {
    const res = await t.raw('GET', '/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      checks: { database: { ok: true }, redis: { ok: true }, storage: { ok: true } },
    });
  });

  it('answers 503 without saying why when something is down', async () => {
    const store = t.app.get<ObjectStore>(OBJECT_STORE);
    const spy = vi
      .spyOn(store, 'head')
      .mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:9000'));
    const res = await t.raw('GET', '/health/ready');
    spy.mockRestore();
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      status: 'unavailable',
      checks: { database: { ok: true }, storage: { ok: false } },
    });
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
  });

  it('keeps the plain liveness probe independent of the dependencies', async () => {
    expect((await t.raw('GET', '/health')).status).toBe(200);
  });
});

describe('the queue board at /admin/queues', () => {
  it('is for the super admin only', async () => {
    expect((await t.raw('GET', '/admin/queues')).status).toBe(403);
    for (const role of ['patient', 'case_manager', 'finance'] as const) {
      const user = await t.makeUser({ email: `${role}-board@test.example`, role });
      const { accessToken } = await t.tokenFor(user.id);
      expect(
        (
          await t.raw('GET', '/admin/queues', {
            headers: { authorization: `Bearer ${accessToken}` },
          })
        ).status,
        role,
      ).toBe(403);
    }
  });

  it('shows the three queues to the super admin, read-only', async () => {
    const admin = await t.makeUser({ email: 'board-admin@test.example', role: 'super_admin' });
    const { accessToken } = await t.tokenFor(admin.id);
    const headers = { authorization: `Bearer ${accessToken}` };
    const page = await t.raw('GET', '/admin/queues', { headers });
    expect(page.status).toBe(200);
    const api = await t.raw('GET', '/admin/queues/api/queues', { headers });
    expect(api.status).toBe(200);
    const names = (api.body as { queues: { name: string; readOnlyMode?: boolean }[] }).queues;
    expect(names.map((q) => q.name).sort()).toEqual(['fx', 'notifications', 'sla']);
    expect(names.every((q) => q.readOnlyMode)).toBe(true);
  });

  it('is not reachable with a session that still owes its second factor', async () => {
    const admin = await t.makeUser({ email: 'board-2fa@test.example', role: 'super_admin' });
    await t.db.user.update({ where: { id: admin.id }, data: { twoFactorEnabled: true } });
    const { accessToken } = await t.tokenFor(admin.id, { twoFactorVerified: false });
    expect(
      (await t.raw('GET', '/admin/queues', { headers: { authorization: `Bearer ${accessToken}` } }))
        .status,
    ).toBe(403);
  });
});
