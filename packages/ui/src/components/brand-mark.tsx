import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/**
 * The MedTravel mark: a medical cross inside a rounded square, with an amber arc for the journey.
 * Decorative by default; put the product name next to it as text.
 */
export function BrandMark({ className, ...props }: ComponentProps<'svg'>) {
  return (
    <svg
      data-slot="brand-mark"
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={cn('size-8 shrink-0', className)}
      {...props}
    >
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path d="M13.5 8h5v5.5H24v5h-5.5V24h-5v-5.5H8v-5h5.5z" className="fill-primary-foreground" />
      <path
        d="M6 26c5 2.5 15 2.5 20-1"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        className="stroke-secondary"
      />
    </svg>
  );
}
