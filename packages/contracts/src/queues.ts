/**
 * The BullMQ queues the worker runs. The API reads their sizes for `/metrics` and shows them in the queue board, so the names
 * live here; a worker test keeps them in step with the queues it registers.
 */
export const QUEUE_NAMES = ['fx', 'sla', 'notifications'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];
