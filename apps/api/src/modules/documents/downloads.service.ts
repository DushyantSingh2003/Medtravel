import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@medtravel/db';
import { WATERMARK_MAX_BYTES, type FileLink } from '@medtravel/contracts';
import {
  DOWNLOAD_URL_SECONDS,
  watermarkImage,
  watermarkPdf,
  watermarkText,
  type ObjectStore,
} from '@medtravel/storage';
import type { Actor } from '../../auth/actor.js';
import { AuditService } from '../../audit/audit.service.js';
import type { RequestContext } from '../../common/request-context.js';
import { PRISMA } from '../../database/database.module.js';
import { OBJECT_STORE } from '../../storage/storage.module.js';
import { DocumentsService } from './documents.service.js';

type Watermark = 'pdf' | 'jpeg' | 'png' | null;

/** What a file can be stamped as: PDF, JPEG and PNG up to the size limit. Everything else is delivered as stored. */
function watermarkKind(mimeType: string, sizeBytes: number): Watermark {
  if (sizeBytes > WATERMARK_MAX_BYTES) return null;
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpeg';
  if (mimeType === 'image/png') return 'png';
  return null;
}

/** A file name safe to put in a header and on disk: no path, no control or quote characters. */
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/]/g, '_')
    .replace(/[\p{Cc}"<>|:*?]/gu, '')
    .trim();
  return cleaned.slice(0, 120) || 'document';
}

/**
 * The only way to get a file out of the bucket: the actor must be allowed to see the document (ownership, role scope, a live
 * consent for hospitals; agents never) and it must have passed the virus scan. The access is audited before any link exists.
 * PDFs and JPEG/PNG images are stamped with the viewer's name, the date and the case number in a short-lived copy.
 */
@Injectable()
export class DownloadsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore,
    private readonly documents: DocumentsService,
    private readonly audit: AuditService,
  ) {}

  async link(
    actor: Actor,
    context: RequestContext,
    id: string,
    mode: 'download' | 'preview',
  ): Promise<FileLink> {
    const doc = await this.documents.findVisible(actor, id, {
      id: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      storageKey: true,
      scanStatus: true,
      patientId: true,
      case: { select: { caseNo: true } },
    });
    if (doc.scanStatus !== 'clean')
      throw new ConflictException({
        statusCode: 409,
        message:
          doc.scanStatus === 'pending'
            ? 'The file is still being checked for viruses'
            : 'This file did not pass the safety check and cannot be opened',
        code: 'not_clean',
      });

    const stamp = watermarkKind(doc.mimeType, doc.sizeBytes);
    await this.audit.recordAccess(context, {
      action: mode === 'download' ? 'document.downloaded' : 'document.viewed',
      entityType: 'Document',
      entityId: doc.id,
      patientId: doc.patientId,
      details: { watermarked: stamp !== null },
    });

    let key = doc.storageKey;
    if (stamp) {
      const viewer = await this.prisma.user.findUnique({
        where: { id: actor.userId },
        select: { name: true },
      });
      const text = watermarkText(viewer?.name ?? 'Unknown', new Date(), doc.case?.caseNo ?? null);
      const original = await this.store.getBuffer(doc.storageKey, WATERMARK_MAX_BYTES);
      const stamped =
        stamp === 'pdf'
          ? await watermarkPdf(original, text)
          : await watermarkImage(original, stamp, text);
      // A copy of its own for this viewer, under a prefix the bucket expires after a day.
      key = `watermarked/${doc.id}/${randomUUID()}`;
      await this.store.put(key, stamped, doc.mimeType);
    }
    const fileName = safeFileName(doc.fileName);
    const url = await this.store.presignGet(key, {
      expiresIn: DOWNLOAD_URL_SECONDS,
      fileName,
      inline: mode === 'preview',
      contentType: doc.mimeType,
    });
    return {
      url,
      expiresAt: new Date(Date.now() + DOWNLOAD_URL_SECONDS * 1000).toISOString(),
      watermarked: stamp !== null,
      fileName,
    };
  }

  /** The small preview image the worker made. Opening it is a view of the document, so it is audited too. */
  async thumbnail(
    actor: Actor,
    context: RequestContext,
    id: string,
  ): Promise<{ url: string; expiresAt: string }> {
    const doc = await this.documents.findVisible(actor, id, {
      id: true,
      scanStatus: true,
      thumbnailKey: true,
      patientId: true,
    });
    if (doc.scanStatus !== 'clean' || !doc.thumbnailKey)
      throw new ConflictException({
        statusCode: 409,
        message: 'There is no preview for this file',
        code: 'no_thumbnail',
      });
    await this.audit.recordAccess(context, {
      action: 'document.viewed',
      entityType: 'Document',
      entityId: doc.id,
      patientId: doc.patientId,
      details: { variant: 'thumbnail' },
    });
    const url = await this.store.presignGet(doc.thumbnailKey, {
      expiresIn: DOWNLOAD_URL_SECONDS,
      inline: true,
      contentType: 'image/webp',
    });
    return { url, expiresAt: new Date(Date.now() + DOWNLOAD_URL_SECONDS * 1000).toISOString() };
  }
}
