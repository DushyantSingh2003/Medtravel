import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Role } from '@medtravel/contracts';
import { PermissionsProvider, useCan } from './permissions';

function Probe() {
  const can = useCan();
  const answers = [
    can('update', 'MasterData'),
    can('read', 'Document'),
    can('read', 'Case', 'stage'),
    can('read', 'Case', 'diagnosis'),
  ];
  return createElement('p', null, answers.join(','));
}

const render = (role: Role | null) =>
  renderToStaticMarkup(
    role
      ? createElement(PermissionsProvider, { role }, createElement(Probe))
      : createElement(Probe),
  );

describe('useCan', () => {
  it('answers from the permission matrix for the signed-in role', () => {
    expect(render('super_admin')).toBe('<p>true,true,true,true</p>');
    expect(render('agent')).toBe('<p>false,false,true,false</p>');
    expect(render('finance')).toBe('<p>false,false,true,false</p>');
    expect(render('case_manager')).toBe('<p>false,true,true,true</p>');
  });

  it('allows nothing outside a provider', () => {
    expect(render(null)).toBe('<p>false,false,false,false</p>');
  });
});
