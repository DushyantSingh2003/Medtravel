import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from '../modules/auth/auth.controller.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { InvitationsController } from '../modules/auth/invitations.controller.js';
import { InvitationsService } from '../modules/auth/invitations.service.js';
import { Mailer } from '../modules/auth/mail/mailer.js';
import { SignInService } from '../modules/auth/sign-in.service.js';
import { PasswordService } from '../modules/auth/password.service.js';
import { TotpService } from '../modules/auth/totp.service.js';
import { TwoFactorController } from '../modules/auth/two-factor.controller.js';
import { TwoFactorService } from '../modules/auth/two-factor.service.js';
import { AuthGuard } from './auth.guard.js';
import { SessionCookies } from './cookies.js';
import { PermissionsGuard } from './permissions.guard.js';
import { RateLimiter } from './rate-limiter.js';
import { SessionService } from './session.service.js';
import { ThrottleGuard } from './throttle.guard.js';

/**
 * Authentication: the global guards, in order (throttle, who is calling, whether they may), and the sign-in, 2FA,
 * session and invitation endpoints. Global because the guards protect every other module's routes.
 */
@Global()
@Module({
  controllers: [AuthController, TwoFactorController, InvitationsController],
  providers: [
    SessionService,
    SessionCookies,
    RateLimiter,
    PasswordService,
    TotpService,
    Mailer,
    SignInService,
    AuthService,
    TwoFactorService,
    InvitationsService,
    { provide: APP_GUARD, useClass: ThrottleGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [SessionService, Mailer],
})
export class AuthModule {}
