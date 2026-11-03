import { Controller, Get, Header, Inject, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { Req } from '@nestjs/common';
import { Public } from '../auth/decorators.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';
import { MetricsService } from './metrics.service.js';

/** `GET /metrics` for the monitoring system. Needs the bearer token when one is set (always, in production). */
@ApiExcludeController()
@Public()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async scrape(@Req() request: FastifyRequest): Promise<string> {
    const expected = this.env.METRICS_TOKEN;
    if (expected) {
      const given = /^Bearer (\S+)$/i.exec(request.headers.authorization ?? '')?.[1] ?? '';
      const a = Buffer.from(given);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
    }
    return this.metrics.render();
  }
}
