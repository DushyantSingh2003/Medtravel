'use client';

import { Bell } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button } from './button';
import { Skeleton } from './skeleton';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export interface NotificationItem {
  id: string;
  title: string;
  body?: string;
  /** Formatted by the caller for the viewer's locale and time zone. */
  timeLabel: string;
  unread?: boolean;
}

export interface NotificationsMenuProps {
  items: NotificationItem[];
  /** Name of the button and the panel, e.g. "Notifications". */
  label: string;
  emptyLabel: string;
  /** Spoken with the count, e.g. "3 unread". */
  unreadLabel: (count: number) => string;
  /** The true number unread when `items` is only the latest page; counted from `items` when not given. */
  unreadCount?: number;
  /** Shown instead of the list while it loads or when it could not be loaded. */
  status?: 'ready' | 'loading' | 'error';
  loadingLabel?: string;
  errorLabel?: string;
  /** Called with the id of the notification a person opened. */
  onItemSelect?: (id: string) => void;
  /** "Mark all as read" in the panel heading; shown only when `onMarkAllRead` is given and something is unread. */
  markAllLabel?: string;
  onMarkAllRead?: () => void;
}

/** The bell in the top bar: a count, and a panel listing the latest notifications. */
export function NotificationsMenu({
  items,
  label,
  emptyLabel,
  unreadLabel,
  unreadCount,
  status = 'ready',
  loadingLabel,
  errorLabel,
  onItemSelect,
  markAllLabel,
  onMarkAllRead,
}: NotificationsMenuProps) {
  const unread = unreadCount ?? items.filter((item) => item.unread).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" data-slot="notifications-menu" className="relative">
          <Bell aria-hidden="true" />
          <span className="sr-only">
            {label}
            {unread > 0 ? `, ${unreadLabel(unread)}` : ''}
          </span>
          {unread > 0 ? (
            <span
              aria-hidden="true"
              className="absolute end-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-destructive-foreground"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" aria-label={label}>
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{label}</h2>
          {onMarkAllRead && markAllLabel && unread > 0 ? (
            <Button variant="link" size="sm" className="h-auto p-0" onClick={onMarkAllRead}>
              {markAllLabel}
            </Button>
          ) : null}
        </div>
        {status === 'loading' ? (
          <div className="space-y-3 px-4 py-4" role="status" aria-label={loadingLabel}>
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-10 w-full" />
            ))}
          </div>
        ) : status === 'error' ? (
          <p role="alert" className="px-4 py-8 text-center text-sm text-destructive">
            {errorLabel}
          </p>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto">
            {items.map((item) => (
              <li key={item.id} className={cn('text-sm', item.unread && 'bg-accent/50')}>
                <button
                  type="button"
                  disabled={!onItemSelect}
                  onClick={() => onItemSelect?.(item.id)}
                  className="block w-full px-4 py-3 text-start focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none enabled:hover:bg-accent/70 disabled:cursor-default"
                >
                  <span className="block font-medium">
                    <bdi>{item.title}</bdi>
                  </span>
                  {item.body ? (
                    <span className="block text-muted-foreground">
                      <bdi>{item.body}</bdi>
                    </span>
                  ) : null}
                  <span className="mt-1 block text-xs text-muted-foreground">
                    <bdi>{item.timeLabel}</bdi>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
