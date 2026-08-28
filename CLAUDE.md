# CLAUDE.md

Infora is an AI-native document production and control platform for
infrastructure projects — cross-organisation review cycles behind a hard
ethical wall, with grounded, cited AI drafting.

## Orientation path

1. `README.md` — the first-day setup path and repo layout.
2. `docs/architecture/infora-overview.md` — the vision and the component cut.
3. `docs/build/v1.md` — **the current destination**: the first pilot, its scope
   cut, and what is deliberately deferred. Its **"V1 on one page"** summary is
   the fast read; read it before picking up a ticket.
4. `docs/build/plan.md` — the open ticket board (the 7-phases method's
   execution board), in two parts: **Building for V1** and **Beyond V1 — the
   deferred register**. Its **Where to start** section names the frontier and
   the gates.
5. `docs/grill-sessions/grill-questions.md` — the open-questions index (`Q-###`).

**For UI work** — the visual spec is `docs/design/` (rules, tokens, and
`mockups/`); read [docs/design/README.md](docs/design/README.md) for the mockup
lifecycle before drawing one. `.claude/skills/infora-design/` is the mirrored kit.

**Don't load by default** — precedent and record, not backlog:
`docs/build/plan-history.md` (closed slices) and
`docs/grill-sessions/grill-history.md` (completed sessions, closed rulings).

**Never load unless the owner names it** — `docs/grill-sessions/parking-lot.md`
(`P-###`): proposals that cannot be built without **amending an accepted ADR**.
Every entry contradicts the decision record by construction — that is its entry
criterion — so an agent that reads one during a grill or a build session will
produce work conflicting with both the ADRs and the built system, while
sounding well-informed because it can cite a real file. It is not backlog, not
design, and never a citation. Don't open it to "check if something is related";
if a task seems to need it, stop and ask.

## Working rules

- `pnpm run check` mirrors CI exactly (dep rules + lint + typecheck + tests).
- Package dependency rules are enforced by `scripts/dep-rules.mjs` — surfaces
  depend only on `contracts` + `ui`.
- Migrations are drawn in `docs/build/data-model.md` before being written. The
  snapshot under `migrations/meta/` was re-synced by T-344, so
  `pnpm --filter @infora/db run generate` is safe again: it emits nothing
  against an unchanged schema, and only the intended change otherwise. **Read
  what it emits before applying it**, and hand-write anything drizzle does not
  model — RLS policies, `CHECK` constraints, triggers, backfills — as its own
  statements in the generated file. **`drizzle-kit push` is still forbidden**:
  it does not see those objects and offers to drop them (see the note in
  data-model.md). **The drawing is state-dependent:** an *unbuilt* drawer carries field lists
  (the drawing board); once built, `packages/db/src/schema` is the authority on
  the shape and the drawer keeps narrative + pointer only. After a schema
  change, regenerate the atlas (`pnpm --filter @infora/db run datamodel`) —
  `pnpm run check` fails while it is stale.
- Contract completions get dated notes in `docs/build/contracts.md`, filtered
  by **why, not what**: an entry earns its place by recording a reason ("ingest
  split in two because the sweep was ~125,000 re-ingests"); "added endpoint X"
  is git's job. The file restates no type — `packages/contracts` is the spec.
- A ticket or ADR that introduces, stores, or derives data about a **named
  person** says so, and names where that data is deleted — the register is
  `docs/architecture/personal-data.md`.
- Design gaps go to `docs/grill-sessions/grill-questions.md` as open
  questions — never resolved inline. Derive the number with
  `pnpm run check:questions -- --next`, never by reading the counter line
  (T-343); `pnpm run check:tickets -- --next` is its equivalent for `T-###`.
  A proposal that cannot be built **without amending an accepted ADR** is not
  an open question — it is parked (`P-###`, `pnpm run check:parking -- --next`),
  and only on the owner's instruction. Never park something to avoid ruling it.
- `CONTEXT.md` is the vocabulary authority; ADRs are the decision record.
  Cite them, don't re-argue them.
- **A surface is not finished when it merges.** Anything built that the user
  stories describe is captured in its final form in
  `docs/architecture/user-stories.md` **and** the walkthrough (narrative in
  `scripts/user-story-walkthrough/build.mjs`, screenshots via its `capture.mjs`
  — never hand-edit the HTML). The mockup that proposed it is **deleted** at
  that point, so its reasoning must already be in the ADR before it goes.
  Built work **outside** that one journey belongs in its component doc and is
  never forced into the walkthrough; a beat that cannot be photographed stays
  a card saying so.
- One commit per ticket, `T-xxx: summary` style.

## Diagrams (`.tldr` files) — do not read as text

`docs/architecture/diagrams/*.tldr` are tldraw's native JSON format. Each is
40–75 KB of shape/coordinate records with almost no human-readable signal, so
reading one directly dumps tens of thousands of tokens for near-zero
comprehension. **Never `Read`, `cat`, or otherwise load a `.tldr` file's raw
contents.**

When a task needs a diagram's contents, render it locally and `Read` the PNG
(the Read tool renders images visually):

```bash
node scripts/tldr-to-png.mjs docs/architecture/diagrams/<name>.tldr  # or --all
```

No tldraw, no network — it parses the JSON and rasterises with the Chromium
under `e2e/` (T-214). Outputs are gitignored. The `.tldr` files stay the
editable source of truth; the PNG is a throwaway view for interpretation only.
