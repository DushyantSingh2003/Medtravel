import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.schema.js';
import { AuthGuard, secondFactorOwed } from './auth.guard.js';
import { WsGateway } from './decorators.js';
import type { ImpersonationService } from './impersonation.service.js';
import type { SessionService } from './session.service.js';

@WsGateway()
class MarkedGateway {}
class OtherHandler {}

const guard = new AuthGuard(
  new Reflector(),
  {} as SessionService,
  {} as ImpersonationService,
  {} as Env,
);
const nonHttp = (owner: new () => object, type: string): ExecutionContext =>
  ({
    getType: () => type,
    getClass: () => owner,
    getHandler: () => () => undefined,
  }) as unknown as ExecutionContext;

describe('AuthGuard outside HTTP', () => {
  it('lets through only a gateway that authenticates its own connections, and refuses every other WebSocket or RPC handler', async () => {
    expect(await guard.canActivate(nonHttp(MarkedGateway, 'ws'))).toBe(true);
    expect(await guard.canActivate(nonHttp(OtherHandler, 'ws'))).toBe(false);
    expect(await guard.canActivate(nonHttp(OtherHandler, 'rpc'))).toBe(false);
  });
});

describe('secondFactorOwed', () => {
  const env = { NODE_ENV: 'production', AUTH_DEV_SKIP_2FA: false } as Env;
  const session = (
    over: Partial<{
      role: 'case_manager' | 'patient';
      twoFactorEnabled: boolean;
      verified: boolean;
      scope: string | null;
    }>,
  ) => ({
    twoFactorVerified: over.verified ?? false,
    actor: { scopeCaseId: over.scope ?? null },
    user: { role: over.role ?? 'case_manager', twoFactorEnabled: over.twoFactorEnabled ?? false },
  });

  it('is owed by staff who have not verified, by anyone who turned it on, and never by a one-case link', () => {
    expect(secondFactorOwed(session({}), env)).toBe(true);
    expect(secondFactorOwed(session({ role: 'patient' }), env)).toBe(false);
    expect(secondFactorOwed(session({ role: 'patient', twoFactorEnabled: true }), env)).toBe(true);
    expect(secondFactorOwed(session({ verified: true }), env)).toBe(false);
    expect(secondFactorOwed(session({ scope: 'case-1' }), env)).toBe(false);
  });
});
