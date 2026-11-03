import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  Res,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { Redis } from 'ioredis';
import type { PrismaClient } from '@medtravel/db';
import type { ObjectStore } from '@medtravel/storage';
import { Public, Throttle } from '../auth/decorators.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';
import { PRISMA } from '../database/database.module.js';
import { OBJECT_STORE } from '../storage/storage.module.js';

interface Check {
  ok: boolean;
  ms: number;
}

const TIMEOUT_MS = 2000;
const CACHE_MS = 3000;

interface Result {
  status: 'ok' | 'unavailable';
  checks: { database: Check; redis: Check; storage: Check };
}

async function timed(run: () => Promise<unknown>): Promise<Check> {
  const started = Date.now();
  try {
    await Promise.race([
      run(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
    ]);
    return { ok: true, ms: Date.now() - started };
  } catch {
    // Why it failed goes to the logs of the caller's choosing, not to a public probe.
    return { ok: false, ms: Date.now() - started };
  }
}

/**
 * Readiness probe: can this instance do its work? Checks the database, Redis and the file bucket, each with a short timeout.
 * 503 when any fails, so the load balancer stops sending traffic. `/health` stays a plain liveness check.
 */
@ApiTags('health')
@Public()
@Controller('health')
export class ReadinessController implements OnApplicationShutdown {
  /** One connection for all probes, and the last answer kept for a few seconds, so a flood of probes costs one check. */
  private redis: Redis | null = null;
  private cached: { at: number; body: Promise<Result> } | null = null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('ready')
  @Throttle({ limit: 60, windowSeconds: 60 })
  @ApiOperation({
    operationId: 'getReadiness',
    summary: 'Readiness probe: database, Redis and file storage',
  })
  async ready(@Res({ passthrough: true }) reply: FastifyReply): Promise<Result> {
    if (!this.cached || Date.now() - this.cached.at > CACHE_MS) {
      // The pending check itself is kept, so probes arriving together share one.
      this.cached = { at: Date.now(), body: this.check() };
    }
    const body = await this.cached.body;
    if (body.status !== 'ok') reply.status(HttpStatus.SERVICE_UNAVAILABLE);
    return body;
  }

  private async check(): Promise<Result> {
    this.redis ??= new Redis(this.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      connectTimeout: TIMEOUT_MS,
    });
    const redis = this.redis;
    const [database, cache, storage] = await Promise.all([
      timed(() => this.prisma.$queryRaw`SELECT 1`),
      timed(async () => {
        if (redis.status === 'wait' || redis.status === 'end') await redis.connect();
        await redis.ping();
      }),
      timed(() => this.store.head('health/probe')),
    ]);
    const ok = database.ok && cache.ok && storage.ok;
    return { status: ok ? 'ok' : 'unavailable', checks: { database, redis: cache, storage } };
  }

  onApplicationShutdown(): void {
    this.redis?.disconnect();
  }
}
