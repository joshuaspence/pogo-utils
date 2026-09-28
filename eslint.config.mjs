import globals from 'globals';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import tseslint from 'typescript-eslint';

export default [
  js.configs.recommended,

  // Ahead of `prettier` so that anything formatting-related it brings is still disabled by it. The types themselves are
  // checked by `tsc`, not by this; what these rules add is the discipline around them, chiefly that a
  // `@ts-expect-error` carries a reason.
  ...tseslint.configs.strict,

  prettier,
  {
    rules: {
      'curly': ['error', 'all'],
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: 'multiline-block-like' },
        { blankLine: 'always', prev: 'multiline-block-like', next: '*' },
      ],
    },
  },

  {
    files: ['**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.browser,
        L: 'readonly',
        tzlookup: 'readonly',
      },
    },
  },

  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: globals.nodeBuiltin,
    },
  },
];
