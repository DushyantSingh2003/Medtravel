import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetcher } from './fetcher';

const respond = (body: string | null, status = 200) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('apiFetcher', () => {
  it('resolves to the parsed body with the status and headers', async () => {
    respond('{"items":[1]}');
    const result = await apiFetcher('/masters/countries');
    expect(result).toMatchObject({ data: { items: [1] }, status: 200 });
    expect(result.headers).toBeInstanceOf(Headers);
  });

  it('sends cookies, and resolves the path against the API address', async () => {
    const spy = respond('{}');
    await apiFetcher('/masters/countries?limit=5', { method: 'GET' });
    const [url, init] = spy.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://localhost:3001/masters/countries?limit=5');
    expect(init).toMatchObject({ method: 'GET', credentials: 'include' });
  });

  it('resolves to undefined data for an empty body', async () => {
    respond(null, 204);
    expect((await apiFetcher('/x')).data).toBeUndefined();
  });

  it('throws an ApiError with the status and body for a failed request', async () => {
    respond('{"message":"Validation failed","errors":[{"path":["slug"],"message":"taken"}]}', 409);
    const error = await apiFetcher('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, body: { errors: [{ path: ['slug'] }] } });
  });

  it('keeps a non-JSON error body as text instead of failing to parse it', async () => {
    respond('<html>Bad gateway</html>', 502);
    await expect(apiFetcher('/x')).rejects.toMatchObject({
      status: 502,
      body: '<html>Bad gateway</html>',
    });
  });

  describe('an expired access token', () => {
    const answers = (...responses: Response[]) => {
      const spy = vi.spyOn(globalThis, 'fetch');
      for (const response of responses) spy.mockResolvedValueOnce(response);
      return spy;
    };

    it('is refreshed once and the call repeated', async () => {
      const spy = answers(
        new Response('{}', { status: 401 }),
        new Response('{}', { status: 200 }),
        new Response('{"ok":true}', { status: 200 }),
      );
      const result = await apiFetcher('/masters/countries');
      expect(result.data).toEqual({ ok: true });
      expect(spy.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
        '/masters/countries',
        '/auth/refresh',
        '/masters/countries',
      ]);
    });

    it('is shared by calls that fail at the same moment', async () => {
      const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const path = new URL(String(input)).pathname;
        if (path === '/auth/refresh') return new Response('{}', { status: 200 });
        const refreshed = spy.mock.calls.some(
          ([url]) => new URL(String(url)).pathname === '/auth/refresh',
        );
        return new Response('{}', { status: refreshed ? 200 : 401 });
      });
      await Promise.all([apiFetcher('/a'), apiFetcher('/b'), apiFetcher('/c')]);
      expect(
        spy.mock.calls.filter(([url]) => new URL(String(url)).pathname === '/auth/refresh'),
      ).toHaveLength(1);
    });

    it('is reported as 401 when the refresh fails too', async () => {
      answers(new Response('{}', { status: 401 }), new Response('{}', { status: 401 }));
      await expect(apiFetcher('/masters/countries')).rejects.toMatchObject({ status: 401 });
    });

    it('is not retried for a wrong password', async () => {
      const spy = answers(new Response('{"message":"Incorrect"}', { status: 401 }));
      await expect(apiFetcher('/auth/login', { method: 'POST' })).rejects.toMatchObject({
        status: 401,
      });
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  it('sends the CSRF cookie back in a header on changes, but not on reads', async () => {
    vi.stubGlobal('document', { cookie: 'a=b; mt_csrf=abc123; c=d' });
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}'));
    await apiFetcher('/masters/treatments', { method: 'POST' });
    await apiFetcher('/masters/treatments', { method: 'GET' });
    const [post, get] = spy.mock.calls.map(([, init]) => new Headers(init?.headers));
    expect(post?.get('x-csrf-token')).toBe('abc123');
    expect(get?.get('x-csrf-token')).toBeNull();
    vi.unstubAllGlobals();
  });
});
