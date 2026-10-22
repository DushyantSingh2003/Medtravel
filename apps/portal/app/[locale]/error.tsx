'use client';

import { Button, ErrorState } from '@medtravel/ui';
import { useTranslations } from 'next-intl';
import { Link } from '../../i18n/navigation';

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-3 px-4">
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
    </main>
  );
}
