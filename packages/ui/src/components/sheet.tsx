import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';
import { DialogDescription, DialogOverlay, DialogTitle } from './dialog';

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;
export const SheetTitle = DialogTitle;
export const SheetDescription = DialogDescription;

/**
 * A panel that slides in from an edge. `start` and `end` are logical: in a right-to-left
 * language `start` is the right edge, so the panel opens on the side readers expect.
 */
const sheetVariants = cva(
  'fixed z-50 flex flex-col gap-4 bg-popover p-5 text-popover-foreground shadow-lg sm:p-6',
  {
    variants: {
      side: {
        start: 'inset-y-0 start-0 h-full w-[85%] max-w-sm border-e',
        end: 'inset-y-0 end-0 h-full w-[85%] max-w-sm border-s',
        top: 'inset-x-0 top-0 max-h-[85dvh] border-b',
        bottom: 'inset-x-0 bottom-0 max-h-[85dvh] border-t',
      },
    },
    defaultVariants: { side: 'end' },
  },
);

export interface SheetContentProps
  extends ComponentProps<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  closeLabel: string;
}

export function SheetContent({ side, className, children, closeLabel, ...props }: SheetContentProps) {
  return (
    <SheetPrimitive.Portal>
      <DialogOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(sheetVariants({ side }), className)}
        {...props}
      >
        {children}
        <SheetPrimitive.Close
          aria-label={closeLabel}
          className="absolute end-3 top-3 rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="size-4" aria-hidden="true" />
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 pe-6 text-start', className)} {...props} />;
}
export function SheetFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
}
