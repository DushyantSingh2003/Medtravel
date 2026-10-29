import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { Public, Throttle } from '../../auth/decorators.js';
import { WebhooksService } from './webhooks.service.js';
import { WebhookChannelParamsDto } from './notifications.dto.js';

class WebhookAckDto extends createZodDto(
  z.object({ applied: z.number().int().min(0), ignored: z.number().int().min(0) }),
) {}

/**
 * Where the SMS and WhatsApp providers report delivery. Public (the provider has no session) but never open: every call must
 * carry an HMAC-SHA256 of its raw body made with `NOTIFICATION_WEBHOOK_SECRET`, in `X-Hub-Signature-256` (Meta's own header, so
 * its callbacks verify as they are) or `X-Signature`.
 */
@ApiTags('webhooks')
@Controller('webhooks/notifications')
export class WebhooksController {
  constructor(@Inject(WebhooksService) private readonly webhooks: WebhooksService) {}

  @Post(':channel')
  @Public()
  @HttpCode(200)
  @Throttle({ limit: 600, windowSeconds: 60 })
  @ApiOperation({
    operationId: 'receiveNotificationStatus',
    summary: 'Delivery callback from the SMS or WhatsApp provider (signed)',
  })
  @ApiOkResponse({ type: WebhookAckDto })
  async receive(
    @Param() { channel }: WebhookChannelParamsDto,
    @Req() request: FastifyRequest & { rawBody?: Buffer },
    @Body() body: unknown,
  ) {
    const raw = request.rawBody;
    if (!raw) throw new BadRequestException('The request has no body');
    const header = request.headers['x-hub-signature-256'] ?? request.headers['x-signature'];
    const signature = Array.isArray(header) ? header[0] : header;
    if (!this.webhooks.verify(raw, signature)) throw new UnauthorizedException('Bad signature');
    return this.webhooks.apply(channel, body);
  }

  /** Meta's one-time check that we own the callback URL: echo the challenge when the verify token is our secret. */
  @Get(':channel')
  @Public()
  @Throttle({ limit: 60, windowSeconds: 60 })
  @ApiOperation({
    operationId: 'verifyNotificationWebhook',
    summary: 'WhatsApp webhook subscription check',
  })
  @ApiOkResponse({ type: String })
  verify(
    @Param() _channel: WebhookChannelParamsDto,
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
  ): string {
    const secret = Buffer.from(this.webhooks.secret);
    const given = Buffer.from(token ?? '');
    if (
      mode !== 'subscribe' ||
      !challenge ||
      given.length !== secret.length ||
      !timingSafeEqual(given, secret)
    )
      throw new UnauthorizedException('Bad verify token');
    return challenge;
  }
}
