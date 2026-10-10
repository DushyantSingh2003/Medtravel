'use client';

import { Direction } from 'radix-ui';
import type { ReactNode } from 'react';
import { Toaster } from './toast';
import { TooltipProvider } from './tooltip';

/**
 * Mount once at the root of an app. Radix primitives (menus, selects, sliders, tooltips) position
 * and navigate by reading `dir` from here rather than the document, so it must match `<html dir>`.
 * Also mounts the toast area and the tooltip provider.
 */
export function UiProvider({ dir, children }: { dir: 'ltr' | 'rtl'; children: ReactNode }) {
  return (
    <Direction.Provider dir={dir}>
      <TooltipProvider delayDuration={200}>
        {children}
        <Toaster dir={dir} />
      </TooltipProvider>
    </Direction.Provider>
  );
}
