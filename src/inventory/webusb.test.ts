/**
 * How the page reads a command's exit status off a phone too old for the shell protocol, which carries none: `legacy`
 * has the phone print it after the output, and `statusCut` takes it back off. Tested on bytes alone, a phone being the
 * one thing this suite cannot plug in.
 */

import { expect, test } from 'vitest';

import { statusCut } from './webusb.js';

const bytes = (...parts: (string | number[])[]) =>
  Uint8Array.from(parts.flatMap((part) => (typeof part === 'string' ? [...new TextEncoder().encode(part)] : part)));

test('a zero status is cut off and the output answered whole, binary and all', () => {
  // A PNG's signature and a stray newline in the middle of what the command wrote, neither of which is the marker.
  const output = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x0a, 0x00];

  expect(statusCut(bytes(output, '\npogo-utils-exit:0'), ['screencap', '-p'])).toStrictEqual(Uint8Array.from(output));
});

test('a status other than zero fails the command, naming it and the status', () => {
  expect(() => statusCut(bytes('half a png', '\npogo-utils-exit:1'), ['screencap', '-p'])).toThrow(
    /^screencap -p exited 1$/,
  );
});

test('output with no status after it fails rather than passing for a success', () => {
  expect(() => statusCut(bytes('cut off'), ['screencap', '-p'])).toThrow(/exited without saying how/);
});

test('the last marker is the one read, where the output itself holds the same text', () => {
  expect(new TextDecoder().decode(statusCut(bytes('\npogo-utils-exit:1', '\npogo-utils-exit:0'), ['cat']))).toBe(
    '\npogo-utils-exit:1',
  );
});
