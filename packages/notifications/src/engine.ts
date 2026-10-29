import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_MAX_ATTEMPTS,
  STATUS_RANK,
  WHATSAPP_SESSION_HOURS,
  type DeliverableChannel,
  type NotificationChannel,
  type NotificationEventKey,
  type StatusUpdate,
} from '@medtravel/contracts';
import { Prisma, type PrismaClient } from '@medtravel/db';
import { renderEmail, renderText, whatsappTemplate, type TemplateData } from './render.js';
import { PermanentDeliveryError, type Providers } from './providers/index.js';

/** A client or the transaction client of `$transaction`: `enqueue` is meant to run inside the caller's transaction. */
export type Db = Prisma.TransactionClient;

export interface SendInput {
  eventKey: NotificationEventKey;
  /** User ids. */
  recipients: readonly string[];
  data?: TemplateData;
  caseId?: string | null;
  /**
   * Names this occurrence (an outbox event id, `quote-<id>-3d`): sending the same event with the same key again changes
   * nothing, so a retried job or a repeated trigger never notifies twice.
   */
  dedupeKey: string;
  /** Use these channels instead of the event's own (the test event). */
  channels?: readonly NotificationChannel[];
  /** Send even where the person switched the channel off (a test the admin asked for). */
  ignorePreferences?: boolean;
}

export interface SendResult {
  queued: { userId: string; channel: NotificationChannel; id: string }[];
  skipped: { userId: string; channel: NotificationChannel; reason: string }[];
}

const isDeliverable = (channel: NotificationChannel): channel is DeliverableChannel =>
  channel === 'in_app' || channel === 'email' || channel === 'whatsapp' || channel === 'sms';

/**
 * Records a message for each person and channel and queues its delivery, inside the caller's transaction (CLAUDE.md: side effects
 * go through the outbox). In-app messages are written ready to read; the others are `queued` with an outbox event for the worker.
 * A channel is skipped when the person switched it off (never for in-app or security events), has no address for it, or the
 * account is not active.
 */
export async function enqueueNotification(db: Db, input: SendInput): Promise<SendResult> {
  const def = NOTIFICATION_EVENTS[input.eventKey];
  const data = input.data ?? {};
  const channels = (input.channels ?? def.channels).filter(isDeliverable);
  const result: SendResult = { queued: [], skipped: [] };
  if (input.recipients.length === 0) return result;

  const users = await db.user.findMany({
    where: { id: { in: [...input.recipients] }, deletedAt: null },
    select: {
      id: true,
      email: true,
      phone: true,
      language: true,
      status: true,
      emailVerifiedAt: true,
      phoneVerifiedAt: true,
    },
  });
  const preferences = await db.notificationPreference.findMany({
    where: { userId: { in: users.map((user) => user.id) }, enabled: false },
    select: { userId: true, channel: true },
  });
  const off = new Set(preferences.map((p) => `${p.userId}:${p.channel}`));

  for (const user of users) {
    for (const channel of channels) {
      const skip = (reason: string) => result.skipped.push({ userId: user.id, channel, reason });
      if (user.status !== 'active') {
        skip('account_not_active');
        continue;
      }
      if (channel === 'email' && !user.email) {
        skip('no_email');
        continue;
      }
      if ((channel === 'sms' || channel === 'whatsapp') && !user.phone) {
        skip('no_phone');
        continue;
      }
      const mustSend =
        channel === 'in_app' || def.category === 'security' || input.ignorePreferences;
      if (!mustSend && off.has(`${user.id}:${channel}`)) {
        skip('switched_off');
        continue;
      }

      const dedupeKey = `${input.dedupeKey}:${user.id}:${channel}`;
      const inApp = channel === 'in_app';
      const text = renderText(input.eventKey, user.language, data);
      // `ON CONFLICT DO NOTHING` on the unique key: a repeated or concurrent send of the same occurrence adds nothing, and does
      // not abort the caller's transaction the way a failed insert would.
      const created = await db.notification.createMany({
        skipDuplicates: true,
        data: [
          {
            dedupeKey,
            userId: user.id,
            channel,
            templateKey: input.eventKey,
            locale: text.locale,
            status: inApp ? 'sent' : 'queued',
            provider: inApp ? 'in_app' : null,
            sentAt: inApp ? new Date() : null,
            // The in-app message is the person's own inbox, so its text is kept; the other channels keep only the values
            // needed to render at delivery time, and the worker clears them once the message has gone.
            ...(inApp ? { title: text.title, body: text.body } : {}),
            data: data as Prisma.InputJsonValue,
            ...(input.caseId ? { caseId: input.caseId } : {}),
          },
        ],
      });
      if (created.count === 0) {
        skip('duplicate');
        continue;
      }
      const row = await db.notification.findUniqueOrThrow({
        where: { dedupeKey },
        select: { id: true },
      });
      if (!inApp)
        await db.outboxEvent.create({
          data: {
            type: 'notification.deliver',
            aggregateType: 'Notification',
            aggregateId: row.id,
            payload: { notificationId: row.id },
            dedupeKey: `notification.deliver:${row.id}`,
          },
        });
      result.queued.push({ userId: user.id, channel, id: row.id });
    }
  }
  return result;
}

