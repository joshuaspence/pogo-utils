/**
 * The DOM helpers every page needs: one to build an element, one to find one.
 *
 * `byId` is the interesting half. `document.getElementById` answers `HTMLElement | null`, and the pages then read a
 * `.value` or a `.checked` off whatever came back — two assumptions about markup that lives in a different file. An id
 * matching nothing, or matching a tag it did not used to, is a broken page rather than a case to handle, so this throws
 * where the disagreement is instead of letting a `null` travel until something further along trips over it.
 */

/**
 * An element, optionally with a class and some text. An empty `className` is skipped where an empty `text` is not, so
 * `el('span', null, '')` is a classless empty span rather than one reading `null`.
 *
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string | null} [className]
 * @param {string | null} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
export function el(tag, className, text) {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (text != null) {
    node.textContent = text;
  }

  return node;
}

/**
 * The element with this id, as the class asked for — `HTMLElement` where none is. Name a class only where the code
 * depends on one, since that is what the argument says: `byId('q', HTMLInputElement)` because a `.value` is read off
 * it, and a plain `byId('grid')` for a container whose tag the script has no opinion about.
 *
 * Two overloads rather than one `@template` defaulting to `HTMLElement`, because a type parameter appearing only in the
 * return position is inferred from the caller's own annotation: with the default, `byId('grid')` answers
 * `HTMLInputElement` to anyone who asks for one and the check is worth nothing. A fixed return type has nothing to
 * infer.
 *
 * @overload
 * @param {string} id
 * @returns {HTMLElement}
 */
/**
 * @template {HTMLElement} T
 * @overload
 * @param {string} id
 * @param {abstract new (...args: never) => T} type
 * @returns {T}
 */
/**
 * @param {string} id
 * @param {abstract new (...args: never) => HTMLElement} [type]
 * @returns {HTMLElement}
 */
export function byId(id, type = HTMLElement) {
  const node = document.getElementById(id);

  // Read before the check rather than inside it. `type` is erased to `HTMLElement` in this signature, so the checker
  // subtracts the whole of it and types `node` as `never` below — where at run time a `<span>` arrives there whenever a
  // narrower class was asked for. One `instanceof` covers both failures, since `null` is an instance of nothing.
  const found = node === null ? 'nothing' : `<${node.localName}>`;

  if (!(node instanceof type)) {
    throw new Error(`#${id}: expected ${type.name}, found ${found}`);
  }

  return node;
}
