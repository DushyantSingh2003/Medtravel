import { SetMetadata } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

/** Whether the request being handled has already written an audit row; the interceptor adds a fallback row when it has not. */
export interface AuditTrailState {
  recorded: boolean;
}

export const NO_AUDIT_FALLBACK_KEY = 'audit:no-fallback';

export const auditTrail = new AsyncLocalStorage<AuditTrailState>();

/**
 * Marks a route whose calls are not changes worth a row of their own (a signing request that only prepares an upload; the
 * change itself is audited when the upload completes), so the interceptor adds no fallback row.
 */
export const NoAuditFallback = () => SetMetadata(NO_AUDIT_FALLBACK_KEY, true);
