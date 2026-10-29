import { Body, Controller, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Can, CurrentActor } from '../../auth/decorators.js';
import type { Actor } from '../../auth/actor.js';
import { Ctx, type RequestContext } from '../../common/request-context.js';
import {
  MarkReadDto,
  NotificationEventsDto,
  NotificationListQueryDto,
  NotificationLogPageDto,
  NotificationLogQueryDto,
  NotificationPageDto,
  NotificationPreferencesDto,
  SendTestDto,
  SendTestResultDto,
  SetPreferencesDto,
  UnreadCountDto,
} from './notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('notifications')
@ApiCookieAuth('session')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Can('read', 'Notification')
  @ApiOperation({ operationId: 'listNotifications', summary: 'My notifications, newest first' })
  @ApiOkResponse({ type: NotificationPageDto })
  list(@CurrentActor() actor: Actor, @Query() query: NotificationListQueryDto) {
    return this.notifications.list(actor, query);
  }

  @Get('unread-count')
  @Can('read', 'Notification')
  @ApiOperation({
    operationId: 'countUnreadNotifications',
    summary: 'How many of my notifications are unread',
  })
  @ApiOkResponse({ type: UnreadCountDto })
  async unread(@CurrentActor() actor: Actor) {
    return { unread: await this.notifications.unread(actor) };
  }

  @Post('read')
  @HttpCode(200)
  @Can('update', 'Notification')
  @ApiOperation({
    operationId: 'markNotificationsRead',
    summary: 'Mark some or all of my notifications as read',
  })
  @ApiOkResponse({ type: UnreadCountDto })
  read(@CurrentActor() actor: Actor, @Body() body: MarkReadDto) {
    return this.notifications.markRead(actor, body);
  }

  @Get('preferences')
  @Can('read', 'Notification')
  @ApiOperation({
    operationId: 'getNotificationPreferences',
    summary: 'Which channels I receive messages on',
  })
  @ApiOkResponse({ type: NotificationPreferencesDto })
  preferences(@CurrentActor() actor: Actor) {
    return this.notifications.preferences(actor);
  }

  @Put('preferences')
  @Can('update', 'Notification')
  @ApiOperation({
    operationId: 'setNotificationPreferences',
    summary: 'Choose the channels I receive messages on',
  })
  @ApiOkResponse({ type: NotificationPreferencesDto })
  setPreferences(
    @CurrentActor() actor: Actor,
    @Ctx() context: RequestContext,
    @Body() body: SetPreferencesDto,
  ) {
    return this.notifications.setPreferences(actor, context, body);
  }

  @Get('log')
  @Can('read', 'NotificationLog')
  @ApiOperation({
    operationId: 'listNotificationLog',
    summary: 'Every notification sent, with its delivery status (super admin)',
  })
  @ApiOkResponse({ type: NotificationLogPageDto })
  log(@Query() { cursor, limit, ...filters }: NotificationLogQueryDto) {
    return this.notifications.log({ cursor, limit, ...filters });
  }

  @Get('events')
  @Can('read', 'NotificationLog')
  @ApiOperation({
    operationId: 'listNotificationEvents',
    summary: 'The events that can be notified (super admin)',
  })
  @ApiOkResponse({ type: NotificationEventsDto })
  events() {
    return { events: this.notifications.events() };
  }

  @Post('test')
  @HttpCode(200)
  @Can('create', 'NotificationLog')
  @ApiOperation({
    operationId: 'sendTestNotification',
    summary: 'Send the test event to a user on their channels (super admin)',
  })
  @ApiOkResponse({ type: SendTestResultDto })
  test(@CurrentActor() actor: Actor, @Ctx() context: RequestContext, @Body() body: SendTestDto) {
    return this.notifications.sendTest(actor, context, body);
  }
}
