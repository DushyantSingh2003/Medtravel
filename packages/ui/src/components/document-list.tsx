import {
  Archive,
  Download,
  Eye,
  File as FileIcon,
  FileImage,
  FileText,
  Loader2,
  Share2,
  Trash2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { Locale } from '@medtravel/contracts';
import { cn } from '../lib/cn';
import { formatBytes } from '../lib/files';
import { Badge } from './badge';
import { Button } from './button';

export type DocumentScanState = 'pending' | 'clean' | 'infected' | 'failed';

export interface DocumentListItem {
  id: string;
  fileName: string;
  /** The document type or kind, as a tag ("Medical report"). */
  typeLabel: string;
  mimeType: string;
  sizeBytes: number;
  scanStatus: DocumentScanState;
  /** Who uploaded it; shown when known. */
  uploadedBy?: string | null;
  /** The upload time as a machine-readable ISO string and as text for the viewer's locale and time zone. */
  createdAt: string;
  dateLabel: string;
  pageCount?: number | null;
  /** Names of the hospitals this document is shared with. */
  sharedWith: string[];
}

export interface DocumentListLabels {
  listLabel: string;
  /** The scan state, in words: "Scanning", "Clean", "Removed: virus found", "Could not be checked". */
  status: Record<DocumentScanState, string>;
  preview: (fileName: string) => string;
  download: (fileName: string) => string;
  share: (fileName: string) => string;
  remove: (fileName: string) => string;
  pages: (count: number) => string;
  uploadedBy: (name: string) => string;
  /** "Shared with Hospital A, Hospital B". */
  sharedWith: (names: string) => string;
  notShared: string;
}

export interface DocumentListProps {
  items: DocumentListItem[];
  labels: DocumentListLabels;
  locale?: Locale;
  /** Each action is offered only when its handler is passed (a viewer who may not delete gets no delete button). */
  onPreview?: (item: DocumentListItem) => void;
  onDownload?: (item: DocumentListItem) => void;
  onShare?: (item: DocumentListItem) => void;
  onRemove?: (item: DocumentListItem) => void;
  /** The document an action is running for: its buttons are disabled meanwhile. */
  busyId?: string | null;
  className?: string;
}

const STATUS_VARIANT: Record<DocumentScanState, 'info' | 'success' | 'destructive' | 'warning'> = {
  pending: 'info',
  clean: 'success',
  infected: 'destructive',
  failed: 'warning',
};

function FileTypeIcon({ mimeType }: { mimeType: string }) {
  const Icon =
    mimeType === 'application/pdf'
      ? FileText
      : mimeType.startsWith('image/')
        ? FileImage
        : mimeType.includes('zip')
          ? Archive
          : FileIcon;
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
    >
      <Icon className="size-5" />
    </span>
  );
}

/**
 * A person's documents: file name, type tag, size, date, who uploaded it, whether the virus scan has finished, which hospitals
 * can see it, and the actions. A file that is still being scanned, or did not pass, cannot be opened or downloaded.
 */
export function DocumentList({
  items,
  labels,
  locale = 'en',
  onPreview,
  onDownload,
  onShare,
  onRemove,
  busyId = null,
  className,
}: DocumentListProps) {
  return (
    <ul
      data-slot="document-list"
      aria-label={labels.listLabel}
      className={cn('divide-y rounded-xl border', className)}
    >
      {items.map((item) => {
        const openable = item.scanStatus === 'clean' && busyId !== item.id;
        const busy = busyId === item.id;
        const action = (
          label: string,
          icon: ReactNode,
          onClick: () => void,
          enabled: boolean,
          destructive = false,
        ) => (
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            title={label}
            disabled={!enabled}
            className={destructive ? 'text-destructive-text' : undefined}
            onClick={onClick}
          >
            {icon}
          </Button>
        );
        return (
          <li
            key={item.id}
            data-state={item.scanStatus}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3"
          >
            <FileTypeIcon mimeType={item.mimeType} />
            <div className="min-w-0 flex-1 basis-48">
              <p className="truncate font-medium">
                <bdi>{item.fileName}</bdi>
              </p>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <Badge variant="outline">{item.typeLabel}</Badge>
                <span>{formatBytes(item.sizeBytes, locale)}</span>
                {item.pageCount ? <span>{labels.pages(item.pageCount)}</span> : null}
                <time dateTime={item.createdAt}>{item.dateLabel}</time>
                {item.uploadedBy ? <span>{labels.uploadedBy(item.uploadedBy)}</span> : null}
              </p>
              <p className="text-sm text-muted-foreground">
                {item.sharedWith.length ? (
                  <bdi>{labels.sharedWith(item.sharedWith.join(', '))}</bdi>
                ) : (
                  labels.notShared
                )}
              </p>
            </div>
            <Badge variant={STATUS_VARIANT[item.scanStatus]}>
              {item.scanStatus === 'pending' ? (
                <Loader2
                  aria-hidden="true"
                  className="size-3 animate-spin motion-reduce:animate-none"
                />
              ) : null}
              {labels.status[item.scanStatus]}
            </Badge>
            <div className="flex items-center">
              {onPreview
                ? action(
                    labels.preview(item.fileName),
                    <Eye aria-hidden="true" />,
                    () => onPreview(item),
                    openable,
                  )
                : null}
              {onDownload
                ? action(
                    labels.download(item.fileName),
                    <Download aria-hidden="true" />,
                    () => onDownload(item),
                    openable,
                  )
                : null}
              {onShare
                ? action(
                    labels.share(item.fileName),
                    <Share2 aria-hidden="true" />,
                    () => onShare(item),
                    item.scanStatus === 'clean' && !busy,
                  )
                : null}
              {onRemove
                ? action(
                    labels.remove(item.fileName),
                    <Trash2 aria-hidden="true" />,
                    () => onRemove(item),
                    !busy,
                    true,
                  )
                : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
