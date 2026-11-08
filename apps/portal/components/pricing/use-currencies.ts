import { useListMasters } from '@medtravel/api-client';

/** The active currency codes, for choosing which currencies a price is set in. */
export function useCurrencyCodes(): { codes: string[]; isPending: boolean } {
  const list = useListMasters('currencies', { limit: 100, active: 'true' });
  const codes = (list.data?.data.items ?? [])
    .map((row) => row.code)
    .filter((code): code is string => Boolean(code))
    .sort();
  return { codes, isPending: list.isPending };
}
