import type { Query } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { RealtimeMessage } from '@medtravel/contracts';
import { staleBy } from './invalidate';

const query = (...key: unknown[]) => ({ queryKey: key }) as unknown as Query;
const message = (
  event: RealtimeMessage['event'],
  payload: Record<string, unknown>,
): RealtimeMessage => ({
  id: 'x',
  at: '2026-10-29T12:00:00.000Z',
  event,
  room: 'r',
  payload,
});

describe('staleBy', () => {
  it('refreshes the notification queries when a notification arrives', () => {
    const stale = staleBy(message('notification.created', { notificationId: 'n1' }));
    expect(stale(query('/notifications', { limit: 10 }))).toBe(true);
    expect(stale(query('/notifications/unread-count'))).toBe(true);
    expect(stale(query('/documents'))).toBe(false);
  });

  it('refreshes every query that mentions the case an event is about, and no other', () => {
    const stale = staleBy(message('case.updated', { caseId: 'case-1' }));
    expect(stale(query('/cases/case-1'))).toBe(true);
    expect(stale(query('/documents', { caseId: 'case-1' }))).toBe(true);
    expect(stale(query('/cases/case-2'))).toBe(false);
    expect(stale(query('/notifications'))).toBe(false);
  });

  it('refreshes task lists when a task is assigned, and nothing when someone is only typing', () => {
    expect(
      staleBy(message('task.assigned', { taskId: 't1' }))(query('/tasks', { mine: true })),
    ).toBe(true);
    expect(
      staleBy(message('typing', { caseId: 'case-1', userId: 'u', typing: true }))(
        query('/cases/case-1'),
      ),
    ).toBe(false);
  });
});
