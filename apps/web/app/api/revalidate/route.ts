import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
const TAG = /^[a-z]+(:[a-z0-9-]+)?$/;

/** The tags in a request body, or null when it is not a list of 1 to 20 well-formed tags. */
const tagsOf = (body: unknown): string[] | null => {
  const tags = (body as { tags?: unknown } | null)?.tags;
  return Array.isArray(tags) &&
    tags.length >= 1 &&
    tags.length <= 20 &&
    tags.every((tag) => typeof tag === 'string' && TAG.test(tag))
    ? (tags as string[])
    : null;
};

const same = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * Called by the worker when a hospital, doctor or package is published, unpublished or repriced: refreshes the cached pages that
 * carry those tags. Refuses everything unless REVALIDATE_SECRET is set and sent.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.REVALIDATE_SECRET;
  const sent = request.headers.get('x-revalidate-secret') ?? '';
  if (!secret || secret.length < 16 || !same(sent, secret))
    return Response.json({ error: 'forbidden' }, { status: 403 });
  const tags = tagsOf(await request.json().catch(() => null));
  if (!tags) return Response.json({ error: 'invalid' }, { status: 400 });
  for (const tag of tags) revalidateTag(tag, 'max');
  return Response.json({ revalidated: tags });
}
