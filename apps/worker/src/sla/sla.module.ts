import { BullModule, InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import type { PrismaClient } from '@medtravel/db';
import type { Queue } from 'bullmq';
import { PRISMA } from '../database/database.module.js';
import { SLA_QUEUE, SLA_SCHEDULER_ID, SLA_SWEEP_EVERY_MS, sweepOverdueCases } from './sla.job.js';

/** Runs one sweep when the queue says it is time. */
@Processor(SLA_QUEUE)
export class SlaProcessor extends WorkerHost {
  private readonly logger = new Logger(SlaProcessor.name);
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {
    super();
  }

  async process(): Promise<{ breached: number }> {
    const result = await sweepOverdueCases(this.prisma);
    if (result.breached > 0)
      this.logger.log(`sla: ${result.breached} cases past their stage target`);
    return result;
  }
}

/** Registers the every-minute sweep once, however many workers start. */
@Injectable()
export class SlaScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(SlaScheduler.name);
  constructor(@InjectQueue(SLA_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        SLA_SCHEDULER_ID,
        { every: SLA_SWEEP_EVERY_MS },
        { name: 'sweep', opts: { removeOnComplete: 20, removeOnFail: 100 } },
      );
    } catch (error) {
      this.logger.warn(
        `could not schedule the SLA sweep: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }
}

@Module({
  imports: [BullModule.registerQueue({ name: SLA_QUEUE })],
  providers: [SlaProcessor, SlaScheduler],
})
export class SlaModule {}
