import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ACCESS_COOKIE, REFRESH_COOKIE, SessionCookies, readCookie } from '../../auth/cookies.js';
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
  AuthUserDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  LoginResultDto,
  OtpRequestDto,
  OtpVerifyDto,
  RegisterDto,
  ResetPasswordDto,
  SessionIdParamDto,
  SessionListDto,
  VerifyEmailDto,
} from './auth.dto.js';
import { AuthService } from './auth.service.js';
import { respond } from './respond.js';

const ACCEPTED = { ok: true } as const;

@ApiTags('auth')
@ApiCookieAuth('session')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: SessionCookies,
  ) {}

  @Post('register')
  @Public()
  @Throttle({ limit: 10, windowSeconds: 60 })
  @HttpCode(202)
  @ApiOperation({
    operationId: 'register',
    summary: 'Patient sign-up with email and password. Always answers the same.',
  })
  @ApiOkResponse({ type: AcceptedDto })
  async register(@Body() body: RegisterDto, @Ctx() context: RequestContext) {
    await this.auth.register(body, context);
    return ACCEPTED;
  }

  @Post('login')
  @Public()
  @Throttle({ limit: 20, windowSeconds: 60 })
  @HttpCode(200)
  @ApiOperation({
    operationId: 'login',
    summary: 'Sign in with email and password; may ask for the second factor',
  })
  @ApiOkResponse({ type: LoginResultDto })
  async login(
    @Body() body: LoginDto,
    @Ctx() context: RequestContext,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return respond(this.cookies, reply, await this.auth.login(body, context));
  }

  @Post('login/otp/request')
  @Public()
  @Throttle({ limit: 10, windowSeconds: 60 })
  @HttpCode(202)
  @ApiOperation({
    operationId: 'requestLoginCode',
    summary: 'Send a sign-in code by email or phone. Always answers the same.',
  })
  @ApiOkResponse({ type: AcceptedDto })
  async requestLoginCode(@Body() body: OtpRequestDto) {
    await this.auth.requestLoginCode(body.identifier);
    return ACCEPTED;
  }

  @Post('login/otp/verify')
  @Public()
  @Throttle({ limit: 20, windowSeconds: 60 })
  @HttpCode(200)
  @ApiOperation({
    operationId: 'verifyLoginCode',
    summary: 'Sign in with the emailed or texted code',
  })
  @ApiOkResponse({ type: LoginResultDto })
  async verifyLoginCode(
    @Body() body: OtpVerifyDto,
    @Ctx() context: RequestContext,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return respond(
      this.cookies,
      reply,
      await this.auth.verifyLoginCode(body.identifier, body.code, context),
    );
  }

  @Post('refresh')
  @Public()
  @Throttle({ limit: 60, windowSeconds: 60 })
  @HttpCode(200)
  @ApiOperation({
    operationId: 'refreshSession',
    summary: 'Swap the refresh cookie for new tokens',
  })
  @ApiOkResponse({ type: AuthUserDto })
  async refresh(
    @Req() request: FastifyRequest,
    @Ctx() context: RequestContext,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const cookie = readCookie(request.headers.cookie, REFRESH_COOKIE);
    try {
      const outcome = await this.auth.refresh(cookie ?? '', context);
      this.cookies.set(reply, outcome.session!.tokens);
      return outcome.user;
    } catch (error) {
      this.cookies.clear(reply);
      throw error;
    }
  }

  @Post('logout')
  @Public()
  @HttpCode(200)
  @ApiOperation({ operationId: 'logout', summary: 'End this session and clear the cookies' })
  @ApiOkResponse({ type: AcceptedDto })
  async logout(
    @Req() request: FastifyRequest,
    @Ctx() context: RequestContext,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.auth.logout(
      readCookie(request.headers.cookie, ACCESS_COOKIE),
      readCookie(request.headers.cookie, REFRESH_COOKIE),
      context,
    );
    this.cookies.clear(reply);
    return ACCEPTED;
  }

  @Get('me')
  @Authenticated()
  @AllowLimitedSession()
  @ApiOperation({
    operationId: 'getMe',
    summary: 'The signed-in user, and whether the session is limited until 2FA is set up',
  })
  @ApiOkResponse({ type: AuthUserDto })
  me(@CurrentActor() actor: Actor, @Req() request: FastifyRequest) {
    return this.auth.me(actor, request.limitedSession === true);
  }

  @Post('email/verify')
  @Public()
  @Throttle({ limit: 20, windowSeconds: 60 })
  @HttpCode(200)
  @ApiOperation({
    operationId: 'verifyEmail',
    summary: 'Confirm an email address with the link from the message',
  })
  @ApiOkResponse({ type: AcceptedDto })
  async verifyEmail(@Body() body: VerifyEmailDto, @Ctx() context: RequestContext) {
    await this.auth.verifyEmail(body.token, context);
    return ACCEPTED;
  }

  @Post('email/resend')
  @Authenticated()
  @NoMagicLink()
  @HttpCode(202)
  @ApiOperation({
    operationId: 'resendVerificationEmail',
    summary: 'Send the confirmation link again',
  })
  @ApiOkResponse({ type: AcceptedDto })
  async resendVerification(@CurrentActor() actor: Actor) {
    await this.auth.resendVerification(actor);
    return ACCEPTED;
  }

  @Post('password/forgot')
  @Public()
  @Throttle({ limit: 10, windowSeconds: 60 })
  @HttpCode(202)
  @ApiOperation({
    operationId: 'forgotPassword',
    summary: 'Send a password reset link. Always answers the same.',
  })
  @ApiOkResponse({ type: AcceptedDto })
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    await this.auth.forgotPassword(body.email);
    return ACCEPTED;
  }

  @Post('password/reset')
  @Public()
  @Throttle({ limit: 10, windowSeconds: 60 })
  @HttpCode(200)
  @ApiOperation({
    operationId: 'resetPassword',
    summary: 'Choose a new password with the link from the message; signs out every device',
  })
  @ApiOkResponse({ type: AcceptedDto })
  async resetPassword(@Body() body: ResetPasswordDto, @Ctx() context: RequestContext) {
    await this.auth.resetPassword(body.token, body.password, context);
    return ACCEPTED;
  }

  @Post('password/change')
  @Authenticated()
  @NoMagicLink()
  @HttpCode(200)
  @ApiOperation({
    operationId: 'changePassword',
    summary: 'Change the password; signs out the other devices',
  })
  @ApiOkResponse({ type: AcceptedDto })
  async changePassword(
    @CurrentActor() actor: Actor,
    @Body() body: ChangePasswordDto,
    @Ctx() context: RequestContext,
  ) {
    await this.auth.changePassword(actor, body, context);
    return ACCEPTED;
  }

  @Get('sessions')
  @Authenticated()
  @NoMagicLink()
  @ApiOperation({
    operationId: 'listSessions',
    summary: 'The devices this account is signed in on',
  })
  @ApiOkResponse({ type: SessionListDto })
  async listSessions(@CurrentActor() actor: Actor) {
    return { items: await this.auth.listSessions(actor) };
  }

  @Delete('sessions/:id')
  @Authenticated()
  @NoMagicLink()
  @HttpCode(200)
  @ApiOperation({ operationId: 'revokeSession', summary: 'Sign one device out' })
  @ApiOkResponse({ type: AcceptedDto })
  async revokeSession(
    @CurrentActor() actor: Actor,
    @Param() { id }: SessionIdParamDto,
    @Ctx() context: RequestContext,
  ) {
    await this.auth.revokeSession(actor, id, context);
    return ACCEPTED;
  }

  @Post('logout-others')
  @Authenticated()
  @NoMagicLink()
  @HttpCode(200)
  @ApiOperation({
    operationId: 'logoutOtherSessions',
    summary: 'Sign out every device except this one',
  })
  @ApiOkResponse({ type: AcceptedDto })
  async logoutOthers(@CurrentActor() actor: Actor, @Ctx() context: RequestContext) {
    await this.auth.revokeOtherSessions(actor, context);
    return ACCEPTED;
  }
}
