'use client';

import { useCreateMaster, useUpdateMaster, type MasterRowDto } from '@medtravel/api-client';
import {
  MASTER_CREATE_SCHEMAS,
  MASTER_UPDATE_SCHEMAS,
  DOCUMENT_KINDS,
  hasTranslatedField,
  type MasterField,
  type MasterResource,
} from '@medtravel/contracts';
import {
  Button,
  FormCombobox,
  FormInput,
  FormSelect,
  FormSwitch,
  FormTextarea,
  Input,
  Label,
} from '@medtravel/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useId, useMemo, useState } from 'react';
import { useForm, type FieldValues, type Resolver, type ResolverOptions } from 'react-hook-form';
import type { ZodType } from 'zod';
import { fieldProblems, statusOf } from '../../lib/api-errors';
import {
  changedFields,
  fieldsOf,
  initialValues,
  isRequired,
  toPayload,
  type MasterFormValues,
} from './master-form-values';
import { useMasterOptions, type MasterOption } from './use-master-options';

interface MasterFormProps {
  resource: MasterResource;
  /** The row being edited; absent when adding. */
  row?: MasterRowDto;
  onSaved: (row: MasterRowDto) => void;
  onCancel: () => void;
}

/**
 * The add and edit form for every master table. Which fields it shows comes from the contracts, what is valid
 * comes from the same Zod schemas the API enforces, and what the server rejects is put on the field it names.
 */
