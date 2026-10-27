# W4 Tools: the shot plan (revision 2)

Written 2026-10-05 by the W4 director, to `plan/master-plan.md` (the spec),
`research/flows-context-tools.md` part B (screen copy and the KPI data) and
`research/benchmark-walkthroughs.md`. Revised the same day against
`review/review-accuracy.md` and `review/review-viewer.md` and the producer's
rulings (the revision log is at the end). Composition id `W4-tools`. Source
goes in `demo/studio/src/walkthroughs/w4/`.

**In plain words.** This video shows Infora's tools as one person's working
morning, then one app's life.

- **The QA check.** Eleanor Price at Calder & Hale runs the QA checker on a
  draft. She sees what it will do before it runs, then deals with what it
  finds: one bulk fix for a wording rule, and one finding she reads on its own
  because it cites the ground investigation.
- **A saved workflow.** She runs the document creator from her firm's own
  outline and gets a four-section document. This is kept short, because the
  context video shows the same tool.
- **The build, the centre of the video.** In June, Rachel Bowen at Trentmoor
  Energy builds the supplier KPI app by talking to the builder's agent. The
  agent fills in the steps and stops for every question that decides who sees
  what. Who may open each of the two screens is asked separately. The camera
  pushes in so the live preview and the flag can be read.
- **The app in use.** In October, a supplier submits September's return.
  Rachel accepts it, and the camera holds on the totals as they move, under the
  caption "Totals count accepted returns only". She runs the month's analysis
  and keeps the app as a playbook.

The video runs 129.7 s, under the 130 s ceiling.

Contents: 1 purpose and workflow · 2 frame budget and chapters · 3 screens
(exact layout and copy) · 4 shot table · 5 captions · 6 camera shares ·
7 narration · 8 components and data (**8.2 is the lead's pre-build list**) ·
9 vision, rulings and deviations · 10 self-check · 11 revision log.

All coordinates are **native** (the 1536×864 plate, or 752×832 in split)
unless marked *scr* (1920×1080 screen px). The Wide mapping is
`scr = (120 + x·1.09375, 24 + y·1.09375)`. The split left window is
`scr = (120 + x·1.09375, 60 + y·1.09375)`, and the right window has `x0 = 978`.
Work cameras use master §2.6's formula. The click points are my targets. The
builder **snaps each point to its control's rendered rect** (anchor id given in
brackets) through `useAppPoint`.

**Cursor idle rule as applied.** Master §2.10 fades the cursor after more than
3 s idle and brings it back 10 f before its next move. When the next move is
due within 12 f of the fade point, the cursor stays visible instead of
blinking out and in. Each shot below says which applies.

---

## 1. Purpose and the workflow, end to end

**Purpose.** The pillar is Tools. The video has to prove three things on
screen, in this order:

1. **Infora's own tools are controlled.** You see the plan before anything is
   spent. Findings are marks in the draft. Only the mechanical fix is
   bulk-accepted. A finding about the record is read and accepted on its own,
   with its source.
2. **A firm's know-how runs as a workflow.** The creator starts from Calder &
   Hale's own saved outline, the sources are chosen before drafting, and
   coverage comes back as numbers.
3. **Anyone can build an app by talking to an agent, and the wall still
   holds.** The agent drives the seven built steps from the chat, and every
   answer lands visibly in a step. Every question that decides who sees what
   is asked and waits for Rachel: contractual data, who may open **each**
   screen, and what the run may touch. The app then works across two firms. The
   supplier sees only its own rows, and the client's totals count accepted
   rows only.

**The workflow, beat by beat.**

1. **QA check (Eleanor, Mon Oct 05, 09:40 AM).**
   - Tools → `QA checker`. She picks `Land Quality method statement — Ashcombe
     Lane working copy`; `Full check` has five checks ticked.
   - She scrolls, clicks `See the plan` and reads `Covers: 6 sections · 5 checks
     · …`.
   - She clicks `Run the check`. Two steps tick, then `5 findings, anchored in
     the draft.`, and she clicks `Open the draft to work through them`.
2. **Findings.**
   - She clicks `Accept 1 mechanical correction`. `the routewide works` becomes
     `the scheme` as a tracked change, which then settles.
   - The panel scrolls to `Accuracy (1)`, `● Required`, which cites
     `WA-GEO-GIR-004`. She hovers the pill and the passage holds for 100 f.
   - She clicks `Accept`, and the panel reads `3 open findings, 2 resolved.`
3. **Workflow (Eleanor, 10:05 AM).**
   - The creator opens with the basics set, the work package `Land quality`
     among them. She clicks `Land quality technical note` (`Your firm`), and
     three section cards fill (four sections, counting the sub-section).
   - After a skip, the brief is written and the related sources are ticked
     under `RELATED IN THE PROJECT ONTOLOGY` (drawn as in W2).
   - `See the plan` → `Covers: 4 sections · 2 bound sources · 1 drafting pass`
     → `Accept the plan and create the document` → `Covered: 4 of 4 sections
     written · 2 of 2 bound sources used · 1 drafting pass`.