export interface DeliverDeps {
  prisma: PrismaClient;
  providers: Providers;
  now?: () => Date;
}

const stringData = (value: Prisma.JsonValue | null): TemplateData => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const data: TemplateData = {};
  for (const [key, item] of Object.entries(value))
    if (typeof item === 'string' || typeof item === 'number') data[key] = item;
  return data;
};

/** True when the person wrote to us on WhatsApp in the last 24 hours, so free text (not only a template) is allowed. */
async function whatsappWindowOpen(deps: DeliverDeps, userId: string): Promise<boolean> {
  const since = new Date(
    (deps.now?.() ?? new Date()).getTime() - WHATSAPP_SESSION_HOURS * 3_600_000,
  );
  const message = await deps.prisma.message.findFirst({
    where: {
      channel: 'whatsapp',
      direction: 'inbound',
      createdAt: { gte: since },
      conversation: { kind: 'patient', case: { patient: { userId } } },
    },
    select: { id: true },
  });
  return message !== null;
}

/**
 * Sends one queued notification and records what happened. Safe to run twice: anything not `queued` is left alone. A provider
 * failure is counted and thrown, so the outbox retries with backoff, until `NOTIFICATION_MAX_ATTEMPTS`; a refusal the provider
 * marks final (a bad number) fails at once. Either way the failure is recorded on the row, and the values used to render the
 * message are removed once it has gone or has failed for good.
 */
