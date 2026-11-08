'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@medtravel/ui';
import { useTranslations } from 'next-intl';
import { FxPanel } from './fx-panel';
import { PriceList } from './price-list';
import { RulesPanel } from './rules-panel';

/** Pricing rules: the price list, margins and discount limits, and exchange rates. */
export function PricingScreen() {
  const t = useTranslations('pricing');
  return (
    <Tabs defaultValue="prices">
      <TabsList>
        <TabsTrigger value="prices">{t('tabs.prices')}</TabsTrigger>
        <TabsTrigger value="rules">{t('tabs.rules')}</TabsTrigger>
        <TabsTrigger value="fx">{t('tabs.fx')}</TabsTrigger>
      </TabsList>
      <TabsContent value="prices" className="mt-4">
        <PriceList />
      </TabsContent>
      <TabsContent value="rules" className="mt-4">
        <RulesPanel />
      </TabsContent>
      <TabsContent value="fx" className="mt-4">
        <FxPanel />
      </TabsContent>
    </Tabs>
  );
}