4. **Build (Rachel, June; the caption says so).**
   - On Trentmoor's Tools page she types a 91-character prompt into the `New
     app` composer, and the builder opens. The agent names, scopes and drafts
     the table (steps 1–2).
   - It asks the built contractual question. The built answer chips show, and
     Rachel types her own answer.
   - The agent adds the acceptance step, needs no connections (step 3), and
     writes two screens (step 4). **The camera pushes in on the preview filling
     in.**
   - It asks who may open `Submit this month’s KPIs`, and she taps `Everyone the
     app is open to`. It asks who may open `Supplier KPI dashboard`, and she
     taps `Trentmoor Energy`.
   - She types the 90% flag change. **The camera pushes in on the flag line.**
   - The agent sets the schedule and the analysis (steps 5–6), then asks what
     the run may touch, and she taps `Yes — only these`.
   - Read-back → `Check and open` → `Open as version 1`.
5. **Two seats (Mon Oct 05, 11:02–11:20 AM).**
   - Split. Sam Kerridge (Netherfold Cabling) clicks `Submit to Trentmoor
     Energy`. On Rachel's side, the row appears `● Submitted` and `Awaiting your
     decision` reads `1`.
   - Out of the split, Rachel clicks `Accept`. The camera moves to Work on the
     tiles, the row and the confirm strip. She accepts.
   - Over 30 f, the tiles count `66 of 74` → `93 of 102` and `569` → `630
     tCO2e`. The camera holds, then returns to Wide on the updated charts.
6. **Insight (11:24 AM).**
   - `Run the analysis now` → `Working…` → the `Latest insight` card writes the
     month's four sentences.
   - `Keep this as a playbook` → the notice. The page then scrolls back to the
     end state.

**Never on screen:**
- a run's internals in Rachel's seat;
- Sam seeing totals or another supplier's row;
- Rachel seeing a supplier's draft;
- Eleanor seeing the KPI app;
- "approved", "verified" or "template";
- a bulk accept of a rewrite;
- a chat that settles an access question without asking.

---

## 2. Frame budget and chapters

30 fps, 1920×1080, silent. Video-local frames, inclusive.

| Segment | Frames | Length | vs master target |
|---|---|---|---|
| Opening title | 0–89 | 3.0 s | `PILLAR 04` · `Tools` · scenario line |
| End-state glimpse | 90–194 | 3.5 s | S8 state **E**, frozen |
| Glimpse → start | 195–206 | 0.4 s | content crossfade to S1 |
| **Ch 1 · QA check** | **207–611** | **13.5 s** (405 f) | 16 s, −2.5 |
| **Ch 2 · Findings** | **612–981** | **12.3 s** (370 f) | 14 s, −1.7 |
| **Ch 3 · Workflow** | **982–1362** | **12.7 s** (381 f) | 16 s, −3.3 |
| **Ch 4 · Build** | **1363–2845** | **49.4 s** (1,483 f) | 32 s, **+17.4 (producer-approved)** |
| **Ch 5 · Two seats** | **2846–3277** | **14.4 s** (432 f) | 14 s, +0.4 |
| **Ch 6 · Insight** | **3278–3650** | **12.4 s** (373 f) | 12 s, +0.4 |
| Close | 3651–3800 | 5.0 s | Wide on S8 state E |
| Logo | 3801–3890 | 3.0 s | wordmark |
| **Total** | **0–3890** | **3,891 f = 129.7 s** | ≤ 130 s hard ✓ (9 f spare) |

Chapters: 405 + 370 + 381 + 1,483 + 432 + 373 = **3,444**. 447 + 3,444 =
**3,891**.

**Chapter bar names:** `1 QA check` · `2 Findings` · `3 Workflow` · `4 Build` ·
`5 Two seats` · `6 Insight`.

**Where Build's time comes from.** The Build chapter grew by 193 f over
revision 1, for the second access question (+82), the two preview pushes
(+222) and the built Q2a text, less the shorter prompt (−61). It is funded by:

- the shorter prompt;
- the compressed creator run (−99);
- chapter 1's result hold (−15);
- small trims to non-action holds in chapters 2, 5 and 6.

The camera rule "at most one move per 3 s" sets each push's hold at 69 f (the
move starts are 90 f apart).

---

## 3. Screens: exact layout and copy

Shell, seats and topbar are master §3, unchanged. Built em dashes stay in UI
copy, and curly apostrophes and quotes are as built (`’`, `“ ”`).

### S1 · Tools page, Eleanor (Oct 05) · BUILT `t1-01-tools` + BUILT-NP `apps.tsx` 105–117

- Seat: Eleanor (`EP`, `Calder & Hale` · `All projects ▸`, chip `Calder & Hale —
  Consultant`, badge `● Member`). Rail `Tools` active (row n=8, centre y 497).
- H1 `Tools` (cap top y 100, x 342). Sub y 153: `Infora’s standard tools.
  Each runs a codified workflow — the same inputs produce the same steps, in
  the same order, every time.`
- Tool cards y 176–288: `Document creator` x 342–685, `QA checker` x 698–1041
  (anchor `tool-qa`, centre **(870, 232)**). Copy as `t1-01`.
- Micro label `APPS BUILT FOR THIS PROJECT` y 316. Sunken card y 332–420: sub
  (2 lines, y 348–380) `Apps a firm has had built inside this scheme — a form to
  fill in, a register, a dashboard. Every row somebody types in one remembers
  which organisation and which person entered it, and is read by that
  organisation and by the project owner, and by nobody else.`, then `No apps
  yet.` (y 398). No `New app` field. Eleanor's firm isn't in the KPI app's
  scope, and the built list renders the field only for a permitted builder.

### S2 · QA checker, Eleanor · BUILT `t2-02`, `t2-05`, `t2-06-progress`, `t2-06-run` · DEV numbers (flows D-19)

Page coordinates are *page y*: native y = page y − scroll. x = screenshot x + 48.

| Region | Page y | Content (exact) |
|---|---|---|
| H1 + sub | 92–180 | `QA checker` · `Read a draft against the writing rules that bind it and the project record it rests on. You see the plan, and what it will cover, before anything is spent.` |
| Card `Which draft` | 183–287 | Select x 358–1136, y 217–249 (anchor `qa-draft`, centre **(747, 233)**). Initially `Choose a draft…` (muted). Dropdown (fade 4 f) rows: y 268 `Land Quality method statement — Ashcombe Lane working copy` (anchor `qa-draft-opt1`, target **(600, 268)**) and y 296 `Land Quality scoping method statement — working draft`. Hint `A check covers one document. Its findings are marks in that draft, not a report about several.` |
| Card `Which checks to run` | 299–1358 | Sub as `t2-02`. Segmented `Full check` (selected, white thumb) / `Quick check`. Full-check note as `t2-02`. **All five ticked** (the Full check preset; DEV vs `t2-06`, where an older capture had consistency unticked): `House style` with `Rules this check will apply` (`Wrenfield–Ashcombe Project Style Guide 3 clauses` / `Your firm’s own manual, where the project’s guides are silent.` / muted note), `Accuracy` with `How hard to look` = `Statement by statement (slower, catches buried figures)`, `What it checks against`, search `Search by title or reference…` + `6 documents`, and six rows (ref + description, flows A.12.1, plus `WA-EIA-MST-001 EIA Scoping Method Statement — Land Quality`), `Internal consistency`, `Readability ● No AI`, `Completeness ● No AI` (descriptions as flows B.3). |
| Card `Attach a document` | 1370–1596 | Copy as `t2-05`. Search + `1 document`. One row **unticked**: `Land Quality scoping method statement — working draft`. `Upload a file…` + hint. |
| `See the plan` | 1608–1640 | Primary, x 342–453 (anchor `qa-see-plan`). |
| Card `The plan` | 1652–1952 | `This is what will run, step by step, in the order it will happen. Change an answer above to change it — the steps are not editable, which is what makes the run repeatable.` · `One pass over the whole draft — one reader sees everything, so the consistency check comes free.` · `1 Read the whole draft against 2 writing rules and the project record` · `2 Score the draft for readability and check it for gaps and placeholders` · **`Covers:`** `6 sections · 5 checks · the whole library, searched once per section · 5 of 5 accepted rules applied (5 all) · style guide 3 of 3 clauses` (2 lines, y 1846–1876). **No attachment notice.** `Run the check` primary x 358–481, y 1890–1922 (anchor `qa-run`). |
| Card `Running the check` (replaces The plan while running) | 1652–1786 | `0 of 2 steps finished.` → `1 of 2 steps finished.` → done. Step circles: running = ink outline + bold label (`t2-06-progress`). |
| After the run | | The plan card returns (as `t2-06-run`, `See the plan` enabled). Card `What was checked` page y 1964–2080: **`Covered:`** `6 of 6 sections read · 5 checks · 5 passages of the record read · 5 of 5 accepted rules applied · style guide 3 of 3 clauses` / `5 findings, anchored in the draft.` / link `Open the draft to work through them` (anchor `qa-open-draft`; at scroll 1320, centre **(470, 730)**). |

Scroll keys: 0 → 600 → 1200 → 1320.

### S3 · Editor with findings, Eleanor · BUILT `t2-07`, `t2-10`, `t2-12` · VISION accuracy group (flows B.4) · DEV reflow

- **Rail: no item is lit** (`nav: null`), as in the built editor (`t2-07`; review must-fix 5).
- **Why this copy still has the error.** It's an older working copy from before W1's accepted text, which reads `in three trial pits at Wrenfield Sidings` (cross-video fix, W1). That's what the checker catches.
- Second bar (y 68–120): chip `Calder & Hale — project sandbox` (x 244–460) `/`
  **`Land Quality method statement — Ashcombe Lane working copy`**. Right:
  `Freeze` (x 1264–1328) · `● No document controls` (x 1352–1502). Not bound, so
  no `Promote`.
- Canvas pane x 228–1156, y 132–852. Format bar y 191 (`B I | H2 H3 | • List
  1. List ❝ Quote | 💬 Comment ✓ Check`, `Write | Preview` right). Prose column
  x 324–964, Source Serif 4 15.5/1.72. **DEV:** paragraphs reflowed (the
  capture's hard breaks after "ground", "the", "and a", "Sources" are a seed
  artefact). Text:
  - `EIA Scoping Method Statement - Land Quality` (dashed advisory mark, the
    Readability finding's section anchor) / `Routewide, Wrenfield-Ashcombe 400kV
    Connection`
  - `1. Purpose and scope` / `This method statement sets out the approach to
    scoping the Land Quality chapter of the Environmental Impact Assessment for
    ⟦the routewide works⟧. It draws on the accepted ground investigation and
    contamination records held in the project library and identifies the
    assessment framework for land contamination, soils and geology along the
    route corridor.` (⟦⟧ = dashed advisory mark, §2.1)
  - `2. Baseline sources` / `The desk study draws on the Phase 2 Ground
    Investigation Report (WA-GEO-GIR-004), the Environmental Baseline Report
    (WA-ENV-BAS-003) and the Flood Risk Assessment (WA-WAT-FRA-001). The GIR
    records ⟪PAH exceedances⟫ ⟪at three trial pits south of the Wrenfield
    substation⟫ and a perched water table within the made ground west of
    Ashcombe Lane.` (⟪⟫ = solid required marks: the first is §2.4, the second the
    Accuracy finding, 2 px apart)
  - `3. Conceptual site model` / `⟦A conceptual site model has been prepared for
    each land parcel crossed by the route.⟧ Sources considered include
    historic landfill, agricultural fuel storage and made ground associated
    with the former works. Pathways assessed are direct contact, leaching to
    controlled waters and ground gas migration. Receptors are construction
    workers, future maintenance staff, adjacent residents and the underlying
    secondary aquifer.` (passive-voice mark)
  - `4. Assessment methodology` / `Significance will be assessed following the
    Land Contamination Risk Management (LCRM) framework. Where the preliminary
    risk assessment identifies a potentially unacceptable risk, …` (no mark;
    the hedge finding is replaced, master §4.8)
- Side panel x 1164–1512 (content x 1182–1494). Tabs y 165: `Chat` · `Comments`
  · **`Checks (5)`** (active) · `3 pending in the document` (3 lines).
  Panel *page y* (panel scrolls):

| Panel y | Element |
|---|---|
| 225–256 | `5 open findings. Each one points into the draft — click it to go there.` |
| 280–305 | `⌄ House style (3)` + `Dismiss all` (x 1398–1492) |
| 317–348 | **`Accept 1 mechanical correction`** primary x 1182–1412 (anchor `fx-mech`, centre **(1297, 332)**) |
| 355–382 | `The same substitution, applied consistently — one decision, 1 place.` |
| 392–624 | Card 1 `● Advisory` `Go to it` · `This project’s rules use “the scheme”, not “the routewide works”.` · sunken quote `§2.1 (project style guide)` / *“Refer to the works as “the scheme”, in lower case, throughout. Do not capitalise it as a proper noun.”* · mono `routewide works → scheme, 1 place` · `Accept` `Edit` `Dismiss` |
| 636–662 | `The rest are rewritten wording, so they are read one at a time.` |
| 672–952 | Card 2 `● Advisory` passive voice (as `t2-10`), blockquote `Calder & Hale has prepared a conceptual site model for each land parcel the route crosses.` |
| 963–1187 | Card 3 `● Required` · `The exceedances are reported with no concentration and no unit, so the result cannot be checked.` · `§2.4 (project style guide)` *“State every quantitative result with its unit and its source. A figure without a unit is not a result.”* · `Dismiss` |
| 1205–1230 | `⌄ Accuracy (1)` + `Dismiss all` |
| 1240–1504 | **Card 4 (VISION copy, BUILT rendering)** `● Required` `Go to it` (y 1262) · `The record puts these PAH hotspots at Wrenfield Sidings, not south of the Wrenfield substation.` (2 lines, 1290–1320) · library SourceChip **`WA-GEO-GIR-004`** (y 1334–1356, x 1182–1290, anchor `fx-acc-pill`) · `Suggested wording — the same substitution applied everywhere does not produce this proposal:` (1370–1414) · blockquote `in three trial pits at Wrenfield Sidings` (1424–1444) · `Accept` (x 1196–1268, y 1458–1490, anchor `fx-acc-accept`) `Edit` `Dismiss` |
| 1515–1700 | `⌄ Readability (1)` · Card 5 `● Advisory` · `This section reads at about grade 15.5, against the project’s target of 14 and a median of 12.3 across the rest of the draft. It is denser than the …` |

- **After the mechanical accept:** in the canvas `the routewide works` shows
  as tracked: `routewide works` struck (danger text, line-through) plus
  `scheme` inserted (success tint and underline) for 45 f. It then settles to
  plain `the scheme` (8 f), as `t2-12`. Card 1, the primary button and its
  sub-line fade (5 f), and the list closes up over 12 f (everything below moves
  up **319 px**). The counter reads `4 open findings, 1 resolved. Each one
  points into the draft — click it to go there.`, the tabs `Checks (4)` and
  `2 pending in the document`, and the group `House style (2)`.
- **Hover card (VISION small):** anchored above-left of the pill at x 860–1180,
  y 270–390 in the native viewport (panel scrolled 600). It holds
  `WA-GEO-GIR-004 · v2` `● Live`, then the trimmed quote (21 words, verbatim
  fragments): *“Intrusive investigation across the Wrenfield Sidings compound …
  recorded in three of eleven trial pits (WS-TP03, WS-TP07, WS-TP09)”*, with the
  locator `Cited passage · page 14`. It stays up for 100 f.
- **After the accuracy accept:** the span `at three trial pits south of the
  Wrenfield substation` is replaced by `in three trial pits at Wrenfield
  Sidings`, tracked for 30 f and then settled (8 f). The sentence now reads `The
  GIR records PAH exceedances in three trial pits at Wrenfield Sidings and a
  perched water table …`. Card 4 and its group header fade, and the list closes
  up. Counter `3 open findings, 2 resolved. Each one points into the draft —
  click it to go there.`, tabs `Checks (3)` and `1 pending in the document`.
  The footer note (BUILT) appears at the list's foot: `2 findings have been
  resolved. Resolved is resolved either way — the promotion gate counts what
  is still open, not how it was cleared.`

### S4 · Document creator, Eleanor · BUILT `t1-02`…`t1-12` · VISION work-package field and grouped sources (flows A.11 route 2), **drawn exactly as W2 §4.6**

Page coordinates are *page y*: native y = page y − scroll. x = screenshot x + 48.

| Region | Page y | Content (exact) |
|---|---|---|
| H1 + sub | 92–200 | `Document creator` · sub as `t1-02` |
| Card `What this document is` | 204–634 | `What kind of document is this?` `Technical note` (hint `A short, self-contained answer to one technical question from the record.`) · `What language should it be written in?` `Technical` (hint `Full technical vocabulary, for a reader in the discipline.`) · `Which style guides apply?` **`☑ Wrenfield–Ashcombe Project Style Guide`** `3 clauses` · `Is this a whole document, a chapter or a section?` `Whole document` (hint `Stands alone, and introduces its own subject.`) · **VISION** label y 552 `Which work package is it part of?`, select x 358–1136 y 563–595 = **`Land quality`**, hint y 609 `From the project's classification. Library documents in the same work package are suggested as sources below.` |
| Card `The outline` | 648–1433 | Intro as `t1-02`. Row `Start from:` y 764: `Assessment chapter section` (x 437–600) · `Technical note` (x 680–764) · **`Land quality technical note`** (x 796–968, anchor `cr-firm-outline`, **(882, 764)**) + neutral badge `Your firm` (x 976–1040) · ` — every section it adds stays yours to edit or remove.` (wraps). Before the click: `No sections yet. Add the first one, or start from an outline above.` / `+ Add a section`. After the click: three section cards, four sections in all (as `t1-05`): `1 The test` / `The statutory test this section answers, in one paragraph, and where in the record it comes from.` (791–946) · `2 Baseline` / `Describe the baseline as the record establishes it, with its survey dates and its limitations where they are stated.` + sub-section `2.1 Survey dates and limitations` / `When each survey was carried out, and what the record says it did not cover.` (960–1219) · `3 Effect` / `Describe the effect on the receptor, its magnitude and its duration, as the record describes them.` (1233–1388) · footer `+ Add a section` · `⊕ Save this outline for your firm` (1414). |
| Card `The brief, and where it goes` | 1445–1735 | `What is this document for?` = `A technical note on land contamination at the Ashcombe Lane parcels: the test it answers, the baseline as the ground investigation records it, the effect on the parcels and the mitigation the record already commits to.` · `Title` = `Land contamination — Ashcombe Lane parcels` · `Where it goes` = `Calder & Hale — working area` |
| Card `Sources this draft may use` | 1749–2221 | At scroll 1630 it sits at native 119–591, **with W2's rows and offsets**: card title y 145 · **VISION** micro `RELATED IN THE PROJECT ONTOLOGY` y 171 · **☑** `WA-GEO-GIR-004` + chip `Same work package` y 197 (desc 2 lines) · **☑** `WA-ENV-BAS-003` + chip `Derived-from source of WA-EIA-MST-001` y 275 · ☐ `WA-EIA-SCP-001` + chip `Sets the land quality scope` y 329 · **VISION** micro `OTHER LIBRARY DOCUMENTS` y 387 · ☐ `WA-CON-SCC-002` y 413 · ☐ `WA-WAT-FRA-001` y 467 (2 lines) · ☐ `WA-EIA-MST-001` y 539. Reason chips: 11.5 px, `#efeeeb`, 1px `#ececea`, r999, 8 px after the ref. Descriptions are `WT_LIB.*.description`. No PEA row. The chip wording follows W2's final text: if W2 adopts the viewer's `A source of the accepted method statement`, W4 uses it too (one shared data value). |
| `See the plan` | 2241–2273 | Primary x 342–453 (anchor `cr-see-plan`; at scroll 1630, **(397, 627)**) |
| Card `The document this will write` | 2285–3220 | Overview `A technical note on land contamination at the Ashcombe Lane parcels: … It will be written as a technical note, whole document, in Technical register, in 4 sections, drawing on 2 bound sources. It follows 1 project style guide.` Then four section blocks (`The test`, `Baseline`, `Survey dates and limitations` indented, `Effect`), each with `Ask the agent` and `<purpose> Written in Technical register, from the 2 bound sources only — anything the record does not support is left out.` Then `Correct any description above and the plan redraws. Every other answer stays as it is.` / `And this is what will run. The steps are computed from the answers above and are not editable, which is what makes the run repeatable.` / `· Draft 4 sections — The test, Baseline, Survey dates and limitations, Effect — from the 2 bound sources` / **`Covers:`** `4 sections · 2 bound sources · 1 drafting pass` (y 3066) / `Written as a technical note, whole document, in Technical register.` / `Written to 1 project style guide. Where a style guide and the language you chose disagree, the guide wins on terms and vocabulary and your language answer wins on register.` / primary **`Accept the plan and create the document`** (3160–3188, x 358–614, anchor `cr-accept`; at scroll 2500, **(486, 674)**) |
| Result card | 3218–3306 | `Working…` (shimmer, 45 f), then **`What was made`** / **`Covered:`** `4 of 4 sections written · 2 of 2 bound sources used · 1 drafting pass` / `Open the document`. At scroll 2500 it sits at native 718–806. |

Scroll keys: 0 → 600 → (crossfade) 1630 → 2130 → 2500.

### S5 · Tools page, Rachel (June; date never shown) · BUILT `t1-01` + VISION composer

- Seat: Rachel (`RB`, `Trentmoor Energy All projects ▸` run together, chip
  `Trentmoor Energy — Owner`, badge `● Owner`). Rail `Tools` active.
