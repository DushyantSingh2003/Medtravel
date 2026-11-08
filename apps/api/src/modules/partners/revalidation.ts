import type { Db } from '../../database/database.module.js';
import type { OutboxService } from '../../outbox/outbox.service.js';

/** Cache tags the website uses for what a visitor can see; the worker passes them on to the site. */
/** A slug as the website's tag syntax allows: lower-case letters, digits and hyphens. */
export const tagKey = (key: string): string =>
  key
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'x';

export const hospitalTags = (slug: string): string[] => ['hospitals', `hospital:${tagKey(slug)}`];
export const doctorTags = (key: string): string[] => ['doctors', `doctor:${tagKey(key)}`];
export const packageTags = (hospitalSlug: string): string[] => [
  'packages',
  ...hospitalTags(hospitalSlug),
];

/** Asks the website to refresh these tags once the surrounding transaction commits. */
export async function queueRevalidation(
  outbox: OutboxService,
  db: Db,
  aggregate: { type: string; id: string },
  tags: string[],
): Promise<void> {
  await outbox.publish(db, {
    type: 'web.revalidate',
    aggregateType: aggregate.type,
    aggregateId: aggregate.id,
    payload: { tags: [...new Set(tags)] },
  });
}
