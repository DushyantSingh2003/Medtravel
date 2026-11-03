import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import type { Queue } from 'bullmq';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export const QUEUE_BOARD_PATH = '/admin/queues';

/**
 * The queue board (Bull Board) at `/admin/queues`: jobs per queue and state, failures with their reasons. Read-only, so a stolen
 * page cannot retry or delete anything. `allow` decides who gets in; everyone else is turned away before the board is reached.
 */
export async function registerQueueBoard(
  fastify: FastifyInstance,
  queues: Queue[],
  allow: (request: FastifyRequest) => Promise<boolean>,
): Promise<void> {
  const serverAdapter = new FastifyAdapter();
  serverAdapter.setBasePath(QUEUE_BOARD_PATH);
  createBullBoard({
    queues: queues.map((queue) => new BullMQAdapter(queue, { readOnlyMode: true })),
    serverAdapter,
  });
  await fastify.register(async (scope) => {
    scope.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
      if (!(await allow(request))) {
        return reply
          .status(403)
          .send({ statusCode: 403, message: 'The queue board is for the super admin' });
      }
      return undefined;
    });
    await scope.register(serverAdapter.registerPlugin(), { prefix: QUEUE_BOARD_PATH });
  }, {});
}
