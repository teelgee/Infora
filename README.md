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
cp .env.example .env                     # defaults match the compose file; provider keys ship as boot-safe placeholders
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env  # required — the API refuses to boot without it
pnpm --filter @infora/db run migrate     # apply the schema (runs as the DB owner)
pnpm --filter @infora/db run seed        # the walking-skeleton seed data
pnpm run check                           # record guards + dep rules + lint + typecheck + tests
pnpm --filter @infora/data run ingest    # embed the library (needs a real VOYAGE_API_KEY in .env)
pnpm --filter @infora/api run dev        # the typed API skeleton on :3000
```

Seeded dev logins (all share the password `wrenfield-dev`; log in on the web
sign-in screen, or `POST /auth/session` with `{ email, password }`), on the
project **Wrenfield–Ashcombe 400kV Connection** (owner: Trentmoor Energy):

| Email | Organisation | Role |
|---|---|---|
| `rachel.bowen@trentmoor.example` | Trentmoor Energy | **Owner** · org admin · elevated — the owner view (MIDP, sharing, review confirmation) |
| `eleanor.price@calderhale.example` | Calder & Hale | **Consultant** · org admin · lead author · elevated — the producing-side view (TIDP, sandbox, drafting, promotion) |
| `marcus.webb@calderhale.example` | Calder & Hale | Authenticates but has **no Participant** — a wall-test subject (T-022), not a working account |
| `priya.nair@halvern.example` | Halvern Associates | Authenticates but the org has **no Membership** — a wall-test subject (T-022) |

The seed also holds the **conflict-register scenario** (T-298, ADR-0046): a
second client and scheme — **Marchwood Aggregates** owns **Marchwood Quarry Rail
Link**, with `hannah.sturt@marchwood.example` as its owner admin — and Calder &
Hale acts for both clients. Eleanor works **both** schemes, so declaring a wall
over the pair immediately reports her (the retrospective case, reported and
never revoked); `owen.vance@calderhale.example` works Wrenfield only and is the
subject an individual-grain wall on Eleanor must leave alone. Declare from
Personal settings → Ethical walls, signed in as Eleanor. Rachel and Eleanor hold
the **elevated** capability (T-174), which gates destructive lifecycle actions;
ordinary participants do not see those actions.

**Two database roles, deliberately (T-247).** Migrations and the seed run as the
owner (`MIGRATE_DATABASE_URL`); everything else — the API, the tests, the e2e
harness — connects as the unprivileged `infora_app` (`DATABASE_URL`), which
migration 0034 creates. This is not tidiness: a Postgres superuser bypasses
row-level security entirely, so connecting as the owner would make the RLS
backstop on the grounding index theatre. The app role also holds no TRUNCATE
privilege — a running app has no business wiping a table.

`pnpm run check` is CI's fast half: every gate it runs, CI runs too (wired
2026-08-28), and CI then adds the dependency audit, migrate, seed, the eval
smoke tier, the build and the e2e suite on a clean machine. So green locally
means the static half will pass, not that CI will. The dependency rules between workspace
packages are enforced (`scripts/dep-rules.mjs`) — surfaces depend only on
`contracts` and `ui`; a violation fails the build.

## Layout

- `apps/` — deployable surfaces (`api`, `web` — one app, role-scoped views; later `copilot-agent`, `word-addin`)
- `packages/` — the layers; see [docs/build/repo-structure.md](docs/build/repo-structure.md)
- `e2e/`, `evals/` — the two harnesses: Playwright acceptance, and the Ask eval harness ([evals/README.md](evals/README.md))
- `docs/` — the design layer: glossary (`CONTEXT.md`), architecture, ADRs, build docs, mockups
