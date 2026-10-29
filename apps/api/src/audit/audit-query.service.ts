import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@medtravel/db';
import {
  AUDIT_EXPORT_MAX_ROWS,
  type AuditEventView,
  type AuditFilters,
  type CursorPage,
} from '@medtravel/contracts';
import { decodeCursor, readPage } from '../common/cursor.js';
import { PRISMA } from '../database/database.module.js';

/** The total reports at most this many rows. */
export const AUDIT_TOTAL_CAP = 10_001;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = Prisma.AuditEventGetPayload<Record<string, never>>;

const asObject = (value: Prisma.JsonValue | null): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Reads the audit trail for the admin screen and the export: filters, cursor paging, actor names. */
@Injectable()
export class AuditQueryService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** The filter as a Prisma `where`, or null when the actor text matches nobody (so the answer is empty). */
  private async where(filters: AuditFilters): Promise<Prisma.AuditEventWhereInput | null> {
    const and: Prisma.AuditEventWhereInput[] = [];
    if (filters.actor) {
      const people = await this.prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: filters.actor, mode: 'insensitive' } },
            { email: { contains: filters.actor, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
        take: 1000,
      });
      if (people.length === 0) return null;
      and.push({ actorId: { in: people.map((person) => person.id) } });
    }
    if (filters.actorId) and.push({ actorId: filters.actorId });
    if (filters.entityType) and.push({ entityType: filters.entityType });
    if (filters.entityId) and.push({ entityId: filters.entityId });
    if (filters.patientId) and.push({ patientId: filters.patientId });
    if (filters.action)
      and.push(
        filters.action.endsWith('.')
          ? { action: { startsWith: filters.action } }
          : { action: filters.action },
      );
    if (filters.from || filters.to)
      and.push({
        createdAt: {
          ...(filters.from ? { gte: new Date(filters.from) } : {}),
          ...(filters.to ? { lte: new Date(filters.to) } : {}),
        },
      });
    return and.length ? { AND: and } : {};
  }

  /** Adds the actor's name and email to each row with one query for all of them. */
  private async withActors(rows: Row[]): Promise<AuditEventView[]> {
    const ids = [...new Set(rows.flatMap((row) => (row.actorId ? [row.actorId] : [])))];
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const byId = new Map(users.map((user) => [user.id, user]));
    return rows.map((row) => {
      const actor = row.actorId ? byId.get(row.actorId) : undefined;
      return {
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        actorId: row.actorId,
        actorName: actor?.name ?? null,
        actorEmail: actor?.email ?? null,
        actorRole: row.actorRole,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        patientId: row.patientId,
        before: asObject(row.before),
        after: asObject(row.after),
        ip: row.ip,
        userAgent: row.userAgent,
        requestId: row.requestId,
      };
    });
  }

  async list(
    filters: AuditFilters,
    page: { cursor?: string | undefined; limit: number },
  ): Promise<CursorPage<AuditEventView>> {
    const where = await this.where(filters);
    if (!where) return { items: [], nextCursor: null, total: 0 };
    // A cursor is the id of a row; anything else is a forged or stale cursor.
    if (page.cursor && !UUID.test(decodeCursor(page.cursor)))
      throw new BadRequestException({
        message: 'Invalid cursor',
        errors: [{ path: ['cursor'], message: 'Invalid cursor' }],
      });
    const { rows, nextCursor, total } = await readPage<Row>({
      limit: page.limit,
      cursor: page.cursor,
      keyOf: (row) => row.id,
      find: ({ take, skip, cursorKey }) =>
        this.prisma.auditEvent.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take,
          ...(skip ? { skip } : {}),
          ...(cursorKey ? { cursor: { id: cursorKey } } : {}),
        }),
      // Counting a huge table on every page is slow; past the cap the total just says "at least this many".
      count: () => this.prisma.auditEvent.count({ where, take: AUDIT_TOTAL_CAP }),
    });
    return { items: await this.withActors(rows), nextCursor, total };
  }

  /** Up to `AUDIT_EXPORT_MAX_ROWS` rows, newest first, for the CSV, and whether more matched than were returned. */
  async forExport(
    filters: AuditFilters,
  ): Promise<{ events: AuditEventView[]; truncated: boolean }> {
    const where = await this.where(filters);
    if (!where) return { events: [], truncated: false };
    const rows = await this.prisma.auditEvent.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: AUDIT_EXPORT_MAX_ROWS + 1,
    });
    const truncated = rows.length > AUDIT_EXPORT_MAX_ROWS;
    return { events: await this.withActors(rows.slice(0, AUDIT_EXPORT_MAX_ROWS)), truncated };
  }
}
