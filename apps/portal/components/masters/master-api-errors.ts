import { ApiError } from '@medtravel/api-client';

export interface FieldProblem {
  /** Dotted path of the field, e.g. `slug` or `translations.ar.name`; empty for a problem with the whole form. */
  path: string;
  message: string;
}

/** The per-field problems in an API error body (`{ errors: [{ path, message }] }`), whatever produced them. */
export function fieldProblems(error: unknown): FieldProblem[] {
  if (!(error instanceof ApiError) || typeof error.body !== 'object' || error.body === null)
    return [];
  const errors = (error.body as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return [];
  return errors.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { path, message } = entry as { path?: unknown; message?: unknown };
    if (!Array.isArray(path) || typeof message !== 'string') return [];
    return [{ path: path.map(String).join('.'), message }];
  });
}

export const statusOf = (error: unknown): number | undefined =>
  error instanceof ApiError ? error.status : undefined;
