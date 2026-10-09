'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/** Defaults tuned for a portal: data is fresh for a minute, retries once, no refetch on focus. */
const makeQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false },
    },
  });

/**
 * Wraps a Next app. The client is created in state so each browser session gets exactly one,
 * and server renders never share a cache between requests.
 */
export function ApiQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
