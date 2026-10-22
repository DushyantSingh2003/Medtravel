import { Inject, Injectable } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';

export const ACCESS_COOKIE = 'mt_at';
export const REFRESH_COOKIE = 'mt_rt';
/** Readable by the portal's JavaScript on purpose: the browser copies it into the `x-csrf-token` header. */
export const CSRF_COOKIE = 'mt_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/** The value of one cookie in a `Cookie` header, or undefined. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === name)
      return part.slice(separator + 1).trim();
  }
  return undefined;
}

export interface CookieOptions {
  maxAgeSeconds: number;
  httpOnly: boolean;
  path: string;
  secure: boolean;
  domain?: string | undefined;
}

/** A `Set-Cookie` value. Values are tokens made of URL-safe characters, so they need no encoding. */
export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const parts = [
    `${name}=${value}`,
    `Path=${options.path}`,
    `Max-Age=${options.maxAgeSeconds}`,
    'SameSite=Lax',
  ];
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.domain) parts.push(`Domain=${options.domain}`);
  return parts.join('; ');
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  accessMaxAgeSeconds: number;
  refreshMaxAgeSeconds: number;
}

/** Puts a session's tokens in cookies, and takes them out again on sign-out. */
@Injectable()
export class SessionCookies {
  constructor(@Inject(ENV) private readonly env: Env) {}

  private options(maxAgeSeconds: number, httpOnly: boolean, path = '/'): CookieOptions {
    return {
      maxAgeSeconds,
      httpOnly,
      path,
      secure: this.env.NODE_ENV === 'production',
      domain: this.env.COOKIE_DOMAIN,
    };
  }

  set(reply: FastifyReply, tokens: SessionTokens): void {
    reply.header('set-cookie', [
      serializeCookie(
        ACCESS_COOKIE,
        tokens.accessToken,
        this.options(tokens.accessMaxAgeSeconds, true),
      ),
      // The refresh token travels only to the endpoints that use it.
      serializeCookie(
        REFRESH_COOKIE,
        tokens.refreshToken,
        this.options(tokens.refreshMaxAgeSeconds, true, '/auth'),
      ),
      serializeCookie(
        CSRF_COOKIE,
        tokens.csrfToken,
        this.options(tokens.refreshMaxAgeSeconds, false),
      ),
    ]);
  }

  clear(reply: FastifyReply): void {
    reply.header('set-cookie', [
      serializeCookie(ACCESS_COOKIE, '', this.options(0, true)),
      serializeCookie(REFRESH_COOKIE, '', this.options(0, true, '/auth')),
      serializeCookie(CSRF_COOKIE, '', this.options(0, false)),
    ]);
  }
}
