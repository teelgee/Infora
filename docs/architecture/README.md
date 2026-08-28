# The architecture layer

The design record: what Infora **is**, why each boundary sits where it does, and the standing records the pilot is measured and contracted against. This layer sits **above** [the build layer](../build/README.md) and is depended on by it — the gate runs one way, a concept is grilled into here first and translated into `docs/build/` second. Nothing in `docs/build/` invents design; where a build document meets a genuine design gap it goes back to the [grill tracker](../grill-sessions/grill-questions.md) as a `Q-###`, never resolved inline.

## What lives here

**The six documents in the table below** — four written (`.md`) and two generated (`.html`) — **plus four subfolders that carry their own conventions** (see the note under the table: the index does *not* reach into them).

## Artefacts

Lifecycle and maturity use **the two-axis vocabulary defined once in [the build layer's README](../build/README.md#artefacts)** — ▶ Live · ♻ Living reference · ✅ Finished · ⚙ Derived, and 🟢 settled · 🟡 drafted · 🔴 open. It is not restated here on purpose: two copies of a legend is how the two copies start disagreeing.

> **Enforced by `pnpm run check` and by CI** (`scripts/docs-rules.mjs`, both directions): it fails if a `.md` or `.html` file **sitting directly in this folder** is missing from the table below, or if the table names a file that does not exist. Non-recursive, and blind to every other file type. **Add a file here, add its row in the same commit.** The convention in prose is what let a 363-line superseded ticket pack sit in `docs/build/` unnoticed for five weeks; the convention in CI is what catches the next one — and as of 2026-08-28 it is genuinely in CI, which it had never been.

| Doc | Lifecycle | Purpose | Maturity |
|-----|-----------|---------|----------|
| `infora-overview.md` | ♻ **Living reference** | **The vision and the component cut** — what Infora is, the feature list (the product view) and the component list (the build view), and the app-architecture diagram. The second stop on the orientation path, after `CONTEXT.md`. | 🟢 Settled; re-cut 2026-06-27 (features/components split) |
| `user-stories.md` | ♻ **Living reference** | The journeys the product is built to run, in their **final built form** — a surface is not finished when it merges, it is finished when it is captured here and in the walkthrough. | 🟢 Living — amended as surfaces land |
| `operating-envelope.md` | ♻ **Living reference** | **The pilot's non-functional envelope** (renamed from `nfr.md` 2026-08-04; moved here from `docs/build/` 2026-08-28): scale, availability, RPO/RTO, latency, the security floor, and the revisit triggers that say when it must be re-cut. **These are the numbers ADR-0037, ADR-0047 and ADR-0050 were decided against, and the numbers a pilot agreement may point at** — which is why it is a standing record rather than a build blueprint. | 🟢 Agreed — re-cut for V1 2026-08-01, `Q-027` closed |
| `personal-data.md` | ♻ **Living reference** | **The personal-data register** (moved here from `docs/build/` 2026-08-28) — what data about a named person is held, why, and where it is deleted, derived from `packages/db/src/schema` and the ADRs that put each field there, plus the sub-processor list from ADR-0047. **Four things read from it:** ADR-0050, its contract-end clause, the DPA, and a customer's own DPIA. **A ticket or ADR that introduces, stores or derives data about a named person updates it** — the working rule in `CLAUDE.md` names this file. | ♻ Seeded 2026-08-01; deletion positions filled 2026-08-03 from ADR-0050. Controller/processor still open (`Q-035`) |
| `access-and-channels.html` | ⚙ **Derived** | The access model and the three channels drawn as one page, for reading in a browser. Regenerated, never hand-edited. | ⚙ Current |
| `user-stories-walkthrough.html` | ⚙ **Derived** | The **photographed** walkthrough of the built product — narrative in `scripts/user-story-walkthrough/build.mjs`, screenshots via its `capture.mjs`. **Never hand-edited**; regenerate instead: `node scripts/user-story-walkthrough/capture.mjs` (seed first — the full recipe is in that file's header), then `node scripts/user-story-walkthrough/build.mjs`. | ⚙ Regenerated when a surface in the journey changes |

## The subfolders the index does not reach

`scripts/docs-rules.mjs` is **non-recursive by design**: it guards files sitting directly in an indexed folder — the folder list is `INDEXED` in that script, not restated here. The four subfolders below instead carry their own conventions, and an orphan inside one of them would **not** be caught — so read the convention before adding to it.

| Folder | Its own convention |
|---|---|
| [`adr/`](adr/) | **The decision record.** One numbered file per decision, `NNNN-kebab-title.md`, never renumbered and never rewritten — an ADR is amended in place with a dated addendum, or superseded by a later one that says so. Cite them; don't re-argue them. |
| [`components/`](components/) | **The structure.** `component-N-name.md`, the number being the component's permanent id. Design content **folds in when its area is built** — the fold-in register on [the board](../build/plan.md#the-fold-in-register) tracks what is still waiting. |
| [`diagrams/`](diagrams/) | `.tldr` — tldraw's native JSON, **never read as text** (40–75 KB of coordinates, near-zero signal). Render with `node scripts/tldr-to-png.mjs <file>` and read the PNG. The `.tldr` stays the editable source; the PNG is a throwaway view. |
| [`user-story-screens/`](user-story-screens/) | Captured screenshots the walkthrough embeds. Regenerated by `scripts/user-story-walkthrough/capture.mjs`, never edited by hand. |

## Where a new document goes

The one question that decides it: **which layer's question does it answer?**

- *What Infora is · why a boundary sits where it does · what the deployment must meet or hold* → **here**.
- *What gets built first, and how* — the stored tables, the typed API, the package layout, the destination, the ticket board → **[`docs/build/`](../build/README.md)**.
- *A decision with alternatives considered* → an **ADR** in [`adr/`](adr/), not a loose file here.
- *An open question* → [`grill-questions.md`](../grill-sessions/grill-questions.md) as a `Q-###`. Never resolved inline, in either layer.
- *A proposal that cannot be built without amending an accepted ADR* → the parking lot, and **only on the owner's instruction**.
- *A visual or UI-system document* — rules, tokens, a mockup → **[`docs/design/`](../design/README.md)**, which is its own folder and **not** this one. Read its README for the mockup lifecycle before drawing one.
- *External material Infora did not author* — a standard, a competitor teardown, a friction map → **[`docs/reference/`](../reference/)**. Context, never authority, and never a citation in an ADR.
- *The closed record* — a ruled question, a closed slice → its `-history` sibling ([`grill-history.md`](../grill-sessions/grill-history.md), [`plan-history.md`](../build/plan-history.md)), moved in the same commit that closes it.

**Generated artefacts follow their subject, not their file type.** `data-model.html` is build-layer because the schema is; `user-stories-walkthrough.html` is architecture-layer because the journeys are. Both are ⚙ Derived — regenerate, never hand-edit — and both still need a row in whichever index they land in.

`CONTEXT.md` at the repository root is the vocabulary authority and stays there: it is read before either layer.
