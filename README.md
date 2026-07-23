# Infora

AI-native document production and control for infrastructure projects. The design
layer lives in [docs/](docs/) (start with [docs/architecture/infora-overview.md](docs/architecture/infora-overview.md));
the build board is [docs/build/plan.md](docs/build/plan.md).

## First-day path

Prerequisites: Node ≥ 24, Docker (Desktop or OrbStack), pnpm via corepack.

```bash
corepack enable                          # activates pnpm from package.json
pnpm install
docker compose up -d --wait              # Postgres 17 + pgvector on :5432
cp .env.example .env                     # defaults match the compose file
pnpm --filter @infora/db run migrate     # apply the five-drawer schema
pnpm --filter @infora/db run seed        # the walking-skeleton seed data
pnpm run check                           # dep rules + lint + typecheck + tests
pnpm --filter @infora/data run ingest    # embed the library (needs VOYAGE_API_KEY in .env)
pnpm --filter @infora/api run dev        # the typed API skeleton on :3000
```

Seeded dev logins (password `wrenfield-dev`): `rachel.bowen@trentmoor.example`
(owner), `eleanor.price@calderhale.example` (consultant),
`marcus.webb@calderhale.example` (no-Participant wall subject) and
`priya.nair@halvern.example` (third-org wall subject). Full table:
[docs/reference/dev-logins.md](docs/reference/dev-logins.md).

`pnpm run check` mirrors CI exactly. The dependency rules between workspace
packages are enforced (`scripts/dep-rules.mjs`) — surfaces depend only on
`contracts` and `ui`; a violation fails the build.

## Layout

- `apps/` — deployable surfaces (`api`, `web` — one app, role-scoped views; later `copilot-agent`, `word-addin`)
- `packages/` — the layers; see [docs/build/repo-structure.md](docs/build/repo-structure.md)
- `docs/` — the design layer: glossary (`CONTEXT.md`), architecture, ADRs, build docs, mockups
