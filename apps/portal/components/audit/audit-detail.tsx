'use client';

import type { AuditPageDtoItemsItem } from '@medtravel/api-client';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@medtravel/ui';
import { actionLabel, type AuditT } from './audit-columns';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

function Values({ label, value, empty }: { label: string; value: object | null; empty: string }) {
  return (
    <section aria-label={label} className="space-y-1">
      <h3 className="text-sm font-medium">{label}</h3>
      {value && Object.keys(value).length > 0 ? (
        <pre
          dir="ltr"
          className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-start text-xs"
        >
          {JSON.stringify(value, null, 2)}
        </pre>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

/** What one audit event recorded, in a side sheet. */
export function AuditDetail({
  event,
  t,
  formatDate,
  onClose,
}: {
  event: AuditPageDtoItemsItem | null;
  t: AuditT;
  formatDate: (iso: string) => string;
  onClose: () => void;
}) {
  return (
    <Sheet open={event !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="end"
        closeLabel={t('detail.close')}
        className="overflow-y-auto sm:max-w-lg"
      >
        <SheetHeader>
          <SheetTitle>{t('detail.title')}</SheetTitle>
          <SheetDescription>{t('detail.description')}</SheetDescription>
        </SheetHeader>
        {event ? (
          <div className="space-y-4 px-4 pb-4">
            <dl className="space-y-3">
              <Field label={t('detail.action')}>
                {actionLabel(t, event.action)}{' '}
                <bdi className="font-mono text-xs text-muted-foreground">{event.action}</bdi>
              </Field>
              <Field label={t('detail.time')}>{formatDate(event.createdAt)}</Field>
              <Field label={t('detail.person')}>
                <bdi>{event.actorName ?? t('system')}</bdi>
                {event.actorEmail ? (
                  <bdi className="text-muted-foreground"> {event.actorEmail}</bdi>
                ) : null}
              </Field>
              <Field label={t('detail.record')}>
                <bdi>
                  {event.entityType} <span className="font-mono text-xs">{event.entityId}</span>
                </bdi>
              </Field>
              {event.patientId ? (
                <Field label={t('detail.patient')}>
                  <bdi className="font-mono text-xs">{event.patientId}</bdi>
                </Field>
              ) : null}
              {event.ip ? (
                <Field label={t('detail.address')}>
                  <bdi>{event.ip}</bdi>
                </Field>
              ) : null}
              {event.userAgent ? (
                <Field label={t('detail.device')}>
                  <bdi className="text-sm">{event.userAgent}</bdi>
                </Field>
              ) : null}
              {event.requestId ? (
                <Field label={t('detail.request')}>
                  <bdi className="font-mono text-xs">{event.requestId}</bdi>
                </Field>
              ) : null}
            </dl>
            <Values label={t('detail.before')} value={event.before} empty={t('detail.noChanges')} />
            <Values label={t('detail.after')} value={event.after} empty={t('detail.noChanges')} />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
