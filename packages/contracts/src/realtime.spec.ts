import { describe, expect, it } from 'vitest';
import {
  REALTIME_EVENTS,
  joinRequestSchema,
  realtimePayloadSchemas,
  roomOf,
  syncRequestSchema,
  typingRequestSchema,
} from './realtime.js';

const id = '3f0c6f1e-9b1a-4c55-8a53-0d2f5c0a1b11';

describe('realtime contracts', () => {
  it('has a payload schema for every event, carrying ids and no content', () => {
    expect(Object.keys(realtimePayloadSchemas).sort()).toEqual([...REALTIME_EVENTS].sort());
    expect(realtimePayloadSchemas['case.updated'].parse({ caseId: id, fields: ['stage'] })).toEqual(
      {
        caseId: id,
        fields: ['stage'],
      },
    );
    expect(() => realtimePayloadSchemas['message.created'].parse({ caseId: id })).toThrow();
  });

  it('names rooms by kind and id', () => {
    expect(roomOf.user(id)).toBe(`user:${id}`);
    expect(roomOf.case(id)).toBe(`case:${id}`);
    expect(roomOf.hospital(id)).toBe(`hospital:${id}`);
  });

  it('lets a client ask to join only a case or hospital room, with a real id', () => {
    expect(joinRequestSchema.safeParse({ kind: 'case', id }).success).toBe(true);
    expect(joinRequestSchema.safeParse({ kind: 'user', id }).success).toBe(false);
    expect(joinRequestSchema.safeParse({ kind: 'case', id: 'not-an-id' }).success).toBe(false);
    expect(joinRequestSchema.safeParse({ kind: 'case', id, extra: 1 }).success).toBe(false);
  });

  it('accepts a typing message and a sync time, and nothing else', () => {
    expect(typingRequestSchema.safeParse({ caseId: id, typing: true }).success).toBe(true);
    expect(typingRequestSchema.safeParse({ caseId: id }).success).toBe(false);
    expect(syncRequestSchema.safeParse({ since: '2026-10-29T12:00:00.000Z' }).success).toBe(true);
    expect(syncRequestSchema.safeParse({ since: 'yesterday' }).success).toBe(false);
  });
});
