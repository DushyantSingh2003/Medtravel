import { MASTER_RESOURCES } from '@medtravel/contracts';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from '@medtravel/ui';
import { getTranslations } from 'next-intl/server';
import { Link } from '../../i18n/navigation';

/** The landing page of master data: one card per table. */
export async function MastersIndex() {
  const t = await getTranslations('masters');
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {MASTER_RESOURCES.map((resource) => (
        <li key={resource}>
          <Card className="h-full">
            <CardHeader>
              <h2 data-slot="card-title" className="text-base leading-tight font-semibold">
                {t(`resources.${resource}.title`)}
              </h2>
              <CardDescription>{t(`resources.${resource}.description`)}</CardDescription>
            </CardHeader>
            <CardContent />
            <CardFooter>
              <Button asChild variant="outline">
                <Link href={`/admin/masters/${resource}`}>
                  {t('open')}
                  <span className="sr-only"> {t(`resources.${resource}.title`)}</span>
                </Link>
              </Button>
            </CardFooter>
          </Card>
        </li>
      ))}
    </ul>
  );
}
