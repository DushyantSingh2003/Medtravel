import { describe, expect, it } from 'vitest';
import { languageForFirstVisit } from './first-visit';

const visit = (headers: Record<string, string>, cookie?: string) =>
  languageForFirstVisit(new Headers(headers), {
    get: (name) => (cookie && name === 'NEXT_LOCALE' ? { value: cookie } : undefined),
  });

describe('languageForFirstVisit', () => {
  it('uses the browser’s language before the country', () => {
    expect(visit({ 'accept-language': 'ar-EG,ar;q=0.9', 'cf-ipcountry': 'GB' })).toBe('ar');
    expect(visit({ 'accept-language': 'en-GB', 'x-vercel-ip-country': 'AE' })).toBe('en');
  });

  it('falls back to the country’s language when the browser asks for nothing we have', () => {
    expect(visit({ 'accept-language': 'fr', 'cf-ipcountry': 'AE' })).toBe('ar');
    expect(visit({ 'cf-ipcountry': 'SA' })).toBe('ar');
  });

  it('stays in English otherwise', () => {
    expect(visit({ 'accept-language': 'fr', 'cf-ipcountry': 'GB' })).toBe('en');
    expect(visit({})).toBe('en');
  });

  it('leaves a visitor who already chose alone', () => {
    expect(visit({ 'cf-ipcountry': 'AE' }, 'en')).toBeNull();
  });
});
