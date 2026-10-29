import { z } from 'zod';

/** Rooms a connection can be in. A person is always in their own; case and hospital rooms need a permission check. */
export const roomOf = {
  user: (id: string) => `user:${id}`,
  case: (id: string) => `case:${id}`,
  hospital: (id: string) => `hospital:${id}`,
} as const;

export const ROOM_KINDS = ['case', 'hospital'] as const;
export type RoomKind = (typeof ROOM_KINDS)[number];

/** A room a client may ask to join (never `user:`: that one is automatic). */
export const joinRequestSchema = z.object({ kind: z.enum(ROOM_KINDS), id: z.uuid() }).strict();
export type JoinRequest = z.infer<typeof joinRequestSchema>;

export const joinResultSchema = z.object({ ok: z.boolean() });
export type JoinResult = z.infer<typeof joinResultSchema>;

/**
 * What the server pushes. Payloads carry ids and the time of the event, never its content: the client refetches through the
 * normal API, which applies the person's permissions again.
 */
export const REALTIME_EVENTS = [
  'notification.created',
  'case.updated',
  'message.created',
  'task.assigned',
  'typing',
] as const;
export type RealtimeEventName = (typeof REALTIME_EVENTS)[number];

const caseRef = z.object({ caseId: z.uuid() });
export const realtimePayloadSchemas = {
  'notification.created': z.object({ notificationId: z.uuid() }),
  'case.updated': caseRef.extend({ fields: z.array(z.string().max(60)).max(30).optional() }),
  'message.created': caseRef.extend({ messageId: z.uuid() }),
  'task.assigned': z.object({ taskId: z.uuid(), caseId: z.uuid().optional() }),
  typing: caseRef.extend({ userId: z.uuid(), typing: z.boolean() }),
} as const satisfies Record<RealtimeEventName, z.ZodTypeAny>;

export type RealtimePayload<E extends RealtimeEventName> = z.infer<
  (typeof realtimePayloadSchemas)[E]
>;

/** What a client receives: the event with its id (unique, for de-duplication), room and server time. */
export const realtimeMessageSchema = z.object({
  id: z.string().min(1).max(64),
  room: z.string().max(80),
  event: z.enum(REALTIME_EVENTS),
  at: z.iso.datetime(),
  payload: z.record(z.string(), z.unknown()),
});
export type RealtimeMessage = z.infer<typeof realtimeMessageSchema>;

/** The client's `typing` message (sent to the case room, not back to the sender). */
export const typingRequestSchema = z.object({ caseId: z.uuid(), typing: z.boolean() }).strict();
export type TypingRequest = z.infer<typeof typingRequestSchema>;

/** After a reconnect: replay what happened in my rooms since this server time. */
export const syncRequestSchema = z.object({ since: z.iso.datetime() }).strict();
export type SyncRequest = z.infer<typeof syncRequestSchema>;

/** The events the log keeps for catch-up, and for how long. */
export const REALTIME_LOG_SIZE = 200;
export const REALTIME_LOG_SECONDS = 3600;
export const REALTIME_PATH = '/realtime';
