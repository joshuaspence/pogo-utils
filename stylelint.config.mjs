export default {
  extends: ['stylelint-config-standard'],
  reportNeedlessDisables: true,
  rules: {
    'no-descending-specificity': null,

    /**
     * A comment spanning more than one line is a starred block, matching the JavaScript beside it: a bare opener, a
     * star down the left of every line after it, and the closer alone on the last. A single-line comment is left alone.
     *
     * Prettier will not do this — it reflows prose and code to `printWidth` but never the inside of a comment — so
     * without this rule nothing says which shape a comment takes, which is how two styles came to be in one repository.
     * The pattern matches the text between the delimiters, hence the leading star rather than the opener itself.
     */
    'comment-pattern': [
      '^(?:[^\\n]*|\\*\\n[\\s\\S]*)$',
      { message: 'A multi-line comment is a starred block: /** on its own line, then " * " on each line after it' },
    ],
  },
};
