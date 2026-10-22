'use client';

import {
  AppShell,
  BrandMark,
  Button,
  NotificationsMenu,
  SiteFooter,
  SiteHeader,
  Switcher,
  UserMenu,
  WhatsAppButton,
} from '@medtravel/ui';
import type { Locale } from '@medtravel/contracts';
import { LOCALE_LABELS } from '@medtravel/i18n';
import { Briefcase, Coins, LayoutDashboard, LogOut, MessageSquare, UserCog } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Section } from './section';

const CURRENCIES = ['USD', 'EUR', 'INR', 'AED'].map((value) => ({ value, label: value }));

/** The frame components: portal shell, public header and footer, switchers, menus, chat button. */
export function ShellSections({ locale }: { locale: Locale }) {
  const t = useTranslations('gallery');
  const root = useTranslations();
  const [language, setLanguage] = useState<string>(locale);
  const [currency, setCurrency] = useState('USD');
  const [active, setActive] = useState('dashboard');
  const [menuPick, setMenuPick] = useState<string | null>(null);

  const languageOptions = Object.entries(LOCALE_LABELS).map(([value, label]) => ({ value, label }));
  const notifications = [
    {
      id: 'n1',
      title: t('shellDemo.notification1'),
      body: t('shellDemo.notification1Body'),
      timeLabel: t('shellDemo.notification1Time'),
      unread: true,
    },
    { id: 'n2', title: t('shellDemo.notification2'), timeLabel: t('shellDemo.notification2Time') },
  ];
  const userMenuItems = [
    {
      id: 'profile',
      label: t('shellDemo.profile'),
      icon: <UserCog aria-hidden="true" />,
      onSelect: () => setMenuPick('profile'),
    },
    {
      id: 'sign-out',
      label: root('shell.signOut'),
      icon: <LogOut aria-hidden="true" />,
      onSelect: () => setMenuPick('sign-out'),
    },
  ];
  const brand = (
    <span className="flex items-center gap-2">
      <BrandMark />
      <span className="text-base font-semibold">{root('common.appName')}</span>
    </span>
  );
  const siteNav = ['treatments', 'hospitals', 'doctors', 'about'].map((page) => ({
    id: page,
    label: root(`site.pages.${page}.title`),
    href: '#',
  }));
  const quoteButton = (
    <Button size="sm" asChild>
      <a href="#">{root('site.getQuote')}</a>
    </Button>
  );

  return (
    <>
      <Section
        id="app-shell"
        title={t('sections.appShell')}
        description={t('descriptions.appShell')}
      >
        <div className="h-[28rem] overflow-hidden rounded-xl border">
          <AppShell
            contained
            storageKey="gallery:app-shell"
            brand={brand}
            brandCompact={<BrandMark />}
            activeId={active}
            sections={[
              {
                id: 'main',
                label: t('shellDemo.section'),
                items: [
                  {
                    id: 'dashboard',
                    label: t('shellDemo.dashboard'),
                    href: '#dashboard',
                    icon: <LayoutDashboard aria-hidden="true" />,
                  },
                  {
                    id: 'cases',
                    label: t('shellDemo.cases'),
                    href: '#cases',
                    icon: <Briefcase aria-hidden="true" />,
                  },
                  {
                    id: 'messages',
                    label: t('shellDemo.messages'),
                    href: '#messages',
                    icon: <MessageSquare aria-hidden="true" />,
                  },
                ],
              },
            ]}
            linkComponent={({ href, onClick, ...props }: React.ComponentProps<'a'>) => (
              <a
                {...props}
                href={href}
                onClick={(event) => {
                  event.preventDefault();
                  setActive(String(href).slice(1));
                  onClick?.(event);
                }}
              />
            )}
            labels={{
              skipToContent: root('shell.skipToContent'),
              navigation: t('shellDemo.navigation'),
              openMenu: root('shell.openMenu'),
              closeMenu: root('shell.closeMenu'),
              collapse: root('shell.collapse'),
              expand: root('shell.expand'),
            }}
            topBar={
              <div className="ms-auto flex items-center gap-1">
                <NotificationsMenu
                  items={notifications}
                  label={root('shell.notifications')}
                  emptyLabel={root('shell.notificationsEmpty')}
                  unreadLabel={(count) => t('shellDemo.unread', { count })}
                />
                <UserMenu
                  name="Asha Verma"
                  description={root('roles.case_manager')}
                  label={root('shell.userMenu')}
                  heading={root('shell.signedInAs')}
                  items={userMenuItems}
                />
              </div>
            }
          >
            <h3 className="text-lg font-semibold">{t(`shellDemo.${active}`)}</h3>
            <p className="text-sm text-muted-foreground">{t('shellDemo.body')}</p>
          </AppShell>
        </div>
      </Section>

      <Section
        id="switcher"
        title={t('sections.switcher')}
        description={t('descriptions.switcher')}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Switcher
            label={root('shell.language')}
            value={language}
            options={languageOptions}
            onValueChange={setLanguage}
            collapseOnSmall={false}
          />
          <Switcher
            label={root('site.currency')}
            value={currency}
            options={CURRENCIES}
            icon={<Coins aria-hidden="true" />}
            onValueChange={setCurrency}
            collapseOnSmall={false}
          />
          <p
            className="text-sm text-muted-foreground"
            aria-live="polite"
            data-testid="switcher-value"
          >
            {language} · {currency}
          </p>
        </div>
      </Section>

      <Section
        id="user-menu"
        title={t('sections.userMenu')}
        description={t('descriptions.userMenu')}
      >
        <div className="flex items-center gap-3">
          <UserMenu
            name="محمد علي"
            description={root('roles.patient')}
            label={root('shell.userMenu')}
            heading={root('shell.signedInAs')}
            items={userMenuItems}
          />
          <p
            className="text-sm text-muted-foreground"
            aria-live="polite"
            data-testid="user-menu-pick"
          >
            {menuPick ? t('shellDemo.picked', { item: menuPick }) : t('shellDemo.nothingPicked')}
          </p>
        </div>
      </Section>

      <Section
        id="notifications-menu"
        title={t('sections.notificationsMenu')}
        description={t('descriptions.notificationsMenu')}
      >
        <div className="flex items-center gap-6">
          <NotificationsMenu
            items={notifications}
            label={root('shell.notifications')}
            emptyLabel={root('shell.notificationsEmpty')}
            unreadLabel={(count) => t('shellDemo.unread', { count })}
          />
          <NotificationsMenu
            items={[]}
            label={t('shellDemo.emptyBell')}
            emptyLabel={root('shell.notificationsEmpty')}
            unreadLabel={(count) => t('shellDemo.unread', { count })}
          />
        </div>
      </Section>

      <Section
        id="brand-mark"
        title={t('sections.brandMark')}
        description={t('descriptions.brandMark')}
      >
        <div className="flex items-end gap-4">
          <BrandMark className="size-6" />
          <BrandMark className="size-10" />
          <BrandMark className="size-16" />
        </div>
      </Section>

      <Section
        id="site-header"
        title={t('sections.siteHeader')}
        description={t('descriptions.siteHeader')}
      >
        <div className="overflow-hidden rounded-xl border">
          <SiteHeader
            className="static"
            mainId={null}
            brand={brand}
            nav={siteNav}
            activeId="hospitals"
            labels={{
              skipToContent: root('site.skipToContent'),
              navigation: t('shellDemo.siteNavigation'),
              openMenu: root('site.openMenu'),
              closeMenu: root('site.closeMenu'),
            }}
            actions={
              <>
                <Switcher
                  label={root('site.language')}
                  value={language}
                  options={languageOptions}
                  onValueChange={setLanguage}
                />
                {quoteButton}
              </>
            }
            mobileActions={quoteButton}
          />
        </div>
      </Section>

      <Section
        id="site-footer"
        title={t('sections.siteFooter')}
        description={t('descriptions.siteFooter')}
      >
        <div className="overflow-hidden rounded-xl border">
          <SiteFooter
            brand={brand}
            tagline={root('site.tagline')}
            navigationLabel={t('shellDemo.footerNavigation')}
            legalLabel={t('shellDemo.legalNavigation')}
            copyright={root('site.copyright', { year: 2026 })}
            columns={[
              { id: 'patients', title: root('site.columns.patients'), links: siteNav.slice(0, 3) },
              {
                id: 'company',
                title: root('site.columns.company'),
                links: [{ id: 'about', label: root('site.pages.about.title'), href: '#' }],
              },
            ]}
            legal={['privacy', 'terms'].map((page) => ({
              id: page,
              label: root(`site.pages.${page}.title`),
              href: '#',
            }))}
          />
        </div>
      </Section>

      <Section
        id="whatsapp-button"
        title={t('sections.whatsappButton')}
        description={t('descriptions.whatsappButton')}
      >
        <WhatsAppButton
          floating={false}
          href="https://wa.me/910000000000"
          label={root('site.whatsapp')}
        />
      </Section>
    </>
  );
}
