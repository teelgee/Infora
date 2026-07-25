# CLAUDE.md

Infora is an AI-native document production and control platform for
infrastructure projects — cross-organisation review cycles behind a hard
ethical wall, with grounded, cited AI drafting.

## Orientation path

1. `README.md` — the first-day setup path and repo layout.
2. `docs/architecture/infora-overview.md` — the vision and the component cut.
3. `docs/build/plan.md` — the open ticket board (Phase 6 works from it).
   `docs/build/plan-history.md` is closed-slice precedent only — don't load it
   by default.

## Working rules

- `pnpm run check` mirrors CI exactly (dep rules + lint + typecheck + tests).
- Package dependency rules are enforced by `scripts/dep-rules.mjs` — surfaces
  depend only on `contracts` + `ui`.
- Migrations are drawn in `docs/build/data-model.md` before being written.
- Contract completions get dated notes in `docs/build/contracts.md`.
- Design gaps go to `docs/grill-sessions/grill-questions.md` as open
  questions — never resolved inline.
- `CONTEXT.md` is the vocabulary authority; ADRs are the decision record.
  Cite them, don't re-argue them.
- One commit per ticket, `T-xxx: summary` style.

## Diagrams (`.tldr` files) — do not read as text

`docs/architecture/diagrams/*.tldr` are tldraw's native JSON format. Each is
40–75 KB of shape/coordinate records with almost no human-readable signal, so
reading one directly dumps tens of thousands of tokens for near-zero
comprehension. **Never `Read`, `cat`, or otherwise load a `.tldr` file's raw
contents.**

When a task seems to need a diagram's contents:

1. Ask the user first — confirm the diagram is actually needed before spending
   anything on it.
2. On confirmation, render it to a **PNG** and `Read` that image (the Read tool
   renders PNGs visually), rather than reading the raw JSON or asking the user
   to export it by hand.

The `.tldr` files stay the editable source of truth; the PNG is a throwaway
view for interpretation only.

> A repo converter that renders `.tldr` → PNG locally (parsing the JSON, no
> tldraw or network, rasterising with the Chromium already installed under
> `e2e/`) is a planned follow-up — not yet built. Until it exists, ask the user
> how they want a specific diagram rendered.
