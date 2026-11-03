import { describe, expect, it } from 'vitest';
import { QUEUE_NAMES } from '@medtravel/contracts';
import { FX_QUEUE } from './fx/fx.job.js';
import { NOTIFICATIONS_QUEUE } from './notifications/notifications.queue.js';
import { SLA_QUEUE } from './sla/sla.job.js';

describe('the queues the API watches', () => {
  it('are exactly the queues the worker runs', () => {
    expect([...QUEUE_NAMES].sort()).toEqual([FX_QUEUE, NOTIFICATIONS_QUEUE, SLA_QUEUE].sort());
  });
});
