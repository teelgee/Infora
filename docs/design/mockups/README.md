# Mockups - the live register

A mockup is a **visual test**: a screen drawn before it exists, to see whether
a design and a feature work before anything is built. When the build overtakes
it, it moves to [`archive/`](archive/README.md). Why, and the full loop, are in
[the design README](../README.md#mockups-what-they-are-for).

> **Enforced by `pnpm run check` and by CI** (`scripts/docs-rules.mjs`, both
> directions). A mockup added without a row fails, and so does a row naming a
> file that isn't here. **Archiving a mockup means moving its row to the
> archive's index in the same commit.** That is the moment to confirm its
> rulings reached an ADR, because the ADR is what carries them forward.

| Doc | State | What it tests |
|-----|-------|---------------|

*Empty at the moment (2026-10-27).* The two app-builder drawings (T-438) were
archived on 2026-10-26, when T-447 photographed the built builder; their rows
are in [the archive's index](archive/README.md). The Claude Design exploration
that sat here for weeks flagged "status unresolved" was never a mockup: it is
the design system's source, and it now lives in [`../source/`](../source/README.md).

## How to make a mockup

1. **Start from the design system.** Read `../design-rules.md`, and use only
   the values in `../design-tokens.json`. Copy patterns from the built screens
   (`docs/architecture/user-story-screens/`) before inventing new ones.
2. **One self-contained HTML file** in this folder, named for what it tests
   (`returns-app-two-seats.html`, not `mockup-3.html`). No external scripts,
   so it renders on its own.
3. **Use the seeded world**: the Wrenfield-Ashcombe project, its
   organisations, people and documents. Use words from `CONTEXT.md`; a new word
   is a question to raise, not a word to ship.
4. **Put open questions in the drawing**, in a notes grid marked so they read
   as undecided.
5. **Render it and look at it** (headless Chrome, read the PNG) before
   showing it.
6. **Add its row above** in the same commit, and show it to the owner.

**A short register is the healthy state.** It should hold only what is still
being tested.
