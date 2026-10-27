# Flows: Context layer and Tools, screen by screen

Prepared 2026-10-05 for the pillar walkthroughs (`demo/plans/BRIEF.md`,
videos 2 and 4). This is the **build reference** for those two videos. It builds
on `demo/archive/2026-10-sizzle/research/product-inventory.md` (read that for the design tokens, the
shell, the Wrenfield cast and the claims we must not make) and does not repeat
it. Where this file and a cited source disagree, the source wins; section D
lists every disagreement found and which source wins.

**Status marks** (used on every beat):

- **BUILT**: in the app today. Screenshot named where one exists
  (`docs/architecture/user-story-screens/`, all 1440×900). Where there is no
  screenshot, the copy below is lifted from the source file named.
- **RULED**: decided in an accepted ADR or an owner ruling, not built. Draw it in
  the built design language.
- **VISION**: the owner's brief (2026-10-05) or a proposal made here. Not in the
  decision record; where it reopens a ruling, that is said.

**On-screen copy rule.** Strings below are given **as they should appear on
screen in the videos**: the deck language rule ("hyphens, not em dashes") is
applied, so a built string that reads `Draft — not yet open to anyone` in the
source is written here `Draft - not yet open to anyone`. The project name keeps
its en dash (`Wrenfield–Ashcombe 400kV Connection`): it is a proper name, as in
`demo/studio/src/data/wrenfield.ts`. Sentence case throughout. No numeric
claims beyond the Wrenfield data.

---

## 0. Frame conventions for 1920×1080

The screenshots are 1440×900 (16:10). Rebuild natively at 1920×1080 with a
**UI scale of 1.2** (`SCALE.shell` in `demo/studio/src/shared/theme.ts`).
Every px value below is already at 1.2 unless marked "@1x".

**The shell** (from `01-workspace.png`, `02-plan.png`, `09-editor.png`;
`apps/web/src/screens/project.tsx` lines 193-212; `packages/ui/src/styles.css`):

| Element | Rect (x, y, w, h) | Notes |
|---|---|---|
| Frame | 0, 0, 1920, 1080 | `#dedad0`. Never shadowed. |
| Rail | 0, 0, 259, 1080 | No fill (it is the frame). Wordmark at (24, 22): 22×22 `#1c1b18` square r5 + "Infora" Source Serif 4 22px, gap 10. Collapse `«` at x 236. |
| Org line | 24, 74 | "Calder & Hale" (bold 13.8px) left, "All projects ▸" muted right. Rachel's seat: "Trentmoor Energy All projects ▸". |
| Project switcher | 12, 104, 235, 78 | `#e5e3dc`, r10. Micro label "PROJECT" (12.6px caps, .6px tracking, `#78766f`), then "Wrenfield–Ashcombe 400kV Connection" bold 16px on two lines, "▾" right. |
| Nav | from y 222, row pitch 47 | Lucide 18px, 2px stroke + label 17px `#1c1b18`. Order: Home, Ask, Editor, Plan, Project library ▸, Review, Notifications, Sandbox ▸, Tools, Knowledge, History. Active item fill `#c9c5b8`, r10, 12px inset. |
| User chip | 12, 994, 235, 70 | `#e5e3dc` r10. 34px dark circle avatar with initials; name bold 15px; "Calder & Hale - Consultant" / "Trentmoor Energy - Owner" muted 13.8px. |
| Main pane | 259, 14, 1647, 1052 | White, r10, pane shadow `0 10px 26px rgba(20,20,20,.12)`. 0 gap to the rail. |
| Topbar | inside pane, h 67 | Outlined pill "Wrenfield–Ashcombe 400kV Connection" (bold 15px) + " · Owner: Trentmoor Energy" muted. Right: role badge "● Member" (success tint) or "● Owner" (slate tint). Hairline below. |
| Page content | x 449 → 1717 (w 1268), from y 133 | `.content` max-width 1120 @1x, padding 30/32 @1x. H1 Source Serif 4 32px weight 500; `page-sub` 15px `#57564f`, max ~78ch. |

**Two-pane pages** (Editor, `09-editor.png`): a second bar (h 62) under the
topbar, then two white floating panes (r10, pane shadow, 12px gutter): canvas
(274, 158, 1000, 893) and side panel (1286, 158, 610, 893). The built side
panel is resizable 240-420 @1x; 610 is wider than built, chosen for
legibility at 1080p (or keep 504 = 420 @1.2 and widen the canvas).

**Seat labels** (video overlay, not product UI): consultant `#6d5dd3`, client
`#159a74`, supplier: reuse external `#8a6d3b` (`scripts/user-story-walkthrough/build.mjs`).

**Reusable Remotion parts** (`demo/studio/src/shared/`): `AppShell`,
`EditorPanes`, `SideChat`, `Receipt` (ui/shell.tsx); `CitedProse`,
`SuggestionCard`, `RunTrace`, `SourcePanel`, `DocCanvas`, `Mark`,
`TrackedChange`, `FindingCard`, `FindingGroup` (ui/drafting.tsx);
`ChatComposer`, `ChatPanel`, `StepRail`, `BuilderHeader`, `ReadBack`, `RowForm`
(ui/builder.tsx); `KpiTile`, `BarChart`, `LineChart`, `PieChart`,
`InsightCard`, `DataTable`, `Dashboard` (ui/charts.tsx); `Badge`, `Button`,
`Chip`, `SourceChip`, `WithheldNotice`, `MicroLabel`, `Pane`, `Avatar`, `Tick`
(ui/primitives.tsx); `Cursor`, `TypedText`, `Camera`, `Highlight`, `Shimmer`.
Clip 4's `KpiChat` and `Rail` (`src/sizzle/v04/chat.tsx`, `steps.tsx`) already
animate a chat that ticks steps; reuse their mechanics, not their step titles
(D-2) or their dashboard access choice (D-4).

---

## A. Context layer flow

**What the pillar claims** (deck slide 14): "The project's context engine -
every document feeds a living ontology, and every new document starts from it."
Brief: the project library, then Ask answering from it with sources for each
answer, plus the living ontology and "every new document starts from it".

### A.0 What "context" means in Infora's terms (for the narration writer)

