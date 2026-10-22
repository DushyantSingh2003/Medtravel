import type { MasterResource } from '@medtravel/contracts';
import type { MasterAdapter } from '../master-adapter.js';
import { cityAdapter } from './city.adapter.js';
import { countryAdapter } from './country.adapter.js';
import { currencyAdapter } from './currency.adapter.js';
import { documentTypeAdapter } from './document-type.adapter.js';
import { languageAdapter } from './language.adapter.js';
import { lostReasonAdapter } from './lost-reason.adapter.js';
import { specialityAdapter } from './speciality.adapter.js';
import { treatmentAdapter } from './treatment.adapter.js';

/** One adapter per master table. Adding a table means adding its adapter here and its entry in the contracts. */
export const MASTER_ADAPTERS: Record<MasterResource, MasterAdapter> = {
  countries: countryAdapter,
  languages: languageAdapter,
  currencies: currencyAdapter,
  specialities: specialityAdapter,
  treatments: treatmentAdapter,
  cities: cityAdapter,
  'document-types': documentTypeAdapter,
  'lost-reasons': lostReasonAdapter,
};

/** The Prisma model each resource is stored in, written to the audit trail as the entity type. */
export const MASTER_ENTITY_TYPES: Record<MasterResource, string> = {
  countries: 'Country',
  languages: 'Language',
  currencies: 'Currency',
  specialities: 'Speciality',
  treatments: 'Treatment',
  cities: 'City',
  'document-types': 'DocumentType',
  'lost-reasons': 'LostReason',
};