export function MasterForm({ resource, row, onSaved, onCancel }: MasterFormProps) {
  const t = useTranslations('masters');
  const formId = useId();
  const editing = row !== undefined;
  const [formError, setFormError] = useState<string | null>(null);

  const create = useCreateMaster();
  const update = useUpdateMaster();
  const specialities = useMasterOptions('specialities', resource === 'treatments');
  const countries = useMasterOptions('countries', resource === 'cities');
  /** The active choices, plus the one the row already has even if it has since been deactivated. */
  const withCurrent = (options: MasterOption[] | undefined, current: MasterOption | undefined) =>
    current && !options?.some((option) => option.value === current.value)
      ? [...(options ?? []), current]
      : (options ?? []);

  // The form holds text; the schema judges what the request would carry, so that is what it is given.
  // One cast, here: Zod's input type is per resource, while the form works with any resource's values.
  const resolver = useMemo<Resolver<MasterFormValues>>(() => {
    const schema = (editing ? MASTER_UPDATE_SCHEMAS : MASTER_CREATE_SCHEMAS)[
      resource
    ] as unknown as ZodType<FieldValues, FieldValues>;
    const validate = zodResolver(schema);
    return (values, context, options) =>
      validate(
        toPayload(resource, values, editing),
        context,
        options as unknown as ResolverOptions<FieldValues>,
      ) as ReturnType<Resolver<MasterFormValues>>;
  }, [resource, editing]);

  const form = useForm<MasterFormValues>({
    resolver,
    defaultValues: initialValues(resource, row),
  });

  // `handleSubmit` hands over what the resolver returned, which is already the request body; the form's own
  // values are what `toPayload` expects, so read them from the form.
  const submit = form.handleSubmit(async () => {
    setFormError(null);
    const payload = toPayload(resource, form.getValues(), editing);
    try {
      if (row) {
        const changes = changedFields(resource, row, payload);
        // Nothing changed: there is nothing to save, and no audit row to write for it.
        if (Object.keys(changes).length === 0) return onCancel();
        const updated = await update.mutateAsync({ resource, id: row.id, data: changes });
        return onSaved(updated.data);
      }
      const created = await create.mutateAsync({ resource, data: payload });
      onSaved(created.data);
    } catch (error) {
      const problems = fieldProblems(error);
      // Only fields on this form can show an error; the rest (a conflict on the record itself) is told in the alert.
      const known = new Set([
        ...Object.keys(form.getValues()),
        'translations.ar.name',
        'translations.ar.summary',
      ]);
      const onFields = problems.filter((problem) => known.has(problem.path));
      for (const problem of onFields) {
        form.setError(problem.path as never, { type: 'server', message: problem.message });
      }
      const elsewhere = problems.filter((problem) => !known.has(problem.path));
      const status = statusOf(error);
      setFormError(
        status === 403
          ? t('form.forbidden')
          : elsewhere.length > 0
            ? elsewhere.map((problem) => problem.message).join(' ')
            : onFields.length > 0
              ? t('form.fixErrors')
              : t('form.saveFailed'),
      );
    }
  });

  const label = (name: string) => t(`fields.${name}`);
  const hint = (name: string): string | undefined =>
    ['code', 'slug', 'dialCode', 'minorUnits'].includes(name) ? t(`hints.${name}`) : undefined;

  function renderField(field: MasterField) {
    const common = {
      control: form.control,
      name: field.name,
      label: label(field.name),
      required: isRequired(resource, field.name),
      requiredLabel: t('form.required'),
    };
    const pickList = {
      placeholder: t('placeholders.select'),
      searchPlaceholder: t('placeholders.search'),
      emptyLabel: t('table.emptyTitle'),
    };
    switch (field.type) {
      case 'boolean':
        return <FormSwitch key={field.name} {...common} />;
      case 'textarea':
        return <FormTextarea key={field.name} {...common} rows={3} />;
      case 'number':
        return (
          <FormInput key={field.name} {...common} description={hint(field.name)} type="number" />
        );
      case 'speciality':
        return (
          <FormCombobox
            key={field.name}
            {...common}
            {...pickList}
            options={withCurrent(
              specialities.data,
              row?.speciality
                ? { value: row.speciality.id, label: row.speciality.name }
                : undefined,
            )}
          />
        );
      case 'country':
        return (
          <FormCombobox
            key={field.name}
            {...common}
            {...pickList}
            options={withCurrent(
              countries.data,
              row?.countryCode ? { value: row.countryCode, label: row.countryCode } : undefined,
            )}
          />
        );
      case 'documentKind':
        return (
          <FormSelect
            key={field.name}
            {...common}
            options={DOCUMENT_KINDS.map((kind) => ({ value: kind, label: t(`kinds.${kind}`) }))}
            placeholder={t('placeholders.select')}
          />
        );
      default:
        return editing && field.createOnly ? (
          <div key={field.name} className="space-y-1.5">
            <Label htmlFor={`${formId}-${field.name}`}>{label(field.name)}</Label>
            <Input
              id={`${formId}-${field.name}`}
              value={String(row?.[field.name as keyof MasterRowDto] ?? '')}
              readOnly
              aria-describedby={`${formId}-${field.name}-hint`}
            />
            <p id={`${formId}-${field.name}-hint`} className="text-sm text-muted-foreground">
              {t('hints.code')}
            </p>
          </div>
        ) : (
          <FormInput key={field.name} {...common} description={hint(field.name)} />
        );
    }
  }

  return (
    <form
      id={formId}
      onSubmit={submit}
      noValidate
      className="flex flex-1 flex-col gap-4 overflow-y-auto"
    >
      {fieldsOf(resource).map(renderField)}
      <FormSwitch
        control={form.control}
        name="active"
        label={label('active')}
        description={t('hints.active')}
      />
      <fieldset className="space-y-3 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">{t('arabic.heading')}</legend>
        <p className="text-sm text-muted-foreground">{t('arabic.hint')}</p>
        <FormInput
          control={form.control}
          name="translations.ar.name"
          label={t('arabic.name')}
          dir="rtl"
        />
        {hasTranslatedField(resource, 'summary') ? (
          <FormTextarea
            control={form.control}
            name="translations.ar.summary"
            label={t('arabic.summary')}
            rows={3}
            dir="rtl"
          />
        ) : null}
      </fieldset>
      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}
      <div className="mt-auto flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('actions.cancel')}
        </Button>
        <Button type="submit" loading={form.formState.isSubmitting}>
          {editing ? t('actions.save') : t('actions.create')}
        </Button>
      </div>
    </form>
  );
}
