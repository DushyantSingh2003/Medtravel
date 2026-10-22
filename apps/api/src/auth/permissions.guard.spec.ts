import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { Role } from '@medtravel/contracts';
import { Can, Public } from './decorators.js';
import { PermissionsGuard } from './permissions.guard.js';

class Routes {
  @Can('delete', 'MasterData') guarded(): void {}
  undeclared(): void {}
  @Public() open(): void {}
}

const contextFor = (handler: () => void, role?: Role): ExecutionContext =>
  ({
    getHandler: () => handler,
    getClass: () => Routes,
    switchToHttp: () => ({
      getRequest: () => ({ actor: role ? { userId: null, role } : undefined }),
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

  it('fails closed on a route that declares no permission', () => {
    expect(() => guard.canActivate(contextFor(routes.undeclared, 'super_admin'))).toThrow(
      ForbiddenException,
    );
  });

  it('lets public routes through without an actor', () => {
    expect(guard.canActivate(contextFor(routes.open))).toBe(true);
  });
});
