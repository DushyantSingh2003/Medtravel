/**
 * Removes personal data from what leaves the system in error reports. Browser-safe (no Node imports): the website and the portal
 * use it too. CLAUDE.md: never log PII, medical text, passport numbers or tokens.
 */
export const REDACTED = '[redacted]';

/** Keys whose value is never sent, whatever it holds. */
const SENSITIVE_KEY =
  /pass(word|phrase)?|secret|token|otp|cookie|authorization|csrf|api.?key|session|credential|passport|e.?mail|phone|mobile|whatsapp|birth|dob|address|diagnos|symptom|medical|prescription|allerg|notes?$|summary|comment|full.?name|^name$|patient|body|payload|iban|account.?number|card/i;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
/** Long opaque strings: tokens, JWTs, signed links, hashes. */
const OPAQUE =
  /\beyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*|\b(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{24,}(?:\.[A-Za-z0-9_-]{8,})*\b/g;
/** A run of seven or more digits, possibly spaced or dashed: phone and passport numbers, card numbers. */
const NUMBER_RUN = /(?:\+?\d[\s-]?){7,}/g;

/** A piece of free text with emails, tokens and long numbers taken out. */
export function scrubText(text: string): string {
  return text
    .replace(BEARER, `Bearer ${REDACTED}`)
    .replace(EMAIL, REDACTED)
    .replace(OPAQUE, REDACTED)
    .replace(NUMBER_RUN, REDACTED);
}

/** An address with its query string removed and one-time tokens in the path hidden. */
export function scrubUrl(url: string): string {
  const [path = ''] = url.split(/[?#]/);
  return scrubText(path.replace(/(\/auth\/invitations\/)[^/]+/, `$1${REDACTED}`));
}

/** A value and everything inside it, with sensitive keys hidden and strings scrubbed. */
/** An error message: the first line only (a database validation error lists the arguments after it), cut short, scrubbed. */
export function scrubMessage(message: string): string {
  return scrubText(message.split('\n')[0] ?? '').slice(0, MAX_MESSAGE);
}

export function scrubDeep(value: unknown, key = '', depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (key && SENSITIVE_KEY.test(key)) return REDACTED;
  if (typeof value === 'string') return scrubText(value);
  if (typeof value !== 'object') return value;
  if (depth > 6) return REDACTED;
  if (Array.isArray(value))
    return value.slice(0, 50).map((item) => scrubDeep(item, key, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      scrubDeep(v, k, depth + 1),
    ]),
  );
}

/** An incoming request ID kept only if it has the shape the API would accept; anything else could be any client string. */
const safeRequestId = (value: string): string =>
  /^[A-Za-z0-9._-]{8,64}$/.test(value) ? value : REDACTED;

/** Longest exception message sent: a validation error can quote a whole query with its values. */
const MAX_MESSAGE = 200;

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Loose) : undefined;

/**
 * Cleans a Sentry event before it is sent: no cookies, headers, request body or query string, the user reduced to an id, free text
 * scrubbed, and any extra data removed by key. The request ID tag is kept, because it is how a report is found in the logs.
 */
export function scrubEvent<T extends object>(event: T): T {
  const e = event as Loose;
  const request = asObject(e['request']);
  if (request) {
    delete request['cookies'];
    delete request['data'];
    delete request['query_string'];
    delete request['env'];
    if (typeof request['url'] === 'string') request['url'] = scrubUrl(request['url']);
    const headers = asObject(request['headers']);
    if (headers)
      request['headers'] = Object.fromEntries(
        Object.entries(headers)
          .filter(([k]) => /^(user-agent|content-type|accept|x-request-id)$/i.test(k))
          .map(([k, v]) => [
            k,
            // The request ID was validated when it came in; scrubbing would mangle it.
            typeof v === 'string'
              ? /^x-request-id$/i.test(k)
                ? safeRequestId(v)
                : scrubText(v)
              : v,
          ]),
      );
  }
  const user = asObject(e['user']);
  if (user) e['user'] = typeof user['id'] === 'string' ? { id: user['id'] } : undefined;
  if (typeof e['message'] === 'string') e['message'] = scrubMessage(e['message']);
  if (typeof e['transaction'] === 'string') e['transaction'] = scrubUrl(e['transaction']);
  const exception = asObject(e['exception']);
  const values = Array.isArray(exception?.['values']) ? (exception['values'] as Loose[]) : [];
  for (const v of values) {
    if (typeof v['value'] === 'string') v['value'] = scrubMessage(v['value']);
    const frames = asObject(v['stacktrace'])?.['frames'];
    if (Array.isArray(frames))
      for (const frame of frames as Loose[]) {
        // Local variables can hold anything.
        delete frame['vars'];
        delete frame['pre_context'];
        delete frame['context_line'];
        delete frame['post_context'];
      }
  }
  if (e['extra']) e['extra'] = scrubDeep(e['extra']);
  if (e['contexts']) e['contexts'] = scrubContexts(e['contexts']);
  if (Array.isArray(e['breadcrumbs']))
    e['breadcrumbs'] = (e['breadcrumbs'] as Loose[]).map(scrubBreadcrumb);
  return event;
}

const KEEP_CONTEXTS = new Set(['runtime', 'os', 'device', 'app', 'culture', 'trace', 'browser']);
function scrubContexts(contexts: unknown): unknown {
  const all = asObject(contexts) ?? {};
  return Object.fromEntries(
    Object.entries(all).map(([k, v]) => [k, KEEP_CONTEXTS.has(k) ? v : scrubDeep(v, k)]),
  );
}

/** Breadcrumbs keep what happened (category, level, a scrubbed message) and lose their data. */
export function scrubBreadcrumb<T extends object>(breadcrumb: T): T {
  const b = breadcrumb as Loose;
  // What the page printed to the console or which element was clicked can name a person; keep only that it happened.
  if (typeof b['category'] === 'string' && /^(console|ui\.)/.test(b['category']))
    delete b['message'];
  else if (typeof b['message'] === 'string') b['message'] = scrubText(b['message']);
  const data = asObject(b['data']);
  if (data) {
    const url = typeof data['url'] === 'string' ? scrubUrl(data['url']) : undefined;
    b['data'] = {
      ...(url ? { url } : {}),
      ...(typeof data['method'] === 'string' ? { method: data['method'] } : {}),
      ...(typeof data['status_code'] === 'number' ? { status_code: data['status_code'] } : {}),
    };
  }
  return breadcrumb;
}
