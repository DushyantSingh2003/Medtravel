'use client';

import { previewDocument, type DocumentDto } from '@medtravel/api-client';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from '@medtravel/ui';
import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { previewKind } from '../../lib/documents/mime';

interface Props {
  document: DocumentDto | null;
  onClose: () => void;
  onDownload: (document: DocumentDto) => void;
}

/** The link made for one document; kept with its id so a link is never shown for another document. */
type Result = { id: string; url: string | null };

/** Shows an image or a PDF in the page through a five-minute link (the API audits the view and stamps the copy). */
export function PreviewDialog({ document, onClose, onDownload }: Props) {
  const t = useTranslations('documents.preview');
  const [result, setResult] = useState<Result | null>(null);
  const kind = document ? previewKind(document.mimeType) : 'none';
  const id = document?.id;

  useEffect(() => {
    if (!id || kind === 'none') return;
    let cancelled = false;
    previewDocument(id)
      .then((response) => !cancelled && setResult({ id, url: response.data.url }))
      .catch(() => !cancelled && setResult({ id, url: null }));
    return () => {
      cancelled = true;
    };
  }, [id, kind]);

  const current = result && result.id === id ? result : null;
  const state: { status: 'loading' } | { status: 'ready'; url: string } | { status: 'failed' } =
    !current
      ? { status: 'loading' }
      : current.url
        ? { status: 'ready', url: current.url }
        : { status: 'failed' };

  return (
    <Dialog open={document !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('close')} className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            <bdi>{document?.fileName ?? t('title')}</bdi>
          </DialogTitle>
          <DialogDescription>{t('watermarked')}</DialogDescription>
        </DialogHeader>
        {document && kind === 'none' ? <p>{t('notShown')}</p> : null}
        {document && kind !== 'none' && state.status === 'loading' ? (
          <div role="status" aria-label={t('loading')}>
            <Skeleton className="h-72 w-full" />
          </div>
        ) : null}
        {state.status === 'failed' && kind !== 'none' ? (
          <p role="alert" className="text-destructive-text">
            {t('failed')}
          </p>
        ) : null}
        {document && state.status === 'ready' && kind === 'image' ? (
          // The link is signed and short-lived; next/image would only proxy it.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={state.url}
            alt={t('frame', { name: document.fileName })}
            className="max-h-[70dvh] w-full rounded-md object-contain"
          />
        ) : null}
        {document && state.status === 'ready' && kind === 'pdf' ? (
          <iframe
            src={state.url}
            title={t('frame', { name: document.fileName })}
            referrerPolicy="no-referrer"
            className="h-[70dvh] w-full rounded-md border"
          />
        ) : null}
        {document ? (
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onDownload(document)}>
              <Download aria-hidden="true" />
              {t('download')}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
