'use client';

import { DISPLAY_CURRENCIES, displayCurrencySchema, type Locale } from '@medtravel/contracts';
import { LOCALES, LOCALE_LABELS } from '@medtravel/i18n';
import { BrandMark, Button, SiteHeader, Switcher } from '@medtravel/ui';
import { Coins } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '../../i18n/navigation';
import { useCurrency } from '../../lib/currency-preference';
import { HEADER_PAGES } from '../../lib/site-pages';

const LANGUAGE_OPTIONS = LOCALES.map((value) => ({ value, label: LOCALE_LABELS[value] }));
const CURRENCY_OPTIONS = DISPLAY_CURRENCIES.map((value) => ({ value, label: value }));

function Brand() {
  const t = useTranslations('common');
  return (
    <Link href="/" className="flex items-center gap-2 rounded-md">
      <BrandMark />
      <span className="text-lg font-semibold">{t('appName')}</span>
    </Link>
  );
}

/** The public website's header, wired to the router, the language and the currency preference. */
export function SiteHeaderBar() {
  const t = useTranslations('site');
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [currency, setCurrency] = useCurrency();

  const switchers = (
    <>
      <Switcher
        label={t('language')}
        value={locale}
        options={LANGUAGE_OPTIONS}
        onValueChange={(next) => router.replace(pathname, { locale: next as Locale })}
      />
      <Switcher
        label={t('currency')}
        value={currency}
        options={CURRENCY_OPTIONS}
        icon={<Coins aria-hidden="true" />}
        onValueChange={(next) => {
          const parsed = displayCurrencySchema.safeParse(next);
          if (parsed.success) setCurrency(parsed.data);
        }}
      />
    </>
  );

  return (
    <SiteHeader
      brand={<Brand />}
      linkComponent={Link}
      nav={HEADER_PAGES.map((page) => ({
        id: page,
        label: t(`pages.${page}.title`),
        href: `/${page}`,
      }))}
      activeId={pathname.split('/')[1]}
      labels={{
        skipToContent: t('skipToContent'),
        navigation: t('mainNavigation'),
        openMenu: t('openMenu'),
        closeMenu: t('closeMenu'),
      }}
      actions={
        <>
          {switchers}
          <Button asChild size="sm" className="hidden md:inline-flex">
            <Link href="/quote">{t('getQuote')}</Link>
          </Button>
        </>
      }
      mobileActions={
        <Button asChild>
          <Link href="/quote">{t('getQuote')}</Link>
        </Button>
      }
    />
  );
}
