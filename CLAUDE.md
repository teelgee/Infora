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

**Where a new document goes** — folder indexes, each the authority for its own
folder, all enforced in both directions by `check:docs` (the folder list is
`INDEXED` in `scripts/docs-rules.mjs`, not restated here). Read the one you are
writing into **before** adding a file; it says what belongs there, what its
rows' marks mean, and what its subfolders' own conventions are. The three you
will most often write into:

- [docs/architecture/README.md](docs/architecture/README.md) — *what Infora is,
  why a boundary sits where it does*, and the standing records the pilot is
  measured and contracted against. ADRs, component docs, diagrams.
- [docs/build/README.md](docs/build/README.md) — *what gets built first, and
  how*: the stored tables, the typed API, the destination, the board.
- [docs/design/README.md](docs/design/README.md) — the visual system, and **the
  mockup lifecycle: read it before drawing one.** `.claude/skills/infora-design/`
  is a mirrored kit, not an authority.

A document that answers neither layer's question is probably an **open question**
(`Q-###`) or **external reference** (`docs/reference/`), not a new file.

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

> **This file routes; it does not restate.** The test before adding a paragraph:
> *if this sentence went out of date, what would catch it?* Nothing catches a
> second copy — which is how "`pnpm run check` mirrors CI exactly" stayed wrong
> for months. Point at a file the task already makes you open.

- Run `pnpm run check` before every commit. It is **CI's fast half** — every
  gate it runs, CI runs — but **green locally is not proof CI is green**: CI
  adds the dependency audit, migrate, seed, `eval:smoke`, `build` and e2e on a
  clean machine with an empty database. The two lists are `package.json`'s
  `check` script and [.github/workflows/ci.yml](.github/workflows/ci.yml).
- Package dependency rules — surfaces depend only on `contracts` + `ui`.
  Enforced by `pnpm run check:deps`; the matrix is `scripts/dep-rules.mjs`.
- Migrations are **drawn in `docs/build/data-model.md` before being written** —
  read the block at the head of that file first. It carries when `generate` is
  safe, why `push` stays forbidden, what has to be hand-written into a generated
  file, and why the drawing's shape depends on whether its drawer is built.
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
  A new ADR's number is derived the same way: `pnpm run check:adrs -- --next`.
- `CONTEXT.md` is the vocabulary authority; ADRs are the decision record.
  Cite them, don't re-argue them.
- **A surface is not finished when it merges.** Built work **inside** the user
  stories' one journey is captured in `docs/architecture/user-stories.md` and in
  the walkthrough; built work **outside** it belongs in its component doc and is
  never forced into the walkthrough — a beat that cannot be photographed stays a
  card saying so. The mockup that proposed it **dies at capture**:
  [docs/design/README.md](docs/design/README.md) owns that lifecycle, and the
  regeneration commands are on the walkthrough's row in
  [docs/architecture/README.md](docs/architecture/README.md).
- One commit per ticket, `T-xxx: summary` style. **A ticket's record moves to
  `docs/build/plan-history.md` in the commit that closes it**, leaving a struck
  one-line pointer on the board — `check:board` enforces it, and the board's
  own header carries the convention.

## Diagrams (`.tldr` files) — do not read as text

**Never `Read`, `cat` or otherwise load a `.tldr` file's raw contents.** Render
it and read the PNG instead:

```bash
node scripts/tldr-to-png.mjs docs/architecture/diagrams/<name>.tldr  # or --all
```

The reasoning, and what the renderer does and does not handle, is in that
script's header. Outputs are gitignored; the `.tldr` stays the source of truth.
