/**
 * Where the portal's server reaches the API: `API_URL` when the API is on an internal address (a private service name in
 * a cluster), otherwise the public one the browser uses.
 */
export const apiBaseUrl = (): string =>
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
