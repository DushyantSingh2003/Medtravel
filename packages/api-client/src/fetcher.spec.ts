import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetcher } from './fetcher';

const respond = (body: string | null, status = 200) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status }));

afterEach(() => vi.restoreAllMocks());

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
});
