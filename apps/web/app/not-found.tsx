import { directionOf, loadMessages, type Locale } from '@medtravel/i18n';
import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

type ErrorMessages = { notFoundTitle: string; notFoundBody: string; home: string };

/** A page needs a title (WCAG 2.4.2); both languages, since the language is not known here. */
export const metadata: Metadata = {
  title: `${(loadMessages('en')['errors'] as ErrorMessages).notFoundTitle} · ${(loadMessages('ar')['errors'] as ErrorMessages).notFoundTitle}`,
  robots: { index: false },
};

const errorsOf = (locale: Locale): ErrorMessages => loadMessages(locale)['errors'] as ErrorMessages;

/**
 * Unknown URL. Every public page is generated at build time, so anything else is answered with a real
 * 404 status before any locale or layout exists; this page therefore stands alone and speaks both
 * languages. (Rendering it inside the site frame would need a dynamic render that streams, which
 * turns the status into 200.)
 */
export default function NotFound() {
  return (
    <html lang="en">
      <body className="bg-background text-foreground antialiased">
        <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-10 px-4">
          {(['en', 'ar'] as const).map((locale) => {
            const m = errorsOf(locale);
            return (
              <section key={locale} lang={locale} dir={directionOf(locale)} className="space-y-3">
                <h1 className="text-2xl font-semibold">{m.notFoundTitle}</h1>
                <p className="text-sm text-muted-foreground">{m.notFoundBody}</p>
                <Link
                  href={`/${locale}`}
                  className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                >
                  {m.home}
                </Link>
              </section>
            );
          })}
        </main>
      </body>
    </html>
  );
}
