import {
  MASTER_DEFINITIONS,
  hasTranslatedField,
  type MasterField,
  type MasterResource,
  type MasterRow,
} from '@medtravel/contracts';

/** What the form holds while it is being edited: text inputs give strings, so numbers and empties are fixed up later. */
export interface MasterFormValues {
  [field: string]: unknown;
  translations: { ar: { name: string; summary: string } };
}

/** The fields of a resource's form, as the contracts describe them. */
export const fieldsOf = (resource: MasterResource): readonly MasterField[] =>
  MASTER_DEFINITIONS[resource].fields;

const NUMBER_FIELDS = new Set(['minorUnits', 'typicalStayDays']);

const text = (value: unknown): string =>
  typeof value === 'string' ? value : value == null ? '' : String(value);

/** Starting values: the row being edited, or blanks (a new row starts active and left to right). */
export function initialValues(resource: MasterResource, row?: MasterRow): MasterFormValues {
  const values: MasterFormValues = {
    active: row?.active ?? true,
    translations: {
      ar: {
        name: row?.translations['ar']?.name ?? '',
        summary: row?.translations['ar']?.summary ?? '',
      },
    },
  };
  for (const field of fieldsOf(resource)) {
    if (field.type === 'boolean')
      values[field.name] = row ? Boolean(row[field.name as keyof MasterRow]) : false;
    else if (field.type === 'number')
      values[field.name] = text(
        row?.[field.name as keyof MasterRow] ?? (field.name === 'minorUnits' ? 2 : ''),
      );
    else values[field.name] = text(row?.[field.name as keyof MasterRow]);
  }
  return values;
}

/**
 * The request body the form stands for: trimmed text, empty optional fields as null, numbers as numbers, and the
 * Arabic translation only when it has a name. Immutable fields (codes) are left out when `editing`.
 */
export function toPayload(
  resource: MasterResource,
  values: MasterFormValues,
  editing: boolean,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { active: Boolean(values['active']) };
  for (const field of fieldsOf(resource)) {
    if (editing && field.createOnly) continue;
    const raw = values[field.name];
    if (field.type === 'boolean') payload[field.name] = Boolean(raw);
    else if (NUMBER_FIELDS.has(field.name)) {
      const trimmed = text(raw).trim();
      payload[field.name] =
        trimmed === '' ? (field.name === 'minorUnits' ? undefined : null) : Number(trimmed);
    } else {
      const trimmed = text(raw).trim();
      payload[field.name] =
        trimmed === '' ? (isRequired(resource, field.name) ? '' : null) : trimmed;
    }
  }
  const name = text(values.translations.ar.name).trim();
  const summary = text(values.translations.ar.summary).trim();
  const hasSummary = hasTranslatedField(resource, 'summary');
  payload['translations'] =
    name === ''
      ? {}
      : { ar: { name, ...(hasSummary ? { summary: summary === '' ? null : summary } : {}) } };
  return payload;
}

/** Fields the schemas require; everything else may be empty. */
export function isRequired(resource: MasterResource, name: string): boolean {
  if (['name', 'code', 'slug', 'specialityId', 'countryCode', 'kind'].includes(name)) return true;
  return resource === 'currencies' && name === 'minorUnits';
}

/** Only what differs from the saved row, so an edit sends a small PATCH and cannot overwrite someone else's change. */
export function changedFields(
  resource: MasterResource,
  row: MasterRow,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const before = toPayload(resource, initialValues(resource, row), true);
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key]),
    ),
  );
}
