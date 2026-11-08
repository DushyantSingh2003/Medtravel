import type { Db } from '../../database/database.module.js';
import type { OutboxService } from '../../outbox/outbox.service.js';

/** Cache tags the website uses for what a visitor can see; the worker passes them on to the site. */
export const hospitalTags = (slug: string): string[] => ['hospitals', `hospital:${slug}`];
export const doctorTags = (key: string): string[] => ['doctors', `doctor:${key}`];
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
