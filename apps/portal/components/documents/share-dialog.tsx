'use client';

import {
  getListDocumentSharesQueryKey,
  getListDocumentsQueryKey,
  setDocumentShare,
  useListDocumentShares,
  type DocumentDto,
} from '@medtravel/api-client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ShareToggleList,
  Skeleton,
  toast,
} from '@medtravel/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Props {
  document: DocumentDto | null;
  onClose: () => void;
}

/** The patient decides which hospital sees a file. Turning one on is their consent, recorded by the API. */
export function ShareDialog({ document, onClose }: Props) {
  const t = useTranslations('documents.share');
  const toasts = useTranslations('documents.toast');
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const id = document?.id ?? '';
  const hasCase = Boolean(document?.caseId);
  const targets = useListDocumentShares(id, { query: { enabled: Boolean(document) && hasCase } });
  const rows = targets.data?.data.targets ?? [];

  async function toggle(hospitalId: string, shared: boolean) {
    if (!document) return;
    setBusyId(hospitalId);
    setFailed(false);
    try {
      await setDocumentShare(document.id, hospitalId, { shared });
      const hospital = rows.find((row) => row.hospitalId === hospitalId)?.hospitalName ?? '';
      toast.success(toasts(shared ? 'shared' : 'unshared', { hospital, name: document.fileName }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListDocumentSharesQueryKey(document.id) }),
        queryClient.invalidateQueries({ queryKey: [getListDocumentsQueryKey()[0]] }),
      ]);
    } catch {
      setFailed(true);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={document !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('close')} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {!hasCase ? <p className="text-sm text-muted-foreground">{t('noCase')}</p> : null}
        {hasCase && targets.isPending ? <Skeleton className="h-24 w-full" /> : null}
        {hasCase && !targets.isPending ? (
          <ShareToggleList
            targets={rows.map((row) => ({
              id: row.hospitalId,
              name: row.hospitalName,
              shared: row.shared,
            }))}
            busyId={busyId}
            onToggle={(hospitalId, shared) => void toggle(hospitalId, shared)}
            labels={{
              listLabel: t('list'),
              toggle: (name) => t('toggle', { name }),
              shared: t('on'),
              notShared: t('off'),
              empty: t('none'),
            }}
          />
        ) : null}
        {failed ? (
          <p role="alert" className="text-sm text-destructive-text">
            {t('failed')}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
