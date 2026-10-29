import { Readable } from 'node:stream';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DOWNLOAD_URL_SECONDS,
  ObjectStore,
  matchesDeclaredType,
  makeThumbnail,
  pdfPageCount,
  ScanLimitError,
  scanStream,
  sniffFileType,
  watermarkImage,
  watermarkPdf,
  watermarkText,
} from './index.js';
import { EICAR, FakeClamd, FakeS3Server } from './testing/index.js';

const s3 = new FakeS3Server();
const clamd = new FakeClamd();
let store: ObjectStore;
let scannerPort = 0;

beforeAll(async () => {
  const { url } = await s3.start();
  scannerPort = (await clamd.start()).port;
  store = new ObjectStore({
    endpoint: url,
    region: 'us-east-1',
    accessKeyId: 'k',
    secretAccessKey: 's',
    bucket: 'private',
    forcePathStyle: true,
  });
});

afterAll(async () => {
  await s3.close();
  await clamd.close();
});

const blankPdf = async (pages: number) => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) doc.addPage([300, 400]);
  return Buffer.from(await doc.save());
};

describe('ObjectStore against a bucket', () => {
  it('reads, writes, copies and deletes objects', async () => {
    await store.put('a/one', Buffer.from('hello'), 'text/plain');
    expect(await store.head('a/one')).toEqual({ size: 5, contentType: 'text/plain' });
    expect((await store.getBuffer('a/one', 100)).toString()).toBe('hello');
    await expect(store.getBuffer('a/one', 3)).rejects.toThrow(/too large/);
    await store.copy('a/one', 'b/two');
    expect((await store.getBuffer('b/two', 100)).toString()).toBe('hello');
    await store.delete('a/one');
    expect(await store.head('a/one')).toBeNull();
    expect(await store.head('never/was')).toBeNull();
  });

  it('runs a multipart upload through presigned requests, as the browser does', async () => {
    const key = 'files/multi';
    const created = await fetch(await store.presignMultipart(key, { kind: 'create' }), {
      method: 'POST',
    });
    const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(await created.text())?.[1] as string;
    expect(uploadId).toBeTruthy();
    const parts = [Buffer.alloc(1000, 1), Buffer.alloc(500, 2)];
    const etags: string[] = [];
    for (const [i, part] of parts.entries()) {
      const res = await fetch(
        await store.presignMultipart(key, { kind: 'part', uploadId, partNumber: i + 1 }),
        {
          method: 'PUT',
          body: part,
        },
      );
      etags.push(res.headers.get('etag') ?? '');
    }
    const listed = await fetch(await store.presignMultipart(key, { kind: 'list', uploadId }));
    expect((await listed.text()).match(/<Part>/g)).toHaveLength(2);
    const body = `<CompleteMultipartUpload>${etags
      .map((etag, i) => `<Part><PartNumber>${i + 1}</PartNumber><ETag>${etag}</ETag></Part>`)
      .join('')}</CompleteMultipartUpload>`;
    const done = await fetch(await store.presignMultipart(key, { kind: 'complete', uploadId }), {
      method: 'POST',
      body,
    });
    expect(done.status).toBe(200);
    expect(await store.head(key)).toMatchObject({ size: 1500 });
  });

  it('hands out download links that live five minutes and name the file', async () => {
    await store.put('files/doc', Buffer.from('data'), 'application/pdf');
    const url = await store.presignGet('files/doc', { fileName: 'Report 1.pdf' });
    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe(String(DOWNLOAD_URL_SECONDS));
    const ok = await fetch(url);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-disposition')).toBe(
      "attachment; filename*=UTF-8''Report%201.pdf",
    );
    const inline = await fetch(await store.presignGet('files/doc', { inline: true }));
    expect(inline.headers.get('content-disposition')).toBe('inline');
    expect(s3.requests.at(-1)?.presignedFor).toBe(300);

    // Six minutes later the same link is refused by the bucket.
    s3.now = () => new Date(Date.now() + 6 * 60_000);
    expect((await fetch(url)).status).toBe(403);
    s3.now = () => new Date();
  });
});

