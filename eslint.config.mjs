import globals from 'globals';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import tseslint from 'typescript-eslint';

export default [
  {
    // The build, which is the compiler's output rather than anything anyone wrote: `dist/` would be linted as a second
    // copy of every module, and `.types/` is generated declarations. `.claude/worktrees/` is another branch's checkout,
    // which flat config lints too, a leading dot no longer being ignored.
    ignores: ['dist/**', '.types/**', '.claude/worktrees/**'],
  },

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
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.browser,
    },
  },

  {
    files: ['**/*.mjs', '**/*.mts'],
    languageOptions: {
      globals: globals.nodeBuiltin,
    },
  },
];
