import { describe, expect, it } from 'vitest';
import { REDACTED, scrubDeep, scrubEvent, scrubText, scrubUrl } from './scrub.js';

describe('scrubText', () => {
  it('removes emails, bearer tokens, long opaque strings and long numbers', () => {
    expect(scrubText('failed for asha.verma@example.com')).toBe(`failed for ${REDACTED}`);
    expect(scrubText('Bearer abc.def-ghi_123')).toBe(`Bearer ${REDACTED}`);
    expect(
      scrubText('token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk'),
    ).not.toContain('eyJ');
    expect(scrubText('passport N1234567 phone +971 50 123 4567')).not.toMatch(/1234567|123 4567/);
  });

  it('leaves ordinary words and short numbers alone', () => {
    expect(scrubText('Could not move case CASE-2026 to stage 4')).toBe(
      'Could not move case CASE-2026 to stage 4',
    );
  });
});

describe('scrubUrl', () => {
  it('drops the query string and hides one-time tokens in the path', () => {
    expect(scrubUrl('/auth/invitations/abc123?token=secret&x=1')).toBe(
      `/auth/invitations/${REDACTED}`,
    );
    expect(scrubUrl('/cases?stage=visa&q=Asha')).toBe('/cases');
  });
});

describe('scrubDeep', () => {
  it('hides sensitive keys at any depth and scrubs strings in the rest', () => {
    const out = scrubDeep({
      id: 'x',
      patient: { fullName: 'Asha Verma' },
      note: 'call asha@example.com',
      nested: [{ password: 'pw', ok: 1 }],
    }) as Record<string, unknown>;
    expect(out['patient']).toBe(REDACTED);
    expect(out['note']).toBe(REDACTED);
    expect(JSON.stringify(out)).not.toMatch(/Asha|asha@|"pw"/);
    expect((out['nested'] as { ok: number }[])[0]?.ok).toBe(1);
  });
});

describe('what else is cut', () => {
  it('keeps only the first line of an error message, and caps it', () => {
    const out = scrubEvent({
      exception: {
        values: [
          {
            value:
              'Invalid `prisma.patient.create()` invocation\n  data: { fullName: "Asha Rao", diagnosis: "x" }',
          },
        ],
      },
    });
    expect(JSON.stringify(out)).not.toMatch(/Asha|diagnosis/);
    const long = scrubEvent({ message: 'a '.repeat(400) });
    expect(long.message.length).toBeLessThanOrEqual(200);
  });

  it('drops what the page printed and what was clicked, but keeps that it happened', () => {
    const out = scrubEvent({
      breadcrumbs: [
        { category: 'console', message: 'Patient Asha Rao', level: 'error' },
        { category: 'ui.click', message: 'button.name-Asha' },
        { category: 'navigation', message: 'to /cases' },
      ],
    });
    expect(out.breadcrumbs[0]).toEqual({ category: 'console', level: 'error' });
    expect(out.breadcrumbs[1]).toEqual({ category: 'ui.click' });
    expect(out.breadcrumbs[2]?.message).toBe('to /cases');
  });

  it('keeps a request id header only when it has the shape of one', () => {
    const keep = scrubEvent({ request: { headers: { 'x-request-id': 'edge-trace-0001' } } });
    expect(keep.request.headers['x-request-id']).toBe('edge-trace-0001');
    const drop = scrubEvent({ request: { headers: { 'x-request-id': 'Asha Rao 0501234567' } } });
    expect(drop.request.headers['x-request-id']).toBe('[redacted]');
  });
});

describe('scrubEvent', () => {
  const event = () => ({
    message: 'Boom for asha@example.com',
    request: {
      url: 'https://api.example.com/auth/invitations/tok123?token=zzz',
      method: 'POST',
      cookies: { mt_at: 'secret' },
      data: { email: 'asha@example.com', passportNumber: 'N1234567' },
      query_string: 'token=zzz',
      headers: {
        cookie: 'mt_at=secret',
        authorization: 'Bearer abc',
        'x-request-id': 'req-12345678',
        'user-agent': 'vitest',
      },
    },
    user: { id: 'u1', email: 'asha@example.com', ip_address: '1.2.3.4', username: 'asha' },
    tags: { request_id: 'req-12345678' },
    extra: { diagnosis: 'cancer', safe: 'ok' },
    exception: {
      values: [
        {
          value: 'Cannot find asha@example.com',
          stacktrace: {
            frames: [
              { filename: 'a.js', vars: { password: 'pw' }, context_line: 'const x = passport' },
            ],
          },
        },
      ],
    },
    breadcrumbs: [
      {
        category: 'http',
        message: 'GET /x?email=a@b.co',
        data: { url: '/cases?q=Asha', method: 'GET', body: 'secret' },
      },
    ],
  });

  it('keeps the request id and the user id, and nothing personal', () => {
    const out = scrubEvent(event());
    const text = JSON.stringify(out);
    expect(text).not.toMatch(
      /asha|N1234567|mt_at|secret|Bearer abc|1\.2\.3\.4|cancer|const x|zzz|"pw"/i,
    );
    expect(out.tags.request_id).toBe('req-12345678');
    expect(out.user).toEqual({ id: 'u1' });
    expect(out.request.headers).toEqual({ 'x-request-id': 'req-12345678', 'user-agent': 'vitest' });
    expect(out.request.method).toBe('POST');
    expect(out.breadcrumbs[0]?.data).toEqual({ url: '/cases', method: 'GET' });
    expect(out.extra.safe).toBe('ok');
  });

  it('copes with an event that has none of these parts', () => {
    expect(scrubEvent({})).toEqual({});
  });
});