- H1, sub and the two tool cards as S1.
- `APPS BUILT FOR THIS PROJECT` y 316. Sunken card y 332–530: built sub (as S1),
  `No apps yet.` (y 398), then **VISION:** label `New app` (y 422), and in place of
  the built name field + `Create`, a white composer x 358–1110, y 438–514
  (r12, 1px `#e0ded8`, popout shadow): `✦` at x 374, placeholder `Describe the
  app you want…` (14.5 px, muted), send button 30 px round ink at (1076, 494).
  Anchor `apps-compose`, click target **(520, 470)**. Typed text wraps to 2
  lines inside x 396–1056. The deploy-from-playbook row is omitted: Trentmoor
  has none yet.

### S6 · The builder, chat-led · VISION layout (flows B.6.2) over BUILT steps, questions, answer labels and read-back · RULED third question

**Frame.** Rachel's shell, rail `Tools` active. Topbar (y 12–68): pill
`Wrenfield–Ashcombe 400kV Connection` (x 244–516) · muted `Tools / App builder
/` (x 524–676) · bold `Supplier KPI returns` (x 680–826). Right: neutral pill
`● Draft — not yet open to anyone` (x 1210–1414) → success `● Open as version 1`
(2826, `ui` 5 f), then `● Owner` (x 1426–1500).

**Three zones** inside the main pane (y 80–840):

| Zone | Rect (x, y, w, h) | Contents |
|---|---|---|
| Conversation (hero, no fill) | 232, 80, 600, 760 | Header y 84–116: `The builder’s agent` (14 px, 700) at x 248; right `● Step n of 7` (12.5 px muted) ending x 816. Hairline y 120. Thread x 248–816, y 132–744. Composer x 248–816, y 756–836: sunken `#efeeeb`, r12, popout shadow, `✦` x 266, placeholder `Ask the agent, or tell it what to change…`, input centre **(500, 796)** (anchor `bld-compose`), send 30 px at (787, 796). |
| The steps | 848, 80, 280, 760 | Sunken card r10. Micro `THE STEPS` y 100, x 864. |
| Preview | 1144, 80, 364, 760 | White card r10, 1px `#ececea`, popout shadow. Micro `PREVIEW` y 100 + muted `as Rachel Bowen, Trentmoor Energy` y 116. Segmented y 136–164: `Supplier KPI dashboard` (selected) / `Submit this month’s KPIs`. Body y 176–828. |

**Thread styling.**
- User turns: a right-aligned bubble (max 443 wide, sunken, r12, popout
  shadow, 12/15 padding, 14.5/21 text) under the micro label `RACHEL BOWEN`.
- Agent turns: micro `AGENT`, then plain text with no bubble (15/23).
- Quick replies: secondary pills (white, 1px `#e0ded8`, r999, 14 px, 28 tall,
  8 gap). They wrap to a second row when they don't fit in 568 px.
