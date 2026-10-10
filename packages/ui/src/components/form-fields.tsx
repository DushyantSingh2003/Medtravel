'use client';

import type { Locale } from '@medtravel/contracts';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { Checkbox } from './checkbox';
import { Combobox, type ComboboxProps } from './combobox';
import { CurrencyInput } from './currency-input';
import { fromDateOnly, toDateOnly } from '../lib/date';
import { DatePicker, type DatePickerLabels } from './date-picker';
import { FormField } from './form-field';
import { Input } from './input';
import { Label } from './label';
import { PhoneInput, type PhoneInputLabels } from './phone-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { Switch } from './switch';
import { Textarea } from './input';

/** Props shared by every ready-made form field: the form control, the field name and its texts. */
interface Base<TValues extends FieldValues, TName extends FieldPath<TValues>> {
  control: Control<TValues>;
  name: TName;
  label: string;
  description?: string;
  required?: boolean;
  requiredLabel?: string;
  className?: string;
}

/*
 * Ready-made React Hook Form fields. Each pairs a design-system control with `FormField`, so a
 * screen's form is a list of one-liners and every field gets label, hint and error wiring for free.
 * For a control that is not covered, use `FormField` directly.
 */

export function FormInput<V extends FieldValues, N extends FieldPath<V>>({
  type,
  placeholder,
  autoComplete,
  ...base
}: Base<V, N> & { type?: string; placeholder?: string; autoComplete?: string }) {
  return (
    <FormField {...base}>
      {({ field, control }) => (
        <Input
          {...control}
          {...field}
          value={field.value ?? ''}
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
      )}
    </FormField>
  );
}

export function FormTextarea<V extends FieldValues, N extends FieldPath<V>>({
  placeholder,
  rows,
  ...base
}: Base<V, N> & { placeholder?: string; rows?: number }) {
  return (
    <FormField {...base}>
      {({ field, control }) => (
        <Textarea
          {...control}
          {...field}
          value={field.value ?? ''}
          placeholder={placeholder}
          rows={rows}
        />
      )}
    </FormField>
  );
}

export function FormSelect<V extends FieldValues, N extends FieldPath<V>>({
  options,
  placeholder,
  ...base
}: Base<V, N> & { options: { value: string; label: string }[]; placeholder: string }) {
  return (
    <FormField {...base}>
      {({ field, control }) => (
        <Select value={field.value ?? ''} onValueChange={field.onChange} name={field.name}>
          <SelectTrigger {...control} ref={field.ref} onBlur={field.onBlur}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}

export function FormCombobox<V extends FieldValues, N extends FieldPath<V>>({
  options,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  ...base
}: Base<V, N> &
  Pick<ComboboxProps, 'options' | 'placeholder' | 'searchPlaceholder' | 'emptyLabel'>) {
  return (
    <FormField {...base}>
      {({ field, control }) => (
        <Combobox
          {...control}
          ref={field.ref}
          onBlur={field.onBlur}
          options={options}
          value={field.value ?? null}
          onChange={field.onChange}
          placeholder={placeholder}
          searchPlaceholder={searchPlaceholder}
          emptyLabel={emptyLabel}
        />
      )}
    </FormField>
  );
}

/** The form value is a `YYYY-MM-DD` string (see `toDateOnly`), so it survives JSON and time zones. */
export function FormDatePicker<V extends FieldValues, N extends FieldPath<V>>({
  locale,
  placeholder,
  labels,
  ...base
}: Base<V, N> & { locale: Locale; placeholder: string; labels: DatePickerLabels }) {
  return (
    <FormField {...base}>
      {({ field, control }) => (
        <DatePicker
          {...control}
          ref={field.ref}
          onBlur={field.onBlur}
          value={fromDateOnly(field.value)}
          onChange={(date) => field.onChange(date ? toDateOnly(date) : '')}
          locale={locale}
          placeholder={placeholder}
          labels={labels}
        />
      )}
    </FormField>
  );
}

export function FormPhoneInput<V extends FieldValues, N extends FieldPath<V>>({
  locale,
  labels,
  ...base
}: Base<V, N> & { locale: Locale; labels: PhoneInputLabels }) {
  return (
    <FormField {...base}>
      {({ field, control }) => (
        <PhoneInput
          {...control}
          ref={field.ref}
          onBlur={field.onBlur}
          value={field.value ?? ''}
          onChange={field.onChange}
          locale={locale}
          labels={labels}
        />
      )}
    </FormField>
  );
}

export function FormCurrencyInput<V extends FieldValues, N extends FieldPath<V>>({
  currency,
  locale,
  ...base
}: Base<V, N> & { currency: string; locale: Locale }) {
  return (
    <FormField {...base}>
      {({ field, control }) => (
        <CurrencyInput
          {...control}
          ref={field.ref}
          value={field.value ?? null}
          onChange={field.onChange}
          onBlur={field.onBlur}
          currency={currency}
          locale={locale}
        />
      )}
    </FormField>
  );
}

/** Checkbox and switch carry their own inline label, so they do not use the stacked label layout. */
function InlineField<V extends FieldValues, N extends FieldPath<V>>({
  kind,
  ...base
}: Base<V, N> & { kind: 'checkbox' | 'switch' }) {
  return (
    <FormField {...base} hideLabel>
      {({ field, control }) => {
        const Control = kind === 'checkbox' ? Checkbox : Switch;
        return (
          <div className="flex items-center gap-2">
            <Control
              {...control}
              ref={field.ref}
              checked={Boolean(field.value)}
              onCheckedChange={(v) => field.onChange(v === true)}
              onBlur={field.onBlur}
            />
            <Label htmlFor={control.id} className="font-normal">
              {base.label}
            </Label>
          </div>
        );
      }}
    </FormField>
  );
}
export const FormCheckbox = <V extends FieldValues, N extends FieldPath<V>>(props: Base<V, N>) => (
  <InlineField kind="checkbox" {...props} />
);
export const FormSwitch = <V extends FieldValues, N extends FieldPath<V>>(props: Base<V, N>) => (
  <InlineField kind="switch" {...props} />
);
