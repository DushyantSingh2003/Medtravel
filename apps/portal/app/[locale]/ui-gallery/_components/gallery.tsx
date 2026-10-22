'use client';

import { PageHeader } from '@medtravel/ui';
import { isLocale } from '@medtravel/i18n';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '../../../../i18n/navigation';
import { DataSections } from './data-sections';
import { DisplaySections } from './display-sections';
import { InputSections } from './input-sections';
import { ShellSections } from './shell-sections';
import { WorkflowSections } from './workflow-sections';

export function Gallery() {
  const t = useTranslations('gallery');
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : 'en';
  const pathname = usePathname();

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title={t('title')} description={t('subtitle')} />
        <nav aria-label={t('language')} className="flex gap-1">
          {(['en', 'ar'] as const).map((target) => (
            <Link
              key={target}
              href={pathname}
              locale={target}
              lang={target}
              aria-current={locale === target ? 'true' : undefined}
              className="rounded-md border px-3 py-1.5 text-sm font-medium aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground"
            >
              {target === 'en' ? 'English' : 'العربية'}
            </Link>
          ))}
        </nav>
      </div>
      <InputSections locale={locale} />
      <DisplaySections />
      <DataSections locale={locale} />
      <WorkflowSections locale={locale} />
      <ShellSections locale={locale} />
    </main>
  );
}
