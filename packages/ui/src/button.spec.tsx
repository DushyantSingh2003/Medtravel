import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from './button.js';

describe('Button', () => {
  it('renders its children', () => {
    const html = renderToStaticMarkup(<Button>Get a free opinion</Button>);
    expect(html).toContain('Get a free opinion');
  });

  it('defaults to type=button so it never submits a form by accident', () => {
    expect(renderToStaticMarkup(<Button>Go</Button>)).toContain('type="button"');
  });

  it('applies the variant classes', () => {
    const html = renderToStaticMarkup(<Button variant="secondary">Go</Button>);
    expect(html).toContain('ring-brand-200');
  });

  it('keeps caller classes', () => {
    const html = renderToStaticMarkup(<Button className="w-full">Go</Button>);
    expect(html).toContain('w-full');
  });
});
