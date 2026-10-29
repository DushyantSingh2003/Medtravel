import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@medtravel/db';
import type {
  CursorPage,
  DocumentListQuery,
  DocumentView,
  UpdateDocument,
} from '@medtravel/contracts';
import type { Actor } from '../../auth/actor.js';
import { AuditService } from '../../audit/audit.service.js';
import { readPage } from '../../common/cursor.js';
import type { RequestContext } from '../../common/request-context.js';
import { PRISMA } from '../../database/database.module.js';
import { ScopeService } from '../../rbac/scope.service.js';
import { DOCUMENT_SELECT, toDocumentView } from './document-view.js';

/** Listing, reading, updating and deleting documents. Everything is filtered through the actor's document scope first. */
@Injectable()
export class DocumentsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  /** The document if the actor may see it; otherwise it does not exist as far as they are concerned. */
  async findVisible<S extends Prisma.DocumentSelect>(actor: Actor, id: string, select: S) {
    const found = await this.prisma.document.findFirst({
      where: { AND: [{ id }, await this.scope.documentWhere(actor)] },
      select,
    });
    if (!found) throw new NotFoundException('Document not found');
    return found;
  }

  async list(actor: Actor, query: DocumentListQuery): Promise<CursorPage<DocumentView>> {
    const where: Prisma.DocumentWhereInput = {
      AND: [
        await this.scope.documentWhere(actor),
        {
          ...(query.caseId ? { caseId: query.caseId } : {}),
          ...(query.patientId ? { patientId: query.patientId } : {}),
          ...(query.kind ? { kind: query.kind } : {}),
        },
      ],
    };
    const { rows, nextCursor, total } = await readPage({
      limit: query.limit,
      cursor: query.cursor,
      keyOf: (row: { id: string }) => row.id,
      find: ({ take, skip, cursorKey }) =>
        this.prisma.document.findMany({
          where,
          select: DOCUMENT_SELECT,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take,
          ...(skip ? { skip } : {}),
          ...(cursorKey ? { cursor: { id: cursorKey } } : {}),
        }),
      count: () => this.prisma.document.count({ where }),
    });
    return { items: rows.map((row) => toDocumentView(row, actor.role)), nextCursor, total };
  }

  async get(actor: Actor, id: string): Promise<DocumentView> {
    return toDocumentView(await this.findVisible(actor, id, DOCUMENT_SELECT), actor.role);
  }

  async update(
    actor: Actor,
    context: RequestContext,
    id: string,
    body: UpdateDocument,
  ): Promise<DocumentView> {
    const before = await this.findVisible(actor, id, DOCUMENT_SELECT);
    if (body.typeId) {
      const type = await this.prisma.documentType.findFirst({
        where: { id: body.typeId, deletedAt: null },
        select: { id: true },
      });
      if (!type) throw new BadRequestException('Unknown document type');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.document.update({
        where: { id },
        data: {
          ...(body.kind ? { kind: body.kind } : {}),
          ...(body.typeId !== undefined ? { typeId: body.typeId } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
        },
        select: DOCUMENT_SELECT,
      });
      await this.audit.record(tx, context, {
        action: 'document.updated',
        entityType: 'Document',
        entityId: id,
        patientId: row.patientId,
        before: { kind: before.kind, typeId: before.typeId, notes: before.notes },
        after: { kind: row.kind, typeId: row.typeId, notes: row.notes },
      });
      return row;
    });
    return toDocumentView(updated, actor.role);
  }

  /** Soft delete: the row and the object stay (retention removes them); the document disappears from every list. */
  async remove(actor: Actor, context: RequestContext, id: string): Promise<void> {
    const doc = await this.findVisible(actor, id, { id: true, patientId: true, kind: true });
    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.record(tx, context, {
        action: 'document.deleted',
        entityType: 'Document',
        entityId: id,
        patientId: doc.patientId,
        before: { kind: doc.kind },
      });
    });
  }
}
