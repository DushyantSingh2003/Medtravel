import { describe, expect, it } from 'vitest';
import { deviceLabel } from './device-label.js';

describe('deviceLabel', () => {
  it('names the browser and the system', () => {
    expect(
      deviceLabel(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      ),
    ).toBe('Chrome on Windows');
    expect(
      deviceLabel(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1',
      ),
    ).toBe('Safari on iOS');
    expect(
      deviceLabel('Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0'),
    ).toBe('Firefox on Linux');
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36 Edg/120.0')).toBe(
      'Edge on Windows',
    );
  });

  it('copes with nothing or something unknown', () => {
    expect(deviceLabel(undefined)).toBeNull();
    expect(deviceLabel('curl/8.0')).toBeNull();
  });
});
