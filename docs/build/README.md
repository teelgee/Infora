# The build layer

Build-facing documentation: the blueprints that turn settled concepts into code-ready structure. This layer sits **below** [the architecture layer](../architecture/README.md) and depends on it.

- **Architecture layer** ([`docs/architecture/`](../architecture/README.md), already established) — `CONTEXT.md` (language), [overview](../architecture/infora-overview.md) (vision), the [component docs](../architecture/components/) (structure), [`adr/`](../architecture/adr/) (decisions), the [grill tracker](../grill-sessions/grill-questions.md) (process log), and the **standing records** the pilot is measured and contracted against ([operating-envelope.md](../architecture/operating-envelope.md), [personal-data.md](../architecture/personal-data.md)). These answer *what Infora is*, *why each boundary sits where it does*, and *what the deployment must meet or hold*. **Its own index is [`docs/architecture/README.md`](../architecture/README.md)** — enumerating it here as well would be a second list to keep current, and the first one to go stale.

  ⚠ **"The design layer" is retired as a name for it**, because [`docs/design/`](../design/README.md) is a different folder holding the *visual* system (rules, tokens, mockups). Say **architecture layer** or **design *record*** when you mean the ADRs and the component docs; say **`docs/design/`** when you mean the UI kit.
- **Build layer** (this folder) — turns those settled concepts into what a developer types: the stored tables, the typed API, the first build slice. These answer *what gets built first, and how*.

The boundary between the two is a **gate**: a concept is grilled into the design layer first, then translated here. Nothing in this folder invents new design — where it surfaces a genuine design gap, that goes back to the grill tracker as an open question, not resolved here.

## The gate before code

No database migration or application code is written until the artefacts below exist and are agreed. The [open-questions index](../grill-sessions/grill-questions.md) is the authority on what is still undecided (`Q-###`, each carrying what it blocks); this folder is where the gating build-docs live.

## Artefacts

Each document in the table carries two separate marks, because they answer two different questions. A document can be completely settled and also no longer current — one mark cannot say both.

**Lifecycle** — is this document worked from *now*?
▶ **Live** (the current horizon) · ♻ **Living reference** (updated as the build moves) · ✅ **Finished** (settled or closed — nothing further is expected of it) · ⚙ **Derived** (regenerate, never hand-edit).

> ⚠ **✅ means finished. It does not mean "don't read this".** Until 2026-08-28 the legend defined ✅ as "superseded — don't load by default", and that definition had lost contact with how the mark was actually used: nearly every ✅ in `docs/` means *built*, *ruled* or *agreed*. Reading it the old way is dangerous — `operating-envelope.md` opens with "Status: ✅ agreed", and an agent using the old legend would skip the pilot's binding numbers as stale. If you want to know what *not* to load, that is carried by the `-history` naming rule below and by `CLAUDE.md`'s explicit don't-load list — never by this glyph.

**Maturity** — how settled is the content? 🟢 settled · 🟡 drafted, under review · 🔴 open.

> **Naming rule:** when a document's closed material moves out, it moves to a companion file named with the **`-history` suffix** (`plan.md` → `plan-history.md`, `grill-questions.md` → `grill-history.md`). A suffix rather than a subfolder, so links stay stable and the pair sorts side by side.
>
> **Enforced by `pnpm run check` and by CI** (`scripts/docs-rules.mjs`, in both directions): the build fails if a `.md` or `.html` file sitting directly in this folder is missing from the table below, or if the table names a file that does not exist. The guard does not look inside subfolders and ignores every other file type. **Add a file here, add its row in the same commit.** This rule used to live only in prose, and a 363-line superseded ticket pack sat unnoticed in this folder for five weeks; the guard is what catches the next one, and since 2026-08-28 it genuinely runs in CI.

