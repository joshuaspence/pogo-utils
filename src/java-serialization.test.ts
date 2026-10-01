/**
 * The bytes `dumps` writes are this module's whole contract: a JVM reads them or it does not, and nothing in between
 * reports a problem. So the small streams below are written out as literal bytes derived from Java's own
 * ObjectStreamConstants and the modified-UTF-8 rules, not read back out of this module — a test that asserts whatever
 * the writer currently emits agrees with a defect as readily as with a fix.
 *
 * The larger shapes go through `loads` instead, which is the one check that reaches the handle table: back-references
 * are positional, so a value written at the wrong size shifts every handle after it and the failure surfaces as some
 * later object being read as the wrong one. A round trip is what notices.
 *
 * What a round trip cannot see is anything the reader recomputes rather than reads, the map's capacity being exactly
 * that — so that one is asserted in the bytes.
 */

import { expect, test } from 'vitest';

import { JavaSer } from './java-serialization.js';

const { box, dumps, loads } = JavaSer;

/**
 * What `dumps` accepts. Named off the function rather than restated, because the types in that module are declared
 * inside the IIFE that is its body and it therefore exports none of them.
 */
type JavaValue = Parameters<typeof dumps>[0];

/** A stream as the literal bytes a hand-derived expectation is written as. */
const stream = (...values: number[]) => Uint8Array.from(values);

/** The bytes an ASCII string takes up in a stream, modified UTF-8 and ASCII agreeing over that range. */
const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

/** Every offset at which one byte sequence occurs, which is how a back-reference is counted rather than assumed. */
function positions(haystack: Uint8Array, needle: readonly number[]): number[] {
  const found = [];

  for (let at = 0; at <= haystack.length - needle.length; at += 1) {
    if (needle.every((byte, offset) => haystack[at + offset] === byte)) {
      found.push(at);
    }
  }

  return found;
}

/**
 * The root as the map it is. `loads` answers any of the four value shapes, so a test that wants the map says so and
 * fails here rather than reaching past a cast that would have made the mismatch somebody else's error.
 */
function rootMap(bytes: Uint8Array): Map<JavaValue, JavaValue> {
  const root = loads(bytes);

  if (!(root instanceof Map)) {
    throw new Error(`expected a HashMap at the root, got ${root === null ? 'null' : typeof root}`);
  }

  return root;
}

/**
 * The `[capacity, size]` pair HashMap writes as its custom block data, for a map of that many entries. Found by
 * searching for the marker and asserting it matched once, since the obvious offset is wrong: the four bytes before it
 * are the threshold, not the capacity.
 */
