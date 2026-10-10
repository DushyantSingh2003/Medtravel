// jsdom lacks a few browser APIs that Radix UI, cmdk and TanStack Virtual call.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

if (typeof window !== 'undefined') {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
}

// Minimal DOM matchers (a tiny subset of jest-dom) so the tests read naturally.
import { expect } from 'vitest';

expect.extend({
  toBeInTheDocument(received: Element | null) {
    const pass = Boolean(received && received.ownerDocument.contains(received));
    return { pass, message: () => `expected element ${pass ? 'not ' : ''}to be in the document` };
  },
  toHaveAttribute(received: Element, name: string, value?: string) {
    const actual = received.getAttribute(name);
    const pass = value === undefined ? actual !== null : actual === value;
    return { pass, message: () => `expected attribute ${name} ${pass ? 'not ' : ''}to be ${String(value)}, got ${String(actual)}` };
  },
  toHaveTextContent(received: Element, text: string) {
    const actual = received.textContent ?? '';
    const pass = actual.includes(text);
    return { pass, message: () => `expected text "${actual}" ${pass ? 'not ' : ''}to contain "${text}"` };
  },
  toHaveClass(received: Element, ...names: string[]) {
    const pass = names.every((name) => received.classList.contains(name));
    return { pass, message: () => `expected classes "${received.className}" ${pass ? 'not ' : ''}to include ${names.join(' ')}` };
  },
  toBeDisabled(received: HTMLElement) {
    const pass = (received as HTMLButtonElement).disabled === true || received.getAttribute('aria-disabled') === 'true';
    return { pass, message: () => `expected element ${pass ? 'not ' : ''}to be disabled` };
  },
  toBeChecked(received: HTMLElement) {
    const pass = (received as HTMLInputElement).checked === true || received.getAttribute('aria-checked') === 'true' || received.getAttribute('data-state') === 'checked';
    return { pass, message: () => `expected element ${pass ? 'not ' : ''}to be checked` };
  },
});

declare module 'vitest' {
  interface Assertion<T = unknown> {
    toBeInTheDocument(): T;
    toHaveAttribute(name: string, value?: string): T;
    toHaveTextContent(text: string): T;
    toHaveClass(...names: string[]): T;
    toBeDisabled(): T;
    toBeChecked(): T;
  }
}
