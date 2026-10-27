# Pillar walkthroughs: the master plan

Written 2026-10-05 by the lead director for the four pillar walkthroughs
(`BRIEF.md`, beside this file). It sets the rules every per-video director works to. Each
director writes `wN-<slug>/plan.md` (a shot table) and `wN-<slug>/narration.md`, and
builds in `demo/studio/src/walkthroughs/wN/`.

**In plain words.** We are making four product demos of about two minutes
each, one per pillar of the owner's deck. Each one follows a single, real piece
of work through the product, with the whole app on screen most of the time, a
real cursor, believable typing, and a short caption under the app that says
what is happening. Built screens copy the screenshots. Unbuilt screens are
drawn in the same design language and marked as vision in our own notes. They
never appear as different-looking UI. The videos are silent. Each one also gets
a narration script.

**Which source wins.** This file wins over the research files on shared rules
(grammar, shell, cast, dates). The research files win on screen copy and layout
for their own beats: `research/flows-docmgmt-collab.md` (videos 1 and 3) and
`research/flows-context-tools.md` (videos 2 and 4). The producer's rulings,
repeated in §0, win over both.

---

## Final revisions (2026-10-05, after the per-video plans)

**In plain words.** The four directors' plans are final and they now win on
their own timing and copy. The title card shows a short line saying what this
video's story is, not the deck's tagline. The data file has been brought into
line with the plans, and where this file's §4 strings differ, the data file
(and the per-video plan) wins.

- **Totals** (each plan's §2): W1 **3,837 f** (127.9 s; Review +9 s and
  Respond +4 s over the ±3 s allowance, accepted); W2 **3,517 f** (117.2 s;
  Connections −5 s); W3 **3,525 f** (117.5 s); W4 **3,891 f** (129.7 s; Build
  +17.4 s, producer-approved). Chapter lengths live in `WT_TITLES[n].chapters`
  as exact frames.
