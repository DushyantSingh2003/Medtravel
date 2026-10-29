import { createHash, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

interface StoredObject {
  body: Buffer;
  contentType: string;
}

interface Upload {
  bucket: string;
  key: string;
  parts: Map<number, { body: Buffer; etag: string }>;
}

export interface FakeS3Request {
  method: string;
  path: string;
  /** `X-Amz-Expires` of a presigned request, in seconds; null when the request was signed with a header. */
  presignedFor: number | null;
}

const xml = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>${body}`;
const escapeXml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const md5 = (data: Buffer) => `"${createHash('md5').update(data).digest('hex')}"`;

/** AWS-style compact ISO time, `20261029T101500Z`, to a Date. */
function parseAmzDate(value: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  return m ? new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!)) : null;
}

/**
 * A small S3-compatible server for tests and for running the platform without MinIO: path-style requests, multipart uploads
 * with presigned URLs, object read, write, copy and delete, CORS for the browser. It keeps everything in memory.
 *
 * It does not verify signatures, but it does what a real bucket does with time: a presigned request older than its
 * `X-Amz-Expires` is refused (403 `ExpiredToken`), and an `X-Amz-Expires` above seven days is refused too. It records every
 * request so tests can assert how long the links they handed out live.
 */
export class FakeS3Server {
  readonly objects = new Map<string, StoredObject>();
  readonly requests: FakeS3Request[] = [];
  private readonly uploads = new Map<string, Upload>();
  private server: Server | undefined;
  /** Replaced in tests that need to travel in time. */
  now: () => Date = () => new Date();

  /** The key of an object as `bucket/key`. */
  static id(bucket: string, key: string): string {
    return `${bucket}/${key}`;
  }

  put(bucket: string, key: string, body: Buffer, contentType = 'application/octet-stream'): void {
    this.objects.set(FakeS3Server.id(bucket, key), { body, contentType });
  }

  get(bucket: string, key: string): StoredObject | undefined {
    return this.objects.get(FakeS3Server.id(bucket, key));
  }

  async start(port = 0): Promise<{ url: string }> {
    this.server = createServer((request, response) => {
      this.handle(request, response).catch((error: unknown) => {
        if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/xml' });
        response.end(
          xml(
            `<Error><Code>InternalError</Code><Message>${escapeXml(String(error))}</Message></Error>`,
          ),
        );
      });
    });
    await new Promise<void>((resolve) => this.server?.listen(port, '127.0.0.1', resolve));
    return { url: `http://127.0.0.1:${(this.server?.address() as AddressInfo).port}` };
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) =>
      this.server ? this.server.close(() => resolve()) : resolve(),
    );
  }

  private cors(response: ServerResponse): void {
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-methods', 'GET, PUT, POST, DELETE, HEAD, OPTIONS');
    response.setHeader('access-control-allow-headers', '*');
    response.setHeader('access-control-expose-headers', 'ETag');
  }

  private fail(response: ServerResponse, status: number, code: string, message: string): void {
    response.writeHead(status, { 'content-type': 'application/xml' });
    response.end(
      xml(`<Error><Code>${code}</Code><Message>${escapeXml(message)}</Message></Error>`),
    );
  }

  private async body(request: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    this.cors(response);
    const url = new URL(request.url ?? '/', 'http://fake');
    const method = request.method ?? 'GET';
    if (method === 'OPTIONS') {
      response.writeHead(204, { 'access-control-max-age': '600' });
      response.end();
      return;
    }

    const params = url.searchParams;
    const expires = params.get('X-Amz-Expires');
    const presigned = params.has('X-Amz-Signature');
    this.requests.push({
      method,
      path: url.pathname,
      presignedFor: presigned && expires ? Number(expires) : null,
    });
    if (presigned) {
      const lifetime = Number(expires);
      const signedAt = parseAmzDate(params.get('X-Amz-Date') ?? '');
      if (!Number.isFinite(lifetime) || lifetime < 1 || lifetime > 604_800 || !signedAt)
        return this.fail(
          response,
          400,
          'AuthorizationQueryParametersError',
          'Invalid presigned request',
        );
      if (this.now().getTime() > signedAt.getTime() + lifetime * 1000)
        return this.fail(response, 403, 'AccessDenied', 'Request has expired');
    } else if (!request.headers.authorization) {
      return this.fail(response, 403, 'AccessDenied', 'Access Denied');
    }

    const [, bucket, ...rest] = url.pathname.split('/');
    const key = rest.map(decodeURIComponent).join('/');
    if (!bucket || !key) return this.fail(response, 404, 'NoSuchKey', 'Not found');
    const id = FakeS3Server.id(bucket, key);

    // ---- multipart ----
    if (method === 'POST' && params.has('uploads')) {
      const uploadId = randomUUID();
      this.uploads.set(uploadId, { bucket, key, parts: new Map() });
      response.writeHead(200, { 'content-type': 'application/xml' });
      response.end(
        xml(
          `<InitiateMultipartUploadResult><Bucket>${escapeXml(bucket)}</Bucket><Key>${escapeXml(key)}</Key><UploadId>${uploadId}</UploadId></InitiateMultipartUploadResult>`,
        ),
      );
      return;
    }
    const uploadId = params.get('uploadId');
    if (uploadId) {
      const upload = this.uploads.get(uploadId);
      if (!upload || upload.key !== key || upload.bucket !== bucket)
        return this.fail(response, 404, 'NoSuchUpload', 'The specified upload does not exist');
      if (method === 'PUT') {
        const part = Number(params.get('partNumber'));
        if (!Number.isInteger(part) || part < 1 || part > 10_000)
          return this.fail(
            response,
            400,
            'InvalidArgument',
            'Part number must be an integer between 1 and 10000',
          );
        const data = await this.body(request);
        const etag = md5(data);
        upload.parts.set(part, { body: data, etag });
        response.writeHead(200, { etag });
        response.end();
        return;
      }
      if (method === 'GET') {
        const parts = [...upload.parts.entries()]
          .sort(([a], [b]) => a - b)
          .map(
            ([n, p]) =>
              `<Part><PartNumber>${n}</PartNumber><ETag>${escapeXml(p.etag)}</ETag><Size>${p.body.length}</Size></Part>`,
          )
          .join('');
        response.writeHead(200, { 'content-type': 'application/xml' });
        response.end(
          xml(
            `<ListPartsResult><Bucket>${escapeXml(bucket)}</Bucket><Key>${escapeXml(key)}</Key><UploadId>${uploadId}</UploadId><IsTruncated>false</IsTruncated>${parts}</ListPartsResult>`,
          ),
        );
        return;
      }
      if (method === 'POST') {
        const text = (await this.body(request)).toString('utf8');
        const numbers = [...text.matchAll(/<PartNumber>(\d+)<\/PartNumber>/g)].map((m) =>
          Number(m[1]),
        );
        if (numbers.length === 0)
          return this.fail(response, 400, 'MalformedXML', 'No parts listed');
        const buffers: Buffer[] = [];
        for (const n of numbers) {
          const part = upload.parts.get(n);
          if (!part) return this.fail(response, 400, 'InvalidPart', `Part ${n} was not uploaded`);
          buffers.push(part.body);
        }
        const whole = Buffer.concat(buffers);
        this.objects.set(id, { body: whole, contentType: 'application/octet-stream' });
        this.uploads.delete(uploadId);
        response.writeHead(200, { 'content-type': 'application/xml' });
        response.end(
          xml(
            `<CompleteMultipartUploadResult><Location>${escapeXml(url.origin + url.pathname)}</Location><Bucket>${escapeXml(bucket)}</Bucket><Key>${escapeXml(key)}</Key><ETag>${md5(whole)}</ETag></CompleteMultipartUploadResult>`,
          ),
        );
        return;
      }
      if (method === 'DELETE') {
        this.uploads.delete(uploadId);
        response.writeHead(204);
        response.end();
        return;
      }
    }

    // ---- objects ----
    if (method === 'PUT') {
      const copySource = request.headers['x-amz-copy-source'];
      if (typeof copySource === 'string') {
        const source = this.objects.get(decodeURIComponent(copySource.replace(/^\//, '')));
        if (!source) return this.fail(response, 404, 'NoSuchKey', 'Copy source not found');
        this.objects.set(id, { ...source });
        response.writeHead(200, { 'content-type': 'application/xml' });
        response.end(xml(`<CopyObjectResult><ETag>${md5(source.body)}</ETag></CopyObjectResult>`));
        return;
      }
      const data = await this.body(request);
      this.objects.set(id, {
        body: data,
        contentType: String(request.headers['content-type'] ?? 'application/octet-stream'),
      });
      response.writeHead(200, { etag: md5(data) });
      response.end();
      return;
    }
    const object = this.objects.get(id);
    if (method === 'DELETE') {
      this.objects.delete(id);
      response.writeHead(204);
      response.end();
      return;
    }
    if (!object) return this.fail(response, 404, 'NoSuchKey', 'The specified key does not exist.');
    if (method === 'HEAD' || method === 'GET') {
      let body = object.body;
      let status = 200;
      const headers: Record<string, string | number> = {
        'content-type': params.get('response-content-type') ?? object.contentType,
        etag: md5(object.body),
        'accept-ranges': 'bytes',
      };
      const disposition = params.get('response-content-disposition');
      if (disposition) headers['content-disposition'] = disposition;
      const range = /^bytes=(\d+)-(\d*)$/.exec(String(request.headers.range ?? ''));
      if (range && method === 'GET') {
        const start = Number(range[1]);
        const end = range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
        body = body.subarray(start, end + 1);
        status = 206;
        headers['content-range'] = `bytes ${start}-${end}/${object.body.length}`;
      }
      headers['content-length'] = method === 'HEAD' ? object.body.length : body.length;
      response.writeHead(status, headers);
      response.end(method === 'HEAD' ? undefined : body);
      return;
    }
    this.fail(response, 405, 'MethodNotAllowed', 'Method not allowed');
  }
}
