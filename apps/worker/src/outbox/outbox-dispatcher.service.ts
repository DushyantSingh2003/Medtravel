import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { processOutbox, type PrismaClient } from '@medtravel/db';
import { scrubMessage } from '@medtravel/observability';
import type { Providers } from '@medtravel/notifications';
import type { RealtimePublisher } from '@medtravel/realtime';
import type { ObjectStore } from '@medtravel/storage';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';
import { PRISMA } from '../database/database.module.js';
import { REALTIME_PUBLISHER } from '../realtime/realtime.module.js';
import { NOTIFICATION_PROVIDERS } from '../notifications/providers.module.js';
import { OBJECT_STORE } from '../storage/storage.module.js';
import { outboxHandlers } from './outbox-handlers.js';

const POLL_INTERVAL_MS = 2_000;
/** Small, because a batch is handled one event after another under one lock. */
const BATCH_SIZE = 10;
const MAX_ROUNDS_PER_TICK = 20;

/**
 * Polls the outbox table and runs the handlers. One round at a time per process; several workers can run side by side
 * because claiming uses `SKIP LOCKED`. Shutdown waits for the round in progress.
 */
@Injectable()
export class OutboxDispatcher implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> = Promise.resolve();
  private stopped = false;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore,
    @Inject(NOTIFICATION_PROVIDERS) private readonly providers: Providers,
    @Inject(REALTIME_PUBLISHER) private readonly publisher: Pick<RealtimePublisher, 'publish'>,
    @Inject(ENV) private readonly env: Pick<Env, 'CLAMAV_HOST' | 'CLAMAV_PORT'>,
  ) {}

  onApplicationBootstrap(): void {
    this.schedule();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }

  /** Runs one polling round now; the timer calls this, and tests can too. */
  async runOnce(): Promise<void> {
    // Keep going while batches come back full, so a backlog drains without waiting for the next tick.
    for (let round = 0; round < MAX_ROUNDS_PER_TICK; round += 1) {
      const claimed = await this.round();
      if (claimed < BATCH_SIZE) return;
    }
  }

  private async round(): Promise<number> {
    const result = await processOutbox(
      this.prisma,
      outboxHandlers({
        prisma: this.prisma,
        store: this.store,
        clamd: { host: this.env.CLAMAV_HOST, port: this.env.CLAMAV_PORT },
        providers: this.providers,
        publisher: this.publisher,
      }),
      {
        limit: BATCH_SIZE,
        onError: (event, error) =>
          // The event id and type only: payloads can hold personal data.
          this.logger.warn(
            `outbox ${event.type} ${event.id} failed (attempt ${event.attempts}): ${
              error instanceof Error ? scrubMessage(error.message) : 'unknown error'
            }`,
          ),
      },
    );
    if (result.processed + result.retried + result.failed > 0)
      this.logger.log(
        `outbox: ${result.processed} processed, ${result.retried} to retry, ${result.failed} failed`,
      );
    return result.claimed;
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.runOnce()
        .catch((error: unknown) =>
          this.logger.error(
            `outbox round failed: ${error instanceof Error ? error.message : error}`,
          ),
        )
        .finally(() => this.schedule());
    }, POLL_INTERVAL_MS);
  }
}
