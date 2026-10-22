import { describe, expect, it } from 'vitest';
import { PERMISSION_ACTIONS } from './permissions.js';
import { can } from './permissions.js';
import { ROLES } from './roles.js';

describe('interim permissions', () => {
  it('lets every signed-in role read master data and only the super admin change it', () => {
    for (const role of ROLES) {
      expect(can(role, 'read', 'MasterData'), role).toBe(true);
      for (const action of PERMISSION_ACTIONS.filter((a) => a !== 'read')) {
        expect(can(role, action, 'MasterData'), `${role} ${action}`).toBe(role === 'super_admin');
      }
    }
  });
});
