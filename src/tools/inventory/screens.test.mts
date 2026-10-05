/**
 * What PGSharp's overlay reads as, over the screenshots committed beside this file.
 *
 * Every reader here is a pure function of a screenshot, so the only thing a test of them needs is the screenshot — no
 * phone and no network. That is the whole of why the captures are committed: a reader found by sweeping bands for a
 * box and thresholding what is in it cannot be reasoned about, only measured, and a capture is a measurement that
 * does not change.
 *
 * **A row says what PGSharp drew, not what the reader answered.** The level and the three IVs below are readable off
 * the committed file by anyone who opens it — `L20 ɪᴠ53 7/7/10` over the middle of the screen — so the assertions are
 * what the reader must agree with rather than a transcript of whatever it said first. A table recording the reading
 * would pass however the reader behaved.
 *
 * The captures are tracked in **Git LFS**, so a clone needs `git-lfs` installed; without it they arrive as 131-byte
 * pointer files and this fails on the first PNG decode rather than on anything it is about.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { assert, describe, expect, test } from 'vitest';
import { decodePng } from './png.mts';
import { findOverlay } from './overlay.mts';
import { type IVs } from './game-master.mts';

/** One capture and the overlay the game drew on it, or null where PGSharp drew none. */
interface Fixture {
  file: string;
  overlay: { iv: IVs; level: number; suffix?: string | null } | null;
}

/**
 * The captures that carry a detail screen. Each states its own level and IVs, and five also state the bracketed form
 * PGSharp appends — which is the only thing anywhere that can separate Unown's 28 letters, since they share one set of
 * base stats, one type and one move pool.
 */