export async function deliverNotification(
  deps: DeliverDeps,
  id: string,
): Promise<'sent' | 'failed' | 'skipped'> {
  const row = await deps.prisma.notification.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, phone: true, language: true, name: true, status: true } },
    },
  });
  if (!row || row.deletedAt || row.status !== 'queued') return 'skipped';
  const key = row.templateKey as NotificationEventKey;
  if (!(key in NOTIFICATION_EVENTS))
    return fail(deps, row.id, row.attempts + 1, 'unknown_event', true);
  const data = stringData(row.data);
  const attempts = row.attempts + 1;

  try {
    let sent: { id: string };
    let provider: string;
    if (row.channel === 'email') {
      if (!row.user.email) throw new PermanentDeliveryError('no_email');
      const mail = await renderEmail(key, row.user.language, data);
      sent = await deps.providers.email.send({ to: row.user.email, ...mail });
      provider = deps.providers.email.name;
    } else if (row.channel === 'sms') {
      if (!row.user.phone) throw new PermanentDeliveryError('no_phone');
      const text = renderText(key, row.user.language, data);
      sent = await deps.providers.sms.send({
        to: row.user.phone,
        text: `${text.title}: ${text.body}`,
      });
      provider = deps.providers.sms.name;
    } else if (row.channel === 'whatsapp') {
      if (!row.user.phone) throw new PermanentDeliveryError('no_phone');
      const text = renderText(key, row.user.language, data);
      const plain = `${text.title}\n${text.body}`;
      if (await whatsappWindowOpen(deps, row.userId)) {
        sent = await deps.providers.whatsapp.sendText({ to: row.user.phone, text: plain });
      } else {
        const template = whatsappTemplate(key, row.user.language, data);
        sent = await deps.providers.whatsapp.sendTemplate({
          to: row.user.phone,
          template: template.name,
          language: template.language,
          parameters: template.parameters,
          text: plain,
        });
      }
      provider = deps.providers.whatsapp.name;
    } else {
      return fail(deps, row.id, attempts, 'channel_not_supported', true);
    }
    await deps.prisma.notification.update({
      where: { id: row.id },
      data: {
        status: 'sent',
        sentAt: deps.now?.() ?? new Date(),
        provider,
        providerMessageId: sent.id,
        attempts,
        lastError: null,
        data: Prisma.DbNull,
      },
    });
    return 'sent';
  } catch (error) {
    const permanent = error instanceof PermanentDeliveryError;
    // The message of a provider error never carries the number or the text (the adapters see to that), so it can be kept.
    const reason = error instanceof Error ? error.message.slice(0, 300) : 'delivery failed';
    const final = permanent || attempts >= NOTIFICATION_MAX_ATTEMPTS;
    const outcome = await fail(deps, row.id, attempts, reason, final);
    if (final) return outcome;
    throw error;
  }
}

async function fail(
  deps: DeliverDeps,
  id: string,
  attempts: number,
  reason: string,
  final: boolean,
): Promise<'failed'> {
  await deps.prisma.notification.update({
    where: { id },
    data: {
      attempts,
      lastError: reason.slice(0, 500),
      ...(final
        ? { status: 'failed', failedAt: deps.now?.() ?? new Date(), data: Prisma.DbNull }
        : {}),
    },
  });
  return 'failed';
}

export type StatusOutcome = 'applied' | 'duplicate' | 'unknown' | 'ignored';

/**
 * Applies a provider's delivery callback. Each provider event is handled once (`ProcessedWebhook`), a message only moves forward
 * (sent, delivered, read), and a failure is recorded only for a message that has not been delivered. A callback for a message
 * we do not know yet (it can arrive before our own write of the provider id) is reported as `unknown` and not remembered, so the
 * provider's retry is applied later.
 */
export async function applyStatusUpdate(
  prisma: PrismaClient,
  provider: string,
  update: StatusUpdate,
): Promise<StatusOutcome> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.notification.findFirst({
      where: { providerMessageId: update.providerMessageId, provider },
      select: { id: true, status: true, deliveredAt: true },
    });
    if (!row) return 'unknown' as const;
    const seen = await tx.processedWebhook.createMany({
      data: [{ provider, eventId: update.eventId }],
      skipDuplicates: true,
    });
    if (seen.count === 0) return 'duplicate' as const;

    const current = STATUS_RANK[row.status] ?? 0;
    const next = STATUS_RANK[update.status] ?? 0;
    const at = update.at ? new Date(update.at) : new Date();
    if (update.status === 'failed') {
      if (row.status === 'delivered' || row.status === 'read' || row.status === 'failed')
        return 'ignored' as const;
      await tx.notification.update({
        where: { id: row.id },
        data: {
          status: 'failed',
          failedAt: at,
          lastError: (update.error ?? 'failed at provider').slice(0, 500),
        },
      });
      return 'applied' as const;
    }
    if (next <= current || row.status === 'failed') return 'ignored' as const;
    await tx.notification.update({
      where: { id: row.id },
      data: {
        status: update.status,
        ...(update.status === 'delivered' ? { deliveredAt: at } : {}),
        // A read receipt can arrive without a delivery receipt; the delivery time already recorded is kept.
        ...(update.status === 'read'
          ? { readAt: at, ...(row.deliveredAt ? {} : { deliveredAt: at }) }
          : {}),
      },
    });
    return 'applied' as const;
  });
}
