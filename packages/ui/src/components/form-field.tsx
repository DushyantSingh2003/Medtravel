'use client';

import { useId, type ReactNode } from 'react';
import {
  Controller,
  type Control,
  type ControllerFieldState,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import { cn } from '../lib/cn';
import { Label } from './label';

/** Attributes every control needs to be announced correctly with its label, hint and error. */
export interface FieldControlProps {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
}

export interface FormFieldProps<TValues extends FieldValues, TName extends FieldPath<TValues>> {
  control: Control<TValues>;
  name: TName;
  label: string;
  description?: string;
  /** Shows the required marker; validation itself lives in the Zod schema. */
  required?: boolean;
  /** Accessible text for the required marker, e.g. "required". */
  requiredLabel?: string;
  className?: string;
  /** The control renders its own label (checkbox, switch), so skip the stacked one. */
  hideLabel?: boolean;
  children: (args: {
    field: ControllerRenderProps<TValues, TName>;
    fieldState: ControllerFieldState;
    control: FieldControlProps;
  }) => ReactNode;
}

/**
 * Connects one form field to React Hook Form and wires the accessibility attributes:
 * label, hint and error message are linked to the control, and the error is announced. Server
 * validation errors set with `setError` appear through the same path as client errors.
 */
export function FormField<TValues extends FieldValues, TName extends FieldPath<TValues>>({
  control,
  name,
  label,
  description,
  required,
  requiredLabel,
  className,
  hideLabel,
  children,
}: FormFieldProps<TValues, TName>) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const errorId = `${id}-error`;
        const hintId = `${id}-hint`;
        const describedBy = [description ? hintId : null, fieldState.error ? errorId : null].filter(Boolean).join(' ');
        return (
          <div data-slot="form-field" className={cn('grid content-start gap-1.5', className)}>
            {hideLabel ? null : <Label htmlFor={id}>
              {label}
              {required ? (
                <>
                  <span aria-hidden="true" className="ms-0.5 text-destructive">
                    *
                  </span>
                  {requiredLabel ? <span className="sr-only"> ({requiredLabel})</span> : null}
                </>
              ) : null}
            </Label>}
            {children({
              field,
              fieldState,
              control: { id, 'aria-invalid': Boolean(fieldState.error), 'aria-describedby': describedBy || undefined },
            })}
            {description ? (
              <p id={hintId} className="text-xs text-muted-foreground">
                {description}
              </p>
            ) : null}
            {fieldState.error?.message ? (
              <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
                {fieldState.error.message}
              </p>
            ) : null}
          </div>
        );
      }}
    />
  );
}
