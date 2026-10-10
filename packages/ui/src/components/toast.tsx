'use client';

import { Toaster as Sonner, toast } from 'sonner';
import type { ComponentProps } from 'react';

export { toast };

/**
 * Mount once near the root. `dir` follows the document so toasts slide in from the correct side;
 * `closeButton` gives keyboard users a way to dismiss.
 */
export function Toaster({ dir = 'ltr', ...props }: ComponentProps<typeof Sonner>) {
  return (
    <Sonner
      dir={dir}
      closeButton
      position={dir === 'rtl' ? 'bottom-left' : 'bottom-right'}
      toastOptions={{
        classNames: {
          toast: 'border bg-popover text-popover-foreground shadow-lg',
          description: 'text-muted-foreground',
        },
      }}
      {...props}
    />
  );
}
