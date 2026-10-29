import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@medtravel/db';
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_KEYS,
  PREFERENCE_CHANNELS,
  type CursorPage,
  type MarkRead,
  type NotificationListQuery,
  type NotificationLogQuery,
  type NotificationLogRow,
  type NotificationPreferences,
  type NotificationView,
  type SendTest,
} from '@medtravel/contracts';
import {
  enqueueNotification,
  type Db,
  type SendInput,
  type SendResult,
} from '@medtravel/notifications';
import { randomUUID } from 'node:crypto';
import type { Actor } from '../../auth/actor.js';
import { AuditService } from '../../audit/audit.service.js';
import { readPage } from '../../common/cursor.js';
import type { RequestContext } from '../../common/request-context.js';
import { PRISMA } from '../../database/database.module.js';

const VIEW_SELECT = {
  id: true,
  templateKey: true,
  title: true,
  body: true,
  data: true,
  caseId: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

const disabledOf = (preferences: NotificationPreferences): string[] =>
  preferences.channels.filter((c) => !c.enabled).map((c) => c.channel);

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

/**
 * Notifications from the application's side: other services call `send` inside the transaction of the change they report;
 * people read their own inbox and choose their channels; the super admin reads the delivery log and fires a test.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  /** Records the message for each recipient and channel and queues its delivery. Call it with the transaction client. */
  send(db: Db, input: SendInput): Promise<SendResult> {
    return enqueueNotification(db, input);
  }

  // ---- a person's own inbox -----------------------------------------------------------------------------------
  async list(
    actor: Actor,
    query: NotificationListQuery,
  ): Promise<CursorPage<NotificationView> & { unread: number }> {
    const where: Prisma.NotificationWhereInput = {
      userId: actor.userId,
      channel: 'in_app',
      deletedAt: null,
      ...(query.unread ? { readAt: null } : {}),
    };
    const [{ rows, nextCursor, total }, unread] = await Promise.all([
      readPage({
        limit: query.limit,
        cursor: query.cursor,
        keyOf: (row: { id: string }) => row.id,
        find: ({ take, skip, cursorKey }) =>
          this.prisma.notification.findMany({
            where,
            select: VIEW_SELECT,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take,
            ...(skip ? { skip } : {}),
            ...(cursorKey ? { cursor: { id: cursorKey } } : {}),
          }),
        count: () => this.prisma.notification.count({ where }),
      }),
      this.unread(actor),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        eventKey: row.templateKey,
        title: row.title,
        body: row.body,
        data: (row.data as Record<string, unknown> | null) ?? null,
        caseId: row.caseId,
        readAt: iso(row.readAt),
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor,
      total,
      unread,
    };
  }

  unread(actor: Actor): Promise<number> {
    return this.prisma.notification.count({
      where: { userId: actor.userId, channel: 'in_app', readAt: null, deletedAt: null },
    });
  }

  /** Marks the person's own notifications read (some, or all). Another person's id is simply not touched. */
  async markRead(actor: Actor, body: MarkRead): Promise<{ unread: number }> {
    await this.prisma.notification.updateMany({
      where: {
        userId: actor.userId,
        channel: 'in_app',
        readAt: null,
        deletedAt: null,
        ...(body.ids ? { id: { in: body.ids } } : {}),
      },
      data: { readAt: new Date(), status: 'read' },
    });
    return { unread: await this.unread(actor) };
  }

  // ---- channel preferences ------------------------------------------------------------------------------------
  async preferences(actor: Actor): Promise<NotificationPreferences> {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { userId: actor.userId },
      select: { channel: true, enabled: true },
    });
    const byChannel = new Map(rows.map((row) => [row.channel, row.enabled]));
    return {
      channels: PREFERENCE_CHANNELS.map((channel) => ({
        channel,
        enabled: byChannel.get(channel) ?? true,
      })),
    };
  }

  async setPreferences(
    actor: Actor,
    context: RequestContext,
    body: NotificationPreferences,
  ): Promise<NotificationPreferences> {
    const before = await this.preferences(actor);
    await this.prisma.$transaction(async (tx) => {
      for (const item of body.channels)
        await tx.notificationPreference.upsert({
          where: { userId_channel: { userId: actor.userId, channel: item.channel } },
          create: { userId: actor.userId, channel: item.channel, enabled: item.enabled },
          update: { enabled: item.enabled },
        });
      await this.audit.record(tx, context, {
        action: 'notification.preferences_updated',
        entityType: 'User',
        entityId: actor.userId,
        // Channel names would be masked as contact details if used as keys, so the switched-off channels are listed as values.
        before: { disabled: disabledOf(before) },
        after: { disabled: disabledOf(await this.preferencesIn(tx, actor.userId)) },
      });
    });
    return this.preferences(actor);
  }

  private async preferencesIn(db: Db, userId: string): Promise<NotificationPreferences> {
    const rows = await db.notificationPreference.findMany({
      where: { userId },
      select: { channel: true, enabled: true },
    });
    const byChannel = new Map(rows.map((row) => [row.channel, row.enabled]));
    return {
      channels: PREFERENCE_CHANNELS.map((channel) => ({
        channel,
        enabled: byChannel.get(channel) ?? true,
      })),
    };
  }

  // ---- the admin log ------------------------------------------------------------------------------------------
  async log(query: NotificationLogQuery): Promise<CursorPage<NotificationLogRow>> {
    const where: Prisma.NotificationWhereInput = {
      deletedAt: null,
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.eventKey ? { templateKey: query.eventKey } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.user
        ? {
            user: {
              OR: [
                { name: { contains: query.user, mode: 'insensitive' } },
                { email: { contains: query.user, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const { rows, nextCursor, total } = await readPage({
      limit: query.limit,
      cursor: query.cursor,
      keyOf: (row: { id: string }) => row.id,
      find: ({ take, skip, cursorKey }) =>
        this.prisma.notification.findMany({
          where,
          select: {
            id: true,
            createdAt: true,
            templateKey: true,
            channel: true,
            status: true,
            locale: true,
            provider: true,
            attempts: true,
            lastError: true,
            sentAt: true,
            deliveredAt: true,
            readAt: true,
            failedAt: true,
            userId: true,
            caseId: true,
            user: { select: { name: true, email: true } },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take,
          ...(skip ? { skip } : {}),
          ...(cursorKey ? { cursor: { id: cursorKey } } : {}),
        }),
      count: () => this.prisma.notification.count({ where }),
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        eventKey: row.templateKey,
        channel: row.channel,
        status: row.status,
        locale: row.locale,
        provider: row.provider,
        attempts: row.attempts,
        lastError: row.lastError,
        sentAt: iso(row.sentAt),
        deliveredAt: iso(row.deliveredAt),
        readAt: iso(row.readAt),
        failedAt: iso(row.failedAt),
        userId: row.userId,
        userName: row.user.name,
        userEmail: row.user.email,
        caseId: row.caseId,
      })),
      nextCursor,
      total,
    };
  }

  events(): { key: string; audience: string; category: string; channels: string[] }[] {
    return NOTIFICATION_EVENT_KEYS.map((key) => ({
      key,
      audience: NOTIFICATION_EVENTS[key].audience,
      category: NOTIFICATION_EVENTS[key].category,
      channels: [...NOTIFICATION_EVENTS[key].channels],
    }));
  }

  /** Sends the test event to a user (default: the admin themself) on every channel they have, ignoring their preferences. */
  async sendTest(
    actor: Actor,
    context: RequestContext,
    body: SendTest,
  ): Promise<{
    queued: { channel: SendResult['queued'][number]['channel']; id: string }[];
    skipped: { channel: SendResult['skipped'][number]['channel']; reason: string }[];
  }> {
    const userId = body.userId ?? actor.userId;
    const target = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!target) throw new NotFoundException('User not found');
    const result = await this.prisma.$transaction(async (tx) => {
      const sent = await enqueueNotification(tx, {
        eventKey: 'test_event',
        recipients: [target.id],
        data: { name: target.name },
        dedupeKey: `test:${randomUUID()}`,
        // A test the admin sends to themself ignores their own switches; to anyone else it respects the person's choices.
        ignorePreferences: target.id === actor.userId,
        ...(body.channels ? { channels: body.channels } : {}),
      });
      await this.audit.record(tx, context, {
        action: 'notification.test_sent',
        entityType: 'User',
        entityId: target.id,
        after: { channels: sent.queued.map((q) => q.channel) },
      });
      return sent;
    });
    return {
      queued: result.queued.map(({ channel, id }) => ({ channel, id })),
      skipped: result.skipped.map(({ channel, reason }) => ({ channel, reason })),
    };
  }
}
