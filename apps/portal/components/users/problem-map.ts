import { fieldProblems } from '../../lib/api-errors';

/** The server's per-field problems as `{ field: message }`, for forms that show them under the field. */
export const problemMap = (error: unknown): Record<string, string> =>
  Object.fromEntries(fieldProblems(error).map((p) => [p.path, p.message]));
