import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { defer, mergeMap, type Observable } from 'rxjs';
import { contextOf } from '../common/request-context.js';
import { AuditService } from './audit.service.js';
import { auditTrail, type AuditTrailState } from './audit-trail.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * The safety net behind "every create, update and delete is audited". Modules write detailed rows themselves (what
 * changed, in the transaction of the change). When a signed-in request changes something and finishes without any audit
 * row having been written, this adds a plain `http.<method>` row naming the route, so a forgotten audit call still leaves a
 * trace of who called what. Reads are not covered: those are recorded explicitly (`AuditService.recordAccess`).
 */
@Injectable()
export class AuditTrailInterceptor implements NestInterceptor {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (SAFE_METHODS.has(request.method) || !request.actor) return next.handle();

    const state: AuditTrailState = { recorded: false };
    return defer(() => auditTrail.run(state, () => next.handle())).pipe(
      mergeMap(async (value: unknown) => {
        if (!state.recorded) {
          // The route pattern (`/patients/:id`), never the address with its ids.
          const route = request.routeOptions?.url ?? 'unknown';
          await this.audit.recordNow(contextOf(request), {
            action: `http.${request.method.toLowerCase()}`,
            entityType: 'Route',
            entityId: `${request.method} ${route}`.slice(0, 100),
          });
        }
        return value;
      }),
    );
  }
}
