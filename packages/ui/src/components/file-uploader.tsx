'use client';

import Uppy, { type Meta } from '@uppy/core';
import AwsS3, { type AwsBody, type AwsS3Options } from '@uppy/aws-s3';
import { AlertCircle, CheckCircle2, FileText, RotateCw, UploadCloud, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { cn } from '../lib/cn';
import { MAX_UPLOAD_BYTES, formatBytes, rejectionFor, type FileRejection } from '../lib/files';
import { Button } from './button';

/** Signs one S3 request (create/part/list/complete) and returns a presigned URL. See the API's file service. */
export type SignS3Request = Extract<AwsS3Options<Meta, AwsBody>, { signRequest: unknown }>['signRequest'];

export interface FileUploaderLabels {
  dropTitle: string;
  /** e.g. "or browse files". */
  dropHint: string;
  /** e.g. "PDF, images or DICOM, up to 500 MB each". */
  restrictionsHint: string;
  remove: string;
  retry: string;
  cancelAll: string;
  uploading: string;
  done: string;
  failed: string;
  queued: string;
  /** Spoken name of the progress bar. */
  progress: (fileName: string) => string;
  rejected: Record<FileRejection, (fileName: string) => string>;
  listLabel: string;
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  /** S3 object key; send it to the API to attach the file to a record. */
  key: string;
}

export interface FileUploaderProps {
  signRequest: SignS3Request;
  labels: FileUploaderLabels;
  locale?: string;
  maxFileSize?: number;
  allowedFileTypes?: string[];
  maxNumberOfFiles?: number | null;
  /** Start uploading as soon as files are chosen. Default true. */
  autoUpload?: boolean;
  /** Always use multipart upload (parts of 8 MiB, resumable). Default: files over 100 MB, Uppy's default. */
  alwaysMultipart?: boolean;
  disabled?: boolean;
  onUploaded?: (file: UploadedFile) => void;
  onRemoved?: (id: string) => void;
  className?: string;
}

interface Item {
  id: string;
  name: string;
  size: number;
  type: string;
  status: 'queued' | 'uploading' | 'done' | 'error';
  percentage: number;
}

export function FileUploader({
  signRequest,
  labels,
  locale = 'en',
  maxFileSize = MAX_UPLOAD_BYTES,
  allowedFileTypes = [],
  maxNumberOfFiles = null,
  autoUpload = true,
  alwaysMultipart = false,
  disabled,
  onUploaded,
  onRemoved,
  className,
}: FileUploaderProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const uppyRef = useRef<Uppy<Meta, AwsBody> | null>(null);
  const callbacks = useRef({ onUploaded, onRemoved });
  callbacks.current = { onUploaded, onRemoved };
  const restrictions = useMemo(
    () => ({ maxFileSize, allowedFileTypes, maxNumberOfFiles }),
    // allowedFileTypes is compared by content so a new array literal each render does not recreate Uppy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maxFileSize, allowedFileTypes.join('|'), maxNumberOfFiles],
  );

  const patch = (id: string, change: Partial<Item>) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...change } : item)));

  useEffect(() => {
    const uppy = new Uppy<Meta, AwsBody>({ autoProceed: false });
    uppy.use(AwsS3, { signRequest, ...(alwaysMultipart ? { shouldUseMultipart: true } : {}) });

    uppy.on('upload-progress', (file, progress) => {
      if (!file) return;
      const percentage = progress.bytesTotal ? Math.round((progress.bytesUploaded / progress.bytesTotal) * 100) : 0;
      patch(file.id, { status: 'uploading', percentage });
    });
    uppy.on('upload-success', (file, response) => {
      if (!file) return;
      patch(file.id, { status: 'done', percentage: 100 });
      callbacks.current.onUploaded?.({
        id: file.id,
        name: file.name ?? '',
        size: file.size ?? 0,
        type: file.type,
        key: response.body?.key ?? '',
      });
    });
    uppy.on('upload-error', (file) => {
      if (file) patch(file.id, { status: 'error' });
    });
    uppyRef.current = uppy;
    return () => {
      uppy.destroy();
      uppyRef.current = null;
    };
    // The signer and multipart mode are fixed for the lifetime of an uploader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(list: FileList | File[]) {
    const uppy = uppyRef.current;
    if (!uppy) return;
    const rejected: string[] = [];
    let accepted = 0;
    for (const file of Array.from(list)) {
      const existing = uppy.getFiles().map((f) => ({ name: f.name ?? '', size: f.size ?? 0 }));
      const reason = rejectionFor(file, restrictions, existing);
      if (reason) {
        rejected.push(labels.rejected[reason](file.name));
        continue;
      }
      const id = uppy.addFile({ name: file.name, type: file.type, data: file, source: 'local' });
      setItems((current) => [...current, { id, name: file.name, size: file.size, type: file.type, status: 'queued', percentage: 0 }]);
      accepted += 1;
    }
    setProblems(rejected);
    if (accepted > 0 && autoUpload) void uppy.upload();
  }

  function remove(id: string) {
    uppyRef.current?.removeFile(id);
    setItems((current) => current.filter((item) => item.id !== id));
    callbacks.current.onRemoved?.(id);
  }

  function retry(id: string) {
    patch(id, { status: 'uploading' });
    void uppyRef.current?.retryUpload(id);
  }

  const statusText = (item: Item) =>
    item.status === 'done' ? labels.done : item.status === 'error' ? labels.failed : item.status === 'uploading' ? labels.uploading : labels.queued;

  return (
    <div data-slot="file-uploader" className={cn('space-y-3', className)}>
      <label
        onDragOver={(event: DragEvent) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event: DragEvent) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) addFiles(event.dataTransfer.files);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors',
          'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring hover:bg-accent/50',
          dragging && 'border-primary bg-accent',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <UploadCloud className="size-8 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium">{labels.dropTitle}</span>
        <span className="text-sm text-primary">{labels.dropHint}</span>
        <span className="text-xs text-muted-foreground">{labels.restrictionsHint}</span>
        <input
          type="file"
          multiple={maxNumberOfFiles !== 1}
          disabled={disabled}
          accept={allowedFileTypes.length ? allowedFileTypes.join(',') : undefined}
          className="sr-only"
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </label>

      {problems.length > 0 ? (
        <ul role="alert" className="space-y-1 text-sm text-destructive">
          {problems.map((problem) => (
            <li key={problem} className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {problem}
            </li>
          ))}
        </ul>
      ) : null}

      {items.length > 0 ? (
        <ul aria-label={labels.listLabel} aria-live="polite" className="divide-y rounded-xl border">
          {items.map((item) => (
            <li key={item.id} data-status={item.status} className="flex items-center gap-3 p-3">
              <FileText className="size-8 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-sm font-medium">
                  <bdi>{item.name}</bdi>
                </p>
                <div
                  role="progressbar"
                  aria-label={labels.progress(item.name)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={item.percentage}
                  className="h-1.5 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className={cn('h-full transition-all', item.status === 'error' ? 'bg-destructive' : item.status === 'done' ? 'bg-success' : 'bg-primary')}
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {item.status === 'done' ? <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" /> : null}
                  {item.status === 'error' ? <AlertCircle className="size-3.5 text-destructive" aria-hidden="true" /> : null}
                  <span dir="ltr">{formatBytes(item.size, locale)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{statusText(item)}</span>
                  {item.status === 'uploading' ? <span>{item.percentage}%</span> : null}
                </p>
              </div>
              {item.status === 'error' ? (
                <Button variant="ghost" size="icon" aria-label={`${labels.retry}: ${item.name}`} onClick={() => retry(item.id)}>
                  <RotateCw />
                </Button>
              ) : null}
              <Button variant="ghost" size="icon" aria-label={`${labels.remove}: ${item.name}`} onClick={() => remove(item.id)}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
