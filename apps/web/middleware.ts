import { NextRequest, type NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { languageForFirstVisit } from './lib/first-visit';
import { routing } from './i18n/routing';

const intl = createMiddleware(routing);

/**
 * next-intl already honours the language cookie and the browser's language. For a first-time visitor the country is added by
 * handing it the language it would not have found on its own.
 */
export default function middleware(request: NextRequest): NextResponse {
  const language = languageForFirstVisit(request.headers, request.cookies);
  if (!language) return intl(request);
  const headers = new Headers(request.headers);
  headers.set('accept-language', language);
  return intl(new NextRequest(request, { headers }));
}

export const config = {
  // Run on every path except Next internals, the API proxy and anything with a file extension.
  matcher: ['/((?!api/|_next/|_vercel/|.*\\..*).*)'],
};