| Doc | Lifecycle | Purpose | Maturity |
|-----|-----------|---------|----------|
| `v1.md` | ▶ **Live** | **The current destination** — the first pilot: three organisations, the full DMS lifecycle, a 100–500 document corpus, three declared workflows, Lens in Ask. Names the scope cut and what is deliberately deferred. Read before picking up a ticket. | 🟢 Drafted 2026-07-31; amended 2026-08-01 (`Q-007`, `Q-008`, `Q-012` closed → ADR-0048/0049, gate re-cut on the infra ruling), 2026-08-03 (schema import, the privacy programme → ADR-0050) and 2026-08-04 (the ingest and locator halves marked built) |
| `best-in-class.md` | ▶ **Live** | **The change list** the best-in-class slices (Register, Reach, Working together) are cut from: twenty changes in plain words, in build order, each saying what a user will notice, why, the decisions Claude ruled under the owner's delegation of 2026-10-23, and the tickets that build it. Read beside [the review](../reference/dms-context-review.md) it came from. | 🟢 Written 2026-10-23; the slices are on the board |
| `plan.md` | ▶ **Live** | The ticket board execution works from (the 7-phases method's phase 6), in **two parts** since 2026-08-05: **Building for V1** (everything that ships in the pilot, waypoint-sequenced) and **Beyond V1 — the deferred register** (recorded, gated, not scheduled). **Where to start** names the frontier and the gates. **It carries open work only:** a ticket's record moves to `plan-history.md` in the commit that closes it, leaving a struck one-line pointer — `check:board` enforces it. | 🟢 Live board — re-cut on V1 2026-07-31; two-part re-cut 2026-08-05; **closed work moved out at ticket grain 2026-08-28, 269 KB → 143 KB** |
| `data-model.md` | ♻ **Living reference** | The drawers' **narrative and design decisions**, drawn drawer by drawer. **State-dependent (re-cut 2026-08-04):** an *unbuilt* drawer carries field lists — the drawing board every migration is written against; a *built* drawer's shape authority is `packages/db/src/schema`, and the drawer keeps narrative + pointer only. | 🟢 Seven drawers built and reduced; the next drawn drawer carries fields until it lands |
| `contracts.md` | ♻ **Living reference** | The API's **law and record** — the five principles (three of them tests), the pointer catalogue of what each contract guarantees, and the dated why-log. **`packages/contracts` is the spec**; this file restates no type (re-cut 2026-08-04). Completions still get dated notes, filtered to *why*, never *what*. | 🟢 Re-cut 2026-08-04 |
| `repo-structure.md` | ♻ **Living reference** | The monorepo and package layout, the dependency matrix, and the components↔packages reconciliation. Revisit when a slice forces a new package. | 🟢 Settled (T-215) |
| `plan-history.md` | ✅ **Finished** | The closed-work archive: every finished ticket's full record, **moved verbatim** from `plan.md` as it closes — nothing is summarised on the way in, because the value of an entry is the finding in it. Precedent, not a board. Also the record of the **walking skeleton** (milestones M0–M6), whose spec was removed 2026-08-04 once everything it specified was built. | ✅ Archive — grew from one block per closed *slice* to one entry per closed *ticket* on 2026-08-28, when the slice-grained rule was found to have stopped working |
| `data-model.html` | ⚙ **Derived** | The stored schema **as built** (open in a browser): per-drawer table atlas with columns, FKs and trigger-derived integrity badges, **generated** by `packages/db/scripts/generate-data-model.ts`. **CI-enforced current**: `pnpm run check` fails when it is stale (`check:data-model`); regenerate with `pnpm --filter @infora/db run datamodel`. | ⚙ Current by construction since 2026-08-04 |

**Moved out 2026-08-28 — `operating-envelope.md` and `personal-data.md` now live in [docs/architecture/](../architecture/README.md).** Neither answered this folder's question. The operating envelope states what the deployment must **meet**, and the personal-data register states what is **held** — a requirement and a record, both derived from the design layer and read by a pilot agreement, a DPA and a customer's DPIA, none of which is a developer typing. Their new folder has its own index under the same guard, so nothing left CI's reach. Links from here go up one and across: `../architecture/personal-data.md`.

**The rule this folder now applies without exception:** a document earns a place here if a developer opens it to write code — the tables, the typed API, the package layout, the destination, the board. If it is instead a **standing record** the pilot is measured or contracted against, it belongs in the architecture layer. Where a document plausibly reads both ways, ask which question it answers: *what gets built, and how* is here; *what Infora is, why a boundary sits there, and what it must meet* is up a level.

Research spikes live in [spikes/](spikes/) with their own index, under the same guard.

Scope discipline: the data model is drawn **drawer by drawer, in step with what is being built** — only the entities the slice in build touches, never the whole system at once. Deferred components (custom workflows, spatial connectors) get their tables when they are built.
