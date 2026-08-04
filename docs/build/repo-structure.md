# Repository structure

> **Status: settled (T-215, 2026-07-26).** Relocated from the overview on 2026-06-27 and held provisional while the build validated the cut. Roughly 190 tickets later the layout has held unchanged — every slice landed inside it without forcing a new package — so it is recorded as settled, and the component↔package reconciliation promised at relocation is drawn below. Revisit only when a slice genuinely forces a new package (the Slice H connectors, the Slice B add-in).

A pnpm + Turborepo monorepo, TypeScript throughout. Surfaces are apps; the layers are packages; governance and access policy are cross-cutting packages enforced at the API boundary.

```
infora/
├─ apps/
│  ├─ api/                # only deployable that touches the DB and models
│  ├─ web/                # React: the one web app, role-scoped views (was web-consultant;
│  │                      #   renamed T-110, 2026-07-14 — the owner sees the same app, so the
│  │                      #   formerly planned web-owner portfolio split is superseded)
│  ├─ word-addin/         # Office.js task pane, thin client → api (later; not yet created)
│  └─ copilot-agent/      # M365 declarative agent + API plugin → api (ADR-0031; deferred with M6)
├─ packages/
│  ├─ model/              # model-agnostic router + provider adapters (the ADR-0037 choke point)
│  ├─ orchestration/      # planner, chain leaves, run state (ADR-0028)
│  ├─ data/               # connectors, ingestion, retrieval (pgvector)
│  ├─ knowledge/          # context assembly gateway (ADR-0029); org/project stores as they land
│  ├─ capabilities/       # grounded-gen, compliance, tabular, plain-english
│  ├─ workflows/          # standard + custom workflows composing capabilities
│  ├─ external/           # untrusted external content (web research) — contracts only, by rule (T-250)
│  ├─ lenses/             # Lens definitions (domain content) + loader/validator — contracts only, by rule (T-281)
│  ├─ governance/         # access predicates + wall, grounding/NLI rails
│  ├─ db/                 # Postgres + pgvector: schema (6 drawers), migrations, seed
│  ├─ contracts/          # shared types + API schema (single source of truth)
│  └─ ui/                 # shared React kit + design tokens
├─ e2e/                   # Playwright browser + API acceptance suites (T-084)
├─ evals/                 # the Ask eval harness: cases + fixtures as data, run over HTTP (T-255)
├─ scripts/               # the CI guards — dep-rules, source-rules, docs-rules,
│                         # and the two numbering guards (check-tickets /
│                         # check-questions over counter-rules.mjs, T-343);
│                         # plus tldr-to-png.mjs
└─ turbo.json  pnpm-workspace.yaml  tsconfig.base.json
```

Dependencies flow inward and down: surfaces depend only on `contracts` and `ui`; `api` composes `workflows`; `workflows` use `capabilities` and `orchestration`; those draw on `model`, `data`, `knowledge`. `governance` and `db` are depended on, never depend back. The rules are enforced by `scripts/dep-rules.mjs` — a violation fails CI.

**Two** entries in that matrix are security controls rather than layering choices, and both are the same move — a package confined to `contracts` so that a property holds by having nothing to reach with, rather than by discipline. Widening either line is the event code review exists to catch.

- **`external` may depend on `contracts` and nothing else** (T-250, finding F3, [the board's Wave 0 reference](plan.md)). Everything that touches untrusted web content lives there, so the code holding a prompt injection from a fetched page has no route to a store, an access slice or a chunk.
- **`lenses` may depend on `contracts` and nothing else** (T-281, non-negotiable 11). A Lens changes register, never reach, so the package holds no store handle, no access slice and no retrieval query with which to narrow anything. The converse — the access path reaching back for a Lens — is `scripts/source-rules.mjs` RULE 3, which forbids `governance`, `knowledge` and `data` from mentioning a Lens at all.

The one entry in that matrix depending on a deployable is `evals` (T-255), deliberately: a case must execute through the real API boundary, because that is where identity is established, and a fixture is data that must be materialised through `db`. Nothing depends on `evals` and it ships in no deployable, so the direction stays one-way.

## Components ↔ packages (the reconciliation)

The eight [components](../architecture/infora-overview.md) are **design boundaries** (could one team own this behind an interface?); packages are **build boundaries** (what a bundler and the dependency rules see). The grains differ deliberately — a component may span packages and one package may serve two components — so the mapping is recorded rather than assumed:

| Component | Where it lives in the tree |
|---|---|
| 1 Foundation | `db` (schema, migrations, seed) · `model` (router + adapters) · `contracts` · the CI substrate (`scripts/dep-rules.mjs`) |
| 2 Access | `governance` — the access predicates (`access.ts`, `sandbox.ts`), evaluated at the `api` boundary; no code path resolves its own permissions |
| 3 Governance | `governance` — ground-check and rails; the audit record written by `orchestration`'s run-writer into `db` drawer 3 |
| 4 Context | `knowledge` (the assembly gateway, ADR-0029) · `data` (ingestion + retrieval over pgvector) · `external` (untrusted web content, deliberately outside every store — T-250) |
| 5 Document management | **no dedicated package, by design** — the lifecycle is `db` drawers 2/5 plus the `api` route modules (plan, cycle, transmittal, renditions, sandbox, naming) |
| 6 Engine | `orchestration` (the chain + run state) · `capabilities` (the skills) · `workflows` (the recipes) · `lenses` (the register overlays as domain content — T-281) |
| 7 Connectors *(deferred)* | future home in `data` |
| 8 Surfaces | `apps/web` · `ui` · the `api` app as the one deployable over the layers; later `word-addin`, `copilot-agent` |

Two asymmetries are deliberate, recorded here so they are never "discovered" as drift:

- **One `governance` package serves two components (2 and 3).** Access and rails are both default-deny policy evaluated at the same API boundary with the same invariant (a subordinate scope narrows, never pierces); splitting them would separate code that must move together.
- **Document management has no package.** Its logic is the stored shape (drawers 2/5, where the append-only triggers live) plus API routes. It earns a package only when a second surface — the Slice B Word add-in — needs to share that logic; extracting it earlier would be speculative structure.

The `db` schema is not improvised at the keyboard. It is drawn and agreed first in [data-model.md](data-model.md) — the translation of the `CONTEXT.md` glossary into stored tables and relationships — before the first migration is written.
