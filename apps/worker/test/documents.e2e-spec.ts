import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '@medtravel/db';
import { ObjectStore } from '@medtravel/storage';
import { EICAR, FakeClamd, FakeS3Server } from '@medtravel/storage/testing';
import { OutboxDispatcher } from '../src/outbox/outbox-dispatcher.service.js';

/** What the worker does with an uploaded file, against a real database, an in-memory bucket and a fake clamd. */

const baseUrl =
  process.env['DATABASE_URL'] ?? 'postgresql://medtravel:medtravel@localhost:5432/medtravel';
const dbName = `workerdocs_${randomBytes(4).toString('hex')}`;
const urlFor = (name: string) => {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
};
const BUCKET = 'docs-private';

let admin: PrismaClient;
let prisma: PrismaClient;
let dispatcher: OutboxDispatcher;
let store: ObjectStore;
const s3 = new FakeS3Server();
const clamd = new FakeClamd();
let patientId: string;
let uploaderId: string;

const pdf = async (pages: number) => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) doc.addPage([200, 200]);
  return Buffer.from(await doc.save());
};
const png = () =>
  sharp({ create: { width: 1200, height: 800, channels: 3, background: '#aa3322' } })
    .png()
    .toBuffer();
const zip = () => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), randomBytes(5000)]);

/** An uploaded document waiting for its scan, with its object in the bucket and the event the API would have queued. */
async function uploaded(content: Buffer | null, mimeType: string) {
  const key = `files/${randomUUID()}`;
  if (content) s3.put(BUCKET, key, content, mimeType);
  const doc = await prisma.document.create({
    data: {
      kind: 'report',
      fileName: 'file',
      mimeType,
      sizeBytes: content?.length ?? 10,
      storageKey: key,
      scanStatus: 'pending',
      patientId,
      uploadedById: uploaderId,
    },
  });
  const event = await prisma.outboxEvent.create({
    data: {
      type: 'document.uploaded',
      aggregateType: 'Document',
      aggregateId: doc.id,
      payload: { documentId: doc.id },
    },
  });
  return { doc, key, event };
}
const reload = (id: string) => prisma.document.findUniqueOrThrow({ where: { id } });

beforeAll(async () => {
  admin = createPrismaClient({ connectionString: baseUrl });
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy', '--config', 'prisma7.config.ts'], {
    cwd: new URL('../../../packages/db', import.meta.url),
    env: { ...process.env, DATABASE_URL: urlFor(dbName) },
    stdio: 'pipe',
  });
  prisma = createPrismaClient({ connectionString: urlFor(dbName) });
  const { url } = await s3.start();
  const { port } = await clamd.start();
  store = new ObjectStore({
    endpoint: url,
    region: 'us-east-1',
    accessKeyId: 'k',
    secretAccessKey: 's',
    bucket: BUCKET,
    forcePathStyle: true,
  });
  dispatcher = new OutboxDispatcher(prisma, store, { CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: port });
  patientId = (await prisma.patient.create({ data: { fullName: 'Asha' } })).id;
  uploaderId = (
    await prisma.user.create({ data: { email: 'up@worker.test', name: 'Up', role: 'patient' } })
  ).id;
});

afterAll(async () => {
  await s3.close();
  await clamd.close();
  await prisma?.$disconnect();
  await admin?.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin?.$disconnect();
});

beforeEach(() => {
  clamd.failing = false;
  clamd.sizeLimit = false;
});

