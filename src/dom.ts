/**
 * The DOM helpers every page needs: one to build an element, one to find one. An id matching nothing, or matching a
 * tag it did not used to, is a broken page rather than a case to handle, so `byId` throws where the disagreement is
 * instead of letting a `null` travel until something further along trips over it.
 */

/**
 * An element, optionally with a class and some text. An empty `className` is skipped where an empty `text` is not, so
 * `el('span', null, '')` is a classless empty span rather than one reading `null`.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string | null,
  text?: string | null,
): HTMLElementTagNameMap[K] {
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
 * depends on one, which is what the argument says.
 *
 * Two overloads rather than one type parameter defaulting to `HTMLElement`, because a type parameter appearing only in
 * the return position is inferred from the caller's own annotation: with the default, `byId('grid')` answers
 * `HTMLInputElement` to anyone who asks for one and the check is worth nothing.
 */
export function byId(id: string): HTMLElement;
export function byId<T extends HTMLElement>(id: string, type: abstract new (...args: never) => T): T;

export function byId(id: string, type: abstract new (...args: never) => HTMLElement = HTMLElement): HTMLElement {
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
