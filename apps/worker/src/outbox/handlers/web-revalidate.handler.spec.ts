import type { OutboxEventRecord } from '@medtravel/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { revalidateWebsite } from './web-revalidate.handler.js';

const event = (payload: unknown) => ({ id: 'e1', type: 'web.revalidate', payload }) as unknown as OutboxEventRecord;
const target = { url: 'https://site.example/api/revalidate', secret: 'a-long-enough-secret' };

afterEach(() => vi.restoreAllMocks());

describe('revalidateWebsite', () => {
  it('posts the tags with the secret', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    expect(await revalidateWebsite(target, event({ tags: ['hospitals', 'hospital:apollo'] }))).toBe('sent');
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(target.url);
    expect((init?.headers as Record<string, string>)['x-revalidate-secret']).toBe(target.secret);
    expect(JSON.parse(init?.body as string)).toEqual({ tags: ['hospitals', 'hospital:apollo'] });
  });

  it('does nothing when the website is not configured', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    expect(await revalidateWebsite({ url: undefined, secret: undefined }, event({ tags: ['a'] }))).toBe('skipped');
    expect(await revalidateWebsite({ url: target.url, secret: undefined }, event({ tags: ['a'] }))).toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when the website fails, so the outbox tries again', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('no', { status: 503 }));
    await expect(revalidateWebsite(target, event({ tags: ['a'] }))).rejects.toThrow('503');
  });

  it('drops a refusal that retrying cannot change, instead of retrying it for ever', async () => {
    for (const status of [400, 403]) {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('no', { status }));
      expect(await revalidateWebsite(target, event({ tags: ['a'] }))).toBe('skipped');
    }
  });

  it('rejects a payload without tags', async () => {
    await expect(revalidateWebsite(target, event({ tags: [] }))).rejects.toThrow();
    await expect(revalidateWebsite(target, event({}))).rejects.toThrow();
  });
});
