'use client';

import { useTranslations } from 'next-intl';
import { Link } from '../../i18n/navigation';

/** A small text link under a form. */
export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-primary underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}

export function BackToLogin() {
  const t = useTranslations('auth.common');
  return <AuthLink href="/login">{t('back')}</AuthLink>;
}
