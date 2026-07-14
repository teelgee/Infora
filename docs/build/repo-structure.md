# Repository structure (provisional)

> **Status: provisional / evolving.** This is the current working cut of the code layout, relocated from the overview on 2026-06-27 because it is build-facing implementation detail, not solution narrative. Expect it to shift as the build proceeds and the data model and component cut firm up. Packages are a *finer* grain than the [components](../architecture/infora-overview.md) — in particular the Engine component spans `orchestration`, `capabilities` and `workflows` below; reconcile the two when this is firmed up.

A pnpm + Turborepo monorepo, TypeScript throughout. Surfaces are apps; the layers are packages; governance and access policy are cross-cutting packages enforced at the API boundary.

```
infora/
├─ apps/
│  ├─ api/                # only deployable that touches the DB and models
│  ├─ web/                # React: the one web app, role-scoped views (was web-consultant;
│  │                      #   renamed T-110, 2026-07-14 — the owner sees the same app, so the
│  │                      #   formerly planned web-owner portfolio split is superseded)
│  ├─ word-addin/         # Office.js task pane, thin client → api (later)
│  └─ copilot-agent/      # M365 Copilot declarative agent + API plugin → api (ADR-0031)
├─ packages/
│  ├─ model/              # model-agnostic router + provider adapters
│  ├─ orchestration/      # planner, sub-agents, tool registry, run state
│  ├─ data/               # connectors, ingestion, retrieval (pgvector)
│  ├─ knowledge/          # project + org context stores, signal capture (moat)
│  ├─ capabilities/       # grounded-gen, compliance, tabular, plain-english
│  ├─ workflows/          # standard + custom workflows composing capabilities
│  ├─ governance/         # audit log, grounding/NLI, rails, access policy
│  ├─ db/                 # Postgres + pgvector: schema, migrations, seed
│  ├─ contracts/          # shared types + API schema (single source of truth)
│  └─ ui/                 # shared React kit + design tokens
└─ turbo.json  pnpm-workspace.yaml  tsconfig.base.json
```

Dependencies flow inward and down: surfaces depend only on `contracts` and `ui`; `api` composes `workflows`; `workflows` use `capabilities` and `orchestration`; those draw on `model`, `data`, `knowledge`. `governance` and `db` are depended on, never depend back.

The `db` schema is not improvised at the keyboard. It is drawn and agreed first in [data-model.md](data-model.md) — the translation of the `CONTEXT.md` glossary into stored tables and relationships — before the first migration is written.
