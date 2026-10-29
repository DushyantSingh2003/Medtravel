import type { PrismaClient } from './client.ts';

/** An outbox row handed to a handler. `id` is the idempotency key: a handler that is run twice for it must change nothing the second time. */
export interface OutboxEventRecord {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  dedupeKey: string | null;
  attempts: number;
}

export type OutboxHandler = (event: OutboxEventRecord) => Promise<void>;

/** Handlers by event type. */
export type OutboxHandlers = Readonly<Record<string, OutboxHandler>>;

/** An event is given up on (status `failed`, for a person to look at) after this many tries. */
export const OUTBOX_MAX_ATTEMPTS = 6;
/** How long a claimed event stays locked to its worker; after that another worker may take it (the first one died). */
export const OUTBOX_VISIBILITY_TIMEOUT_MS = 120_000;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 15 * 60_000;

/** The wait before try number `attempts + 1`: 5 s, 10 s, 20 s ... up to 15 minutes. */
export function outboxBackoffMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), BACKOFF_MAX_MS);
}

/**
 * Takes up to `limit` events that are due, oldest first, and locks them to this worker for the visibility timeout. A single
 * statement with `FOR UPDATE SKIP LOCKED`, so several workers never take the same event. Events left in `processing` by a
 * worker that died become due again when their lock runs out.
 */
export async function claimOutboxBatch(
  prisma: PrismaClient,
  limit: number,
  now: Date = new Date(),
): Promise<OutboxEventRecord[]> {
  const lockedUntil = new Date(now.getTime() + OUTBOX_VISIBILITY_TIMEOUT_MS);
  return prisma.$queryRaw<OutboxEventRecord[]>`
    UPDATE "OutboxEvent"
    SET "status" = 'processing', "attempts" = "attempts" + 1, "availableAt" = ${lockedUntil}
    WHERE "id" IN (
      SELECT "id" FROM "OutboxEvent"
      WHERE "status" IN ('pending', 'processing') AND "availableAt" <= ${now}
      ORDER BY "createdAt", "id"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "type", "aggregateType", "aggregateId", "payload", "dedupeKey", "attempts"`;
}

export async function completeOutbox(
  prisma: PrismaClient,
  event: OutboxEventRecord,
): Promise<void> {
  await prisma.outboxEvent.updateMany({
    where: { id: event.id, status: 'processing', attempts: event.attempts },
    data: { status: 'processed', processedAt: new Date(), lastError: null },
  });
}

/** Puts the event back for a later try, or marks it `failed` once the tries are used up. Returns what happened. */
export async function failOutbox(
  prisma: PrismaClient,
  event: OutboxEventRecord,
  error: unknown,
  now: Date = new Date(),
): Promise<'retry' | 'failed'> {
  // Only the message, cut short: never the payload, which can hold personal data.
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
  const giveUp = event.attempts >= OUTBOX_MAX_ATTEMPTS;
  await prisma.outboxEvent.updateMany({
    where: { id: event.id, status: 'processing', attempts: event.attempts },
    data: giveUp
      ? { status: 'failed', lastError: message }
      : {
          status: 'pending',
          lastError: message,
          availableAt: new Date(now.getTime() + outboxBackoffMs(event.attempts)),
        },
  });
  return giveUp ? 'failed' : 'retry';
}

export interface OutboxRunResult {
  claimed: number;
  processed: number;
  retried: number;
  failed: number;
}

/**
 * One polling round: claim a batch, run each event's handler, record the outcome. An event with no handler is marked
 * processed so unrelated events never pile up. A handler that throws puts its event back for a later try.
 */
export async function processOutbox(
  prisma: PrismaClient,
  handlers: OutboxHandlers,
  options: {
    limit?: number;
    now?: Date;
    onError?: (event: OutboxEventRecord, error: unknown) => void;
  } = {},
): Promise<OutboxRunResult> {
  const batch = await claimOutboxBatch(prisma, options.limit ?? 20, options.now);
  const result: OutboxRunResult = { claimed: batch.length, processed: 0, retried: 0, failed: 0 };
  for (const event of batch) {
    try {
      await handlers[event.type]?.(event);
      await completeOutbox(prisma, event);
      result.processed += 1;
    } catch (error) {
      options.onError?.(event, error);
      const outcome = await failOutbox(prisma, event, error, options.now);
      if (outcome === 'failed') result.failed += 1;
      else result.retried += 1;
    }
  }
  return result;
}
