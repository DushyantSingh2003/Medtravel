'use client';

import { Skeleton } from '@medtravel/ui';
import { useTranslations } from 'next-intl';

export default function Loading() {
  const t = useTranslations('errors');
  return (
    <div role="status" aria-busy="true" className="mx-auto max-w-3xl space-y-4 px-4 py-10 sm:px-6">
      <span className="sr-only">{t('loading')}</span>
      <Skeleton className="h-9 w-64 max-w-full" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="h-56 w-full" />
    </div>
  );
}
