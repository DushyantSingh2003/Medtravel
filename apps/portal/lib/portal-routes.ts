import type { Portal } from '@medtravel/contracts';
import { PORTAL_DEFINITIONS, type PortalPage } from './portal-pages';

/** Path of a page, without the locale: the home page is the portal root. */
export function pageHref(portal: Portal, page: PortalPage): string {
  return page.key === PORTAL_DEFINITIONS[portal].home ? `/${portal}` : `/${portal}/${page.key}`;
}

export type ResolvedRoute =
  { kind: 'page'; page: PortalPage } | { kind: 'case'; page: PortalPage; caseId: string };

/** Case numbers look like CASE-2026-000001 (CLAUDE.md). */
const CASE_ID = /^CASE-\d{4}-\d{6}$/;

/** Which screen a URL segment list points at, or null for a 404. */
export function resolveRoute(portal: Portal, slug: string[] | undefined): ResolvedRoute | null {
  const definition = PORTAL_DEFINITIONS[portal];
  const segments = slug ?? [];
  const find = (key: string) => definition.pages.find((page) => page.key === key);

  if (segments.length === 0) {
    const home = find(definition.home);
    return home ? { kind: 'page', page: home } : null;
  }
  const [key, id, ...rest] = segments;
  const page = key ? find(key) : undefined;
  if (!page || rest.length > 0) return null;
  if (id === undefined) return { kind: 'page', page };
  if (portal === 'ops' && page.key === 'cases' && CASE_ID.test(id))
    return { kind: 'case', page, caseId: id };
  return null;
}

/** The nav item that is current for a path such as `/ops/cases/CASE-2026-000001`. */
export function activePageKey(portal: Portal, pathname: string): string | undefined {
  const [, first, key] = pathname.split('/');
  if (first !== portal) return undefined;
  return key ?? PORTAL_DEFINITIONS[portal].home;
}