- Receipts: one line, 13.5 px muted, `✓` in success, `Step n` bold.
- Gaps: 16 after a user turn, 12 after agent text, 16 after a receipt.
- **Scroll rule:** top-anchored until content passes y 744, then
  bottom-anchored (the newest content's bottom at 744). Turn heights grow as
  they stream (v04 `chat.tsx` mechanics). Overflow begins at A3 (1997), so
  every reply row from Q2a on sits with its centre at y 729.

**The turns** (exact text and built punctuation). A = agent, streamed at
3 c/f; U = Rachel.

| Id | Kind | Text | Chars | Frames |
|---|---|---|---|---|
| P | U, typed in S5 | `Monthly KPI returns from our four suppliers - deliveries, NCRs, safety, carbon, local spend` (a typed hyphen, as people type) | 91 | 1409–1591 |
| W | A | `Working…` (shimmer) | — | 1601–1645 |
| A1 | A | `Done — Supplier KPI returns, open to Trentmoor Energy and its four suppliers. I’ve drafted one table, Monthly KPI returns, with eight columns.` | 142 | 1646–1693 |
| R1 | receipt | `✓ Step 1 · What the app is — open to 5 organisations` | | 1694 |
| Q1 | A, **BUILT question** | `Does “Monthly KPI returns” hold contractual data? Something a payment hangs on, that discharges a condition, or that the project owner will rely on as its record. If it does, it needs an acceptance step — a row is submitted, and the owner accepts or rejects it.` | 261 | 1698–1784 |
| — | replies (**BUILT labels**, `app-builder.tsx` 502–503) | row 1: `Yes — add an acceptance step` · `No — rows never change hands`; row 2: `What counts as contractual?` (VISION). They fade, unused, at 1951. | | 1785 |
| U1 | U, typed | `Yes — the KPIs feed each supplier’s scorecard under the contract.` | 65 | 1822–1941 |
| A2 | A | `Done — Monthly KPI returns now has an acceptance step. Each supplier submits; Trentmoor Energy accepts or rejects.` | 114 | 1955–1992 |
| R2 | receipt | `✓ Step 2 · The tables — Monthly KPI returns, with an acceptance step` | | 1993 |
| A3 | A | `No outside systems needed — suppliers type their returns in. I’ve written two screens: Submit this month’s KPIs, and Supplier KPI dashboard.` | 140 | 1997–2043 |
| R3 | receipt | `✓ Step 3 · Data connections — none` | | 2044 |
| Q2a | A, **BUILT question**, in full | `Who may open “Submit this month’s KPIs”? Everyone the app is open to, or only some of those organisations. Whatever you choose, it can only narrow — a screen shows each person what they could already see, and never more.` | 220 | 2159–2232 |
| — | replies (**BUILT answer labels**, `app-builder.tsx` 630, 650–680: `Everyone the app is open to` + one per organisation) | `Everyone the app is open to` (x 248–448, anchor `bld-r-everyone`, **(348, 729)**) · `Trentmoor Energy` (456–586) · `Netherfold Cabling` (594–734) · `More…` (742–806) | | 2233 |
| U2a | U, tap echo | `Everyone the app is open to` | | 2271 |
| Q2b | A, **BUILT question**, first sentence (as revision 1's read-target rule) | `Who may open “Supplier KPI dashboard”?` | 38 | 2275–2287 |
| — | replies (same four built labels) | `Everyone the app is open to` · **`Trentmoor Energy`** (x 456–586, anchor `bld-r-trentmoor`, **(521, 729)**) · `Netherfold Cabling` · `More…` | | 2288 |
| U2b | U, tap echo | `Trentmoor Energy` | | 2326 |
| A4 | A | `Set: the form opens to everyone the app is open to; Supplier KPI dashboard opens to Trentmoor Energy only.` | 106 | 2330–2365 |
| R4 | receipt | `✓ Step 4 · The interface — 2 screens; the form to everyone, the dashboard to Trentmoor only` | | 2366 |
| U3 | U, typed | `Flag any supplier below 90% on time.` | 36 | 2399–2465 |
| A5 | A | `Done — added to the dashboard.` | 30 | 2479–2488 |
| A6 | A | `Runs every month, on the 1st. Each month I’ll write a summary — the figures are computed; I only write the sentences.` | 117 | 2600–2638 |
| R5 | receipt | `✓ Step 5 · How often it runs — every month` | | 2639 |
| Q3 | A, **RULED question** (ADR-0056 §2b; mockup wording, shortened) | `The monthly run acts as you, Rachel Bowen, over the tables it declares — Monthly KPI returns and Insights. Is that everything it should touch?` | 142 | 2659–2706 |
| — | replies | `Yes — only these` (anchor `bld-r-only`, **(318, 729)**) · `Change it` | | 2707 |
| U4 | U, tap echo | `Yes — only these` | | 2745 |
| R6 | receipt | `✓ Step 6 · Analysis and prompts — runs as Rachel Bowen, on 2 tables` | | 2749 |
| A7 | A | `Ready to check and open.` | 24 | 2753–2760 |
| RB | card | the read-back (below) | | 2761 |

**The read-back card** (BUILT `StepCheckAndOpen` copy, inline under A7). White,
r10, 1px border, x 248–816, 312 tall, bottom-anchored at y 432–744. Micro
`CHECK AND OPEN`, then:

- **`Supplier KPI returns`** `— Monthly KPI returns from Trentmoor Energy’s four
  suppliers, accepted by Trentmoor, with a dashboard and a monthly summary.`
- `Open to: Trentmoor Energy, Netherfold Cabling, Ashcombe Civils, Wrenfield
  Plant Hire, Wrenbrook Fencing & Reinstatement`
- `Tables: Monthly KPI returns (with an acceptance step), Insights`
- `Data connections described: 0`
- `Screens: Submit this month’s KPIs, Supplier KPI dashboard — narrowed`. The
  built suffix applies only to a screen with an organisation list, so the form
  has none.
- `Runs: Every month`
- `Analysis prompt: written`
- muted: `Opening it copies what you have built to the people the app is open to,
  and records who opened it and when. Until then only its builders can see any
  of this.`
- primary **`Check and open`** (x 264–380, y 696–728, anchor `bld-open`, **(322,
  712)**) + quiet `Open the app`.

After the click (2826), the label becomes `Open the latest version` (built). No
"Last opened…" line is shown.

**The steps column** (BUILT titles, sub-lines and `The agent asks` tag; VISION
states).
- Each row has a 22 px circle at x 864. Idle: outlined, muted numeral.
  Current: ink fill, white numeral. Done: ink fill, white `✓`.
- Title 14 px 700 at x 898. Sub-line 12/16 muted.
- The slate micro tag `✦ THE AGENT ASKS` is always on steps 2, 4 and 6.
- The amber `Waiting for you` pill shows while that step has an unanswered
  question.
- When a step is done, its sub-line is replaced by its **recorded line**
  (`#57564f`).

| n | Title | Sub-line (built) | Waiting for you | Recorded line (frame) |
|---|---|---|---|---|
| 1 | What the app is | `and who it is open to` | — | `Open to Trentmoor Energy + 4 suppliers` (1694) |
| 2 | The tables | `what people fill in, and whether it holds contractual data` | 1698–1951 | `Monthly KPI returns · acceptance step` (1993) → `… · Insights` (2749) |
| 3 | Data connections | `systems outside Infora it draws on` | — | `None` (2044) |
| 4 | The interface | `the screens, and who may open each` | **2159–2326** (both screen questions) | `2 screens · form: everyone · dashboard: Trentmoor only` (2366) → `… · flags under 90%` (2489) |
| 5 | How often it runs | `a schedule, or only when someone presses Run` | — | `Every month` (2639) |
| 6 | Analysis and prompts | `what the agent says each run` | 2659–2745 | `Runs as Rachel Bowen, on 2 tables` (2749) |
| 7 | Check and open | `read it back; open it to its people` | — | `Open as version 1` (2826) |

**Step 2 detail slot** (open 1694–1993; collapses over 12 f after R2): 12 px
rows of 20, header micro `COLUMN · TYPE`. The rows fade in 4 f apart from
1698: `Month choice` · `Deliveries due number` · `Delivered on time number` ·
`NCRs number` · `Safety incidents number` · `Carbon (tCO2e) number` · `Local
spend (£) number` · `Notes text`. At 1955 the line `✓ Acceptance step —
Trentmoor Energy accepts or rejects` is added.

**Step 4 detail slot** (open 2271–2366, VISION): two lines, appearing as each
answer lands: `Submit this month’s KPIs — Everyone the app is open to` (2271)
and `Supplier KPI dashboard — Trentmoor Energy` (2326).

**Step 6 detail slot** (open 2639–2749): label `What the analysis should say`,
and at 2643 the value: `Summarise the month: on-time delivery across
suppliers and which supplier had the most late deliveries, any NCR count that
rose by more than 10%, and carbon against last month.`

**Current step and the header counter.**
- Step 1 at 1646 (`Step 1 of 7`).
- Step 2 at 1694.
- Step 3 at 1993.
- Step 4 at 2044.
- Step 5 at 2366.
- Step 6 at 2639.
- Step 7 at 2749.

**Preview body.**
- 1601–2047: centred muted `Nothing to show yet. The screens are written at
  step 4.` over three `Shimmer` blocks at 40%.
- 2048–2075: the empty dashboard (S8 narrow layout, `empty`), scaled 0.525 at
  x 1161–1491. Its blocks fade in 4 f apart:
  - the title and sub;
  - the tiles, 2×2 (`—` / `no returns yet`);
  - the table `Returns from every supplier` / `Nothing entered yet.`;
  - the bar placeholder (`#e0ded8` bars at 40%, `Nothing to draw yet.`);
  - the line placeholder;
  - the donut placeholder;
  - the insight, `No runs yet.`
- At the Work push (m 1.6), the preview text is about 12 px *scr*.
- 2489–2500: the bar placeholder gains the dashed 90 line (`#c4901f`) and the
  warning badge `Flags under 90% on time`, at about (1260, 540) native in the
  preview.

### S7 · Sam's seat: `Supplier KPI returns` · RULED `returns-app-two-seats.html` screen 1, re-cast · split left (752×832, collapsed rail)

- Collapsed rail (64): wordmark square, nav icons with `Tools` active, avatar
  `SK` at the foot. Chip line (hover-only, not shown) `Netherfold Cabling —
  Contractor`.
- Topbar (y 12–68): pill `Wrenfield–Ashcombe 400kV Connection` · `Tools /`
  **`Supplier KPI returns`**; right `● Member` (success tint).
- Content x 88–716. H1 `Supplier KPI returns` (cap top 100). Sub y 146–194 (3
  lines): `Your organisation’s monthly return to Trentmoor Energy. Save a draft
  as figures come in; submit when the month is complete. A submitted return
  is accepted or rejected by Trentmoor Energy — a rejected one is corrected by
  submitting it again.`
- Form card (sunken, r10) y 206–470: `September 2026 return` (y 222). Three
  columns (196 wide, 16 gap): row 1 (labels y 248, inputs 264–298) `Month` =
  `Sep 2026` · `Deliveries due` = `28` · `Delivered on time` = `27`; row 2
  (308 / 324–358) `NCRs` = `2` · `Safety incidents` = `0` · `Carbon (tCO2e)` =
  `61`; row 3 (368 / 384–426) `Local spend (£)` = `84,200` · `Notes` (spans 2
  columns, 2-line textarea) = `Drum delivery for section 4 slipped two days;
  recovered within the week.` Buttons y 438–470: `Save draft` (x 104–188) ·
  primary **`Submit to Trentmoor Energy`** (x 196–388, anchor `sam-submit`,
  **(292, 454)**) · muted `● Draft · saved 10:58 AM` (x 400–560).
  After the submit (2928): the buttons are disabled (opacity .5), and the muted
  line reads `● Submitted Oct 05, 2026, 11:02 AM` (VISION small).
- Table card (white, 1px border) y 482–718: header `Your returns — Netherfold
  Cabling` + right muted `4 returns · entered by Sam Kerridge`. Columns `MONTH ·
  DUE · ON TIME · NCRS · CARBON · STATE`. Rows of 44:

| Month | Due | On time | NCRs | Carbon | State |
|---|---|---|---|---|---|
| Sep 2026 | 28 | 27 | 2 | 61 | `● Draft` (neutral) → **`● Submitted`** (warning) / `Oct 05, 2026` at 2928 |
| Aug 2026 | 26 | 25 | 2 | 64 | `● Accepted` / `Sep 03, 2026 · Rachel Bowen` |
| Jul 2026 | 24 | 24 | 1 | 67 | `● Accepted` / `Aug 04, 2026 · Rachel Bowen` |
| Jun 2026 | 22 | 21 | 1 | 70 | `● Accepted` / `Jul 02, 2026 · Rachel Bowen` |

- Info note (slate tint `#e9eff6`, `ⓘ`, 12.5/16) y 730–806: `This app shows
  you what you could already see: Netherfold Cabling’s own returns. Other
  suppliers’ returns, the project totals and Trentmoor Energy’s monthly
  summary are not part of it for you — not because the app hides them, but
  because every row is read by the organisation that entered it and by
  Trentmoor Energy, and by nobody else.`
- No tiles, no totals, no charts, no insight.

### S8 · Rachel's dashboard: `Supplier KPI returns` · RULED mockup screen 2 (re-cast) + VISION polish (tiles, charts, flag) · BUILT acceptance and run mechanics

**Full width (1536 plate), scroll 0, page y = native y.** This is the
polished dashboard, written out in full.

- Topbar: pill + `· Tools /` **`Supplier KPI returns`**. Right (y 26–54):
  secondary `Run the analysis now` (x 1070–1232, anchor `dash-run`, **(1151,
  40)**) · secondary `Export…` (1240–1316) · quiet `Edit the app` (1324–1416) ·
  `● Owner` (1426–1500).
- H1 `Supplier KPI returns` (cap top 100). Sub y 146–180 (2 lines, max 760):
  `Every supplier’s monthly return, the project totals, and the latest
  analysis. Accept or reject each submitted return; an accepted return becomes
  Trentmoor Energy’s record.`
- **Tiles** y 196–284, four sunken cards (r10, no border) of 252 wide at x 342,
  610, 878, 1146. Each card: a label (12.5 px muted, y+16), a value (Source
  Serif 4 30 px, 500, y+34–66) and a sub (12 px muted, y+70).
- **Returns table** (white card, 1px `#ececea`, r10) y 300–536: header row
  300–334 `Returns from every supplier` (13.5 px 700) + right muted `Showing
  September · 4 rows`. Column header 334–360 (micro): `MONTH` (x 358) ·
  `ORGANISATION` (452) · `DUE` (right edge 764) · `ON TIME` (844) · `NCRS` (914)
  · `CARBON` (994) · `STATE` (1018) · actions (1232–1382). Rows of 44 from y
  360: Netherfold 360–404, Ashcombe 404–448, Plant Hire 448–492, Wrenbrook
  492–536. The organisation cell has the person as a muted second line.
- **Confirm strip** (inside the table card, under the rows, only while open)
  y 536–612, sunken `#faf9f7`, hairline above. Text x 358–1050 (13/18, 3 lines):
  **`Accept Netherfold Cabling’s September 2026 return?`** `Once accepted it
  becomes Trentmoor Energy’s record: it cannot be edited or deleted in place,
  and a correction from Netherfold Cabling would arrive as a new row that
  supersedes this one. The decision is recorded in your name.` Buttons (y
  561–589): primary **`Accept`** (x 1086–1152, anchor `dash-strip-accept`,
  **(1119, 575)**) · secondary `Reject — say why…` (1162–1300) · quiet
  `Cancel` (1310–1382). While it is open, everything below moves down 76 (12 f
  ease).
- **Charts row** y 552–744 (strip closed). Three white cards (1px border, r10):
  - **Bar** x 342–692: title `On time by supplier · Sep 2026, %` (12.5 px 700,
    y 568). Warning badge `● Flags under 90% on time` (y 584–604). Plot x
    366–676, y 614–716, y-axis 0–100, gridlines 0/50/100 (10.5 px muted labels).
    Dashed flag line at 90 (`#c4901f`, 1px) with right label `90%`. Bars 40 wide
    at x 386 / 462 / 538 / 614: **Netherfold 96** (`CHART.s1`), **Ashcombe 85**
    (`#c4901f`, value label amber), **Plant Hire 95**, **Wrenbrook 92**. Value
    labels 11 px above the bars. X labels 11 px at y 724; under `Ashcombe`, a
    second amber line in 10 px: `Under 90% on time`.
  - **Line** x 708–1048: title `Carbon by month, tCO2e` + muted `accepted returns
    only`. Plot x 732–1024, y 610–716, y-axis 0–200, gridlines 0/100/200. Points
    Jun **171**, Jul **163**, Aug **154**, Sep **142** (`CHART.s1`, 2 px line, 4 px
    dots, 11 px labels). A dashed trend line (`CHART.trend`), least squares over
    the shown points.
  - **Donut** x 1064–1398: title `Local spend by supplier · Sep 2026`. Donut
    d=120 centred (1140, 664), 22 px ring. Centre `£272k` (serif 20). Legend x
    1216–1390, 11.5 px, value right-aligned: `■ Ashcombe £126,500` (s1) · `■
    Netherfold £84,200` (s2) · `■ Plant Hire £38,900` (s3) · `■ Wrenbrook
    £22,400` (s4, outline s4Outline).
- **Insight card** y 760–844, sunken r10: row 1 `● Latest insight` (info
  `#274a6d`, 12.5 px 600) + meta (12 px muted) + right link `All runs →`; rows 2–3
  the text (14/20, `#1c1b18`).
- Below the fold (reached by scroll 560 in ch 6): micro `RUNS` y 868. Card
  884–1000: sub `What each run covered. The insight a run wrote is a row in the
  app’s insight table, read by the organisation that ran it and the project
  owner — open that table to read it.`, columns `STARTED · TRIGGER · ACTED AS ·
  ROWS COVERED · WHAT HAPPENED · AGAINST VERSION`. Micro `KEEP IT FOR THE NEXT
  PROJECT` y 1032. Card 1048–1228: para (4 lines, y 1064–1132) `Keep this app as
  a playbook on your firm’s own shelf, in your workspace. The shape travels —
  the tables and their columns, whether each needs signing off, the screens,
  the schedule and the analysis prompt. **No rows travel**, whoever entered
  them and whichever table they are in, so what you keep carries nothing of
  this client into the next one. Keeping it again under the same name makes
  the next version, and changes nothing already deployed.` · field `Call the
  playbook` (label y 1144, input x 358–758, y 1160–1192, value `Supplier KPI
  returns`) · primary **`Keep this as a playbook`** (x 774–954, y 1160–1192,
  anchor `dash-keep`; at scroll 560, **(864, 616)**) · notice y 1204–1222.

**The four states** (accepted rows only in every total):

| Element | **B** before (from 2846) | **S** submitted (2946) | **A** accepted (3155) | **E** end (after run, 3372+) |
|---|---|---|---|---|
| Tile 1 `September 2026` | `3 of 4` / `returns submitted · nothing yet from Netherfold Cabling` | `4 of 4` / `returns submitted` | same | same |
| Tile 2 `Awaiting your decision` | `0` / `nothing waiting` | **`1`** / `Netherfold Cabling, September 2026` | `0` / `nothing waiting` | same |
| Tile 3 `On time, September` | `66 of 74` / `accepted returns only` | unchanged | **`93 of 102`** (count-up 3167–3196, 30 f, `ease.out`) | same |
| Tile 4 `Carbon since June` | `569 tCO2e` / `accepted returns only · 15 rows` | unchanged | **`630 tCO2e`** / `accepted returns only · 16 rows` | same |
| Netherfold row | `Sep 2026` · `Netherfold Cabling` · cells Due–Carbon: muted `No return yet` · `● Not yet submitted` (neutral) | `Sep 2026` · `Netherfold Cabling` / `Sam Kerridge` · `28` `27` `2` `61` · `● Submitted` (warning) / `Oct 05, 2026` · row fill `#faf9f7` · `Accept` (x 1240–1306, **(1273, 382)**, anchor `dash-row-accept`) `Reject` (1314–1380) | `● Accepted` (success) / `Oct 05, 2026 · Rachel Bowen`; buttons gone | same |
| Ashcombe row | `Sep 2026` · `Ashcombe Civils` / `Dan Ferris` · `40` `34` `3` `52` · `● Accepted` / `Oct 01, 2026 · Rachel Bowen` | | | |
| Plant Hire row | `Sep 2026` · `Wrenfield Plant Hire` / `Leah Morrow` · `22` `21` `1` `21` · `● Accepted` / `Oct 01, 2026 · Rachel Bowen` | | | |
| Wrenbrook row | `Sep 2026` · `Wrenbrook Fencing & Reinstatement` / `Joe Pellow` · `12` `11` `0` `8` · `● Accepted` / `Oct 01, 2026 · Rachel Bowen` | | | |
| Bar | Netherfold slot empty, muted `—` at baseline; Ashcombe 85 amber, Plant Hire 95, Wrenbrook 92 | unchanged | Netherfold bar grows 0→96 (3167–3196, `ease.out`) | same |
| Line | Sep point **81** (trend over 171/163/154/81) | unchanged | Sep rises 81→**142** (3167–3196) | same |
| Donut | three segments, Netherfold legend `—`, centre **`£188k`** | unchanged | Netherfold segment grows in, centre **`£272k`** | same |
| Insight | `● Latest insight` + muted `No runs yet.` (no meta, no link) | unchanged | unchanged | meta `Run Oct 05, 2026, 11:24 AM · run by hand · acted as Rachel Bowen over 16 rows in Monthly KPI returns · version 1` + `All runs →`; text below |
| Runs card | `No runs yet.` | | | row `Oct 05, 2026, 11:24 AM` · `Run by hand` · `Rachel Bowen` · `16` · `Wrote one insight` · `1` |

**Insight text (state E):** `September’s on-time delivery across four
suppliers was 91%, down 3 points on August. Ashcombe Civils accounted for 6 of
9 late deliveries. Carbon fell 8% to 142 tCO2e. No supplier’s NCR count rose by
more than 10%.` (214 chars, streamed at 4 c/f, 3372–3425).

**Keep notice (BUILT wording, playbook word):** `Kept on your firm’s shelf as
“Supplier KPI returns”, version 1. Its tables travelled empty.`

**Narrow layout (split right window, 752×832, and the builder preview).**
Collapsed rail. Topbar: pill + `· Tools /` **`Supplier KPI returns`**, right `⋯`
(28 px quiet icon button; VISION: the three header actions collapse at narrow
width) + `● Owner`. Content x 88–716. H1 (cap top 100). Sub 3 lines, y 146–194.
Tiles 2×2, 306×84, at (88, 210), (410, 210), (88, 306), (410, 306). Table card
y 406–642: header 406–440, column header 440–466, columns `MONTH` 70 (x 88) ·
`ORGANISATION` 150 · `DUE` 44 · `ON TIME` 56 · `NCRS` 48 · `CARBON` 56 · `STATE`
204 (no actions column; the actions show when a row is selected at full width).
Rows of 44 from y 466. The charts stack below y 658, partly visible. The
insight is below the fold.

---

## 4. Shot table

Columns as master §6.3. "→" marks a change at the given frame.
- Cursor travel time: `T = clamp(15, 10 + d/45, 27)`, with d the *scr*
  distance at the camera of that moment.
- Every click comes 8 f after arrival, and the cursor waits 6 f after it.
- Every travel ends ≥ 6 f before its click, because the camera is still.

### Furniture

| Shot | Frames | Dur | Ch | Seat | Status | Screen state | Camera | Cursor | Typed / streamed | Caption | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0.1 | 0–89 | 3.0 s | — | — | — | `OpeningTitle`: kicker `PILLAR 04`, name `Tools`, **scenario line** `A QA check, a saved workflow, and a supplier KPI app` (no deck tagline, per the producer ruling) | — | none | — | none | Master §2.5 motion, with `deckLine` replaced by `scenarioLine`. |
| 0.2 | 90–194 | 3.5 s | — | Rachel | RULED mockup · VISION polish | S8 **state E**, scroll 0, frozen. The window fades in 84–101. | Wide | none | — | **96**: label `Where this ends`, "Every return accepted, the month analysed" (out 186) | No seat tag, chapter bar hidden. |
| 0.3 | 195–206 | 0.4 s | — | — | — | Content crossfade S8-E → S1. | Wide | none | — | — | — |

### Chapter 1 · QA check (207–611)

| Shot | Frames | Dur | Ch | Seat | Status | Screen state | Camera | Cursor | Typed / streamed | Caption | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1.1 | 207–244 | 1.3 s | 1 | Eleanor | BUILT t1-01 · BUILT-NP apps.tsx | S1. → 243 the `QA checker` card is pressed. | Wide | Fades in 207–216 at (980, 560) *scr* (1192, 636). Travel 217–235 → (870, 232) *scr* (1072, 278) [`tool-qa`], **click 243**. | — | **234**: label `1 / 6 · QA check`, seat `Eleanor Price, Calder & Hale`, "Eleanor opens the QA checker on her draft" | Chapter bar fades in 207–218. Cut at 245. |
| 1.2 | 245–313 | 2.3 s | 1 | Eleanor | BUILT t2-02 | S2 at scroll 0, `Choose a draft…`. → 282–285 the dropdown. → 311 the value is set and the dropdown fades. | Wide | Hold 245–256. Travel 257–272 → (747, 233) *scr* (937, 279) [`qa-draft`], **click 280**. Travel 286–301 → (600, 268) *scr* (776, 317) [`qa-draft-opt1`], **click 309**. | — | — | — |
| 1.3 | 314–375 | 2.1 s | 1 | Eleanor | BUILT t2-02, t2-05 | Scroll 0→600 (314–339), hold 340–349, scroll 600→1200 (350–375). | Wide | At rest. | — | — | — |
| 1.4 | 376–422 | 1.6 s | 1 | Eleanor | BUILT t2-05 · DEV numbers | → 400 `See the plan`; 402–406 `The plan` fades in (no attachment notice). | Wide → **Work m 1.3 c (870, 531)** 402–422 | Travel 376–392 → (397, 424) *scr* (554, 488) [`qa-see-plan`], **click 400**. | — | **391**: "She sees the plan before anything runs" | — |
| 1.5 | 423–481 | 2.0 s | 1 | Eleanor | BUILT t2-05 | Plan steps 1–2 and `Covers:`. → 480 `Run the check`. | Work | Hold 423–452. Travel 453–472 → (419, 706) *scr* (319, 744) [`qa-run`], **click 480**. | — | — | — |
| 1.6 | 482–536 | 1.8 s | 1 | Eleanor | BUILT t2-06-progress, t2-06-run | 482 `Running the check`, `0 of 2 steps finished.` 507 `1 of 2`. 531 done. 532–536 the plan returns and `What was checked` fades in. | Work | Idle (stays; the next move is 587). | — | **520**: "Five findings land as marks in the draft" | Working 50 f. |
| 1.7 | 537–586 | 1.7 s | 1 | Eleanor | BUILT t2-06-run | Scroll 1200→1320 (537–556). Hold 557–565 on `5 findings, anchored in the draft.` | Work → **Wide** 566–586 | Idle. | — | — | The result is readable 532–602 (70 f ≥ 40). |
| 1.8 | 587–611 | 0.8 s | 1 | Eleanor | BUILT t2-06-run | → 610 the link is pressed. | Wide | Travel 587–602 → (470, 730) *scr* (634, 822) [`qa-open-draft`], **click 610**. | — | — | Cut at **612** (chapter 2's first frame). Cue 3 starts its fade at 609. |

### Chapter 2 · Findings (612–981)

| Shot | Frames | Dur | Ch | Seat | Status | Screen state | Camera | Cursor | Typed / streamed | Caption | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2.1 | 612–686 | 2.5 s | 2 | Eleanor | BUILT t2-07, t2-12 · DEV reflow · VISION tracked display | S3 initial (rail unlit): `Checks (5)`, `3 pending in the document`, `House style (3)`, five marks. → 647 `Accept 1 mechanical correction`. → 649–678 tracked `~~routewide works~~ scheme`. → 679–686 settles to `the scheme`. | Wide | Travel 612–639 → (1297, 332) *scr* (1539, 387) [`fx-mech`], **click 647**. | — | **612**: label `2 / 6 · Findings`, "One decision fixes the house-style wording" | The cue comes in with the chapter-bar flip (should-fix 13). |
| 2.2 | 687–755 | 2.3 s | 2 | Eleanor | BUILT t2-12 | 687–692 card 1 and the button fade. 693–704 the list closes up (−319); `4 open findings, 1 resolved. …`, `Checks (4)`, `2 pending in the document`, `House style (2)`. 726–749 the panel scrolls +600, bringing the `Accuracy (1)` card to y 321–585. Settle 750–755. | Wide → **Work m 1.4 c (987, 480)** 705–725 | Idle at (1297, 332) (stays). | — | **747**: "The accuracy finding cites the ground investigation" | — |
| 2.3 | 756–870 | 3.8 s | 2 | Eleanor | VISION accuracy copy · BUILT SourceChip · VISION hover card | → 772–775 the hover card fades in (S3, trimmed quote). It holds for **100 f** (771–870). | Work | Move 756–771 → (1236, 426) *scr* (1341, 414) [`fx-acc-pill`]. | — | — | Hold raised from 59 to 100 f (viewer change 4). |
| 2.4 | 871–950 | 2.7 s | 2 | Eleanor | VISION accuracy · BUILT accept mechanics | 871–874 the hover card fades. → 894 `Accept`. → 896–925 the span is tracked to `in three trial pits at Wrenfield Sidings`, settling 926–933. 934–950 card 4 resolves; `3 open findings, 2 resolved. …`, `Checks (3)`, `1 pending in the document`, footer note. | Work | Travel 871–886 → (1232, 555) *scr* (1335, 611) [`fx-acc-accept`], **click 894**. | — | — | The rewrite is accepted on its own. |
| 2.5 | 951–981 | 1.0 s | 2 | Eleanor | BUILT t2-12 | End-of-chapter state. | Work → **Wide** 951–971; hold 972–981 | Fades out 976–981. | — | — | — |

### Chapter 3 · Workflow (982–1362)

| Shot | Frames | Dur | Ch | Seat | Status | Screen state | Camera | Cursor | Typed / streamed | Caption | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 3.1 | 982–1038 | 1.9 s | 3 | Eleanor | BUILT t1-02 · VISION work-package field (as W2) | 982–993 **crossfade 12 f** (time skip, 10:05 AM) to S4 at scroll 0, with the basics set: style guide ☑ and work package `Land quality`. → 1029 `Land quality technical note` pressed. 1031–1038 the section cards fade in (3 f apart). | Wide | Fades in 994–1003 at (1000, 520) *scr* (1214, 593). Travel 1004–1021 → (882, 764) *scr* (1085, 860) [`cr-firm-outline`], **click 1029**. | — | **982**: label `3 / 6 · Workflow`, "Eleanor starts from her firm's saved outline" | — |
| 3.2 | 1039–1082 | 1.5 s | 3 | Eleanor | BUILT t1-05 | Scroll 0→600 (1039–1064). Hold 1065–1082 on `1 The test`, `2 Baseline` + `2.1`, `3 Effect`. | Wide | Idle (stays). | — | — | — |
| 3.3 | 1083–1145 | 2.1 s | 3 | Eleanor | BUILT t1-07 · VISION grouped sources (as W2) · DEV brief | 1083–1094 **crossfade 12 f** (a minute's skip) to scroll 1630: the brief is filled, and `WA-GEO-GIR-004` and `WA-ENV-BAS-003` are ticked under `RELATED IN THE PROJECT ONTOLOGY`. Hold. | Wide → **Work m 1.3 c (870, 531)** 1095–1115 | Idle (stays). | — | **1074**: "Brief written, two sources chosen - then the plan" | The ticks happen inside the skip (viewer change 4), and the caption says so. |
| 3.4 | 1146–1236 | 3.0 s | 3 | Eleanor | BUILT t1-08, t1-11 · DEV register words | → 1180 `See the plan`; 1182–1186 the plan card fades in. Scroll 1630→2130 (1187–1210), pause 1211–1216, scroll 2130→2500 (1217–1236), ending on `Covers:` and the accept button. | Work | Travel 1146–1172 → (397, 627) *scr* (287, 633) [`cr-see-plan`], **click 1180**. | — | — | Two scrolls of ≤ 600. |
| 3.5 | 1237–1311 | 2.5 s | 3 | Eleanor | BUILT t1-11, t1-12 · DEV coverage | → 1260 `Accept the plan and create the document`. 1262–1306 `Working…`. 1307–1311 `What was made` fades in. | Work | Travel 1237–1252 → (486, 674) *scr* (414, 700) [`cr-accept`], **click 1260**. | — | **1280**: "Four sections written, from two bound sources" | — |
| 3.6 | 1312–1362 | 1.7 s | 3 | Eleanor | BUILT t1-12 · DEV | Hold on `Covered: 4 of 4 sections written · 2 of 2 bound sources used · 1 drafting pass`. | Work 1312–1341 → **Wide** 1342–1362 | Fades out 1356–1361. | — | — | Chapter 4 starts Wide. |

### Chapter 4 · Build (1363–2845)

| Shot | Frames | Dur | Ch | Seat | Status | Screen state | Camera | Cursor | Typed / streamed | Caption | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 4.1 | 1363–1408 | 1.5 s | 4 | Rachel | BUILT t1-01 · VISION composer | 1363–1374 **crossfade 12 f** (seat change, and the jump back to June) to S5. → 1403 the composer is focused. | Wide | Fades in 1365–1374 at (900, 640) *scr* (1104, 724). Travel 1375–1395 → (520, 470) *scr* (689, 538) [`apps-compose`], **click 1403**. | — | **1363**: label `4 / 6 · Build`, seat `Rachel Bowen, Trentmoor Energy`, "**In June, Rachel describes the app she needs**" | The time jump is said in the caption (must-fix 2, viewer change 1). |
| 4.2 | 1409–1600 | 6.4 s | 4 | Rachel | VISION | The prompt types into S5, two lines. → 1599 Enter. | Wide | On the composer; fades out 1499–1504 (90 f after the click's dwell). | `HumanTyped` **P** from 1409, seed 404 → budget end **1591** (166 + 16 for 4 commas). Enter **1599**. | — | Cut to S6 at **1601**. If `endsAt` is earlier, hold the text; it never ends later than 1591. |
| 4.3 | 1601–1697 | 3.2 s | 4 | Rachel | VISION chat-led · BUILT step titles | S6: bubble P, steps idle, preview empty message. 1601–1645 `Working…`. 1646 step 1 current. → 1694 R1, step 1 done, step 2 current, and the step 2 detail opens. | Wide | none | **A1** 1646–1693. | **1637**: "The agent fills each step as it goes" | — |
| 4.4 | 1698–1789 | 3.1 s | 4 | Rachel | BUILT question · BUILT columns · BUILT answer labels | The step 2 rows fade in 1698–1729; `Waiting for you` from 1698. 1785–1789 the built reply chips (two rows). | Wide | Fades in 1780–1789 at (520, 470) viewport. | **Q1** 1698–1784. | — | — |
| 4.5 | 1790–1954 | 5.5 s | 4 | Rachel | VISION (typed answer) · BUILT acceptance semantics | → 1816 the composer is focused. Typing. → 1949 Enter. 1951 bubble U1; the chips fade, unused; the pill fades. | Wide | Travel 1790–1808 → (500, 796) *scr* (667, 895) [`bld-compose`], **click 1816**. Fades out 1912–1917. | `HumanTyped` **U1** from 1822, seed 405 → budget end **1941**. Enter **1949**. | **1813**: "Rachel says the returns are contractual" | — |
| 4.6 | 1955–2047 | 3.1 s | 4 | Rachel | VISION · BUILT receipt mechanics | 1955 the step 2 acceptance line. → 1993 R2, step 2 done (the detail collapses), step 3 current. → 2044 R3, step 3 done, step 4 current. The thread scrolls from 1997. | Wide | Hidden. | **A2** 1955–1992. **A3** 1997–2043. | **2039**: "The screens appear in a live preview" | — |
| 4.7 | 2048–2158 | 3.7 s | 4 | Rachel | VISION preview | **2048–2075 the preview fills** (blocks 4 f apart). Held. | Wide → **Work m 1.6 c (1056, 470)** 2048–2068; hold 2069–2137; → **Wide** 2138–2158 | Hidden. | none (no streaming during the push) | — | Viewer change 2. The push frames the steps (step 4 current) and the preview. |
| 4.8 | 2159–2274 | 3.9 s | 4 | Rachel | **BUILT question + BUILT answer labels** (must-fix 1) | `Waiting for you` on step 4 from 2159. 2233–2237 the four chips. → 2269 `Everyone the app is open to`. 2271 bubble U2a; the step 4 detail line 1. | Wide | Fades in 2236–2245. Hold 2238–2245. Travel 2246–2261 → (348, 729) *scr* (501, 821) [`bld-r-everyone`], **click 2269**. | **Q2a** 2159–2232. | **2150**: "Rachel decides who opens each screen" | — |
| 4.9 | 2275–2369 | 3.2 s | 4 | Rachel | BUILT question (first sentence) + BUILT labels | 2288–2292 the chips. → 2324 `Trentmoor Energy`. 2326 bubble U2b; detail line 2; the pill fades. → 2366 R4, step 4 done (`2 screens · form: everyone · dashboard: Trentmoor only`), step 5 current. | Wide | Hold 2293–2300. Travel 2301–2316 → (521, 729) *scr* (690, 821) [`bld-r-trentmoor`], **click 2324**. | **Q2b** 2275–2287. **A4** 2330–2365. | — | — |
| 4.10 | 2370–2478 | 3.6 s | 4 | Rachel | VISION | → 2393 the composer is focused; typing; → 2473 Enter; 2475 bubble U3. | Wide | Travel 2370–2385 → (500, 796) *scr* (667, 895), **click 2393**. Visible to the end of this shot. | `HumanTyped` **U3** from 2399, seed 406 → budget end **2465**. Enter **2473**. | **2390**: "She asks for a flag in plain words" | — |
| 4.11 | 2479–2599 | 4.0 s | 4 | Rachel | VISION (threshold beyond the grammar, D-6) | **2489–2500 the dashed 90 line and `Flags under 90% on time`** appear in the preview; step 4's line gains `· flags under 90%`. Held. | Wide (A5) → **Work m 1.6 c (1056, 470)** 2489–2509; hold 2510–2578; → **Wide** 2579–2599 | Fades out 2489–2494. | **A5** 2479–2488. | — | The flag is readable at Work (viewer change 2). |
| 4.12 | 2600–2752 | 5.1 s | 4 | Rachel | RULED question (ADR-0056 §2b, mockup) · VISION chat | → 2639 R5, step 5 done, step 6 current + detail; 2643 the prompt value. `Waiting for you` on step 6 from 2659. 2707–2711 the chips. → 2743 `Yes — only these`. 2745 bubble U4. → 2749 R6, step 6 done, step 2's line gains `· Insights`, step 7 current. | Wide | Fades in 2710–2719. Hold 2712–2719. Travel 2720–2735 → (318, 729) *scr* (468, 821) [`bld-r-only`], **click 2743**. | **A6** 2600–2638. **Q3** 2659–2706. | **2650**: "She confirms what the monthly run may touch" | — |
| 4.13 | 2753–2845 | 3.1 s | 4 | Rachel | BUILT read-back copy and button · VISION placement | 2761–2772 the read-back card grows in, and the thread scrolls. Hold 2773–2800. → 2824 `Check and open`. → 2826–2830 the badge reads `● Open as version 1`, step 7 is done, and the button label changes. Hold 2831–2845. | Wide | Travel 2801–2816 → (322, 712) *scr* (472, 803) [`bld-open`], **click 2824**. Fades out 2840–2845. | **A7** 2753–2760. | **2752**: "Rachel checks it and opens it" | — |

### Chapter 5 · Two seats (2846–3277)

| Shot | Frames | Dur | Ch | Seat | Status | Screen state | Camera | Cursor | Typed / streamed | Caption | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 5.1 | 2846–2927 | 2.7 s | 5 | Sam \| Rachel (split) | RULED mockup · BUILT mechanics | 2846–2860 **crossfade 15 f** into the split. Left: S7 (Sep `● Draft`). Right: S8 narrow, **state B**. Seat tags over the windows: `Sam Kerridge, Netherfold Cabling` (`#8a6d3b`) and `Rachel Bowen, Trentmoor Energy` (`#159a74`). Hold 2861–2900. → **2926 click** `Submit to Trentmoor Energy`. | Split | Sam: fades in 2891–2900 at L(500, 640) *scr* (667, 760). Travel 2901–2918 → L(292, 454) *scr* (439, 557) [`sam-submit`], **click 2926**. | — | **2846**: label `5 / 6 · Two seats` (no seat tag), "**October - Netherfold submits its September return**" | The forward time jump is said in the caption. The cue comes in with the bar flip (should-fix 13). |
| 5.2 | 2928–3010 | 2.8 s | 5 | split | RULED · BUILT | 2928 left: the Sep row → `● Submitted` / `Oct 05, 2026`, the buttons are disabled, and `● Submitted Oct 05, 2026, 11:02 AM` appears. **2946–2950** right: the Netherfold row fills (`28 27 2 61`, `● Submitted`), tile 1 → `4 of 4`, tile 2 → `1` (**state S**). Hold 2951–3010. | Split | Sam idles, then fades out 3005–3010. | — | **2937**: "Same app - each firm sees its own" | Required line, verbatim. |
| 5.3 | 3011–3081 | 2.4 s | 5 | Rachel | RULED strip · BUILT acceptance | 3011–3025 **crossfade 15 f** out of the split to S8 full width, state S. → 3063 `Accept`. 3065–3069 the confirm strip; 3070–3081 the charts push down 76. | Wide | Fades in 3026–3035 at (1000, 640) *scr* (1214, 724). Travel 3036–3055 → (1273, 382) *scr* (1512, 442) [`dash-row-accept`], **click 3063**. | — | **3027**: seat `Rachel Bowen, Trentmoor Energy`, "Rachel accepts Netherfold's return" | — |
| 5.4 | 3082–3154 | 2.4 s | 5 | Rachel | RULED strip copy | Hold on the strip, framed with the tiles and the row. → **3153** strip `Accept`. | Wide → **Work m 1.3 c (870, 420)** 3082–3102 | Idle during the move. Travel 3127–3145 → (1119, 575) *scr* (1314, 717) [`dash-strip-accept`], **click 3153**. | — | **3144**: "**Totals count accepted returns only**" | Viewer change 3. |
| 5.5 | 3155–3277 | 4.1 s | 5 | Rachel | RULED · VISION polish | 3155–3166 the strip closes and the row → `● Accepted` / `Oct 05, 2026 · Rachel Bowen`; tile 2 → `0`. **3167–3196 (30 f)**: tile 3 counts `66 of 74` → **`93 of 102`**, tile 4 `569` → **`630 tCO2e`** (`· 16 rows`), the Netherfold bar grows to 96, the line's Sep point rises 81 → 142, and the donut centre goes `£188k` → **`£272k`** (**state A**). Hold 3197–3241 at Work. | Work → **Wide** 3242–3262; hold 3263–3277 on the charts | Idle; fades out 3249–3254. | — | — | The slower count-up and the held Work frame are viewer change 3. |

### Chapter 6 · Insight (3278–3650)

| Shot | Frames | Dur | Ch | Seat | Status | Screen state | Camera | Cursor | Typed / streamed | Caption | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 6.1 | 3278–3321 | 1.5 s | 6 | Rachel | BUILT run | State A. → 3315 `Run the analysis now`. 3317–3321 the insight card → `Working…`. | Wide | Fades in 3274–3283 at (1119, 575). Hold 3278–3283. Travel 3284–3307 → (1151, 40) *scr* (1379, 68) [`dash-run`], **click 3315**. | — | **3306**: label `6 / 6 · Insight`, "Rachel runs the month's analysis" | No run trace. |
| 6.2 | 3322–3425 | 3.5 s | 6 | Rachel | BUILT run → insight row · RULED card | `Working…` until 3366 (50 f). 3367–3371 the meta line and `All runs →`. 3372–3425 the insight streams. | Wide → **Work m 1.5 c (870, 576)** 3322–3342 | Idle; fades out 3411–3416. | **Insight** 3372–3425 at 4 c/f. | — | — |
| 6.3 | 3426–3506 | 2.7 s | 6 | Rachel | RULED card | Hold on the full card (state E). | Work 3426–3485 → **Wide** 3486–3506 | Hidden. | — | — | The focal sentence (9 words, 72 f) is visible 3426–3506 (81 f). |
| 6.4 | 3507–3573 | 2.2 s | 6 | Rachel | BUILT runs card · BUILT keep (playbook word, DEV) | Scroll 0→560 (3507–3532): the insight, the runs row and the keep card. → 3567 `Keep this as a playbook`. 3569–3573 the notice. | Wide | Fades in 3523–3532 at (1151, 40) viewport. Travel 3533–3559 → (864, 616) *scr* (1065, 698) [`dash-keep`], **click 3567**. | — | **3558**: "Kept as a playbook for the next project" | — |
| 6.5 | 3574–3650 | 2.6 s | 6 | Rachel | as 6.4 | Hold on the notice 3574–3618. Scroll 560→0 (3619–3644). Hold 3645–3650. | Wide | Idle. | — | — | — |

### Close and logo

| Shot | Frames | Dur | Ch | Seat | Status | Screen state | Camera | Cursor | Typed / streamed | Caption | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 7.1 | 3651–3800 | 5.0 s | 6 | Rachel | as 0.2 | S8 state E, still. | Wide | Fades out 3651–3656. | — | **3651**: label `6 / 6 · Insight`, "**Built by asking - used across two organisations**" | Viewer change 5. |
| 7.2 | 3801–3890 | 3.0 s | — | — | — | The window, caption and bar fade out 3801–3812. The wordmark fades in 3807–3821. | — | — | — | — | — |

---

## 5. Captions

| # | In | Out starts | Label | Seat tag | Line (≤ 8 words) | Words | Hold | Min |
|---|---|---|---|---|---|---|---|---|
| G | 96 | 186 | Where this ends | — | Every return accepted, the month analysed | 6 | 90 | 75 |
| 1 | 234 | 388 | 1 / 6 · QA check | Eleanor Price, Calder & Hale | Eleanor opens the QA checker on her draft | 8 | 154 | 88 |
| 2 | 391 | 517 | 1 / 6 · QA check | — | She sees the plan before anything runs | 7 | 126 | 80 |
| 3 | 520 | 609 | 1 / 6 · QA check | — | Five findings land as marks in the draft | 8 | 89 | 88 |
| 4 | 612 | 744 | 2 / 6 · Findings | — | One decision fixes the house-style wording | 6 | 132 | 75 |
| 5 | 747 | 979 | 2 / 6 · Findings | — | The accuracy finding cites the ground investigation | 7 | 232 | 80 |
| 6 | 982 | 1071 | 3 / 6 · Workflow | — | Eleanor starts from her firm's saved outline | 7 | 89 | 80 |
| 7 | 1074 | 1277 | 3 / 6 · Workflow | — | Brief written, two sources chosen - then the plan | 8 | 203 | 88 |
| 8 | 1280 | 1360 | 3 / 6 · Workflow | — | Four sections written, from two bound sources | 7 | 80 | 80 |
| 9 | 1363 | 1634 | 4 / 6 · Build | Rachel Bowen, Trentmoor Energy | In June, Rachel describes the app she needs | 8 | 271 | 88 |
| 10 | 1637 | 1810 | 4 / 6 · Build | — | The agent fills each step as it goes | 8 | 173 | 88 |
| 11 | 1813 | 2036 | 4 / 6 · Build | — | Rachel says the returns are contractual | 6 | 223 | 75 |
| 12 | 2039 | 2147 | 4 / 6 · Build | — | The screens appear in a live preview | 7 | 108 | 80 |
| 13 | 2150 | 2387 | 4 / 6 · Build | — | Rachel decides who opens each screen | 6 | 237 | 75 |
| 14 | 2390 | 2647 | 4 / 6 · Build | — | She asks for a flag in plain words | 8 | 257 | 88 |
| 15 | 2650 | 2749 | 4 / 6 · Build | — | She confirms what the monthly run may touch | 8 | 99 | 88 |
| 16 | 2752 | 2843 | 4 / 6 · Build | — | Rachel checks it and opens it | 6 | 91 | 75 |
| 17 | 2846 | 2934 | 5 / 6 · Two seats | (tags over the windows) | October - Netherfold submits its September return | 6 | 88 | 75 |
| 18 | 2937 | 3024 | 5 / 6 · Two seats | (tags over the windows) | Same app - each firm sees its own | 7 | 87 | 80 |
| 19 | 3027 | 3141 | 5 / 6 · Two seats | Rachel Bowen, Trentmoor Energy | Rachel accepts Netherfold's return | 4 | 114 | 75 |
| 20 | 3144 | 3303 | 5 / 6 · Two seats | — | Totals count accepted returns only | 5 | 159 | 75 |
| 21 | 3306 | 3555 | 6 / 6 · Insight | — | Rachel runs the month's analysis | 5 | 249 | 75 |
| 22 | 3558 | 3648 | 6 / 6 · Insight | — | Kept as a playbook for the next project | 8 | 90 | 88 |
| C | 3651 | 3801 | 6 / 6 · Insight | — | Built by asking - used across two organisations | 7 | 150 | 80 |

- "Out starts" is the frame the 6 f fade begins: the next cue's in − 3.
- Words exclude a free-standing hyphen. "Hold" runs from in to out-start, and
  "Min" is `max(75, words × 8 + 24)`. Every hold ≥ its minimum ✓.
- Every chapter's first cue starts on the chapter's first frame or later.
  Cue 3 has ended by 615 (its fade runs 609–614), cue 17 starts at 2846 (the
  bar flip) and cue 4 at 612 (should-fix 13).
- The required line is cue 18, verbatim. The two time-jump captions are cues 9
  and 17 (producer wording). The totals rule is cue 20, and the close is the
  producer's line.
- That makes 22 chapter cues against master's "about 12–16" (section 9, D-4).

---

## 6. Camera shares

Window-visible frames: glimpse 105 + crossfade 12 + chapters 3,444 + close
150 = **3,711**.

| State | Frames (moves counted with the Work state) | Share | Rule |
|---|---|---|---|
| Work | 402–586 (185) · 705–971 (267) · 1095–1362 (268) · 2048–2158 (111) · 2489–2599 (111) · 3082–3262 (181) · 3322–3506 (185) = **1,308** | **35.2%** | ≤ 45% ✓ (target 40%) |
| Detail | **0** | 0% | ≤ 6% ✓ |
| Wide (incl. split 2846–3025) | **2,403** | **64.8%** | ≥ 50% ✓ (target 55%) |

- There are 14 moves, all 21 f.
- No move happens during typing, streaming or cursor travel.
- Move starts are ≥ 90 f apart within each chapter. The closest pairs are
  2048/2138 and 2489/2579, at exactly 90.
- Every chapter starts Wide.

---

## 7. Narration

About 140 wpm. **261 words.**
- Each frame cue is the sentence's first word, and every line ends before the
  next starts (checked in section 10).
- Silence over the title (0–95) and the logo, and in the gaps 1349–1364,
  2485–2599 (the flag push) and 3259–3289.

| Frame | Ch | Line |
|---|---|---|
| 96 | — | Here is where this ends: a dashboard, built by asking. |
| 236 | 1 | Eleanor Price, at Calder & Hale, checks a working draft. |
| 372 | 1 | Before anything runs, the plan says what will be checked, and against what. |
| 545 | 1 | Five findings come back, each one a mark in the draft. |
| 690 | 2 | One decision fixes the house-style wording. |
| 775 | 2 | The accuracy finding cites the ground investigation report, so Eleanor reads the passage and accepts it on its own. |
| 1025 | 3 | Then an existing workflow: the document creator, from her firm's own saved outline. |
| 1195 | 3 | With the sources chosen, Infora shows the plan and writes four sections. |
| 1365 | 4 | In June, Rachel Bowen at Trentmoor Energy needed a monthly return from the four suppliers. She describes it in her own words. |
| 1650 | 4 | The builder's agent drafts the app, filling in each step as it goes. |
| 1820 | 4 | Some choices are hers. Does this table hold contractual data? Yes - so every return needs Trentmoor's acceptance. |
| 2045 | 4 | The agent writes two screens, and the preview fills in. |
| 2178 | 4 | Who may open each screen? The form, every supplier. The dashboard, Trentmoor only. |
| 2395 | 4 | A change, asked for in plain words. |
| 2600 | 4 | Then she confirms what the monthly run may touch, and as whom. |
| 2760 | 4 | She reads the whole app back, and opens it. |
| 2880 | 5 | In October, Sam Kerridge at Netherfold Cabling submits September's return. He sees only his own firm's rows. |
| 3105 | 5 | Rachel accepts it. The totals move, because they count accepted returns only. |
| 3290 | 6 | She runs the analysis. The figures are computed; the agent only writes the sentences. |
| 3500 | 6 | Then she keeps it as a playbook: its shape travels, its rows stay here. |
| 3690 | close | Built by asking, used across two organisations. |

Per chapter: glimpse 10 · ch 1 34 · ch 2 25 · ch 3 25 · ch 4 103 · ch 5 29 ·
ch 6 28 · close 7 → **261**.

---

## 8. Components and data

### 8.1 What the W4 builder creates

| W4 part | File (`src/walkthroughs/w4/`) | Built on (master §5) | Used in |
|---|---|---|---|
| `W4` composition | `W4.tsx` | `WalkthroughFrame`, `AppWindow`, `SplitWindows`, `Caption`, `ChapterBar`, `OpeningTitle` (scenario line), `ClosingLogo` | all |
| Tools page, both seats | `ToolsScreen.tsx` | `ToolsPage` inside `Shell`, `PageHeader` | 1.1, 4.1–4.2 |
| Apps composer (VISION) | `AppsComposer.tsx` | `HumanTyped`, `ChatComposer` styling | 4.1–4.2 |
| QA checker | `QaChecker.tsx` | `QaCheckerSetup` / `PlanCard` / `RunProgress`, `Dropdown` | 1.2–1.8 |
| Editor with findings | `FindingsEditor.tsx` | `Shell` (`nav: null`) + `EditorSecondBar` + `EditorPanes` + `FindingsPanel`, `Mark`, `TrackedChange`, `SourceChip`, `Popover` | 2.x |
| Document creator | `Creator.tsx` | `CreatorScreen` (**the same component and props as W2**: `workPackage`, `related` group), `Shimmer` | 3.x |
| Builder | `Builder.tsx` | `BuilderScreen` = `BuilderConversation` + `StepColumn` + preview slot, `ReadBackCard`, `Receipt`, `Streamed`, `HumanTyped`, `Badge` | 4.3–4.13 |
| Builder preview | `BuilderPreview.tsx` | `KpiDashboard` (`width: 676`, `empty`, `flagAt`), scaled 0.525 | 4.6–4.13 |
| Sam's screen | `SamReturns.tsx` | `ReturnsForm`, `Table` | 5.1–5.2 |
| Rachel's dashboard | `RachelDashboard.tsx` | `KpiDashboard`, `AcceptStrip`, `RunsCard` + `InsightCard`, `KeepPlaybook` | 0.2, 5.x, 6.x, 7.1 |
| Cursor tracks, timing | `cursor.ts`, `timing.ts` | `Cursor`; constants from section 4 | all |

### 8.2 ⚑ LEAD: changes needed before the W4 build

This is the single list of everything outside `src/walkthroughs/w4/` that W4
depends on, updated for revision 2.

**A. `src/data/wrenfield.ts`: new or changed `WT_*` values**

1. `WT_TITLES[3]` **(changed)**:
   - `kicker: 'PILLAR 04'`
   - `name: 'Tools'`
   - **`scenarioLine: 'A QA check, a saved workflow, and a supplier KPI app'`**
     (replaces `deckLine` on the title card; the producer ruling applies to
     all four videos)
   - `glimpseLine: 'Every return accepted, the month analysed'`
   - **`closeLine: 'Built by asking - used across two organisations'`**
   - `chapters: ['QA check','Findings','Workflow','Build','Two seats','Insight']`
2. `WT_PEOPLE`:
   - `SAM.chipLine = 'Netherfold Cabling — Contractor'`
   - `DAN_FERRIS` (`DF`, Ashcombe Civils)
   - `LEAH_MORROW` (`LM`, Wrenfield Plant Hire)
   - `JOE_PELLOW` (`JP`, Wrenbrook Fencing & Reinstatement)
3. `SUPPLIER_KPI.jun`, `.jul` (all four suppliers, master §4.8) and Aug local
   spend for the three suppliers (112,300 / 34,600 / 19,500). These are
   additive.
4. `WT_KPI_STATES` (section 3, S8 table):
   - `before`: `3 of 4` / `nothing yet from Netherfold Cabling`, `0` /
     `nothing waiting`, `66 of 74`, `569 tCO2e` / `15 rows`, `£188k`,
     `sepCarbon 81`
   - `submitted`: `4 of 4`, `1` / `Netherfold Cabling, September 2026`
   - `accepted`: `0`, `93 of 102`, `630 tCO2e` / `16 rows`, `£272k`,
     `sepCarbon 142`
   - plus **`countUpFrames: 30`**
5. `WT_RUN`: `Oct 05, 2026, 11:24 AM` · `Run by hand` · `Rachel Bowen` · `16` ·
   `Wrote one insight` · `1`. `WT_INSIGHT_META` as section 3.
6. `WT_TOOLS.checker`: as revision 1 (covers, covered, result, link).
7. `WT_TOOLS.findings` **(changed)**:
   - `hover.quote = '“Intrusive investigation across the Wrenfield Sidings
     compound … recorded in three of eleven trial pits (WS-TP03, WS-TP07,
     WS-TP09)”'`
   - the counters `5 → 4/1 → 3/2`
   - `pending: [3, 2, 1]`
   - the accuracy defect, suggestion and span (section 3)
8. `WT_TOOLS.creator` **(changed)**:
   - `startState: { styleGuide: true, workPackage: 'Land quality' }`
   - `firmOutline: 'Land quality technical note'`, `firmBadge: 'Your firm'`
   - the sections, as section 3
   - the brief (DEV text)
   - `title: 'Land contamination — Ashcombe Lane parcels'`
   - **the sources taken from W2's `WT_ASK.creatorRelated`** (`related` 3 with
     chips, `other` 3; one shared value, not a copy)
   - `ticked: ['WA-GEO-GIR-004','WA-ENV-BAS-003']`
   - `coversPlan`, `covered`
9. `WT_TOOLS.builder` **(changed)**:
   - `prompt: 'Monthly KPI returns from our four suppliers - deliveries, NCRs,
     safety, carbon, local spend'` (91 characters)
   - `turns` A1…A7, with **Q2a, Q2b and the new A4/R4** (section 3)
   - **`q1Replies: ['Yes — add an acceptance step', 'No — rows never change
     hands', 'What counts as contractual?']`**
   - **`openReplies: ['Everyone the app is open to', 'Trentmoor Energy',
     'Netherfold Cabling', 'More…']`**
   - `steps[7]` `{ title, sub, recorded[] }` with step 4's **`'2 screens · form:
     everyone · dashboard: Trentmoor only'`** → `'… · flags under 90%'`
   - `step4Detail: ['Submit this month’s KPIs — Everyone the app is open to',
     'Supplier KPI dashboard — Trentmoor Energy']`
   - `columns[8]`, `analysisPrompt`, `readBack[7]`, `readBackNote`, the labels
     and badges, `previewEmpty`
10. `WT_TOOLS.sam` **(changed)**: every accepted stamp in the short form,
    `Sep 03, 2026 · Rachel Bowen` / `Aug 04, 2026 · Rachel Bowen` / `Jul 02,
    2026 · Rachel Bowen`. Then `saved: 'Draft · saved 10:58 AM'`, the
    submitted line, the form values and the note.
11. `WT_TOOLS.dashboard`: as section 3, with `keepLabel: 'Call the playbook'`,
    `keepButton: 'Keep this as a playbook'` and the keep notice.
12. **Cross-video, owned by W1:** `WT_REVIEW` / W1's canvas and PDF §2 reads
    `PAH exceedances in three trial pits at Wrenfield Sidings` in every
    version (accuracy must-fix 3). W4's working copy keeps the old wording on
    purpose.

**B. Shared components (`src/walkthroughs/shared/`): props to add**

1. `OpeningTitle`: a `scenarioLine` prop that replaces `deckLine` (all four
   videos).
2. `KpiDashboard`:
   - four tiles;
   - the order tiles → table → charts → insight;
   - `state: 'before' | 'submitted' | 'accepted'`, with `stateAt: F[]`;
   - **`countUp: { from: F; frames: 30 }`**;
   - `insightAt`, `scrollY`, `stripOpenAt` / `stripCloseAt`;
   - narrow layout at `width: 676`, with the `⋯` header;
   - `empty` + `flagAt` for the preview.
3. `StepColumn`:
   - per-step `recorded: Array<{ text; at: F }>`;
   - `waiting: Array<{ from: F; to: F }>`;
   - `detail: { content; openAt; closeAt }` (used on steps 2, 4 and 6).
4. `BuilderConversation`:
   - growing-turn auto-scroll (port of v04 `chat.tsx`);
   - an inline `card` turn;
   - **reply chips that wrap to two rows**, fade when unused, and expose
     per-chip anchors.
5. `CreatorScreen` (shared with W2):
   - `workPackage?: { label; value; hint }`;
   - `sources: { related?: Array<{ ref; reason }>; other: string[]; ticked:
     string[] }`;
   - `startFrom` row with a `firm` badge;
   - `scrollY` keys.
6. `FindingsPanel`: `closeUpAt` and `scrollY`. `Popover` hover card with a
   `locator`.
7. `ToolsPage.newAppField` takes a `ReactNode`.
8. `Shell`: honour `nav: null` (no lit rail item in the editor).

**C. Master-plan edits (the lead's text)**

1. §1 W4 row: the new chapter frames, and the Build allowance (approved).
2. §4.8: the Q1 replies are `Yes — add an acceptance step` / `No — rows never
   change hands`. Remove the non-built `Yes — it’s contractual` from the
   "built punctuation" note (accuracy should-fix 12).
3. §4.8: the turn list gains Q2a/Q2b and the new A4, and the prompt becomes
   91 characters.
4. §2.5 / §4.9 item 8: title cards carry a scenario line, not the deck line.
5. §4.4 dates (accuracy should-fix 16): Netherfold accepted Jul 02, Aug 04
   and Sep 03; Sam's draft saved 10:58 AM.

---

## 9. Vision, rulings and deviations

**Vision and rulings on screen.**

| Element | Mark | Source |
|---|---|---|
| The agent driving the steps from the chat (reopens ADR-0056 addendum ruling 6) | VISION | brief; master §7 item 4. Ruling 6's protections are all visible: every question the built builder computes (contractual data per table, who may open **each** screen) and the ruled run-scope question are asked, each holds `Waiting for you`, and each answer has a receipt and a recorded line. |
| The three-zone builder layout and live preview | VISION | flows B.6.2 |
| Step titles, sub-lines, `The agent asks`, Q1/Q2a/Q2b text, **the Q1 and open-to answer labels**, the read-back, `Check and open`, badges | BUILT-NP | `app-builder.tsx` 61–67, 166–195, 495–503, 630–680, 905–990; `contracts/app-builder.ts` 749–778 |
| Q3 | RULED | ADR-0056 §2b; mockup (shortened) |
| Composer in the Apps card | VISION | flows B.2 / B.6 |
| Sam's and Rachel's app screens, the confirm strip, `Latest insight` | RULED | `returns-app-two-seats.html` |
| Tiles, percentages, the 90% flag, charts, donut, count-up | VISION | flows D-6; master §0 |
| Totals over accepted rows only | RULED (mockup note) / VISION renderer | flows D-5 |
| Acceptance mechanics, the manual run, the runs card | BUILT-NP | T-441; `apps.tsx` |
| Accuracy finding copy, tracked display, pill hover card | VISION over BUILT rendering | flows B.4 |
| Creator work-package field and grouped sources | VISION (flows A.11 route 2), **identical to W2** | accuracy must-fix 4 |
| `Keep this as a playbook`, `Call the playbook` | DEV vocabulary | master §0 |
| US dates with AM/PM in UI | DEV | master §0 ruling 5 |

**Deviations from the master plan, with reasons.**

- **D-1 · Dashboard order is tiles → table → charts → insight**, not the
  mockup's tiles → insight → table. This puts the accepted row next to the
  totals it moves, and the whole dashboard fits one plate. The insight shows
  `No runs yet.` until chapter 6.
- **D-2 · Chapter lengths.** Build is 49.4 s, approved by the producer. QA
  check is −2.5, Findings −1.7, Workflow −3.3 (the producer ruled the
  compression), Two seats +0.4 and Insight +0.4. Total 129.7 s.
- **D-3 · Builder copy cut for time** (the stream rate is fixed): turns are
  merged into A1, A2, A3 and A6. Q3 is shortened, and Q2b is shown as its
  first sentence (its full built text is the same as Q2a's after the screen
  name). Q1 and Q2a are verbatim built.
- **D-4 · 22 chapter captions** against "about 12–16". The build has seven
  acts, and the reviews added the time jumps, the preview and the totals rule.
- **D-5 · (Resolved.)** Revision 1 asked who may open the dashboard only. Both
  screens are now asked (accuracy must-fix 1).
- **D-6 · Rachel types her Q1 answer** (master §4.8). The built chips show and
  fade unused.
- **D-7 · Eleanor's Tools page shows `No apps yet.`** Her firm isn't in the
  app's scope.
- **D-8 · Creator.**
  - The built defaults are kept.
  - The brief is reworded for a technical note.
  - The opening state (style guide ticked, work package set) and the source
    ticks happen inside two skips, which the captions name.
- **D-9 · Pending counter** `3 → 2 → 1` is inferred.
- **D-10 · `Saved, but not running yet` is not shown.** No scheduled run is
  ever shown, and the only run is manual.
- **D-11 · Split topbar** collapses the dashboard actions into `⋯`.
- **D-12 · The prompt types a hyphen** (`suppliers - deliveries`). People type
  hyphens. UI-generated copy keeps em dashes.
- **D-13 · Quick-reply chips are the built answer labels**, so they are
  `Everyone the app is open to` plus one per organisation, not invented
  options. Choosing `Trentmoor Energy` from the chips stands in for the built
  per-organisation toggles (VISION small).

**Open for the owner.** None new. Master §7 still lists Sam's chip line,
`Playbooks` against `Kept apps`, the June build date (now said on screen) and
the chat-led builder.

---

## 10. Self-check

**Frame maths.**

- Skeleton 90 + 105 + 12 = 207 ✓.
- Chapters: 207–611 (405) · 612–981 (370) · 982–1362 (381) · 1363–2845 (1,483)
  · 2846–3277 (432) · 3278–3650 (373) = **3,444** ✓.
- Close 3651–3800 (150), logo 3801–3890 (90), total **3,891 f = 129.7 s ≤
  130 s** ✓.
- Shot contiguity:
  - ch 1: 207–244 · 245–313 · 314–375 · 376–422 · 423–481 · 482–536 · 537–586 · 587–611 ✓
  - ch 2: 612–686 · 687–755 · 756–870 · 871–950 · 951–981 ✓
  - ch 3: 982–1038 · 1039–1082 · 1083–1145 · 1146–1236 · 1237–1311 · 1312–1362 ✓
  - ch 4: 1363–1408 · 1409–1600 · 1601–1697 · 1698–1789 · 1790–1954 · 1955–2047 · 2048–2158 · 2159–2274 · 2275–2369 · 2370–2478 · 2479–2599 · 2600–2752 · 2753–2845 ✓
    - **Gap check:** 1601–1697 then 1698 ✓.
  - ch 5: 2846–2927 · 2928–3010 · 3011–3081 · 3082–3154 · 3155–3277 ✓
  - ch 6: 3278–3321 · 3322–3425 · 3426–3506 · 3507–3573 · 3574–3650 ✓
- Every click is arrival + 8, with T computed from the *scr* distance at the
  live camera. The cut after a click is click + 2 (245, 612, 1601).
- **Typing** is `ceil(n/0.55) + 4·commas + 8·mid-stops`:
  - P = 166 + 16 = **182** (1409–1591);
  - U1 = 119 (1822–1941);
  - U3 = 66 (2399–2465);
  - Enter at +8.
- **Streams** are `ceil(chars/3)`: A1 48 · Q1 87 · A2 38 · A3 47 · Q2a 74 · Q2b
  13 · A4 36 · A5 10 · A6 39 · Q3 48 · A7 8. The insight is `ceil(214/4)` = 54.
- `Working…` ≥ 45: 1601–1645 (45) · 1262–1306 (45) · 482–531 (50) · 3317–3366
  (50) ✓.
- The cameras' centres are inside their clamps:
  - m 1.3: cx ∈ [591, 945], cy ∈ [332, 532] → (870, 531) and (870, 420) ✓
  - m 1.4: cx ∈ [549, 987], cy ∈ [309, 555] → (987, 480) ✓
  - m 1.5: cy ∈ [288, 576] → (870, 576) ✓
  - m 1.6: cx ∈ [480, 1056], cy ∈ [270, 594] → (1056, 470) ✓

**KPI arithmetic.**

| Figure | Working | Shown |
|---|---|---|
| Sep due / on time | 28+40+22+12 = 102 · 27+34+21+11 = 93 | `93 of 102` |
| Sep without Netherfold | 40+22+12 = 74 · 34+21+11 = 66 | `66 of 74` |
| Carbon by month | Jun 70+58+31+12 = 171 · Jul 67+56+29+11 = 163 · Aug 64+55+25+10 = 154 · Sep 61+52+21+8 = 142 | 171/163/154/142 |
| Carbon since June | 171+163+154+142 = 630 · 630 − 61 = 569 | `630` / `569 tCO2e` |
| Sep point before acceptance | 142 − 61 = 81 | 81 |
| Rows | 4 × 4 = 16 · 15 before | `16 rows` / `15 rows` |
| Local spend Sep | 84,200+126,500+38,900+22,400 = 272,000 · −84,200 = 187,800 | `£272k` / `£188k` |
| On time by supplier | 27/28 = 96.4 · 34/40 = 85.0 · 21/22 = 95.5 · 11/12 = 91.7 | 96 / 85 (flagged) / 95 / 92 |
| Insight 1 | 93/102 = 91.2%; Aug 81/86 = 94.2%; difference 3.0 | "91%, down 3 points" |
| Insight 2 | late: 1 + 6 + 1 + 1 = 9 | "6 of 9" |
| Insight 3 | (154−142)/154 = 7.8% | "fell 8% to 142" |
| Insight 4 | NCRs Aug→Sep 2→2, 3→3, 1→1, 0→0 | "No supplier’s NCR count rose by more than 10%" |
| Sam | form 28/27/2/0/61/84,200 · table Aug 26/25/2/64, Jul 24/24/1/67, Jun 22/21/1/70 | ✓ |

**Claims.**

- There are no "verified", "approved", "real-time", "learns", "trains" or
  "template" words.
- Only the mechanical fix is bulk-accepted.
- Only library references carry pills.
- No seat sees across the wall:
  - Eleanor never sees the app or the PEA;
  - Sam never sees totals, other suppliers or the insight;
  - Rachel never sees Sam's draft or a run's internals.
- **No access question is skipped:** contractual data, the form, the
  dashboard and the run scope are all asked.
- The schedule is never shown running. The run is attributed to Rachel. The
  figures are computed.

**Vocabulary.**

- The UI says playbook, never template.
- Sam's chip line is Contractor.
- "Workflow" appears only as the chapter name and in the narration's
  "existing workflow".
- Agent labels are `The builder’s agent` / `AGENT` (built and mockup).

**Punctuation.**

- Captions, title and narration use hyphens only. The em-dash scan of every
  caption is clean (cues 7, 17, 18 and C use " - ").
- UI copy keeps the built em dashes (`Draft — not yet open to anyone`, `Yes —
  add an acceptance step`, `No — rows never change hands`, `Calder & Hale —
  working area`, the agent's `Done — …`). Curly quotes are as built. The
  project name keeps its en dash.
- The prompt's typed hyphen is a person's typing (D-12).

**Narration timing** at 140 wpm (end = start + words × 12.86 f):

| Line | Start → end | Next start |
|---|---|---|
| 96 | → 225 | 236 |
| 236 | → 365 | 372 |
| 372 | → 539 | 545 |
| 545 | → 686 | 690 |
| 690 | → 767 | 775 |
| 775 | → 1019 | 1025 |
| 1025 | → 1192 | 1195 |
| 1195 | → 1349 | 1365 |
| 1365 | → 1648 | 1650 |
| 1650 | → 1817 | 1820 |
| 1820 | → 2039 | 2045 |
| 2045 | → 2174 | 2178 |
| 2178 | → 2345 | 2395 |
| 2395 | → 2485 | 2600 |
| 2600 | → 2754 | 2760 |
| 2760 | → 2876 | 2880 |
| 2880 | → 3099 | 3105 |
| 3105 | → 3259 | 3290 |
| 3290 | → 3470 | 3500 |
| 3500 | → 3680 | 3690 |
| 3690 | → 3780 | logo 3801 ✓ |

The total is 261, within 260–290 ✓.

---

## 11. Revision log

**Revision 2 (2026-10-05)**, against `review-accuracy.md`, `review-viewer.md`
and the producer's rulings.

- **Accuracy must-fix 1:** "who may open" is asked for **both** screens (Q2a
  for the form in full, Q2b for the dashboard) with the **built** answer
  labels. A4, R4 and the step 4 recorded line and detail are rewritten.
  Caption 13 is "Rachel decides who opens each screen", with narration to
  match. D-5 is resolved.
- **Accuracy must-fix 2 and viewer change 1:** caption 9 is "In June, Rachel
  describes the app she needs", and caption 17 is "October - Netherfold
  submits its September return". Narration says "In June" and "In October".
- **Accuracy must-fix 4:** the creator is drawn as in W2, with the
  work-package field (`Land quality`) and the sources grouped `RELATED IN THE
  PROJECT ONTOLOGY` / `OTHER LIBRARY DOCUMENTS` (shared data, same chips).
- **Accuracy must-fix 5:** the editor rail has no lit item (`nav: null`).
- **Accuracy must-fix 3 (cross-video):** recorded for W1 in 8.2 A-12. W4's
  copy is noted as an older working copy.
- **Accuracy should-fixes 12–15:**
  - the Q1 chips use the built labels;
  - caption labels are aligned to the chapter bar (cue 3 ends by 615; cues 4
    and 17 come in on the flip);
  - cursor fade notes now sit inside their own shots;
  - Sam's stamps use the short form.
- **Should-fix 16:** the date additions are listed for the lead (8.2 C-5).
- **Viewer change 2:** two Work m 1.6 pushes on the preview (the fill, and the
  flag). They are funded by the 91-character prompt (−61 f) and the creator
  compression.
- **Viewer change 3:** Work m 1.3 on the tiles, row and strip, a 30 f
  count-up, a 45 f hold at Work then Wide on the charts, and the caption
  "Totals count accepted returns only". Caption 19 becomes "Rachel accepts
  Netherfold's return".
- **Viewer change 4:**
  - the creator is compressed: the basics and the source ticks happen inside
    two skips, and it goes straight from `See the plan` to accept;
  - chapter 3 runs 12.7 s, down from 16;
  - the accuracy hover holds 100 f with a trimmed quote.
- **Viewer change 5:** the close is "Built by asking - used across two
  organisations".
- **Producer:** the title card carries the scenario line `A QA check, a saved
  workflow, and a supplier KPI app`. Build is 49.4 s (approved). The total is
  129.7 s (≤ 130 s hard).
- **Trims that fund the above** (non-action holds only):
  - ch 1 result hold −15;
  - ch 2 tracked display −15;
  - ch 3 holds;
  - ch 4 "think" waits 12 → 8, and read-back hold 34 → 28;
  - ch 5 split hold 80 → 60, and charts hold;
  - ch 6 insight hold 70 → 60, and notice 60 → 45.
- **Added:** a preview caption (cue 12), and section 8.2 restructured as the
  lead's pre-build list.

**Revision 1 (2026-10-05):** the first plan, at 129.9 s.