- **Project library**: the owner-curated corpus. Accepted deliverables enter
  **automatically on acceptance**; the owner adds **reference material**
  (received documents: baseline data, other parties' reports) by deliberate
  act. Visibility is **per deliverable, default-deny**: owner organisation,
  producer, and organisations the owner shared it with (after they acknowledge
  the transmittal). (`CONTEXT.md` "Project library"; ADR-0011; ADR-0016.)
- **What the AI may use** (the **context state**) is derived from three facts,
  never set by hand: in the library, **and** record state `live`, **and**
  accepted under a code the project marked "grounds". On screen it reads
  `Not used for AI answers - superseded` / `- withdrawn` / `- not in the project
  library` / for a non-grounding code. (`CONTEXT.md` "Context state"; ADR-0011
  rider; ADR-0013; ADR-0003.)
- **Superseded versions**: the corpus holds **exactly one live version per
  container** by construction, so retrieval never surfaces or cites a v1 while a
  v2 exists (ADR-0022). A superseded document stays in the record, readable, and
  leaves the AI's reach. Never "archived", never "deleted".
- **Project ontology** (the deck's "living ontology"): two layers (ADR-0045).
  (1) a **classification vocabulary** seeded by copy from Uniclass 2015 / ISO
  19650 (facets: Discipline, System (Uniclass Ss), Document type, Project
  stage, Work package), owned by the library owner; (2) typed, append-only,
  directional **relationship edges** between deliverables: `Supersedes`,
  `References`, `Responds to`, `Is part of`, `Derived from`. It is **derived
  from the record, never hand-maintained**, **agent-proposed and
  human-confirmed**, and is **metadata, never a grounded corpus** (it is never
  cited). One edge has a consequence: a confirmed `supersedes` edge into a
  library container sets it superseded, so it stops grounding (2026-08-27
  amendment). "Living" is faithful in exactly this sense: it is projected from
  the record and changes as the record changes.
- **Org context never grounds** and never crosses the wall: a firm's rulebook,
  saved outlines and know-how steer its own work only (ADR-0020/0021).

### A.1 Cast and seats

- **Rachel Bowen**, Trentmoor Energy, project **Owner**, initials RB. Curates
  the library; confirms ontology links.
- **Eleanor Price**, Calder & Hale, **Member** (consultant), initials EP. Asks
  the questions; starts the new document.
- The wall subject: **Redgate Ecology**'s `WA-ECO-PEA-001` is visible to Rachel
  (owner) and **not** to Eleanor (`packages/db/src/seed.ts` lines 523-545, 691-694).

### A.2 Recommended running order (~2:00)

| # | Beat | Seat | Screen | Status | Approx. |
|---|---|---|---|---|---|
| 1 | Title "02 Context layer" | - | card | - | 0:00-0:04 |
| 2 | The project library: deliverables and reference material | Rachel | Project library | BUILT (`26-library.png`) | 0:04-0:16 |
| 3 | A document opens; its live revision; v1 is not used | Rachel | Library document modal | BUILT + VISION strip | 0:16-0:24 |
| 4 | What the AI may rely on (context state) | Rachel | Acceptance codes "Grounds" / deliverable badge | BUILT (`00b`, `30`) | 0:24-0:32 |
| 5 | The living ontology: a new accepted document joins, links proposed, owner confirms | Rachel | Ontology view (proposed) + built confirm controls | VISION (screen) / BUILT (confirm) | 0:32-0:52 |
| 6 | Ask: question typed under a Lens | Eleanor | Ask | BUILT (no screenshot) | 0:52-1:04 |
| 7 | The answer, every claim with its source | Eleanor | Ask answer | BUILT | 1:04-1:16 |
| 8 | Open a source: the passage, live revision | Eleanor | Ask + source panel | BUILT + VISION highlight | 1:16-1:26 |
| 9 | Access limits: same question, two seats | Eleanor / Rachel | Ask, split | BUILT behaviour | 1:26-1:40 |
| 10 | Every new document starts from it | Eleanor | Ask "Open in editor" → creator sources with ontology suggestions | BUILT + VISION | 1:40-1:56 |
| 11 | Close | - | card | - | 1:56-2:00 |

Beats 3 and 4 can merge if time is short. Beat 9 is the strongest wall moment in
this pillar; keep it.

---

### A.3 Beat 2: the project library

- **User does:** Rachel clicks **Project library** in the rail. Page loads;
  camera rests on the two tables, then drifts to the Reference material table.
- **Screen:** `26-library.png` (BUILT). Source: `apps/web/src/screens/library.tsx`
  lines 690-1020.
- **Actor:** Rachel Bowen (Owner).
- **Layout @1920 (content column x 449-1717):**
  - H1 "Project library" at y 133.
  - `page-sub` (3 lines, w ~900) at y 180.
  - Micro label "LIVE DELIVERABLES" at y 290.
  - Table 1 (white, hairline border `#ececea`, r10) at y 312: header row h 40
    with micro headers REFERENCE · TITLE · REVISION · SUITABILITY · DISCIPLINE ·
    PRODUCER · ISSUED · (actions). Row h ~96 (titles wrap). Reference column
    has a 17px Lucide `FileText` icon + mono reference. Actions are quiet
    buttons: `Open` · `➤ Transmit` · `⋖ Issue externally...` · `Supersede...` ·
    `Withdraw...`. The screenshot's reference column wraps (`WA-ECO-PEA-001`
    over four lines); **at 1920 give it 190px so references sit on one line**.
  - Micro label "REFERENCE MATERIAL" at ~y 640, its `page-sub` under it.
  - Table 2: REFERENCE · REVISION · HELD BY · LOADED · (Open). Row h 58.
    Reference cell: Lucide `BookOpen` + mono ref + neutral pill "● Reference".
- **Exact copy (on screen):**
  - H1: `Project library`
  - Sub: `The governed corpus. Superseded and withdrawn documents leave this list and stand as records on the plan. What the AI grounds on is narrower still: a deliverable accepted under a code this project does not rely on stays here, badged, and out of reach.`
  - Reference sub: `Received, not produced here - loaded into the library so the AI can ground and cite on it. These carry no plan row and no review history.`
  - Empty row (not shown): `No live deliverables in this project's library.`
- **Rows to show (video state, Rachel's seat):**

  Live deliverables

  | Reference | Title | Revision | Suitability | Discipline | Producer | Issued |
  |---|---|---|---|---|---|---|
  | WA-EIA-MST-001 | EIA Scoping Method Statement - Land Quality | C01 | ● A1 (slate pill) | EEN | Calder & Hale | Sep 29, 2026 |
  | WA-ECO-PEA-001 | Preliminary Ecological Appraisal | v1 | — (empty cell, as built) | — | Redgate Ecology | Sep 02, 2026 |

  Reference material

  | Reference | Revision | Held by | Loaded |
  |---|---|---|---|
  | WA-CON-SCC-002 | v1 | Trentmoor Energy | Sep 02, 2026 |
  | WA-EIA-SCP-001 | v1 | Trentmoor Energy | Sep 02, 2026 |
  | WA-ENV-BAS-003 | v3 | Trentmoor Energy | Sep 02, 2026 |
  | WA-GEO-GIR-004 | v2 | Trentmoor Energy | Sep 02, 2026 |
  | WA-WAT-FRA-001 | v1 | Trentmoor Energy | Sep 02, 2026 |

  Dates: the built table formats as `Sep 02, 2026` (US order). The first film used
  UK order (`16 Sep 2026`). Keep the built format inside the product UI.
  The screenshot shows MST-001 C01 with suitability `S2`; for the video use
  `A1` (D-27).
- **How documents arrive (what to say, what to show):**
  - Accepted deliverables enter **automatically on acceptance** (BUILT; it is
    the end of the Document management video). A one-line caption is enough:
    "Accepted work joins the library automatically."
  - Reference material is **loaded by the owner** (RULED, ADR-0011). **There is
    no "add to library" button in the built UI**: the bulk-load path is an
    operator action today (`v1.md` "The corpus"; T-303 open). If the video shows
    an upload, draw it as VISION: a quiet button `Add reference material...` at
    the right of the "REFERENCE MATERIAL" label, opening a modal with a file
    drop zone, a `Reference` field (mono, the naming scheme's generated code is
    not used for received material, so the owner types the received reference),
    and the built per-document **description** field (T-405: "typed, never
    generated"). Keep it to one second or skip it.
  - Documents shared by another organisation arrive behind an acknowledgement:
    BUILT section "Awaiting your acknowledgement" with `Acknowledge receipt`
    and the note `Acknowledged - the deliverable is now visible and grounds for your organisation.`
    (library.tsx lines 570, 814-822). Good for a consultant seat; optional here.
- **Folders:** the library may be shown "flat or foldered per project
  configuration" (RULED, CONTEXT.md). The built screen is flat. The rail's
  `Project library ▸` chevron exists. Do not draw folders.

### A.4 Beat 3: opening a library document (live revision; v1 superseded)

- **User does:** Rachel clicks the `WA-GEO-GIR-004` row (rows are clickable,
  title "Open this document").
- **Screen:** BUILT `DocumentModal` (library.tsx lines 92-180): a `lg` modal
  over the scrim `rgba(20,20,20,.28)`. Title: mono ref + mono revision + green
  pill `Live`. Body: the PDF rendition inline (64vh, 1px border, r6), or, for
  seeded rows, the source text with the hint `No rendered file for this document - showing its source text.`
  Footer: `⤓ Download native .docx` · `⤓ PDF in new tab` (left) · `Close` (right).
- **Layout @1920:** modal 1100 × 860 centred (x 410, y 110), overlay shadow.
  Header h 70: `WA-GEO-GIR-004` `v2` `● Live`. Body: a rendered PDF page (white
  page on `#efeeeb`), visible heading "Ground Investigation Interpretative
  Report", paragraph text from A.12.1. Footer h 64.
- **VISION strip (to show "superseded versions"):** under the header, a thin
  sunken row listing revisions: `v2 · Live · used for AI answers` and
  `v1 · Superseded 12 Aug 2026 · not used for AI answers` (muted, neutral dot).
  Nothing in the built modal lists revisions. The rule it illustrates is BUILT
  (ADR-0022: one live version per container; the seed's v1 "must never ground",
  T-033). Copy source for the date: `wrenfield.ts` `GIR_SUPERSEDED_LINE`.
- **Actor:** Rachel.

### A.5 Beat 4: what the AI may rely on

Two built screens; pick one.

**Option 1 (owner's lever): Acceptance codes, `00b-acceptance-codes.png`.**

- **User does:** Rachel scrolls the project settings to ACCEPTANCE CODES; the
  camera settles on the GROUNDS column and the `A1` row (`● Yes` green in all
  three columns, `LIVE DELIVERABLES` count, `Stop grounding`).
- **Copy:** section micro label `ACCEPTANCE CODES`; sub `What a reviewer's verdict can say on this project, seeded from ISO 19650's 2021 National Annex and copied at project creation - nothing here touches another project. Accepting ends the review cycle; contractual is what issues the C revision, the difference between we have agreed this and we have agreed most of this, with comments; grounds is whether a deliverable accepted under the code enters the AI's reach. A code that has been used is never redefined - retire it and add its replacement, so a deliverable coded last year still reads as what it meant last year.`
  Columns: CODE · LABEL · ACCEPTING · CONTRACTUAL · GROUNDS · LIVE DELIVERABLES.
  Rows S0-S5 (`● No` grounds, action `Ground on it`), A1 `Published - authorized and accepted` (`● Yes` ×3, action `Stop grounding`).
- Optional click on `Stop grounding` → `27a-blast-radius.png` modal: title
  `Stop grounding on A1`; body `This will exclude 1 live deliverable from AI answers, from the next question asked. They stay in the library and stay readable; the agent stops reaching for them.`;
  field `Why` (placeholder `e.g. A3 is design-stage only on this scheme`), hint
  `Recorded with your name against this code, permanently.`; `Cancel` / `Save change`. Cancel it.

**Option 2 (the badge):** `30-context-state.png`. A deliverable's detail modal
with two status pills: `● Withdrawn from the library` (neutral) and
`● Not used for AI answers - withdrawn` (warning tint). Note this screenshot shows
**WA-EIA-MST-001 withdrawn** (the end of the journey); for this video, if used,
show it on a different row or with `- superseded` (D-28).

### A.6 Beat 5: the living ontology (proposed screen + built confirmation)

**What exists.**

- BUILT, the thin confirmation surface (ADR-0045 "Build-1 surface"):
  `apps/web/src/ontology-panel.tsx`, inside the plan row's detail modal
  (`03-plan-detail.png`, bottom section "Classification"). Per facet a select
  (`code - label`), a `suggested` tag (11px, 1px border, r4) on an unconfirmed
  agent proposal; a "Relationships" list (`→`/`←`, type label, **bold** other
  reference, `suggested` tag, `Confirm` and `Reject`/`Retire` quiet buttons);
  and "Propose a relationship" (type select + deliverable select + primary
  `Propose`, hint `Proposes references WA-... - confirm it to make it live.`).
  Empty states: `No classification scheme on this project yet.`, `No relationships yet.`
- BUILT data: the default scheme (`packages/db/src/ontology-seed.ts`) and the
  five edge types. The `supersedes` edge drives record state (T-383-T-391).
- RULED, not built: **agent-proposed** classification and edges on promotion,
  and cross-organisation naming reconciliation ("flood study" = "FRA") (the
  ontology slice part 2, deferred: `v1.md` "Out"). The **graph-explorer UI** is
  "a later slice, not build-1" (ADR-0045). The retrieval pre-filter is built but
  **deliberately unwired** (`v1.md`; `Q-028` open): **the ontology does not
  currently steer what Ask retrieves**. Do not say it does.

**Proposed screen (VISION, drawn in the design language, faithful to ADR-0045):
"Project library ▸ How it connects".**

- **Where:** a second view of the Project library, reached from the rail's
  `Project library ▸` sub-item `How it connects` (the chevron already exists),
  or a two-tab switch at the top right of the library page: `List` · `How it connects`.
  Title suggestion avoids "graph" and "knowledge graph" (not CONTEXT.md terms).
  The term on screen is **project ontology** in the sub-line only.
- **Actor:** Rachel (owner; the confirming hand on a library container).
- **Layout @1920 (inside the main pane, below the topbar):**
  - Header block x 449, y 133: H1 `How the library connects`; sub
    `The project ontology, derived from the record and never drawn by hand. Every document is classified against Uniclass 2015 and ISO 19650, and every link between documents was proposed and confirmed by a person. It organises the library; it is never cited.`
  - Left filter column (sunken card `#efeeeb`, r10, no border) at
    (283, 260, 300, 780): micro label `CLASSIFICATION`, then the five facets as
    collapsible groups with term rows and counts, e.g. `Discipline` → `V Environmental 5` ·
    `G Geotechnical 1` · `D Drainage 1`; `System (Uniclass Ss)` → `Ss_15 Earthworks and remediation systems 3` ·
    `Ss_50 Disposal and drainage systems 2` · `Ss_70 Electrical supply systems 1`;
    `Document type` → `RP Report 7`; `Project stage` → `2 Concept design 7`;
    `Work package` → `Land quality 3` · `Water environment 2` · `Consultation 1`. Checkboxes 15px. A selected
    term filters the canvas. Below: micro label `LINKS` with the five types as a
    legend (each a 24px line sample + label), `suggested` shown dashed.
  - Canvas (white, inside the pane) at (600, 260, 900, 780): document **nodes**
    as small cards (`#efeeeb`, r8, popout shadow, 200 × 64): mono reference
    13px bold, title 13px muted one line, a 6px state dot. Edges are 1.5px
    `#c7c5be` lines with a small arrowhead and a 11.5px label chip at the
    midpoint (`derived from`, `references`). A **proposed** edge is dashed with a
    `suggested` tag. A superseded node renders at 50% with a neutral
    `Superseded` pill. Layout: concentric by work package, not force-directed
    jitter (calm motion rule: nothing bounces).
  - Right detail card (white r10, popout shadow) at (1520, 260, 372, 780): the
    selected node's reference + title, its context state pill
    (`● Used for AI answers` success, or `● Not used for AI answers - superseded`
    warning), `Classification` (facet: term rows, reusing the built select
    look), `Relationships` (the built OntologyPanel list, verbatim behaviour).
- **The "feeds" beat (sequence):**
  1. Canvas shows the reference material: `WA-GEO-GIR-004`, `WA-ENV-BAS-003`,
     `WA-WAT-FRA-001`, `WA-CON-SCC-002`, `WA-EIA-SCP-001`, plus `WA-ECO-PEA-001`
     (Rachel can see it).
  2. `WA-EIA-MST-001 · C01` arrives (accepted, so it enters the library): node
     fades in at the centre of "Land quality".
  3. Three **dashed** edges draw out from it, each with `suggested`:
     `derived from WA-GEO-GIR-004`, `derived from WA-ENV-BAS-003`,
     `references WA-WAT-FRA-001`. The right card lists them with `Confirm` /
     `Reject`. Classification rows show `suggested`: Discipline `V - Environmental`,
     System `Ss_15 - Earthworks and remediation systems`, Document type `RP - Report`,
     Project stage `2 - Concept design`, Work package `Land quality`.
  4. Rachel clicks `Confirm` on each edge (cursor). Lines go solid; tags drop.
  5. Optional consequence shot: the v1 of a different report linked by a
     confirmed `Supersedes` edge greys and its pill flips to
     `Not used for AI answers - superseded` (the one edge with a lifecycle
     consequence; BUILT behaviour).
- **Agent-proposed is VISION** (deferred slice). The confirm act is BUILT. A
  safe caption: "New documents are linked in. A person confirms every link."
- **Wall in this view:** edge visibility rides both endpoints' visibility
  (ADR-0045 amendment, "nothing here lets an edge reveal a container the
  requester could not already see"). Eleanor's version of this view has **no**
  `WA-ECO-PEA-001` node and no edge to it.
- **Never on this screen:** "knowledge graph" as a product noun, "AI learns",
  any edge implying a citation, any claim that the ontology grounds answers.

### A.7 Beat 6: Ask, the question

- **Entry (BUILT):** Project Home's command bar
  (`apps/web/src/screens/project.tsx` lines 237-244): a sunken ask-bar with
  `✦`, text `Ask about the project - grounded on its library, every claim cited or withheld`,
  hint `⌘K`. Or the rail's **Ask** (Lucide `Sparkles`). Recommend: rail click,
  it is quicker.
- **Screen:** Ask (`apps/web/src/screens/ask.tsx`). **BUILT, not photographed.**
- **Actor:** Eleanor Price (Member, Calder & Hale).
- **Built structure:** inside the main pane, `chat-layout` = three columns:
  1. **"What ran" rail** (`ProgressRail`, 260 @1x, white pane with shadow): head
     micro label `WHAT RAN`; empty text `No plan has been recorded yet. This rail shows what actually ran, so it stays empty until the run reports.`
  2. **Chat column**: its own static topbar `Ask · Conversation bound to Wrenfield–Ashcombe 400kV Connection`
     with a green badge `Grounded & cited` at the right; then the transcript
     (measure 780 @1x, centred); empty-state line
     `Ask about the project - answers are grounded on its library, with the sources inline. To draft into a document, open it in the Editor and use its chat.`;
     at the top of the transcript the destination row
     `Write answers to [▤ Choose a destination]`; the composer pinned at the foot.
  3. **Source panel** (380 @1x), only when a source is open (A.9).
- **Proposed clean layout @1920 (recommended for the video; D-14):** keep the
  project topbar; drop the second "Ask ·" topbar into a single line under it.
  - Header line at (283, 95): `Ask` bold 15px + ` · Conversation bound to Wrenfield–Ashcombe 400kV Connection`
    muted; right-aligned `● Grounded & cited` success pill.
  - "What ran" column: sunken card at (283, 140, 300, 900).
  - Transcript column: x 620 → 1556 (936 wide), from y 150.
  - Composer: (620, 930, 936, 116): sunken `#efeeeb`, r12, popout shadow; `✦`
    glyph 17px at left; placeholder `Ask about the project`; 36px round black
    send button at right. Chips row below the box (h 30, gap 10).
- **Composer chips (BUILT, in order):**
  `◑ Planning & Environmental` (Lens picker) · `▤ 6 sources` (Data sources) ·
  `⚙ Tools` (disabled) · `◱ Context · N tokens` (disabled) · `▤ From the library` ·
  `＋ Attach a file` · `≡ Prompts` · `✒ Style` · `◍ Web search` · `▧ Sandbox search` · `✳ Model`
  (the last six disabled placeholders). **For the video show only the first two
  and `▤ From the library`**; the rest are jargon or unbuilt (D-31).
- **Lens picker (BUILT, `apps/web/src/lens-picker.tsx`):** dropdown opening
  upward. First item, muted: `A Lens changes how answers are written. It does not change what you can see.`
  Then each Lens: bold label + muted description (from
  `packages/lenses/definitions/*.yaml`):
  - `Planning & Environmental` - `Consenting and EIA specialists. Leads with the statutory or policy test and whether the evidence before it meets that test. Full jargon, unexpanded acronyms, paragraph-level citation.`
  - `Engineer` - `Design and construction engineers. Leads with the physical or design implication and the constraint it creates. Figures with their source; planning concepts translated into design consequences.`
  - `Project Manager` - `Programme and delivery managers. Leads with what is due, who owns it, what is at risk and by when. Tabular by default, summary first, detail on request.`
  - `Communications` - `Communications and stakeholder leads. Plain English, no unexplained acronyms. Leads with what it means for people and what can and cannot be said publicly, with anything not yet public flagged prominently.`
  - `No Lens` - `Answer in Infora's standard register.`
  Chip tooltip: `How answers are written - not what you can see`. Commercial is
  `status: draft`: not offered.
- **Data sources chip (BUILT, `composer-chips.tsx`):** label `▤ 6 sources` for
  Eleanor (5 reference documents + WA-EIA-MST-001), `▤ 7 sources` for Rachel
  (+ WA-ECO-PEA-001). Withdrawn `WA-HER-DBA-002` is in neither. Dropdown head:
  `Narrowing changes relevance, never reach.`; rows `☐ WA-GEO-GIR-004 Ground Investigation Interpretative Report` ...;
  tooltip `The documents a grounded answer can draw on. Narrowing is a relevance control - it never widens what you can reach.`
- **User does:** Eleanor clicks the composer, types A.12.2 Q1 at believable
  speed (~14 chars/s), presses Enter.
- **While it runs (BUILT):** an agent turn with micro label `INFORA AGENT` and
  muted `Working...`. The built rail stays empty until the run reports
  (no streaming in V1). **VISION (recommended for pacing):** the "What ran" rail
  fills live with the plan's stage words: `Understanding your question` ·
  `Loading context` · `Searching project documents` · `Verifying citations` ·
  `Report`, each with a state mark `○` → `◐` → `●` and a right-aligned muted
  state word (`running`, `done`). Stage words are BUILT (`packages/ui/src/progress-rail.tsx`);
  only their live animation is vision (D-13).

### A.8 Beat 7: the answer with sources

- **Screen:** Ask transcript (BUILT). Actor: Eleanor.
- **User bubble (BUILT):** right-aligned, max 78%; micro label `ELEANOR` above;
  sunken bubble r8 (`#efeeeb`), popout shadow, 12/15 padding.
- **Agent answer (BUILT):** micro label `INFORA AGENT`; then the answer as
  **plain content, no bubble**, 15px `#57564f`, line-height 1.55. Each cited
  claim is its own block (`.cited-claim`, 10px apart) with its **source pill
  inline after the last word**: 999 radius, 2/8 padding, 13.8px @1.2, fill
  `#efeeeb`, border `#ececea`, text `#57564f`, label = mono document reference.
  Two pills may share a claim.
- **Under the answer (BUILT, in order):**
  1. Location chip `✎ Open in editor` (title `Carry this answer into a new sandbox document`).
  2. Completion footer (hairline above, 14.4px muted):
     `6 cited claims · Composed for this question · Planning & Environmental Lens v1`
     (mode words: `Composed for this question` or `Ran a declared workflow: <id> (v1)`;
     add `· N withheld` in amber if the ground-check withheld a claim).
  3. `Every claim was checked against the sources this run actually admitted. That check is deterministic code, not a second model - no independent model verification was taken.`
  4. Underlined `Details` toggle (opens `The plan` and `Citation manifest`, rows
     `Record WA-GEO-GIR-004`).
  5. Collapsed `Run 3f9c21a0 · Succeeded · every step in the audit trail`.
- **Answer content:** A.12.3 (exact text and which pill follows which claim).
- **Optional VISION flourish:** claims fade in one by one (the built API returns
  on completion; streaming is "a later, additive change", ask.tsx header).

### A.9 Beat 8: opening a source passage

- **User does:** Eleanor clicks the `WA-GEO-GIR-004` pill after the perched
  water claim.
- **Screen:** BUILT `SourcePanel` (`apps/web/src/source-panel.tsx`): a right
  column, white pane, pane shadow, r10, 380 @1x (**456 @1.2**). Header (pane
  header padding, hairline): mono `WA-GEO-GIR-004 · v2`, pill `● Live` (success;
  `Superseded` neutral or `Withdrawn` danger for other states), `✕` at the
  right (Esc also closes). Body: the version's content as markdown, 15.6px,
  line-height 1.65, `#57564f`, padding 19/22.
- **Layout @1920 with the panel open:** transcript column narrows and shifts
  left to (300, 150, 900); source panel at (1440, 81, 452, 971) inside the main
  pane's right edge (or as a separate floating pane on the frame at
  (1450, 14, 456, 1052) with the main pane narrowed to 1179; the second matches
  the "panes float on the frame" rule better).
- **VISION (small, faithful):** the cited span is **highlighted** in the body
  (tint `#f8efdd`, 2px r) and scrolled into view, with a muted locator line
  under the header: `Cited passage · page 14`. The locator is BUILT data
  (`Locator { span, paragraph, page?, verbatim }`, `packages/contracts/src/assembly.ts`;
  page for PDFs since T-305) but the built panel shows the whole text with no
  highlight. **Do not show a section number** (`§4.3 Groundwater` in
  `wrenfield.ts` `GIR_LOCATOR`): section locators are not built ("section is what
  remains", `v1.md`). Page only if the source is a PDF.
- **Superseded proof (optional 3 s):** ask A.12.2 Q2 ("Was groundwater
  encountered...?"). The answer cites v2 (`perched water table ... 1.6–2.1 m`).
  v1 said `Groundwater was not encountered.` and is never retrieved (ADR-0022).
  Show the panel header `WA-GEO-GIR-004 · v2 · Live`; caption "Only the live
  revision answers."

### A.10 Beat 9: access limits (same question, two seats)

- **The rule:** access is resolved **before** retrieval (ADR-0020, ADR-0022). A
  document out of reach never reaches the run, so it is **absent**, not
  greyed, not counted, not announced (T-399 prose on `t2-04-attach`: hiding
  unreachable items "would disclose that they exist by the shape of what came
  back"). The Lens cannot change this ("changes register, never reach").
- **Screen:** split frame, two Ask transcripts side by side (each a full
  shell scaled to 0.5, or two cropped chat columns 900 wide each), seat labels
  above: `Calder & Hale · Eleanor Price` (`#6d5dd3`) and `Trentmoor Energy · Rachel Bowen` (`#159a74`).
- **User does:** both ask A.12.2 Q3 ("What protected species survey work has
  been done along the corridor?").
- **Copy:**
  - Rachel's answer cites `WA-ECO-PEA-001` (A.12.3 answer 3R). Her chip reads `▤ 7 sources`.
  - Eleanor's answer (A.12.3 answer 3E) says what the library she can reach
    holds and cites only `WA-ENV-BAS-003`. Her chip reads `▤ 6 sources`.
  - Under Eleanor's Data sources dropdown (optional overlay): six rows, no PEA.
- **Never show** `2 sources withheld - outside your organisation's access` in Ask
  (D-11). If the run had nothing to say, the built fallback is
  `Nothing survived ground-check - no answer was produced.` (warning tint).
- **Caption:** "Same question. Each person's answer comes only from what they may see."

### A.11 Beat 10: every new document starts from it

Two faithful routes; show both quickly or pick one. **Never start from the plan
row**: the owner ruled (2026-09-01, Q-037) that the creator is never launched from a
plan deliverable and nothing of the plan row reaches it.

**Route 1 (BUILT): Ask → `✎ Open in editor`.**
- Eleanor clicks `✎ Open in editor` under the answer. A new sandbox document
  opens in the Editor (`09-editor.png` layout) titled with the question,
  truncated at 57 characters plus `...` (`apps/api/src/runs.ts` line ~458), its
  body the answer text, in `Calder & Hale - working area`.
- If a destination is broader than the answer's sources, the BUILT refusal
  appears instead (warning banner, `destination-selector.tsx`):
  `This answer draws on material held by one organisation. The selected destination "Joint working area" is shared across organisations. Writing it there would widen who can read it, so it is blocked.`
  with `Why this should be written there anyway...` and `Write it there anyway`.
  Good wall beat; optional.

**Route 2: the document creator's sources (BUILT) with ontology suggestions (VISION).**
- Eleanor: Sandbox → `✦ Create with AI` (`t1-13-landing.png` toolbar) opens the
  creator with `Where it goes` set (`t1-14`: hint `Set from the working area you started in. Change it here if the document belongs somewhere else.`).
- She picks the Work package (vision: a `Work package` select in "What this
  document is", values from the ontology's custom facet: `Land quality`).
- **"Sources this draft may use"** (BUILT list, `t1-07-sources.png`): checkbox,
  mono ref, one-line description. **VISION:** the related documents float to the
  top under a muted micro label `RELATED IN THE PROJECT ONTOLOGY`, each with a
  small neutral chip saying why: `WA-GEO-GIR-004` `Same work package` ·
  `WA-ENV-BAS-003` `Derived-from source of WA-EIA-MST-001` · `WA-EIA-SCP-001`
  `Sets the land quality scope`. They are **not pre-ticked**: the author binds
  sources (the creator's whole design is that sources are chosen before drafting
  by a person). Then a `OTHER LIBRARY DOCUMENTS` group. This is ADR-0045's ruled
  consequence "precedent surfacing (a new deliverable classified into a work
  package surfaces siblings, applicable standards and precedents)", unbuilt.
- The project style guide is pre-listed under "Which style guides apply?"
  (BUILT: `☑ Wrenfield–Ashcombe Project Style Guide  3 clauses`) and the firm's
  saved outlines appear under `Start from:` with a `Your firm` badge (BUILT,
  T-414). These are the honest "starts from it" today: the library, the
  project's rules and the firm's own outlines.
- Caption: "A new document starts from the record - its sources, its rules, its related work."

### A.12 Context layer data (exact strings)

#### A.12.1 Library documents (references, titles, revisions, descriptions, passages)

Titles: the seed stores no title on reference material (the first sentence of
the content carries it); use these titles, consistent with `wrenfield.ts` `LIB`.
Descriptions are seeded verbatim (`seed.ts` lines 263-380).

| Reference | Title | Rev | State | Held by / producer | Description (as filed) |
|---|---|---|---|---|---|
| WA-GEO-GIR-004 | Ground Investigation Interpretative Report | v2 (v1 superseded) | Live | Trentmoor Energy | Interprets the ground investigation at Wrenfield Sidings: what the made ground is, what contamination was found in it, and what the perched water means for construction dewatering. |
| WA-ENV-BAS-003 | Environmental Baseline Compendium | v3 | Live | Trentmoor Energy | The environmental baseline for the corridor - the existing conditions every assessment chapter measures its effects against. |
| WA-WAT-FRA-001 | Flood Risk Assessment - Screening Note | v1 | Live | Trentmoor Energy | The flood risk assessment for the corridor, including the Ashcombe Brook crossing and how surface water leaving the compounds is managed. |
| WA-CON-SCC-002 | Statement of Community Consultation | v1 | Live | Trentmoor Energy | How the community was consulted, when, and what they said - the record the routeing refinement was justified against. |
| WA-EIA-SCP-001 | EIA Scoping Report | v1 | Live | Trentmoor Energy | Sets out what the Environmental Impact Assessment will and will not cover, and the register and structure every chapter is written to. |
| WA-HER-DBA-002 | Heritage Desk-Based Assessment | v1 | **Withdrawn** 02 Jul 2026 | Trentmoor Energy | The original heritage desk-based assessment. Withdrawn: its methodology was superseded, and it must not be relied on. |
| WA-ECO-PEA-001 | Preliminary Ecological Appraisal | v1 | Live; **Redgate Ecology, shared with nobody** | Redgate Ecology | Redgate's preliminary ecological appraisal of the corridor - habitats, protected species and the survey work still outstanding. |
| WA-EIA-MST-001 | EIA Scoping Method Statement - Land Quality | C01 | Live, A1 | Calder & Hale | (the journey's deliverable) |

Verbatim passages (seed; quote exactly, hyphen-normalise only em dashes, keep
the en dash in "1.6–2.1"):

- **WA-GEO-GIR-004 v2:** "Intrusive investigation across the Wrenfield Sidings compound identified made ground to a depth of 2.4 m, comprising ash, clinker and demolition fill over glacial till. Elevated concentrations of polycyclic aromatic hydrocarbons (PAHs) were recorded in three of eleven trial pits (WS-TP03, WS-TP07, WS-TP09), with benzo(a)pyrene up to 18 mg/kg. A shallow perched water table was encountered at 1.6–2.1 m within the made ground. Monitoring over three visits confirmed seasonal persistence. The perched horizon provides a plausible migration pathway toward the Ashcombe Brook during construction dewatering. Asbestos screening returned no detectable fibres. Recommendations: construction-phase watching brief, targeted remediation of the three PAH hotspots, and a dewatering management plan."
- **WA-GEO-GIR-004 v1 (superseded, never grounds):** "Preliminary trial pitting at Wrenfield Sidings identified made ground to 1.1 m. No contamination exceedances were recorded in the four pits completed at the time of issue. Groundwater was not encountered."
- **WA-ENV-BAS-003 v3:** "The study area comprises predominantly arable agricultural land crossed by the Ashcombe Brook, with two former industrial sites: Wrenfield Sidings (railway land, ceased 1968) and the Ashcombe depot (plant maintenance, ceased 1994). Historical landfill (Wrenfield East, closed 1979, inert and commercial waste) is recorded east of the order limits within 250 m of the proposed cable corridor (Figure 4). The Ashcombe Brook supports brown trout and is classified Moderate under the Water Framework Directive (Table 9). Two residential receptors lie within 150 m of the corridor at Ashcombe Lane. Baseline dust deposition and groundwater quality monitoring commenced March 2026 and continues quarterly."
- **WA-WAT-FRA-001 v1:** "The cable corridor crosses Flood Zone 2 for 380 m either side of the Ashcombe Brook. Trenchless crossing is proposed beneath the watercourse, with launch and reception pits located outside Flood Zone 3. Surface water flow paths follow field drains toward the brook; construction compounds are sited on ground above the 1 in 100 year plus climate change level. A drainage strategy will manage runoff from the Wrenfield Sidings compound, where made ground limits infiltration."
- **WA-CON-SCC-002 v1:** "Two rounds of statutory consultation were held (October 2025, March 2026) with parish councils at Wrenfield, Ashcombe and Netherfold. Principal themes raised: construction traffic on Ashcombe Lane, protection of the brook corridor, and reinstatement of field drainage. Responses informed the routeing refinement adopted in the Preferred Corridor Report."
- **WA-EIA-SCP-001 v1:** "The Environmental Impact Assessment will address land quality, water environment, ecology, landscape and visual, noise, traffic and transport, and cultural heritage. For land quality, the assessment scope includes ground contamination associated with Wrenfield Sidings and the Ashcombe depot, and pollutant linkages to controlled waters. Scoping statements follow the project style: define the study area, summarise the baseline, identify receptors, state the assessment methodology, and set out mitigation principles. Chapters use formal register, cite project sources by document reference, and avoid cost or programme commitments."
- **WA-ECO-PEA-001 v1 (Redgate; not visible to Calder & Hale):** "Extended Phase 1 habitat survey of the order limits recorded species-poor semi-improved grassland, defunct hedgerow along Ashcombe Lane, and a small area of wet woodland adjoining the brook. Great crested newt eDNA returned negative at both ponds. Badger activity was recorded at two setts outside the working corridor." (The seed's last sentence, "This report was produced by Redgate Ecology and has NOT been shared...", is a test marker: never show it.)

#### A.12.2 Ask questions (would impress an infrastructure consultant)

| # | Question (typed) | Seat | Lens | Why it impresses |
|---|---|---|---|---|
| Q1 | `What did the ground investigation find at Wrenfield Sidings, and what does it mean for dewatering near Ashcombe Brook?` | Eleanor | Planning & Environmental | Joins three documents (GIR, baseline, FRA) into a source-pathway-receptor answer, every figure cited. |
| Q2 | `Was groundwater encountered at Wrenfield Sidings?` | Eleanor | Engineer | The trap: superseded v1 says no; the live v2 says perched water at 1.6–2.1 m. Only v2 answers. |
| Q3 | `What protected species survey work has been done along the corridor?` | Eleanor and Rachel | Planning & Environmental | The wall: same question, different reach. |
| Q4 (spare) | `Which receptors does the land quality chapter need to address?` | Eleanor | Planning & Environmental | Scope (SCP) + receptors (BAS). |
| Q5 (spare) | `What did consultees raise, and does the flood risk work respond to any of it?` | Eleanor | Communications | Consultation themes (SCC) against the FRA's drainage and crossing. |

#### A.12.3 Answers (claim → source pill; each line is one `.cited-claim` block)

Every sentence below is supported by the quoted passage of the pill that follows
it. Do not add a claim without a source; if a sentence is needed with no
source, show it withheld (footer `1 withheld`).

**Answer 1 (Q1, Planning & Environmental Lens; footer `6 cited claims · Composed for this question · Planning & Environmental Lens v1`):**

1. `The land quality scope covers ground contamination at Wrenfield Sidings and the Ashcombe depot, and pollutant linkages to controlled waters.` → `WA-EIA-SCP-001`
2. `At Wrenfield Sidings, made ground reaches 2.4 m - ash, clinker and demolition fill over glacial till.` → `WA-GEO-GIR-004`
3. `PAHs were elevated in three of eleven trial pits (WS-TP03, WS-TP07, WS-TP09), with benzo(a)pyrene up to 18 mg/kg.` → `WA-GEO-GIR-004`
4. `A perched water table sits at 1.6–2.1 m within the made ground, persisted over three monitoring visits, and is a plausible migration pathway toward Ashcombe Brook during construction dewatering.` → `WA-GEO-GIR-004`
5. `The receptor is sensitive: the brook supports brown trout and is classified Moderate under the Water Framework Directive.` → `WA-ENV-BAS-003`
6. `The GIR recommends a watching brief, targeted remediation of the three PAH hotspots and a dewatering management plan, and the compound's runoff is to be managed by a drainage strategy because the made ground limits infiltration.` → `WA-GEO-GIR-004` `WA-WAT-FRA-001` (two pills on one claim)

**Answer 1, Engineer Lens (optional Lens-switch beat; footer `... · Engineer Lens v1`):**

1. `Excavations at Wrenfield Sidings will meet made ground to 2.4 m: ash, clinker and demolition fill over glacial till.` → `WA-GEO-GIR-004`
2. `Expect perched water at 1.6–2.1 m inside the made ground; it persisted across three monitoring visits.` → `WA-GEO-GIR-004`
3. `Dewatering is the constraint: the perched horizon is a plausible pathway to Ashcombe Brook, so the GIR asks for a dewatering management plan.` → `WA-GEO-GIR-004`
4. `Three hotspots need targeted remediation - WS-TP03, WS-TP07 and WS-TP09 - with benzo(a)pyrene up to 18 mg/kg.` → `WA-GEO-GIR-004`
5. `The brook crossing is trenchless, with launch and reception pits outside Flood Zone 3.` → `WA-WAT-FRA-001`

**Answer 2 (Q2, Engineer Lens; footer `2 cited claims · ...`):**

1. `Yes. A shallow perched water table was encountered at 1.6–2.1 m within the made ground at Wrenfield Sidings.` → `WA-GEO-GIR-004`
2. `Monitoring over three visits confirmed it persists seasonally.` → `WA-GEO-GIR-004`
Source panel header on click: `WA-GEO-GIR-004 · v2` `● Live`.

**Answer 3R (Q3, Rachel, owner; footer `3 cited claims · ...`):**

1. `Redgate Ecology's Preliminary Ecological Appraisal records an extended Phase 1 habitat survey of the order limits: species-poor semi-improved grassland, a defunct hedgerow along Ashcombe Lane and a small area of wet woodland by the brook.` → `WA-ECO-PEA-001`
2. `Great crested newt eDNA returned negative at both ponds, and badger activity was recorded at two setts outside the working corridor.` → `WA-ECO-PEA-001`
3. `The baseline adds that Ashcombe Brook supports brown trout.` → `WA-ENV-BAS-003`

**Answer 3E (Q3, Eleanor; footer `1 cited claim · ...`):**

1. `None of the 6 library documents you can draw on records a protected species survey.` (plain, uncited: a statement about the search, not about the scheme)
2. `The baseline records that Ashcombe Brook supports brown trout and is classified Moderate under the Water Framework Directive.` → `WA-ENV-BAS-003`

Note on 3E line 1: the built `corpus_retrieval` worker writes a coverage note;
whether the answer prose states it this way is VISION copy. It is honest: it
names Eleanor's own scope (the chip already says 6) and reveals nothing about
any document outside it. If the producer prefers zero risk, drop line 1 and let
the thin answer speak.

---

## B. Tools flow

**What the pillar claims** (deck slide 17): "Purpose-built AI tooling, and an
app builder that lets teams extend it themselves - modular software with
access to the context it needs." Brief: run a QA check; run an existing
workflow; then build an app - a **really polished**, **chat-led** supplier KPI
dashboard (the agent drives the builder's steps).

### B.1 Recommended running order (~2:00)

| # | Beat | Seat | Screen | Status | Approx. |
|---|---|---|---|---|---|
| 1 | Title "04 Tools" | - | card | - | 0:00-0:04 |
| 2 | The Tools page | Eleanor | Tools | BUILT (`t1-01-tools.png`) | 0:04-0:09 |
| 3 | QA checker: pick draft, checks, plan | Eleanor | QA checker | BUILT (`t2-02`, `t2-03`, `t2-05`) | 0:09-0:20 |
| 4 | Run; what was checked | Eleanor | QA checker | BUILT (`t2-06-progress`, `t2-06-run`) | 0:20-0:26 |
| 5 | Findings in the draft; accept the mechanical fix; read the accuracy finding | Eleanor | Editor · Checks | BUILT (`t2-07`, `t2-10`, `t2-11`) | 0:26-0:40 |
| 6 | Run an existing workflow: the document creator from the firm's saved outline | Eleanor | Document creator | BUILT (`t1-*`) | 0:40-0:58 |
| 7 | App builder: describe the app | Rachel | Builder (chat-led) | VISION over BUILT model | 0:58-1:06 |
| 8 | The agent fills steps; asks the three wall questions | Rachel | Builder | VISION (chat-led) / BUILT (questions, steps) | 1:06-1:30 |
| 9 | Live preview; check and open | Rachel | Builder | VISION / BUILT (publish) | 1:30-1:38 |
| 10 | Two seats: supplier form vs client dashboard | Sam / Rachel | App screens | RULED + BUILT mechanics (mockup) | 1:38-1:50 |
| 11 | Run the analysis; the insight; keep as template | Rachel | App page | BUILT | 1:50-1:57 |
| 12 | Close | - | card | - | 1:57-2:00 |

If time is short, beat 6 compresses to 10 s (outline seeded → plan → result).

### B.2 Beat 2: the Tools page

- **Screen:** `t1-01-tools.png` (BUILT), `apps/web/src/screens/tools.tsx` lines 103-125.
- **Actor:** Eleanor (Calder & Hale), rail item **Tools** active.
- **Layout @1920:** H1 `Tools` (y 133); sub (one line) at y 180; tool cards row
  at y 210: two cards 410 × 135, gap 16, white with a quiet 1px border
  (`#ececea`, the one bordered-card exception) and r10. Card: 17px Lucide icon +
  bold 17px name; description 15px, 3 lines.
  Below (BUILT, not in the screenshot because the seed has no app): micro label
  `APPS BUILT FOR THIS PROJECT` and a card (`#efeeeb`, r10) with sub-text and,
  for a builder, a `New app` text field (placeholder `Sustainability returns`)
  and deploy-from-template row (see B.9).
- **Copy:**
  - Sub: `Infora's standard tools. Each runs a codified workflow - the same inputs produce the same steps, in the same order, every time.`
  - `Document creator`: `Build a document's structure, say what each section is for, and choose the library sources it draws on - before anything is drafted.`
  - `QA checker`: `Check a draft against the project style guide, your firm's own rules and the project library, and get anchored findings you accept or reject one at a time.`
  - Apps sub: `Apps a firm has had built inside this scheme - a form to fill in, a register, a dashboard. Every row somebody types in one remembers which organisation and which person entered it, and is read by that organisation and by the project owner, and by nobody else.`
  - Empty: `No apps yet.`
- **VISION addition for the builder entry:** a third card in the tool grid
  `App builder` (Lucide `LayoutGrid`): `Describe an app in your own words and an agent builds it - its tables, its screens, when it runs and what it writes - asking the questions that decide who sees what.`
  Built reality: apps start from the `New app` field in the Apps card (ADR-0056
  §13e calls the builder "a fourth tool on" the Tools surface; T-440 deliberately
  kept apps out of the tile grid). For the chat-led vision either entry works;
  recommend the Apps card's field turned into a composer (B.6).

### B.3 Beats 3-4: QA checker, setup and run

All BUILT. Source: `apps/web/src/screens/tools.tsx` (from line 1880),
screenshots `t2-02` to `t2-06-run`. Actor: Eleanor.

**Step 3a, choose the draft** (`t2-02-draft.png`):
- H1 `QA checker`; sub `Read a draft against the writing rules that bind it and the project record it rests on. You see the plan, and what it will cover, before anything is spent.`
- Card 1 (sunken, r10): label `Which draft`, select `Land Quality method statement - Ashcombe Lane working copy` (stops at ~880px wide @1920), hint `A check covers one document. Its findings are marks in that draft, not a report about several.`
- Card 2 `Which checks to run`, sub `Tick a check and its own settings appear underneath it. Start from a preset if you like - it is a starting point, not a mode, and every part of it stays adjustable afterwards.`
  Segmented switch `Full check` | `Quick check` (white thumb on sunken track).
  Full-check note: `Every check, and the project record looked up for each checkable statement rather than once per section. Slower and more expensive - and it is what catches a wrong figure buried in a paragraph about something else.`
- The five checks, a ruled list (checkbox 18px + bold name + optional `● No AI` neutral micro badge + 2-line description):
  - `House style` - `Reads each section against the project style guide and your firm's own rules, and quotes the clause it is enforcing. Where the two disagree, the project's guide wins and your firm's fills the gaps.` Under it `Rules this check will apply`: `Wrenfield–Ashcombe Project Style Guide  3 clauses` / `Your firm's own manual, where the project's guides are silent.` / muted `The project's guide wins where the two disagree; your firm's fills the gaps. Where a guide has been turned into accepted rules, this check applies those rules instead of reading it as prose - and the plan's coverage below says how many of them it will apply.`
  - `Accuracy` - `Reads each section against what the project library actually says, and cites the passage behind every finding. Where the library is silent it says nothing rather than guessing.` Under it `How hard to look` select `Statement by statement (slower, catches buried figures)`; `What it checks against` `By default the whole library you can reach. Narrow it here if you want. Findings from these cite normally - they resolve to a place in a source document.` search `Search by title or reference...` + `5 documents` + the five reference rows (ref + description).
  - `Internal consistency` - `Compares what each section asserts against what the others do, so a figure that changes between chapters is caught. One pass over the whole draft.`
  - `Readability` `● No AI` - `Scores each section against the project's reading-age target and flags the ones well outside it. Arithmetic, not AI - and never a pass or a fail.`
  - `Completeness` `● No AI` - `Looks for sections the template expects and the draft does not have, and for placeholder text left behind. Arithmetic, not AI.`
- Card 3 `Attach a document` - `One of your own drafts, or a file you upload here, read as background. Findings from an attached document are never cited - they quote an excerpt instead of resolving to a source. If you want citations, scope to the library document above instead.` + `Search your drafts by title...` `2 documents`; rows `Land contamination - Ashcombe Lane parcels`, `Land Quality scoping method statement - working draft`; `Upload a file...`; `Word, Excel, PowerPoint or PDF. An uploaded file is read for this check and kept nowhere afterwards - the record keeps its name, size and content hash, never its text - so running the check again means attaching it again.`
- **For the video:** keep Full check, all five ticked, no attachment (simpler
  coverage line; avoids the ADR-cited notice, D-20).

**Step 3b, the plan** (`t2-05-plan.png`): primary `See the plan` → card `The plan`:
- `This is what will run, step by step, in the order it will happen. Change an answer above to change it - the steps are not editable, which is what makes the run repeatable.`
- `One pass over the whole draft - one reader sees everything, so the consistency check comes free.`
- Numbered steps (20px outlined circles): `1 Read the whole draft against 2 writing rules and the project record` · `2 Score the draft for readability and check it for gaps and placeholders`.
- `Covers:` (bold) `6 sections · 5 checks · the whole library, searched once per section · 5 of 5 accepted rules applied (5 all) · style guide 3 of 3 clauses`
  (screenshot reads `4 checks` and `style guide 2 of 2 clauses` with one
  attachment; use the video's own consistent numbers, D-19).
- Primary `Run the check`.

**Step 4, the run** (`t2-06-progress.png`, `t2-06-run.png`): card `Running the check`, `0 of 2 steps finished.` → `1 of 2` → done; the running step's circle is filled ink outline, its label bold. Then card `What was checked`:
- `Covered: 6 of 6 sections read · 5 checks · 5 passages of the record read · 5 of 5 accepted rules applied · style guide 3 of 3 clauses`
- `5 findings, anchored in the draft.`
- `Open the draft to work through them` (link).

### B.4 Beat 5: findings in the draft

BUILT. `t2-07-marks.png` (best single frame), `t2-10-accept-all.png`,
`t2-11-rewrite.png`, `t2-12-dismiss.png`; `apps/web/src/findings-panel.tsx`.
Actor: Eleanor.

- **Layout @1920:** two-pane Editor (section 0). Second bar: `▧ Calder & Hale - project sandbox` / `Land Quality method statement - Ashcombe Lane working copy`; right: `✳ Freeze`, `● No document controls`. Canvas: format bar (`B I | H2 H3 | • List 1. List ❝ Quote | 💬 Comment ✓ Check | Write Preview`), then serif prose 18.6px (15.5 @1x) line-height 1.75, measure ~670px. Side panel tabs `Chat · Comments · Checks (5)` (+ `2 pending in the document`).
- **Marks in text:** advisory = dashed `#78766f` underline on a faint sunken tint; required = solid `#b23b34` underline with `#fbeceb` tint.
- **Panel copy:** `5 open findings. Each one points into the draft - click it to go there.`; group header `⌄ House style (4)` + `Dismiss all`; primary `Accept 1 mechanical correction`; `The same substitution, applied consistently - one decision, 1 place.`
- **Finding cards (verbatim from screenshots):**
  1. `● Advisory` `Go to it` - `This project's rules use "the scheme", not "the routewide works".` Quoted rule (sunken block): mono `§2.1` `(project style guide)` / italic `"Refer to the works as "the scheme", in lower case, throughout. Do not capitalise it as a proper noun."`; mono fix `routewide works → scheme, 1 place`; `Accept` `Edit` `Dismiss`.
  2. Divider text `The rest are rewritten wording, so they are read one at a time.` then `● Advisory` - `This sentence is passive, so the party who prepared the model is not named.` / `Measured against a rule Infora proposed and this project accepted: "Write in the active voice where the meaning allows it.".` / `Suggested wording - the same substitution applied everywhere does not produce this proposal:` / blockquote `Calder & Hale has prepared a conceptual site model for each land parcel the route crosses.` / `Accept` `Edit` `Dismiss`.
  3. `● Required` (amber) - `The exceedances are reported with no concentration and no unit, so the result cannot be checked.` / `§2.4 (project style guide)` `"State every quantitative result with its unit and its source. A figure without a unit is not a result."` / `Dismiss`.
  4. `● Advisory` - `The conclusion is hedged where the ground investigation supports stating it.` / `§4.7 (your firm's rulebook)` `"Do not hedge a conclusion the evidence supports. State it, and state the evidence beside it."` / `Dismiss`.
  5. Group `⌄ Readability (1)` - `● Advisory` - `This section reads at about grade 15.5, against the project's target of 14 and a median of 12.3 across the rest of the draft. It is denser than the ...`
- **The accuracy finding (VISION copy over BUILT rendering):** no screenshot
  shows an Accuracy group. The built `Evidence` for a corpus finding is a row of
  `SourceChip`s (library variant). For the video, add group `⌄ Accuracy (1)`:
  `● Required` `Go to it` - `The record puts these PAH hotspots at Wrenfield Sidings, not south of the Wrenfield substation.` then pill `WA-GEO-GIR-004`; suggested wording `the PAH exceedances in three trial pits at Wrenfield Sidings`; `Accept` `Edit` `Dismiss`. Anchored to the canvas span `PAH exceedances at three trial pits south of the Wrenfield substation` (solid red). Copy source: `wrenfield.ts` `QA`. Then the count reads `Checks (6)`; or replace finding 4 to keep 5.
- **User does:** clicks `Accept 1 mechanical correction` (the canvas shows a tracked change `routewide works` struck, `scheme` inserted, green) → clicks the accuracy finding's `WA-GEO-GIR-004` pill (source modal, optional) → `Accept` on its suggested wording. Counter: `3 open findings, 2 resolved.`
- **Footer note (BUILT):** `2 findings have been resolved. Resolved is resolved either way - the promotion gate counts what is still open, not how it was cleared.`
- **Drift banner (optional, `t2-09-drift.png`):** `1 mark has moved since the check ran, so nothing was written for it. The text they pointed at has been edited - look at it yourself rather than taking the suggestion blind.`

### B.5 Beat 6: running an existing workflow (the document creator, from the firm's saved outline)

**Why this is the best real example.** The Tools page says every tool "runs a
codified workflow - the same inputs produce the same steps". The document
creator is a **declared workflow** (`v1.md` "Two declared workflows"), and a
firm's saved outline (T-414, BUILT: `Save this outline for your firm`, offered
under `Start from:` with a `Your firm` badge) is the firm's own codified
know-how that travels to every project and never crosses the wall. Running it
is "run an existing workflow" with nothing invented. (Alternative: deploying a
firm template of an app, B.9; weaker here because it pre-empts the builder.)

All BUILT; screenshots `t1-02` to `t1-13`; source `apps/web/src/screens/tools.tsx`
from line 1061. Actor: Eleanor.

- **Screen 1, "What this document is"** (`t1-03-characteristics.png`): H1
  `Document creator`; sub `Say what kind of document this is, what language it should be in, which style guides apply and whether it is a whole document, a chapter or a section - then pick the library documents it may draw on. The sources are chosen before anything is drafted, so the result can be checked against what you asked for.`
  Sunken card `What this document is`: `What kind of document is this?` `External document` (hint `Written to leave your firm. Every statement stands on its own and nothing is left half-said.`); `What language should it be written in?` `Non-technical` (hint `Plain professional English for an informed reader outside the discipline.`); `Which style guides apply?` `☑ Wrenfield–Ashcombe Project Style Guide  3 clauses`; `Is this a whole document, a chapter or a section?` `Chapter` (hint `Part of a larger document. It does not re-introduce the project.`). For the video choose **Technical** register or keep Non-technical; the other option labels are in tools.tsx around line 229.
- **Screen 2, "The outline"** (`t1-04`, `t1-05`): `Build the document section by section: a heading, and what should go in it. Say what belongs there, not what you expect it to conclude - the draft rests on the sources, not on the outline. A section can carry sub-sections, and each one is written as a part of its own under its parent's heading.` Row `Start from:` quiet buttons `Assessment chapter section` · `Technical note` · **`Land quality technical note` + neutral badge `Your firm`** (the firm's saved outline; name per the built placeholder `e.g. Land quality technical note`) ` - every section it adds stays yours to edit or remove.` Click the firm outline → section cards appear (white r10 inside the sunken card): number, heading input, purpose textarea, ↑ ↓ × icon buttons, `+ Add a sub-section`. Use the screenshot's sections: `1 The test` - `The statutory test this section answers, in one paragraph, and where in the record it comes from.`; `2 Baseline` - `Describe the baseline as the record establishes it, with its survey dates and its limitations where they are stated.`; `2.1 Survey dates and limitations` - `When each survey was carried out, and what the record says it did not cover.`; `3 Effect` - `Describe the effect on the receptor, its magnitude and its duration, as the record describes them.` Footer `+ Add a section` · `⊕ Save this outline for your firm`.
- **Screen 3, "The brief, and where it goes"** (`t1-07`): `What is this document for?` `The land contamination section for the Ashcombe Lane parcels: the test it answers, the baseline as the ground investigation records it, the effect on the parcels and the mitigation the record already commits to.`; `Title` `Land contamination - Ashcombe Lane parcels`; `Where it goes` `Calder & Hale - working area`.
- **Screen 4, "Sources this draft may use"**: tick **`WA-GEO-GIR-004`** and **`WA-ENV-BAS-003`** (D-18). Primary `See the plan`.
- **Screen 5, "The document this will write"** (`t1-08-proposal.png`): overview `The land contamination section for the Ashcombe Lane parcels: ... It will be written as an external document, chapter, in Non-technical register, in 4 sections, drawing on 2 bound sources. It follows 1 project style guide.`; per section a heading + editable description ending `Written in Non-technical register, from the 2 bound sources only - anything the record does not support is left out.` and a pill button `Ask the agent` (`t1-09`: label `Tell the agent what is wrong with "The test"`, text `No - set the three ground constraints out as bullets, one line each.`, primary `Revise this description`, `Close`; revised description tagged `Your wording`, `t1-10`). Then `Correct any description above and the plan redraws. Every other answer stays as it is.` / `And this is what will run. The steps are computed from the answers above and are not editable, which is what makes the run repeatable.` / `· Draft 4 sections - The test, Baseline, Survey dates and limitations, Effect - from the 2 bound sources` / `Covers: 4 sections · 2 bound sources · 1 drafting pass` / `Written as an external document, chapter, in Non-technical register.` / `Written to 1 project style guide. Where a style guide and the language you chose disagree, the guide wins on terms and vocabulary and your language answer wins on register.` / primary `Accept the plan and create the document`.
- **Screen 6, "What was made"** (`t1-12-result.png`): `Covered: 4 of 4 sections written · 2 of 2 bound sources used · 1 drafting pass` then `Open the document`. (Screenshot reads `3 of 4 ... 1 of 2`; D-17.) Optionally append `1 sentence withheld for resting on no source` (the built absences line).
- **Landing** (`t1-13-landing.png`): Sandbox, `Calder & Hale - working area` selected; row `Land contamination - Ashcombe Lane parcels  v0.1  Infora text · Oct 05, 2026  ● Unbound  🔒 Freeze  ⋯`.
- **Caption:** "Your firm's way of writing it, run the same way every time."

### B.6 Beats 7-9: the app builder, chat-led (the supplier KPI dashboard)

#### B.6.1 What is built, what is ruled, what is vision

| Element | Status | Source |
|---|---|---|
| Seven steps, in this order: `What the app is` (and who it is open to) · `The tables` · `Data connections` · `The interface` · `How often it runs` · `Analysis and prompts` · `Check and open` | BUILT | `app-builder.tsx` lines 60-68; ADR-0056 addendum ruling 1 |
| Step sub-lines: `and who it is open to` · `what people fill in, and whether it holds contractual data` · `systems outside Infora it draws on` · `the screens, and who may open each` · `a schedule, or only when someone presses Run` · `what the agent says each run` · `read it back; open it to its people` | BUILT | same |
| `✦ The agent asks` marker on steps with an unanswered required question | BUILT (as `The agent asks` micro text) | lines 178-195 |
| Required questions computed in code: contractual data (step 2), who may open each screen (step 4) | BUILT | `pendingBuilderQuestions`, `packages/contracts/src/app-builder.ts` lines 749-778 |
| Third question: what a scheduled run may touch, and as whom (step 6) | RULED (ADR-0056 §2b; mockup "Step 6 will ask"); built only as explanatory copy | `app-builder.tsx` StepAnalysis |
| Agent in its own pane, conversation continuous, "every choice lands in the form" | BUILT (pane answers questions only; writes nothing) | `BuilderAgentPane` |
| **The agent drives the steps from chat** | **VISION, reopening ADR-0056 addendum ruling 6** ("Declined: a chat that fills the steps in... Revisit after T-446") | brief 2026-10-05 |
| Working copy vs published copy; step 7 is the publish act | BUILT | ruling 2 |
| Screen grammar: 9 closed blocks `heading`, `paragraph`, `rowForm`, `rowTable`, `total`, `count`, `barChart`, `lineChart` (`showTrend`), `pieChart`; no URL/key/style fields | BUILT | `APP_SCREEN_BLOCK_KINDS` |
| Agent writes a screen from a plain description (`What this screen does` → `Write this screen`) | BUILT | `app-builder.tsx` lines 796-807 |
| Acceptance flow draft → submitted → accepted/rejected (reason required); submitted rows frozen | BUILT | T-441, second addendum ruling 1 |
| Manual run → insight row (`Run at`, `What the run found`, `Rows covered`, `App version`) | BUILT | `INSIGHT_TABLE_COLUMNS` |
| Schedule honoured on a clock | RULED, not running (`Saved, but not running yet`) | ADR-0056 §13d |
| Export to spreadsheet (`Download as a spreadsheet`), provenance stamp, no "made by AI" | BUILT | apps.tsx |
| Keep as template / deploy | BUILT | playbooks.tsx |
| KPI tiles as cards, percentages, threshold flags, charts grouped by supplier | VISION (grammar sums and counts; renders totals as text lines; groups by a declared column only) | app-screen.tsx |
| Live preview pane beside the chat | VISION (the built interface step has "What this screen looks like to you", the mockup draws per-seat previews) | mockup; app-builder.tsx line 698 |

**What ruling 6 protected, which the chat-led version must keep visible:**
the three wall questions are asked and **cannot be skipped**; every answer
**visibly lands in a step** (the form is the record, the chat discusses it);
closing the chat would lose nothing. Concretely: each question blocks its step
with an amber `Waiting for you` pill until answered; each answer produces a
receipt naming the step; the step rail expands to show what was recorded.

#### B.6.2 Layout @1920 (the chat-led builder)

Built header (app-builder.tsx line 166): H1 = app name, sub with a badge
`Draft - not yet open to anyone` (neutral) or `Open as version 1` (success),
then `You are editing the working copy. Nothing you change here reaches the people the app is open to until you open it again at step 7.`
Mockup header: crumb `Wrenfield–Ashcombe 400kV Connection · Tools / App builder / Supplier KPI returns`,
pill `Draft - not yet open to anyone`, `● Owner`.

Recommended frame (shell + three zones inside the main pane, building on the
approved mockup's step column and agent pane but swapping their weight, per the
owner's critique and `demo/archive/2026-10-sizzle/review/review-buyer.md` §4):

| Zone | Rect (x, y, w, h) | Contents |
|---|---|---|
| Builder header | 283, 81, 1599, 76 | Crumb (muted 15px) `Tools / App builder /` + bold `Supplier KPI returns`; right: badge `Draft - not yet open to anyone` → `Open as version 1`; `● Owner`. Hairline under. |
| Conversation (hero) | 283, 169, 860, 883 | Panel header `The builder's agent` + muted `Step 2 of 7`. Turns. Composer at foot (110 h). |
| Step rail (progress) | 1159, 169, 300, 883 | Sunken card. Micro label `THE STEPS`. Seven rows: 26px numbered circle (outlined; current = ink fill; done = black circle with white tick), title bold 15px, sub-line muted 13px; when done, one muted line of what was recorded; `✦ The agent asks` slate micro tag on steps 2, 4, 6; amber `Waiting for you` pill while a question is open. Vertical connector line `#e0ded8` between circles (as `ProgressBar4`). |
| Live preview | 1475, 169, 417, 883 | White card, popout shadow. Micro label `PREVIEW · AS RACHEL BOWEN, TRENTMOOR ENERGY`; the generated screen in miniature; switcher `As Rachel Bowen` / `As Sam Kerridge, Netherfold Cabling` (mockup's per-seat preview). Starts as `Shimmer` blocks. |

Alternative (if the preview needs width): drop the preview until beat 9 and
give the conversation 1180 px, as clip 4 did.

**Conversation styling (design rules):** user turns are bubbles (sunken
`#efeeeb`, r12, popout shadow, right-aligned, micro label `RACHEL BOWEN`). Agent
turns have **no bubble** (`ChatBubble.prompt.md`): micro label `AGENT` (mockup)
then 15.6px text; mockup draws agent turns on a sunken block, which the rule
forbids; follow the rule (D-29). Quick replies: secondary pill buttons
(white, 1px `#e0ded8`, r999, 14px). Receipts (`Receipt` component): `✓` +
`Step 2 · The tables - Monthly KPI returns, 8 columns, with an acceptance step`
in 14px muted, on one line, with the step number bold.
Composer: placeholder `Ask the agent, or tell it what to change...` (mockup),
`✦` glyph, black send button. First composer (empty app): hero-sized,
placeholder `Describe the app you want...` (clip 4).

#### B.6.3 The script (turns, receipts, steps)

Actor: **Rachel Bowen** (Trentmoor Energy, Owner). App date: build on
**2 Jun 2026**; payoff in **October 2026** (caption "Four months later").

**Turn 0 - Rachel types (prompt hero → first bubble):**
`I need a monthly KPI return from our four suppliers on Wrenfield–Ashcombe - deliveries due and on time, NCRs, safety incidents, carbon and local spend - with a dashboard for us and a written summary each month.`
(Long but specific; the first film's 10-word prompt read as a toy to a buyer.
If pace demands, use clip 4's `Monthly supplier KPI returns, with a dashboard and written summary.`)

**Turn 1 - Agent (step 1):**
`Done - Supplier KPI returns, open to Trentmoor Energy and four suppliers: Netherfold Cabling, Ashcombe Civils, Wrenfield Plant Hire and Wrenbrook Fencing & Reinstatement.`
Receipt `✓ Step 1 · What the app is - open to 5 organisations`.

**Turn 2 - Agent (step 2, the table):**
`I've drafted one table, Monthly KPI returns, with eight columns: Month, Deliveries due, Delivered on time, NCRs, Safety incidents, Carbon (tCO2e), Local spend (£), Notes.`
Step 2 expands to show the column list (mockup's table editor: Column / Type / Required).

**Turn 3 - Agent asks (BUILT question text):**
`Does "Monthly KPI returns" hold contractual data? Something a payment hangs on, that discharges a condition, or that the project owner will rely on as its record. If it does, it needs an acceptance step - a row is submitted, and the owner accepts or rejects it.`
Replies: `Yes - it's contractual` · `No - it's working data` · `What counts as contractual?` (mockup).
Step 2 pill `Waiting for you`.

**Turn 4 - Rachel (types, not a tap: it is the moment of judgement):**
`Yes - the KPIs feed each supplier's scorecard under the contract.`

**Turn 5 - Agent:**
`Done - Monthly KPI returns now has an acceptance step. A supplier submits each month's return and someone at Trentmoor Energy accepts or rejects it. An accepted return becomes Trentmoor Energy's record and cannot be edited in place; a correction arrives as a new row.`
Receipt `✓ Step 2 · The tables - Monthly KPI returns, with an acceptance step · Insights`.
(The insight table is added automatically when step 6 is set; the mockup's note
`Added when step 6 is set. One row per run...`.)

**Turn 6 - Agent (step 3):** `No outside systems needed - suppliers type their returns in.`
Receipt `✓ Step 3 · Data connections - none`.

**Turn 7 - Agent (step 4, writes two screens):**
`I've written two screens: Submit this month's KPIs, a form with your own organisation's returns underneath, and Supplier KPI dashboard, with the totals, the trends and every return.`
The preview fills (B.6.4).

**Turn 8 - Agent asks (BUILT question text, mockup's framing):**
`Who may open "Supplier KPI dashboard"? Everyone the app is open to, or only some of those organisations. Whatever you choose, it can only narrow - a screen shows each person what they could already see, and never more.`
Replies: `Trentmoor Energy only` · `Everyone - each sees their own`.
Rachel taps `Trentmoor Energy only` (recommended; D-4).

**Turn 9 - Agent:**
`Set: Supplier KPI dashboard opens to Trentmoor Energy only. Suppliers open the form and their own returns.`
Receipt `✓ Step 4 · The interface - 2 screens; the dashboard opens to Trentmoor only`.

**Turn 10 - Rachel types a change:** `Flag any supplier below 90% on time.`
**Turn 11 - Agent:** `Done - added to the dashboard.` (VISION: thresholds are not a grammar block; D-6.)

**Turn 12 - Agent (step 5):** `Runs every month, on the 1st.`
Receipt `✓ Step 5 · How often it runs - every month`. Step 5 line under the title:
for honesty, the built warning exists: `Saved, but not running yet`. In the video,
omit it (vision of a deployed server) or keep a muted `Run the analysis now` until then.

**Turn 13 - Agent (step 6, writes the analysis prompt):**
`Each month I'll write a summary: on-time delivery and which supplier fell short, any rise in NCRs, and carbon against last month. The figures are computed; I only write the sentences.`
Step 6 expands: `What the analysis should say` = `Summarise the month: on-time delivery across suppliers and which supplier had the most late deliveries, any NCR count that rose by more than 10%, and carbon against last month.`

**Turn 14 - Agent asks (RULED third question; mockup wording adapted):**
`The monthly run acts as you, Rachel Bowen, over the tables it declares - Monthly KPI returns and Insights. Is that everything it should touch? If you leave the project or lose the right to build, it stops, and the app shows as not working until someone at Trentmoor takes it over.`
Replies: `Yes - only these` · `Change it`. Rachel taps `Yes - only these`.
Receipt `✓ Step 6 · Analysis and prompts - runs as Rachel Bowen, on 2 tables`.

**Turn 15 - Agent (step 7):** `Ready to check and open.`
Step 7 card (BUILT read-back, `StepCheckAndOpen`), shown as an overlay or in the step column:
- `Supplier KPI returns - Monthly KPI returns from Trentmoor Energy's four suppliers, accepted by Trentmoor, with a dashboard and a monthly summary.`
- `Open to: Trentmoor Energy, Netherfold Cabling, Ashcombe Civils, Wrenfield Plant Hire, Wrenbrook Fencing & Reinstatement`
- `Tables: Monthly KPI returns (with an acceptance step), Insights`
- `Data connections described: 0`
- `Screens: Submit this month's KPIs, Supplier KPI dashboard - narrowed`
- `Runs: Every month`
- `Analysis prompt: written`
- `Opening it copies what you have built to the people the app is open to, and records who opened it and when. Until then only its builders can see any of this.`
- Primary `Check and open` (built label). Clip 4 used `Open to 5 organisations`; keep the built label.
After the click: header badge `Open as version 1`; line `Last opened as version 1 on 2 Jun 2026, 10:14 by Rachel Bowen.` (built format `formatDateTime`; render as `Jun 02, 2026, 10:14`, matching the library's US-order date).

#### B.6.4 The generated screens (blocks; preview and payoff)

Columns of `Monthly KPI returns` (key:label:type, the built syntax):
`month:Month:choice` (Jun 2026 ... Sep 2026; a choice so it groups in order) ·
`due:Deliveries due:number` · `on_time:Delivered on time:number` ·
`ncrs:NCRs:number` · `safety:Safety incidents:number` ·
`carbon:Carbon (tCO2e):number` · `local_spend:Local spend (£):number` ·
`notes:Notes:text`. Every row also carries the stamped organisation and person
(not a column).

**Screen A, `Submit this month's KPIs`** (open to everyone in scope):
```
heading   "September 2026 return"
rowForm   [month, due, on_time, ncrs, safety, carbon, local_spend, notes]  submitLabel "Submit to Trentmoor Energy"
heading   "Your returns"
rowTable  [month, due, on_time, ncrs, safety, carbon, local_spend]  showOrganisation false, showState true
```
**Screen B, `Supplier KPI dashboard`** (Trentmoor Energy only):
```
heading   "Supplier KPI dashboard"
total     on_time   "Delivered on time"
total     due       "Deliveries due"
total     carbon    "Carbon (tCO2e)"
count               "Returns"
barChart  "Delivered on time by month"      month / on_time
lineChart "Carbon by month, tCO2e"          month / carbon   showTrend true
pieChart  "Local spend by month"            month / local_spend
rowTable  [month, due, on_time, ncrs, safety, carbon]  showOrganisation true, showState true
```
That is buildable today. The **polished VISION** dashboard (the first film's
`Dashboard`, `ui/charts.tsx`) shows: tiles `On time · Sep 2026 = 93 of 102`,
`Carbon · since June = 630 tCO2e` (sub `4 months · accepted returns only`),
`Local spend · Sep 2026 = £272,000`; bar chart `On time by supplier · Sep 2026, %`
with a `Flags under 90% on time` warning badge and Ashcombe Civils' bar amber
(`#c4901f`) with `Under 90% on time`; line chart `Carbon by month, tCO2e`
171/163/154/142 with trend; donut `Local spend by supplier · Sep 2026` centre `£272k`;
the `Latest insight` card; table `All returns · September 2026`. Grouping by
supplier and percentages are beyond the grammar (D-6). Choose one register per
video and say which in the plan; recommendation: the polished dashboard
(brief: "really polished"), captioned nowhere as built.

**Preview during the build:** empty state (no rows yet): tiles `-` with sub
`no returns yet`, charts as axes with `#e0ded8` placeholder shapes at 40%, insight
slot `No runs yet`, table row `No returns yet` (clip 4 empty state; built strings
`Nothing entered yet.` for an empty table, `Nothing to draw yet.` for an empty chart).

### B.7 Beat 10: the two seats

Follows the **approved mockup** `docs/design/mockups/returns-app-two-seats.html`
(approved 2026-09-06, "these are perfect"), re-cast from sustainability returns
to supplier KPIs. RULED design over BUILT mechanics (rows read by entering
organisation + owner; drafts hidden from the owner; acceptance; reason on
rejection).

**Seat 1: Sam Kerridge, Netherfold Cabling** (`wrenfield.ts` `PEOPLE.SAM`;
rail chip `Netherfold Cabling - Supplier`; topbar `● Member`). Org line
`Netherfold Cabling All projects ▸`.
- Crumb: `Wrenfield–Ashcombe 400kV Connection · Tools / Supplier KPI returns`.
- H1 `Supplier KPI returns`; sub `Your organisation's monthly return to Trentmoor Energy. Save a draft as figures come in; submit when the month is complete. A submitted return is accepted or rejected by Trentmoor Energy - a rejected one is corrected by submitting it again.`
- Form card `September 2026 return`: Month `Sep 2026`, Deliveries due `28`, Delivered on time `27`, NCRs `2`, Safety incidents `0`, Carbon (tCO2e) `61`, Local spend (£) `84,200`, Notes `Drum delivery for section 4 slipped two days; recovered within the week.`; buttons `Save draft` · primary `Submit to Trentmoor Energy`; muted `Draft · saved 14:02`.
- Table `Your returns - Netherfold Cabling` (`4 returns · entered by Sam Kerridge`): Month · Due · On time · NCRs · Carbon · State:
  `Sep 2026 28 27 2 61 ● Submitted 1 Oct 2026` · `Aug 2026 26 25 2 64 ● Accepted 3 Sep 2026 · Rachel Bowen, Trentmoor Energy` · `Jul 2026 24 24 1 67 ● Accepted 4 Aug 2026 · Rachel Bowen` · `Jun 2026 22 21 1 70 ● Accepted 2 Jul 2026 · Rachel Bowen`.
- Info note (slate tint, `ⓘ`): `This app shows you what you could already see: Netherfold Cabling's own returns. Other suppliers' returns, the project totals and Trentmoor Energy's monthly summary are not part of it for you - not because the app hides them, but because every row is read by the organisation that entered it and by Trentmoor Energy, and by nobody else.`
  (Clip 4's short form: `You see your own returns. Nothing else.`)

**Seat 2: Rachel Bowen, Trentmoor Energy.**
- Crumb `... · Tools / Supplier KPI returns`; header buttons `Run the analysis now` · `Export...` · `Edit the app` · `● Owner`.
- H1 `Supplier KPI returns`; sub `Every supplier's monthly return, the project totals, and the latest analysis. Accept or reject each submitted return; an accepted return becomes Trentmoor Energy's record.`
- Tiles row (4 × sunken cards r10), as first seen: `September 2026` `4 of 4` `returns submitted` · `Awaiting your decision` `1` `Netherfold Cabling, September 2026` · `On time, September` `66 of 74` `accepted returns only` · `Carbon since June` `569 tCO2e` `accepted returns only · 15 rows`.
  After Rachel accepts Netherfold's return: `Awaiting your decision` `0`, `93 of 102`, `630 tCO2e` `accepted returns only · 16 rows`.
  (The mockup's variant with a missing return, `nothing yet from ...`, also
  works: a supplier's draft is invisible to the owner, so the tile reads
  "no return yet". See B.9 for the consistent state.)
- Charts row (VISION polish): bar, line, donut as B.6.4.
- `Latest insight` card (B.8).
- Table `Returns from every supplier` (sub `Showing September · 4 rows`): Month · Organisation (+ person muted) · Due · On time · NCRs · Carbon · State; the submitted row selected with `Accept` primary and `Reject` secondary.
- Inline confirm strip under the table: `Accept Netherfold Cabling's September 2026 return? Once accepted it becomes Trentmoor Energy's record: it cannot be edited or deleted in place, and a correction from Netherfold Cabling would arrive as a new row that supersedes this one. The decision is recorded in your name.` + `Accept` · `Reject - say why...` · `Cancel`.
  Reject path (BUILT): field `Why is it being rejected?`, hint `The organisation that submitted it reads this on the row. A rejection has to say why.`
- **Split composition @1920:** two shells at 0.5 scale side by side is too
  small; use two cropped content areas, each 930 × 900, at x 20 and x 970, seat
  labels above at y 40 (`Netherfold Cabling · Sam Kerridge` / `Trentmoor Energy · Rachel Bowen`).
  Caption: "Same app. Each organisation sees only what it could already see."

### B.8 Beat 11: the run, the insight, the template

- **Run (BUILT):** Rachel clicks `Run the analysis now` (built label; the
  scheduled run is RULED but not running, ADR-0056 §13d). A `Runs` card (BUILT):
  sub `What each run covered. The insight a run wrote is a row in the app's insight table, read by the organisation that ran it and the project owner - open that table to read it.`
  Table: Started · Trigger · Acted as · Rows covered · What happened · Against version →
  `Oct 01, 2026, 09:12` · `Run by hand` · `Rachel Bowen` · `16` · `Wrote one insight` · `1`.
- **Insight card (RULED design, mockup):** label `● Latest insight` (slate dot) ·
  meta `Run 1 Oct 2026, 09:12 · run by hand · acted as Rachel Bowen over 16 rows in Monthly KPI returns · version 1 · All runs →`
  Text (from `wrenfield.ts` `INSIGHT`, numbers computed in code, the model writes the sentences):
  `September's on-time delivery across four suppliers was 91%, down 3 points on August. Ashcombe Civils accounted for 6 of 9 late deliveries. Carbon fell 8% to 142 tCO2e. No supplier's NCR count rose by more than 10%.`
  If the video keeps "scheduled": meta `Run 1 Oct 2026, 02:00 · scheduled · ...` (VISION; schedule not honoured yet).
  The supplier seat shows **no insight** (ADR-0056 §3: stamped with the run's organisation, read by Trentmoor alone).
- **Export (BUILT, optional):** `Download as a spreadsheet`; card text `...carries a note of what data it came from and when - nothing else. The file is yours: edit it, transpose it, and put it through the normal review cycles.`; exports table `Taken · By · Data as of · Rows`. Never "made by AI".
- **Keep as a template (BUILT):** section `Keep it for the next project`:
  `Keep this app as a template on your firm's own shelf, in your workspace. The shape travels - the tables and their columns, whether each needs signing off, the screens, the schedule and the analysis prompt. No rows travel, whoever entered them and whichever table they are in, so what you keep carries nothing of this client into the next one. Keeping it again under the same name makes the next version, and changes nothing already deployed.`
  Field `Call the template` = `Supplier KPI returns`; button `Keep this as a template`; notice
  `Kept on your firm's shelf as "Supplier KPI returns", version 1. Its tables travelled empty.`
  (Rachel's firm is Trentmoor, so the shelf is Trentmoor's. If the story wants the
  consultancy's moat, cast Eleanor as builder on a later project instead; then the
  owner must share the table for her app to read every supplier's rows, ADR-0056 §6.)
  Workspace shelf (BUILT): `Your firm's templates`, badge `Org-private - the same on every project`, item note `Version 1 · 2 tables · Kept from Supplier KPI returns - Wrenfield–Ashcombe 400kV Connection · kept by Rachel Bowen on ...`.
  Deploy row (BUILT): `Or start from one of your firm's templates. It arrives as a new app of its own, with the same steps and empty tables - load your own lookup rows into it here. Nobody outside your firm can open it until you say so.` + `From a template...` + `Deploy it here`.

### B.9 Tools data (exact strings)

**Suppliers** (`wrenfield.ts` `ORGS`; invented; `.example` domains): Netherfold
Cabling (HV cable supply and pulling), Ashcombe Civils (trenching, haul roads,
the compound), Wrenfield Plant Hire (plant and welfare), Wrenbrook Fencing &
Reinstatement (fencing, drainage reinstatement). Contact: **Sam Kerridge**
(Netherfold, SK). Other contacts are not named in the data file; if needed,
invent obviously fictional names and add them to `wrenfield.ts` first.

**Returns** (`wrenfield.ts` `SUPPLIER_KPI`):

| Supplier | Month | Due | On time | NCRs | Safety | Carbon tCO2e | Local spend £ |
|---|---|---|---|---|---|---|---|
| Netherfold Cabling | Sep 2026 | 28 | 27 | 2 | 0 | 61 | 84,200 |
| Ashcombe Civils | Sep 2026 | 40 | 34 | 3 | 1 | 52 | 126,500 |
| Wrenfield Plant Hire | Sep 2026 | 22 | 21 | 1 | 0 | 21 | 38,900 |
| Wrenbrook Fencing & Reinstatement | Sep 2026 | 12 | 11 | 0 | 0 | 8 | 22,400 |
| Netherfold Cabling | Aug 2026 | 26 | 25 | 2 | 0 | 64 | 79,600 |
| Ashcombe Civils | Aug 2026 | 34 | 31 | 3 | 0 | 55 | - |
| Wrenfield Plant Hire | Aug 2026 | 17 | 16 | 1 | 0 | 25 | - |
| Wrenbrook Fencing & Reinstatement | Aug 2026 | 9 | 9 | 0 | 0 | 10 | - |
| Netherfold Cabling | Jul 2026 | 24 | 24 | 1 | 0 | 67 | 71,300 |
| Netherfold Cabling | Jun 2026 | 22 | 21 | 1 | 0 | 70 | 66,800 |

Derived (`KPI_DERIVED`): Sep on time 93 of 102 (91.2%); Aug 81 of 86 (94.2%);
late deliveries Sep 9 (Ashcombe Civils 6); carbon Jun 171 · Jul 163 · Aug 154 ·
Sep 142, total 630; per supplier Jun-Sep Netherfold 70/67/64/61 (262), Ashcombe
Civils 58/56/55/52, Wrenfield Plant Hire 31/29/25/21, Wrenbrook 12/11/10/8; on
time Sep (%) Netherfold 96 · Ashcombe Civils 85 (flagged) · Plant Hire 95 ·
Wrenbrook 92; local spend Sep £272,000. Insight "16 rows" = 4 suppliers × 4 months.
**Gaps to fill before building:** Jun/Jul rows for the three other suppliers
(carbon given per supplier; due/on-time/NCRs not given) and Aug local spend for
three suppliers. Fill them in `wrenfield.ts` once, so every screen agrees.

**Consistent payoff state (recommended):** every Jun-Aug row accepted;
September: Ashcombe Civils, Wrenfield Plant Hire, Wrenbrook accepted (1 Oct),
Netherfold **submitted** 1 Oct (the row Rachel accepts on camera). Then tiles
computed over accepted rows only show September `66 of 74` (carbon since June
`569 tCO2e`, 15 rows) until Rachel accepts, then `93 of 102` (`630 tCO2e`,
16 rows). The insight run happens after the acceptance, so it covers 16 rows. Animate that flip: it shows "totals count accepted
rows only" (D-5).

---

## C. Data summary (cross-reference)

- **Library documents, passages:** A.12.1.
- **Ask questions and cited answers:** A.12.2, A.12.3.
- **Ontology vocabulary:** facets and terms from `packages/db/src/ontology-seed.ts`:
  Discipline (ISO 19650): A Architectural · C Civil · S Structural · G Geotechnical ·
  D Drainage · M Mechanical · E Electrical · T Transport / Highways · V Environmental ·
  Z General / Multidiscipline. System (Uniclass Ss): Ss_15 Earthworks and remediation
  systems · Ss_20 Structural systems · Ss_25 Wall and barrier systems · Ss_30 Roof,
  floor and paving systems · Ss_37 Bridge and viaduct systems · Ss_50 Disposal and
  drainage systems · Ss_55 Piped supply systems · Ss_70 Electrical supply systems ·
  Ss_80 Transport systems. Document type: DR Drawing · MO Model · RP Report ·
  SP Specification · SH Schedule · CA Calculation · CE Certificate · CO Correspondence.
  Project stage: 0 Strategic definition · 1 Preparation and briefing · 2 Concept
  design · 3 Spatial coordination · 4 Technical design · 5 Manufacturing and
  construction · 6 Handover · 7 Use. Work package: ships empty (owner fills):
  propose `Land quality`, `Water environment`, `Ecology`, `Consultation`, `Cable route`.
  Edge labels: `Supersedes` · `References` · `Responds to` · `Is part of` · `Derived from`.
  Proposed classifications for the video: GIR-004 → G / Ss_15 / RP / 2 / Land quality;
  BAS-003 → V / - / RP / 2 / Land quality; FRA-001 → D / Ss_50 / RP / 2 / Water
  environment; SCC-002 → Z / - / RP / 2 / Consultation; SCP-001 → V / - / RP / 2 /
  Land quality; PEA-001 → V / - / RP / 2 / Ecology; MST-001 → V / Ss_15 / RP / 2 /
  Land quality. Proposed edges: MST-001 `derived from` GIR-004, BAS-003; MST-001
  `references` FRA-001, SCP-001; FRA-001 `references` GIR-004.
- **Checker strings:** B.3, B.4; style guide clauses §2.1, §2.4 (project), §4.7
  (firm), the accepted rule "Write in the active voice where the meaning allows it."
- **Creator strings:** B.5.
- **KPI data:** B.9; dashboard and insight strings from `wrenfield.ts`
  `DASHBOARD`, `INSIGHT`.
- **People:** Rachel Bowen (RB, Trentmoor Energy, Owner); Eleanor Price (EP,
  Calder & Hale, Member/Consultant); Sam Kerridge (SK, Netherfold Cabling,
  Member/Supplier; `wrenfield.ts` invention, not in the seed); Nadia Okonjo (NO,
  Redgate Ecology) only if a Redgate seat is needed.

---

## D. Contradictions, and which source wins

| # | Contradiction | Sources | Which wins, and what to do |
|---|---|---|---|
| D-1 | **Chat-led builder** vs "Declined: a chat that fills the steps in" | Brief 2026-10-05 and `demo/archive/2026-10-sizzle/BRIEF.md` vs ADR-0056 addendum ruling 6, `app-builder.tsx` header comment, mockup note | **Brief wins for the video** (owner reopening his own ruling; it is vision). Keep ruling 6's protections on screen: unskippable questions, every answer lands visibly in a step, the form is the record. Never caption it as built. |
| D-2 | Step titles: built `What the app is · The tables · Data connections · The interface · How often it runs · Analysis and prompts · Check and open` vs first film's `Who it's for · What gets collected · Where the numbers come from · What people see · When it runs · What it writes · Check and open` | `app-builder.tsx`, mockup vs `wrenfield.ts` `STEPS`, review-buyer §4 | **Built titles win** (brief: "UI follows the real app"). Use the plain words as narration, or as the built sub-lines already do. |
| D-3 | Three wall questions vs two computed | ADR-0056 §2b, mockup (three) vs `pendingBuilderQuestions` (two) | **ADR wins**: show all three; the third (run scope) uses the mockup's wording. |
| D-4 | Who opens the dashboard: clip 4 chose `Everyone - each sees only their own`; mockup chose `Trentmoor Energy only` | `video-04-kpi-app.md`, `wrenfield.ts` `KPI_APP.q2` vs `returns-app-two-seats.html` | Both are legal under §4. **Mockup wins** (approved drawing; brief: unbuilt parts follow the mockups). The supplier seat then shows the form + own returns, not a cut-down dashboard. |
| D-5 | Totals over accepted rows only vs built `total` summing every row the viewer received | Mockup note (wholesale-confirmed), inventory vs `app-screen.tsx` lines 83-94 | **Mockup/ruling wins for the video** ("accepted returns only" label). The built gap is real; do not imply otherwise in any "built" caption. |
| D-6 | KPI tiles, percentages, 90% flag, charts by supplier vs the 9-block grammar (sums, counts, group by a declared column; organisation is a stamp, not a column; totals render as text lines) | `wrenfield.ts` `DASHBOARD` vs `APP_SCREEN_BLOCK_KINDS`, `chartSeries` | **Grammar is the built truth; polish is VISION.** Acceptable in the video (blocks-versus-code is deferred to T-446), but never claim it is the built renderer. B.6.4 gives the buildable block list. |
| D-7 | "Scheduled" insight vs schedule not honoured | `wrenfield.ts` `INSIGHT.meta` vs ADR-0056 §13d, `Saved, but not running yet` | Prefer the **built** manual run `Run the analysis now` / `Run by hand`. If "scheduled" is kept, it is VISION. |
| D-8 | `Latest insight` card on the dashboard vs built runs list that never shows the insight's words (the insight is a row in the insight table) | Mockup vs `apps.tsx` Runs card | Mockup (approved design) wins for the dashboard; the built mechanics (insight = row, read by the run's organisation + owner) govern who sees it. |
| D-9 | **Playbook** (CONTEXT.md term, mockup "save as a playbook") vs built UI word **template** (`Your firm's templates`, `Keep this as a template`) | CONTEXT.md vs `playbooks.tsx` | On screen use the **built UI words** ("template"); "playbook" may appear in narration. Flag to the owner: CONTEXT.md is the vocabulary authority and the UI departs from it. |
| D-10 | Library page: "Superseded and withdrawn documents leave this list" vs CONTEXT.md/ADR-0013: a non-live document "stays in the library, stays readable" | `library.tsx` sub vs `CONTEXT.md` "Record state", user story VII | Built **screen copy** is what appears; the **semantics** follow the ADR (the record stays; only the AI's reach ends). Never say "archived" or "deleted". |
| D-11 | Design kit's `2 sources withheld - outside your organisation's access` vs the wall's access-before-retrieval (out-of-reach material is absent, never counted) | `.claude/skills/infora-design/components/core/WithheldNotice.prompt.md`, inventory §3.1 vs ADR-0020/0022, `t2-04-attach` prose, built Ask | **Built behaviour and ADRs win.** In Ask, show reach by the `▤ N sources` chip and different answers, never a withheld-sources count. "Withheld" in Ask means ground-check withheld **claims** (`N withheld` in the footer). |
| D-12 | Passage highlight and `p. 14 · §4.3 Groundwater` locator vs built source panel (whole text, no highlight; page only for PDFs; no section) | `wrenfield.ts` `GIR_LOCATOR` vs `source-panel.tsx`, `Locator` type, `v1.md` | Highlight + page = small VISION on BUILT data; **drop the section**. |
| D-13 | Live-ticking "What ran" rail vs built rail empty until the run reports (no streaming) | proposed vs `ask.tsx`, `progress-rail.tsx` | VISION for pacing; stage words are built. Streaming is "a later, additive change". |
| D-14 | Ask's built layout (nested panes: a pane-styled progress rail and a second topbar inside the main pane) vs the shell's "two layers, not three" rule | `ask.tsx`, `styles.css` 1259-1271, 1850 vs design-rules §C | Not photographed, so no fidelity anchor; **use the cleaned layout in A.7**, same components and copy. |
| D-15 | Deck "living ontology", "every new document starts from it" vs ADR-0045 (project ontology; explorer UI a later slice; agent proposals deferred; retrieval pre-filter deliberately unwired, Q-028) and Q-037 (never start the creator from the plan) | deck vs ADR-0045, `v1.md`, grill-history Q-037 | Deck language for captions; **ADR rules for what is shown**: derived, person-confirmed links; never cited; does not steer Ask today; new documents start from library sources, the project's rules and the firm's outlines, never from a plan row. |
| D-16 | Discipline in two vocabularies: plan `EEN` (naming scheme) vs ontology facet `V Environmental` | `03-plan-detail.png`, `26-library.png` vs `ontology-seed.ts`; `ontology-landscape.md` §9 | Keep each where it lives (`EEN` in plan/library tables, `V` in the ontology view). Do not put both on one card. |
| D-17 | Creator result: inventory "4 of 4 sections written · 2 of 2 sources used" vs screenshot "3 of 4 · 1 of 2" | inventory §2.1 vs `t1-12-result.png` | **Screenshot is the real run.** Either is an honest outcome; the video may show the clean one, since it is a different run. |
| D-18 | Screenshot binds `WA-ENV-BAS-003` + `WA-CON-SCC-002` for a land contamination section | `t1-07-sources.png` | Odd for an expert eye; the video binds `WA-GEO-GIR-004` + `WA-ENV-BAS-003`. |
| D-19 | Style guide size: creator `3 clauses` vs checker `style guide 2 of 2 clauses`, `5 of 5 accepted rules` | `t1-03` vs `t2-05`, `t2-06-run` | Seed drifted between captures. Pick one set for the video (B.3 uses 3 of 3 clauses, 5 of 5 rules). |
| D-20 | Checker notice says `(ADR-0022)` and has a left accent bar | `t2-05-plan.png` vs owner register rule (no internal shorthand) and design rule (no left accent bars) | Avoid the attachment in the video; if shown, drop "(ADR-0022)" and the bar. |
| D-21 | Fourth supplier name: `Brookside Fencing & Reinstatement` vs `Wrenbrook Fencing & Reinstatement` | `product-inventory.md` §5.5 vs `wrenfield.ts` | **`wrenfield.ts` wins** (it is what the first film rendered). |
| D-22 | Built UI uses em dashes; deck rule says hyphens in on-screen copy | `apps/web` strings vs `deck-source.md`, BRIEF | **Brief wins for the videos**: hyphens on screen (this file already applies it); the project name keeps its en dash. |
| D-23 | Mockup draws agent turns in a sunken block; design rule says the agent never gets a bubble | mockup vs `ChatBubble.prompt.md` | **Design rule wins**: agent output is plain content under an `AGENT` label. |
| D-24 | Builder entry: ADR-0056 §13e "a fourth tool on" Tools vs built Apps card below the tool grid (T-440 deliberately not a tile) | ADR vs `tools.tsx` 118-123 | Either; built placement for fidelity, a tile is acceptable vision. |
| D-25 | Owner can see Redgate's PEA vs "owner sees only what is shared/submitted" | seed note vs inventory claim 4 | Both true: PEA is a **library** deliverable and the library is Trentmoor's. Fine to show in Rachel's answer; Redgate's **sandbox** notes stay invisible to everyone else. |
| D-26 | `workspace-redesign.dc.html` | mockups README: "Status unresolved - needs a decision ... Do not treat it as a spec" | **Do not use.** (It also does not render: missing `support.js`.) |
| D-27 | `26-library.png` shows WA-EIA-MST-001 `C01` with suitability `S2` | screenshot vs the story (accepted A1) | Video shows `A1`. |
| D-28 | `30-context-state.png` shows WA-EIA-MST-001 **withdrawn** | end of the journey | In the context video MST-001 is live; use the badge on another row, or `- superseded`. |
| D-29 | First film showed the dashboard to Netherfold with its own figures | clip 4 | Superseded here by D-4 choice; if the producer prefers clip 4's version, it is still faithful to §4, but drop the insight from the supplier seat (as clip 4 did). |
| D-30 | Lens picker uses `◑`; design rule says `✦` is the only typographic mark for Ask/agent | `lens-picker.tsx` vs skill readme | Built wins (it is in the product). |
| D-31 | Composer chips include `⚙ Tools`, `◱ Context · N tokens`, and six disabled placeholders | `ask.tsx`, `composer-chips.tsx`, `composer-sources.tsx` | Built, but jargon/unbuilt: show Lens, Data sources and From the library only. |
| D-32 | Inventory says Ask is "not photographed" (true) and source panel "showing the source as a document with its state badged" | inventory §2.2 vs code | Agreed; code details in A.7-A.9 supersede the inventory's summary. |
