import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, type QueueName } from '@medtravel/contracts';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';

/** Read-only handles on the worker's queues, to count jobs for `/metrics` and to show in the queue board. */
@Injectable()
export class QueueRegistry implements OnApplicationShutdown {
  readonly queues: Queue[];

  constructor(@Inject(ENV) env: Env) {
    const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null };
    this.queues = QUEUE_NAMES.map((name) => new Queue(name, { connection }));
  }

  async counts(): Promise<{ queue: QueueName; state: string; count: number }[]> {
    const rows = await Promise.all(
      this.queues.map(async (queue) => {
        const counts = await queue.getJobCounts(
          'waiting',
          'active',
          'delayed',
          'failed',
          'completed',
        );
        return Object.entries(counts).map(([state, count]) => ({
          queue: queue.name as QueueName,
          state,
          count,
        }));
      }),
    );
    return rows.flat();
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.queues.map((queue) => queue.close()));
  }
}
