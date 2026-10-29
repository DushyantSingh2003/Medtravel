import { AsyncLocalStorage } from 'node:async_hooks';

/** Whether the request being handled has already written an audit row; the interceptor adds a fallback row when it has not. */
export interface AuditTrailState {
  recorded: boolean;
}

export const auditTrail = new AsyncLocalStorage<AuditTrailState>();
