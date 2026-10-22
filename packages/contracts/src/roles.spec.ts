import { describe, expect, it } from 'vitest';
import { PORTALS, ROLES, isPortal, isRole, portalOfRole } from './roles.js';

describe('roles and portals', () => {
  it('has the eleven roles of the PRD', () => {
    expect(ROLES).toHaveLength(11);
  });

  it('puts every role in exactly one of the five portals, and every portal has a role', () => {
    const used = new Set(ROLES.map(portalOfRole));
    expect([...used].sort()).toEqual([...PORTALS].sort());
  });

  it('sends each role where PRD section 2 says', () => {
    expect(portalOfRole('attendant')).toBe('patient');
    expect(portalOfRole('interpreter')).toBe('ops');
    expect(portalOfRole('doctor')).toBe('hospital');
    expect(portalOfRole('finance')).toBe('admin');
    expect(portalOfRole('agent')).toBe('agent');
  });

  it('narrows unknown values', () => {
    expect(isRole('doctor')).toBe(true);
    expect(isRole('root')).toBe(false);
    expect(isPortal('ops')).toBe(true);
    expect(isPortal('coordinator')).toBe(false);
  });
});
