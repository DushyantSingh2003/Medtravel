'use client';

import { loadMessages, directionOf, type Locale } from '@medtravel/i18n';
import './globals.css';

type ErrorMessages = { title: string; body: string; retry: string; reference: string };

const errorsOf = (locale: Locale): ErrorMessages => loadMessages(locale)['errors'] as ErrorMessages;

/**
 * Last resort: the root layout itself failed, so there is no locale, no provider and no shell. Shows
 * the message in both languages, from the same catalogue as everything else.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground antialiased">
        <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-8 px-4">
          {(['en', 'ar'] as const).map((locale) => {
            const m = errorsOf(locale);
            return (
              <section key={locale} lang={locale} dir={directionOf(locale)} className="space-y-3">
                <h1 className="text-xl font-semibold">{m.title}</h1>
                <p className="text-sm text-muted-foreground">{m.body}</p>
                <button
                  type="button"
                  onClick={reset}
                  className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                >
                  {m.retry}
                </button>
              </section>
            );
          })}
          {error.digest ? (
            <p dir="ltr" className="text-xs text-muted-foreground">
              {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
