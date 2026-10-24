import { ApiError } from '@medtravel/api-client';
import { describe, expect, it } from 'vitest';
import { fieldProblems, statusOf } from './api-errors';

describe('fieldProblems', () => {
  it('reads the per-field errors of a validation or conflict answer', () => {
    const error = new ApiError(409, {
      statusCode: 409,
      message: 'This slug is already used',
      errors: [{ path: ['slug'], message: 'This slug is already used' }],
    });
    expect(fieldProblems(error)).toEqual([{ path: 'slug', message: 'This slug is already used' }]);
    expect(statusOf(error)).toBe(409);
  });

  it('joins a nested path with dots, so it matches the form field name', () => {
    const error = new ApiError(400, {
      errors: [{ path: ['translations', 'ar', 'name'], message: 'Required' }],
    });
    expect(fieldProblems(error)).toEqual([{ path: 'translations.ar.name', message: 'Required' }]);
  });

  it('gives an empty path for a problem with the whole body', () => {
    expect(
      fieldProblems(new ApiError(400, { errors: [{ path: [], message: 'Unrecognized key' }] })),
    ).toEqual([{ path: '', message: 'Unrecognized key' }]);
  });

  it('copes with anything else: another error, text, nothing', () => {
    expect(fieldProblems(new Error('network'))).toEqual([]);
    expect(fieldProblems(new ApiError(502, '<html>Bad gateway</html>'))).toEqual([]);
    expect(fieldProblems(new ApiError(500, { errors: 'nope' }))).toEqual([]);
    expect(fieldProblems(new ApiError(400, { errors: [null, { path: 'x', message: 1 }] }))).toEqual(
      [],
    );
    expect(statusOf(new Error('network'))).toBeUndefined();
  });
});
