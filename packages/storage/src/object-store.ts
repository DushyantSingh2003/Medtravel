import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';

export interface StorageConfig {
  /** S3 endpoint the server reaches (MinIO in development). Unset means AWS. */
  endpoint?: string | undefined;
  /** The address browsers reach the bucket at, when it differs from `endpoint` (a docker hostname versus localhost). */
  publicEndpoint?: string | undefined;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle: boolean;
}

/** A request the browser's uploader makes against the bucket, which the API signs for it. */
export type MultipartRequest =
  | { kind: 'create' }
  | { kind: 'part'; uploadId: string; partNumber: number }
  | { kind: 'list'; uploadId: string }
  | { kind: 'complete'; uploadId: string }
  | { kind: 'abort'; uploadId: string };

/** How long a presigned download link works: PRD 12, five minutes. */
export const DOWNLOAD_URL_SECONDS = 300;
/** How long a presigned upload request (one part, a listing) works. */
export const UPLOAD_URL_SECONDS = 900;

export interface ObjectHead {
  size: number;
  contentType: string | undefined;
}

const isMissing = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (('name' in error && (error.name === 'NotFound' || error.name === 'NoSuchKey')) ||
    ('$metadata' in error &&
      typeof error.$metadata === 'object' &&
      error.$metadata !== null &&
      'httpStatusCode' in error.$metadata &&
      error.$metadata.httpStatusCode === 404));

/** The private bucket: reads and writes for the servers, presigned requests for browsers. Nothing here is public. */
export class ObjectStore {
  private readonly client: S3Client;
  private readonly signer: S3Client;
  readonly bucket: string;

  constructor(config: StorageConfig) {
    const base = {
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      forcePathStyle: config.forcePathStyle,
      // Checksum trailers (the SDK default) are not understood by every S3-compatible server.
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
    };
    this.bucket = config.bucket;
    this.client = new S3Client({
      ...base,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    });
    const publicEndpoint = config.publicEndpoint ?? config.endpoint;
    this.signer = new S3Client({
      ...base,
      ...(publicEndpoint ? { endpoint: publicEndpoint } : {}),
    });
  }

  async head(key: string): Promise<ObjectHead | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { size: result.ContentLength ?? 0, contentType: result.ContentType };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  /** The object as a stream, or only the byte range `bytes=0-4095` style when `range` is given. */
  async getStream(key: string, range?: string): Promise<Readable> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key, ...(range ? { Range: range } : {}) }),
    );
    return result.Body as Readable;
  }

  /** The whole object in memory; refuses anything larger than `maxBytes` before reading it. */
  async getBuffer(key: string, maxBytes: number): Promise<Buffer> {
    const head = await this.head(key);
    if (!head) throw new Error('Object not found');
    if (head.size > maxBytes) throw new Error('Object is too large to read into memory');
    const body = (await this.getStream(key)) as unknown as {
      transformToByteArray(): Promise<Uint8Array>;
    };
    return Buffer.from(await body.transformToByteArray());
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async copy(from: string, to: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: to,
        CopySource: `${this.bucket}/${from.split('/').map(encodeURIComponent).join('/')}`,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** A link that downloads (or shows) the object for `expiresIn` seconds, naming the file the browser saves it as. */
  presignGet(
    key: string,
    options: { expiresIn?: number; fileName?: string; inline?: boolean; contentType?: string } = {},
  ): Promise<string> {
    const disposition = options.fileName
      ? `${options.inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(options.fileName)}`
      : options.inline
        ? 'inline'
        : 'attachment';
    return getSignedUrl(
      this.signer,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: disposition,
        ...(options.contentType ? { ResponseContentType: options.contentType } : {}),
      }),
      { expiresIn: options.expiresIn ?? DOWNLOAD_URL_SECONDS },
    );
  }

  /** A presigned multipart-upload request for the browser's uploader. */
  presignMultipart(
    key: string,
    request: MultipartRequest,
    expiresIn = UPLOAD_URL_SECONDS,
  ): Promise<string> {
    const Bucket = this.bucket;
    const options = { expiresIn };
    switch (request.kind) {
      case 'create':
        return getSignedUrl(
          this.signer,
          new CreateMultipartUploadCommand({ Bucket, Key: key }),
          options,
        );
      case 'part':
        return getSignedUrl(
          this.signer,
          new UploadPartCommand({
            Bucket,
            Key: key,
            UploadId: request.uploadId,
            PartNumber: request.partNumber,
          }),
          options,
        );
      case 'list':
        return getSignedUrl(
          this.signer,
          new ListPartsCommand({ Bucket, Key: key, UploadId: request.uploadId }),
          options,
        );
      case 'complete':
        return getSignedUrl(
          this.signer,
          new CompleteMultipartUploadCommand({ Bucket, Key: key, UploadId: request.uploadId }),
          options,
        );
      case 'abort':
        return getSignedUrl(
          this.signer,
          new AbortMultipartUploadCommand({ Bucket, Key: key, UploadId: request.uploadId }),
          options,
        );
    }
  }
}
