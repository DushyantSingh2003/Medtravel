import { Injectable } from '@nestjs/common';
import type { Prisma } from '@medtravel/db';
import type { Db } from '../database/database.module.js';

export interface DomainEvent {
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.InputJsonValue;
  /** A second event with the same key is a duplicate and is refused by the database. */
  dedupeKey?: string;
}

/**
 * Writes a domain event to the outbox, in the same transaction as the change that caused it. The worker (F-05)
 * reads the table and runs the handlers (notifications, search refresh, SLA timers).
 */
@Injectable()
export class OutboxService {
  async publish(db: Db, event: DomainEvent): Promise<void> {
    await db.outboxEvent.create({
      data: {
        type: event.type,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.payload,
        ...(event.dedupeKey ? { dedupeKey: event.dedupeKey } : {}),
      },
    });
  }
}
