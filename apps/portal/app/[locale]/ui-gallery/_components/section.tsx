import type { ReactNode } from 'react';

/** One component in the gallery: an anchor target with a heading, so tests and people can jump to it. */
export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={`cmp-${id}`}
      data-component={id}
      aria-labelledby={`cmp-${id}-title`}
      className="scroll-mt-20 space-y-4 border-b pb-8"
    >
      <div className="space-y-1">
        <h2 id={`cmp-${id}-title`} className="text-lg font-semibold">
          {title}
        </h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export const GALLERY_SECTIONS = [
  'button',
  'form-controls',
  'select',
  'combobox',
  'date-picker',
  'phone-input',
  'currency-input',
  'selection-controls',
  'badge',
  'status-badge',
  'card',
  'tabs',
  'dialog',
  'sheet',
  'drawer',
  'toast',
  'tooltip',
  'dropdown-menu',
  'avatar',
  'skeleton',
  'empty-state',
  'error-state',
  'page-header',
  'breadcrumbs',
  'confirm-dialog',
  'data-table',
  'form-fields',
  'file-uploader',
  'stage-tracker',
  'timeline',
  'chat-panel',
  'stat-card',
  'kanban-board',
] as const;
