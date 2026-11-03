import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Letters, digits and a few separators, 8 to 64 long: anything else in an incoming header is not trusted as an ID. */
const VALID = /^[A-Za-z0-9._-]{8,64}$/;

export const newRequestId = (): string => randomUUID();

/** The caller's request ID if it looks like one, so a trace can span services; otherwise a new one. */
export function acceptRequestId(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  return value && VALID.test(value) ? value : newRequestId();
}

interface Store {
  requestId: string;
}
const storage = new AsyncLocalStorage<Store>();

/** Runs `run` with `requestId` available to everything it calls, including code that has no access to the request. */
export const runWithRequestId = <T>(requestId: string, run: () => T): T =>
  storage.run({ requestId }, run);

export const currentRequestId = (): string | undefined => storage.getStore()?.requestId;

/** For the rest of this request's asynchronous work (a server hook that cannot wrap the handler in a callback). */
export const enterRequestId = (requestId: string): void => storage.enterWith({ requestId });