describe('document.uploaded', () => {
  it('marks a clean PDF clean and counts its pages', async () => {
    const { doc, event } = await uploaded(await pdf(3), 'application/pdf');
    await dispatcher.runOnce();
    expect(await reload(doc.id)).toMatchObject({
      scanStatus: 'clean',
      pageCount: 3,
      thumbnailKey: null,
      scanDetail: null,
    });
    expect((await reload(doc.id)).scannedAt).not.toBeNull();
    expect((await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(
      'processed',
    );
  });

  it('makes a thumbnail of a clean image and keeps the original where it was', async () => {
    const { doc, key } = await uploaded(await png(), 'image/png');
    await dispatcher.runOnce();
    const row = await reload(doc.id);
    expect(row).toMatchObject({
      scanStatus: 'clean',
      thumbnailKey: `thumbs/${doc.id}.webp`,
      storageKey: key,
    });
    const thumb = await sharp(await store.getBuffer(`thumbs/${doc.id}.webp`, 1_000_000)).metadata();
    expect(thumb.format).toBe('webp');
    expect(Math.max(thumb.width ?? 0, thumb.height ?? 0)).toBe(320);
    expect(s3.get(BUCKET, key)).toBeDefined();
  });

  it('only scans a ZIP, however large, and marks it clean', async () => {
    const { doc } = await uploaded(zip(), 'application/zip');
    await dispatcher.runOnce();
    expect(await reload(doc.id)).toMatchObject({
      scanStatus: 'clean',
      pageCount: null,
      thumbnailKey: null,
    });
  });

  it('quarantines an infected file: moved out of reach, marked with the signature, the audit trail and the uploader told', async () => {
    const { doc, key } = await uploaded(
      Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from(EICAR)]),
      'application/pdf',
    );
    await dispatcher.runOnce();
    const row = await reload(doc.id);
    expect(row).toMatchObject({
      scanStatus: 'infected',
      scanDetail: 'Eicar-Test-Signature',
      storageKey: `quarantine/${key}`,
    });
    expect(s3.get(BUCKET, key)).toBeUndefined();
    expect(s3.get(BUCKET, `quarantine/${key}`)).toBeDefined();
    expect(
      await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'document.quarantined', entityId: doc.id },
      }),
    ).toMatchObject({
      patientId,
      after: { status: 'infected', reason: 'Eicar-Test-Signature' },
    });
    expect(
      await prisma.notification.count({
        where: {
          userId: uploaderId,
          templateKey: 'document.quarantined',
          data: { path: ['documentId'], equals: doc.id },
        },
      }),
    ).toBe(1);
  });

  it('quarantines a file that is not what it says it is, and a PDF or image that cannot be read', async () => {
    const wrong = await uploaded(await png(), 'application/pdf');
    const broken = await uploaded(
      Buffer.concat([Buffer.from('%PDF-1.7 this is not really a pdf'), randomBytes(500)]),
      'application/pdf',
    );
    const script = await uploaded(Buffer.from('MZ\u0090\u0000 an executable'), 'application/zip');
    await dispatcher.runOnce();
    expect(await reload(wrong.doc.id)).toMatchObject({
      scanStatus: 'failed',
      scanDetail: 'type_mismatch',
    });
    expect(await reload(broken.doc.id)).toMatchObject({
      scanStatus: 'failed',
      scanDetail: 'unreadable',
    });
    expect(await reload(script.doc.id)).toMatchObject({
      scanStatus: 'failed',
      scanDetail: 'type_mismatch',
    });
    for (const item of [wrong, broken, script]) expect(s3.get(BUCKET, item.key)).toBeUndefined();
  });

  it('retries when the scanner is down, leaves the document pending, and finishes when it is back', async () => {
    const { doc, event } = await uploaded(await pdf(1), 'application/pdf');
    clamd.failing = true;
    await dispatcher.runOnce();
    expect((await reload(doc.id)).scanStatus).toBe('pending');
    expect(await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({
      status: 'pending',
      attempts: 1,
    });

    clamd.failing = false;
    await prisma.outboxEvent.update({ where: { id: event.id }, data: { availableAt: new Date() } });
    await dispatcher.runOnce();
    expect((await reload(doc.id)).scanStatus).toBe('clean');
  });

  it('quarantines a file the scanner will not read, instead of retrying forever or offering it unscanned', async () => {
    const { doc, event } = await uploaded(await pdf(1), 'application/pdf');
    clamd.sizeLimit = true;
    await dispatcher.runOnce();
    expect(await reload(doc.id)).toMatchObject({ scanStatus: 'failed', scanDetail: 'scan_limit' });
    expect(
      (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).status,
    ).not.toBe('pending');
  });

  it('marks a document whose object is gone as failed, and ignores a repeated or deleted one', async () => {
    const gone = await uploaded(null, 'application/pdf');
    const done = await uploaded(await pdf(2), 'application/pdf');
    const deleted = await uploaded(await pdf(1), 'application/pdf');
    await prisma.document.update({
      where: { id: deleted.doc.id },
      data: { deletedAt: new Date() },
    });
    await dispatcher.runOnce();
    expect(await reload(gone.doc.id)).toMatchObject({
      scanStatus: 'failed',
      scanDetail: 'object_missing',
    });
    expect((await reload(deleted.doc.id)).scanStatus).toBe('pending');

    const scans = clamd.scans;
    await prisma.outboxEvent.create({
      data: {
        type: 'document.uploaded',
        aggregateType: 'Document',
        aggregateId: done.doc.id,
        payload: { documentId: done.doc.id },
      },
    });
    await dispatcher.runOnce();
    expect(clamd.scans).toBe(scans);
    expect(await reload(done.doc.id)).toMatchObject({ scanStatus: 'clean', pageCount: 2 });
  });
});
