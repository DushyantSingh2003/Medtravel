import {
  ConflictException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, PrismaClient } from '@medtravel/db';
import type { CursorPage, MasterListQuery, MasterResource, MasterRow } from '@medtravel/contracts';
import { AuditService } from '../../audit/audit.service.js';
import { decodeCursor } from '../../common/cursor.js';
import type { RequestContext } from '../../common/request-context.js';
import { PRISMA } from '../../database/database.module.js';
import { OutboxService } from '../../outbox/outbox.service.js';
import { MASTER_ADAPTERS, MASTER_ENTITY_TYPES } from './adapters/index.js';
import { fieldError, type MasterAdapter } from './master-adapter.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[A-Za-z0-9-]{2,8}$/;

type Change = 'created' | 'updated' | 'deleted' | 'restored';

/** Prisma's error codes this service turns into answers; anything else is a bug and propagates as a 500. */
function prismaCode(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
}

@Injectable()
export class MastersService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async list(resource: MasterResource, query: MasterListQuery): Promise<CursorPage<MasterRow>> {
    const adapter = MASTER_ADAPTERS[resource];
    // A cursor is a key of this table; one that is not is a forged or stale cursor, not a server error.
    if (query.cursor && !this.isKey(adapter, decodeCursor(query.cursor))) {
      throw fieldError(HttpStatus.BAD_REQUEST, 'cursor', 'Invalid cursor');
    }
    const { rows, nextCursor, total } = await adapter.list(this.prisma, query);
    return { items: rows, nextCursor, total };
  }

  async get(resource: MasterResource, key: string): Promise<MasterRow> {
    const adapter = MASTER_ADAPTERS[resource];
    return this.found(await adapter.get(this.prisma, this.validKey(adapter, key)));
  }

  create(resource: MasterResource, body: unknown, context: RequestContext): Promise<MasterRow> {
    const adapter = MASTER_ADAPTERS[resource];
    return this.write(resource, 'created', context, async (tx) => {
      const after = await this.translateErrors(adapter, () => adapter.create(tx, body));
      return { after };
    });
  }

  update(
    resource: MasterResource,
    key: string,
    body: unknown,
    context: RequestContext,
  ): Promise<MasterRow> {
    const adapter = MASTER_ADAPTERS[resource];
    const validKey = this.validKey(adapter, key);
    return this.write(resource, 'updated', context, async (tx) => {
      const before = this.found(await adapter.get(tx, validKey));
      if (before.deletedAt) throw this.deletedConflict();
      const after = await this.translateErrors(adapter, () => adapter.update(tx, validKey, body));
      return { before, after };
    });
  }

  /** Soft delete. Tables without `deletedAt` (countries, languages, currencies) are deactivated instead. */
  remove(resource: MasterResource, key: string, context: RequestContext): Promise<MasterRow> {
    const adapter = MASTER_ADAPTERS[resource];
    if (!adapter.definition.softDelete) {
      throw fieldError(
        HttpStatus.CONFLICT,
        'id',
        'This kind of record cannot be deleted. Deactivate it instead.',
      );
    }
    const validKey = this.validKey(adapter, key);
    return this.write(resource, 'deleted', context, async (tx) => {
      const before = this.found(await adapter.get(tx, validKey));
      if (before.deletedAt) throw this.deletedConflict();
      return { before, after: await adapter.setDeleted(tx, validKey, true) };
    });
  }

  restore(resource: MasterResource, key: string, context: RequestContext): Promise<MasterRow> {
    const adapter = MASTER_ADAPTERS[resource];
    if (!adapter.definition.softDelete) {
      throw fieldError(
        HttpStatus.CONFLICT,
        'id',
        'This kind of record is never deleted, so there is nothing to restore.',
      );
    }
    const validKey = this.validKey(adapter, key);
    return this.write(resource, 'restored', context, async (tx) => {
      const before = this.found(await adapter.get(tx, validKey));
      if (!before.deletedAt)
        throw fieldError(HttpStatus.CONFLICT, 'id', 'This record is not deleted');
      return { before, after: await adapter.setDeleted(tx, validKey, false) };
    });
  }

  /** Runs a change, then writes its audit row and outbox event in the same transaction. */
  private write(
    resource: MasterResource,
    change: Change,
    context: RequestContext,
    run: (tx: Prisma.TransactionClient) => Promise<{ before?: MasterRow; after: MasterRow }>,
  ): Promise<MasterRow> {
    return this.prisma.$transaction(async (tx) => {
      const { before, after } = await run(tx);
      const entityType = MASTER_ENTITY_TYPES[resource];
      await this.audit.record(tx, context, {
        action: `master_data.${change}`,
        entityType,
        entityId: after.id,
        before: before ?? null,
        after,
      });
      await this.outbox.publish(tx, {
        type: `master.${change}`,
        aggregateType: entityType,
        aggregateId: after.id,
        payload: { resource, id: after.id },
      });
      return after;
    });
  }

  private isKey(adapter: MasterAdapter, key: string): boolean {
    return adapter.definition.keyKind === 'uuid' ? UUID.test(key) : CODE.test(key);
  }

  private validKey(adapter: MasterAdapter, key: string): string {
    if (!this.isKey(adapter, key)) throw new NotFoundException('Not found');
    return key;
  }

  private found(row: MasterRow | null): MasterRow {
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  private deletedConflict(): ConflictException {
    return new ConflictException({
      statusCode: HttpStatus.CONFLICT,
      message: 'This record is deleted. Restore it first.',
      errors: [{ path: ['id'], message: 'This record is deleted. Restore it first.' }],
    });
  }

  /** A duplicate key or slug is the admin's mistake and is shown on that field; the rest is not ours to hide. */
  private async translateErrors<T>(adapter: MasterAdapter, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (prismaCode(error) === 'P2002') {
        const field = adapter.definition.fields.some((f) => f.name === 'slug') ? 'slug' : 'code';
        throw fieldError(HttpStatus.CONFLICT, field, `This ${field} is already used`);
      }
      if (prismaCode(error) === 'P2025') throw new NotFoundException('Not found');
      throw error;
    }
  }
}
