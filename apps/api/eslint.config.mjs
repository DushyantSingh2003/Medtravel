import base from '@medtravel/config/eslint/base';

export default [
  ...base,
  {
    // Nest injects by the parameter types the compiler emits for decorated classes (tsconfig: emitDecoratorMetadata).
    // Telling the parser lets `consistent-type-imports` leave those imports as value imports.
    languageOptions: { parserOptions: { emitDecoratorMetadata: true, experimentalDecorators: true } },
  },
];
