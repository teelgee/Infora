# W3 Collaboration: the shot plan

Written 2026-10-05 by the W3 director, to the rules in `master-plan.md`.
Revised the same day against `review/review-accuracy.md` and
`review/review-viewer.md` (revision log at the end).

**In plain words.** This two-minute video shows two people from two different
firms writing one document together, at the same time. Rachel Bowen, for the
client, opens a shared work-in-progress area and lets in exactly two people
from other firms: Eleanor Price of Calder & Hale and Nadia Okonjo of Redgate
Ecology. Owen Vance, who works on the same project, cannot see it. Eleanor
starts a new document there. Then the screen splits in two, one window per
person, and both of them type into the same document in the same seconds:
Nadia writes the ecology section, Eleanor adds the heading for the dewatering
section, and each window shows the other person's cursor with their name on
it. Eleanor asks the agent to draft her section; the draft arrives in both
windows at once, every sentence tied to its source. Nadia, the ecologist,
checks the brown trout source and accepts. She then asks Eleanor where the
dewatering water will go; Eleanor answers and closes the thread. Nothing is
attached or emailed. The "two people at once" parts (the other person's
cursor, their typing arriving live) are not built yet. They are drawn in the
product's own style and marked as vision in this file, never in the video.

**Which file wins.** `master-plan.md` wins on grammar, shell, cast and dates.
`research/flows-docmgmt-collab.md` §B wins on screen copy. The two reviews and
the producer's rulings on them win over both. Where the built code disagrees
with any of these, §12 says so and says which way this plan went.

---

## 0. At a glance

| # | Chapter | Frames | Dur | Target (master) | Seat | One line |
|---|---|---|---|---|---|---|
| — | Opening title | 0–89 | 3.0 s | 3.0 s | — | `PILLAR 03` · Collaboration · scenario line |
| — | End-state glimpse | 90–194 | 3.5 s | 3.5 s | split | The finished split, read-only |
| — | Glimpse → start | 195–206 | 0.4 s | 0.4 s | — | Pair crossfades to Rachel's window |
| 1 | Shared space | 207–938 | 24.4 s | 22 s (+2.4) | Rachel → Owen | Wizard: shared, two firms, two named people. Owen sees nothing (4 s) |
| 2 | New document | 939–1261 | 10.8 s | 10 s (+0.8) | Eleanor | Selects the shared area, creates the document, opens it |
| 3 | Together | 1262–1679 | 13.9 s | 14 s (−0.1) | split | Both type into the canvas at once; two flagged carets in both windows |
| 4 | Ask the agent | 1680–2355 | 22.5 s | 24 s (−1.5) | split (Eleanor drives) | Prompt, two library inserts, send; the cited suggestion streams in both canvases |
| 5 | Accept | 2356–2729 | 12.5 s | 13 s (−0.5) | split (Nadia drives) | Nadia checks the brown trout source, accepts; lands in both |
| 6 | Discuss | 2730–3284 | 18.5 s | 16 s (+2.5) | split (Nadia, then Eleanor) | @mention on "dewatering", reply, close, resolved |
| — | Close | 3285–3434 | 5.0 s | 5.0 s | split | End state held |
| — | Logo | 3435–3524 | 3.0 s | 3.0 s | — | Wordmark |

Chapters: 3,078 f (102.6 s). **Total: 3,525 frames, 117.5 s** (0–3524). Every
chapter is within ±3 s of its target, and the total is within 110–130 s.

---

## 1. Purpose and the workflow, end to end

**Purpose.** Show pillar 03, "shared spaces across organisations, no
attachments, no lost work", as one concrete piece of work. The owner asked for
**true multiplayer**:
- two people in one document at the same time;
- the document's own chat used to have the agent write new text;
- both of them working on that single document;
- the sandbox, where a new space is made that only the right people can open.

The viewer must never doubt that both people are live at once. Three devices
carry it:
- **Two people typing into the same canvas in the same seconds**, each window
  showing the other's flagged caret (chapter 3).
- **One event landing in both windows on the same frame** (chapters 4, 5 and
  6).
- **Two cursors clicking on the same frame** (the end of chapter 6).

**The workflow, beat by beat.**

1. **Rachel opens a shared working area** (Trentmoor Energy, owner seat).
   - On the Sandbox page she clicks `+ Sandbox`.
   - In the three-step "New sandbox" modal she types the name `Ashcombe Brook
     crossing`.
   - She switches Access from `Private — my organisation` to `Shared — across
     organisations`. The step counter changes from `Step 1 of 2` to `Step 1 of
     3`, as built.
   - Of the six member organisations, she ticks `Calder & Hale` and `Redgate
     Ecology`.
   - She chooses `Only specific people`, and ticks `Eleanor Price` and `Nadia
     Okonjo`. `Owen Vance` stays unticked.
   - She clicks `Create sandbox`. The new card appears selected:
     `Trentmoor Energy` · `Shared`, with `3 in scope` in the toolbar (built:
     no `with …` line).
2. **Owen sees nothing (4 s).** The seat changes to Owen Vance (Calder & Hale,
   on the same project). His Sandbox page shows only `Personal workspace` and
   `Calder & Hale — working area`, and his cursor rests on them. There is no
   greyed card and no "hidden" count: the product never shows what you cannot
   open.
3. **Eleanor creates the document.** The seat changes to Eleanor. Her page has
   three cards, including `Ashcombe Brook crossing`, where Owen's had two.
   - She selects it, clicks `New document`, types `Land quality and ecology
     interface` and clicks `Create document`.
   - The row shows `v0.1` · `Infora text · Oct 02, 2026` · `● Unbound`.
   - She clicks `⋯`, then `Open in Editor`. The empty editor opens, with no
     rail item lit (built).
4. **Together (split).** Nadia opens the same document from Redgate. Each doc
   bar gains the other's avatar.
   - Nadia clicks into the empty canvas and types `1. Ecological receptors`
     and her sentence.
   - While she is typing the sentence, Eleanor clicks into the canvas below the
     text, which puts her caret at the end of the document. She types a blank
   line and `2. Dewatering and the brook`.
   - **Both windows show both texts growing on the same frames.** Eleanor's
     window shows Nadia's caret flagged `Nadia Okonjo`. Nadia's window shows
     Eleanor's caret flagged `Eleanor Price`.
   - As Nadia's sentence wraps, Eleanor's heading (and her flag) is pushed
     down a line, just as in a real shared editor.
5. **Ask the agent.**
   - Eleanor types into the document's chat: `Draft this section on how
     dewatering could affect the brook,`.
   - She clicks `▤ From the library` and picks `WA-GEO-GIR-004`. As built, the
     composer gains ` per WA-GEO-GIR-004`.
   - She types ` and`, picks `WA-ENV-BAS-003`, and sends.
   - Both chat panels show the request: Eleanor's labelled `You`, Nadia's
     labelled `Eleanor Price · Calder & Hale`. Both show `Infora agent` ·
     `Working…`, then `Done — 1 suggestion on the document.`
   - The suggestion callout appears in **both** canvases on the same frame.
     Its four cited sentences stream in together, each followed by its source
     pill.
6. **Accept.**
   - Nadia, the ecologist, hovers the `WA-ENV-BAS-003` pill after the brown
     trout sentence.
   - A small card shows the baseline passage from the live revision (`v3`),
     with the trout sentence highlighted.
   - She clicks `✓ Accept`. On the same frame, in both canvases, the paragraph
     lands as plain text **under Eleanor's heading** `2. Dewatering and the
     brook`. It shows briefly as a green tracked insert, then settles.
7. **Discuss.**
   - Nadia drag-selects "dewatering" in the accepted paragraph and clicks the
     floating `Comment` bubble.
   - She types `@El`, picks `@Eleanor Price`, finishes `where does the
     dewatering water go? The brook has trout.` and presses Enter.
   - On Eleanor's side, on the same frame: an amber anchor on "dewatering",
     `Comments (1)`, and the unread dot on the Notifications bell of her
     collapsed rail.
   - Eleanor opens the tab, clicks `Reply` and types `The GI recommends a
     dewatering management plan - I'll cover the brook in it.`. That is her
     commitment, resting on the ground investigation's own recommendation. She
     presses Enter, then clicks `Close`.
   - On the same frame, Eleanor expands `▸ Resolved (1)` to show `Resolved by
     Eleanor Price · Oct 02, 2026, 11:06 AM`, and Nadia opens her `Chat` tab.

**What the video never shows** (accuracy):
- no source pill on anything a person typed;
- no Calder & Hale rulebook or run internals in Nadia's seat;
- no `WA-ECO-PEA-001` in Eleanor's library list;
- no Halvern Associates;
- no greyed "hidden" sandbox for Owen;
- no lit rail item in the editor;
- the word "real-time" nowhere.

---

## 2. Frame budget (video-local, 30 fps, inclusive)

| Segment | From | To | Frames |
|---|---|---|---|
| Opening title | 0 | 89 | 90 |
| Glimpse | 90 | 194 | 105 |
| Glimpse → ch.1 crossfade | 195 | 206 | 12 |
| Ch.1 Shared space | 207 | 938 | 732 |
| Ch.2 New document | 939 | 1261 | 323 |
| Ch.3 Together | 1262 | 1679 | 418 |
| Ch.4 Ask the agent | 1680 | 2355 | 676 |
| Ch.5 Accept | 2356 | 2729 | 374 |
| Ch.6 Discuss | 2730 | 3284 | 555 |
| Close | 3285 | 3434 | 150 |
| Logo | 3435 | 3524 | 90 |
| **Total** | 0 | 3524 | **3,525** |

`WalkthroughFrame` props: `video: 3`; `chapters` = the six rows above, named
`Shared space`, `New document`, `Together`, `Ask the agent`, `Accept`,
`Discuss`; `closeFrom: 3285`.

---

## 3. Fixed geometry for this video

