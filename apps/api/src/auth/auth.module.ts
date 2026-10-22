import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard.js';
import { StubAuthGuard } from './stub-auth.guard.js';

/** Global guards, in order: who is calling, then whether they may. F-03 swaps the first, F-04 the second's rules. */
@Module({
  providers: [
    { provide: APP_GUARD, useClass: StubAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AuthModule {}
