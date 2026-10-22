import { Button, EmptyState } from '@medtravel/ui';
import { Compass } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '../../i18n/navigation';

export default async function NotFound() {
  const t = await getTranslations('errors');
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-4">
      <EmptyState
        icon={<Compass />}
        title={t('notFoundTitle')}
        description={t('notFoundBody')}
        headingLevel={1}
        action={
          <Button asChild>
            <Link href="/">{t('home')}</Link>
          </Button>
        }
      />
    </main>
  );
}
