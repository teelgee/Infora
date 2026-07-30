// @infora/external — everything that touches untrusted external content, and
// nothing else. T-250 (docs/ask/09 R3); the `web_research` worker itself is
// T-279.
//
// THE POINT OF THIS PACKAGE IS ITS MANIFEST. It depends on `@infora/contracts`
// and nothing more: no `@infora/db`, no `@infora/knowledge`, no
// `@infora/governance`. The code in here therefore *cannot* query a store,
// resolve an access slice, or read a chunk — not because it does not, but
// because there is nothing here to do it with. The dependency matrix
// (scripts/dep-rules.mjs) fails the build if that changes, which is what makes
// this a structural guarantee rather than an intention.
export { externalSource, WEB_RESEARCH_TRUST } from './web-research';
export type { WebFetcher, WebResearchDeps, WebResearchInput, WebResearchOutput } from './web-research';