describe('file helpers', () => {
  it('recognises the allowed formats by their first bytes, and nothing else', async () => {
    expect(sniffFileType(await blankPdf(1))).toBe('pdf');
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } })
      .png()
      .toBuffer();
    const jpg = await sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } })
      .jpeg()
      .toBuffer();
    expect(sniffFileType(png)).toBe('png');
    expect(sniffFileType(jpg)).toBe('jpeg');
    expect(sniffFileType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]))).toBe('zip');
    expect(
      sniffFileType(Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])),
    ).toBe('heic');
    expect(sniffFileType(Buffer.from('MZ\u0090\u0000executable'))).toBeNull();
    expect(sniffFileType(Buffer.from('<html>'))).toBeNull();
  });

  it('checks the declared type against the content', () => {
    expect(matchesDeclaredType('application/pdf', 'pdf')).toBe(true);
    expect(matchesDeclaredType('application/pdf', 'png')).toBe(false);
    expect(matchesDeclaredType('image/jpeg', 'zip')).toBe(false);
    expect(matchesDeclaredType('application/zip', 'zip')).toBe(true);
    expect(
      matchesDeclaredType(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'zip',
      ),
    ).toBe(true);
    expect(matchesDeclaredType('application/pdf', null)).toBe(false);
  });

  it('counts the pages of a PDF and watermarks every one of them', async () => {
    const pdf = await blankPdf(3);
    expect(await pdfPageCount(pdf)).toBe(3);
    const stamped = await watermarkPdf(
      pdf,
      watermarkText('Asha Rao', new Date('2026-10-29T10:00:00Z'), 'CASE-2026-000001'),
    );
    expect(await pdfPageCount(stamped)).toBe(3);
    expect(stamped.length).toBeGreaterThan(pdf.length);
    expect(stamped.equals(pdf)).toBe(false);
  });

  it('writes the watermark into the pixels of an image and keeps its format', async () => {
    const original = await sharp({
      create: { width: 600, height: 400, channels: 3, background: '#336699' },
    })
      .jpeg()
      .toBuffer();
    const stamped = await watermarkImage(
      original,
      'jpeg',
      'Asha Rao | 2026-10-29 | CASE-2026-000001',
    );
    expect(sniffFileType(stamped)).toBe('jpeg');
    expect(await sharp(stamped).metadata()).toMatchObject({ width: 600, height: 400 });
    const before = await sharp(original).raw().toBuffer();
    const after = await sharp(stamped).raw().toBuffer();
    expect(after.equals(before)).toBe(false);

    const png = await sharp({
      create: { width: 300, height: 300, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    expect(sniffFileType(await watermarkImage(png, 'png', 'x'))).toBe('png');
  });

  it('makes a thumbnail no bigger than 320 pixels', async () => {
    const big = await sharp({
      create: { width: 2000, height: 1000, channels: 3, background: 'green' },
    })
      .jpeg()
      .toBuffer();
    const thumb = await makeThumbnail(big);
    const meta = await sharp(thumb).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(320);
  });

  it('keeps a watermark to one tidy line', () => {
    expect(watermarkText('A\nB\u0000C', new Date('2026-01-02T00:00:00Z'), null)).toBe(
      'A B C | 2026-01-02 | -',
    );
  });
});

describe('scanStream against clamd', () => {
  const options = () => ({ host: '127.0.0.1', port: scannerPort, timeoutMs: 5000 });

  it('says clean for an ordinary stream, however large', async () => {
    const big = Readable.from(
      (function* () {
        for (let i = 0; i < 200; i += 1) yield Buffer.alloc(100_000, i);
      })(),
    );
    expect(await scanStream(big, options())).toEqual({ clean: true });
  });

  it('names the signature when the stream holds the test virus, even split across chunks', async () => {
    const half = Math.floor(EICAR.length / 2);
    const parts = [
      Buffer.from('prefix'),
      Buffer.from(EICAR.slice(0, half)),
      Buffer.from(EICAR.slice(half)),
      Buffer.from('suffix'),
    ];
    expect(await scanStream(Readable.from(parts), options())).toEqual({
      clean: false,
      signature: 'Eicar-Test-Signature',
    });
  });

  it('says so, instead of failing like an outage, when the scanner will not read a file that large', async () => {
    clamd.sizeLimit = true;
    await expect(scanStream(Readable.from([Buffer.from('x')]), options())).rejects.toBeInstanceOf(
      ScanLimitError,
    );
    clamd.sizeLimit = false;
  });

  it('fails, so the caller retries, when the scanner errors or is not there', async () => {
    clamd.failing = true;
    await expect(scanStream(Readable.from([Buffer.from('x')]), options())).rejects.toThrow(
      /unexpected answer/,
    );
    clamd.failing = false;
    await expect(
      scanStream(Readable.from([Buffer.from('x')]), {
        host: '127.0.0.1',
        port: 1,
        timeoutMs: 1000,
      }),
    ).rejects.toThrow();
  });
});
