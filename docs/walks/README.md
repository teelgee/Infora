# Walks

**In plain terms:** a walk is a test of the real product by a person or an
agent, step by step, with a screenshot of each step and a list of every
problem found. It is **evidence** — what the product actually did on a given
day, photographed — so that the owner can judge it without sitting at the
keyboard. It is not design (that is `docs/architecture/` and `docs/design/`)
and not the product's story (that is the user-story walkthrough under
`docs/architecture/`): a walk is taken once, for a ticket, and is finished the
day it is taken. Nothing in a walk is fixed along the way; every defect becomes
a ticket on the board, or is ruled out by the owner, and the walk says which.

> **Enforced by `pnpm run check` and by CI** (`scripts/docs-rules.mjs`, both
> directions, from 2026-10-23 — the first walk arrived in a folder nothing was
> checking). **Add a walk here, add its row in the same commit.**

**Layout.** One narrative per walk, `<ticket>.md`, with its screenshots in a
same-named subfolder (`<ticket>/NN-what-it-shows.png`). The narrative links
every shot, says who was signed in and what data was used, lists the defects
worst first with the shots that show each, and ends with what was *not*
walked and why. Screenshots are full pages, 1440 pixels wide; they are
committed, as the user-story screens are, because a walk nobody can open is
not evidence. The reviewing co-captain opens a sample of the shots against the
narrative before the walk is merged and records what did not match in the
narrative itself, under **Reviewed**.

| Doc | Lifecycle | What it is |
|---|---|---|
| `t446.md` | ✅ **Finished** — taken 2026-10-19 | The acceptance walk of the app builder: two apps (the returns app built by conversation; the cost dashboard fed from a spreadsheet), 76 shots, 23 defects, the blocks-versus-code evidence. Reviewed and merged 2026-10-23; the owner's rulings on it are on the board under T-446. |
