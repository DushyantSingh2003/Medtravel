import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface Window {
  count: number;
  resetsAt: number;
}

/**
 * A fixed-window counter in this process's memory. It protects sign-in, codes and resets from guessing and mail-bombing
 * on one API instance; with several instances a shared store (Redis) replaces the map behind the same `consume` call.
 */
@Injectable()
export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  /** Counts one hit on `key`; throws 429 once more than `limit` hits fall in a `windowSeconds` window. */
  consume(key: string, limit: number, windowSeconds: number, nowMs = Date.now()): void {
    if (this.windows.size > 50_000) this.sweep(nowMs);
    const current = this.windows.get(key);
    if (!current || current.resetsAt <= nowMs) {
      this.windows.set(key, { count: 1, resetsAt: nowMs + windowSeconds * 1000 });
      return;
    }
    current.count += 1;
    if (current.count > limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetsAt - nowMs) / 1000));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many attempts. Try again later.',
          retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private sweep(nowMs: number): void {
    for (const [key, window] of this.windows)
      if (window.resetsAt <= nowMs) this.windows.delete(key);
  }
}
