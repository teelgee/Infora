# The design layer

The visual spec: what a surface should **look like**, and the rules that keep
every surface looking like the same product.

**Where it came from.** Infora's design system was explored in Claude Design,
in the "Infora Design System" project. The exploration itself is kept in
[`source/`](source/README.md). The rules and tokens in this folder were
written from it, together with the app's existing UI code (`packages/ui`,
`apps/web`), and are now **the source of truth**: when the two disagree,
this folder wins. `.claude/skills/infora-design/` is a mirrored kit, synced
from that Claude Design project, not an authority (UI-2, 2026-08-05).

## Artefacts

| Doc | What it is |
|---|---|
| `design-rules.md` | The written rulebook - read before making a visual decision. |
| `ui-vocabulary.md` | The class vocabulary the components emit. |

> **Enforced by `pnpm run check` and by CI** (`scripts/docs-rules.mjs`, both directions), from 2026-08-28. **Add a file here, add its row in the same commit.**
>
> Two things about the shape of that table, both of which will look like mistakes and are not. The first cell is a **backticked filename, never a markdown link** - that is the row form the guard matches, and it is the same in every index the guard reads. And [`design-tokens.json`](design-tokens.json) - the token source of truth for colour, type, spacing, radius, elevation and motion - is named here in prose rather than given a row **on purpose**: the guard reads `.md` and `.html` only, so a `.json` row would name a file it cannot see and be reported as dangling. The tokens are unguarded, which is worth knowing rather than papering over. The demo videos (`demo/studio/`) read their colours straight from this file.
>
> The three subfolders are **folders**, so they are deliberately *not* rows - the guard checks files and would report a row naming a directory as dangling. Each carries its own index under the same guard:
> - [`source/`](source/README.md) - the Claude Design exploration the system was written from. History, not spec.
> - [`mockups/`](mockups/README.md) - drawings of screens not built yet, used to test a design before building it.
> - [`mockups/archive/`](mockups/archive/README.md) - mockups the build has overtaken.

Interface copy is governed by `CONTEXT.md`, not by this folder: it fixes one
word per concept, and a mockup that invents a synonym is a language gap to
raise rather than a word to ship.

## Mockups: what they are for

*Owner ruling, 2026-10-18.* **In plain terms:** a mockup is a quick visual
test. We draw a screen before building it, to see whether the design and the
feature work, and to decide before code is written. Once building and testing
start, the real screen will move on from the drawing, and that is fine: the
mockup has done its job. It then moves to `mockups/archive/`, so the main
folder only ever shows what is still being tested.

This replaces the earlier rule (2026-08-22) that a mockup is *deleted* once
its screen is photographed. Deletion was there to stop a stale drawing being
mistaken for the real screen. Archiving keeps that protection, because the
archive is labelled as overtaken and is never a spec, without throwing the
drawing away.

The loop is *sketch → mockup → owner looks and rules → decisions written into
an ADR addendum → ticket → build → mockup archived*.

**A mockup is never evidence.** It says nothing about what the product does
today, and it is never cited as though it did. The record of what exists is
[the user-story walkthrough](../architecture/user-stories-walkthrough.html),
whose whole value rests on every screenshot being the real application. The
line between the two folders is **drawn versus captured**, and it is the
reason they are apart. The same goes for the demo videos in `demo/`: they show
vision, and they are neither a record nor a decision.

## The lifecycle

1. **Drawn** in `mockups/`, on the tokens, using only names and data from the
   seeded world, so it matches what the walkthrough photographs. How to draw
   one is in [the mockups index](mockups/README.md).
2. **Looked at and ruled on** by the owner. Open questions ride in the
   mockup's own notes, marked so they can't be mistaken for settled design.
3. **Written up.** Every ruling lands in an ADR addendum. This step matters
   most: once the mockup is archived, the ADR is where the decision lives.
4. **Ticketed and built.** Testing the built screen may change it; the mockup
   is not updated to follow.
5. **Archived** when the build overtakes it, normally when the built screen is
   photographed into the walkthrough and the story is amended in
   [user-stories.md](../architecture/user-stories.md). Move the file to
   `mockups/archive/` and move its row to the archive's index in the same
   commit.

## Cross-references

A walkthrough gap card flagged *designed, not yet surfaced* names its mockup,
and each mockup names the act it will become. Both directions are kept live,
so neither side drifts into describing a screen the other has moved past.
