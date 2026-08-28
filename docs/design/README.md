# The design layer

The visual spec: what a surface should **look like**, and the rules that keep
every surface looking like the same product. This folder is the source of truth
for the design system — `.claude/skills/infora-design/` is a mirrored kit,
synced from the "Infora Design System" project, not an authority (UI-2,
2026-08-05).

## Artefacts

| Doc | What it is |
|---|---|
| `design-rules.md` | The written rulebook — read before making a visual decision. |
| `ui-vocabulary.md` | The class vocabulary the components emit. |

> **Enforced by `pnpm run check` and by CI** (`scripts/docs-rules.mjs`, both directions), from 2026-08-28. **Add a file here, add its row in the same commit.**
>
> Two things about the shape of that table, both of which will look like mistakes and are not. The first cell is a **backticked filename, never a markdown link** — that is the row form the guard matches, and it is the same in every index the guard reads. And [`design-tokens.json`](design-tokens.json) — the token source of truth for colour, type, spacing, radius, elevation and motion — is named here in prose rather than given a row **on purpose**: the guard reads `.md` and `.html` only, so a `.json` row would name a file it cannot see and be reported as dangling. (Tried it; it fails exactly that way.) The tokens are unguarded, which is worth knowing rather than papering over.
>
> [`mockups/`](mockups/) is a **folder**, so it is deliberately *not* a row — the guard checks files and would report a row naming a directory as dangling. It carries [its own index](mockups/README.md) under the same guard, which is the register that says what is currently pending.

Interface copy is governed by `CONTEXT.md`, not by this folder: it fixes one
word per concept, and a mockup that invents a synonym is a language gap to
raise rather than a word to ship.

## What a mockup is, and what it is not

A mockup is a **proposal**, drawn by hand, for a screen the product does not
have yet. It exists to be ruled on before code is written — the loop is
*sketch → mockup → owner ruling → ADR addendum → ticket → build*. ADR-0051 came
out of exactly this loop — and its mockup is **gone**, which is the loop
finishing rather than a loss: the ruling is in the ADR, the screen is
[deliverable-status.tsx](../../apps/web/src/screens/deliverable-status.tsx), and
the record is the walkthrough's capture.

**A mockup is never evidence.** It says nothing about what the product does
today, and it is never cited as though it did. The record of what exists is
[the user-story walkthrough](../architecture/user-stories-walkthrough.html),
whose whole value rests on every screenshot being the real application. The line
between the two folders is **drawn versus captured**, and it is the reason they
are apart.

## The lifecycle, and how a mockup dies

1. **Drawn** here, on the tokens, using only names and data from the seeded
   world so it matches what the walkthrough photographs.
2. **Ruled on** by the owner. Open forks ride in the mockup's own notes grid,
   marked so they cannot be mistaken for settled design.
3. **Written up** — every ruling lands in an ADR addendum. This step is
   load-bearing because of step 5.
4. **Ticketed and built.**
5. **Captured, then deleted.** When the built screen is photographed into the
   walkthrough and the story is amended in
   [user-stories.md](../architecture/user-stories.md), the mockup is **removed**
   — the capture is now the record, and a stale drawing beside a real screenshot
   is a trap. Anything worth keeping was written into the ADR at step 3.

The corollary is that this folder should only ever hold **pending** work. A
mockup of something already built is a bug in the process, not an archive.

## Cross-references

A walkthrough gap card flagged *designed, not yet surfaced* names its mockup,
and each mockup names the act it will become. Both directions are kept live so
neither side drifts into describing a screen the other has moved past.
