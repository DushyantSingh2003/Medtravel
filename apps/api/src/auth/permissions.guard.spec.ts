import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { Role } from '@medtravel/contracts';
import { Authenticated, Can, Public } from './decorators.js';
import { PermissionsGuard } from './permissions.guard.js';

@Authenticated()
class OpenClass {
  @Can('delete', 'MasterData') guarded(): void {}
  plain(): void {}
}

class Routes {
  @Can('delete', 'MasterData') guarded(): void {}
  undeclared(): void {}
  @Public() open(): void {}
  @Authenticated() anyone(): void {}
}

const contextFor = (
  handler: () => void,
  role?: Role,
  owner: new () => object = Routes,
): ExecutionContext =>
  ({
    getHandler: () => handler,
    getClass: () => owner,
    switchToHttp: () => ({
      getRequest: () => ({
        actor: role ? { userId: 'u', role, sessionId: 's', scopeCaseId: null } : undefined,
      }),
    }),
  }) as unknown as ExecutionContext;

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard(new Reflector());
  const routes = new Routes();

  it('lets a role through when the matrix allows the declared permission', () => {
    expect(guard.canActivate(contextFor(routes.guarded, 'super_admin'))).toBe(true);
  });

  it('refuses a role the matrix does not allow', () => {
    expect(() => guard.canActivate(contextFor(routes.guarded, 'case_manager'))).toThrow(
      ForbiddenException,
    );
  });

  it('fails closed on a route that declares nothing, even for the super admin', () => {
    expect(() => guard.canActivate(contextFor(routes.undeclared, 'super_admin'))).toThrow(
      ForbiddenException,
    );
  });

  it('lets public routes through without an actor', () => {
    expect(guard.canActivate(contextFor(routes.open))).toBe(true);
  });

  it('lets any signed-in user through an authenticated route, but nobody who is not signed in', () => {
    expect(guard.canActivate(contextFor(routes.anyone, 'patient'))).toBe(true);
    expect(() => guard.canActivate(contextFor(routes.anyone))).toThrow(ForbiddenException);
  });

  it('still checks a declared permission under a class-level @Authenticated()', () => {
    const open = new OpenClass();
    expect(guard.canActivate(contextFor(open.guarded, 'super_admin', OpenClass))).toBe(true);
    expect(() => guard.canActivate(contextFor(open.guarded, 'agent', OpenClass))).toThrow(
      ForbiddenException,
    );
    expect(guard.canActivate(contextFor(open.plain, 'agent', OpenClass))).toBe(true);
  });
});
