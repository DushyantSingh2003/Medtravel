'use client';

import { Toaster as Sonner, toast } from 'sonner';
import type { ComponentProps } from 'react';

export { toast };

/**
 * Mount once near the root. `dir` follows the document so toasts slide in from the correct side;
 * `closeButton` gives keyboard users a way to dismiss.
 */
export interface ToasterLabels {
  /** Name of the notification area, read by screen readers. */
  notifications: string;
  closeToast: string;
}

export function Toaster({
  dir = 'ltr',
  labels,
  ...props
}: ComponentProps<typeof Sonner> & { labels: ToasterLabels }) {
  return (
    <Sonner
      dir={dir}
      closeButton
      containerAriaLabel={labels.notifications}
      position={dir === 'rtl' ? 'bottom-left' : 'bottom-right'}
      toastOptions={{
        closeButtonAriaLabel: labels.closeToast,
        classNames: {
          toast: 'border bg-popover text-popover-foreground shadow-lg',
          description: 'text-muted-foreground',
        },
      }}
      {...props}
    />
  );
}
