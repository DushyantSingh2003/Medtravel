import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/** Placeholder block shown while data loads. Decorative: hidden from assistive technology. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}
