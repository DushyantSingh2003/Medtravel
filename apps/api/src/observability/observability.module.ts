import { Inject, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { APP_FILTER, HttpAdapterHost } from '@nestjs/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ACCESS_COOKIE, readCookie } from '../auth/cookies.js';
import { secondFactorOwed } from '../auth/auth.guard.js';
import { SessionService } from '../auth/session.service.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';
import { slowQueryListeners } from '../database/database.module.js';
import { MetricsController } from './metrics.controller.js';
import { MetricsService } from './metrics.service.js';
import { QueueRegistry } from './queues.js';
import { registerQueueBoard } from './queue-board.js';
import { ReadinessController } from './readiness.controller.js';
import { registerRequestIdHook } from './request-id.hook.js';
import { SentryExceptionFilter } from './sentry.filter.js';

/** Request IDs, error reports, metrics, the readiness probe and the queue board. */
@Module({
  controllers: [MetricsController, ReadinessController],
  providers: [
    QueueRegistry,
    MetricsService,
    { provide: APP_FILTER, useClass: SentryExceptionFilter },
  ],
})
export class ObservabilityModule implements OnApplicationBootstrap {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly metrics: MetricsService,
    private readonly queues: QueueRegistry,
    private readonly sessions: SessionService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const fastify = this.adapterHost.httpAdapter.getInstance() as FastifyInstance;
    registerRequestIdHook(fastify);
    fastify.addHook('onResponse', (request, reply, done) => {
      // The route pattern, never the address: "/cases/:id", so ids do not become labels.
      this.metrics.observeRequest(
        request.method,
        request.routeOptions?.url ?? 'unmatched',
        reply.statusCode,
        reply.elapsedTime / 1000,
      );
      done();
    });
    slowQueryListeners.add(() => this.metrics.countSlowQuery());
    await registerQueueBoard(fastify, this.queues.queues, (request) => this.mayOpenBoard(request));
  }

  private async mayOpenBoard(request: FastifyRequest): Promise<boolean> {
    const bearer = /^Bearer (\S+)$/i.exec(request.headers.authorization ?? '')?.[1];
    const token = bearer ?? readCookie(request.headers.cookie, ACCESS_COOKIE);
    const auth = token ? await this.sessions.authenticate(token) : null;
    return (
      auth !== null &&
      auth.user.role === 'super_admin' &&
      auth.actor.scopeCaseId === null &&
      !secondFactorOwed(auth, this.env)
    );
  }
}
