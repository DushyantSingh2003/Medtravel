# @medtravel/ui — design system

Shared React components and design tokens for `apps/web` and `apps/portal`. See it running at
`/ui-gallery` in the portal (every component, English and Arabic).

```bash
pnpm dev                       # then open http://localhost:3002/en/ui-gallery  (and /ar/ui-gallery)
pnpm --filter @medtravel/ui test
```

The gallery and its mock storage endpoint are opt-in: they return 404 unless `ENABLE_UI_GALLERY=true`.
`apps/portal/.env.example` sets it for local development (an existing `apps/portal/.env` needs the line
added) and CI sets it for the browser tests. Never set it on a deployed environment.

## Using it

```css
/* app/globals.css */
@import '@medtravel/ui/theme.css';
```

```tsx
// root layout: direction for Radix, tooltips and the toast area (its two spoken labels are translated)
<UiProvider
  dir={directionOf(locale)}
  labels={{ notifications: t('notifications'), closeToast: t('closeToast') }}
>
  {children}
</UiProvider>
```

```tsx
import { Button, DataTable, FormInput } from '@medtravel/ui';
```

## Rules the components follow

- **No built-in text.** A component never invents a word. Anything a person reads (labels, empty
  messages, "Page 2 of 9") is passed in by the app, translated with next-intl. That is why many
  components take a `labels` object.
- **RTL-safe.** Only logical utilities: `ms- me- ps- pe- start- end- text-start`. Icons that point
  somewhere (chevrons, arrows, send) flip with `rtl:`. A test fails the build if a physical
  `ml-` `pr-` `left-` `text-right` and so on appears anywhere.
- **Theme tokens only.** Colours come from semantic tokens (`bg-background`, `text-muted-foreground`,
  `border-border`, `bg-primary`). Dark mode is a set of CSS variables under `.dark` in `theme.css`;
  a test fails on hard-coded `bg-white` / `text-slate-900`. Dark mode is defined and checked but not
  yet switchable in the app.
- **Money is integer minor units.** `CurrencyInput` stores cents/paise/fils, never decimals.
- **Latin digits in Arabic** for dates, money, phone numbers and file sizes (`intlLocale`).
- **Dates are calendar days.** Keep them as `YYYY-MM-DD` strings in forms and API calls
  (`toDateOnly` / `fromDateOnly`); `FormDatePicker` does. A `Date` sent through `JSON.stringify` is a
  UTC instant and lands on the wrong day in India (UTC+5:30).
- **Money parsing is strict.** `parseMinorUnits` returns `null` for anything ambiguous (`1,234` in KWD,
  `1.234` in USD, `1.2.3`) instead of guessing, and `CurrencyInput` keeps the text and sets
  `aria-invalid` rather than silently storing a wrong amount.
- **Keyboard and screen readers.** Dialogs trap focus, menus and selects use arrow keys, errors are
  linked to fields with `aria-describedby` and announced, drag and drop works from the keyboard.
- **Names and mixed text** that may be in another script are wrapped in `<bdi>` so an Arabic name in
  an English sentence (or the reverse) cannot reorder the line.

## What is here

| Group                | Components                                                                                                                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs               | `Input` `Textarea` `Label` `Select` `Combobox` `DatePicker` `PhoneInput` `CurrencyInput` `Checkbox` `Radio` `Switch`                                                                                                              |
| Forms                | `FormField` plus `FormInput` `FormTextarea` `FormSelect` `FormCombobox` `FormDatePicker` `FormPhoneInput` `FormCurrencyInput` `FormCheckbox` `FormSwitch` (React Hook Form)                                                       |
| Actions and overlays | `Button` `Dialog` `ConfirmDialog` `Sheet` `Drawer` `DropdownMenu` `Popover` `Tooltip` `Toaster` / `toast` `Switcher` `UserMenu` `NotificationsMenu` |
| Display              | `Badge` `StatusBadge` `Card` `Avatar` `Skeleton` `Tabs` `EmptyState` `ErrorState` `StatCard`                                                                                                                                      |
| Layout               | `PageHeader` `Breadcrumbs` `AppShell` (sidebar, top bar, mobile menu) `SiteHeader` `SiteFooter` `WhatsAppButton` `BrandMark` |
| Data                 | `DataTable` (TanStack Table, server-side paging/sort/search, column visibility, row selection, CSV export of the rows on the current page, row virtualisation). Column filters go in the `toolbar` slot and the caller refetches. |
| Files                | `FileUploader` (Uppy, S3 multipart through presigned URLs, 500 MB limit, type filter, Start and Cancel all, retry that re-sends only the failed part)                                                                             |
| Case workflow        | `StageTracker` (12 stages) `Timeline` `ChatPanel` `KanbanBoard` (dnd-kit)                                                                                                                                                         |

## Notes for whoever extends it

- The components follow shadcn/ui conventions (Radix primitives + `cva` + `cn`) and are written in
  place rather than generated, so there is no `components.json`. Add new shared components here,
  not in an app (`CLAUDE.md`).
- The package is compiled to `dist` and consumed by bundlers (Next), so relative imports have no
  `.js` extension. After editing, run `pnpm build` and restart the apps that use it.
- `FileUploader` retries a failed upload within the session. It does not resume after a page reload
  (that needs the API to track upload ids; F-06). Its file-type and size checks are a convenience: some
  browsers report `''` for DICOM, so list extensions too, and the API must validate every upload again.
  Object keys are random UUIDs by default so file names (personal data) stay out of the bucket path.
- `FileUploader` takes a `signRequest(request)` callback that returns a presigned S3 URL for each
  request Uppy makes (create, upload part, list parts, complete). The real implementation is the API's
  file service (F-06); the gallery uses a mock endpoint (`apps/portal/app/api/ui-gallery/s3`).
- TanStack Table is on the 8.x line and react-day-picker on 9.x. Newer majors exist
  (9.x and 10.x respectively) with different APIs; upgrade deliberately.
