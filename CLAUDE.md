# CLAUDE.md

Infora is an AI-native document production and control platform for
infrastructure projects — cross-organisation review cycles behind a hard
ethical wall, with grounded, cited AI drafting.

## Orientation path

1. `README.md` — the first-day setup path and repo layout.
2. `docs/architecture/infora-overview.md` — the vision and the component cut.
3. `docs/build/v1.md` — **the current destination**: the first pilot, its scope
   cut, and what is deliberately deferred. Read before picking up a ticket.
4. `docs/build/plan.md` — the open ticket board (Phase 6 works from it). Its
   **Where to start** section names the frontier and the gates.
5. `docs/grill-sessions/grill-questions.md` — the open-questions index (`Q-###`).

**Don't load by default** — precedent and record, not backlog:
`docs/build/plan-history.md` (closed slices) and
`docs/grill-sessions/grill-history.md` (completed sessions, closed rulings).

## Working rules

- `pnpm run check` mirrors CI exactly (dep rules + lint + typecheck + tests).
- Package dependency rules are enforced by `scripts/dep-rules.mjs` — surfaces
  depend only on `contracts` + `ui`.
- Migrations are drawn in `docs/build/data-model.md` before being written, then
  **written by hand** — `drizzle-kit generate` re-emits every migration from
  0032 onward because its snapshot has drifted, and applying that output would
  be destructive. Append the `migrations/meta/_journal.json` entry by hand too.
- Contract completions get dated notes in `docs/build/contracts.md`.
- A ticket or ADR that introduces, stores, or derives data about a **named
  person** says so, and names where that data is deleted — the register is
  `docs/build/personal-data.md`.
- Design gaps go to `docs/grill-sessions/grill-questions.md` as open
  questions — never resolved inline. Derive the number with
  `pnpm run check:questions -- --next`, never by reading the counter line
  (T-343); `pnpm run check:tickets -- --next` is its equivalent for `T-###`.
- `CONTEXT.md` is the vocabulary authority; ADRs are the decision record.
  Cite them, don't re-argue them.
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
