import { PORTALS, ROLES, portalOfRole } from '@medtravel/contracts';
import { isLocale } from '@medtravel/i18n';
import { BrandMark, Button, Card, CardContent, CardDescription, CardHeader } from '@medtravel/ui';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { redirect } from '../../../i18n/navigation';
import { getSession } from '../../../lib/auth/session';
import { isStubAuthEnabled } from '../../../lib/auth/session-cookie';
import { signIn } from './actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: 'login' });
  return { title: t('title'), robots: { index: false, follow: false } };
}

/**
 * Stub sign-in: pick a role, land in that role's portal. Real sign-in (email or phone OTP) arrives
 * with F-03; until then this page only works when ENABLE_STUB_AUTH=true.
 */
/** Reads the session and runtime configuration, so it must not be prerendered at build time. */
export const dynamic = 'force-dynamic';

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const session = await getSession();
  if (session) redirect({ href: `/${session.portal}`, locale });

  const t = await getTranslations();
  const enabled = isStubAuthEnabled();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-6 px-4 py-10">
      <div className="flex items-center gap-3">
        <BrandMark className="size-10" />
        <p className="text-lg font-semibold">{t('common.appName')}</p>
      </div>
      <Card>
        <CardHeader>
          <h1 className="text-xl leading-tight font-semibold">{t('login.title')}</h1>
          <CardDescription>
            {enabled ? t('login.stubIntro') : t('login.unavailable')}
          </CardDescription>
        </CardHeader>
        {enabled ? (
          <CardContent className="space-y-6">
            <p
              role="note"
              className="rounded-md bg-warning/10 px-3 py-2 text-sm font-medium text-warning-text"
            >
              {t('login.stubWarning')}
            </p>
            <form action={signIn} aria-label={t('login.rolesLabel')} className="space-y-5">
              <input type="hidden" name="locale" value={locale} />
              {PORTALS.map((portal) => (
                <section key={portal} aria-labelledby={`login-${portal}`} className="space-y-2">
                  <h2
                    id={`login-${portal}`}
                    className="text-sm font-semibold text-muted-foreground"
                  >
                    {t(`portals.${portal}`)}
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {ROLES.filter((role) => portalOfRole(role) === portal).map((role) => (
                      <Button
                        key={role}
                        type="submit"
                        name="role"
                        value={role}
                        variant="outline"
                        className="h-auto max-w-full py-2 text-start whitespace-normal"
                      >
                        {t('login.continueAs', { role: t(`roles.${role}`) })}
                      </Button>
                    ))}
                  </div>
                </section>
              ))}
            </form>
          </CardContent>
        ) : null}
      </Card>
    </main>
  );
}
