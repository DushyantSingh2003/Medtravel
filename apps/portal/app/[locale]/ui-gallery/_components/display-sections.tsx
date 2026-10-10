'use client';

import {
  Avatar,
  AvatarFallback,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  PageHeader,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Skeleton,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  initialsOf,
  toast,
} from '@medtravel/ui';
import { CASE_EXIT_STAGES, CASE_STAGES } from '@medtravel/contracts';
import { Info, MoreHorizontal, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '../../../../i18n/navigation';
import { Section } from './section';

export function DisplaySections() {
  const t = useTranslations('gallery');
  const stages = useTranslations('stages');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(0);

  return (
    <>
      <Section id="badge" title={t('sections.badge')} description={t('descriptions.badge')}>
        <div className="flex flex-wrap gap-2">
          {(['default', 'secondary', 'outline', 'muted', 'success', 'warning', 'destructive', 'info'] as const).map((variant) => (
            <Badge key={variant} variant={variant}>
              {t(`badge.${variant}`)}
            </Badge>
          ))}
        </div>
      </Section>

      <Section id="status-badge" title={t('sections.statusBadge')} description={t('descriptions.statusBadge')}>
        <div className="flex flex-wrap gap-2">
          {[...CASE_STAGES, ...CASE_EXIT_STAGES].map((stage) => (
            <StatusBadge key={stage} status={stage} label={stages(stage)} />
          ))}
        </div>
      </Section>

      <Section id="card" title={t('sections.card')} description={t('descriptions.card')}>
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>{t('card.title')}</CardTitle>
            <CardDescription>{t('card.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{t('card.body')}</p>
          </CardContent>
          <CardFooter className="gap-2">
            <Button size="sm">{t('card.primary')}</Button>
            <Button size="sm" variant="outline">
              {t('card.secondary')}
            </Button>
          </CardFooter>
        </Card>
      </Section>

      <Section id="tabs" title={t('sections.tabs')} description={t('descriptions.tabs')}>
        <Tabs defaultValue="overview">
          <TabsList aria-label={t('tabs.label')}>
            <TabsTrigger value="overview">{t('tabs.overview')}</TabsTrigger>
            <TabsTrigger value="documents">{t('tabs.documents')}</TabsTrigger>
            <TabsTrigger value="payments">{t('tabs.payments')}</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">{t('tabs.overviewBody')}</TabsContent>
          <TabsContent value="documents">{t('tabs.documentsBody')}</TabsContent>
          <TabsContent value="payments">{t('tabs.paymentsBody')}</TabsContent>
        </Tabs>
      </Section>

      <Section id="dialog" title={t('sections.dialog')} description={t('descriptions.dialog')}>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">{t('dialog.open')}</Button>
          </DialogTrigger>
          <DialogContent closeLabel={t('common.close')}>
            <DialogHeader>
              <DialogTitle>{t('dialog.title')}</DialogTitle>
              <DialogDescription>{t('dialog.description')}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button>{t('dialog.action')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      <Section id="sheet" title={t('sections.sheet')} description={t('descriptions.sheet')}>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">{t('sheet.open')}</Button>
          </SheetTrigger>
          <SheetContent side="end" closeLabel={t('common.close')}>
            <SheetHeader>
              <SheetTitle>{t('sheet.title')}</SheetTitle>
              <SheetDescription>{t('sheet.description')}</SheetDescription>
            </SheetHeader>
            <SheetFooter>
              <Button>{t('sheet.action')}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </Section>

      <Section id="drawer" title={t('sections.drawer')} description={t('descriptions.drawer')}>
        <Drawer>
          <DrawerTrigger asChild>
            <Button variant="outline">{t('drawer.open')}</Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerTitle>{t('drawer.title')}</DrawerTitle>
            <DrawerDescription>{t('drawer.description')}</DrawerDescription>
          </DrawerContent>
        </Drawer>
      </Section>

      <Section id="toast" title={t('sections.toast')} description={t('descriptions.toast')}>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => toast.success(t('toast.successTitle'), { description: t('toast.successBody') })}>
            {t('toast.success')}
          </Button>
          <Button variant="outline" onClick={() => toast.error(t('toast.errorTitle'), { description: t('toast.errorBody') })}>
            {t('toast.error')}
          </Button>
        </div>
      </Section>

      <Section id="tooltip" title={t('sections.tooltip')} description={t('descriptions.tooltip')}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" aria-label={t('tooltip.trigger')}>
              <Info />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('tooltip.content')}</TooltipContent>
        </Tooltip>
      </Section>

      <Section id="dropdown-menu" title={t('sections.dropdownMenu')} description={t('descriptions.dropdownMenu')}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label={t('menu.trigger')}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>{t('menu.label')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>{t('menu.assign')}</DropdownMenuItem>
            <DropdownMenuItem>{t('menu.addNote')}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive>{t('menu.delete')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Section>

      <Section id="avatar" title={t('sections.avatar')} description={t('descriptions.avatar')}>
        <div className="flex items-center gap-3">
          {['Asha Verma', 'Omar Al-Farsi', 'محمد علي'].map((name) => (
            <Avatar key={name} aria-label={name}>
              <AvatarFallback>{initialsOf(name)}</AvatarFallback>
            </Avatar>
          ))}
        </div>
      </Section>

      <Section id="skeleton" title={t('sections.skeleton')} description={t('descriptions.skeleton')}>
        <div className="flex max-w-sm items-center gap-3">
          <Skeleton className="size-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      </Section>

      <Section id="empty-state" title={t('sections.emptyState')} description={t('descriptions.emptyState')}>
        <EmptyState
          title={t('empty.title')}
          description={t('empty.description')}
          action={
            <Button size="sm">
              <Plus aria-hidden="true" />
              {t('empty.action')}
            </Button>
          }
        />
      </Section>

      <Section id="error-state" title={t('sections.errorState')} description={t('descriptions.errorState')}>
        <ErrorState title={t('error.title')} description={t('error.description')} retryLabel={t('error.retry')} onRetry={() => toast(t('error.retrying'))} />
      </Section>

      <Section id="page-header" title={t('sections.pageHeader')} description={t('descriptions.pageHeader')}>
        <PageHeader
          title={t('pageHeader.title')}
          description={t('pageHeader.description')}
          breadcrumbs={{
            label: t('breadcrumbs.label'),
            linkComponent: Link,
            items: [{ label: t('breadcrumbs.home'), href: '/' }, { label: t('breadcrumbs.cases'), href: '/' }, { label: t('breadcrumbs.current') }],
          }}
          actions={
            <>
              <Button variant="outline">{t('pageHeader.secondary')}</Button>
              <Button>{t('pageHeader.primary')}</Button>
            </>
          }
        />
      </Section>

      <Section id="breadcrumbs" title={t('sections.breadcrumbs')} description={t('descriptions.breadcrumbs')}>
        <Breadcrumbs
          label={t('breadcrumbs.label')}
          linkComponent={Link}
          items={[{ label: t('breadcrumbs.home'), href: '/' }, { label: t('breadcrumbs.hospitals'), href: '/' }, { label: t('breadcrumbs.hospital') }]}
        />
      </Section>

      <Section id="confirm-dialog" title={t('sections.confirmDialog')} description={t('descriptions.confirmDialog')}>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
            {t('confirm.open')}
          </Button>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {t('confirm.count', { count: confirmed })}
          </span>
        </div>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={t('confirm.title')}
          description={t('confirm.description')}
          confirmLabel={t('confirm.confirm')}
          cancelLabel={t('common.cancel')}
          closeLabel={t('common.close')}
          destructive
          errorLabel={t('confirm.failed')}
          onConfirm={async () => {
            await new Promise((resolve) => setTimeout(resolve, 400));
            setConfirmed((count) => count + 1);
          }}
        />
      </Section>
    </>
  );
}
