import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { captureError, scrubText } from '@medtravel/observability';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Reports server errors (anything that is not a deliberate 4xx) to Sentry with the request ID, the route pattern and the user's
 * id, then lets Nest answer as usual. The report is scrubbed of personal data before it leaves (`scrubEvent`).
 */
@Catch()
@Injectable()
export class SentryExceptionFilter extends BaseExceptionFilter {
  private readonly log = new Logger('Unhandled');

  override catch(exception: unknown, host: ArgumentsHost): void {
    const expected = exception instanceof HttpException && exception.getStatus() < 500;
    if (!expected && host.getType() === 'http') {
      const request = host.switchToHttp().getRequest<FastifyRequest>();
      captureError(exception, {
        requestId: String(request.id),
        route: request.routeOptions?.url,
        userId: request.actor?.userId,
      });
    }
    // Nest's own handler would log the raw message of an unexpected error, and messages quote the data being processed
    // (an email, a passport number). Log it scrubbed, and answer with the same plain 500.
    if (!(exception instanceof HttpException) && host.getType() === 'http') {
      const error = exception instanceof Error ? exception : new Error(String(exception));
      this.log.error(scrubText(error.message), scrubText(error.stack ?? ''));
      void host
        .switchToHttp()
        .getResponse<FastifyReply>()
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .send({ statusCode: 500, message: 'Internal server error' });
      return;
    }
    super.catch(exception, host);
  }
}
