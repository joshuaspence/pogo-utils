/**
 * What a species and its forms are called on the page, as against the constant `pokedex.js` binds them to. Shared by
 * the search builder, which offers the names to type, and the Pokédex, which shows them — so a name corrected here is
 * corrected on both.
 */

/**
 * The species whose name its constant cannot be spelled back out of. A constant drops the punctuation the games write a
 * name with or turns it into an underscore, and that underscore stands for something different every time: a space in
 * `IRON_HANDS`, a hyphen in `HO_OH`, a full stop and a space in `MR_MIME`, a colon and one in `TYPE_NULL`, and in
 * `NIDORAN_F` a symbol no keyboard has. `FARFETCHD` and `FLABEBE` lost a character outright. Nothing can derive those
 * back, so these eighteen are written out and every other name is derived from its constant.
 *
 * Each is the name the game itself displays, from PokeMiners' string table — `pokemon_name_0250` is `Ho-Oh` — checked
 * against pokemondb's GO Pokédex, which agrees on all eighteen except for writing that one `Ho-oh` in one of the two
 * attributes it carries the name in.
 *
 * An entry whose constant `pokedex.js` has since renamed leaves that species named the way its constant reads, which is
 * a name looking odd rather than a page that fails — worth knowing when one here looks wrong.
 *
 * Keyed by `string` rather than by the constants it holds, so that `nameOf` takes any constant and answers from the
 * table or from `titleise`. Naming them would make the fallback unreachable to the checker and every correction here a
 * type edit, where the point of the `??` is that a constant absent from this table is the ordinary case.
 *
 * @type {Record<string, string>}
 */
const SPELLINGS = {
  NIDORAN_F: 'Nidoran♀',
  NIDORAN_M: 'Nidoran♂',
  FARFETCHD: "Farfetch'd",
  MR_MIME: 'Mr. Mime',
  HO_OH: 'Ho-Oh',
  MIME_JR: 'Mime Jr.',
  PORYGON_Z: 'Porygon-Z',
  FLABEBE: 'Flabébé',
  TYPE_NULL: 'Type: Null',
  JANGMO_O: 'Jangmo-o',
  HAKAMO_O: 'Hakamo-o',
  KOMMO_O: 'Kommo-o',
  SIRFETCHD: "Sirfetch'd",
  MR_RIME: 'Mr. Rime',
  WO_CHIEN: 'Wo-Chien',
  CHIEN_PAO: 'Chien-Pao',
  TING_LU: 'Ting-Lu',
  CHI_YU: 'Chi-Yu',
};

/**
 * A constant as its name reads, right for every species SPELLINGS does not speak for: `IRON_HANDS` is `Iron Hands`.
 *
 * `charAt` rather than `word[0]`, which is `string | undefined` to the checker because a segment could be empty — as
 * one would be given a constant spelled `A__B`. None is, checked over every constant `pokedex.js` binds and every form
 * name hung off one. Worth saying rather than assuming, because where the two do differ `charAt` writes a name with a
 * stray space where the index read threw, and quietly is the worse of the two ways to be wrong.
 *
 * @param {string} constant
 * @returns {string}
 */
const titleise = (constant) =>
  constant
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/**
 * The form names the constant-to-words rule gets wrong: the two Unown that are punctuation, a percentage the constant
 * had to spell out, and two whose hyphen or accent was dropped. Every other form reads the way `titleise` writes it.
 *
 * @type {Record<string, string>}
 */
const FORM_SPELLINGS = {
  EXCLAMATION_MARK: '!',
  QUESTION_MARK: '?',
  TEN_PERCENT_FORME: '10% Forme',
  FIFTY_PERCENT_FORME: '50% Forme',
  POM_POM_STYLE: 'Pom-Pom Style',
  POKE_BALL: 'Poké Ball',
};

/**
 * A species' name, from the constant it is bound to: `IRON_HANDS` is `Iron Hands`, `HO_OH` is `Ho-Oh`.
 *
 * @param {string} constant
 * @returns {string}
 */
export const nameOf = (constant) => SPELLINGS[constant] ?? titleise(constant);

/**
 * A form's name, from the name `pokedex.js` files it under: `COMBAT_BREED` is `Combat Breed`.
 *
 * @param {string} form
 * @returns {string}
 */
export const formNameOf = (form) => FORM_SPELLINGS[form] ?? titleise(form);

/**
 * A name folded to what a reader will actually type: lower case, and with the accents taken off, so `flabebe` finds
 * Flabébé from a keyboard that cannot easily write it.
 *
 * @param {string} name
 * @returns {string}
 */
export const fold = (name) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
