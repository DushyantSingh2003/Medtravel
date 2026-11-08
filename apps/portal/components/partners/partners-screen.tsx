'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@medtravel/ui';
import { useTranslations } from 'next-intl';
import { HealthPanel } from './health-panel';
import { HospitalsPanel } from './hospitals-panel';
import { RequestsPanel } from './requests-panel';

/** Hospital and doctor approval: the review queue, the hospitals and what the website shows, and partner health. */
export function PartnersScreen() {
  const t = useTranslations('partners');
  return (
    <Tabs defaultValue="requests">
      <TabsList>
        <TabsTrigger value="requests">{t('tabs.requests')}</TabsTrigger>
        <TabsTrigger value="hospitals">{t('tabs.hospitals')}</TabsTrigger>
        <TabsTrigger value="health">{t('tabs.health')}</TabsTrigger>
      </TabsList>
      <TabsContent value="requests" className="mt-4">
        <RequestsPanel />
      </TabsContent>
      <TabsContent value="hospitals" className="mt-4">
        <HospitalsPanel />
      </TabsContent>
      <TabsContent value="health" className="mt-4">
        <HealthPanel />
      </TabsContent>
    </Tabs>
  );
}
