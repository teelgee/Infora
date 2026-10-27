# Design source - the Claude Design exploration

Infora's design system was explored in **Claude Design**, in the "Infora
Design System" project, before it was written down as rules and tokens. This
folder keeps that exploration as **history**: where the look came from, not
what it is now.

**It is not a spec.** The authority is `../design-rules.md` and
`../design-tokens.json`, which were written from turns 4-11 of this
exploration and have moved on since (the re-skin, `slice-ui-redesign`, closed
2026-08-06). Where this file and those disagree, they win.

> **Enforced by `pnpm run check` and by CI** (`scripts/docs-rules.mjs`, both
> directions): every file here has a row, and every row names a file here.

| Doc | What it is |
|-----|------------|
| `workspace-redesign.dc.html` | The exploration itself, exported from Claude Design (the `.dc.html` extension and its markup match a Claude Design export, though nothing in the repo states the format). `design-tokens.json` names it as its source ("turns 4-9"), and turn 10a is the canonical shell. **It does not render on its own**: it loads `./support.js`, which isn't in the repo (most likely a Claude Design runtime file that wasn't exported with it). Open the Claude Design project to see it properly. It also uses an older seeded world (the A414 Trentmoor Bypass), from before Wrenfield-Ashcombe. Moved here from `mockups/` on 2026-10-18, where it had sat flagged "status unresolved" because its origin wasn't written down. |