function blockData(entries: number): [number, number] {
  const map = new Map<JavaValue, JavaValue>(Array.from({ length: entries }, (_, index) => [`k${index}`, null]));
  const bytes = dumps(map);
  const found = positions(bytes, [0x77, 0x08]); // TC_BLOCKDATA, then the eight bytes of payload

  if (found.length !== 1 || found[0] === undefined) {
    throw new Error(`${found.length} block-data markers in a ${entries}-entry stream, expected 1`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  return [view.getInt32(found[0] + 2), view.getInt32(found[0] + 6)];
}

test("the stream opens with Java's magic and version, and the whole of `null` is one byte", () => {
  // `0xaced` and version 5 are what a JVM looks for before it reads anything else, so a stream missing them is a file
  // PGSharp refuses however right the rest of it is. These five bytes are the smallest complete stream there is.
  expect(dumps(null)).toEqual(stream(0xac, 0xed, 0x00, 0x05, 0x70));
  expect(loads(stream(0xac, 0xed, 0x00, 0x05, 0x70))).toBe(null);
});

test('a stream that is not one is refused rather than read as far as it happens to parse', () => {
  expect(() => loads(stream(0x00, 0x00, 0x00, 0x05, 0x70))).toThrow(/bad magic\/version/);
  expect(() => loads(stream(0xac, 0xed, 0x00, 0x04, 0x70))).toThrow(/bad magic\/version/);

  // Trailing bytes are the half-read file, and the expensive direction: the root parsed, so every check above this one
  // passed, and a backup would have been built from whatever the first object in some other format happened to be.
  expect(() => loads(stream(0xac, 0xed, 0x00, 0x05, 0x70, 0x00))).toThrow(/^1 trailing bytes/);
});

test('U+0000 takes two bytes, which is the whole of what makes this modified UTF-8', () => {
  // Java writes NUL as `C0 80` so that no byte inside a string is ever zero. A plain `00` is a different string *and* a
  // different length, so a name carrying one would desynchronise every byte after it rather than coming back wrong.
  expect(dumps('\u0000')).toEqual(stream(0xac, 0xed, 0x00, 0x05, 0x74, 0x00, 0x02, 0xc0, 0x80));

  // The control is the encoder a second implementation reaches for, and it disagrees in both bytes and length.
  expect([...new TextEncoder().encode('\u0000')]).toEqual([0x00]);

  expect(loads(dumps('\u0000'))).toBe('\u0000');
});

test('a character outside the BMP travels as its two surrogates, three bytes each', () => {
  // U+1F600 is `D83D DE00` in UTF-16 and modified UTF-8 encodes the code *units*, so six bytes where a code-point
  // encoder writes four. Derived from the high surrogate: `0xE0 | (0xD83D >> 12)` is `0xED`, then
  // `0x80 | ((0xD83D >> 6) & 0x3F)` is `0xA0` and `0x80 | (0xD83D & 0x3F)` is `0xBD`. The same three steps over
  // `0xDE00` give the other three bytes.
  const emoji = '\u{1F600}';

  expect(dumps(emoji)).toEqual(stream(0xac, 0xed, 0x00, 0x05, 0x74, 0x00, 0x06, 0xed, 0xa0, 0xbd, 0xed, 0xb8, 0x80));
  expect([...new TextEncoder().encode(emoji)]).toEqual([0xf0, 0x9f, 0x98, 0x80]);

  expect(loads(dumps(emoji))).toBe(emoji);
});

test('a sequence the stream cannot hold is refused, since a corrupt file otherwise reads as a short one', () => {
  // A length of 1 over a byte announcing a two-byte sequence: the bytes are all there, so the stream-level bounds check
  // passes and only the decoder can tell. Hand-patched from `dumps('a')` by swapping the payload byte.
  expect(() => loads(stream(0xac, 0xed, 0x00, 0x05, 0x74, 0x00, 0x01, 0xc2))).toThrow(/truncated modified UTF-8/);

  // `0xF0` leads a four-byte UTF-8 sequence, which is the one thing modified UTF-8 never writes — so a file encoded the
  // ordinary way is rejected here rather than decoded into a different string.
  expect(() => loads(stream(0xac, 0xed, 0x00, 0x05, 0x74, 0x00, 0x01, 0xf0))).toThrow(/invalid modified UTF-8 byte/);
});

test('the four things a value can be survive a round trip, nested inside each other', () => {
  const inner = new Map<JavaValue, JavaValue>([['deep', box('Z', true)]]);
  const root = new Map<JavaValue, JavaValue>([
    ['text', 'Melbourne Zoo'],
    ['count', box('I', -7)],
    ['hidden', box('J', 1n << 62n)],
    ['off', box('Z', false)],
    ['half', box('F', 0.5)],
    ['missing', null],
    ['nested', inner],
    ['\u0000', 'a key carries NUL as readily as a value does'],
  ]);

  // A nested map is the case the reader held wrongly once, its own fields having lived on the shared class descriptor:
  // that was correct only while no second instance of the class came between the write and the read back.
  expect(rootMap(dumps(root))).toEqual(root);
  expect(rootMap(dumps(root)).get('nested')).toEqual(inner);
});

test('a long round-trips exactly where a float cannot, which is why doubles travel as longs here', () => {
  // 2^53 + 1 is the smallest integer a JS number cannot hold, so a codec reading a long into a Number loses it and says
  // nothing: the value comes back one smaller and a hidden coordinate moves with it.
  const exact = (1n << 53n) + 1n;

  expect(Number(exact)).toBe(Number(exact - 1n));
  expect(loads(dumps(box('J', exact)))).toEqual(box('J', exact));

  // A negative long is what a reader reaching for `getBigUint64` loses, and the writer's `BigInt.asUintN(64, …)` is
  // not what saves it: `i8` takes each byte with `x & 0xffn` over an arithmetic `>>`, which is two's complement
  // already, so `asIntN` in its place writes the same eight bytes for every value in range. That conversion is
  // documentation rather than behaviour, and this assertion is about the reader's `getBigInt64`.
  expect(loads(dumps(box('J', -1n)))).toEqual(box('J', -1n));

  // `F` is four bytes and so lossy by construction, which is worth pinning because it is the reason the field above
  // exists: anything reaching for a float instead would lose a little of every value it carried.
  expect(Math.fround(0.1)).not.toBe(0.1);
  expect(loads(dumps(box('F', 0.1)))).toEqual(box('F', Math.fround(0.1)));
});

test("the writer's switch is the check a box's two fields cannot be, and it rejects the pair", () => {
  // A box holds its code beside its value and nothing at the type level ties them, so both of these type-check clean
  // and only the bytes can say. Before this check, `box('I', 'x')` wrote four zero bytes for `'x' >>> 24` and handed
  // back a stream of the right length that was wholly wrong.
  expect(() => dumps(box('J', 5))).toThrow(/^boxed java\.lang\.Long needs a BigInt value, got number/);
  expect(() => dumps(box('F', 1n))).toThrow(/^boxed java\.lang\.Float needs a Number value, got bigint/);

  // What the type *can* say, it does, so reaching the same throw with a string takes an assertion that it rejects one.
  // @ts-expect-error -- a string is no `BoxValue`, which is the compile-time half of the check below
  expect(() => dumps(box('I', 'x'))).toThrow(/^boxed java\.lang\.Integer needs a Number value, got string/);

  // An unsupported code fails at the call that named it instead, there being no field for it to be written to.
  // @ts-expect-error -- `D` is no `BoxCode` either, double being the width this codec does not box
  expect(() => box('D', 1)).toThrow(/^no boxed Java primitive for field type 'D'/);
});

test('a string said twice is written once and cited after that', () => {
  const twice = new Map<JavaValue, JavaValue>([
    ['first', 'Melbourne Zoo'],
    ['second', 'Melbourne Zoo'],
  ]);
  const bytes = dumps(twice);

  // Writing it twice is not merely longer. Handles are positional, so the second copy claims one and shifts every
  // handle after it, and a back-reference written before that shift now cites a different object altogether.
  expect(positions(bytes, ascii('Melbourne Zoo'))).toHaveLength(1);
  expect(rootMap(bytes)).toEqual(twice);
});

test('two equal strings share a handle where two equal boxes do not', () => {
  const shared = box('I', 1);
  const reused = new Map<JavaValue, JavaValue>([
    ['a', shared],
    ['b', shared],
  ]);
  const equal = new Map<JavaValue, JavaValue>([
    ['a', box('I', 1)],
    ['b', box('I', 1)],
  ]);

  // Strings are keyed by value and boxes by identity, and that is the right way round: two equal strings are one object
  // to anything reading them back, where two boxes are two cells a shared handle would quietly alias into one.
  expect(dumps(reused).length).toBeLessThan(dumps(equal).length);

  const back = rootMap(dumps(reused));

  expect(back.get('a')).toBe(back.get('b'));
  expect(rootMap(dumps(equal)).get('a')).not.toBe(rootMap(dumps(equal)).get('b'));
});

test('a string past what a two-byte length can say changes tag rather than overflowing it', () => {
  const longest = 'a'.repeat(0xffff);

  // The tag sits immediately after the four header bytes. `TC_STRING` carries a `u2` length, so one character more than
  // 65,535 has to become `TC_LONGSTRING` and an eight-byte one — truncating instead writes a length of zero.
  expect(dumps(longest)[4]).toBe(0x74);
  expect(dumps(`${longest}a`)[4]).toBe(0x7c);

  expect(loads(dumps(`${longest}a`))).toHaveLength(0x10000);

  // `utf`'s own `string too long for TC_STRING` throw is unreachable rather than uncovered: `string` is what routes a
  // long one to the other tag, and the only other caller is `classDesc`, which writes this module's own class and
  // field names. So no argument to `dumps` can be the string that trips it.
});

test("the map's capacity follows HashMap's own growth rather than its entry count", () => {
  // Capacity starts at 16 and doubles while the count exceeds three quarters of it, so twelve entries fit where
  // thirteen do not. The round trip cannot see this at all — the reader recomputes the capacity rather than reading it
  // — yet a JVM rehashes the table from these bytes, so a capacity disagreeing with the count is a map that loads
  // wrongly in the one consumer this file exists for.
  expect(blockData(12)).toEqual([16, 12]);
  expect(blockData(13)).toEqual([32, 13]);
});