const FIXTURES: readonly Fixture[] = [
  { file: 'applin.png', overlay: { iv: { attack: 10, defense: 14, stamina: 14 }, level: 15 } },
  { file: 'articuno-galar.png', overlay: { iv: { attack: 12, defense: 4, stamina: 13 }, level: 20 } },
  { file: 'articuno-kanto.png', overlay: { iv: { attack: 13, defense: 12, stamina: 12 }, level: 20 } },
  { file: 'basculin-blue.png', overlay: { iv: { attack: 8, defense: 3, stamina: 5 }, level: 5 } },
  { file: 'burmy-plant.png', overlay: { iv: { attack: 14, defense: 15, stamina: 15 }, level: 15 } },
  { file: 'burmy-sandy.png', overlay: { iv: { attack: 12, defense: 14, stamina: 11 }, level: 15 } },
  { file: 'burmy-trash.png', overlay: { iv: { attack: 0, defense: 7, stamina: 6 }, level: 5 } },
  { file: 'castform-normal.png', overlay: { iv: { attack: 10, defense: 14, stamina: 15 }, level: 17 } },
  { file: 'castform-rainy.png', overlay: { iv: { attack: 6, defense: 6, stamina: 4 }, level: 22 } },
  { file: 'castform-snowy.png', overlay: { iv: { attack: 5, defense: 5, stamina: 9 }, level: 18 } },
  { file: 'castform-sunny.png', overlay: { iv: { attack: 15, defense: 15, stamina: 15 }, level: 21 } },
  { file: 'chansey-dynamax.png', overlay: { iv: { attack: 13, defense: 14, stamina: 12 }, level: 20 } },
  { file: 'charizard-gigantamax.png', overlay: { iv: { attack: 12, defense: 12, stamina: 12 }, level: 20 } },
  { file: 'cherrim-overcast.png', overlay: { iv: { attack: 13, defense: 15, stamina: 9 }, level: 18 } },
  { file: 'cherrim-sunshine.png', overlay: { iv: { attack: 10, defense: 7, stamina: 7 }, level: 31 } },
  { file: 'deoxys-attack.png', overlay: { iv: { attack: 14, defense: 13, stamina: 14 }, level: 20 } },
  { file: 'deoxys-defense.png', overlay: { iv: { attack: 11, defense: 11, stamina: 14 }, level: 25 } },
  { file: 'deoxys-normal.png', overlay: { iv: { attack: 11, defense: 13, stamina: 15 }, level: 20 } },
  { file: 'deoxys-speed.png', overlay: { iv: { attack: 12, defense: 10, stamina: 15 }, level: 25 } },
  { file: 'dialga-altered.png', overlay: { iv: { attack: 12, defense: 15, stamina: 14 }, level: 25 } },
  { file: 'dialga-origin.png', overlay: { iv: { attack: 10, defense: 13, stamina: 13 }, level: 25 } },
  { file: 'eevee-background.png', overlay: { iv: { attack: 13, defense: 15, stamina: 15 }, level: 15 } },
  { file: 'growlithe-nickname.png', overlay: { iv: { attack: 14, defense: 12, stamina: 14 }, level: 20 } },
  { file: 'ho-oh.png', overlay: { iv: { attack: 13, defense: 15, stamina: 15 }, level: 25 } },
  { file: 'meloetta-aria.png', overlay: { iv: { attack: 13, defense: 15, stamina: 12 }, level: 15 } },
  { file: 'meowth-alola.png', overlay: { iv: { attack: 14, defense: 13, stamina: 2 }, level: 21 } },
  { file: 'meowth-galar.png', overlay: { iv: { attack: 14, defense: 12, stamina: 11 }, level: 20 } },
  { file: 'meowth-kanto.png', overlay: { iv: { attack: 15, defense: 14, stamina: 14 }, level: 20 } },
  { file: 'pikachu.png', overlay: { iv: { attack: 4, defense: 9, stamina: 9 }, level: 14 } },
  { file: 'pikachu-ash-hat.png', overlay: { iv: { attack: 9, defense: 2, stamina: 8 }, level: 21 } },
  { file: 'pikachu-santa-hat.png', overlay: { iv: { attack: 14, defense: 8, stamina: 9 }, level: 23 } },
  { file: 'pikachu-willows-assistant.png', overlay: { iv: { attack: 13, defense: 13, stamina: 11 }, level: 15 } },
  { file: 'pikachu-witch-hat.png', overlay: { iv: { attack: 2, defense: 11, stamina: 10 }, level: 27 } },
  { file: 'rotom-wash.png', overlay: { iv: { attack: 13, defense: 3, stamina: 1 }, level: 12 } },
  { file: 'smoliv.png', overlay: { iv: { attack: 11, defense: 10, stamina: 12 }, level: 15 } },
  { file: 'snorlax-purified.png', overlay: null },
  {
    file: 'spinda-04.png',
    overlay: { iv: { attack: 13, defense: 13, stamina: 15 }, level: 15, suffix: '04' },
  },
  { file: 'unown-b.png', overlay: { iv: { attack: 7, defense: 10, stamina: 7 }, level: 16, suffix: 'B' } },
  {
    file: 'unown-exclamation.png',
    overlay: { iv: { attack: 10, defense: 13, stamina: 14 }, level: 16, suffix: '[' },
  },
  { file: 'unown-m.png', overlay: { iv: { attack: 8, defense: 7, stamina: 5 }, level: 28, suffix: 'M' } },
  {
    file: 'unown-question.png',
    overlay: { iv: { attack: 4, defense: 12, stamina: 10 }, level: 16, suffix: '\\' },
  },
  { file: 'xurkitree.png', overlay: { iv: { attack: 11, defense: 12, stamina: 14 }, level: 20 } },
];

/**
 * The six captures that are not a detail screen with an overlay to read, which is why they are not rows. They are
 * asserted below instead, as what the reader answers on a screen none of it was written for — the half a corpus of
 * valid screens cannot state, since every row above asserts that the reader found the right thing and not one of them
 * asserts that it declines to find a thing that is not there.
 */
const NEGATIVE = [
  'deerling-pokedex.png',
  'nidoran-female-pokedex.png',
  'nidoran-male-pokedex.png',
  'no-pgsharp.png',
  'overworld.png',
  'pgsharp-no-overlay.png',
];

const WHOLE_CORPUS_TIMEOUT = 600_000;

/**
 * Memoised by file, which is what keeps the assertions free: OCR is the whole cost here at about a second a capture
 * for the sweep, and several of the tests below read a capture the loop has already read. Caching the promise rather
 * than the reading is what makes that hold whatever order the runner takes them in.
 */
const readings = new Map<string, ReturnType<typeof read>>();

const read = async (file: string) => {
  const image = decodePng(readFileSync(new URL(`fixtures/${file}`, import.meta.url)));
  const found = await findOverlay(image);

  return { image, box: found?.box ?? null, overlay: found?.overlay ?? null };
};

const readingOf = (file: string) => {
  const reading =
    readings.get(file) ?? read(file).catch((error: unknown) => (readings.delete(file), Promise.reject(error)));
  readings.set(file, reading);

  return reading;
};

