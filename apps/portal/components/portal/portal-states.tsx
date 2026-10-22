'use client';

import { Button, EmptyState, ErrorState, Skeleton } from '@medtravel/ui';
import { Compass } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '../../i18n/navigation';

/** Shown while a portal page loads. Keeps the shell; only the page area is replaced. */
export function PortalLoading() {
  const t = useTranslations('errors');
  return (
    <div role="status" aria-busy="true" className="mx-auto w-full max-w-6xl space-y-6">
      <span className="sr-only">{t('loading')}</span>
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** A page threw. The shell stays; the user can retry or go home. */
export function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');
  return (
    <div className="mx-auto w-full max-w-6xl space-y-3">
      <ErrorState
        title={t('title')}
        description={t('body')}
        retryLabel={t('retry')}
        onRetry={reset}
        headingLevel={2}
      />
      {error.digest ? (
        <p className="text-center text-xs text-muted-foreground">
          <bdi>{t('reference', { digest: error.digest })}</bdi>
        </p>
      ) : null}
    </div>
  );
}

/** An unknown URL inside a portal. */
export function PortalNotFound() {
  const t = useTranslations('errors');
  return (
    <div className="mx-auto w-full max-w-6xl">
      <EmptyState
        icon={<Compass />}
        title={t('notFoundTitle')}
        description={t('notFoundBody')}
        headingLevel={1}
        action={
          <Button asChild variant="outline">
            <Link href="/">{t('home')}</Link>
          </Button>
        }
      />
    </div>
  );
}
