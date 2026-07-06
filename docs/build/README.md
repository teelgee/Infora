# The build layer

Build-facing documentation: the blueprints that turn settled concepts into code-ready structure. This layer sits **below** the five design artefacts and depends on them.

- **Design layer** (already established) — `CONTEXT.md` (language), [overview](../architecture/infora-overview.md) (vision), the [component docs](../architecture/) (structure), [`docs/adr/`](../adr/) (decisions), the [grill tracker](../grill-sessions/grill-questions.md) (process log). These answer *what Infora is* and *why each boundary sits where it does*.
- **Build layer** (this folder) — turns those settled concepts into what a developer types: the stored tables, the typed API, the first build slice. These answer *what gets built first, and how*.

The boundary between the two is a **gate**: a concept is grilled into the design layer first, then translated here. Nothing in this folder invents new design — where it surfaces a genuine design gap, that goes back to the grill tracker as an open question, not resolved here.

## The gate before code

No database migration or application code is written until the artefacts below exist and are agreed. The grill tracker's [Path to MVP](../grill-sessions/grill-questions.md) is the authority on what gates coding; this folder is where those gating build-docs live.

## Artefacts

| Doc | Purpose | Status |
|-----|---------|--------|
| `data-model.md` | The `CONTEXT.md` glossary drawn as stored tables, fields and relationships — scoped to the walking skeleton. The foundation every other build-doc writes against. | 🟢 Draft-location item closed (2026-07-04); final review at first migration |
| `walking-skeleton.md` | The first build slice as a standalone spec: scope cut, milestones (M0–M6), acceptance criteria, what is real vs stubbed, incl. the Copilot Ask surface. (Promoted from the grill tracker's Path to MVP.) | 🟢 Spec complete — draft-location decided (owner-confirmed 2026-07-04) |
| `contracts.md` | The handful of typed API endpoints the skeleton needs; the seed of `packages/contracts`. Falls out of the M1/M3 grills and the walking-skeleton milestones. | 🟡 First cut drafted (2026-07-04) — review with the first `packages/contracts` commit |
| `plan.md` | The ticket board: the walking skeleton as execution-ready tickets with blocking relationships (T-001…T-081), plus the phased post-skeleton roadmap (Slices A–H) and the skeleton-auth decision. The Phase-5 planning artefact execution works from. | 🟡 Drafted (2026-07-04) — review before execution starts |
| `repo-structure.md` | The monorepo + package layout and dependency rules. Relocated from the overview; provisional, to reconcile with the component cut. | 🟡 Provisional |

Scope discipline: the data model is drawn **drawer by drawer, in step with what is being built** — only the entities the walking skeleton touches, never the whole system at once. Deferred components (custom workflows, spatial connectors) get their tables when they are built.
