import type { OutboxEventRecord, PrismaClient } from '@medtravel/db';
import {
  makeThumbnail,
  matchesDeclaredType,
  pdfPageCount,
  ScanLimitError,
  type ScanVerdict,
  scanStream,
  sniffFileType,
  type ClamdOptions,
  type ObjectStore,
  type SniffedType,
} from '@medtravel/storage';
import { enqueueNotification } from '@medtravel/notifications';
import { z } from 'zod';

const payloadSchema = z.object({ documentId: z.uuid() });

/** Files up to this size are read into memory to count pages and make thumbnails; larger ones are only scanned. */
export const PROCESS_MAX_BYTES = 50 * 1024 * 1024;

export interface ProcessDeps {
  prisma: PrismaClient;
  store: ObjectStore;
  clamd: ClamdOptions;
}

async function readHead(store: ObjectStore, key: string): Promise<Buffer> {
  const stream = await store.getStream(key, 'bytes=0-4095');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** Moves the object out of reach and records why: the file is never offered for download again. */
async function quarantine(
  deps: ProcessDeps,
  doc: { id: string; storageKey: string; patientId: string | null; uploadedById: string | null },
  status: 'infected' | 'failed',
  detail: string,
): Promise<void> {
  const quarantined = `quarantine/${doc.storageKey}`;
  if (await deps.store.head(doc.storageKey)) await deps.store.copy(doc.storageKey, quarantined);
  await deps.prisma.$transaction(async (tx) => {
    await tx.document.update({
      where: { id: doc.id },
      data: {
        scanStatus: status,
        scanDetail: detail.slice(0, 200),
        scannedAt: new Date(),
        storageKey: quarantined,
      },
    });
    await tx.auditEvent.create({
      data: {
        action: 'document.quarantined',
        entityType: 'Document',
        entityId: doc.id,
        ...(doc.patientId ? { patientId: doc.patientId } : {}),
        after: { status, reason: detail.slice(0, 200) },
        requestId: 'worker',
      },
    });
    if (doc.uploadedById)
      await enqueueNotification(tx, {
        eventKey: 'document_quarantined',
        recipients: [doc.uploadedById],
        dedupeKey: `document-quarantined:${doc.id}`,
      });
  });
  await deps.store.delete(doc.storageKey);
}

/**
 * Handles `document.uploaded`: scan the object with ClamAV, check its first bytes match the declared type, then read the page
 * count and make a thumbnail, and mark the document clean. An infected file, a file that is not what it says it is, or one
 * that cannot be read is quarantined. A scanner that cannot be reached throws, so the outbox retries with backoff and the
 * document stays `pending`. Safe to run twice: a document that is no longer `pending` is left alone.
 */
export async function processUploadedDocument(
  deps: ProcessDeps,
  event: OutboxEventRecord,
): Promise<void> {
  const { documentId } = payloadSchema.parse(event.payload);
  const doc = await deps.prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      storageKey: true,
      mimeType: true,
      sizeBytes: true,
      scanStatus: true,
      deletedAt: true,
      patientId: true,
      uploadedById: true,
    },
  });
  if (!doc || doc.deletedAt || doc.scanStatus !== 'pending') return;

  if (!(await deps.store.head(doc.storageKey))) {
    await deps.prisma.document.update({
      where: { id: doc.id },
      data: { scanStatus: 'failed', scanDetail: 'object_missing', scannedAt: new Date() },
    });
    return;
  }

  let verdict: ScanVerdict;
  try {
    verdict = await scanStream(await deps.store.getStream(doc.storageKey), deps.clamd);
  } catch (error) {
    // Retrying cannot help a file the scanner will not read, and it must not be offered unscanned.
    if (error instanceof ScanLimitError) return quarantine(deps, doc, 'failed', 'scan_limit');
    throw error;
  }
  if (!verdict.clean) return quarantine(deps, doc, 'infected', verdict.signature);

  const sniffed: SniffedType | null = sniffFileType(await readHead(deps.store, doc.storageKey));
  if (!matchesDeclaredType(doc.mimeType, sniffed))
    return quarantine(deps, doc, 'failed', 'type_mismatch');

  let pageCount: number | null = null;
  let thumbnailKey: string | null = null;
  if (
    doc.sizeBytes <= PROCESS_MAX_BYTES &&
    (sniffed === 'pdf' || sniffed === 'jpeg' || sniffed === 'png')
  ) {
    try {
      const body = await deps.store.getBuffer(doc.storageKey, PROCESS_MAX_BYTES);
      if (sniffed === 'pdf') {
        pageCount = await pdfPageCount(body);
      } else {
        thumbnailKey = `thumbs/${doc.id}.webp`;
        await deps.store.put(thumbnailKey, await makeThumbnail(body), 'image/webp');
      }
    } catch {
      // A PDF or image that cannot be read is damaged or not what it seems.
      return quarantine(deps, doc, 'failed', 'unreadable');
    }
  }

  await deps.prisma.document.update({
    where: { id: doc.id },
    data: { scanStatus: 'clean', scannedAt: new Date(), pageCount, thumbnailKey },
  });
}
