import { PermanentDeliveryError } from './types.js';

export type Fetch = typeof fetch;

/** Reads a provider's answer: a 4xx (except "too many requests") is final, anything else is worth retrying. */
export async function readJson(response: Response, what: string): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    const permanent = response.status >= 400 && response.status < 500 && response.status !== 429;
    // The body can echo the number or the text, so only the status goes into the error.
    const error = `${what} answered ${response.status}`;
    throw permanent ? new PermanentDeliveryError(error) : new Error(error);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${what} sent an answer that is not JSON`);
  }
}
