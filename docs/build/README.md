# The build layer

Build-facing documentation: the blueprints that turn settled concepts into code-ready structure. This layer sits **below** the five design artefacts and depends on them.

- **Design layer** (already established) — `CONTEXT.md` (language), [overview](../architecture/infora-overview.md) (vision), the [component docs](../architecture/components/) (structure), [`docs/architecture/adr/`](../architecture/adr/) (decisions), the [grill tracker](../grill-sessions/grill-questions.md) (process log). These answer *what Infora is* and *why each boundary sits where it does*.
- **Build layer** (this folder) — turns those settled concepts into what a developer types: the stored tables, the typed API, the first build slice. These answer *what gets built first, and how*.

The boundary between the two is a **gate**: a concept is grilled into the design layer first, then translated here. Nothing in this folder invents new design — where it surfaces a genuine design gap, that goes back to the grill tracker as an open question, not resolved here.

## The gate before code

No database migration or application code is written until the artefacts below exist and are agreed. The [open-questions index](../grill-sessions/grill-questions.md) is the authority on what is still undecided (`Q-###`, each carrying what it blocks); this folder is where the gating build-docs live.

## Artefacts

**Two axes, deliberately kept apart** — a document can be perfectly settled *and* superseded, which the old single-column vocabulary could not say.

**Lifecycle** — is this worked from *now*?
▶ **Live** (the current horizon) · ♻ **Living reference** (updated as the build moves) · ✅ **Closed** (superseded; precedent only, **don't load by default**) · ⚙ **Derived** (regenerate, never hand-edit).

**Maturity** — how settled is the content? 🟢 settled · 🟡 drafted, under review · 🔴 open.

> **Naming rule:** a closed companion takes the **`-history` suffix** beside its live sibling (`plan.md` → `plan-history.md`, `grill-questions.md` → `grill-history.md`). Suffix, never a subfolder — links stay stable, and the pair sorts adjacent so you cannot miss it.
>
> **Enforced:** `pnpm run check` fails if a file in this folder is missing from the table below, or if the table names a file that does not exist. The convention in prose is what let a 363-line superseded ticket pack sit here unnoticed for five weeks; the convention in CI is what catches the next one.

| Doc | Lifecycle | Purpose | Maturity |
|-----|-----------|---------|----------|
| `v1.md` | ▶ **Live** | **The current destination** — the first pilot: three organisations, the full DMS lifecycle, a 100–500 document corpus, three declared workflows, Lens in Ask. Names the scope cut and what is deliberately deferred. Read before picking up a ticket. | 🟢 Drafted 2026-07-31; amended 2026-08-01 (`Q-007`, `Q-008`, `Q-012` closed → ADR-0048/0049, gate re-cut on the infra ruling), 2026-08-03 (schema import, the privacy programme → ADR-0050) and 2026-08-04 (the ingest and locator halves marked built) |
| `plan.md` | ▶ **Live** | The ticket board execution works from (the 7-phases method's phase 6), in **two parts** since 2026-08-05: **Building for V1** (everything that ships in the pilot, waypoint-sequenced) and **Beyond V1 — the deferred register** (recorded, gated, not scheduled). **Where to start** names the frontier and the gates. Closed slices move to `plan-history.md` in the same commit. | 🟢 Live board — re-cut on V1 2026-07-31; two-part re-cut 2026-08-05 |
| `data-model.md` | ♻ **Living reference** | The drawers' **narrative and design decisions**, drawn drawer by drawer. **State-dependent (re-cut 2026-08-04):** an *unbuilt* drawer carries field lists — the drawing board every migration is written against; a *built* drawer's shape authority is `packages/db/src/schema`, and the drawer keeps narrative + pointer only. | 🟢 Six drawers built and reduced; the next drawn drawer carries fields until it lands |
| `contracts.md` | ♻ **Living reference** | The API's **law and record** — the five principles (three of them tests), the pointer catalogue of what each contract guarantees, and the dated why-log. **`packages/contracts` is the spec**; this file restates no type (re-cut 2026-08-04). Completions still get dated notes, filtered to *why*, never *what*. | 🟢 Re-cut 2026-08-04 |
| `repo-structure.md` | ♻ **Living reference** | The monorepo and package layout, the dependency matrix, and the components↔packages reconciliation. Revisit when a slice forces a new package. | 🟢 Settled (T-215) |
| `plan-history.md` | ✅ **Closed** | The closed-slice archive: every ✅ slice's full record, moved verbatim from `plan.md` as slices close. Precedent, not a board. Also the record of the **walking skeleton** (milestones M0–M6), whose spec was removed 2026-08-04 once everything it specified was built. | ✅ Archive — grows one block per closed slice |
| `data-model.html` | ⚙ **Derived** | The stored schema **as built** (open in a browser): per-drawer table atlas with columns, FKs and trigger-derived integrity badges, **generated** by `packages/db/scripts/generate-data-model.ts`. **CI-enforced current**: `pnpm run check` fails when it is stale (`check:data-model`); regenerate with `pnpm --filter @infora/db run datamodel`. | ⚙ Current by construction since 2026-08-04 |

**Moved out 2026-08-28 — `operating-envelope.md` and `personal-data.md` now live in [docs/architecture/](../architecture/README.md).** Neither answered this folder's question. The operating envelope states what the deployment must **meet**, and the personal-data register states what is **held** — a requirement and a record, both derived from the design layer and read by a pilot agreement, a DPA and a customer's DPIA, none of which is a developer typing. Their new folder has its own index under the same guard, so nothing left CI's reach. Links from here go up one and across: `../architecture/personal-data.md`.

**The rule this folder now applies without exception:** a document earns a place here if a developer opens it to write code — the tables, the typed API, the package layout, the destination, the board. If it is instead a **standing record** the pilot is measured or contracted against, it belongs in the architecture layer. Where a document plausibly reads both ways, ask which question it answers: *what gets built, and how* is here; *what Infora is, why a boundary sits there, and what it must meet* is up a level.

Research spikes live in [spikes/](spikes/) with their own index, under the same guard.

Scope discipline: the data model is drawn **drawer by drawer, in step with what is being built** — only the entities the slice in build touches, never the whole system at once. Deferred components (custom workflows, spatial connectors) get their tables when they are built.
