import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@medtravel/db';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { PRISMA } from '../database/database.module.js';
import { QueueRegistry } from './queues.js';

/** Prometheus metrics in the text format: request latency, queue sizes, failed jobs, outbox backlog, slow queries. */
@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  private readonly latency: Histogram<'method' | 'route' | 'status'>;
  private readonly slowQueries: Counter;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly queues: QueueRegistry,
  ) {
    collectDefaultMetrics({ register: this.registry });
    this.latency = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Time to answer a request, by method, route pattern and status class',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });
    this.slowQueries = new Counter({
      name: 'db_slow_queries_total',
      help: 'Queries that took longer than the slow-query threshold',
      registers: [this.registry],
    });
    const registry = this.registry;
    // Read when scraped, so the numbers are never stale and nothing runs between scrapes.
    new Gauge({
      name: 'queue_jobs',
      help: 'Jobs per queue and state; "failed" is the jobs that gave up',
      labelNames: ['queue', 'state'],
      registers: [registry],
      collect: async () => {
        const gauge = registry.getSingleMetric('queue_jobs') as Gauge<'queue' | 'state'>;
        gauge.reset();
        for (const { queue, state, count } of await this.queues.counts())
          gauge.set({ queue, state }, count);
      },
    });
    new Gauge({
      name: 'outbox_events',
      help: 'Domain events by status; a growing "pending" or any "failed" means the worker is behind',
      labelNames: ['status'],
      registers: [registry],
      collect: async () => {
        const gauge = registry.getSingleMetric('outbox_events') as Gauge<'status'>;
        gauge.reset();
        const rows = await this.prisma.outboxEvent.groupBy({
          by: ['status'],
          where: { status: { in: ['pending', 'processing', 'failed'] } },
          _count: { _all: true },
        });
        for (const status of ['pending', 'processing', 'failed']) gauge.set({ status }, 0);
        for (const row of rows) gauge.set({ status: row.status }, row._count._all);
      },
    });
  }

  observeRequest(method: string, route: string, statusCode: number, seconds: number): void {
    this.latency.observe({ method, route, status: `${Math.floor(statusCode / 100)}xx` }, seconds);
  }

  countSlowQuery(): void {
    this.slowQueries.inc();
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
