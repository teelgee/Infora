// MUST NOT COMPILE. The worker's dependencies carry a fetcher and nothing
// else; handing it a store handle must not typecheck, and the package manifest
// means the handle cannot even be imported here to try (docs/build/ask/09 R3 §3).
import type { WebResearchDeps, WebFetcher } from '../../src/web-research';

declare const web: WebFetcher;
declare const db: unknown;
declare const assemble: unknown;

// expected: object literal may only specify known properties
export const deps: WebResearchDeps = { web, db, assemble };
