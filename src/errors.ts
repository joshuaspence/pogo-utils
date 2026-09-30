/**
 * What a caught value has to say. `catch` binds `unknown`, and a `throw` is not obliged to have thrown an `Error` — so
 * the places that report a failure ask rather than assume, and a thrown string reads as itself instead of `undefined`.
 */
export const said = (e: unknown) => (e instanceof Error ? e.message : String(e));
