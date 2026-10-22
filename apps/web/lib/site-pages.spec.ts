import { loadMessages } from '@medtravel/i18n';
import { describe, expect, it } from 'vitest';
import { FOOTER_COLUMNS, HEADER_PAGES, LEGAL_PAGES, SITE_PAGES, isSitePage } from './site-pages';

const site = (
  loadMessages('en') as { site: { pages: Record<string, { title: string; description: string }> } }
).site;

describe('public pages', () => {
  it('has a title and description for every page, so no link renders a raw key', () => {
    for (const page of SITE_PAGES) {
      expect(site.pages[page]?.title, page).toBeTypeOf('string');
      expect(site.pages[page]?.description, page).toBeTypeOf('string');
    }
  });

  it('lists each page once', () => {
    expect(new Set(SITE_PAGES).size).toBe(SITE_PAGES.length);
  });

  it('makes every header, footer and legal link point at a page that exists', () => {
    for (const page of [
      ...HEADER_PAGES,
      ...FOOTER_COLUMNS.patients,
      ...FOOTER_COLUMNS.company,
      ...LEGAL_PAGES,
    ]) {
      expect(isSitePage(page), page).toBe(true);
    }
  });

  it('has the six header menus and five legal pages the PRD names', () => {
    expect(HEADER_PAGES).toEqual([
      'treatments',
      'hospitals',
      'doctors',
      'destinations',
      'cost-calculator',
      'about',
    ]);
    expect(LEGAL_PAGES).toEqual([
      'privacy',
      'terms',
      'refund-policy',
      'medical-disclaimer',
      'grievance',
    ]);
  });

  it('narrows unknown values', () => {
    expect(isSitePage('privacy')).toBe(true);
    expect(isSitePage('admin')).toBe(false);
    expect(isSitePage(undefined)).toBe(false);
    expect(isSitePage('__proto__')).toBe(false);
  });
});