/**
 * That every committed capture is accounted for, which is the one thing about this corpus no row can say. A PNG added
 * to `fixtures/` and left out of the table costs nothing and reports nothing — the suite goes on passing at whatever
 * size it was, and the capture sits in the tree looking exactly like a capture that is pinned. So the directory is the
 * authority and the table is checked against it, in both directions.
 */
test('every committed capture is either a row or a negative case', () => {
  const committed = readdirSync(new URL('fixtures', import.meta.url))
    .filter((file) => file.endsWith('.png'))
    .sort();

  expect(committed).toStrictEqual([...FIXTURES.map((f) => f.file), ...NEGATIVE].sort());
});

// Whether a box was found is asserted apart from what was read out of it, because the two are different failures and
// a reader fixed at either stage has to fail here.
for (const fixture of FIXTURES) {
  describe(`${fixture.file} carries the overlay PGSharp drew on it`, () => {
    test('overlay found', async () =>
      expect((await readingOf(fixture.file)).box !== null).toBe(fixture.overlay !== null));

    test('overlay ivs', async () =>
      expect((await readingOf(fixture.file)).overlay?.iv ?? null).toStrictEqual(fixture.overlay?.iv ?? null));

    test('overlay form', async () =>
      expect((await readingOf(fixture.file)).overlay?.form ?? null).toBe(fixture.overlay?.suffix ?? null));

    // The level is read as a shortlist rather than as a number, because the small-caps `L` comes back as an `L` on one
    // phone and a `1` on another and the `ɪᴠ` label behind it as another `1` — so `151` is `L15` and a stray, or a
    // stray and `51`, and the string cannot say which. Everything that could be the level is offered and the HP
    // settles it further down the pipeline, so what this asserts is that the true level is among them.
    test('overlay level is offered', async () => {
      const { overlay } = await readingOf(fixture.file);

      if (fixture.overlay === null) {
        expect(overlay).toBe(null);
        return;
      }

      assert.ok(overlay, `${fixture.file} yields no overlay at all`);
      expect(overlay.levels, `the level the screen states is not among the ones offered`).toContain(
        fixture.overlay.level,
      );
    });
  });
}

/**
 * The negative cases, which are what says the sweep declines a screen rather than finding a band on any of them. A
 * reader that answered a box on the map would be worse than one that answered nothing: the sweep runs over the middle
 * 70% of every screen a walk opens, and a false box is read as a level and three IVs.
 */
test(
  'no screen without an overlay on it reads as having one',
  async () => {
    const found: string[] = [];

    for (const file of NEGATIVE) {
      if ((await readingOf(file)).box !== null) {
        found.push(file);
      }
    }

    expect(found, 'a band of a screen with no overlay on it read as one').toStrictEqual([]);
    expect(NEGATIVE.length, 'the negative corpus has changed size').toBe(6);
  },
  WHOLE_CORPUS_TIMEOUT,
);

/**
 * The two properties of the shortlist that make the rest of the pipeline's level handling able to fail at all. They
 * are asserted off the captures rather than written into the table above, a shortlist being a reading and not a fact
 * about a Pokémon.
 *
 * The first is that some capture offers a level **above** its true one, which is what an HP test admitting any HP at
 * or above the one read needs in order to be caught: against a shortlist whose largest member is already the answer,
 * such a break cannot move anything. `applin.png` offers `51` for a level 15.
 *
 * The second is that some shortlist does **not** contain its true level, which would be what says the HP arbitrates
 * rather than tie-breaks. No capture here shows it, and that is asserted as the gap it is rather than left to be
 * discovered — every shortlist in this corpus overshoots but still holds the answer.
 */
test(
  'the shortlists overshoot a true level, and none misses one',
  async () => {
    const offered = FIXTURES.filter((f) => f.overlay !== null);
    const stated = new Map<string, readonly number[]>();

    for (const fixture of offered) {
      stated.set(fixture.file, (await readingOf(fixture.file)).overlay?.levels ?? []);
    }

    expect(offered.length, 'how many overlays are read has changed, so this says less').toBe(41);
    assert.ok(
      offered.some((f) => stated.get(f.file)?.some((level) => level > (f.overlay?.level ?? 0))),
      'no shortlist offers a level above the true one, so nothing can catch an HP test that is not exact',
    );
    expect(
      offered.filter((f) => !stated.get(f.file)?.includes(f.overlay?.level ?? 0)).map((f) => f.file),
      'a shortlist misses its own level, so the HP has something to arbitrate and the gap has closed',
    ).toStrictEqual([]);
  },
  WHOLE_CORPUS_TIMEOUT,
);
