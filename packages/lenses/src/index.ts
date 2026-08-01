// @infora/lenses — the Lens layer: domain content plus the loader and
// validator that keep it honest (T-281).
//
// A LENS CHANGES REGISTER, NEVER REACH. This package depends on
// `@infora/contracts` and nothing else — no db, no knowledge, no governance —
// so there is nothing in here with which to reach a store, resolve an access
// slice or narrow a retrieval. That is not a convention: the dependency matrix
// (scripts/dep-rules.mjs) fails the build if it changes, and `reach.test.ts`
// pins the assembly signature against a Lens ever becoming a parameter of it.
//
// The definitions themselves live at `definitions/`, beside AUTHORING.md, and
// are owned by planning and environmental specialists rather than engineers.
export { CORE_RULES, negatedCoreRule } from './core';
export type { CoreRule } from './core';
export { clearLensCache, DEFINITIONS_DIR, LensValidationError, loadLenses } from './load';
export type { LensRegistry, LoadLensesOptions } from './load';
export { RETIRED_LENS_IDS, validateLens } from './validate';
export type { LensValidation } from './validate';
export { composeLensOverlay } from './prompt';
