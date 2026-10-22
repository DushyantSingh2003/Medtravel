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

/** What every generated call resolves to: the parsed body next to the status and headers. */
export interface ApiResponse {
  data: unknown;
  status: number;
  headers: Headers;
}

/** The body of a response, parsed as JSON; anything else (an HTML error page from a proxy) is kept as text. */
async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

const UNSAFE = (method: string | undefined): boolean =>
  !['GET', 'HEAD', 'OPTIONS'].includes((method ?? 'GET').toUpperCase());

/** The CSRF token the API put in a readable cookie; the API wants it back in a header on every change. */
function csrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return /(?:^|;\s*)mt_csrf=([^;]*)/.exec(document.cookie)?.[1];
}

/** Sign-in steps answer 401 for "wrong password or code", which is not a reason to try refreshing. */
const NO_REFRESH = ['/auth/refresh', '/auth/login', '/auth/2fa/challenge'];

let refreshing: Promise<boolean> | null = null;

/** Swaps the refresh cookie for new tokens. Callers that hit 401 at the same moment share one attempt. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(new URL('/auth/refresh', baseUrl()), {
    method: 'POST',
    credentials: 'include',
  })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * Single place every generated call goes through (orval's `mutator`), so cookies, the CSRF header, token refresh, errors
 * and the base URL are handled once. Sessions are httpOnly cookies, hence `credentials: 'include'`. An expired access token
 * (401) is refreshed once and the call repeated. Non-2xx answers throw an `ApiError` carrying the status and the body,
 * which is where forms read the field errors from.
 */
export async function apiFetcher<T extends ApiResponse>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const send = () => {
    const token = UNSAFE(init.method) ? csrfToken() : undefined;
    const headers = new Headers(init.headers);
    if (token) headers.set('x-csrf-token', token);
    return fetch(new URL(url, baseUrl()), { ...init, headers, credentials: 'include' });
  };
  let response = await send();
  if (
    response.status === 401 &&
    !NO_REFRESH.some((path) => url.startsWith(path)) &&
    (await refreshSession())
  ) {
    response = await send();
  }
  const data = await readBody(response);
  if (!response.ok) throw new ApiError(response.status, data);
  return { data, status: response.status, headers: response.headers } as T;
}
