import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { BullModule } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import type { PrismaClient } from '@medtravel/db';
import { createFxProvider, type FxProvider } from '@medtravel/fx';
import type { Queue } from 'bullmq';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';
import { PRISMA } from '../database/database.module.js';
import { FX_QUEUE, FX_SCHEDULER_ID, FX_TIME_ZONE, ratesAreStale, runFxRefresh } from './fx.job.js';

const FX_PROVIDER = Symbol('FX_PROVIDER');

/** Runs a refresh when the queue says it is time. */
@Processor(FX_QUEUE)
export class FxProcessor extends WorkerHost {
  private readonly logger = new Logger(FxProcessor.name);
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(FX_PROVIDER) private readonly provider: FxProvider,
  ) {
    super();
  }

  async process(): Promise<{ stored: number }> {
    const result = await runFxRefresh({ prisma: this.prisma, provider: this.provider });
    this.logger.log(
      `fx: ${result.stored} new rates for ${result.currencies} currencies (${this.provider.name})`,
    );
    return { stored: result.stored };
  }
}

/** Registers the daily schedule (06:00 India time) and catches up at start if the rates are more than a day old. */
@Injectable()
export class FxScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(FxScheduler.name);
  constructor(
    @InjectQueue(FX_QUEUE) private readonly queue: Queue,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Pick<Env, 'FX_REFRESH_CRON'>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        FX_SCHEDULER_ID,
        { pattern: this.env.FX_REFRESH_CRON, tz: FX_TIME_ZONE },
        {
          name: 'refresh',
          opts: {
            attempts: 5,
            backoff: { type: 'exponential', delay: 60_000 },
            removeOnComplete: 50,
            removeOnFail: 200,
          },
        },
      );
      if (await ratesAreStale(this.prisma))
        await this.queue.add(
          'refresh',
          {},
          { attempts: 5, backoff: { type: 'exponential', delay: 60_000 } },
        );
    } catch (error) {
      // Redis being down at start must not stop the worker; the outbox and other queues retry on their own.
      this.logger.warn(
        `could not schedule the exchange-rate refresh: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }
}

@Module({
  imports: [BullModule.registerQueue({ name: FX_QUEUE })],
  providers: [
    {
      provide: FX_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env): FxProvider =>
        createFxProvider({
          provider: env.FX_PROVIDER,
          ...(env.OPEN_EXCHANGE_RATES_APP_ID
            ? { openExchangeRatesAppId: env.OPEN_EXCHANGE_RATES_APP_ID }
            : {}),
        }),
    },
    FxProcessor,
    FxScheduler,
  ],
})
export class FxModule {}
