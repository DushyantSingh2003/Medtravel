import { z } from 'zod';

/**
 * Primitives shared by the API and every front end. Feature schemas (patients, cases,
 * quotes, ...) are added by the tasks that build those modules; this file only holds the
 * pieces every module needs, so the dependency edge exists and is type-checked from S-01.
 */

/** Locales the platform ships at MVP. Arabic drives RTL layout. */
export const LOCALES = ['en', 'ar'] as const;
export const localeSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof localeSchema>;

export const DEFAULT_LOCALE: Locale = 'en';

/** Locales written right-to-left. */
export const RTL_LOCALES: readonly Locale[] = ['ar'];

export const isRtlLocale = (locale: Locale): boolean => RTL_LOCALES.includes(locale);

/** Every entity is addressed by a cuid. */
export const idSchema = z.string().min(1, 'id is required');
export type Id = z.infer<typeof idSchema>;

/**
 * Cursor pagination, used by every list endpoint. The cursor is opaque: pass back the `nextCursor` of the
 * previous page, never build one.
 */
export const cursorQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type CursorQuery = z.infer<typeof cursorQuerySchema>;

/** Shape every cursor-paginated list endpoint returns. `total` counts all rows matching the filters. */
export const cursorPageSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().max(512).nullable(),
    total: z.number().int().min(0),
  });
export type CursorPage<T> = { items: T[]; nextCursor: string | null; total: number };

/** Page-based pagination. Superseded by cursor pagination for new endpoints (CLAUDE.md). */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Shape every paginated list endpoint returns. */
export const paginatedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  });

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/** Health payload returned by GET /health. */
export const healthSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
});
export type Health = z.infer<typeof healthSchema>;
