import { describe, expect, it } from 'vitest';
import type { OutboxEventRecord } from '@medtravel/db';
import { currentRequestId, flushSentry, initSentry } from '@medtravel/observability';
import { observed, requestIdOf } from './outbox-handlers.js';

const sent: Record<string, unknown>[] = [];
initSentry({
  dsn: 'https://publickey@sentry.example.test/1',
  service: 'worker',
  environment: 'test',
  transport: () => ({
    send: async (envelope) => {
      for (const [header, payload] of envelope[1] as [{ type?: string }, Record<string, unknown>][])
        if (header.type === 'event') sent.push(payload);
      return {};
    },
    flush: async () => true,
  }),
});

const event = (payload: Record<string, unknown>): OutboxEventRecord =>
  ({
    id: '11111111-1111-4111-8111-111111111111',
    type: 'test.event',
    payload,
  }) as unknown as OutboxEventRecord;

describe('jobs carry the request that queued them', () => {
  it('reads the ID the API recorded in the payload', () => {
    expect(requestIdOf(event({ requestId: 'api-trace-0001' }))).toBe('api-trace-0001');
    expect(requestIdOf(event({}))).toBeUndefined();
    expect(requestIdOf(event({ requestId: 42 }))).toBeUndefined();
  });

  it('runs the handler under that ID, falling back to the event id', async () => {
    const seen: (string | undefined)[] = [];
    const handlers = observed({ 'test.event': async () => void seen.push(currentRequestId()) });
    await handlers['test.event']?.(event({ requestId: 'api-trace-0001' }));
    await handlers['test.event']?.(event({}));
    expect(seen).toEqual(['api-trace-0001', '11111111-1111-4111-8111-111111111111']);
  });

  it('reports a failing handler to Sentry with the request ID and the job type, scrubbed, and still throws', async () => {
    sent.length = 0;
    const handlers = observed({
      'test.event': async () => {
        throw new Error('cannot email asha@example.com about passport N1234567');
      },
    });
    await expect(
      handlers['test.event']?.(event({ requestId: 'api-trace-0002', email: 'asha@example.com' })),
    ).rejects.toThrow('cannot email');
    await flushSentry();
    expect(sent).toHaveLength(1);
    const report = sent[0] as { tags: Record<string, string> };
    expect(report.tags['request_id']).toBe('api-trace-0002');
    expect(report.tags['job_type']).toBe('test.event');
    expect(report.tags['service']).toBe('worker');
    expect(JSON.stringify(report)).not.toMatch(/asha|N1234567/);
  });
});
