'use client';

import { Skeleton } from '@medtravel/ui';
import { useTranslations } from 'next-intl';

/** Fallback while a top-level page loads; portals have their own inside the shell. */
export default function Loading() {
  const t = useTranslations('errors');
  return (
    <main
      role="status"
      aria-busy="true"
      className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-4 px-4"
    >
      <span className="sr-only">{t('loading')}</span>
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-64 w-full" />
    </main>
  );
}
