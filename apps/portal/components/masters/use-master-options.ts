'use client';

import { listMasters, type MasterRowDto } from '@medtravel/api-client';
import type { MasterResource } from '@medtravel/contracts';
import { useQuery } from '@tanstack/react-query';

export interface MasterOption {
  value: string;
  label: string;
}

/** The server caps a page at 100 rows, and a pick-list needs all of them; countries are the longest at about 250. */
const MAX_PAGES = 10;

async function readAll(resource: MasterResource, signal: AbortSignal): Promise<MasterRowDto[]> {
  const rows: MasterRowDto[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data } = await listMasters(
      resource,
      { limit: 100, active: 'true', sort: 'name', ...(cursor ? { cursor } : {}) },
      { signal },
    );
    rows.push(...data.items);
    if (!data.nextCursor) break;
    cursor = data.nextCursor;
  }
  return rows;
}

/**
 * Every active row of a master table as pick-list options, labelled with the English name. The options are cached
 * for the session, so the second form that needs the countries does not ask again.
 */
export function useMasterOptions(resource: MasterResource, enabled = true) {
  return useQuery({
    queryKey: ['master-options', resource],
    queryFn: ({ signal }) => readAll(resource, signal),
    enabled,
    staleTime: 5 * 60_000,
    select: (rows): MasterOption[] => rows.map((row) => ({ value: row.id, label: row.name })),
  });
}
