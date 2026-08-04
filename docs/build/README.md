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
| `plan.md` | ▶ **Live** | The ticket board Phase 6 works from. Its **Where to start** section names the frontier, the sequenced work, the fog and the three gates. Closed slices move to `plan-history.md` in the same commit. | 🟢 Live board — re-cut on V1 2026-07-31 |
| `data-model.md` | ♻ **Living reference** | The `CONTEXT.md` glossary drawn as stored tables, fields and relationships. Drawn **drawer by drawer, in step with what is being built** — the authority every migration is written against. | 🟢 Six drawers drawn; extended per slice |
| `contracts.md` | ♻ **Living reference** | The API's **law and record** — the five principles (three of them tests), the pointer catalogue of what each contract guarantees, and the dated why-log. **`packages/contracts` is the spec**; this file restates no type (re-cut 2026-08-04). Completions still get dated notes, filtered to *why*, never *what*. | 🟢 Re-cut 2026-08-04 |
| `repo-structure.md` | ♻ **Living reference** | The monorepo and package layout, the dependency matrix, and the components↔packages reconciliation. Revisit when a slice forces a new package. | 🟢 Settled (T-215) |
| `operating-envelope.md` | ♻ **Living reference** | The pilot's operational envelope (renamed from `nfr.md` 2026-08-04): scale, availability, RPO/RTO, latency, security floor, revisit triggers. **Re-cut for V1 2026-08-01** as the first act of the infra/security session — organisations 1 → 3, which fired revisit trigger 1 by construction and made RLS blocking. The figures are the numbers the infra decisions were made against, and the numbers a pilot agreement may point at. | 🟢 Agreed — `Q-027` closed 2026-08-01 |
| `personal-data.md` | ♻ **Living reference** | **The personal-data register** — what data about a named person is held, why, and where it is deleted, derived from `packages/db/src/schema` and the ADRs that put each field there. Plus the **sub-processor list** transcribed from ADR-0047. Four things read from it: ADR-0050, its contract-end clause, the DPA, and a customer's own DPIA. | ♻ Seeded 2026-08-01; **deletion positions filled 2026-08-03 from ADR-0050**. Controller/processor still open (`Q-035`) |
| `plan-history.md` | ✅ **Closed** | The closed-slice archive: every ✅ slice's full record, moved verbatim from `plan.md` as slices close. Precedent, not a board. Also the record of the **walking skeleton** (milestones M0–M6), whose spec was removed 2026-08-04 once everything it specified was built. | ✅ Archive — grows one block per closed slice |
| `data-model.html` | ⚙ **Derived** | The stored schema visualised (open in a browser): per-drawer table atlas + pan/zoom ontology graph, generated from `packages/db/src/schema`. A throwaway view — regenerate after schema changes; `data-model.md` stays the authority. | ⚙ **Stale** — snapshot at migration 0030; the schema is at **0039** (0038 `elevated_refusals`, 0039 chunk offsets). Regenerate and republish before relying on it |

Research spikes live in [spikes/](spikes/) with their own index, under the same guard.

Scope discipline: the data model is drawn **drawer by drawer, in step with what is being built** — only the entities the slice in build touches, never the whole system at once. Deferred components (custom workflows, spatial connectors) get their tables when they are built.
