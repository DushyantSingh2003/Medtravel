'use client';

import {
  completeUpload,
  deleteDocument,
  downloadDocument,
  getListDocumentsQueryKey,
  signUpload,
  useListDocuments,
  type DocumentDto,
} from '@medtravel/api-client';
import { DOCUMENT_ACCEPT, type Locale } from '@medtravel/contracts';
import {
  ConfirmDialog,
  DocumentList,
  EmptyState,
  ErrorState,
  FileUploader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  intlLocale,
  toast,
  type SignS3Request,
} from '@medtravel/ui';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { mimeOf } from '../../lib/documents/mime';
import { PreviewDialog } from './preview-dialog';
import { ShareDialog } from './share-dialog';

const KINDS = ['report', 'scan', 'prescription', 'passport', 'other'] as const;
type Kind = (typeof KINDS)[number];
const PAGE = 50;

interface Props {
  /** Whether the viewer may delete and decide who sees a file (the patient who owns it). */
  isOwner: boolean;
}

/** The patient's files: add some, watch them being checked, open, download, share with a hospital, delete. */
export function DocumentsScreen({ isOwner }: Props) {
  const t = useTranslations('documents');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<Kind>('report');
  // The signer reads the kind through a ref, so a change takes effect for the next file without recreating the uploader.
  const kindRef = useRef<Kind>(kind);
  useEffect(() => {
    kindRef.current = kind;
  }, [kind]);
  const [previewing, setPreviewing] = useState<DocumentDto | null>(null);
  const [sharing, setSharing] = useState<DocumentDto | null>(null);
  const [deleting, setDeleting] = useState<DocumentDto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const list = useListDocuments(
    { limit: PAGE },
    {
      query: {
        placeholderData: keepPreviousData,
        // Files are being checked in the background: look again until none is waiting.
        refetchInterval: (query) =>
          query.state.data?.data.items.some((doc) => doc.scanStatus === 'pending') ? 3000 : false,
      },
    },
  );
  const documents = list.data?.data.items ?? [];
  const scanning = documents.some((doc) => doc.scanStatus === 'pending');

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: [getListDocumentsQueryKey()[0]] });

  // ---- uploading ---------------------------------------------------------------------------------------------
  // The uploader proposes an object key per file; this remembers which file each key belongs to so the first signing
  // request can say what the file is. The API chooses the real key and answers with it.
  const proposed = useRef(new Map<string, { name: string; size: number; type: string }>());
  const signRequest: SignS3Request = async (request) => {
    const isStart = request.method === 'POST' && !('uploadId' in request);
    const file = proposed.current.get(request.key);
    const response = await signUpload({
      request: {
        method: request.method,
        key: request.key,
        ...('uploadId' in request ? { uploadId: request.uploadId } : {}),
        ...('partNumber' in request ? { partNumber: request.partNumber } : {}),
      },
      ...(isStart && file
        ? {
            file: {
              fileName: file.name,
              mimeType: mimeOf(file.name, file.type),
              sizeBytes: file.size,
              kind: kindRef.current,
              visibility: 'private' as const,
            },
          }
        : {}),
    });
    return { url: response.data.url, key: response.data.key };
  };

  async function uploaded(file: { name: string; key: string }) {
    try {
      await completeUpload({ key: file.key });
      toast.success(t('toast.uploaded', { name: file.name }));
    } catch {
      toast.error(t('toast.uploadFailed', { name: file.name }));
    }
    await refresh();
  }

  // ---- reading and changing ------------------------------------------------------------------------------------
  async function download(doc: DocumentDto) {
    setBusyId(doc.id);
    try {
      const response = await downloadDocument(doc.id);
      window.location.assign(response.data.url);
    } catch {
      toast.error(t('toast.downloadFailed'));
    } finally {
      setBusyId(null);
    }
  }

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', timeStyle: 'short' }),
    [locale],
  );
  const kindLabel = (doc: DocumentDto) =>
    doc.typeName ??
    (KINDS.includes(doc.kind as Kind) ? t(`kinds.${doc.kind as Kind}`) : t('kinds.other'));
  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  const pick = (action: (doc: DocumentDto) => void) => (item: { id: string }) => {
    const doc = byId.get(item.id);
    if (doc) action(doc);
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="documents-upload" className="space-y-3 rounded-xl border p-4">
        <h2 id="documents-upload" className="text-base font-semibold">
          {t('upload.title')}
        </h2>
        <div className="flex max-w-xs flex-col gap-1.5 text-sm">
          <label htmlFor="document-kind">{t('upload.kindLabel')}</label>
          <Select value={kind} onValueChange={(next) => setKind(next as Kind)}>
            <SelectTrigger id="document-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`kinds.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground">{t('upload.hint')}</p>
        <FileUploader
          signRequest={signRequest}
          locale={locale}
          allowedFileTypes={DOCUMENT_ACCEPT}
          alwaysMultipart
          generateObjectKey={(file) => {
            const key = `files/${crypto.randomUUID()}`;
            proposed.current.set(key, file);
            return key;
          }}
          onUploaded={(file) => void uploaded(file)}
          labels={{
            dropTitle: t('uploader.dropTitle'),
            dropHint: t('uploader.dropHint'),
            restrictionsHint: t('uploader.restrictions'),
            remove: t('uploader.remove'),
            retry: t('uploader.retry'),
            start: t('uploader.start'),
            cancelAll: t('uploader.cancelAll'),
            uploading: t('uploader.uploading'),
            done: t('uploader.done'),
            failed: t('uploader.failed'),
            queued: t('uploader.queued'),
            progress: (name) => t('uploader.progress', { name }),
            listLabel: t('uploader.list'),
            rejected: {
              empty: (name) => t('uploader.rejected.empty', { name }),
              too_large: (name) => t('uploader.rejected.tooLarge', { name }),
              wrong_type: (name) => t('uploader.rejected.wrongType', { name }),
              too_many: (name) => t('uploader.rejected.tooMany', { name }),
              duplicate: (name) => t('uploader.rejected.duplicate', { name }),
            },
          }}
        />
      </section>

      <section aria-labelledby="documents-list" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="documents-list" className="text-base font-semibold">
            {t('list.title')}
          </h2>
          {!list.isPending && !list.isError ? (
            <p className="text-sm text-muted-foreground">
              {t('list.total', { count: list.data?.data.total ?? 0 })}
            </p>
          ) : null}
        </div>
        {scanning ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t('list.scanningNote')}
          </p>
        ) : null}
        {list.isPending ? (
          <div role="status" aria-label={t('list.title')} className="space-y-2">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-16 w-full" />
            ))}
          </div>
        ) : list.isError ? (
          <ErrorState
            title={t('list.errorTitle')}
            description={t('list.errorDescription')}
            retryLabel={t('list.retry')}
            onRetry={() => void list.refetch()}
          />
        ) : documents.length === 0 ? (
          <EmptyState title={t('list.emptyTitle')} description={t('list.emptyDescription')} />
        ) : (
          <DocumentList
            locale={locale}
            busyId={busyId}
            items={documents.map((doc) => ({
              id: doc.id,
              fileName: doc.fileName,
              typeLabel: kindLabel(doc),
              mimeType: doc.mimeType,
              sizeBytes: doc.sizeBytes,
              scanStatus: doc.scanStatus,
              uploadedBy: doc.uploadedByName,
              createdAt: doc.createdAt,
              dateLabel: dateFormat.format(new Date(doc.createdAt)),
              pageCount: doc.pageCount,
              sharedWith: doc.shares.map((share) => share.hospitalName),
            }))}
            labels={{
              listLabel: t('list.label'),
              status: {
                pending: t('list.status.pending'),
                clean: t('list.status.clean'),
                infected: t('list.status.infected'),
                failed: t('list.status.failed'),
              },
              preview: (name) => t('list.preview', { name }),
              download: (name) => t('list.download', { name }),
              share: (name) => t('list.share', { name }),
              remove: (name) => t('list.remove', { name }),
              pages: (count) => t('list.pages', { count }),
              uploadedBy: (name) => t('list.uploadedBy', { name }),
              sharedWith: (names) => t('list.sharedWith', { names }),
              notShared: t('list.notShared'),
            }}
            onPreview={pick(setPreviewing)}
            onDownload={pick((doc) => void download(doc))}
            {...(isOwner ? { onShare: pick(setSharing), onRemove: pick(setDeleting) } : {})}
          />
        )}
      </section>

      <PreviewDialog
        document={previewing}
        onClose={() => setPreviewing(null)}
        onDownload={(doc) => void download(doc)}
      />
      <ShareDialog document={sharing} onClose={() => setSharing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('delete.title', { name: deleting?.fileName ?? '' })}
        description={t('delete.body')}
        confirmLabel={t('delete.confirm')}
        cancelLabel={t('delete.cancel')}
        closeLabel={t('preview.close')}
        errorLabel={t('delete.error')}
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          await deleteDocument(deleting.id);
          toast.success(t('toast.deleted', { name: deleting.fileName }));
          await refresh();
        }}
      />
    </div>
  );
}
