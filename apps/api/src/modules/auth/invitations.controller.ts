import { Body, Controller, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { SessionCookies } from '../../auth/cookies.js';
import {
  Authenticated,
  CurrentActor,
  NoMagicLink,
  Public,
  Throttle,
} from '../../auth/decorators.js';
import type { Actor } from '../../auth/actor.js';
import { Ctx, type RequestContext } from '../../common/request-context.js';
import {
  AcceptInvitationDto,
  AcceptedDto,
  CreateInvitationDto,
  CreateMagicLinkDto,
  InvitationPreviewDto,
  InvitationTokenParamDto,
  LoginResultDto,
  RedeemMagicLinkDto,
} from './auth.dto.js';
import { InvitationsService } from './invitations.service.js';
import { respond } from './respond.js';

const ACCEPTED = { ok: true } as const;

@ApiTags('auth')
@ApiCookieAuth('session')
@Controller('auth')
export class InvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly cookies: SessionCookies,
  ) {}

  @Post('invitations')
  @Authenticated()
  @NoMagicLink()
  @HttpCode(202)
  @ApiOperation({
    operationId: 'createInvitation',
    summary: "Invite someone; who may invite whom depends on the inviter's role",
  })
  @ApiOkResponse({ type: AcceptedDto })
  async create(
    @CurrentActor() actor: Actor,
    @Body() body: CreateInvitationDto,
    @Ctx() context: RequestContext,
  ) {
    await this.invitations.invite(actor, body, context);
    return ACCEPTED;
  }

  @Get('invitations/:token')
  @Public()
  @Throttle({ limit: 30, windowSeconds: 60 })
  @ApiOperation({
    operationId: 'previewInvitation',
    summary: 'Who an invitation is for, before it is accepted',
  })
  @ApiOkResponse({ type: InvitationPreviewDto })
  preview(@Param() { token }: InvitationTokenParamDto) {
    return this.invitations.previewInvitation(token);
  }

  @Post('invitations/accept')
  @Public()
  @Throttle({ limit: 10, windowSeconds: 60 })
  @HttpCode(200)
  @ApiOperation({
    operationId: 'acceptInvitation',
    summary: 'Accept an invitation by choosing a password',
  })
  @ApiOkResponse({ type: AcceptedDto })
  async accept(@Body() body: AcceptInvitationDto, @Ctx() context: RequestContext) {
    await this.invitations.accept(body.token, body, context);
    return ACCEPTED;
  }

  @Post('magic-links')
  @Authenticated()
  @NoMagicLink()
  @HttpCode(202)
  @ApiOperation({
    operationId: 'createMagicLink',
    summary: 'A hospital desk sends a doctor a 72-hour link to one case',
  })
  @ApiOkResponse({ type: AcceptedDto })
  async createMagicLink(
    @CurrentActor() actor: Actor,
    @Body() body: CreateMagicLinkDto,
    @Ctx() context: RequestContext,
  ) {
    await this.invitations.createMagicLink(actor, body, context);
    return ACCEPTED;
  }

  @Post('magic-links/redeem')
  @Public()
  @Throttle({ limit: 10, windowSeconds: 60 })
  @HttpCode(200)
  @ApiOperation({
    operationId: 'redeemMagicLink',
    summary: 'Open the case a magic link was sent for',
  })
  @ApiOkResponse({ type: LoginResultDto })
  async redeem(
    @Body() body: RedeemMagicLinkDto,
    @Ctx() context: RequestContext,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return respond(
      this.cookies,
      reply,
      await this.invitations.redeemMagicLink(body.token, context),
    );
  }
}
