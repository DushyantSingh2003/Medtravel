/** The public pages that exist as placeholders until the CMS and their own tasks (W-*) fill them in. */
export const HEADER_PAGES = [
  'treatments',
  'hospitals',
  'doctors',
  'destinations',
  'cost-calculator',
  'about',
] as const;

export const FOOTER_COLUMNS = {
  patients: ['treatments', 'hospitals', 'doctors', 'destinations', 'cost-calculator', 'quote'],
  company: ['about', 'blog', 'contact', 'partner'],
} as const;

export const LEGAL_PAGES = [
  'privacy',
  'terms',
  'refund-policy',
  'medical-disclaimer',
  'grievance',
] as const;

export const SITE_PAGES = [
  ...HEADER_PAGES,
  'quote',
  'partner',
  'blog',
  'contact',
  ...LEGAL_PAGES,
] as const;

export type SitePage = (typeof SITE_PAGES)[number];

export const isSitePage = (value: unknown): value is SitePage =>
  typeof value === 'string' && (SITE_PAGES as readonly string[]).includes(value);
