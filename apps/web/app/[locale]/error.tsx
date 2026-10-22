'use client';

import { Button, ErrorState } from '@medtravel/ui';
import { useTranslations } from 'next-intl';
import { Link } from '../../i18n/navigation';

export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 px-4 py-16">
      <ErrorState
        title={t('title')}
        description={t('body')}
        retryLabel={t('retry')}
        onRetry={reset}
        headingLevel={1}
      />
      {error.digest ? (
        <p className="text-center text-xs text-muted-foreground">
          <bdi>{t('reference', { digest: error.digest })}</bdi>
        </p>
      ) : null}
      <Button asChild variant="ghost">
        <Link href="/">{t('home')}</Link>
      </Button>
    </div>
  );
}
