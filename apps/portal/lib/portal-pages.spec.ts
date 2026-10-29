import { PORTALS } from '@medtravel/contracts';
import { loadMessages } from '@medtravel/i18n';
import { describe, expect, it } from 'vitest';
import { PAGE_ICONS } from './portal-icons';
import { PORTAL_DEFINITIONS } from './portal-pages';

const messages = loadMessages('en') as Record<string, Record<string, Record<string, unknown>>>;

describe('portal screen registry', () => {
  it('defines all five portals', () => {
    expect(Object.keys(PORTAL_DEFINITIONS).sort()).toEqual([...PORTALS].sort());
  });

  it.each(PORTALS)(
    '%s: keys are unique, the home page exists and every section is used',
    (portal) => {
      const { home, pages, sections } = PORTAL_DEFINITIONS[portal];
      const keys = pages.map((page) => page.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys).toContain(home);
      for (const section of sections) {
        expect(
          pages.some((page) => page.section === section),
          `${portal}/${section} has no page`,
        ).toBe(true);
      }
      for (const page of pages) expect(sections).toContain(page.section);
    },
  );

  it.each(PORTALS)(
    '%s: every screen has a title, a description, a section name and a known icon',
    (portal) => {
      const { pages, sections } = PORTAL_DEFINITIONS[portal];
      for (const page of pages) {
        expect(messages['nav']?.[portal]?.[page.key], `nav.${portal}.${page.key}`).toBeTypeOf(
          'string',
        );
        expect(messages['pages']?.[portal]?.[page.key], `pages.${portal}.${page.key}`).toBeTypeOf(
          'string',
        );
        expect(PAGE_ICONS[page.icon], `icon ${page.icon}`).toBeDefined();
      }
      for (const section of sections) {
        expect(
          messages['navSections']?.[portal]?.[section],
          `navSections.${portal}.${section}`,
        ).toBeTypeOf('string');
      }
    },
  );

  it('covers the screens the PRD names for each portal', () => {
    const keysOf = (portal: (typeof PORTALS)[number]) =>
      PORTAL_DEFINITIONS[portal].pages.map((page) => page.key);
    // PRD features per portal (5.2: 14, 6: 17, 7: 12, 8: 9, 9: 9 + 9 + 5), plus an overview page for every
    // portal whose PRD section has no dashboard of its own (all but the patient portal).
    expect(keysOf('patient')).toHaveLength(14);
    expect(keysOf('ops')).toHaveLength(18);
    expect(keysOf('hospital')).toHaveLength(13);
    expect(keysOf('agent')).toHaveLength(10);
    expect(keysOf('admin')).toHaveLength(24);
    expect(keysOf('ops')).toEqual(
      expect.arrayContaining(['leads', 'pipeline', 'cases', 'quotes', 'logistics', 'incidents']),
    );
    expect(keysOf('admin')).toEqual(
      expect.arrayContaining(['users', 'audit', 'invoicing', 'stays', 'flights']),
    );
  });
});
