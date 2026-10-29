import type { RealtimeMessage } from '@medtravel/contracts';
import type { Query, QueryClient } from '@tanstack/react-query';

const idOf = (message: RealtimeMessage, key: string): string | undefined => {
  const value = message.payload[key];
  return typeof value === 'string' ? value : undefined;
};

/**
 * Which cached lists and details an event makes stale. A notification refreshes the bell; an event about a case refreshes
 * every query whose key mentions that case (its detail, its messages, its tasks), so screens that load case data through the
 * API client update without each one subscribing.
 */
export function staleBy(message: RealtimeMessage): (query: Query) => boolean {
  if (message.event === 'notification.created')
    return (query) => String(query.queryKey[0]).startsWith('/notifications');
  if (message.event === 'typing') return () => false;
  const caseId = idOf(message, 'caseId');
  return (query) =>
    (caseId !== undefined && JSON.stringify(query.queryKey).includes(caseId)) ||
    (message.event === 'task.assigned' && String(query.queryKey[0]).startsWith('/tasks'));
}

export function applyEvent(queryClient: QueryClient, message: RealtimeMessage): Promise<void> {
  return queryClient.invalidateQueries({ predicate: staleBy(message) });
}
