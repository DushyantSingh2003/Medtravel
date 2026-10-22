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

/**
 * Single place every generated call goes through (orval's `mutator`), so cookies, errors and the base URL are
 * handled once. Sessions are httpOnly cookies, hence `credentials: 'include'`. Non-2xx answers throw an
 * `ApiError` carrying the status and the body, which is where forms read the field errors from.
 */
export async function apiFetcher<T extends ApiResponse>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(new URL(url, baseUrl()), { ...init, credentials: 'include' });
  const data = await readBody(response);
  if (!response.ok) throw new ApiError(response.status, data);
  return { data, status: response.status, headers: response.headers } as T;
}
