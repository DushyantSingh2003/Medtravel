import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { SessionCookies } from '../../auth/cookies.js';
import {
  AllowLimitedSession,
  Authenticated,
  CurrentActor,
  NoMagicLink,
  Public,
  Throttle,
} from '../../auth/decorators.js';
import type { Actor } from '../../auth/actor.js';
import { Ctx, type RequestContext } from '../../common/request-context.js';
import {
  AcceptedDto,
  BackupCodesDto,
  BackupCodesRequestDto,
  LoginResultDto,
  TwoFactorChallengeDto,
  TwoFactorDisableDto,
  TwoFactorEnableDto,
  TwoFactorSetupDto,
} from './auth.dto.js';
import { respond } from './respond.js';
import { TwoFactorService } from './two-factor.service.js';

@ApiTags('auth')
@ApiCookieAuth('session')
@Controller('auth/2fa')
export class TwoFactorController {
  constructor(
    private readonly twoFactor: TwoFactorService,
    private readonly cookies: SessionCookies,
  ) {}

  @Post('setup')
  @Authenticated()
  @AllowLimitedSession()
  @NoMagicLink()
  @HttpCode(200)
  @ApiOperation({
    operationId: 'setUpTwoFactor',
    summary: 'Start enrolment: a secret and a QR code for the authenticator app',
  })
  @ApiOkResponse({ type: TwoFactorSetupDto })
  setup(@CurrentActor() actor: Actor) {
    return this.twoFactor.setup(actor);
  }

  @Post('enable')
  @Authenticated()
  @AllowLimitedSession()
  @NoMagicLink()
  @HttpCode(200)
  @ApiOperation({
    operationId: 'enableTwoFactor',
    summary: 'Finish enrolment with a code from the app; returns the backup codes once',
  })
  @ApiOkResponse({ type: BackupCodesDto })
  async enable(
    @CurrentActor() actor: Actor,
    @Body() body: TwoFactorEnableDto,
    @Ctx() context: RequestContext,
  ) {
    return { backupCodes: await this.twoFactor.enable(actor, body.code, context) };
  }

  @Post('challenge')
  @Public()
  @Throttle({ limit: 20, windowSeconds: 60 })
  @HttpCode(200)
  @ApiOperation({
    operationId: 'answerTwoFactorChallenge',
    summary: 'Second step of sign-in: the code from the app, or a backup code',
  })
  @ApiOkResponse({ type: LoginResultDto })
  async challenge(
    @Body() body: TwoFactorChallengeDto,
    @Ctx() context: RequestContext,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return respond(
      this.cookies,
      reply,
      await this.twoFactor.challenge(body.challengeToken, body.code, context),
    );
  }

  @Post('disable')
  @Authenticated()
  @NoMagicLink()
  @HttpCode(200)
  @ApiOperation({
    operationId: 'disableTwoFactor',
    summary: 'Turn 2FA off (only for roles where it is optional)',
  })
  @ApiOkResponse({ type: AcceptedDto })
  async disable(
    @CurrentActor() actor: Actor,
    @Body() body: TwoFactorDisableDto,
    @Ctx() context: RequestContext,
  ) {
    await this.twoFactor.disable(actor, body, context);
    return { ok: true } as const;
  }

  @Post('backup-codes')
  @Authenticated()
  @NoMagicLink()
  @HttpCode(200)
  @ApiOperation({
    operationId: 'regenerateBackupCodes',
    summary: 'Replace the backup codes; the old ones stop working',
  })
  @ApiOkResponse({ type: BackupCodesDto })
  async regenerate(
    @CurrentActor() actor: Actor,
    @Body() body: BackupCodesRequestDto,
    @Ctx() context: RequestContext,
  ) {
    return { backupCodes: await this.twoFactor.regenerateBackupCodes(actor, body.code, context) };
  }
}
