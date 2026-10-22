import { getCountries, getCountryCallingCode } from 'libphonenumber-js/max';

/** Where the platform's patients come from (PRD 1): used to group countries in reports and menus. */
const REGIONS: Record<string, string> = {
  IN: 'South Asia',
  BD: 'South Asia',
  AF: 'South Asia',
  NP: 'South Asia',
  LK: 'South Asia',
  PK: 'South Asia',
  BT: 'South Asia',
  MV: 'South Asia',
  OM: 'Gulf',
  AE: 'Gulf',
  SA: 'Gulf',
  KW: 'Gulf',
  QA: 'Gulf',
  BH: 'Gulf',
  IQ: 'Middle East',
  YE: 'Middle East',
  JO: 'Middle East',
  LB: 'Middle East',
  SY: 'Middle East',
  IR: 'Middle East',
  PS: 'Middle East',
  TR: 'Middle East',
  EG: 'Africa',
  KE: 'Africa',
  NG: 'Africa',
  ET: 'Africa',
  TZ: 'Africa',
  UG: 'Africa',
  GH: 'Africa',
  SD: 'Africa',
  SO: 'Africa',
  ZM: 'Africa',
  ZW: 'Africa',
  MZ: 'Africa',
  RW: 'Africa',
  LY: 'Africa',
  DZ: 'Africa',
  MA: 'Africa',
  TN: 'Africa',
  ZA: 'Africa',
  UZ: 'Central Asia',
  KZ: 'Central Asia',
  KG: 'Central Asia',
  TJ: 'Central Asia',
  TM: 'Central Asia',
  RU: 'Europe',
  GB: 'Europe',
  DE: 'Europe',
  FR: 'Europe',
  UA: 'Europe',
  BY: 'Europe',
  AZ: 'Europe',
  GE: 'Europe',
  AM: 'Europe',
  US: 'Americas',
  CA: 'Americas',
};

export interface SeedCountry {
  code: string;
  name: string;
  arabic: string;
  dialCode: string;
  region: string | null;
}

const english = new Intl.DisplayNames(['en'], { type: 'region' });
const arabic = new Intl.DisplayNames(['ar'], { type: 'region' });

/**
 * Every country with an ISO 3166-1 alpha-2 code and a dialling code: the codes and dialling codes come from
 * libphonenumber's metadata, the English and Arabic names from the CLDR names built into Node. Territories that
 * have no region name in CLDR (it answers with the bare code) are left out.
 */
export function seedCountries(): SeedCountry[] {
  return getCountries()
    .flatMap((code) => {
      const name = english.of(code);
      const arabicName = arabic.of(code);
      if (!name || !arabicName || name === code) return [];
      return [
        {
          code,
          name,
          arabic: arabicName,
          dialCode: `+${getCountryCallingCode(code)}`,
          region: REGIONS[code] ?? null,
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}