- **Title rule (replaces §2.5's third row and §4.9 item 8):** the third row is
  the **scenario line** (`WT_TITLES[n].scenarioLine`), same type and motion.
  `deckLine` stays in the data for reference only.
- **Data that supersedes §4:** `WT_REVIEW` (comment 1, response 1, Owen's
  answered comment, `internalAnsweredLine`, `recordSubtitle`), the new
  `WT_MST_TEXT` (§2 reads "in three trial pits at Wrenfield Sidings" in every
  version) and `WT_CODES`; `WT_DATES` additions (Owen's response 08:18,
  Eleanor's reply Oct 02 11:05, Sam's draft 10:58 AM, W1's day strings);
  `WT_ASK` (shorter Q1, Q3 now about ecological receptors with rewritten 3R/3E
  answers and footers, run lines, the ontology's revised sub, edges, facet
  counts and regions); the new `WT_CREATOR_PAGE` and `WT_CREATOR_SOURCES`
  (one value for W2 and W4; the BAS reason chip is `A source of the accepted
  method statement`); `WT_GIR_PDF_P1`; `WT_COLLAB` replaced by W3's block
  (sandbox `Ashcombe Brook crossing`, document `Land quality and ecology
  interface`, no `with` line, the dewatering thread); `WT_TOOLS` (findings,
  creator, the builder's turns with Q2a/Q2b and the built reply labels
  `Yes — add an acceptance step` / `No — rows never change hands`, Sam's short
  stamps, the dashboard and playbook strings); `WT_KPI_STATES` (`nothing
  waiting`, Sep carbon, a 30 f count-up); `WT_RUN` / `WT_INSIGHT_META`.
- §4.8's note about the built punctuation `Yes — it's contractual` is
  withdrawn: that label is not built.
- Shared versus local components: see the "Walkthroughs" section of
  `demo/studio/README.md`.

---

## 0. Producer rulings, and how this plan applies them

| Ruling | How it applies |
|---|---|
| A walkthrough, not an advert | No sales cards between steps, no blur, no Greek. Of the first set's readability kit, only the camera survives (§2.6). |
| App window ~1680×945 on the quiet field | Fixed on screen. The camera moves *inside* the window, so the window never grows over the caption band (§2.2). |
| Build at 1536×864 native, ×1.25 | `1536×864 × 1.25 = 1920×1080` is the **plate**: the app at screenshot density. At Wide, the window shows the whole plate at 0.875 of that (1680×945), so the UI sits at **1.09375 screen px per native px**. Work and Detail magnify the plate inside the window (§2.6). Every native measurement transfers 1:1 from the 1440-wide screenshots, with the extra 96 px going to the main pane. |
| Captions use hyphens. Product UI keeps the built punctuation | **Important for videos 2 and 4.** `flows-context-tools.md` swapped the built em dashes for hyphens in its UI strings. Put them back: `Calder & Hale — working area`, `Not used for AI answers — superseded`, `Draft — not yet open to anyone`, `Done — 1 suggestion on the document.` The project name keeps its en dash: `Wrenfield–Ashcombe 400kV Connection`. Vision UI copy follows the built style (em dashes). Captions, titles and narration use hyphens. |
| CONTEXT.md wins over stale built copy | Product UI says **playbook**, not template: `Keep this as a playbook`, `Your firm's playbooks`. The agent label stays `Infora agent` (a role, not a persona). Captions say "status code", never "suitability". |
| Captions are plain English | ≤ 8 words, present tense, no ADR numbers or internal shorthand (§2.4). |
| Accuracy over flash | Every shot carries a status mark (§6.2). Nothing contradicts an accepted ADR or `demo/archive/2026-10-sizzle/research/product-inventory.md` §3.3. Vision screens proposed in the flows files are used as drawn there. |
| KPI dashboard: polished vision; two-seat access per the mockup | The dashboard opens to Trentmoor Energy only. Netherfold sees its form and its own returns. Totals count **accepted rows only**, and the video shows the totals change when Rachel accepts (§4.7). |
| Silent render, plus narration | 135–145 wpm, 260–290 words per video, written per chapter (§6.5). |
| 110–130 s at 30 fps | Each video is 3,300–3,900 frames. Targets in §1. |

**Other conflicts ruled here** (each applies to all four videos):

1. **Library row `WA-EIA-MST-001 C01` keeps its built suitability `● S2`.**
   This overrides flows-context D-27. The column is the plan's authoring
   metadata, not the verdict. Don't zoom on it. The verdict `A1 — Published —
   authorized and accepted` is shown on the status page.
2. **The world has one membership list.** The four suppliers are member
   organisations (video 4 needs them). So the sandbox wizard's organisation
   list in video 3 shows all six member organisations, and Rachel ticks two.
   Halvern Associates is not a member and never appears.
3. **Owen Vance is Calder & Hale's internal QA reviewer** (as in the seed)
   everywhere. Video 3 uses him as the project member who is *not* in the
   shared sandbox. This replaces wrenfield.ts's vision casting of him as
   "package lead".
4. **Sam Kerridge's chip line is `Netherfold Cabling — Contractor`.** The
   built code labels every non-owner "Consultant". "Supplier" (in wrenfield.ts)
   is not a CONTEXT role, while "Contractor" is. Flagged for the owner.
5. **Dates use the built US order** in product UI: `Sep 02, 2026` and
   `Sep 02, 2026, 08:28 AM`, everywhere, including vision and mockup-based
   screens (the mockup's `4 Aug 2026` becomes `Aug 04, 2026`). Captions avoid
   dates.
6. **Don't show the internal-QA verdict modal** (`13-qa-verdict.png`). Its
   text is wrong for an internal round (flows-docmgmt §E row 2). Cut from
   Owen's click straight to the promotion window.
7. **The existing first-set data must not be reused where it disagrees with
   the built product.** That covers `COMMENTS`, `WALL_NOTICE`, `RESPONSE_LINE`,
   `STEPS` (plain step names), `KPI_APP.q1/q2/q3` (paraphrased questions),
   `GIR_LOCATOR` (shows a section) and `DATES`. Use the new `WT` values (§4.9).

---

## 1. The four videos

All four share one skeleton (§2.1): a 3 s title, a 3.5 s glimpse of the end
state, the chapters, a 5 s close on the end state, and a 3 s logo. That fixed
furniture is 447 frames (14.9 s). The chapter durations below are targets.
Each director may move up to ±3 s between chapters, provided the total stays
within 110–130 s.

### Video 1: Document management (W1)

- **Title:** Pillar 01 · Document management
- **Deck line:** "Best-in-class information management, seamless by design."
- **Workflow.** Calder & Hale's Eleanor Price drafts the Land Quality method
  statement, `WA-EIA-MST-001`, in her firm's working area. She binds it to its
  slot in the plan. Owen Vance checks it in-house. Eleanor promotes the checked
  version to the client, Trentmoor Energy, with the plan's details locked and
  Rachel Bowen confirmed as lead reviewer. Rachel accepts the appointment,
  opens the round, and comments on the PDF itself. On the other side of the
  wall, Eleanor sees only that a review is under way. Rachel issues the
  comments back with an S0 code. Eleanor answers every one, either pointing at
  the change or saying "no change" and why, and promotes P02. Rachel reads the
  review record, where every comment sits beside its answer, and accepts with
  A1. The contractual revision C01 is issued, the document enters the project
  library, and the AI may now rely on it.
- **Glimpse and close:** the accepted status page (`27-accepted-status.png`
  layout): all four steps done, `● Accepted`, current revision `C01 — issued
  on acceptance`, and no amber "Not used for AI answers" pill. Close caption:
  "Accepted - now part of the project record."

| # | Chapter | Target | Seat | What happens | Screens (basis) |
|---|---|---|---|---|---|
| 1 | Draft | 18 s | Eleanor | The plan row is `● In production`. She binds the draft to `WA-EIA-MST-001`, sees the `Bound to WA-EIA-MST-001.` banner, and opens it in the Editor. | `02`, `07`, `08`, `09` · BUILT |
| 2 | Check | 10 s | Eleanor → Owen | Freeze: `● Checked out — frozen, read-only`. Owen's internal QA round, one S0 comment visible; he picks the verdict A1 and clicks `Close & issue the round`. Cut (ruling 6). | `11`, `12` · BUILT |
| 3 | Promote | 14 s | Eleanor | The promotion window: `Source version P01 — accepted by internal QA`, `FROM THE PLAN ● Locked`, Rachel `● Confirmed`, target `Sep 16, 2026`. Click `Promote`, then the banner. | `13a`, `14` · BUILT |
| 4 | Review | 24 s | Rachel, then split | `Accept the appointment`, then `Acknowledge submission`. She anchors on "Conceptual site model", types comment 1, sets S0, and clicks `Comment` (comments 2 and 3 are already there after a time skip). **Split:** Rachel's three comments next to Eleanor's amber "withheld" notice. Rachel closes the round: S0, `Issue for revision`. | `15a`, `16`, `17`, `18`, `19`, `21` · BUILT |
| 5 | Respond | 20 s | Eleanor | The issued round shows `● Responding`. She types response 1 and ticks `No change was made` with a reason on comment 3. `3 of 3 comments answered`. She promotes P02 (the window again, at a glance). | `22`, `23`, `13a` · BUILT |
| 6 | Accept | 19 s | Rachel | The review record pans down: every comment paired with its answer. `A1`, `Close & issue the round`, `Accept & publish`. The status page shows `● Accepted` and C01. The library row reads C01. | `24a`, `25`, `27`, `26` · BUILT |

Chapters total 105 s. Video total about **120 s** (3,597 frames).

### Video 2: Context layer (W2)

- **Title:** Pillar 02 · Context layer
- **Deck line:** "Every document feeds a living ontology, and every new
  document starts from it."
- **Workflow.** Rachel Bowen opens Trentmoor's project library: accepted
  deliverables (C01 has just joined) and reference material. Opening the
  ground investigation report shows its live revision, with v1 superseded and
  out of the AI's reach. In "How the library connects", the accepted method
  statement arrives, and three links are proposed to the documents it draws
  on. Rachel confirms each one. Eleanor Price starts a new document with the
  document creator, and the related documents surface first among the sources
  she may bind. Then she asks a question in Ask under the Planning &
  Environmental Lens. The answer joins three documents, and every claim
  carries its source. She opens one source, and the cited passage is
  highlighted on the live revision. Finally, the same question about protected
  species is asked from two seats: Rachel's answer draws on Redgate's
  appraisal, while Eleanor's comes only from what she may see.
- **Glimpse and close:** Eleanor's Ask with answer 1 complete and the
  `WA-GEO-GIR-004 · v2 ● Live` source panel open on the highlighted passage.
  Close caption: "Every answer from the record, every claim sourced."

| # | Chapter | Target | Seat | What happens | Screens (basis) |
|---|---|---|---|---|---|
| 1 | Library | 14 s | Rachel | Project library, both tables. Open `WA-GEO-GIR-004`: the document modal, plus the revision strip `v2 · Live · used for AI answers` / `v1 · Superseded Sep 01, 2026 · not used for AI answers`. | `26` BUILT; modal BUILT-NP; strip VISION (flows-context A.4) |
| 2 | Connections | 20 s | Rachel | "How the library connects": the reference nodes. `WA-EIA-MST-001 · C01` fades in under Land quality, and three dashed `suggested` edges appear. Rachel clicks `Confirm` ×3, and the lines go solid. | VISION screen (A.6); confirm controls BUILT (`ontology-panel.tsx`) |
| 3 | New document | 16 s | Eleanor | Sandbox → `Create with AI`. On "Sources this draft may use", the `RELATED IN THE PROJECT ONTOLOGY` group comes first, with reason chips. She ticks `WA-GEO-GIR-004` and `WA-ENV-BAS-003` herself (nothing is pre-ticked). | `t1-07`, `t1-14` BUILT; related group VISION (A.11 route 2) |
| 4 | Ask | 22 s | Eleanor | Rail → Ask. Lens `Planning & Environmental`, chip `▤ 6 sources`. She types Q1, and the "What ran" rail ticks through its stages. Answer 1 arrives claim by claim, each with its source pill, then the footer `6 cited claims · Composed for this question · Planning & Environmental Lens v1`. | Ask BUILT-NP (cleaned layout, D-14); live rail VISION (D-13) |
| 5 | Sources | 12 s | Eleanor | She clicks the `WA-GEO-GIR-004` pill after claim 4. The source panel shows `WA-GEO-GIR-004 · v2 ● Live` and `Cited passage · page 14`, with the passage highlighted. A 3 s Detail shot. | Panel BUILT-NP; highlight and locator VISION (A.9) |
| 6 | Access | 18 s | split | Q3 asked in both seats. Rachel (`▤ 7 sources`) gets answer 3R, citing `WA-ECO-PEA-001`. Eleanor (`▤ 6 sources`) gets 3E, citing only `WA-ENV-BAS-003`. Nothing is greyed or counted. | Ask BUILT-NP behaviour (A.10) |

Chapters total 102 s. Video total about **117 s** (3,507 frames).

### Video 3: Collaboration (W3)

- **Title:** Pillar 03 · Collaboration
- **Deck line:** "Shared spaces across organisations. No attachments, no lost
  work."
- **Workflow.** Rachel Bowen, for the project owner, opens a shared working
  area for exactly two people from two firms: Calder & Hale's Eleanor Price
  and Redgate Ecology's Nadia Okonjo. Owen Vance, on the same project but not
  named, sees nothing of it. Eleanor creates a new document there. She and
  Nadia open it at the same time: each sees the other's avatar, and Nadia's
  caret is flagged with her name as she writes the ecology paragraph. Eleanor
  asks the agent, from the document's own chat, for a paragraph on dewatering
  and the brook, pulling two references in from the library. The agent's
  cited suggestion appears in both canvases and in one shared thread. Nadia
  checks a source and accepts it. Then she raises a point on "trenchless" with
  an @mention. Eleanor answers it and closes the thread.
- **Glimpse and close:** the split, both editors showing the accepted
  paragraph with its source pills, both presence avatars, and the resolved
  thread line `Resolved by Eleanor Price · Oct 02, 2026, 11:06 AM`. Close
  caption: "Two firms, one document, nothing emailed."

| # | Chapter | Target | Seat | What happens | Screens (basis) |
|---|---|---|---|---|---|
| 1 | Shared space | 22 s | Rachel, then Owen | `+ Sandbox` opens the "New sandbox" modal, steps 1–3: name, `Shared — across organisations`, tick Calder & Hale and Redgate Ecology, `Only specific people`, tick Eleanor and Nadia, then `Create sandbox`. The card shows `Shared` · `with Calder & Hale, Redgate Ecology`. A 3 s crossfade to Owen's Sandbox page: only `Personal workspace` and `Calder & Hale — working area`. | BUILT-NP (`sandbox.tsx` wizard), on the `06`/`08` page layout |
| 2 | New document | 10 s | Eleanor | She selects the shared card, clicks `New document`, types the title, and clicks `Create document`. The row shows `v0.1 · Infora text · Oct 02, 2026 ● Unbound`. `Open in Editor`. | BUILT-NP; page `08` |
| 3 | Together | 14 s | split | Both seats in the Editor. Eleanor's doc bar shows `NO`, and Nadia's shows `EP`, in the near-black "editing" fill. Nadia types §2 by hand. In Eleanor's canvas, a remote caret with a `Nadia Okonjo` flag moves along. | Presence BUILT-NP; editing fill, caret and flag VISION (flows-docmgmt B.2) |
| 4 | Ask the agent | 24 s | split (Eleanor drives) | Eleanor types the prompt and inserts two references with `▤ From the library`, then sends. `Working…`, then `Done — 1 suggestion on the document.` The callout fills in **both** canvases. Nadia's thread shows `Eleanor Price · Calder & Hale` above the prompt. | Callout and chat BUILT-NP; shared thread RULED (ADR-0039), named labels VISION (B.3) |
| 5 | Accept | 13 s | split (Nadia drives) | Nadia hovers the `WA-GEO-GIR-004` pill, and a passage hover card shows the quote. She clicks `✓ Accept`. The text lands in both canvases as a green tracked insert, then settles. | BUILT-NP; hover card VISION (small) |
| 6 | Discuss | 16 s | Nadia → Eleanor | Nadia selects "trenchless" and comments `@Eleanor Price can we confirm pit locations against the FRA?`. Eleanor's rail shows `Notifications 1`. She replies `Confirmed — both pits sit outside Flood Zone 3 per WA-WAT-FRA-001.` and clicks `Close`. | BUILT-NP (`comments-panel.tsx`, T-331) |

Chapters total 99 s. Video total about **114 s** (3,417 frames).

### Video 4: Tools (W4)

- **Title:** Pillar 04 · Tools
- **Deck line:** "Purpose-built AI, and an app builder that lets teams extend
  it themselves."
- **Workflow.** Eleanor runs the QA checker on a working draft. She sees the
  plan and what it will cover before anything runs, then runs it. Five
  findings land as marks in the draft. She accepts the one mechanical
  correction in a single decision, and reads and accepts the accuracy finding,
  whose source is the ground investigation report. She then runs an existing
  workflow: the document creator from her firm's own saved outline, with two
  bound sources, a plan she accepts, and a new four-section document. Then
  Rachel Bowen describes, in her own words, a monthly KPI return from
  Trentmoor's four suppliers. The builder's agent drives the seven steps from
  the chat. Each answer lands visibly in a step, and the three questions that
  decide who sees what cannot be skipped. A live preview fills in as it goes.
  Rachel checks and opens it. Then the two seats: Sam Kerridge at Netherfold
  submits September's return and sees only his own rows. Rachel's dashboard
  shows it waiting, she accepts it, and the totals move, because they count
  accepted rows only. She runs the analysis, reads the insight, and keeps the
  app as a playbook for the next project.
- **Glimpse and close:** Rachel's polished `Supplier KPI returns` dashboard
  after acceptance and the run: `93 of 102`, `630 tCO2e`, Ashcombe Civils'
  bar amber under the 90% line, and the latest insight card. Close caption:
  "One app, each firm sees its own."

| # | Chapter | Target | Seat | What happens | Screens (basis) |
|---|---|---|---|---|---|
| 1 | QA check | 16 s | Eleanor | Tools → `QA checker`. The draft is chosen, `Full check`, five checks. `See the plan` shows `Covers: 6 sections · 5 checks · …`. `Run the check` → `Running the check` → `5 findings, anchored in the draft.` | `t1-01`, `t2-02`, `t2-05`, `t2-06-*` · BUILT |
| 2 | Findings | 14 s | Eleanor | The Editor with marks. `Accept 1 mechanical correction` turns `routewide works` into `scheme` as a tracked change. The accuracy finding (`● Required`, pill `WA-GEO-GIR-004`) → `Accept`. `3 open findings, 2 resolved.` | `t2-07`, `t2-10` BUILT; Accuracy group copy VISION over BUILT rendering (B.4) |
| 3 | Workflow | 16 s | Eleanor | `Document creator` → `Start from:` `Land quality technical note` `Your firm`. The sections fill. Sources `WA-GEO-GIR-004` and `WA-ENV-BAS-003`. `See the plan` → `Accept the plan and create the document` → `Covered: 4 of 4 sections written · 2 of 2 bound sources used · 1 drafting pass`. | `t1-03`…`t1-12` · BUILT |
| 4 | Build | 32 s | Rachel | Tools → `New app` → the chat-led builder. Rachel's prompt, then the agent fills steps 1–7. The three questions (contractual data; who opens the dashboard; what the monthly run touches) each hold a `Waiting for you` pill until answered. The preview fills. `Check and open` → `Open as version 1`. | VISION (chat drives steps: reopens ADR-0056 addendum ruling 6); steps, questions and read-back BUILT/RULED (flows-context B.6) |
| 5 | Two seats | 14 s | split | Sam (`Netherfold Cabling — Contractor`) submits September's return: `Submit to Trentmoor Energy`. On Rachel's side, the row appears `● Submitted` and `Awaiting your decision 1`. She clicks `Accept`, then confirms. Tiles flip: `66 of 74` → `93 of 102`, `569 tCO2e` → `630 tCO2e`. | RULED mockup `returns-app-two-seats.html` over BUILT mechanics; polish VISION (D-6) |
| 6 | Insight | 12 s | Rachel | `Run the analysis now` → the `Latest insight` card. `Keep it for the next project` → `Keep this as a playbook` → `Kept on your firm's shelf as "Supplier KPI returns", version 1. Its tables travelled empty.` | Run and keep BUILT (playbook wording per CONTEXT); insight card RULED (mockup) |

Chapters total 104 s. Video total about **119 s** (3,567 frames).

---

## 2. The walkthrough grammar (exact specs)

All on-screen px below are **screen px on the 1920×1080 stage** unless marked
*native* (the app's own CSS px at 1536×864).

### 2.1 The skeleton (video-local frames)

| Segment | Frames | Notes |
|---|---|---|
| Opening title | 0–89 (90 f) | §2.7 |
| End-state glimpse | 90–194 (105 f) | The window fades in 84–101 over the title's fade-out (80–89). §2.8 |
| Glimpse → start | 195–206 (12 f) | A crossfade of the window *content* only. The frame and caption band stay put. |
| Chapters 1…N | 207 → C | Each chapter **starts on Wide**. |
| Close | C → C+149 (150 f) | Wide on the end state, with the closing caption. §2.9 |
| Logo | C+150 → C+239 (90 f) | §2.9 |

Total = 447 + chapter frames. 30 fps, 1920×1080, no audio.

### 2.2 Field and app window

- **Field:** flat `#f2f1ed` (`C.field`), the whole stage. No texture, no
  vignette, no monitor, no device chrome, no browser bar.
- **App window:** `x 120, y 24, w 1680, h 945` (bottom edge y 969). Radius
  **12** (the 10 native frame radius × 1.09375, rounded). Fill = the app's
  frame `#dedad0`, so the rail sits directly on it. No border.
  - Shadow: `0 1px 2px rgba(20,20,20,.06), 0 18px 48px -14px rgba(20,20,20,.22)`.
  - Content: the Shell (§3) at native **1536×864**, scaled **1.09375**
    (`= 1.25 × 0.875`), clipped to the window by `overflow: hidden` and the
    radius.
- **Caption band:** y 969–1080, free of UI at all times. The camera never
  pushes UI into it, because the camera lives inside the window clip (§2.6).
- **Split layout** (two seats at once): two windows, each **822×910** at
  `(120, 60)` and `(978, 60)`, with a 36 px gap. Each window shows a Shell at
  native **752×832** with the **collapsed rail** (64 native, built) at the same
  1.09375 density. A seat tag sits above each window at y 24–52 (§2.4, 17 px
  variant). Same radius and shadow as the single window. No camera moves in
  split. Use Wide only, and draw a Detail as a separate single-window shot.
- **Entering and leaving split:** a 15 f crossfade (single window out, the
  pair in). Never a slide.

### 2.3 Chapter bar

- **Position:** right-aligned to x 1800, in the caption band, with its text
  baseline aligned to the caption line's baseline (y ≈ 1042). Maximum width
  760. If a video's chapter names overflow it, shorten the names, not the
  type.
- **Item:** numeral (Inter 14 px, weight 600, tabular) + 6 px + name (Inter
  15 px, weight 500). 28 px between items. Above each item, 6 px over the
  cap height, is a **3 px track** the width of the item, radius 2.
  - **Done:** text `#57564f`, track filled `#78766f`.
  - **Current:** text `#1c1b18` at weight 600. The track is `#e0ded8`, with an
    ink `#1c1b18` fill whose width = progress through the chapter (linear,
    frame by frame).
  - **Upcoming:** text `#78766f`, track `#e0ded8`.
- **Motion:** hidden during the title and glimpse. It fades in over 12 f at
  the start of chapter 1. It flips state with the `ui` transition (5 f linear)
  on the chapter's first frame. During the close it holds, all done. It fades
  out with the window at the logo.
- No chapter-intro cards. The bar and the caption label carry the chapter
  change.

### 2.4 Caption block

- **Position:** left edge x 120 (aligned with the window). Two rows:
  - **Label row**, cap top y 990: `2 / 6 · Promote`. Inter 15 px, weight 600,
    `#78766f`, tabular numerals, letter-spacing 0.2 px. Format: `<chapter> /
    <chapters> · <chapter name>`. During the glimpse the label reads `Where
    this ends`.
  - **Seat tag** on the same row, 16 px after the label: an 8 px dot in the
    seat colour + `Eleanor Price, Calder & Hale` (Inter 15 px, weight 500,
    `#57564f`). It names whoever acts in this caption. In a split, the tags
    sit over the windows instead (17 px, weight 600, `#1c1b18`, dot 9 px), and
    the label row carries no seat tag.
  - **Line**, top y 1014: one plain sentence, **≤ 8 words**, present tense,
    hyphens, sentence case, no full stop. Inter 26 px, weight 500, `#1c1b18`,
    line-height 32, maximum width 880, never wrapping.
- **Seat colours** (overlay only, never inside the app): Trentmoor Energy
  `#159a74` · Calder & Hale `#6d5dd3` (Owen, internal QA, `#b8622f`) ·
  Redgate Ecology `#3a6ea5` · suppliers `#8a6d3b`. Add Redgate's colour to
  `C.seat` (§4.9).
- **In:** opacity 0→1 and translateY 6→0 over 9 f (`ease.out`), starting
  **9 f (300 ms) before** the action it labels. The label row animates only
  when its text changes.
- **Out:** opacity 1→0 over 6 f. The next caption starts 3 f after the
  previous one starts leaving.
- **Minimum hold:** `max(75, words × 8 + 24)` frames on screen (2.5 s at
  least).
- **Names:** a person's first caption in a video uses the full name in the
  seat tag. The line may use the first name ("Rachel acknowledges the
  submission").
- **Words:** "sent to the client for review" is fine. Never "real-time",
  "verified", "compliant", "AI-approved", "deleted", "archived", "template"
  (say playbook), or "workflow" as a thing users open, except in the
  chapter name "Workflow" for W4, which names the deck's word. See inventory
  §3.2 and §3.3.

### 2.5 Opening title (0–89)

- On the field, no window. A centred stack, block centre y 520:
  - **Kicker:** `PILLAR 01`, Inter 15 px, weight 600, letter-spacing 2 px,
    uppercase, `#78766f`.
  - 18 px gap, then the **name**: `Document management`, Source Serif 4, 76 px,
    weight 500, `#1c1b18`, letter-spacing −0.5 px.
  - 22 px gap, then the **deck line**: Inter 28 px, weight 400, `#57564f`,
    maximum width 1200, centred, at most two lines, hyphens.
- **Motion:** each of the three rows fades in and rises 8 px over 12 f
  (`ease.out`), 4 f apart, starting at f 4. The rows hold, then all fade out
  over f 80–89 while the window fades in (opacity 0→1, scale 0.985→1, f 84–101,
  `ease.out`).

### 2.6 Camera (inside the window)

The camera magnifies the plate inside the fixed window. Its magnification `m`
is relative to Wide. The UI's screen scale is `1.09375 × m`.

| State | m | Visible native region | Share of runtime | Rules |
|---|---|---|---|---|
| **Wide** | 1.0 | 1536×864 (the whole app) | ≥ 50% (target 55%) | Every chapter starts here. The close is here. |
| **Work** | 1.3–1.6 | 1182×665 to 960×540 | ≤ 45% (target 40%) | Frames the active pane, with its edge context visible. |
| **Detail** | 1.8–2.0 | 853×480 to 768×432 | ≤ 6% (target 5%) | ≤ **120 f (4 s)** per use, at most 4 per video: a cited passage, a typed field, a status pill. |

- A camera key is a native centre point plus `m`. The centre is clamped so the
  visible region never leaves the plate: `cx ∈ [768/m, 1536 − 768/m]`, `cy ∈
  [432/m, 864 − 432/m]`.
- **Moves** use `ease.inOut` (`bezier(0.65, 0, 0.35, 1)`):
  - Wide ↔ Work: **21 f** (700 ms)
  - Work pan to Work: 18 f
  - Work ↔ Detail: 15 f
  - Detail → Wide: 24 f
- **Never move** while text is typing or streaming, or while the cursor is
  travelling. Settle 6 f before a click. At most one move per 3 s.
- **Mapping for cursor targets** (single window):
  `sx = 960 + (nx − cx) × 1.09375 × m` and
  `sy = 496.5 + (ny − cy) × 1.09375 × m`,
  where `(960, 496.5)` is the window centre. Directors author every point in
  **native** coordinates and convert through `useAppPoint` (§5), so the cursor
  rides with the camera.
- Each director reports the share of Wide, Work and Detail frames at the foot
  of their shot table.

### 2.7 Transitions between screens

| Situation | Transition |
|---|---|
| Same person moves around the app (rail click, button opens a page) | **Cut** on the click frame + 2 f. The rail's active item flips on the click frame. This is how the product behaves. |
| A modal opens or closes | Scrim and modal fade together over **5 f** (linear). No scale, no slide. |
| A dropdown or popover opens | Fade over 4 f. |
| A banner, receipt or new row appears | The `ui` transition (5 f linear). New table rows fade in 3 f apart. |
| Page scroll inside the main pane | `ease.inOut`, 20–30 f, ≤ 600 native px per move. |
| A different person's seat (a new browser) or a time jump | **Crossfade 12 f** of the window content. The caption's seat tag changes with it. A time jump is said in the caption line ("A week later, Rachel issues the comments"), never in a card. |
| Into or out of split | Crossfade 15 f (§2.2). |
| Anything sliding, pushing, whip-panning or zooming as a transition | **Never.** |

### 2.8 End-state glimpse (90–194)

- The window shows the end state at Wide, frozen, with no cursor and no
  motion.
- The label reads `Where this ends`. The line names the end state in ≤ 8 words
  (W1: "Accepted, issued as C01, in the library"). There is no seat tag.
  Caption in at f 96 and out at f 186.
- The chapter bar is hidden.
- At 195–206 the content crossfades to the first chapter's opening state.

### 2.9 Close and logo

- **Close (150 f):** if the camera is not Wide, it returns to Wide over the
  first 24 f. The caption keeps the last chapter's label, and the line states
  what is now true. The chapter bar holds with every chapter done. The cursor
  fades out over 6 f in the first 12 f. Nothing else moves.
- **Logo (90 f):** the window, caption and chapter bar fade out over f 0–11
  (`ease.out`). The **wordmark** (`Wordmark size={72} tone="onField"`: a 72 px
  near-black square with radius 16, a 32 px gap, then "Infora" in Source Serif
  4 at 72 px) fades in over f 6–20, centred at (960, 540). It holds to the
  last frame. No tagline, no URL.

### 2.10 Cursor

- **One cursor per acting seat**, screen-space, outside the camera transform,
  positioned through `useAppPoint`. In a split, each window has its own cursor
  for that seat. Only the seat that is acting shows one (the other fades out
  over 6 f after 1 s idle).
- **Shapes** (30 px, ink with a 1.6 px white outline and drop shadow
  `0 2px 4px rgba(0,0,0,.25)`):
  - **arrow:** the default.
  - **hand:** over buttons, links, rows, pills and checkboxes, switching 4 f
    before arrival.
  - **I-beam:** over text inputs, textareas and the editor canvas, 22 px tall.
- **Speed:** the travel time per move is
  `T = clamp(15, 10 + d / 45, 27)` frames, where `d` is the screen distance in
  px. That is an average of 35–45 px/frame and 0.5–0.9 s per move. Each move
  eases `inOut` along a slight arc (control point offset 6% of `d`,
  perpendicular, consistent side per video).
- **Click:** arrive, **dwell 8 f** (≈ 250 ms), then click.
  - On the click frame, the cursor scales 1→0.88→1 over 6 f, and a ring grows
    0→44 px over 12 f at opacity 0.25→0 (as in the existing `Cursor`).
  - A primary button presses at the same frame (`pressScale`: 0.97 over 3 f).
  - The UI responds at click + 2 f.
  - **Dwell 6 f** after the click before the next move.
- **Hover feedback** in the UI from the arrival frame: secondary button and
  nav item fill `#e5e3dc` (rail) or `#efeeeb` (pane), primary `#000000`, table
  row `#faf9f7`.
- **Text selection** (anchoring a comment): press, then drag at 20 px/frame
  across the words, release. The selection tint appears under the dragged
  span as it grows.
- **Idle:** the cursor never jitters. It fades out (6 f) after more than 3 s
  with nothing to do, and fades back in 10 f before its next move.

### 2.11 Typing and streaming

- **People type** at an average of **0.55 characters per frame**
  (16.5 per second). Use a seeded cadence: per-character gaps drawn from
  `{1, 2, 2, 2, 3}` frames, +4 f after a comma, +8 f after a full stop
  mid-string, and no pauses inside a word.
  - Caret: 2 px, ink, blinking 15/15 f when idle.
  - Enter or Send: 8 f after the last character.
  - **Maximum 120 typed characters per field.** Longer copy is rewritten
    shorter (the shortened strings are in §4), or it arrives pre-filled
    after a time skip.
- **Field values set by a person from a list** (select, checkbox): a click,
  never typing.
- **The agent never types.**
  - Chat replies stream at **3 characters per frame** (the existing
    `agentChars`).
  - Document prose (suggestions, Ask claims) streams at **4 characters per
    frame**, one claim at a time, with a 4 f gap between claims. Each source
    pill fades in (`ui`, 5 f) 2 f after its claim's last character.
  - Values the builder's agent writes into a step's form appear field by
    field (`ui`, 5 f, 4 f stagger).
- **Working states:** the built text `Working…` (with the shimmer, never a
  spinner) for at least 45 f. Where a run trace or the "What ran" rail shows,
  it has 3–5 rows, each ticking `○ → ◐ → ●` 15–20 f apart. Waits are always
  compressed, but never instant.
- **Readable hold:** any text the viewer is meant to read stays fully visible,
  unmoved, for at least `words × 8` frames after it completes, before the
  camera or screen changes (`holdFor`).

---

## 3. The shared shell (every seat, every video)

One `Shell` component, at native **1536×864**, copied from `02-plan.png`,
`18-round-open.png`, `26-library.png` and `09-editor.png`. Native coordinates
equal the screenshot's CSS px. The extra 96 px of width goes to the main pane,
and the content column stays 1120 max and centred. Calibrate the type sizes by
overlaying `02-plan.png` at 50% on a render of the Plan page (the existing
`AppShell` calibration of 14.5 px nav labels and 16 px icons matches the
capture).

### 3.1 Frame, panes and the content column

- **Frame:** `#dedad0`, radius 10, no shadow.
- **Rail:** x 0–216, transparent (it is the frame), padding 16/8.
- **Main pane:** x 216 → 1524, y 12 → 852, white, radius 8, pane shadow
  `0 10px 26px rgba(20,20,20,.12)`. The gap to the rail is 0, so the shadow
  falls on the rail.
- **Content column:** the 1120 box is centred in the pane at x 310–1430. Its
  text area is **x 342–1398**, with padding 30/32/60. The page title's cap top
  is at y ≈ 100.
- **Page header pattern:** a serif title (Source Serif 4, 29 px, weight 500)
  with an optional pill. Then a muted 13 px description, max width ≈ 760.
  Then a toolbar (secondary buttons with Lucide icons, one primary on the
  right). Then a table in a card with a hairline border (micro uppercase
  headers, 10.5 px, weight 700, tracking 0.6).

### 3.2 Rail, top to bottom (project view)

1. **Wordmark** at y ≈ 27: an 18×18 `#1c1b18` square, radius 4, an 8 px gap,
   then "Infora" in Source Serif 4 at 21 px. The collapse toggle `«` sits at
   the right (muted, 12 px).
2. **Org line** at y ≈ 68, 12.5 px:
   - Member seats: the bold org name on the left, `All projects ▸` muted on
     the right.
   - Owner seat: `Trentmoor Energy All projects ▸` runs together, left
     aligned (as captured in `18`, `26`).
3. **Project switcher** (y 88–150, x 10–206): fill `#e5e3dc`, radius 8,
   padding 9/12. It holds `PROJECT` (micro), then `Wrenfield–Ashcombe 400kV
   Connection` (13.5 px, weight 700, on two lines), and `▾` muted at the right.
4. **Nav:** row centres at y = 185 + 39n. Each row is a 16 px Lucide icon
   (stroke 1.8) + a 14.5 px label, with padding 9/10 and radius 8. Active row:
   fill `#c9c5b8`, weight 700. Hover: `#e5e3dc`. Inactive: weight 500,
   `#57564f`.

| n | Label | Lucide | Extra |
|---|---|---|---|
| 0 | Home | `House` | |
| 1 | Ask | `Sparkles` | |
| 2 | Editor | `PenLine` | |
| 3 | Plan | `ClipboardList` | |
| 4 | Project library | `BookOpen` | `▸` at the right |
| 5 | Review | `ClipboardCheck` | |
| 6 | Notifications | `Bell` | unread pill when > 0: 18 px tall, ink fill, white 11 px weight 600 numeral, at the right |
| 7 | Sandbox | `Archive` | `▸` at the right |
| 8 | Tools | `Wrench` | |
| 9 | Knowledge | `BookMarked` | |
| 10 | History | `History` | |

5. **User chip** (x 10–206, y ≈ 793–852): fill `#e5e3dc`, radius 8. A 30 px
   near-black round avatar with white initials, then the name (13 px bold) and
   the chip line (11.5 px, `#78766f`, wrapping to two lines).

### 3.3 Seats (exact strings)

| Seat | Avatar | Name | Org line | Chip line | Topbar badge | Videos |
|---|---|---|---|---|---|---|
| Client | RB | Rachel Bowen | `Trentmoor Energy All projects ▸` | `Trentmoor Energy — Owner` | `● Owner` (info: `#e9eff6` / `#274a6d`) | 1, 2, 3, 4 |
| Consultant | EP | Eleanor Price | `Calder & Hale` · `All projects ▸` | `Calder & Hale — Consultant` | `● Member` (success: `#e8f5ea` / `#1a7a3a`) | 1, 2, 3, 4 |
| Internal QA | OV | Owen Vance | `Calder & Hale` · `All projects ▸` | `Calder & Hale — Consultant` | `● Member` | 1, 3 |
| Ecology | NO | Nadia Okonjo | `Redgate Ecology` · `All projects ▸` | `Redgate Ecology — Consultant` | `● Member` | 3 |
| Supplier | SK | Sam Kerridge | `Netherfold Cabling` · `All projects ▸` | `Netherfold Cabling — Contractor` | `● Member` | 4 |

### 3.4 Topbar (inside the main pane, height ≈ 56, hairline below)

- Left: an outlined pill `Wrenfield–Ashcombe 400kV Connection` (1px
  `rgba(20,20,20,.09)` border, radius 999, padding 2/10, weight 600,
  `#57564f`). Then `· Owner: Trentmoor Energy`, muted.
- Right: the seat's role badge (§3.3).
- App pages (W4) replace the left side with the crumb
  `Wrenfield–Ashcombe 400kV Connection · Tools / Supplier KPI returns` (the
  mockup's form).

### 3.5 Editor bars and panes (W1, W3, W4)

- **Second bar** (y 68–120, white, hairline below):
  - A location chip: `Archive` icon + location text. The text is `Calder &
    Hale — project sandbox` in Calder & Hale's working area (the built quirk,
    `09`), or the sandbox's own name for the shared sandbox: `Ashcombe Brook
    crossing — shared working area`.
  - Then `/`, the mono reference if bound, and the bold title.
  - On the right, in order:
    - the presence stack (§5, W3 only)
    - `Freeze` (snowflake, quiet)
    - `⇧ Promote` (primary, only when bound)
    - `● No document controls` (neutral pill)
  - When frozen: `● Checked out — frozen, read-only` (amber) and `Release`.
- **Body:** a sunken `#efeeeb` band with 12 px padding holding two white panes
  8 px apart:
  - **Canvas** (flex 1, padding 42/52/60). Format bar: `B · I | H2 · H3 |
    • List · 1. List · ❝ Quote | 💬 Comment · ✓ Check`, with `Write | Preview`
    on the right. The prose column is 640 max, Source Serif 4 15.5/1.72,
    `#1c1b18`.
  - **Side panel** (348 wide). Tabs `Chat · Comments (n) · Checks (n)`
    (12.5 px, weight 600, a 2 px ink underline on the active tab), with
    `Review (n)` first in review mode. Composer placeholder `Ask for a draft
    into this document`, ✦ glyph, 30 px send button. Chips: `▤ From the
    library` live. `＋ Attach a file`, `≡ Prompts`, `✒ Style`, `◍ Web search`,
    `▧ Sandbox search` and `✳ Model` are shown **greyed** (disabled
    placeholders), never working.
- **In split (752 native):** collapsed rail (64): the wordmark square, nav
  icons centred and the active fill, the avatar only at the foot. The main
  pane is x 64–740. The editor panel is 300 wide and the prose column
  shrinks to fit.

### 3.6 Workspace shell (W4 only, if the playbook shelf is shown)

- **Rail:** wordmark, then a `WORKSPACE / Trentmoor Energy ▾` switcher.
- **Nav:** Home · Ask · Editor · Personal sandbox · Tools · Your knowledge ·
  **Playbooks** (`LayoutTemplate`). The built label is "Kept apps" (T-445).
  `Playbooks` applies the CONTEXT ruling, and is flagged in §7.
- **User chip:** `RB / Rachel Bowen / Trentmoor Energy` (no role).
- **Topbar:** **Trentmoor Energy** `— workspace · the organisation's own
  environment` and a neutral pill `● Org-private — no project context
  reachable here`.

---

## 4. Cast and world (exact strings)

### 4.1 Project and organisations

- **Project:** `Wrenfield–Ashcombe 400kV Connection` (en dash). `Owner:
  Trentmoor Energy`.

| Organisation | Role on the project | People | Used in |
|---|---|---|---|
| Trentmoor Energy | Client, project **owner** | Rachel Bowen (RB) | 1–4 |
| Calder & Hale | Consultant, lead | Eleanor Price (EP), Owen Vance (OV) | 1–4 |
| Redgate Ecology | Consultant, ecology | Nadia Okonjo (NO) | 2 (as producer of the PEA), 3 |
| Netherfold Cabling | Contractor (HV cable supply and pulling) | Sam Kerridge (SK) | 4 |
| Ashcombe Civils | Contractor (trenching, haul roads, the compound) | Dan Ferris (DF) **new** | 4 (table person column) |
| Wrenfield Plant Hire | Contractor (plant and welfare) | Leah Morrow (LM) **new** | 4 |
| Wrenbrook Fencing & Reinstatement | Contractor (fencing, drainage reinstatement) | Joe Pellow (JP) **new** | 4 |

Halvern Associates and Marchwood Aggregates do not appear. Never show
`Marcus Webb`, `Priya Nair` or `Mrs A Patel` (the external-issue coda is cut).

### 4.2 Sandboxes and documents

- `Personal workspace` (each person's own).
- `Calder & Hale — working area` (`Lock` Single organisation).
- `Redgate Ecology — working area` (never shown; it holds Nadia's bat
  activity notes, which stay in Redgate's own space).
- **New in W3:** `Ashcombe Brook crossing — shared working area`, owned by
  Trentmoor Energy. Card meta: `Building2` Trentmoor Energy · `Users` Shared ·
  `with Calder & Hale, Redgate Ecology`. Access: Rachel Bowen, Eleanor Price,
  Nadia Okonjo.
- **W1's deliverable:** `WA-EIA-MST-001` · `EIA Scoping Method Statement —
  Land Quality` · producer Calder & Hale · `EEN` · suitability `S2` ·
  `OFFICIAL` · `DOCX`. Working title before binding: `Land Quality scoping
  method statement — working draft`. Revisions: v0.1 → P01 (round 1, verdict
  S0) → P02 (round 2, verdict A1) → **C01**. Its canvas and PDF say "the
  scheme" in every version (flows-docmgmt §E row 9).
- **The other plan rows:** as `02-plan.png`, unchanged.
- **W3's new document:** `Ashcombe Brook crossing — land quality and ecology
  interface`, v0.1, Infora text, `Oct 02, 2026`, `● Unbound`.
- **W4's drafts:**
  - The checked draft: `Land Quality method statement — Ashcombe Lane working
    copy` (it contains "the routewide works" and "south of the Wrenfield
    substation").
  - The creator's result: `Land contamination — Ashcombe Lane parcels`, v0.1,
    `Oct 05, 2026`, in `Calder & Hale — working area`.

### 4.3 The project library

| Reference | Title | Rev | State | Held by / producer | Date on screen |
|---|---|---|---|---|---|
| WA-EIA-MST-001 | EIA Scoping Method Statement — Land Quality | C01 | Live, accepted A1, suitability pill `● S2` | Calder & Hale | Issued `Sep 29, 2026` |
| WA-ECO-PEA-001 | Preliminary Ecological Appraisal | v1 | Live, not shared with Calder & Hale | Redgate Ecology | Issued `Sep 08, 2026` |
| WA-CON-SCC-002 | Statement of Community Consultation | v1 | Reference | Trentmoor Energy | Loaded `Sep 01, 2026` |
| WA-EIA-SCP-001 | EIA Scoping Report | v1 | Reference | Trentmoor Energy | Loaded `Sep 01, 2026` |
| WA-ENV-BAS-003 | Environmental Baseline Compendium | v3 | Reference | Trentmoor Energy | Loaded `Sep 01, 2026` |
| WA-GEO-GIR-004 | Ground Investigation Interpretative Report | v2 (v1 superseded `Sep 01, 2026`) | Reference | Trentmoor Energy | Loaded `Sep 01, 2026` |
| WA-WAT-FRA-001 | Flood Risk Assessment — Screening Note | v1 | Reference | Trentmoor Energy | Loaded `Sep 01, 2026` |
| WA-HER-DBA-002 | Heritage Desk-Based Assessment | v1 | Withdrawn (never shown) | Trentmoor Energy | — |

- **Reach:** Eleanor's sources chip reads `▤ 6 sources` (the five references +
  MST-001). Rachel's reads `▤ 7 sources` (+ PEA-001).
- **Descriptions and verbatim passages:** flows-context §A.12.1, restoring
  em dashes where the seed has them. The en dash in `1.6–2.1 m` stays. Never
  show the PEA seed's last sentence (a test marker).
- **Source panel locator:** `Cited passage · page 14`. No section number.

### 4.4 Dates (all Sep–Oct 2026; "today" is Mon Oct 05, 2026)

| When | What | Video |
|---|---|---|
| Sep 01 (Tue) | Reference material loaded; GIR-004 v2 supersedes v1. Eleanor's draft v0.1 written: `Infora text · Sep 01, 2026`. | 1, 2 |
| Sep 02 (Wed), 08:10 AM | Frozen as v0.1. Owen's internal QA comment at 08:14 AM. Accepted by Owen at 08:20 AM. | 1 |
| Sep 02, 08:27 AM | P01 promoted (submitted). Review target `Sep 16, 2026` (10 working days). | 1 |
| Sep 03 (Thu), 09:05 AM | Rachel accepts the appointment and acknowledges. Round 1 opens: `Sep 16, 2026 — 13 days left`. | 1 |
| Sep 08 | PEA-001 accepted into the library (Redgate's). | 2 |
| Sep 10 (Thu), 10:12 / 10:19 / 10:31 AM | Comments 1, 2, 3: `— 6 days left`. | 1 |
| Sep 10, 04:40 PM | Round 1 closed and issued, S0. | 1 |
| Sep 14 (Mon) | Eleanor's three responses (09:30, 09:41, 09:52 AM). | 1 |
| Sep 17 (Thu), 11:15 AM | P02 accepted by internal QA (Owen), then promoted. Round 2 target `Oct 01, 2026`. | 1 |
| Sep 18 (Fri), 08:50 AM | Rachel acknowledges round 2. | 1 |
| Sep 29 (Tue), 03:20 PM | A1, accepted; C01 issued. | 1, 2 |
| Oct 01 (Thu) | September returns accepted for Ashcombe Civils, Wrenfield Plant Hire and Wrenbrook. | 4 |
| Oct 02 (Fri), 10:15 AM | Shared sandbox created. Document created at 10:22 AM. Nadia's comment at 10:58 AM. Resolved at 11:06 AM. | 3 |
| Oct 05 (Mon) | Eleanor's QA check (09:40 AM) and creator run (10:05 AM). Ask questions (02:10 PM). | 2, 4 |
| Oct 05, 11:02 AM / 11:20 AM / 11:24 AM | Sam submits; Rachel accepts; Rachel runs the analysis. | 4 |
| (never shown) Jun 02, 2026 | The KPI app was built and opened. The read-back's "Last opened…" line is not shown. | 4 |

W4's build chapter is the app as it was built. Its caption makes the jump:
"Months later, the returns are in". This is the one place in the series where
the story crosses months. Flagged in §7.

### 4.5 W1 review strings (shortened for typing where marked)

- **Owen's internal QA comment** (S0, pre-filled): `Cite the GIR by its
  accepted revision, not just its number — the client checks it against the
  library, and this goes out under our name.`
- **Round 1 comments** (Rachel; anchors on p.1):
  1. `“Conceptual site model” — p.1` · `● S0` · **typed on camera** (113
     characters): `The CSM must state the assumed thickness of made ground per
     parcel — the perched water table makes this material.`
  2. `“Asbestos in soils” — p.1` · `● S0` · pre-filled: `State the CAR-SOIL
     screening threshold you will apply; "in line with guidance" is not
     auditable.`
  3. `“route section” — p.1` · no code · pre-filled: `Consider reporting by
     parcel rather than by route section for the appendix tables.`
     (Moderation is not shown.)
- **Responses** (Eleanor):
  1. **Typed** (84 characters): `Made-ground thickness now stated per parcel
     in the CSM table, west of Ashcombe Lane.`. Changed passage, pre-filled:
     `the tiered approach in LCRM Stage 1 before any intrusive scoping`.
  2. Pre-filled: `The screening threshold is now stated per parcel in
     Appendix LQ-2.` Changed passage: `the screening threshold is stated per
     parcel in Appendix LQ-2`.
  3. `No change was made` ticked. Pre-filled: `Route-section reporting is
     retained: the CoCP and the DCO both reference route sections, and parcel
     tables sit in the appendix already.` Reason: `reporting structure follows
     the DCO — parcel detail already in the appendix`.
- **Wall notice** (built, exact): `The round is open. Its comments are
  withheld until the lead reviewer closes the round and issues it —
  reviewer-side positioning is never live to the authoring side.`
- **Verdicts:** `S0 — Work in progress — not yet suitable to share outside
  the task team`, then `A1 — Published — authorized and accepted`. The
  buttons are `Issue for revision` and `Accept & publish`.

### 4.6 W2 Ask strings

- **Q1** (typed, 118 characters): `What did the ground investigation find at
  Wrenfield Sidings, and what does it mean for dewatering near Ashcombe
  Brook?`
- **Answer 1:** six claims with their pills, exactly as flows-context §A.12.3.
  Footer: `6 cited claims · Composed for this question · Planning &
  Environmental Lens v1`. Then the built honesty line, then `Run 3f9c21a0 ·
  Succeeded · every step in the audit trail` (collapsed).
- **"What ran" rail stages:** `Understanding your question` · `Loading
  context` · `Searching project documents` · `Verifying citations` · `Report`.
- **Q3** (typed once, 68 characters): `What protected species survey work has
  been done along the corridor?`. Answers 3R and 3E as in A.12.3. Never show
  a "withheld sources" count.
- **Ontology:** the classifications and edges in flows-context §C, with
  Work package terms `Land quality`, `Water environment`, `Ecology`,
  `Consultation`. The three edges confirmed on camera are `derived from
  WA-GEO-GIR-004`, `derived from WA-ENV-BAS-003` and `references
  WA-WAT-FRA-001`. Eleanor's view never has a PEA node.
- **Creator related group** (vision): `RELATED IN THE PROJECT ONTOLOGY`, with
  `WA-GEO-GIR-004` `Same work package` · `WA-ENV-BAS-003` `Derived-from source
  of WA-EIA-MST-001` · `WA-EIA-SCP-001` `Sets the land quality scope`. Then
  `OTHER LIBRARY DOCUMENTS`.

### 4.7 W3 collaboration strings

- **Wizard:**
  - Step 1: name `Ashcombe Brook crossing — shared working area`, typed (45
    characters); access `Shared — across organisations`.
  - Step 2: six rows: `Calder & Hale`, `Redgate Ecology`, `Netherfold
    Cabling`, `Ashcombe Civils`, `Wrenfield Plant Hire`, `Wrenbrook Fencing &
    Reinstatement`. Rachel ticks the first two.
  - Step 3: `Only specific people`. The rows include `Eleanor Price / Calder &
    Hale`, `Owen Vance / Calder & Hale` and `Nadia Okonjo / Redgate Ecology`.
    She ticks Eleanor and Nadia.
- **Eleanor's prompt:** she types `Draft a paragraph on how dewatering at
  Wrenfield Sidings could affect the Ashcombe Brook, per ` (94 characters),
  then inserts `WA-GEO-GIR-004` and `WA-ENV-BAS-003` as reference tokens from
  `▤ From the library`, typing ` and ` between them.
- **Suggestion:** the four claims of flows-docmgmt §B.3 with their pills. The
  tag line is `SUGGESTION · INSERT · PENDING YOUR DECISION`. The agent's reply
  is `Done — 1 suggestion on the document.`.
- **Nadia's text** (typed, 2 lines; the heading is pre-typed): `2. Ecological
  receptors`, then `Redgate's appraisal records the brook corridor as the
  principal ecological receptor.` (84 characters). No pill: manual text is not
  cited.
- **Thread:** Nadia's comment `@Eleanor Price can we confirm pit locations
  against the FRA?` (60 characters). Eleanor's reply `Confirmed — both pits
  sit outside Flood Zone 3 per WA-WAT-FRA-001.` (66 characters). Resolved line:
  `Resolved by Eleanor Price · Oct 02, 2026, 11:06 AM`.

### 4.8 W4 tools strings

- **QA checker, findings and creator:** flows-context §B.3–B.5, with em dashes
  restored. Coverage numbers:
  - Checker plan: `6 sections · 5 checks · the whole library, searched
    once per section · 5 of 5 accepted rules applied (5 all) · style guide 3
    of 3 clauses`.
  - After the run: `5 findings, anchored in the draft.`
  - The fifth finding shown is the Accuracy one (`● Required`, pill
    `WA-GEO-GIR-004`). It replaces the firm-rulebook hedge finding, so the
    count stays `Checks (5)`. The other four: the §2.1 house style, the
    passive voice, the §2.4 unit, and readability.
  - Creator result: `Covered: 4 of 4 sections written · 2 of 2 bound sources
    used · 1 drafting pass`.
- **Builder:** the turns, receipts and read-back in flows-context §B.6.3, with
  these changes:
  - Rachel's prompt (typed, 120 characters, no final stop): `Monthly KPI
    returns from our four suppliers: deliveries, NCRs, safety, carbon, local
    spend. Dashboard and summary for us`
  - Built punctuation in the UI (`Draft — not yet open to anyone`, `Yes —
    it's contractual`).
  - The step titles are the built ones.
  - Rachel's typed judgement (turn 4, 65 characters): `Yes — the KPIs feed
    each supplier's scorecard under the contract.`
  - Turn 10 (typed, 36 characters): `Flag any supplier below 90% on time.`
- **Returns** (`Monthly KPI returns`): Sep and Aug as wrenfield.ts. The gaps are filled
  as below (**add to wrenfield.ts**):

| Supplier | Month | Due | On time | NCRs | Safety | Carbon | Local spend £ |
|---|---|---|---|---|---|---|---|
| Ashcombe Civils | Jun 2026 | 30 | 28 | 2 | 0 | 58 | 98,400 |
| Ashcombe Civils | Jul 2026 | 32 | 30 | 2 | 0 | 56 | 104,700 |
| Ashcombe Civils | Aug 2026 | 34 | 31 | 3 | 0 | 55 | 112,300 |
| Wrenfield Plant Hire | Jun 2026 | 15 | 15 | 1 | 0 | 31 | 29,800 |
| Wrenfield Plant Hire | Jul 2026 | 16 | 15 | 0 | 0 | 29 | 31,200 |
| Wrenfield Plant Hire | Aug 2026 | 17 | 16 | 1 | 0 | 25 | 34,600 |
| Wrenbrook Fencing & Reinstatement | Jun 2026 | 6 | 6 | 0 | 0 | 12 | 14,100 |
| Wrenbrook Fencing & Reinstatement | Jul 2026 | 8 | 7 | 0 | 0 | 11 | 16,900 |
| Wrenbrook Fencing & Reinstatement | Aug 2026 | 9 | 9 | 0 | 0 | 10 | 19,500 |

  These rows keep every existing derived figure true: Aug on time 81 of 86,
  monthly carbon 171/163/154/142, and the insight's four sentences.

- **KPI state on screen (Rachel's dashboard; totals over accepted rows
  only):**

| Moment | `September 2026` tile | `Awaiting your decision` | `On time, September` | `Carbon since June` | Local spend donut centre | Netherfold Sep row |
|---|---|---|---|---|---|---|
| Before Sam submits | `3 of 4` · `returns submitted · nothing yet from Netherfold Cabling` | `0` | `66 of 74` · `accepted returns only` | `569 tCO2e` · `accepted returns only · 15 rows` | `£188k` | absent (a draft is invisible to Trentmoor): row `Netherfold Cabling · No return yet · Not yet submitted` |
| After Sam submits (11:02 AM) | `4 of 4` · `returns submitted` | `1` · `Netherfold Cabling, September 2026` | unchanged | unchanged | unchanged | `● Submitted Oct 05, 2026` + `Accept` / `Reject` |
| After Rachel accepts (11:20 AM) | `4 of 4` | `0` | **`93 of 102`** | **`630 tCO2e`** · `· 16 rows` | **`£272k`** | `● Accepted Oct 05, 2026 · Rachel Bowen` |

  - **Charts** (vision polish, accepted rows only):
    - Bar: `On time by supplier · Sep 2026, %`. Before acceptance it shows
      Ashcombe 85 (amber `#c4901f`, `Under 90% on time`), Plant Hire 95 and
      Wrenbrook 92. Netherfold's 96 grows in on acceptance. A flag line at 90
      carries the badge `Flags under 90% on time`.
    - Line: `Carbon by month, tCO2e`, 171/163/154/142 (Sep reads 81 until
      acceptance).
    - Donut: `Local spend by supplier · Sep 2026`.
  - **Sam's seat:** the form `September 2026 return` (values as flows-context
    B.7), and `Your returns — Netherfold Cabling` · `4 returns · entered by Sam
    Kerridge`. Its rows: Sep `● Draft` → `● Submitted Oct 05, 2026`; Aug
    `● Accepted Sep 03, 2026 · Rachel Bowen, Trentmoor Energy`; Jul
    `● Accepted Aug 04, 2026 · Rachel Bowen`; Jun `● Accepted Jul 02, 2026 ·
    Rachel Bowen`. Plus the slate info note (mockup wording). No dashboard,
    no totals, no insight.
  - **Run:** `Oct 05, 2026, 11:24 AM · Run by hand · Rachel Bowen · 16 · Wrote one
    insight · 1`.
  - **Insight meta:** `Run Oct 05, 2026, 11:24 AM · run by hand · acted as
    Rachel Bowen over 16 rows in Monthly KPI returns · version 1 · All runs →`.
    The text is `INSIGHT.sentences` (straight apostrophes are acceptable).

### 4.9 What must be added to `src/data/wrenfield.ts`

Add these as **new exports**, so the first set's compositions still render.
Don't edit existing values, except the additive fill in item 6.

1. `ORGS.redgate` (`Redgate Ecology`, role `consultant`), and `OrgRole`
   gains `'contractor'`.
2. `WT_PEOPLE`: RACHEL, ELEANOR (as `PEOPLE`), OWEN (`role: 'internal QA
   reviewer'`), NADIA (NO, `Redgate Ecology — Consultant`), SAM (`chipLine:
   'Netherfold Cabling — Contractor'`), and the supplier contacts DAN_FERRIS,
   LEAH_MORROW, JOE_PELLOW. Each gets a `seatColour`.
3. `C.seat.redgate = '#3a6ea5'` and `C.seat.qa = '#b8622f'` (in `theme.ts`;
   the lead adds them).
4. `WT_LIB`: all eight library rows (§4.3), with title, revision, state,
   holder, date, description and passage; the GIR v1 passage; and
   `WT_LOCATOR = 'Cited passage · page 14'`.
5. `WT_DATES` (§4.4) and `WT_PLAN_ROWS` (the five plan rows of `02`).
6. `SUPPLIER_KPI.jun`, `SUPPLIER_KPI.jul` (all four suppliers), and Aug
   `localSpend` for the three suppliers (§4.8), plus `WT_KPI_STATES` (the
   three tile states) and `WT_RUN`.
7. `WT_REVIEW` (§4.5), `WT_ASK` (§4.6, including answers 1, 3R and 3E, the
   rail stages, the Lens rows and the ontology classifications and edges),
   `WT_COLLAB` (§4.7) and `WT_TOOLS` (§4.8: checker, findings, creator,
   builder turns, read-back, screens, playbook strings).
8. `WT_TITLES`: four × `{ kicker, name, deckLine, glimpseLine, closeLine,
   chapters[] }`.

---

## 5. The shared component list

New shared walkthrough parts live in
**`src/walkthroughs/shared/`** (the lead's territory). Per-video parts live in
`src/walkthroughs/wN/`. Directors don't edit shared files. They wrap them
locally and ask the lead for changes (the README's rule 1 carries over).

### 5.1 Reuse as is (from `src/shared/`)

`theme` (`C`, `CHART`, `SHADOW`, `RADIUS`, `TYPE`, `FONT`, `fontsReady`) ·
`motion` (`ease`, `appear`, `vanish`, `between`, `keyed`, `ui`, `pressScale`,
`seeded`, `agentChars`, `holdFor`) · `Field` · `Wordmark` · `Badge` · `Button`
· `Chip` · `SourceChip` · `WithheldNotice` · `Tick` · `Avatar` · `MicroLabel`
· `Pane` · `Shimmer` · `Highlight` · `Anchor` · `Mark` · `TrackedChange` ·
`SuccessFlash` · `Receipt` · `KpiTile` · `BarChart` · `LineChart` ·
`PieChart` · `DataTable` · `RowForm` · `RunTrace`.

**Retired for this set:** `Greek`, `GreekText`, `GreekStrip`, `FocusBlur`,
`contextStyle`, `Float`, `PhraseLift`, `PromptHero`, `TitleCard`, `CardText`,
`ClipOpen`, `EndCard`, `SavedStrip`, and the `greekChrome` and `greek*` props
everywhere. Nothing is blurred or Greek'd.

### 5.2 Extend (wrap or variant in `walkthroughs/shared/`; leave `src/shared/` untouched)

| Existing | Extension |
|---|---|
| `AppShell` → **`Shell`** | `{ seat: WtPerson; nav: NavItem; width?: 1536 \| 752; height?: 864 \| 832; collapsed?: boolean; topbar?: 'project' \| { crumb: string }; workspace?: boolean; unread?: number; hoverNav?: NavItem; secondBar?: ReactNode; contentTone?: 'pane' \| 'sunken'; children }`. Native geometry from §3, the owner org-line run-together, and the Notifications pill. |
| `Cursor` | `{ seat: string; path: Array<{ f: F; at: NativePt \| ScreenPt; shape?: 'arrow' \| 'hand' \| 'ibeam' }>; clicks: F[]; drags?: Array<{ from: F; to: F }>; showFrom: F; hideAfter: F; window?: 'main' \| 'left' \| 'right' }`. Arc path, travel-time rule, dwell, and conversion through `useAppPoint`. |
| `TypedText` → **`HumanTyped`** | `{ text: string; from: F; seed?: number; caret?: boolean; caretUntil?: F }` with the seeded cadence of §2.11. Returns `endsAt(text, from, seed)` so shot tables compute frames. |
| **`Streamed`** | `{ text: string; from: F; rate?: 3 \| 4 }`, the agent reveal. |
| `EditorSecondBar` | `{ location: string; docRef?: string; title: string; presence?: ReactNode; frozen?: boolean; bound?: boolean; promotePressAt?: F }`. |
| `EditorPanes` | Panel width 348 (300 in split), tabs `{ review?: number; comments?: number; checks?: number; active; pending?: string }`, the disabled chips row. |
| `SuggestionCard` → **`SuggestionCallout`** | The built tag line `SUGGESTION · INSERT · PENDING YOUR DECISION` with a NumBadge, segments streaming at 4 c/f, `✓ Accept · ✎ Edit · ↻ Refine · Reject`, `acceptAt` → a tracked insert in the canvas. |
| `CommentCard` | Show the code pill (no Greek). `{ author; when; code?: 'S0' \| null; quote; body; response?: { text; passage?: string; noChange?: string; at?: F } }`. |
| `ProgressBar4` → **`CycleStatusBar`** | Full-width sunken card: `{ round: 'P01 · Round 1'; current: 1..4; done?: boolean; meta: string; pill: { tone; label }; ownerAction?: { label; enabledAt?: F; pressAt?: F } }`. |
| `SourcePanel` | `{ docRef; rev; state: 'Live' \| 'Superseded'; locator?: string; passage: Array<{ text; hl? }>; hlAt?: F; at?: F; width?: 456 }`, with no section and nothing Greek'd. |
| `ChatPanel` / `Turn` → **`BuilderConversation`** | Hero width (688 native), user bubbles labelled `RACHEL BOWEN`, agent turns with no bubble under `AGENT`, quick replies as secondary pills, `Receipt` rows naming the step, and a composer at the foot. |
| `StepRail` → **`StepColumn`** | The built titles and sub-lines, the `✦ The agent asks` tag, the amber `Waiting for you` pill, a recorded line when done, and an expanded detail slot (the column table for step 2). |
| `Dashboard` → **`KpiDashboard`** | 4-tile row per §4.8 (`state: 'before' \| 'submitted' \| 'accepted'`, `flipAt`), bar with a flag line, line, donut, `InsightCard`, and the returns table with `Accept`/`Reject` and the confirm strip. `width: 1056 \| 676`, `empty` for the builder preview. |

### 5.3 New: the walkthrough frame

```ts
// Composition skeleton: field, title, glimpse, chapters, close, logo.
WalkthroughFrame: {
  video: 1 | 2 | 3 | 4;              // reads WT_TITLES
  chapters: Array<{ name: string; from: F; to: F }>;
  captions: CaptionCue[];            // §2.4
  glimpse: ReactNode;                // the end-state window content
  closeFrom: F;                      // = last chapter's end
  children: ReactNode;               // the chapter body (window content, cursors)
}
CaptionCue = { from: F; to: F; chapter: number; line: string; seat?: string /* WT_PEOPLE key */ }

AppWindow:    { camera: WtCameraKey[]; children: ReactNode /* the Shell at native */ }
WtCameraKey = { f: F; cx: number; cy: number; m: number; ease?: 'inOut' } // native centre, magnification
SplitWindows: { at: F; exitAt?: F; left: { seat: string; content: ReactNode }; right: { seat: string; content: ReactNode } }
useAppPoint(window: 'main' | 'left' | 'right'): (p: NativePt, f?: F) => ScreenPt  // §2.6 mapping

Caption:      { cues: CaptionCue[]; chapters: number }
ChapterBar:   { chapters: Array<{ name: string; from: F; to: F }>; showFrom: F; hideFrom: F }
SeatTag:      { seat: string; size?: 15 | 17 }
OpeningTitle: { kicker: string; name: string; deckLine: string }  // frames 0–89
ClosingLogo:  { from: F }                                          // 90 f
```

### 5.4 New: product UI parts (native px, built language)

| Component | Prop sketch | Videos | Status it draws |
|---|---|---|---|
| `PageHeader` | `{ title; titleMono?: boolean; pill?: { tone; label }; sub?: string; actions?: ReactNode; subPills?: ReactNode }` | all | BUILT |
| `Table` | `{ columns: Array<{ key; label; w?; mono? }>; rows: Row[]; hoverRow?: number; selectedRow?: number; rowAt?: F[]; bands?: Array<{ before: number; content: ReactNode }> }` | all | BUILT |
| `Modal` | `{ size: 'sm' \| 'md' \| 'lg'; title: ReactNode; at: F; exitAt?: F; footer: ReactNode; scrollY?: KeyedNumber; children }` | 1, 3 | BUILT |
| `Banner` | `{ tone: 'success' \| 'danger'; text; at: F }` | 1, 3 | BUILT |
| `KeyValueCard` | `{ label?: string; locked?: boolean; rows: Array<[string, ReactNode]>; note?: string }` | 1, 4 | BUILT |
| `Dropdown` / `Popover` | `{ anchor: NativePt; at: F; exitAt?: F; items: ReactNode[] }` | all | BUILT |
| `SandboxPage` | `{ cards: SandboxCard[]; selected; banner?; crumb; rows: SandboxRow[] }` | 1, 2, 3 | BUILT |
| `NewSandboxWizard` | `{ step: 1 \| 2 \| 3; stepAt: F[]; name: ReactNode; access; orgs: PickRow[]; people: PickRow[]; who: 'everyone' \| 'specific' }` | 3 | BUILT-NP |
| `PlanTable` + `PlanDetailModal` | as `02` / `03` | 1 | BUILT |
| `BindModal` | as `07` | 1 | BUILT |
| `PromotionWindow` | `{ version: 'P01' \| 'P02'; qa: { by; on }; reviewers; target; scrollY }` (`13a`) | 1 | BUILT |
| `DeliverableStatus` | `{ variant: 'submitted' \| 'appointment' \| 'accepted'; … }` (`15`, `15a`, `16`, `27`) | 1 | BUILT |
| `PdfPage` | `{ blocks: Array<{ heading?; text; anchors?: Array<{ span; state: 'pending' \| 'saved' }> }>; selectAt?: { span; from: F; to: F } }` (the sans PDF face) | 1 | BUILT |
| `ReviewPanel` | `{ comments: CommentCardProps[]; composer?: { anchor?; text?: ReactNode; code?: string }; verdict?: { code?; pressAt? }; withheld?: boolean; respondOpen?: number }` | 1 | BUILT |
| `ReviewRecordTable` | `{ rounds: Array<{ band; rows: RecordRow[]; closeBand? }>; scrollY? }` (`24a`) | 1 | BUILT |
| `LibraryPage` | `{ seat; deliverables; references; hoverRow?; }` | 1, 2 | BUILT |
| `DocumentModal` + `RevisionStrip` | `{ docRef; rev; state; body; revisions?: Array<{ rev; state; note }> }` | 2 | BUILT-NP + VISION strip |
| `OntologyView` | `{ facets: Facet[]; nodes: Array<{ ref; title; x; y; state; at?: F; superseded? }>; edges: Array<{ from; to; label; suggested: boolean; drawAt?: F; confirmAt?: F }>; selected?: string; detail: ReactNode }` (calm, concentric, nothing bounces) | 2 | VISION |
| `OntologyDetailCard` | `{ ref; title; contextState; classification: Array<[facet, term, suggested]>; relationships: Array<{ dir; type; other; suggested; confirmAt? }> }` (copies `ontology-panel.tsx`) | 2 | BUILT controls |
| `CreatorScreen` | `{ stage: 'what' \| 'outline' \| 'brief' \| 'sources' \| 'plan' \| 'result'; related?: RelatedSource[]; ticked: string[]; … }` (`t1-*`) | 2, 4 | BUILT (+ VISION group) |
| `AskScreen` | `{ lens; sources: 6 \| 7; transcript: AskTurn[]; rail?: Array<{ label; doneAt?: F; runningAt?: F }>; sourcePanel?: SourcePanelProps; composer: { text?: ReactNode; sendAt?: F } }` (the cleaned layout, D-14) | 2 | BUILT-NP + VISION rail |
| `LensPicker` | `{ at: F; exitAt?: F; selected }` (exact rows) | 2 | BUILT |
| `CitedClaims` | `{ claims: Array<{ text; refs: string[] }>; from: F; rate?: 4; gap?: 4; activeRef?: { ref; at: F } }` | 2, 3 | BUILT |
| `AnswerFooter` | `{ claims: number; lens: string; withheld?: number }` | 2 | BUILT |
| `PresenceStack` | `{ people: Array<{ initials; name; org; editing: boolean; at?: F }>; hoverAt?: F }` | 3 | BUILT + VISION fill and hover card |
| `PresenceFlag` (remote caret) | `{ name: string; initials: string; at: NativePt \| ((f) => NativePt); idleFrom?: F }`: 2 px ink bar plus an ink pill flag (white 10.5 px, weight 600), collapsing to initials after 60 f idle. No per-person hue. | 3 | VISION |
| `RemoteSelection` | `{ span; at: F }` (sunken tint, 1 px dotted underline) | 3 | VISION |
| `ChatThread` | `{ entries: Array<{ who: string \| 'agent'; text; at: F; viewerIsAuthor?: boolean }> }`. Named labels (`Eleanor Price · Calder & Hale`) and `You` for the viewer's own prompts. | 3 | BUILT + VISION labels |
| `LibraryTokenInput` | `{ typed: Array<string \| { ref: string; at: F }>; from: F }` (the composer with reference tokens) | 3 | BUILT-NP |
| `CommentsTab` | `{ threads: Array<{ anchor; entries; resolved?: { by; when; at: F } }>; composer? }` | 3 | BUILT-NP |
| `ToolsPage` | `{ seat; apps?: Array<{ name; open: boolean }>; newAppField?: ReactNode }` (`t1-01`) | 4 | BUILT |
| `QaCheckerSetup` / `PlanCard` / `RunProgress` | as `t2-02`, `t2-05`, `t2-06` | 4 | BUILT |
| `FindingsPanel` | `{ groups: Array<{ label; count; primary?; findings: FindingCardProps[] }>; resolved: number; open: number }` | 4 | BUILT |
| `BuilderScreen` | `{ header: { name; badge: 'draft' \| 'open'; flipAt?: F }; conversation: BuilderTurn[]; steps: StepColumnProps; preview: { seat: 'rachel' \| 'sam'; content; fillAt?: F } }` | 4 | VISION over BUILT/RULED |
| `ReadBackCard` | `{ lines: string[]; primary: 'Check and open'; pressAt?: F }` | 4 | BUILT |
| `ReturnsForm` | `{ month; values; savedLine; submitAt?: F; rows: ReturnRow[]; note }` (Sam's seat) | 4 | RULED (mockup) |
| `AcceptStrip` | `{ org; month; at: F; acceptAt?: F }` (mockup copy) | 4 | RULED |
| `RunsCard` + `InsightCard` (wrap) | `{ runs: RunRow[]; insight: { meta; sentences; at: F } }` | 4 | BUILT runs; RULED card |
| `KeepPlaybook` | `{ name; pressAt?: F; noticeAt?: F }` | 4 | BUILT (playbook words) |

---

## 6. Rules for the per-video directors

### 6.1 Deliverables

1. **`wN-<slug>/plan.md`** (`w1-document-management`, `w2-context-layer`,
   `w3-collaboration`, `w4-tools`), which opens with a plain-language paragraph
   and contains:
   - the frame budget (chapters with exact from/to frames)
   - the shot table (§6.3)
   - the caption list (§6.4)
   - the camera share totals
   - the narration (§6.5)
   - a "vision and rulings" list, every non-built element with its source
2. **Source** in `src/walkthroughs/wN/`, registered by the lead as
   `W1-document-management` … `W4-tools`. Renders go to
   `demo/videos/`.
3. **Render check:** stills at every chapter's first frame, every click
   frame of a hero action, and the glimpse, close and logo. Read each PNG
   before hand-back. Check that: the cursor tip sits on the control; no UI
   enters the caption band; the caption doesn't collide with the chapter bar;
   no em dash appears in a caption; and no hyphen has replaced a built em dash
   in UI.

### 6.2 Status marks (one per shot; per element where mixed)

| Mark | Meaning | Must cite |
|---|---|---|
| **BUILT** | Running and photographed. The screenshot is the spec, pixel for pixel. | The screenshot file, e.g. `BUILT 18-round-open` |
| **BUILT-NP** | Built, not photographed. Rebuilt from code and copy. | The source file, e.g. `BUILT-NP sandbox.tsx 225–360` |
| **RULED** | An accepted ADR or an approved mockup decides it. Not built. | The ADR or mockup, e.g. `RULED ADR-0039 §1` or `RULED returns-app-two-seats.html` |
| **VISION** | Proposed in a flows file, or here. Drawn in the design language. | The section, e.g. `VISION flows-docmgmt B.2 (2)` |
| **DEV** | A deliberate departure from a built screen (date, punctuation, vocabulary, a capture artefact fixed). | What changed and why, e.g. `DEV dates spread (§4.4)` |

Mixed shots list their parts, for example: `BUILT 09 · BUILT-NP presence.tsx ·
VISION PresenceFlag`. A VISION or RULED element is never captioned as shipped,
and never called "coming" on screen. The captions stay neutral. Our own notes
carry the marks.

### 6.3 Shot-table format

One row per shot, a shot being one continuous screen state or action, usually
2–6 s. Frames are **video-local** at 30 fps, inclusive.

| Shot | Frames | Dur | Ch | Seat | Status | Screen state | Camera | Cursor | Typed / streamed | Caption | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 4.3 | 1530–1665 | 4.5 s | 4 | Rachel | BUILT 17 · DEV dates | Review screen, round 1 P01, `● Open · 0 of 3 comments answered` (comments 2 and 3 not yet shown). Anchor pending on "Conceptual site model". Textarea focused. | Work m 1.4 on (1160, 520) from 1530 (21 f) | 1530 ibeam at the textarea (1020, 660); 1641 hand to the code select (1050, 720), click 1652; option S0 click 1664 | `HumanTyped` WT_REVIEW.c1 from 1540 (seed 41) → ends 1636 | In 1521: "Rachel comments on the page itself" | The code select menu fades 4 f. |

Rules for each column:

- **Frames:** start–end, and they must tile the chapter with no gaps.
  Transitions get their own rows.
- **Screen state:** the full state at the shot's first frame, plus each change
  with its frame (`@1580 banner in`). Name the component and the
  `WT_*` string, never paraphrase copy.
- **Camera:** `Wide`, or `Work`/`Detail` with `m` and the native centre, plus
  the move frames. Moves follow §2.6.
- **Cursor:** native target points, shapes, click frames and drags, in order.
  Travel times follow §2.10. State the computed arrival frames.
- **Typed / streamed:** the string's key, the start frame, the rate or seed,
  and the end frame.
- **Caption:** the cue in, the line, and the seat tag if it changes. The out
  frame is implied by the next cue.
- **Notes:** dropdown and hover states, holds, anything a builder would ask.

### 6.4 Caption rules for directors

- One caption per action, never more than one on screen. It appears 9 f
  before the action and holds at least `max(75, words × 8 + 24)` frames.
- Plain English for a non-engineer. Say what happens and what it means:
  "Eleanor binds the draft to its planned slot", not "Bind to TIDP container".
- 8 words or fewer, hyphens, no dates or numbers you can't see on screen, no
  ADR numbers, no claims from inventory §3.3.
- **Required lines** (use these exact words where the beat appears):
  - W1, the wall split: "Calder & Hale sees only that review is open"
  - W2, the access split: "Same question - each sees only their own"
  - W3, Owen's beat: "Everyone else on the project sees nothing"
  - W4, two seats: "Same app - each firm sees its own"
- About 12–16 captions per video.

### 6.5 Narration

- 260–290 words per video at 135–145 wpm, written per chapter, with each
  sentence's start frame. One sentence per action. Leave a silent 1–2 s on
  each Wide hold and over the title and logo.
- **Budget:** chapter seconds × 2.3 ≈ words (an 18 s chapter gets about 40
  words).
- The narration may say what a caption can't fit ("its reference is issued by
  the plan, never typed by hand"). It must stay inside §3.3's claims list.
  It may use "playbook", "status code", "the client" and "the record".
- The captions are not the script, and the silent render must stand on its
  own.
- Deliver it as `wN-<slug>/narration.md`, beside the plan, as plain text
  with frame cues in a margin column.

### 6.6 Accuracy checklist (each director signs it off in their plan)

- [ ] Every built screen matches its screenshot (overlay check at 50%).
- [ ] Every UI string is copied from the flows file or the `WT_*` data, with
      the built punctuation.
- [ ] No sandbox, upload or web content carries a source pill.
- [ ] No seat sees across the wall.
  - [ ] Eleanor never sees PEA-001, Rachel's comments before issue, or Trentmoor's insight.
  - [ ] Sam never sees totals, other suppliers' rows or the insight.
  - [ ] Nadia never sees Calder & Hale's rulebook or a run's internals.
  - [ ] Rachel never sees a run's internals or a supplier's draft row.
- [ ] Nothing says AI "approves", "verifies", "learns" or "trains". No
      "real-time" caption, and no "template".
- [ ] Fixes: only the mechanical substitution is bulk-accepted. Rewrites are
      read one at a time.
- [ ] The camera stays within its shares and limits. Nothing is blurred, and
      no card appears between chapters.

---

## 7. Open items for the owner (flagged, not blocking)

1. **Sam's chip line:** `Netherfold Cabling — Contractor` (the CONTEXT role)
   against the built "Consultant" for every non-owner.
2. **Workspace nav label:** `Playbooks` (CONTEXT) against the built "Kept
   apps". This is used only if W4 shows the shelf.
3. **W4's build date:** the app was built in June so that the dashboard can
   show four months of returns. The date is never on screen, and the caption
   jumps the time. The alternative is a September-only dashboard with no
   trend.
4. **The chat-led builder** reopens ADR-0056 addendum ruling 6 as vision (per
   the brief). Ruling 6's protections stay visible: questions can't be
   skipped, and every answer lands in a step.
5. **Library `S2` against A1:** the built suitability pill is kept (§0
   ruling 1). The research files disagreed.
