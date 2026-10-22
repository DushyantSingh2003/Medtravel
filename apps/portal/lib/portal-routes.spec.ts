import { PORTALS } from '@medtravel/contracts';
import { describe, expect, it } from 'vitest';
import { PORTAL_DEFINITIONS } from './portal-pages';
import { activePageKey, pageHref, resolveRoute } from './portal-routes';

describe('resolveRoute', () => {
  it('serves the home page at the portal root', () => {
    const route = resolveRoute('ops', undefined);
    expect(route).toMatchObject({ kind: 'page', page: { key: 'overview' } });
    expect(resolveRoute('patient', [])).toMatchObject({ page: { key: 'dashboard' } });
  });

  it('serves every registered screen of every portal', () => {
    for (const portal of PORTALS) {
      for (const page of PORTAL_DEFINITIONS[portal].pages) {
        expect(resolveRoute(portal, [page.key]), `${portal}/${page.key}`).toMatchObject({
          page: { key: page.key },
        });
      }
    }
  });

  it('returns null for unknown or too-deep paths', () => {
    expect(resolveRoute('ops', ['nope'])).toBeNull();
    expect(resolveRoute('ops', ['leads', 'extra'])).toBeNull();
    expect(resolveRoute('ops', ['cases', 'CASE-2026-000001', 'more'])).toBeNull();
    expect(resolveRoute('patient', ['records', 'x'])).toBeNull();
  });

  it('serves a case only for a well-formed case number, and only in the coordinator portal', () => {
    expect(resolveRoute('ops', ['cases', 'CASE-2026-000001'])).toEqual({
      kind: 'case',
      page: expect.objectContaining({ key: 'cases' }),
      caseId: 'CASE-2026-000001',
    });
    expect(resolveRoute('ops', ['cases', 'CASE-26-1'])).toBeNull();
    expect(resolveRoute('ops', ['cases', '<script>'])).toBeNull();
    expect(resolveRoute('ops', ['leads', 'CASE-2026-000001'])).toBeNull();
    expect(resolveRoute('hospital', ['requests', 'CASE-2026-000001'])).toBeNull();
  });
});

describe('pageHref and activePageKey', () => {
  it('links the home page to the portal root and others to their key', () => {
    const { pages } = PORTAL_DEFINITIONS.ops;
    expect(
      pageHref(
        'ops',
        pages.find((page) => page.key === 'overview')!,
      ),
    ).toBe('/ops');
    expect(
      pageHref(
        'ops',
        pages.find((page) => page.key === 'leads')!,
      ),
    ).toBe('/ops/leads');
  });

  it('finds the current item from a path, including a case detail path', () => {
    expect(activePageKey('ops', '/ops')).toBe('overview');
    expect(activePageKey('ops', '/ops/leads')).toBe('leads');
    expect(activePageKey('ops', '/ops/cases/CASE-2026-000001')).toBe('cases');
    expect(activePageKey('ops', '/patient')).toBeUndefined();
  });
});
