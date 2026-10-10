import reactHooks from 'eslint-plugin-react-hooks';
import base from './base.mjs';

/**
 * Shared config plus the two React hooks rules that catch real bugs: hooks called conditionally,
 * and effects or memos with a stale dependency list. Used by every package that contains React.
 */
export default [
  ...base,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
