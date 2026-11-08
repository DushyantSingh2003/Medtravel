import type { OutboxEventRecord } from '@medtravel/db';
import { Logger } from '@nestjs/common';
import { z } from 'zod';

export interface RevalidateTarget {
  url: string | undefined;
  secret: string | undefined;
}

const payloadSchema = z.object({ tags: z.array(z.string().min(1).max(120)).min(1).max(20) });
const logger = new Logger('WebRevalidate');

/**
 * Tells the public website that some pages changed (a hospital, doctor or package was published, unpublished or repriced).
 * With no URL or secret configured (development) it does nothing. A failed call throws, so the outbox retries it: a page that
 * stays stale is worse than a repeated refresh, which is harmless.
 */
export async function revalidateWebsite(
  target: RevalidateTarget,
  event: OutboxEventRecord,
): Promise<'sent' | 'skipped'> {
  const { tags } = payloadSchema.parse(event.payload);
  if (!target.url || !target.secret) {
    logger.log(`website refresh skipped (not configured): ${tags.length} tags`);
    return 'skipped';
  }
  const response = await fetch(target.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-revalidate-secret': target.secret },
    body: JSON.stringify({ tags }),
    signal: AbortSignal.timeout(10_000),
  });
  // A refusal that retrying cannot change (a bad request or secret) is logged and dropped; anything else is retried.
  if (response.status === 400 || response.status === 403) {
    logger.error(`website refresh refused with ${response.status}: check the tags and REVALIDATE_SECRET`);
    return 'skipped';
  }
  if (!response.ok) throw new Error(`The website answered ${response.status} to a refresh`);
  return 'sent';
}
