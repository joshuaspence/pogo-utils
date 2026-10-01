/**
 * `said` exists because `catch` binds `unknown` and a `throw` is not obliged to have thrown an `Error`. Every page here
 * reports a failure by putting this string in front of a reader, so the case it guards against is the one that reads
 * worst: a banner saying something went wrong and then saying `undefined` about what.
 */

import { expect, test } from 'vitest';

import { said } from './errors.js';

test('a caught value says what it is, whether or not it was ever an Error', () => {
  // The ordinary case, and the only one that reaching straight for `.message` would have got right.
  expect(said(new Error('no route named Melbourne Zoo'))).toBe('no route named Melbourne Zoo');
  expect(said(new TypeError('tzlookup is not a function'))).toBe('tzlookup is not a function');

  // A thrown string reads as itself. This is the one the module exists for: `.message` on a string is `undefined`, and
  // `undefined` in the banner is a page that has noticed a failure and refuses to say which.
  expect(said('fetch aborted')).toBe('fetch aborted');

  // And the two values that would otherwise throw a second time inside the handler reporting the first.
  expect([said(null), said(undefined)]).toEqual(['null', 'undefined']);

  // The check is `instanceof` rather than a `message` field, so something shaped like an error is not taken for one.
  // Worth pinning because the looser check reads as more generous and is how a plain object's message gets trusted.
  expect(said({ message: 'not an Error' })).toBe('[object Object]');
});