All points are **native** (the Shell's CSS px) unless marked *screen*.

### 3.1 Mappings

| Window | Screen point from native (nx, ny) |
|---|---|
| Single, Wide (m 1.0) | `sx = 120 + nx × 1.09375`, `sy = 24 + ny × 1.09375` |
| Single, Work m 1.5 on (768, 288) | `sx = 960 + (nx − 768) × 1.640625`, `sy = 496.5 + (ny − 288) × 1.640625` |
| Split left (Eleanor) | `sx = 120 + nx × 1.09375`, `sy = 60 + ny × 1.09375` |
| Split right (Nadia) | `sx = 978 + nx × 1.09375`, `sy = 60 + ny × 1.09375` |

Screen coordinates in the shot table are these, rounded. Authors pass native
points to `useAppPoint`. The screen values are for checking renders.

### 3.2 Sandbox page (single, 1536×864): every seat in ch.1 and ch.2

This copies `08-sandbox.png` and `06-plan-locked.png`, shifted +48 in x for
the wider main pane.

- **Header:** serif `Sandbox` (cap top y ≈ 100, x 342). Buttons are
  right-aligned to x 1398, y 103–130.
  - **No sandbox selected:**
    - `New document` (primary, `FilePlus2`), x 1044–1178, centre (1111, 116);
    - `Upload file` (quiet, `Upload`), x 1198–1283;
    - `+ Sandbox` (quiet, `Plus`, super-users only), x 1314–1386, centre
      (1350, 116).
  - **A sandbox selected:** `Create with AI` (quiet, `Sparkles`) appears at
    x 1064–1168, and `New document` moves to x 910–1044, centre (977, 116).
- **Description** (muted 13 px, y 145–180): `Work in progress across your
  sandboxes. Separation is by a narrower sandbox, never a wall inside a shared
  one; the AI never grounds on anything here.`
- **Cards:** the `SANDBOXES` micro label sits at y 223, cards from y 240.
  - Each card is 254 × 84, with a 12 px gap: card 1 x 342–596, card 2
    x 609–863, card 3 x 876–1130.
  - Cards sort personal first, then by name.
  - A shared card's meta reads `Building2` org / `Users` `Shared`. It has **no
    `with …` line**, because the built card lists organisation grants only.
- **A sandbox selected:**
  - the card gets a 1 px ink outline and the popout shadow;
  - the toolbar sits at y 348 (a muted 12 px count, then quiet buttons) and
    the breadcrumb at y 384;
  - the table header `NAME · DELIVERABLE · ACTIONS` runs y 408–440, and the
    first row y 440–488, centre 464.
- **Nothing selected:** a section label `<ORG> — ALL DOCUMENTS` (micro) at
  y 348. The table header `DOCUMENT · DELIVERABLE · ACTIONS` runs y 366–398,
  and rows start at y 398.

### 3.3 "New sandbox" modal (BUILT-NP `sandbox.tsx` 181–345), md, x 508–1028, top y 64

- **Header** (y 64–118): `New sandbox` (15 px semibold) and an `X`. The body
  has 24 px padding.
- **Footer:** a hairline divider, then right-aligned `Cancel` (quiet), `Back`
  (quiet, from step 2 on) and the primary `Next`. On step 3 the primary is
  `Create sandbox`.

| Step | Contents (native y) | Primary centre |
|---|---|---|
| 1 | `Step 1 of 2` (hint, y 142) · `Name` label y 166, input y 184–216, centre (768, 200), placeholder `e.g. Ecology working area` · `Access` label y 236, select y 254–286, centre (768, 270), value `Private — my organisation`, hint y 296 `Private to your organisation` · divider y 330 · buttons y 346–378 | `Next` (958, 362) |
| 1′ | after choosing Shared: `Step 1 of 3`, select `Shared — across organisations`, hint `Shared across organisations — you choose which, then who` | `Next` (958, 362) |
| 2 | `Step 2 of 3` · `Organisations` label y 166 · pick list y 184–392 (1 px border, radius 8, padding 6, rows 31 tall, 2 gap). Row centres y 206, 239, 272, 305, 338, 371 = `Calder & Hale`, `Redgate Ecology`, `Netherfold Cabling`, `Ashcombe Civils`, `Wrenfield Plant Hire`, `Wrenbrook Fencing & Reinstatement`. Checkbox centre x 555 (15 px, ink accent), label x 570 · hint y 400 `Which organisations share this sandbox (yours is always included)` · divider y 430 · buttons y 446–478 | `Next` (958, 462) |
| 3 | `Step 3 of 3` · `Who has access` label y 166, select y 184–216, centre (768, 200), value `Everyone in the chosen organisations` · after `Only specific people`: `People` label y 236, pick list y 254–396, rows centred y 276, 309, 342, 375 = `Rachel Bowen` / `Trentmoor Energy`, `Eleanor Price` / `Calder & Hale`, `Owen Vance` / `Calder & Hale`, `Nadia Okonjo` / `Redgate Ecology` (name 13 px ink, organisation muted 12 px after it) · hint y 404 `Admit specific participants; you are always included` · divider y 436 · buttons y 452–484 | `Create sandbox` (942, 468) |

The two selects are native `<select>`s in the product. Their open lists are
drawn as the system `Dropdown` (white, radius 8, level-4 overlay, 32 px rows,
4 px padding) directly under the select:
- step 1: list y 290–354, options centred at y 306 and y 338;
- step 3: list y 220–286, options centred at y 236 and y 268.

This is a DEV: the OS menu cannot be captured consistently.

### 3.4 "New document" modal (BUILT-NP `sandbox.tsx` 1537–1550, `TextModal`), sm, x 568–968, top y 64

- Header `New document` and an `X` (y 64–118).
- `Title` label at y 142. Input y 160–192, centre (768, 176), placeholder
  `e.g. Ecology draft`, autofocused.
- No hint: the built hint appears only inside a folder.
- Divider at y 216. Buttons y 228–260: `Cancel` (quiet), and `Create document`
  (primary), centre (906, 244).

### 3.5 Editor, single window (end of ch.2), 1536×864

This is `09-editor.png` shifted for 1536.

- **Layout:**
  - topbar y 12–68; second bar y 68–120;
  - sunken band y 120–852 (padding 12);
  - canvas pane x 228–1156 and panel x 1164–1512, both y 132–840;
  - prose column x 372–1012.
- **Rail:** `nav: null`. No item is lit, as in `09`, `11` and `t2-07`.
- **Second bar:**
  - location chip (`Archive` icon) `Ashcombe Brook crossing` x 244–408, `/`,
    bold title `Land quality and ecology interface` x 426–676;
  - right: `Freeze` (snowflake, quiet) x 1258–1330 and `● No document
    controls` (neutral pill) x 1351–1503;
  - no `Promote` (the document is unbound).
- **Panel:** tabs `Chat · Comments · Checks`; composer with ✦ and the
  placeholder `Ask for a draft into this document`; chips as `09`.

### 3.6 Editor, split window (ch.3–6 and glimpse), 752×832 per seat

| Region | Native |
|---|---|
| Collapsed rail | x 0–64: wordmark square (18×18) centred at (32, 27); nav icons centred at x 32, rows y = 185 + 39n, **none lit** (`nav: null`); avatar 30 px at (32, 790). Notifications is n = 6, centre (32, 419). Its unread **dot** (7 px, ink) sits at x 42–49, y 403–410 (BUILT `styles.css` 213). |
| Main pane | x 64–740, y 12–820, white, radius 8, pane shadow |
| Topbar | y 12–68: pill `Wrenfield–Ashcombe 400kV Connection` + `· Owner: Trentmoor Energy` on the left (x 84); `● Member` on the right |
| Second bar | y 68–120: chip `Archive` + `Ashcombe Brook crossing` x 84–248; `/`; bold title `Land quality and ecology interface`, truncated with an ellipsis at max-width 190 (x 264–454); presence stack, one 24 px avatar centred at (474, 94); `Freeze` x 494–562; `● No document controls` x 572–720. (DEV: the split width forces the truncation. The shorter names leave only the title truncated.) |
| Band | y 120–820, sunken `#efeeeb`, padding 12 |
| Canvas pane | x 76–420, y 132–808. **Split DEV:** padding 20 top / 24 sides / 24 bottom, so the prose column is x 100–396 (296 wide). The format bar is sticky at y 152–184, icon-only (`B` `I` · `H2` `H3` · bullet, numbered, quote · comment, check), with no `Write | Preview` and a hairline under it. Text starts at y 200, Source Serif 4 15.5/1.72 (line 26.66). The visible text viewport is y 184–784. The textarea keeps its built `min-height: 260` (y 200–460). |
| Panel | x 428–728, y 132–808, padding 18, so content runs x 446–710. Tabs at y 150–182: `Chat` x 446–474, `Comments` x 494–562 (`Comments (1)` x 494–580, centre (537, 166)), `Checks` x 582–628. With a pending suggestion, the muted `1 pending in the document` sits right-aligned and wraps to three lines (`1 pending` / `in the` / `document`), as in `t2-08-panel.png`. That pushes the tab row's hairline from y 182 to y 212. |
| Chat, empty | Composer box x 446–710, y 204–256: ✦ at x 462, placeholder `Ask for a draft into this document`, send 30×30 at x 672–702, aligned to the box's bottom-right with a 10 px inset. The box grows with its text (12.5 px, line 18.75, ≈30 characters a line). Chips sit below it, with an 8 px gap, in three rows of 24 px: `▤ From the library` (live) · `＋ Attach a file` / `≡ Prompts` · `✒ Style` · `◍ Web search` / `▧ Sandbox search` · `✳ Model`. The last six are greyed and disabled. |

### 3.7 Canvas text, by phase (both seats; identical in both canvases)

1. **Ch.2 end to 1338:** the canvas is empty and shows the muted serif
   placeholder `Write here — manual editing has no ceremony: no Suggestion,
   no Signal.`
2. **From 1339:** `doc(f) = nadiaTyped(f) + eleanorTyped(f)`. Eleanor's
   insertion point is anchored after Nadia's text, so Nadia's later characters
   land before it, as a shared editor anchors carets. Final text, y from 200:

   ```
   1. Ecological receptors                                   (y 200–227)
   Redgate's appraisal records the brook corridor as the     (y 227–307, 3 lines)
   principal ecological receptor.
                                                             (blank, y 307–333)
   2. Dewatering and the brook                               (y 333–360)
   ```
3. **Ch.4 to 5:** the suggestion callout sits under the textarea, from y 474
   before scroll.
4. **From 2561:** the accepted paragraph is appended after a blank line
   (y 360–387). It runs 13 lines, y 387–734, and fits the viewport, so the
   scroll is 0. See §7.3.

---

## 4. The shot table

The column key follows master §6.3.
- **Ch** = chapter.
- Cursor points are native, then *screen* in brackets.
- `→` = travel, given as start → arrival. `c` = the click frame. The UI
  responds at c + 2.
- Cursor shape is an arrow by default, a hand over controls (from 4 f before
  arrival), and an I-beam over inputs and the canvas.

### Furniture

| Shot | Frames | Dur | Ch | Seat | Status | Screen state | Camera | Cursor | Typed / streamed | Caption | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| T | 0–89 | 3.0 s | — | — | — | Field `#f2f1ed`. `OpeningTitle` kicker `PILLAR 03`, name `Collaboration`, **scenario line** `Two firms write one document together` (not the deck tagline). | — | none | — | none | The rows fade and rise from f 4, 4 f apart. Out 80–89. |
| G | 90–194 | 3.5 s | — | split | as the end state | `SplitWindows` fade in 84–101 (opacity 0→1, scale 0.985→1, `ease.out`), with the seat tags. **Content = the end state of shot 6.5** (listed after the ch.6 table), frozen. | Wide (split) | none | — | In 96, out 186: label `Where this ends` · `One document, two firms, a resolved thread` | Chapter bar hidden. |
| X | 195–206 | 0.4 s | — | — | DEV 12 f | The pair crossfades to the single `AppWindow` showing shot 1.1's opening state. The seat tags fade out with the pair. | — | none | — | none | Master's split↔single rule is 15 f; the skeleton gives 12. |

### Chapter 1 · Shared space (207–938)

| Shot | Frames | Dur | Ch | Seat | Status | Screen state | Camera | Cursor | Typed / streamed | Caption | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1.1 | 207–254 | 1.6 s | 1 | Rachel | BUILT-NP `sandbox.tsx` 1760–1990 on the BUILT `08` layout · owner shell as `18`/`26` | `Shell` seat Rachel (org line `Trentmoor Energy All projects ▸`, chip `RB` `Rachel Bowen` / `Trentmoor Energy — Owner`, badge `● Owner`), nav `Sandbox`. Nothing selected (§3.2): buttons `New document` · `Upload file` · `+ Sandbox`. Cards: `Personal workspace` (`Building2` Trentmoor Energy / `User` Personal), `Trentmoor Energy — working area` (`Building2` Trentmoor Energy / `Lock` Single organisation). Section `TRENTMOOR ENERGY — ALL DOCUMENTS` with one muted row: `Nothing here yet — create a document or accept a draft from Ask.` @250 the scrim and the `New sandbox` modal fade in (5 f) at step 1 (§3.3). | Wide | Fades in 207–216 at (1060, 560) [1279, 636]. 217 → 240 to `+ Sandbox` (1350, 116) [1597, 151], hand from 236. **c 248** | — | In 208: seat tag `● Rachel Bowen, Trentmoor Energy` (`#159a74`) · label `1 / 6 · Shared space` · `Rachel opens a shared space for two firms` | Chapter bar fades in 207–218. `+ Sandbox` hover fill `#efeeeb` from 240. |
| 1.2 | 255–311 | 1.9 s | 1 | Rachel | BUILT-NP `sandbox.tsx` 240–295 | Modal step 1: `Step 1 of 2`. `Name` is empty (placeholder `e.g. Ecology working area`) and focused, with a 2 px ink caret blinking 15/15. `Access` reads `Private — my organisation`, hint `Private to your organisation`. Buttons `Cancel` · `Next` (disabled while the name is empty). | Wide → **Work m 1.5 on (768, 288)**, move 286–306 | 255 → 279 to the Name input (768, 200) [Wide 960, 243], I-beam from 275. Still from 279; it rides the camera to [960, 352]. | — | (c1 holds) | The cursor does not move during 286–306. |
| 1.3 | 312–363 | 1.7 s | 1 | Rachel | BUILT-NP | Name fills. `Next` enables at the first character. | Work | Still, I-beam | `HumanTyped` `WT_COLLAB.sandboxName` `Ashcombe Brook crossing` (23 ch) from 312, seed 31; nominal end 358 | — | No typed em dash. |
| 1.4 | 364–448 | 2.8 s | 1 | Rachel | BUILT-NP · DEV: select list drawn as `Dropdown` | @389 the Access list opens under the select (fade 4 f). @418 it closes. The select reads `Shared — across organisations`, the hint becomes `Shared across organisations — you choose which, then who`, and `Step 1 of 2` becomes `Step 1 of 3` (`ui` 5 f, both). @449 the body swaps to step 2; the modal grows with `ui` (5 f). | Work | 364 → 379 to Access (768, 270) [960, 467], **c 387**. 393 → 408 to option 2 (768, 338) [960, 579], **c 416**. 422 → 439 to `Next` (958, 362) [1272, 618], **c 447** | — | — | Option hover `#efeeeb`. |
| 1.5 | 449–558 | 3.7 s | 1 | Rachel | BUILT-NP `sandbox.tsx` 299–316 · RULED one membership list (master §0 ruling 2) | Step 2: six unticked rows. @489 `Calder & Hale` ticks. @518 `Redgate Ecology` ticks. @559 step 3. | Work | 453 → 479 to Calder & Hale (555, 206) [611, 362], **c 487**. 493 → 508 to Redgate (555, 239) [611, 416], **c 516**. 522 → 549 to `Next` (958, 462) [1272, 782], **c 557** | — | — | Halvern is never listed. |
| 1.6 | 559–627 | 2.3 s | 1 | Rachel | BUILT-NP `sandbox.tsx` 318–345 · DEV list | Step 3: `Who has access` = `Everyone in the chosen organisations`. Footer `Cancel` · `Back` · `Create sandbox`. @595 the list opens (y 220–286). @624 the value is `Only specific people`, and `People` with its four unticked rows appears (`ui`). | Work | 563 → 585 to the select (768, 200) [960, 352], **c 593**. 599 → 614 to `Only specific people` (768, 268) [960, 464], **c 622** | — | In 584 (c1 out from 581): `Rachel lets in only Eleanor and Nadia` | Rachel's own row is listed: the built roster includes the creator. |
| 1.7 | 628–723 | 3.2 s | 1 | Rachel | BUILT-NP | @656 `Eleanor Price` ticks. @685 `Nadia Okonjo` ticks. `Owen Vance` and `Rachel Bowen` stay unticked. @722 `Create sandbox` presses (0.97, 3 f). | Work | 628 → 646 to Eleanor (555, 309) [611, 531], **c 654**. 660 → 675 to Nadia (555, 375) [611, 639], **c 683**. 689 → 714 to `Create sandbox` (942, 468) [1245, 792], **c 722** | — | (c2 holds) | The ticked list is the beat. |
| 1.8 | 724–806 | 2.8 s | 1 | Rachel | BUILT-NP `sandbox.tsx` 1847–1937 | @724 the modal and scrim fade out (5 f). The page re-renders with the new sandbox selected: `Create with AI` appears in the header. Cards: `Personal workspace` · **`Ashcombe Brook crossing`** (`Building2` Trentmoor Energy / `Users` Shared; selected outline; fades in `ui` 5 f) · `Trentmoor Energy — working area`. Toolbar: `3 in scope` · `Manage access` · `New folder` · `Folder structure` · `Settings`. Breadcrumb `Ashcombe Brook crossing`. Table `NAME · DELIVERABLE · ACTIONS` with the muted row `No folders or documents yet — add a folder, or create a document.` | Work → **Wide**, move 724–744 | Still at (942, 468). Fades out 801–806 | — | (c2 holds) | `3 in scope` = the Trentmoor organisation grant, Eleanor and Nadia (built). |
| 1.9 | 807–818 | 0.4 s | 1 | Rachel → Owen | — | **Crossfade 12 f** to Owen's seat. | Wide | none | — | In 798 (c2 out from 795): seat tag `● Owen Vance, Calder & Hale` (`#b8622f`) · `Everyone else on the project sees nothing` | Required line (master §6.4). |
| 1.10 | 819–938 | 4.0 s | 1 | Owen | BUILT-NP `sandbox.tsx` · BUILT `06` cards · DEV dates | `Shell` seat Owen (`Calder & Hale` · `All projects ▸`, chip `OV` `Owen Vance` / `Calder & Hale — Consultant`, `● Member`), nav `Sandbox`. Nothing selected. Buttons `New document` · `Upload file` (no `+ Sandbox`: Owen is not a super-user). Cards: `Personal workspace` (Calder & Hale / Personal), `Calder & Hale — working area` (Calder & Hale / Single organisation). Section `CALDER & HALE — ALL DOCUMENTS` with one row: `EIA Scoping Method Statement — Land Quality` · `Infora text · Sep 17, 2026` · `⛓ WA-EIA-MST-001` · `Freeze` `Promote` `⋯`. @851 card 2 takes the hover tint `#faf9f7`. | Wide | **Owen**: fades in 822–831 at (900, 600) [1104, 680]. 832 → 851 to rest on `Calder & Hale — working area` (736, 282) [925, 332]. No click | — | (c3 holds) | **4 s on "sees nothing."** No greyed card, no count. |

### Chapter 2 · New document (939–1261)

| Shot | Frames | Dur | Ch | Seat | Status | Screen state | Camera | Cursor | Typed / streamed | Caption | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2.1 | 939–950 | 0.4 s | 2 | Owen → Eleanor | — | **Crossfade 12 f** to Eleanor's Sandbox page: `Shell` seat Eleanor (`Calder & Hale` · `All projects ▸`, `EP` `Eleanor Price` / `Calder & Hale — Consultant`, `● Member`), nav `Sandbox`. Nothing selected. Buttons `New document` · `Upload file` · `+ Sandbox`. Cards: `Personal workspace` · `Ashcombe Brook crossing` (Trentmoor Energy / Shared) · `Calder & Hale — working area`. The section and row are the same as Owen's. | Wide | Owen's cursor fades with the crossfade | — | In 942 (c3 out from 939): seat tag `● Eleanor Price, Calder & Hale` (`#6d5dd3`) · label `2 / 6 · New document` · `Eleanor creates a document in the shared space` | Owen had two cards; Eleanor has three. |
| 2.2 | 951–1020 | 2.3 s | 2 | Eleanor | BUILT-NP `sandbox.tsx` 1772–1860 | @990 the shared card is selected (outline). `Create with AI` appears, and `New document` moves to (977, 116). Toolbar: `3 in scope` · `Manage access` · muted `Locked structure — folders are set by a super-user`. Breadcrumb `Ashcombe Brook crossing`. Empty table row `No folders or documents yet — add a folder, or create a document.` @1021 the `New document` modal fades in (5 f). | Wide | Fades in 951–960 at (1000, 560) [1214, 636]. 961 → 980 to the card (736, 282) [925, 332], **c 988**. 994 → 1011 to `New document` (977, 116) [1189, 151], **c 1019** | — | (c4 holds) | Card hover `#faf9f7`. |
| 2.3 | 1021–1119 | 3.3 s | 2 | Eleanor | BUILT-NP `TextModal` | Modal: `New document` · `Title` (focused) · `Cancel` · `Create document`. The title fills. | Wide | 1025 → 1040 to the Title input (768, 176) [960, 216], I-beam | `HumanTyped` `WT_COLLAB.docTitle` `Land quality and ecology interface` (34 ch) from 1046, seed 32; nominal end 1114 | — | — |
| 2.4 | 1120–1154 | 1.2 s | 2 | Eleanor | BUILT-NP · DEV date | @1143 `Create document` presses. @1145 the modal fades out (5 f), and the new row replaces the empty one (fade 3 f): `FileText` · bold `Land quality and ecology interface` · mono `v0.1` · muted `Infora text · Oct 02, 2026` · `● Unbound` · actions `Freeze` `⋯`. | Wide | 1120 → 1135 to `Create document` (906, 244) [1111, 291], **c 1143** | — | — | No `Promote` on an unbound row. |
| 2.5 | 1155–1215 | 2.0 s | 2 | Eleanor | BUILT `07` menu | @1187 the row menu opens (fade 4 f), x 1169–1388: `Open in Editor` · `Move…` · `Metadata…` · `Rename…` · `Bind…`. @1214 `Open in Editor` is clicked. | Wide | 1155 → 1177 to `⋯` (1369, 464) [1617, 532], **c 1185**. 1191 → 1206 to `Open in Editor` (1240, 504) [1476, 575], **c 1214** | — | — | Item hover `#efeeeb`. |
| 2.6 | 1216–1261 | 1.5 s | 2 | Eleanor | BUILT `09` layout · BUILT-NP empty doc · DEV location chip | **Cut** at 1216 to the Editor, single window (§3.5). **`nav: null`**, so the rail clears and nothing is lit. The canvas is empty with the placeholder. The panel shows the `Chat` tab with an empty composer and chips. No presence avatars. | Wide | Rests at (1240, 504) | — | — | — |

### Chapter 3 · Together (1262–1679)

| Shot | Frames | Dur | Ch | Seat | Status | Screen state | Camera | Cursor | Typed / streamed | Caption | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 3.1 | 1262–1276 | 0.5 s | 3 | split | — | **Crossfade 15 f** into `SplitWindows`: left Eleanor (822×910 at (120, 60)), right Nadia (at (978, 60)). Both show the split editor (§3.6) on the empty document, with the rail unlit. Right: `Shell` seat Nadia (`NO` avatar, `● Member`). Seat tags at y 24–52, 17 px, weight 600: `● Eleanor Price, Calder & Hale` (`#6d5dd3`) over the left window and `● Nadia Okonjo, Redgate Ecology` (`#3a6ea5`) over the right. | Wide (split) | Eleanor's cursor fades with the single window | — | In 1276 (c4 out from 1273): label `3 / 6 · Together` · `Nadia from Redgate opens the same document` | No camera in split. |
| 3.2 | 1277–1338 | 2.1 s | 3 | Nadia | BUILT-NP `presence.tsx` · VISION editing fill + `PresenceFlag` (flows B.2 (1), (2)) | @1285 the presence avatars fade in (`ui` 5 f): `NO` in the left doc bar, `EP` in the right, both in the built sunken fill. @1333 Nadia's caret lands in her canvas. On the **left**, `NO` flips to the editing fill (`#1c1b18`, white initials), and a `PresenceFlag` appears at (100, 200): a 2 px ink caret with an ink flag `Nadia Okonjo` above it (white 10.5 px, weight 600, radius 4, padding 1/6). | Wide | **Nadia**: fades in 1290–1299 at (560, 600) [1590, 716]. 1300 → 1323 to the canvas (180, 230) [1175, 312], I-beam. **c 1331** | — | (c5 holds) | The placeholder stays until the first character. |
| 3.3 | 1339–1563 | 7.5 s | 3 | **both** | BUILT-NP canvas textarea · VISION live remote text, two `PresenceFlag`s, editing fill (B.2 (1), (2), (4)) | **Both canvases show both texts on the same frames** (§3.7 phase 2). @1339 Nadia's text starts. @1399 Eleanor's caret lands at the end of the document. On the **right**, `EP` flips to the editing fill and a flag `Eleanor Price` appears at Eleanor's caret. @1403 Eleanor's text starts below Nadia's. Each window shows the **other** person's flagged caret; its own caret is the plain local caret. As Nadia's sentence wraps (twice), Eleanor's blank line and heading, and her flag in Nadia's window, drop one line each time. @1529 (60 f idle) Eleanor's flag in Nadia's window collapses to `EP`. | Wide | **Nadia**: still at (180, 230) [1175, 312], I-beam. **Eleanor** (left): fades in 1363–1372 at (300, 650) [448, 771]. 1373 → 1389 into the canvas below the text (250, 420) [393, 519], I-beam. **c 1397** (the caret goes to the end of the document). Still while typing | **Nadia** `HumanTyped` `WT_COLLAB.nadiaText` (108 ch: `1. Ecological receptors` ⏎ `Redgate's appraisal records the brook corridor as the principal ecological receptor.`) from 1339, seed 33; heading and newline done 1395; nominal end 1563. **Eleanor** `HumanTyped` `WT_COLLAB.eleanorHeading` (⏎ ⏎ `2. Dewatering and the brook`, 29 ch) from 1403, seed 34; nominal end 1469 | In 1360 (c5 out from 1357): `Both write in the same document at once` | **The simultaneity beat.** Two cursors and two growing texts, 1403–1469. Nadia keeps typing to 1563 while Eleanor's flag rides down. Drive each canvas from the same two `HumanTyped` timelines (one seed each, two renders). No pills on typed text. |
| 3.4 | 1564–1679 | 3.9 s | 3 | split | VISION flag collapse | Hold. @1623 Nadia's flag in Eleanor's window collapses to `NO`. Eleanor's cursor fades out 1560–1565 (idle); Nadia's fades out 1654–1659. | Wide | as stated | — | (c6 holds) | Readable hold of Nadia's sentence (14 words, 112 f): 1563–1675. |

### Chapter 4 · Ask the agent (1680–2355)

| Shot | Frames | Dur | Ch | Seat | Status | Screen state | Camera | Cursor | Typed / streamed | Caption | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 4.1 | 1680–1855 | 5.9 s | 4 | Eleanor | BUILT-NP `editor.tsx` 1073–1090, `chat-composer.tsx` | @1722 the left composer is focused (focus ring). Eleanor's caret leaves the canvas, so her flag in Nadia's window hides (`ui`). The request types in, and the box grows to 2 lines (y 204–266). The chips drop to row 1 at y 278–302. | Wide | **Eleanor**: fades in 1683–1692 at (250, 420). 1693 → 1712 to the composer (560, 230) [732, 312], I-beam. **c 1720**. Still while typing | `HumanTyped` `WT_COLLAB.promptTyped` `Draft this section on how dewatering could affect the brook,` (60 ch) from 1726, seed 35; nominal end 1850 | In 1684 (c6 out from 1681): label `4 / 6 · Ask the agent` · `Eleanor asks the agent, naming two library sources` | The shortened prompt. |
| 4.2 | 1856–1929 | 2.5 s | 4 | Eleanor | BUILT-NP `composer-sources.tsx` 15–45, `chat-composer.tsx` 43–48 | @1881 the library list opens **above** the chip (top placement, fade 4 f), x 446–626, y 74–274. Six mono rows of 32 px: `WA-CON-SCC-002`, `WA-EIA-MST-001`, `WA-EIA-SCP-001`, `WA-ENV-BAS-003`, `WA-GEO-GIR-004`, `WA-WAT-FRA-001` (centres y 94, 126, 158, 190, 222, 254). @1910 the list closes and ` per WA-GEO-GIR-004` is inserted at once (built: the trailing space is trimmed, then ` per <ref>`). The box grows to 3 lines (y 204–284), and the chips drop to y 296. @1916–1924 ` and` types. | Wide | 1856 → 1871 to `▤ From the library` (504, 290) [671, 377], **c 1879**. 1885 → 1900 to `WA-GEO-GIR-004` (536, 222) [706, 303], **c 1908** | `HumanTyped` ` and` from 1916, seed 36; nominal end 1924 | — | No `WA-ECO-PEA-001` in Eleanor's list (the wall). |
| 4.3 | 1930–2012 | 2.8 s | 4 | Eleanor | BUILT-NP | @1955 the list opens again (y 92–292; rows centred 112, 144, 176, 208, 240, 272). @1984 it closes. The composer now reads `WT_COLLAB.promptFinal`: `Draft this section on how dewatering could affect the brook, per WA-GEO-GIR-004 and per WA-ENV-BAS-003` (4 lines, box y 204–303). @2011 send presses. | Wide | 1930 → 1945 to the chip (504, 308) [671, 397], **c 1953**. 1959 → 1974 to `WA-ENV-BAS-003` (536, 208) [706, 288], **c 1982**. 1988 → 2003 to send (687, 278) [871, 364], **c 2011** | — | — | — |
| 4.4 | 2013–2087 | 2.5 s | 4 | split | BUILT-NP `editor.tsx` 1053–1072 (Eleanor) · RULED shared thread (ADR-0039 §1; stored T-150/T-160) · VISION named label and pending state in Nadia's panel (flows B.3) · BUILT-NP `working-set.tsx` 87–110 | **Both panels, same frame (2013).** The log appears above the composer. Left: micro label `YOU`, then the request in the user bubble (sunken, radius 8, padding 12/15, popout shadow; 12.5 px; 3 lines, y 212–295). Right: micro label `ELEANOR PRICE · CALDER & HALE` and the same bubble. Both: `INFORA AGENT` and `Working…` with the shimmer. Both: the chip row `📎 Attach source` above an emptied composer and the chips. The left send button becomes the stop square (built, while pending). | Wide | Eleanor still at (687, 278) | — | — | The data holds `You`, `Infora agent` and `Eleanor Price · Calder & Hale`; they render uppercase in the built micro style. `Working…` runs 75 f. |
| 4.5 | 2088–2237 | 5.0 s | 4 | split | BUILT-NP `editor.tsx` 893–945 callout, `cited-prose.tsx` · VISION follow-scroll (§12 item 6) | **Both, same frames.** @2088 the reply streams at 3 c/f (2088–2099): `Done — 1 suggestion on the document.` The left stop button reverts to send. @2088 the tabs gain the muted `1 pending in the document`; the hairline moves to y 212 and the panel content shifts down 30. @2088 the suggestion callout fades in (`ui` 5 f) under the textarea in **both** canvases: x 100–396, from y 474, `#efeeeb`, radius 8, popout shadow, padding 14/16. Tag line: NumBadge `1` + `SUGGESTION · INSERT · PENDING YOUR DECISION` (10.5 px bold, 0.8 px tracking, `#57564f`). The claims stream (§7.2): claim 1 2094–2131, pill 2133; claim 2 2136–2170, pill 2172; claim 3 2175–2198, pill 2200; claim 4 2203–2225, pill 2227. @2232 the actions fade in (`ui` 5 f): `✓ Accept` (primary sm) · `✎ Edit` · `↻ Refine` · `Reject` (danger sm). **Follow-scroll** in both canvases: scroll = `max(0, revealedBottom − 776)`, each new line eased over 6 f. It settles at S = calloutBottom − 776 (nominal 245), so the callout sits at y ≈ 229–776 and the typed text passes under the format bar. | Wide | Eleanor fades out 2102–2107 (idle) | `Streamed` reply, 3 c/f from 2088 (ends 2099). `CitedClaims` `WT_COLLAB.suggestion` from 2094, rate 4, gap 4 (ends 2225) | In 2079 (c7 out from 2076): `One cited draft appears for both of them` | Every pill is a library `SourceChip`: fill `#efeeeb`, border `#ececea`, 11.5 px, `#57564f`. |
| 4.6 | 2238–2355 | 3.9 s | 4 | split | as 4.4 | Hold the complete state: both callouts full, both threads complete. | Wide | none | — | In 2240 (c8 out from 2237): `Nadia sees Eleanor's request in the shared thread` | The static hold, cut from 7.7 s to 3.9 s to pay for the prompt. |

### Chapter 5 · Accept (2356–2729)

| Shot | Frames | Dur | Ch | Seat | Status | Screen state | Camera | Cursor | Typed / streamed | Caption | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 5.1 | 2356–2390 | 1.2 s | 5 | Nadia | BUILT-NP pill · VISION `PillHoverCard` | Right: @2387 (6 f hover delay) a hover card fades in (4 f) **above** the `WA-ENV-BAS-003` pill that ends claim 3. It is white, radius 8, level-4 overlay, 280 wide, x 108–388, y ≈ 428–608. Contents: mono `WA-ENV-BAS-003` · `v3` · success pill `● Live`; micro `Cited passage`; a sunken passage block (serif 13.5/1.55) with the highlighted sentence (warning tint `#fbf3e3`) `The Ashcombe Brook supports brown trout and is classified Moderate under the Water Framework Directive (Table 9).`, then plain `Two residential receptors lie within 150 m of the corridor at Ashcombe Lane.`; muted 11.5 px footer `Environmental Baseline Compendium`. | Wide | **Nadia**: fades in 2356–2365 at (300, 700) [1306, 826]. 2366 → 2381 to the claim-3 pill, nominal (330, 622) [1339, 740]; **measure** the rendered pill centre. Hand | — | In 2357 (c9 out from 2354): label `5 / 6 · Accept` · `Nadia checks the ecology source, then accepts` | The hover is local: nothing changes on the left. |
| 5.2 | 2391–2535 | 4.8 s | 5 | Nadia | VISION | The hover card is held. | Wide | Still on the pill | — | (c10 holds) | The highlighted sentence is 18 words (144 f); it is held 145 f. |
| 5.3 | 2536–2560 | 0.8 s | 5 | Nadia | BUILT-NP callout actions | @2537 the card fades (4 f) as the pointer leaves. @2559 `✓ Accept` presses. | Wide | 2536 → 2551 to `✓ Accept` (151, 748) [1143, 878] (**measure**), **c 2559** | — | In 2550 (c10 out from 2547): `Accepted once, it lands for both` | — |
| 5.4 | 2561–2729 | 5.6 s | 5 | split | BUILT-NP accept, which appends to the document (`resolution.ts` 43–) · VISION `TrackedChange` insert, then settle (flows §E row 14) | **Both, same frames.** @2561 the callout dissolves (5 f). The accepted text is appended (§7.3) **under `2. Dewatering and the brook`**, as plain prose with no pills, drawn as a green tracked insert. Both canvases ease their scroll back to 0 over 2561–2580. The tabs lose `1 pending in the document`; the hairline goes back to y 182 and the content moves up 30. @2675–2689 the green settles to plain ink. | Wide | Nadia still until she fades out 2650–2655 | — | (c11 holds) | From here the paragraph stays on screen to the last frame. |

### Chapter 6 · Discuss (2730–3284)

| Shot | Frames | Dur | Ch | Seat | Status | Screen state | Camera | Cursor | Typed / streamed | Caption | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 6.1 | 2730–2800 | 2.4 s | 6 | Nadia | BUILT-NP `editor.tsx` 870–885 (selection bubble) · VISION `RemoteSelection` + flag (B.2 (3)) | Right: @2766–2770 "dewatering" in claim 2 of the accepted paragraph (`…during construction dewatering.`; nominal span x 115–189, line centre y 587, **measure**) selects with the system selection tint. @2772 the floating `Comment` bubble appears above the selection end (white pill, level-4 overlay, `MessageSquare` + `Comment`, 12 px bold), x 181–263, y 539–563. **Left, same frames:** a `RemoteSelection` grows under "dewatering" (sunken tint `#efeeeb`, 1 px dotted `#78766f` underline), with the flag `Nadia Okonjo` at its end. @2801 Nadia's panel switches to `Comments` and shows the new-comment form: anchor `❝ dewatering` (sunken, 11.5 px); a focused textarea (placeholder `Comment on the selected text — @ mentions a colleague`); `Comment` (primary, disabled) · `Cancel`. Left: the remote selection and flag fade at 2801. | Wide | **Nadia**: fades in 2733–2742 at (151, 748) [1143, 878]. 2743 → 2758 to the start of "dewatering" (115, 587) [1104, 702], I-beam. Press 2766, drag to (189, 587) [1185, 702] at 20 screen px/f, release 2770. 2776 → 2791 to the bubble (222, 551) [1221, 663], **c 2799** | — | In 2734 (c11 out from 2731): label `6 / 6 · Discuss` · `Nadia raises the trout with Eleanor` | Lowercase "dewatering" is unique in the document (the heading has a capital D). |
| 6.2 | 2801–2984 | 6.1 s | 6 | Nadia | BUILT-NP `comments-panel.tsx` 52–120, 380–425 | Right panel: `@El` types. @2815 the mention list opens under the textarea (fade 4 f; x 468–648, y 299–335) with one row, `@Eleanor Price`. @2849 the textarea reads `@Eleanor Price ` and the list closes. The rest types. @2981 Enter submits. **Both, @2983:** the right panel shows `New comment` (secondary, top) and the open thread: `❝ dewatering`; `Nadia Okonjo` (bold 12 px), muted `Oct 02, 2026, 10:58 AM` and the edit/delete tools; body `@Eleanor Price where does the dewatering water go? The brook has trout.`, with `@Eleanor Price` in `#274a6d` weight 600; `Reply` · `Close` (quiet sm). Both canvases: an amber anchor mark under "dewatering". Left: the tab label becomes `Comments (1)`, and the **unread dot** appears on the Notifications bell of the collapsed rail. | Wide | **Nadia**: still at (222, 551) while `@El` types. 2819 → 2839 to `@Eleanor Price` (540, 317) [1569, 407], **c 2847**. Still while typing; she fades out 3074–3079 (idle). **Eleanor**: fades in 2975–2984 at (300, 500) [448, 607] | `HumanTyped` `@El` from 2807, seed 37; nominal end 2813. `HumanTyped` `WT_COLLAB.commentRest` `where does the dewatering water go? The brook has trout.` (56 ch) from 2853, seed 38; nominal end 2973. Enter at 2981 | — | The dot is BUILT (T-331, collapsed style); its live arrival is VISION. So is the thread arriving on the left without a reload (it polls). |
| 6.3 | 2985–3047 | 2.1 s | 6 | Eleanor | BUILT-NP `comments-panel.tsx` 290–345 | @3015 the left panel switches to `Comments`: `New comment` (y 198–226), then the thread card from y 236 (anchor, head, 2–3 line body), with `Reply` and `Close` (nominal y 376). @3044 the reply box replaces the actions: a focused textarea (placeholder `Reply — @ mentions a colleague`) with `Reply` (primary) · `Cancel`. | Wide | **Eleanor**: 2985 → 3005 to `Comments (1)` (537, 166) [707, 242], **c 3013**. 3019 → 3034 to `Reply` (492, 376) [658, 471] (**measure**), **c 3042** | — | In 2976 (c12 out from 2973): `Eleanor sees the mention and replies` | — |
| 6.4 | 3048–3215 | 5.6 s | 6 | Eleanor | BUILT-NP | The reply types. @3208 Enter submits. **Both, @3210:** the reply appears in the thread, indented 14 with a 2 px left rule: `Eleanor Price` · `Oct 02, 2026, 11:05 AM` · `The GI recommends a dewatering management plan - I'll cover the brook in it.` The actions row returns below it (`Close` nominal (561, 492)). | Wide | Eleanor still at (492, 376) while typing | `HumanTyped` `WT_COLLAB.reply` (76 ch) from 3048, seed 39; nominal end 3200 | In 3210 (c13 out from 3207): `Eleanor closes the thread once answered` | People type a hyphen, not an em dash. The reply carries no pill. |
| 6.5 | 3216–3284 | 2.3 s | 6 | **both** | BUILT-NP `comments-panel.tsx` 300–310, 410–425 | @3239 `Close` is clicked. **Both, @3241:** the thread leaves the open list. Each panel shows the muted `No open comments. Select text on the canvas and press Comment, or start one here — any project colleague can reply and close.` and `▸ Resolved (1)`. The anchor marks leave both canvases, and the left tab reads `Comments`. **Same frame, both seats (c 3268):** on the left, `▸ Resolved (1)` expands to `▾ Resolved (1)`, showing the closed thread on the built closed-thread fill (`surface-hover`): `❝ dewatering`, Nadia's comment, Eleanor's reply, italic muted `Resolved by Eleanor Price · Oct 02, 2026, 11:06 AM`, and `Reopen`. On the right, Nadia's `Chat` tab opens: `ELEANOR PRICE · CALDER & HALE` and the request bubble; `INFORA AGENT` and `Done — 1 suggestion on the document.`; `📎 Attach source`; the empty composer and chips. | Wide | **Eleanor**: 3216 → 3231 to `Close` (561, 492) [734, 598], **c 3239**. 3245 → 3260 to `▸ Resolved (1)` (490, 336) [656, 428], **c 3268**. **Nadia**: fades in 3235–3244 at (498, 319) [1523, 409]. 3245 → 3260 to `Chat` (460, 166) [1481, 242], **c 3268** | — | (c14 holds) | Two cursors, two clicks on one frame. |

**The end state** (frames 3270–3434, and the glimpse at 90–194):
- **Both windows:** the split editor on `Land quality and ecology interface`,
  with the rail unlit. The canvas reads `1. Ecological receptors`, Nadia's
  sentence, a blank line, `2. Dewatering and the brook`, a blank line, then
  the accepted paragraph in plain ink. There are no marks, and the scroll is 0.
- **Left (Eleanor):** presence `NO` in the editing fill; the Notifications dot
  on the collapsed rail; the panel on `Comments`, with the resolved thread
  expanded.
- **Right (Nadia):** presence `EP` in the editing fill; the panel on `Chat`,
  showing the shared thread.
- No cursors in the glimpse, or after 3290.

### Close and logo

| Shot | Frames | Dur | Ch | Seat | Status | Screen state | Camera | Cursor | Typed / streamed | Caption | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| C | 3285–3434 | 5.0 s | — | split | as 6.5 | The end state, frozen. The chapter bar holds with all six done. | Wide (split) | Both cursors fade out 3285–3290 | — | In 3288 (c14 out from 3285): the label stays `6 / 6 · Discuss` · `Two firms, one document, nothing emailed` | — |
| L | 3435–3524 | 3.0 s | — | — | — | The windows, seat tags, caption and chapter bar fade out 3435–3446 (`ease.out`). `Wordmark size={72} tone="onField"` fades in 3441–3455 at (960, 540) and holds. | — | — | — | — | No tagline, no URL. |

---

## 5. Caption list

The label row reads `<n> / 6 · <chapter>`. The seat tag sits on the label row
only in single-window shots; in split, the tags sit over the windows. Every
line is 8 words or fewer, present tense, with no full stop and no dash.

| # | In | Out starts | On (f) | Min (f) | Label | Seat tag | Line | Words |
|---|---|---|---|---|---|---|---|---|
| g | 96 | 186 | 90 | 80 | `Where this ends` | — | One document, two firms, a resolved thread | 7 |
| c1 | 208 | 581 | 373 | 88 | `1 / 6 · Shared space` | Rachel Bowen, Trentmoor Energy | Rachel opens a shared space for two firms | 8 |
| c2 | 584 | 795 | 211 | 80 | `1 / 6 · Shared space` | Rachel Bowen, Trentmoor Energy | Rachel lets in only Eleanor and Nadia | 7 |
| c3 | 798 | 939 | 141 | 80 | `1 / 6 · Shared space` | Owen Vance, Calder & Hale | Everyone else on the project sees nothing | 7 |
| c4 | 942 | 1273 | 331 | 88 | `2 / 6 · New document` | Eleanor Price, Calder & Hale | Eleanor creates a document in the shared space | 8 |
| c5 | 1276 | 1357 | 81 | 80 | `3 / 6 · Together` | — | Nadia from Redgate opens the same document | 7 |
| c6 | 1360 | 1681 | 321 | 88 | `3 / 6 · Together` | — | Both write in the same document at once | 8 |
| c7 | 1684 | 2076 | 392 | 88 | `4 / 6 · Ask the agent` | — | Eleanor asks the agent, naming two library sources | 8 |
| c8 | 2079 | 2237 | 158 | 88 | `4 / 6 · Ask the agent` | — | One cited draft appears for both of them | 8 |
| c9 | 2240 | 2354 | 114 | 88 | `4 / 6 · Ask the agent` | — | Nadia sees Eleanor's request in the shared thread | 8 |
| c10 | 2357 | 2547 | 190 | 80 | `5 / 6 · Accept` | — | Nadia checks the ecology source, then accepts | 7 |
| c11 | 2550 | 2731 | 181 | 75 | `5 / 6 · Accept` | — | Accepted once, it lands for both | 6 |
| c12 | 2734 | 2973 | 239 | 75 | `6 / 6 · Discuss` | — | Nadia raises the trout with Eleanor | 6 |
| c13 | 2976 | 3207 | 231 | 75 | `6 / 6 · Discuss` | — | Eleanor sees the mention and replies | 6 |
| c14 | 3210 | 3285 | 75 | 75 | `6 / 6 · Discuss` | — | Eleanor closes the thread once answered | 6 |
| close | 3288 | 3435 (with the logo) | 147 | 75 | `6 / 6 · Discuss` | — | Two firms, one document, nothing emailed | 6 |

There are 16 cues. Each one meets `max(75, words × 8 + 24)`, and each starts
3 f after the previous one begins to leave. The shot table references the
same numbers.

---

## 6. Typing and streaming schedule (all `HumanTyped`, at the §2.11 cadence)

| Key | Text | Chars | Field | From | Nominal end | Seed |
|---|---|---|---|---|---|---|
| `sandboxName` | `Ashcombe Brook crossing` | 23 | wizard Name | 312 | 358 | 31 |
| `docTitle` | `Land quality and ecology interface` | 34 | New document Title | 1046 | 1114 | 32 |
| `nadiaText` | `1. Ecological receptors` ⏎ `Redgate's appraisal records the brook corridor as the principal ecological receptor.` | 108 | Nadia's canvas | 1339 | 1563 | 33 |
| `eleanorHeading` | ⏎ ⏎ `2. Dewatering and the brook` | 29 | Eleanor's canvas (end of document) | 1403 | 1469 | 34 |
| `promptTyped` | `Draft this section on how dewatering could affect the brook,` | 60 | Eleanor's composer | 1726 | 1850 | 35 |
| `promptAnd` | ` and` | 4 | Eleanor's composer | 1916 | 1924 | 36 |
| `commentAt` | `@El` | 3 | Nadia's comment box | 2807 | 2813 | 37 |
| `commentRest` | `where does the dewatering water go? The brook has trout.` | 56 | Nadia's comment box | 2853 | 2973 | 38 |
| `reply` | `The GI recommends a dewatering management plan - I'll cover the brook in it.` | 76 | Eleanor's reply box | 3048 | 3200 | 39 |

**How the nominal ends are computed.** Each uses 2 f per character (the mean
of the §2.11 gap set), +4 after a comma, and +8 after a full stop or question
mark mid-string.

**Seed rule.** If the listed seed's `endsAt` is later than the nominal end,
step the seed upward until it is not. Any slack becomes caret idle. Never
move a later click to make the typing fit. In both canvases, use one
`HumanTyped` timeline per person, since each canvas renders both texts.

The largest typed total in one field is 108 characters, under the 120 cap.

| Agent reveal | From | Rate | End |
|---|---|---|---|
| Chat reply `Done — 1 suggestion on the document.` (36 ch) | 2088 | 3 c/f | 2099 |
| Claim 1 (152 ch) | 2094 | 4 c/f | 2131, pill 2133 |
| Claim 2 (140 ch) | 2136 | 4 c/f | 2170, pill 2172 |
| Claim 3 (94 ch) | 2175 | 4 c/f | 2198, pill 2200 |
| Claim 4 (92 ch) | 2203 | 4 c/f | 2225, pill 2227 |

---

## 7. The agent's suggestion, written out

### 7.1 The request (as sent)

`Draft this section on how dewatering could affect the brook, per
WA-GEO-GIR-004 and per WA-ENV-BAS-003`

### 7.2 The callout (both canvases)

> **1** · SUGGESTION · INSERT · PENDING YOUR DECISION
>
> Intrusive investigation at Wrenfield Sidings recorded a shallow perched water
> table at 1.6–2.1 m within made ground of ash, clinker and demolition fill.
> `WA-GEO-GIR-004`
>
> The investigation identifies this perched horizon as a plausible migration
> pathway toward the Ashcombe Brook during construction dewatering.
> `WA-GEO-GIR-004`
>
> The brook supports brown trout and is classified Moderate under the Water
> Framework Directive. `WA-ENV-BAS-003`
>
> The crossing is proposed as trenchless, with launch and reception pits
> outside Flood Zone 3. `WA-WAT-FRA-001`
>
> `✓ Accept` · `✎ Edit` · `↻ Refine` · `Reject`

Each claim is its own `cited-claim` block, 10 px apart, with its pill riding
the last line, as built. There is no `WithheldNotice`. The en dash in
`1.6–2.1 m` stays.

**Grounding, checked against `packages/db/src/seed.ts`:**

| Claim | Seed passage it rests on |
|---|---|
| 1 | GIR-004 v2: "Intrusive investigation across the Wrenfield Sidings compound identified made ground to a depth of 2.4 m, comprising ash, clinker and demolition fill over glacial till. … A shallow perched water table was encountered at 1.6–2.1 m within the made ground." |
| 2 | GIR-004 v2: "The perched horizon provides a plausible migration pathway toward the Ashcombe Brook during construction dewatering." |
| 3 | ENV-BAS-003 v3: "The Ashcombe Brook supports brown trout and is classified Moderate under the Water Framework Directive (Table 9)." |
| 4 | WAT-FRA-001 v1: "Trenchless crossing is proposed beneath the watercourse, with launch and reception pits located outside Flood Zone 3." |

Eleanor named two documents. The library search also found the flood risk
note for claim 4. Nothing came from a draft.

### 7.3 After acceptance (canvas text, both seats)

```
1. Ecological receptors
Redgate's appraisal records the brook corridor as the principal ecological receptor.

2. Dewatering and the brook

Intrusive investigation at Wrenfield Sidings recorded a shallow perched water table at 1.6–2.1 m within made ground of ash, clinker and demolition fill. The investigation identifies this perched horizon as a plausible migration pathway toward the Ashcombe Brook during construction dewatering. The brook supports brown trout and is classified Moderate under the Water Framework Directive. The crossing is proposed as trenchless, with launch and reception pits outside Flood Zone 3.
```

This is plain prose. The built canvas is a plain-text field, so the pills live
on the callout, not on accepted text. Nothing in the captions or narration
implies that they persist.

### 7.4 The hover card (Nadia's seat, ch.5)

`WA-ENV-BAS-003` · `v3` · `● Live` / `Cited passage` / "**The Ashcombe Brook
supports brown trout and is classified Moderate under the Water Framework
Directive (Table 9).** Two residential receptors lie within 150 m of the
corridor at Ashcombe Lane." (bold = highlight) / `Environmental Baseline
Compendium`.

The seed text is verbatim and consecutive. The card shows no page number,
because the seed gives none for this document.

### 7.5 The discussion, checked against the seed

- **Nadia:** `@Eleanor Price where does the dewatering water go? The brook has
  trout.`
  - Her fact, "the brook has trout", is ENV-BAS-003 v3: "The Ashcombe Brook
    supports brown trout".
  - Her question is one the record does not answer. No library passage says
    where dewatering discharges.
- **Eleanor:** `The GI recommends a dewatering management plan - I'll cover the
  brook in it.`
  - Her fact is GIR-004 v2: "Recommendations: construction-phase watching
    brief, targeted remediation of the three PAH hotspots, and a dewatering
    management plan."
  - The rest is her own commitment, not a claim about the record.
- **Rejected wording:** the review proposed "No discharge to the brook". I did
  not use it, because nothing in the seed supports it. The seed has no CoCP
  text and no discharge statement. The FRA mentions only a drainage strategy
  for compound runoff.

---

## 8. Camera share

| State | Frames | Share of the window's time (90–3434, 3,345 f) |
|---|---|---|
| Wide (single and split) | 2,886 | 86.3% |
| Work (286–744, including both moves) | 459 | 13.7% |
| Detail | 0 | 0% |

These are within the limits. There are two camera moves (286–306 and 724–744).
There is no camera in split.

---

## 9. Narration

The script is about 225 words, read at ≈ 140 wpm (13 f a word). It is silent
over the title and the logo, with short silences at 1621–1690, 2700–2740 and
3425–3434. It uses hyphens only, and the frame cues are video-local.

| Cue | Ch | Line |
|---|---|---|
| 100 | glimpse | One document, two firms, one shared thread. |
| 212 | 1 | Rachel Bowen, for the client, Trentmoor Energy, opens a shared work-in-progress area. Nothing in it is issued until it is promoted through review. |
| 530 | 1 | She shares it across organisations, then names exactly who may come in: |
| 690 | 1 | Eleanor Price and Nadia Okonjo, and nobody else from either firm. |
| 835 | 1 | Owen, on the same project, sees nothing of it. |
| 960 | 2 | Eleanor finds the shared area on her page and starts a document there. |
| 1135 | 2 | No file is attached or emailed. |
| 1280 | 3 | Nadia Okonjo, from Redgate Ecology, opens the same document. |
| 1400 | 3 | Both write at once, Nadia her ecology section, Eleanor the next heading, each seeing the other's cursor. |
| 1690 | 4 | Eleanor asks the agent to draft her section, naming two documents from the project library. |
| 1890 | 4 | Two picks from the library list, and send. |
| 2015 | 4 | The agent drafts into the document, in both windows at once. |
| 2160 | 4 | Every sentence carries its source from the library. |
| 2265 | 4 | Nadia sees it in the shared thread. |
| 2370 | 5 | Before trusting it, Nadia checks the ecology claim against the baseline: brown trout, moderate status. |
| 2570 | 5 | She accepts, and it lands under Eleanor's heading for both. |
| 2740 | 6 | Nadia asks where the dewatering water will go, because the brook holds trout, and mentions Eleanor. |
| 2990 | 6 | Eleanor gets the mention, answers from the ground investigation's own recommendation, and closes the thread. |
| 3190 | 6 | Resolved, and attributed. |
| 3295 | close | Two firms wrote one document together, and nothing was emailed. |

Words per segment, 225 in all:

| Segment | Words |
|---|---|
| Glimpse | 7 |
| Ch.1 | 55 |
| Ch.2 | 19 |
| Ch.3 | 26 |
| Ch.4 | 49 |
| Ch.5 | 25 |
| Ch.6 | 34 |
| Close | 10 |

This is below the master's 260–290 band (§12 item 8).

The Owen line, 835–952, runs 13 f into chapter 2's crossfade. Each line's end
was checked at 13 f a word, and no two lines overlap.

---

## 10. What the lead must change before build

> **Lead: these are the shared-file and data changes W3 depends on.** W3
> builds nothing in `src/walkthroughs/shared/` or `src/data/` itself.

### 10.1 Data: `src/data/wrenfield.ts` (new exports, plus changes to the master's W3 values)

**Changes to master values:**

| Master ref | Was | W3 now needs | Why |
|---|---|---|---|
| §4.2 / §4.7 sandbox name | `Ashcombe Brook crossing — shared working area` | `Ashcombe Brook crossing` | Viewer change 5: a typed em dash looks scripted. Saves 44 f. |
| §4.2 W3 document title | `Ashcombe Brook crossing — land quality and ecology interface` | `Land quality and ecology interface` | Viewer change 5 |
| §4.2 shared card meta | `… · with Calder & Hale, Redgate Ecology` | **no `with` line** | Accuracy should-fix 8; producer ruling |
| §4.7 Nadia's text | `2. Ecological receptors`, pre-typed | `1. Ecological receptors`, typed (108 ch, as in `nadiaText` below) | Accuracy should-fix 11 |
| §4.7 Eleanor's prompt | typed `…Brook, per ` + tokens | `Draft this section on how dewatering could affect the brook,` + two built ` per <ref>` inserts | Viewer change 2; built `composer-sources.tsx` |
| §4.7 thread | the FRA pit-location exchange | the dewatering exchange in §7.5 | Viewer change 3 (re-grounded) |
| `WT_TITLES[3].deckLine` | `Shared spaces across organisations. No attachments, no lost work.` | `Two firms write one document together` (a scenario line) | Producer ruling; viewer cross-note 2 |
| `WT_TITLES[3].glimpseLine` | — | `One document, two firms, a resolved thread` | — |
| `WT_DATES` (§4.4) | Oct 02: 10:15, 10:22, 10:58, 11:06 | **add 11:05 AM** (Eleanor's reply) | Accuracy should-fix 16 |

**New W3 block:**

```ts
export const WT_COLLAB = {
  title: { kicker: 'PILLAR 03', name: 'Collaboration',
    scenarioLine: 'Two firms write one document together',
    glimpseLine: 'One document, two firms, a resolved thread',
    closeLine: 'Two firms, one document, nothing emailed',
    chapters: ['Shared space', 'New document', 'Together', 'Ask the agent', 'Accept', 'Discuss'] },
  sandboxPage: {
    title: 'Sandbox',
    sub: 'Work in progress across your sandboxes. Separation is by a narrower sandbox, never a wall inside a shared one; the AI never grounds on anything here.',
    buttons: { newDoc: 'New document', createAi: 'Create with AI', upload: 'Upload file', sandbox: 'Sandbox' },
    sectionLabel: 'Sandboxes',
    allDocs: (org: string) => `${org} — all documents`,
    flatEmpty: 'Nothing here yet — create a document or accept a draft from Ask.',
    treeEmpty: 'No folders or documents yet — add a folder, or create a document.',
    toolbarOwner: ['Manage access', 'New folder', 'Folder structure', 'Settings'],
    toolbarMember: ['Manage access'],
    lockedStructure: 'Locked structure — folders are set by a super-user',
    inScope: '3 in scope',
  },
  cards: {
    rachel: [ { name: 'Personal workspace', org: 'Trentmoor Energy', kind: 'Personal' },
              { name: 'Trentmoor Energy — working area', org: 'Trentmoor Energy', kind: 'Single organisation' } ],
    shared: { name: 'Ashcombe Brook crossing', org: 'Trentmoor Energy', kind: 'Shared' }, // no `with` line (built)
    calderHale: [ { name: 'Personal workspace', org: 'Calder & Hale', kind: 'Personal' },
                  { name: 'Calder & Hale — working area', org: 'Calder & Hale', kind: 'Single organisation' } ],
  },
  calderHaleRow: { title: 'EIA Scoping Method Statement — Land Quality', meta: 'Infora text · Sep 17, 2026', ref: 'WA-EIA-MST-001' },
  wizard: {
    title: 'New sandbox',
    step: (n: number, of: number) => `Step ${n} of ${of}`,
    nameLabel: 'Name', namePlaceholder: 'e.g. Ecology working area',
    accessLabel: 'Access',
    access: { private: 'Private — my organisation', shared: 'Shared — across organisations' },
    accessHint: { private: 'Private to your organisation', shared: 'Shared across organisations — you choose which, then who' },
    orgsLabel: 'Organisations', orgsHint: 'Which organisations share this sandbox (yours is always included)',
    orgs: ['Calder & Hale', 'Redgate Ecology', 'Netherfold Cabling', 'Ashcombe Civils', 'Wrenfield Plant Hire', 'Wrenbrook Fencing & Reinstatement'],
    orgsTicked: ['Calder & Hale', 'Redgate Ecology'],
    whoLabel: 'Who has access',
    who: { everyone: 'Everyone in the chosen organisations', specific: 'Only specific people' },
    peopleLabel: 'People', peopleHint: 'Admit specific participants; you are always included',
    people: [ ['Rachel Bowen', 'Trentmoor Energy'], ['Eleanor Price', 'Calder & Hale'],
              ['Owen Vance', 'Calder & Hale'], ['Nadia Okonjo', 'Redgate Ecology'] ],
    peopleTicked: ['Eleanor Price', 'Nadia Okonjo'],
    buttons: { cancel: 'Cancel', back: 'Back', next: 'Next', create: 'Create sandbox' },
  },
  sandboxName: 'Ashcombe Brook crossing',
  newDocModal: { title: 'New document', label: 'Title', placeholder: 'e.g. Ecology draft', cta: 'Create document', cancel: 'Cancel' },
  docTitle: 'Land quality and ecology interface',
  docRow: { rev: 'v0.1', meta: 'Infora text · Oct 02, 2026', state: 'Unbound' },
  rowMenu: ['Open in Editor', 'Move…', 'Metadata…', 'Rename…', 'Bind…'],
  editor: {
    location: 'Ashcombe Brook crossing',
    canvasPlaceholder: 'Write here — manual editing has no ceremony: no Suggestion, no Signal.',
    noControls: 'No document controls', freeze: 'Freeze',
    tabs: { chat: 'Chat', comments: 'Comments', checks: 'Checks' },
    pending: '1 pending in the document',
    composerPlaceholder: 'Ask for a draft into this document',
    chips: { library: '▤ From the library', disabled: ['＋ Attach a file', '≡ Prompts', '✒ Style', '◍ Web search', '▧ Sandbox search', '✳ Model'] },
    attachSource: 'Attach source',
  },
  nadiaText: "1. Ecological receptors\nRedgate's appraisal records the brook corridor as the principal ecological receptor.",
  eleanorHeading: '\n\n2. Dewatering and the brook',
  promptTyped: 'Draft this section on how dewatering could affect the brook,',
  promptAnd: ' and',
  promptFinal: 'Draft this section on how dewatering could affect the brook, per WA-GEO-GIR-004 and per WA-ENV-BAS-003',
  libraryEleanor: ['WA-CON-SCC-002', 'WA-EIA-MST-001', 'WA-EIA-SCP-001', 'WA-ENV-BAS-003', 'WA-GEO-GIR-004', 'WA-WAT-FRA-001'],
  thread: { you: 'You', other: 'Eleanor Price · Calder & Hale', agent: 'Infora agent', working: 'Working…',
            done: 'Done — 1 suggestion on the document.' },
  suggestion: {
    tag: 'Suggestion · insert · pending your decision', // rendered uppercase by CSS
    claims: [
      { text: 'Intrusive investigation at Wrenfield Sidings recorded a shallow perched water table at 1.6–2.1 m within made ground of ash, clinker and demolition fill.', ref: 'WA-GEO-GIR-004' },
      { text: 'The investigation identifies this perched horizon as a plausible migration pathway toward the Ashcombe Brook during construction dewatering.', ref: 'WA-GEO-GIR-004' },
      { text: 'The brook supports brown trout and is classified Moderate under the Water Framework Directive.', ref: 'WA-ENV-BAS-003' },
      { text: 'The crossing is proposed as trenchless, with launch and reception pits outside Flood Zone 3.', ref: 'WA-WAT-FRA-001' },
    ],
    actions: ['Accept', 'Edit', 'Refine', 'Reject'],
  },
  hoverCard: {
    ref: 'WA-ENV-BAS-003', rev: 'v3', state: 'Live', locator: 'Cited passage',
    title: 'Environmental Baseline Compendium',
    passage: [
      { text: 'The Ashcombe Brook supports brown trout and is classified Moderate under the Water Framework Directive (Table 9).', hl: true },
      { text: ' Two residential receptors lie within 150 m of the corridor at Ashcombe Lane.' },
    ],
  },
  comments: {
    selectBubble: 'Comment',
    anchor: 'dewatering',
    placeholderSel: 'Comment on the selected text — @ mentions a colleague',
    placeholderReply: 'Reply — @ mentions a colleague',
    newComment: 'New comment',
    buttons: { comment: 'Comment', cancel: 'Cancel', reply: 'Reply', close: 'Close', reopen: 'Reopen' },
    commentAt: '@El', mentionPick: '@Eleanor Price',
    commentRest: 'where does the dewatering water go? The brook has trout.',
    comment: { who: 'Nadia Okonjo', when: 'Oct 02, 2026, 10:58 AM', body: '@Eleanor Price where does the dewatering water go? The brook has trout.' },
    reply: { who: 'Eleanor Price', when: 'Oct 02, 2026, 11:05 AM', body: "The GI recommends a dewatering management plan - I'll cover the brook in it." },
    resolved: 'Resolved by Eleanor Price · Oct 02, 2026, 11:06 AM',
    emptyOpen: 'No open comments. Select text on the canvas and press Comment, or start one here — any project colleague can reply and close.',
    resolvedToggle: (n: number, open: boolean) => `${open ? '▾' : '▸'} Resolved (${n})`,
  },
} as const;
```

The master §4.9 shared data also needs:
- `ORGS.redgate`;
- `WT_PEOPLE.RACHEL / ELEANOR / OWEN / NADIA`, with seat colours;
- `C.seat.redgate = '#3a6ea5'` and `C.seat.qa = '#b8622f'`.

### 10.2 Shared components (`src/walkthroughs/shared/`): props and behaviour W3 needs

| Component | Change or addition |
|---|---|
| `Shell` | `nav: NavItem \| null`. **`null` lights no item** (accuracy must-fix 5). Collapsed (`width 752`): render `unread > 0` as the **7 px ink dot** on the bell (`styles.css` 213), with an `unreadAt: F`. In collapsed mode, render only the wordmark square, the nav icons and the avatar. |
| `SandboxPage` | **Two views.** `flatOverview` (section `<ORG> — ALL DOCUMENTS`; columns `DOCUMENT · DELIVERABLE · ACTIONS`; empty text `Nothing here yet — …`). `selected` (the outline card; toolbar variants owner/member; breadcrumb; `NAME · DELIVERABLE · ACTIONS`; empty text `No folders or documents yet — …`). Header buttons depend on `selected` (adds `Create with AI`) and on `isSuper` (`+ Sandbox`). Cards have **no `with` line**. `cardAt` / `rowAt` frames, a hover card index, and a `menu` (`07` items) anchored on a row. |
| `NewSandboxWizard` | `stepOfTotal` text by frame (`Step 1 of 2` → `Step 1 of 3`); select values and hints by frame; the open select list drawn as `Dropdown`; pick rows with `sub`; tick frames. |
| `EditorSecondBar` | A split-width variant: the location chip at full width (`Ashcombe Brook crossing`), the title ellipsis at max-width 190, a `presence` slot. No `Promote` when unbound. |
| `EditorPanes` | A split variant: panel 300; canvas padding 20/24/24; an icon-only format bar; a tab row with the wrapping `1 pending in the document` (`pendingAt` / `pendingExitAt`); canvas content as a **timeline** (`text(f)`, `scroll(f)`, `marks(f)`); textarea `min-height 260`. |
| `PresenceStack` | `people: [{ initials, at, editingAt? }]`, with the editing fill from `editingAt`. |
| `PresenceFlag` | Several per canvas. **`at` is derived from the same `HumanTyped` timeline that writes that person's text** (`caretIndex(f)` → a measured mirror-span position), so the flag rides the remote caret. Also `name`, `idleFrom` (60 f → initials), `hideAt`, `reshowAt` (ch.6). |
| `RemoteSelection` | `{ span, from, to, exitAt }`. |
| `ChatThread` + composer (`LibraryTokenInput`) | Labels `You` / `Eleanor Price · Calder & Hale` / `Infora agent` in the built micro style; the `Working…` shimmer; the streamed reply. **The composer holds plain text.** A library pick inserts ` per <ref>` (built `composer-sources.tsx` 37), and the list opens **above** the chip. The send button becomes the stop square while pending (sender's seat only). Plus the `📎 Attach source` row. |
| `SuggestionCallout` + `CitedClaims` | Rendered in **two canvases from one timeline**. `acceptAt`: the callout dissolves, and the text is appended (no pills) as a `TrackedChange` insert, with `settleAt` returning it to ink. Plus the follow-scroll hook (`scroll = max(0, revealedBottom − 776)`, 6 f per line). |
| `CommentsTab` | The new-comment form with its anchor; `MentionBox` with the mention list; the thread with the mention highlight (`#274a6d`, 600); the reply box; `Close`; `▸/▾ Resolved (n)` and the expanded closed thread with the resolved line; the empty-state text; `New comment`. Threads appear by frame in both seats. |
| `Mark` | The amber comment anchor, by frame. |
| `Cursor` | `window: 'left' \| 'right'`, drags, and two cursors at once. |
| `OpeningTitle` | Takes a **scenario line** in place of the deck line (all four videos). |

**W3-local parts** (in `w3/`, built by the director): `PillHoverCard`, the
selection `Comment` bubble, the New document modal (on the shared `Modal`),
the `📎 Attach source` chip row, and the canvas-composition rule (§3.7).

---

## 11. Vision and rulings (every element that is not BUILT)

| Element | Mark | Source |
|---|---|---|
| Shared multiplayer thread | RULED | ADR-0039 §1; stored T-150/T-160 |
| Other people's prompts labelled by name and organisation | VISION | flows B.3 |
| `Working…`, the reply and `📎 Attach source` in the non-sending seat | VISION | completes ADR-0039 §1 on screen |
| Both people typing into one canvas, each other's text arriving live | VISION | flows B.2 (4); the built canvas saves on blur (§E row 15) |
| Remote carets with name flags (two at once), collapsing to initials | VISION | flows B.2 (2) |
| Editing fill on the presence avatars | VISION | flows B.2 (1) |
| Remote selection tint | VISION | flows B.2 (3) |
| Passage hover card on a source pill | VISION | master ch.5; built pills open the source modal on click |
| Green tracked insert on acceptance, then settling | VISION | flows §E row 14 |
| Follow-scroll while a suggestion streams | VISION | this plan |
| The mention dot and threads arriving live | VISION (timing) | dot BUILT T-331 `styles.css` 213 |
| Presence avatars (24 px sunken stack) | BUILT-NP | `presence.tsx` |
| Wizard, cards, toolbar, New document, comments, mentions, callout, chips | BUILT-NP | the files cited in each shot |
| Six organisations in the wizard | RULED | master §0 ruling 2 |

The captions stay neutral on all of these. None is called shipped or
"coming".

---

## 12. Deviations from the master plan, and from the built product

1. **Chapter timings** are 24.4 / 10.8 / 13.9 / 22.5 / 12.5 / 18.5 s, all
   within ±3 s. The total is 117.5 s.
2. **Chapter 3 is real co-editing in the canvas** (viewer change 1), not
   typing in the canvas plus the chat. The document order is fixed:
   - Nadia's `1. Ecological receptors` comes first.
   - Eleanor's `2. Dewatering and the brook` comes second.
   - Because accepting **appends** to the end (built), the agent's paragraph
     lands under Eleanor's heading.
3. **The prompt is plain text, with built ` per <ref>` inserts.** Eleanor's
   typed part is shortened to 60 characters (viewer change 2). The time comes
   from the 4.6 hold, which drops from 7.7 s to 3.9 s.
4. **Accepted text carries no pills** (built: the canvas is plain text). The
   narration never implies otherwise.
5. **No `with …` line on the shared card** (built; accuracy should-fix 8). The
   beat is carried by `Shared`, by `3 in scope`, and by Owen's two cards
   against Eleanor's three. The narration says "nobody else from either firm",
   because a shared sandbox also admits the creator's whole organisation
   (Trentmoor), as built.
6. **Follow-scroll (VISION).** At split width, the built 260 px minimum height
   plus the callout overflows the canvas by about 240 px.
7. **Discuss stays in split.** Eleanor's notification is therefore the built
   collapsed-rail **dot**.
8. **The narration is 225 words**, under the 260–290 band. At 140 wpm, 260
   words would leave no silences at all in a 117.5 s video.
9. **The editor lights no rail item** (`nav: null`, accuracy must-fix 5), in
   both the single window and the split.
10. **The discussion was re-grounded** (§7.5). The review's "No discharge to
    the brook" has no support in the seed, which has no CoCP or discharge
    text. Eleanor's reply rests on the GIR's own recommendation of a
    dewatering management plan, plus her own commitment.
11. **The hover card shows `Cited passage` with no page.** The master locator
    `page 14` belongs to the GIR. The seed gives no page for ENV-BAS-003.
12. **Smaller points:**
    - Native selects are drawn as `Dropdown`.
    - The glimpse → chapter 1 crossfade is 12 f, not 15.
    - The New document modal has no hint.
    - There are no Detail shots.
    - The Calder & Hale flat-overview row, `Sep 17, 2026`, is data invented
      for this scene.
13. **The title card carries a scenario line, not the deck tagline**
    (producer ruling).

---

## 13. Self-check

### 13.1 Frame maths

- **Chapters:** 732 + 323 + 418 + 676 + 374 + 555 = **3,078**. The furniture
  is 90 + 105 + 12 + 150 + 90 = 447. Total **3,525 frames = 117.5 s**.
- **The shots tile with no gaps:** T 0–89 · G 90–194 · X 195–206 · 1.1 207–254
  · 1.2 255–311 · 1.3 312–363 · 1.4 364–448 · 1.5 449–558 · 1.6 559–627 · 1.7
  628–723 · 1.8 724–806 · 1.9 807–818 · 1.10 819–938 · 2.1 939–950 · 2.2
  951–1020 · 2.3 1021–1119 · 2.4 1120–1154 · 2.5 1155–1215 · 2.6 1216–1261 ·
  3.1 1262–1276 · 3.2 1277–1338 · 3.3 1339–1563 · 3.4 1564–1679 · 4.1
  1680–1855 · 4.2 1856–1929 · 4.3 1930–2012 · 4.4 2013–2087 · 4.5 2088–2237 ·
  4.6 2238–2355 · 5.1 2356–2390 · 5.2 2391–2535 · 5.3 2536–2560 · 5.4
  2561–2729 · 6.1 2730–2800 · 6.2 2801–2984 · 6.3 2985–3047 · 6.4 3048–3215 ·
  6.5 3216–3284 · C 3285–3434 · L 3435–3524.
- **Travel:** every move uses `T = clamp(15, round(10 + d/45), 27)` on the
  screen distance (Wide 1.09375 px per native px; Work 1.640625). Each click
  has 8 f of dwell before it and 6 f after.
- **Clicks:** 248, 387, 416, 447, 487, 516, 557, 593, 622, 654, 683, 722, 988,
  1019, 1143, 1185, 1214, 1331, 1397, 1720, 1879, 1908, 1953, 1982, 2011,
  2559, 2799, 2847, 3013, 3042, 3239, and 3268 (both cursors).
- **Two-cursor schedules:**
  - Chapter 3: Nadia is on screen 1290–1659, Eleanor 1363–1565, and both type
    1403–1469.
  - Chapter 6: Nadia 2733–3079, then again from 3235; Eleanor from 2975. Both
    click on 3268.
  - When both cursors are on screen, they never cross windows.
- **Camera:** the two moves are 286–306 and 724–744, more than 3 s apart. No
  move overlaps typing, streaming or cursor travel.
- **Streaming:** `Working…` runs 75 f (≥ 45). The reply streams at 3 c/f and
  the claims at 4 c/f with 4 f gaps, and each pill appears 2 f after its claim.
- **Reading holds:**
  - The callout is complete at 2236 and unchanged until 2559 (323 f). Its
    sentences then stay on screen as prose to 3434.
  - The hover card's highlight is held 145 f (it needs 144).
  - Nadia's sentence is held 112 f.
  - Owen's page is held 120 f.
- **Captions:** each meets its minimum (§5), and no two overlap.

### 13.2 Claims list (inventory §3.3, master §6.6)

- [x] No pill on typed text. The only pills are library documents on the
      agent's callout.
- [x] Nothing crosses the wall. Eleanor's library list has no
      `WA-ECO-PEA-001`. Nadia sees only the request and the reply, never
      Calder & Hale's steer or a run's steps. Owen sees no trace of the space.
- [x] Every factual line in the discussion is in the seed (§7.5). Eleanor's
      reply makes a commitment, not a claim.
- [x] Nothing says the AI approves, verifies, learns or trains. No
      "real-time", "template", "wizard", "deleted" or "compliant".
- [x] Accepting is a person's act.
- [x] No real companies or people. There is no Halvern, Marcus Webb, Priya
      Nair or Mrs A Patel.
- [x] "Nothing in it is issued until it is promoted through review" is true to
      the product: a sandbox has no document controls, and promotion submits
      for review.

### 13.3 Vocabulary

- **Words used:** sandbox (or "shared space" / "shared work-in-progress
  area"), member organisation, owner, agent (UI `Infora agent`), suggestion,
  source, project library, document, "GI" (typed by a person; the narration
  says "ground investigation").
- **Never in a caption:** "TIDP", "container", "grounds", "ADR",
  "multiplayer".
- **Rachel** is "for the client" and nothing more specific (viewer
  cross-note 5).

### 13.4 Punctuation

- **No em or en dashes:** captions, the title and scenario line, the glimpse
  and close lines, and the narration.
- **What people type:** they use a hyphen (Eleanor's reply). No typed string
  contains an em dash.
- **UI strings keep the built em dashes:** for example `Private — my
  organisation`, `Done — 1 suggestion on the document.`, `Calder & Hale —
  working area` and `Comment on the selected text — @ mentions a colleague`.
  The project name keeps its en dash, and so does `1.6–2.1 m`.
- **Dates:** the US order, `Oct 02, 2026, 10:58 AM`. No caption carries a
  date.

### 13.5 Render check list

Take stills at these frames:
- 120 (the glimpse)
- chapter 1: 207, 248, 312, 416, 487, 624, 683, 744, 851
- chapter 2: 951, 988, 1143, 1216
- chapter 3: 1262, 1333, 1440 (both typing; both flags), 1563
- chapter 4: 1908, 2011, 2088, 2236
- chapter 5: 2391, 2559, 2600
- chapter 6: 2799, 2849, 2983, 3210, 3268
- close and logo: 3285, 3440

For each, check that:
- the cursor tip sits on the control;
- no UI enters y 969–1080;
- the caption clears the chapter bar (the bar starts at x ≈ 1123; the longest
  line ends at x ≈ 780);
- at 1440, both canvases are identical apart from which caret is flagged;
- at 2236, both callouts are identical and fully visible;
- no rail item is lit in any editor frame;
- in UI, no hyphen has replaced a built em dash.

---

## Revision log

| Date | Change | Source |
|---|---|---|
| 2026-10-05 | First plan. | Director |
| 2026-10-05 | The editor lights no rail item (`nav: null`, single and split); "Rail flip" note removed. | Accuracy must-fix 5 |
| 2026-10-05 | `with …` line dropped from every shared card; the beat is carried by `Shared`, `3 in scope` and Owen's 2 cards against Eleanor's 3. | Accuracy should-fix 8; producer ruling |
| 2026-10-05 | c9 → "Nadia sees Eleanor's request in the shared thread"; c2 → "Rachel lets in only Eleanor and Nadia". | Accuracy should-fixes 9, 10 |
| 2026-10-05 | `1. Ecological receptors` confirmed and listed as a master/data change. Reply time 11:05 AM listed for `WT_DATES`. | Accuracy should-fixes 11, 16 |
| 2026-10-05 | Chapter 3 rebuilt as real co-editing: both type into the canvas, two flagged carets in both windows. Eleanor writes `2. Dewatering and the brook`, so the agent's paragraph lands under its own heading. c6 → "Both write in the same document at once". | Viewer change 1 |
| 2026-10-05 | Eleanor's prompt moved to chapter 4 and shortened (`Draft this section on how dewatering could affect the brook,` plus two library inserts), paid for from the 4.5/4.6 hold (7.7 → 3.9 s). | Viewer change 2 |
| 2026-10-05 | The discussion is rewritten onto "dewatering". Nadia asks where the water goes (the trout fact is from ENV-BAS-003). Eleanor answers from the GIR's dewatering-management-plan recommendation. "No discharge to the brook" is rejected as unsupported by the seed. c12 → "Nadia raises the trout with Eleanor". | Viewer change 3, re-grounded |
| 2026-10-05 | Nadia's hover moves to the `WA-ENV-BAS-003` trout claim (v3 passage). c10 → "Nadia checks the ecology source, then accepts". | Viewer change 4; cross-note 3 |
| 2026-10-05 | Setup trimmed: sandbox name `Ashcombe Brook crossing`, title `Land quality and ecology interface`. Owen's beat is 4 s with his cursor resting on the cards. The narration says "a shared work-in-progress area … promoted through review". | Viewer change 5 |
| 2026-10-05 | The title card carries the scenario line `Two firms write one document together`. The glimpse line is changed so it does not repeat it. | Producer ruling; cross-note 2 |
| 2026-10-05 | Frame maths, contiguity, two-cursor schedules and caption holds re-verified. Total 3,537 → 3,525 f. The lead-facing list (§10) is updated. | — |
