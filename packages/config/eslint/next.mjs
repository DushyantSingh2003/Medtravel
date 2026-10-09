import base from './base.mjs';

/**
 * Next.js workspaces spread `eslint-config-next` on top of the shared base.
 * It is imported by the app itself (it must resolve from the app's own
 * node_modules, where the Next version is pinned) and passed in here.
 *
 * @param {import('eslint').Linter.Config[]} nextConfigs
 * @returns {import('eslint').Linter.Config[]}
 */
export default function nextConfig(nextConfigs = []) {
  return [...base, ...nextConfigs];
}
