import { NextResponse, type NextRequest } from 'next/server';
import { isUiGalleryEnabled } from '../../../../../lib/ui-gallery';

/**
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

const xml = (body: string, status = 200) =>
  new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    status,
    headers: { 'content-type': 'application/xml' },
  });

type Context = { params: Promise<{ key: string[] }> };

async function handle(request: NextRequest, context: Context) {
  if (!isUiGalleryEnabled()) return new NextResponse(null, { status: 404 });

  const { key: segments } = await context.params;
  const key = segments.map(decodeURIComponent).join('/');
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
    const id = `mock-${Math.random().toString(36).slice(2, 10)}`;
    store.set(id, { key, parts: new Map(), failedOnce: false, partPuts: 0 });
    return xml(
      `<InitiateMultipartUploadResult><Bucket>gallery</Bucket><Key>${key}</Key><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`,
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
      `<ListPartsResult><Bucket>gallery</Bucket><Key>${key}</Key><UploadId>${uploadId}</UploadId><IsTruncated>false</IsTruncated>${parts}</ListPartsResult>`,
    );
  }

  if (method === 'POST' && uploadId) {
    if (!upload) return new NextResponse(null, { status: 404 });
    return xml(
      `<CompleteMultipartUploadResult><Location>${url.origin}/mock-bucket/${key}</Location><Bucket>gallery</Bucket><Key>${key}</Key><ETag>&quot;done&quot;</ETag></CompleteMultipartUploadResult>`,
    );
  }

  if (method === 'DELETE' && uploadId) {
    store.delete(uploadId);
    return new NextResponse(null, { status: 204 });
  }

  if (method === 'PUT') {
    // Single (non-multipart) upload.
    const body = await request.arrayBuffer();
    return new NextResponse(null, {
      status: 200,
      headers: { etag: `"single-${body.byteLength}"` },
    });
  }

  return new NextResponse(null, { status: 400 });
}

export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
