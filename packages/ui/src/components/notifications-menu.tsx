'use client';

import { Bell } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button } from './button';
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
}

/** The bell in the top bar: a count, and a panel listing the latest notifications. */
export function NotificationsMenu({
  items,
  label,
  emptyLabel,
  unreadLabel,
}: NotificationsMenuProps) {
  const unread = items.filter((item) => item.unread).length;
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
        <h2 className="border-b px-4 py-3 text-sm font-semibold">{label}</h2>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto">
            {items.map((item) => (
              <li key={item.id} className={cn('px-4 py-3 text-sm', item.unread && 'bg-accent/50')}>
                <p className="font-medium">
                  <bdi>{item.title}</bdi>
                </p>
                {item.body ? <p className="text-muted-foreground">{item.body}</p> : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  <bdi>{item.timeLabel}</bdi>
                </p>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
