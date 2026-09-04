# External reference

Material **Infora did not author**: standards, competitor teardowns, friction
maps. **Context, never authority, and never a citation in an ADR** — the
decision record cites its own reasoning, and a claim that rests on a vendor's
document is a claim the repo cannot defend. Where a reference informed a
ruling, the ADR states the reasoning in its own words and this folder holds
the background reading.

> **Enforced by `pnpm run check` and by CI** (`scripts/docs-rules.mjs`, both
> directions, from 2026-08-28 — this folder previously had no index at all, so
> a superseded teardown could sit here forever with nothing noticing).
> **Add a file here, add its row in the same commit.**

| Doc | What it is |
|---|---|
| `iso-19650.md` | The ISO 19650 concepts the product models — status codes, revisions, the CDE workflow — as read for the acceptance-coding and versioning decisions (ADR-0003/0041). |
| `ProjectWise-AssetWise-Competitive-Friction-Map.md` | Incumbent teardown: proven DMS primitives worth keeping, and the frictions Infora exists to avoid. Grounds Slice A / DMS decisions as context, not authority. |
| `legora-architecture.md` | Adjacent legal-AI benchmark: Legora's stack as reported, read when grounding agent/LLM design answers against a shipping product. Their tenant is one firm; Infora's cross-org ethical wall has no counterpart there. |
| `legora-ui-review.md` | The same benchmark's interface, read for the design-system work. |
| `app-builder-landscape.md` | The app-builder landscape, researched 2026-09-04 for the Tools app-builder exploration: internal app builders, AI-built apps, ArcGIS integration, multi-party data collection, embedded analytical agents, and where app code runs — what each category learned the hard way, cited. Context for the exploration and any design session after it, never authority. |
