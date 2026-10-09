/**
 * Base URL of the API.
 *
 * Written as a literal `process.env.NEXT_PUBLIC_API_URL`: Next.js inlines public env vars
 * by matching that exact text at build time, so bracket access would leave the browser
 * bundle reading an undefined value.
 */
const baseUrl = (): string => process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API request failed with status ${status}`);
    this.name = 'ApiError';
  }
}

export interface FetcherOptions {
  url: string;
  method: string;
  params?: Record<string, string | number | boolean | undefined>;
  data?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

/**
 * Single place every generated hook goes through, so cookies, errors and the base URL are
 * handled once. Sessions are httpOnly cookies, hence `credentials: 'include'`.
 */
export async function apiFetcher<T>(options: FetcherOptions): Promise<T> {
  const url = new URL(options.url, baseUrl());
  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method: options.method.toUpperCase(),
    credentials: 'include',
    headers: {
      ...(options.data === undefined ? {} : { 'content-type': 'application/json' }),
      ...options.headers,
    },
    ...(options.data === undefined ? {} : { body: JSON.stringify(options.data) }),
    ...(options.signal ? { signal: options.signal } : {}),
  });

  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : undefined;

  if (!response.ok) throw new ApiError(response.status, body);
  return body as T;
}
