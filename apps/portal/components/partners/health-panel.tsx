'use client';

import { useGetPartnerHealth } from '@medtravel/api-client';
import type { Locale } from '@medtravel/contracts';
import { Badge, Button, EmptyState, Skeleton } from '@medtravel/ui';
import { Activity } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { dateOnly } from './format';

/** What needs attention: accreditations and agreements about to lapse, and how quickly hospitals answer. */
export function HealthPanel() {
  const t = useTranslations('partners.health');
  const locale = useLocale() as Locale;
  const health = useGetPartnerHealth();
  const data = health.data?.data;
  const day = dateOnly(locale);
  const monthName = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });

  if (health.isPending) return <Skeleton className="h-64 w-full" />;
  if (health.isError || !data)
    return (
      <EmptyState
        title={t('failed')}
        icon={<Activity aria-hidden="true" />}
        action={<Button onClick={() => void health.refetch()}>{t('retry')}</Button>}
      />
    );

  const left = (days: number) => (days < 0 ? t('overdue', { count: -days }) : t('daysLeft', { count: days }));
  const variant = (days: number) => (days < 0 ? 'destructive' : days <= 30 ? 'warning' : 'info');

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="acc-expiry" className="space-y-2">
          <h2 id="acc-expiry" className="text-lg font-semibold">
            {t('accreditations')}
          </h2>
          {data.accreditationExpiries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noneExpiring')}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {data.accreditationExpiries.map((a) => (
                <li key={a.accreditationId} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <span className="min-w-0 text-sm">
                    <bdi className="font-medium">{a.hospitalName}</bdi>
                    <span className="ms-2 text-muted-foreground">
                      {t(`bodies.${a.body}`)} · {day.format(new Date(`${a.expiresAt}T00:00:00Z`))}
                    </span>
                  </span>
                  <Badge variant={variant(a.daysLeft)}>{left(a.daysLeft)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="ag-expiry" className="space-y-2">
          <h2 id="ag-expiry" className="text-lg font-semibold">
            {t('agreements')}
          </h2>
          {data.agreementExpiries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noneExpiring')}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {data.agreementExpiries.map((a) => (
                <li key={a.hospitalId} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <span className="min-w-0 text-sm">
                    <bdi className="font-medium">{a.hospitalName}</bdi>
                    <span className="ms-2 text-muted-foreground">
                      {day.format(new Date(`${a.endsOn}T00:00:00Z`))}
                    </span>
                  </span>
                  <Badge variant={variant(a.daysLeft)}>{left(a.daysLeft)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="response-times" className="space-y-2">
        <h2 id="response-times" className="text-lg font-semibold">
          {t('responseTimes')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('responseHint')}</p>
        {data.responseTimes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noRequests')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('responseTimes')}</caption>
              <thead>
                <tr className="border-b">
                  <th scope="col" className="p-2 text-start font-medium">
                    {t('hospital')}
                  </th>
                  {data.responseTimes[0]?.months.map((m) => (
                    <th key={m.month} scope="col" className="p-2 text-start font-medium">
                      {monthName.format(new Date(`${m.month}-01T00:00:00Z`))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.responseTimes.map((h) => (
                  <tr key={h.hospitalId} className="border-b last:border-0">
                    <th scope="row" className="p-2 text-start font-medium">
                      <bdi>{h.hospitalName}</bdi>
                    </th>
                    {h.months.map((m) => (
                      <td key={m.month} className="p-2" dir="ltr">
                        {m.requests === 0 ? (
                          <span aria-label={t('noRequestsMonth')}>—</span>
                        ) : (
                          <span>
                            {m.avgHours === null ? t('noAnswers') : t('hours', { hours: m.avgHours })}
                            <span className="block text-xs text-muted-foreground">
                              {t('answered', { answered: m.answered, requests: m.requests })}
                            </span>
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
