import { NextResponse, type NextRequest } from 'next/server';
import { isUiGalleryEnabled } from '../../../../../lib/ui-gallery';

/**
 * Demo and test endpoint, never served unless ENABLE_UI_GALLERY=true (see lib/ui-gallery.ts).
 *
 * Minimal in-memory imitation of the S3 multipart upload API, used only by the /ui-gallery demo so
 * the FileUploader can run a real multipart upload (create, upload parts, list parts, complete)
 * without AWS. Nothing is stored: only part sizes are tracked.
 *
 * A file whose name contains "flaky" fails its second part once, to demonstrate retry.
 */
export const dynamic = 'force-dynamic';

interface Upload {
  key: string;
  parts: Map<number, { etag: string; size: number }>;
  failedOnce: boolean;
  /** Every part upload that reached this endpoint, including the one that was made to fail. */
  partPuts: number;
}
const store = ((globalThis as { __uiGalleryS3?: Map<string, Upload> }).__uiGalleryS3 ??= new Map<
  string,
  Upload
>());
/** Oldest uploads are dropped beyond this, so the in-memory store cannot grow without bound. */
const MAX_UPLOADS = 100;

/** The key comes from the URL, so every value placed in the XML is escaped. */
const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const SAFE_HEADERS = {
  'content-type': 'application/xml; charset=utf-8',
  // The response is data for Uppy, never a document: do not sniff it into HTML, and sandbox it if
  // someone navigates to it.
  'x-content-type-options': 'nosniff',
  'content-security-policy': 'sandbox',
  'cache-control': 'no-store',
};

const xml = (body: string, status = 200) =>
  new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    status,
    headers: SAFE_HEADERS,
  });

/** Only the gallery page itself may call this: reject requests the browser marks as cross-site. */
function isSameOrigin(request: NextRequest): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return false;
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

type Context = { params: Promise<{ key: string[] }> };

async function handle(request: NextRequest, context: Context) {
  if (!isUiGalleryEnabled()) return new NextResponse(null, { status: 404 });
  if (!isSameOrigin(request)) return new NextResponse(null, { status: 403 });

  const { key: segments } = await context.params;
  // Next has already percent-decoded the path segments; decoding again would break names like "100%.pdf".
  const key = segments.join('/');
  const safeKey = escapeXml(key);
  const url = new URL(request.url);
  const uploadId = url.searchParams.get('uploadId');
  const partNumber = url.searchParams.get('partNumber');
  const method = request.method;

  // Inspection endpoint for tests: how many part uploads reached the "server".
  if (method === 'GET' && url.searchParams.has('stats')) {
    return NextResponse.json(
      [...store.entries()].map(([id, upload]) => ({
        uploadId: id,
        key: upload.key,
        parts: upload.parts.size,
        partPuts: upload.partPuts,
      })),
    );
  }

  if (method === 'POST' && url.searchParams.has('uploads')) {
    const id = `mock-${crypto.randomUUID()}`;
    store.set(id, { key, parts: new Map(), failedOnce: false, partPuts: 0 });
    for (const oldest of [...store.keys()].slice(0, Math.max(0, store.size - MAX_UPLOADS)))
      store.delete(oldest);
    return xml(
      `<InitiateMultipartUploadResult><Bucket>gallery</Bucket><Key>${safeKey}</Key><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`,
    );
  }

  const upload = uploadId ? store.get(uploadId) : undefined;

  if (method === 'PUT' && uploadId && partNumber) {
    if (!upload) return new NextResponse(null, { status: 404 });
    upload.partPuts += 1;
    const number = Number(partNumber);
    if (key.includes('flaky') && number === 2 && !upload.failedOnce) {
      upload.failedOnce = true;
      return new NextResponse('simulated failure', { status: 500 });
    }
    const body = await request.arrayBuffer();
    const etag = `"etag-${number}-${body.byteLength}"`;
    upload.parts.set(number, { etag, size: body.byteLength });
    return new NextResponse(null, { status: 200, headers: { etag } });
  }

  if (method === 'GET' && uploadId) {
    if (!upload) return new NextResponse(null, { status: 404 });
    const parts = [...upload.parts.entries()]
      .sort(([a], [b]) => a - b)
      .map(
        ([number, part]) =>
          `<Part><PartNumber>${number}</PartNumber><ETag>&quot;${part.etag.replace(/"/g, '')}&quot;</ETag><Size>${part.size}</Size></Part>`,
      )
      .join('');
    return xml(
      `<ListPartsResult><Bucket>gallery</Bucket><Key>${safeKey}</Key><UploadId>${escapeXml(uploadId ?? '')}</UploadId><IsTruncated>false</IsTruncated>${parts}</ListPartsResult>`,
    );
  }

  if (method === 'POST' && uploadId) {
    if (!upload) return new NextResponse(null, { status: 404 });
    return xml(
      `<CompleteMultipartUploadResult><Location>${escapeXml(url.origin)}/mock-bucket/${safeKey}</Location><Bucket>gallery</Bucket><Key>${safeKey}</Key><ETag>&quot;done&quot;</ETag></CompleteMultipartUploadResult>`,
    );
  }

  if (method === 'DELETE' && uploadId) {
    store.delete(uploadId);
    return new NextResponse(null, { status: 204 });
  }

  if (method === 'PUT') {
    // Single (non-multipart) upload. Nothing is stored, so the body is not read into memory.
    return new NextResponse(null, { status: 200, headers: { etag: '"single"' } });
  }

  return new NextResponse(null, { status: 400 });
}

export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
