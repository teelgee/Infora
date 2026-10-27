# W5 Ethical walls: the shot plan

Written 2026-10-17 as the fifth walkthrough, after the four pillar videos. It
follows the master plan (`master-plan.md`): its grammar (§2), shell (§3), cast
(§4), shot-table format (§6.3), caption rules (§6.4) and the "Final
revisions" note. Where this plan and the data file disagree, the data file
wins, as for W1-W4.

**In plain words.** This video shows who can see what on a project shared by
three firms. Trentmoor Energy owns the project. Rachel, at Trentmoor, opens the
project library, where she sees every document, and shares Calder & Hale's
accepted method statement with Redgate Ecology. The screen then splits.
Eleanor at Calder & Hale and Rachel see the same library page, but Eleanor's
list has no row for Redgate's ecology appraisal, because nobody shared it with
her firm. The list doesn't hint that anything is missing. Next, Eleanor and
Nadia at Redgate side by side: Nadia confirms receipt of the method statement
for her firm, and it appears in her list. Then each firm's sandbox page:
Calder & Hale and Redgate each see their own private working areas and one
shared sandbox, the only place they overlap. Last, the two of them work in one
document in that shared sandbox: one chat, one suggestion, one edit, seen in
both windows at the same moment.

**Built, ruled and vision, honestly.** Almost everything in chapters 1-4 is
**built**. Rachel shares a document with the library's built **Transmit**
action, one organisation at a time. The status page's built **Transmittals and
acknowledgements** card is the owner's record of who each document went to.
The receiving firm's built **Acknowledge receipt** step comes before the
document shows up for that firm. Each seat's library and sandbox list is the
built list, already filtered by access. The only departures are layout ones:
the library and sandbox pages are reflowed to fit the half-width split
windows (marked DEV). Chapter 5 replays W3's split editor, with W3's existing
mix: the shared chat is ruled, and the live remote cursors and tracked insert
are vision. **What the video does not show, because it has no screen:** the
owner admitting an organisation to the project (membership is set up in the
seed), a receiving firm narrowing a shared document to named people (ruled
in ADR-0035 §3, built in the API, no screen yet), and how reference material
is shared with members (there's no Transmit on reference rows; it's done by an
operator today). None of these is drawn. If the owner wants the
narrowing shown, see decision 1 in §9.

**Interpretation noted.** The brief's "separate projects" in part 3 is taken
to mean **separate organisations' private sandboxes on this one project**.
The record supports this: a project holds as many sandboxes as it likes, and
each one is a boundary in itself (CONTEXT "Sandbox", ADR-0036 §1-2). A
firm's sandboxes on a *different* project would be a different project page
altogether, and nothing would cross. Part 2's "org owner and a member" is
read as **the project owner's organisation (Trentmoor) against a member
organisation (Calder & Hale)**. §9 decision 1 gives the alternative.

---

## 0. The wall rule (never breaks)

A viewer is **never** shown a hint that hidden documents exist. That means
no greyed or locked rows, no "1 withheld", no gaps in a numbered list, no
empty slot where a row would be, no count that differs from what's listed,
and no "you don't have access" placeholder. Access is decided before the list
is built, so what isn't shared is simply absent (ADR-0018; ADR-0035 §5; T-399,
quoted in flows-context A.10). Specifically:

- Eleanor's library: one live deliverable row (`WA-EIA-MST-001`). Nothing about
  `WA-ECO-PEA-001` appears: not the row, the reference, the producer, a count,
  or its effect on table height in a way that's visible as a gap.
- Nadia's sandbox page never names `Calder & Hale — working area`. Eleanor's
  never names `Redgate Ecology — working area`. Rachel's page isn't shown in
  chapter 4, and narration says she can't see in without a recorded override.
- **Allowed**, because it's not a hint: Nadia's `Awaiting your acknowledgement`
  row for `WA-EIA-MST-001`, since that document *was* sent to Redgate. Also
  allowed is the owner's full distribution record in Rachel's seat.
- The built line `Withheld — the owner's distribution record` (a producer's
  view of a transmittal) is never shown. It would tell Calder & Hale that its
  document went somewhere, which is true and built, but it muddies the story.

---

## 1. Frame budget (video-local, 30 fps, inclusive)

| Segment | From | To | Frames |
|---|---|---|---|
| Opening title | 0 | 89 | 90 |
| Glimpse | 90 | 194 | 105 |
| Glimpse → ch.1 crossfade | 195 | 206 | 12 |
| Ch.1 Set up | 207 | 806 | 600 |
| Ch.2 Owner and member | 807 | 1256 | 450 |
| Ch.3 Each firm | 1257 | 1706 | 450 |
| Ch.4 Sandboxes | 1707 | 2276 | 570 |
| Ch.5 Together | 2277 | 3148 | 872 |
| Close | 3149 | 3298 | 150 |
| Logo | 3299 | 3388 | 90 |
| **Total** | 0 | 3388 | **3,389 (113.0 s)** |

Chapters: 2,942 f. `WT_TITLES[5].chapters` = `ch('Set up', 600), ch('Owner and
member', 450), ch('Each firm', 450), ch('Sandboxes', 570), ch('Together',
872)`. `closeFrom: 3149`.

**Mapping to the owner's four parts:** part 1 → ch.1; part 2 → ch.2 and ch.3;
part 3 → ch.4; part 4 → ch.5.

**Splits** (`WalkthroughFrame.splits`): `{ from: -200, to: 195 }` (glimpse),
`{ from: 807, to: 100000 }`. Chapter 1 is the only single-window chapter.
Seat order, kept for the whole split so nobody swaps sides: **Eleanor left**;
right is Rachel (ch.2), then Nadia (ch.3-5). This matches W3's split.

---

## 2. What each shot reuses

| W5 element | Reuse | Change |
|---|---|---|
| Rachel's library, single window (ch.1) | `LibraryPage owner` (`shared/pages.tsx`), geometry from W2 plan §4.2 | adds the built note line under the sub (`library.tsx` 699) |
| Transmit modal (ch.1) | `Modal`, `Field`, `SelectMenu` (`shared/ui.tsx`) | new local `TransmitModal`, sm, x 568-968, top y 64, as W3's `NewDocModal` geometry |
| Status page (ch.1) | W1 `DeliverableStatus variant="accepted"` (`w1/status.tsx`, `27-accepted-status`) | local `TransmittalsCard` appended under it (lead: add an `after` slot, or W5 composes it) |
| Library split, three seats (ch.2-3) | `LibraryPage`'s rows and `RefCell`, `Table`, `StatusPill` | new local `LibrarySplit` (narrow reflow, §3.2), `variant: 'owner' \| 'calder' \| 'redgate'` |
| Acknowledge section (ch.3) | `SectionLabel`, `Table`, `Btn` | in `LibrarySplit` |
| Sandbox split (ch.4) | W3 `Card` and `CardSpec` (`w3/sandbox.tsx`; lead to export `Card`), `TableBox` rows | new local `SandboxSplit` (narrow reflow, §3.3) |
| Split editor and shared chat (ch.5, close) | W3 `SplitSeat` (`w3/editor.tsx`) driven by W3's `T` timeline, **time-shifted** | none: three W3 segments replayed (§3.4) |
| Ch.5 cursors | W3's `useCursors()` paths (`w3/Video.tsx`; lead to export) | time-shifted with the content |
| Frame, captions, cursor, typing | `WalkthroughFrame`, `WtCursor`, `HumanTyped`, `SplitWindows`, `Crossfade`, `Freeze` | `video: 5` (lead: widen the `1-4` types) |

---

## 3. Fixed geometry

### 3.1 Single window (ch.1), native 1536×864

- Library: as W2 §4.2. MST row y 373-490 (centre y 431); PEA row y 292-373.
  Owner actions column from x ≈ 958: `Open` centre (975, 431), `Transmit`
  centre **(1056, 431)** (measure from a still). The note line sits under the
  sub at y ≈ 214, muted 13 px. The tables move down 22 when it appears
  (`ui` 5 f).
- Transmit modal (sm, 400 wide, x 568-968, top y 64): title `Transmit
  WA-EIA-MST-001`; field `Issue to organisation` with combobox (centre
  (768, 170)) and its hint below; footer `Cancel` (quiet) and `Transmit`
  (primary, centre **(918, 246)**, disabled until an org is picked). The
  option list (`SelectMenu`, 28 px rows) opens below the combobox from y 190,
  with the six `WT_MEMBER_ORGS`. Typing `Red` filters it to one row
  (`Redgate Ecology`, centre (768, 206)).
- Status page: W1's accepted layout. The local `TransmittalsCard` spans the
  grid, with label `Transmittals and acknowledgements`, the built six-column
  table (`Date · Kind · Version · Issued by · Recipient · Acknowledgement`)
  and one row, then the owner foot line. Scroll so the card's top sits at
  page y ≈ 300 (measure). Recipient cell centre ≈ (900, 470) after the scroll.

### 3.2 Library split (ch.2-3), each seat native 752×832, collapsed rail

Pane x 64-740, content x 80-724 (padding 16), as W1's split. The rail has
`Project library` lit. **DEV narrow reflow:**

- H1 `Project library` (serif 26). The sub is the built `WT_LIB_PAGE.sub`,
  wrapped to 644 (≈ 5 lines, 12.5 px). In Nadia's seat only, if the page
  overflows, drop the reference sub (`WT_LIB_PAGE.refSub`). Decide from a still.
- **Live deliverables** table, four columns: `Reference` 150 (mono, no wrap) ·
  `Title` 270 (wraps) · `Revision` 70 · `Producer` 154. Row h 52. Owner
  actions are dropped in the split, so all three seats share one column set
  and the only difference is the rows.
- **Reference material**: `Reference` (with the `Reference` pill) · `Revision` ·
  `Held by`, row h 40, the five references in every seat.
- Rows per seat:

| Seat | Awaiting your acknowledgement | Live deliverables | Reference material |
|---|---|---|---|
| Rachel (owner) | — | `WA-ECO-PEA-001` · `WA-EIA-MST-001` | five |
| Eleanor (Calder & Hale) | — | `WA-EIA-MST-001` | five |
| Nadia (Redgate), before | `WA-EIA-MST-001` · `C01` · `Acknowledge receipt` | `WA-ECO-PEA-001` | five |
| Nadia, after | — (section fades out) | `WA-ECO-PEA-001` · `WA-EIA-MST-001` (fades in) | five |

The built order is the note line, then the `Awaiting your acknowledgement`
section, then Live deliverables (`library.tsx` 699, 806-830, 832). Nadia's
`Acknowledge receipt` centre is ≈ (650, 300) (measure).

### 3.3 Sandbox split (ch.4), each seat 752×832

**DEV narrow reflow** of `08-sandbox` / W3 §3.2: H1 `Sandbox`; member header
buttons as built for a non-super-user, icon-and-label if they fit or
icon-only otherwise (decide from a still); the sub wrapped to 644; `SANDBOXES`
label; **three cards in one row**, each 206×96 at x 80 / 299 / 518, y 240.
The card name may wrap to two lines. Then the flat overview `<Org> — all
documents`, which the built page describes as "a flat overview across every
accessible sandbox" (`sandbox.tsx` 1997). That's why both seats list the shared
document.

| Seat | Cards (left to right) | `— all documents` rows |
|---|---|---|
| Eleanor | `Personal workspace` (Calder & Hale, Personal) · `Calder & Hale — working area` (Calder & Hale, Single organisation) · `Ashcombe Brook crossing` (Trentmoor Energy, Shared) | `EIA Scoping Method Statement — Land Quality` (`WT_COLLAB.calderHaleRow`) · `Land quality and ecology interface` (`WT_COLLAB.docRow`) |
| Nadia | `Personal workspace` (Redgate Ecology, Personal) · `Redgate Ecology — working area` (Redgate Ecology, Single organisation) · `Ashcombe Brook crossing` (Trentmoor Energy, Shared) | `Bat activity notes — brook corridor` (new) · `Land quality and ecology interface` |

Shared card centre (621, 288). Selecting it swaps the overview for the
selected view: `3 in scope · Manage access` + `Locked structure — folders are
set by a super-user` (member toolbar, built), then the sandbox name and one
row, `Land quality and ecology interface`.

### 3.4 Ch.5: replaying W3

The split windows' content is W3's `SplitSeat` for each seat, wrapped in a
local `<TimeShift by>` (a `<Sequence from={by} layout="none">`). It's a
deliberate re-timing of W3's own timeline, the one exception to the
"no Sequence" rule, and it's said so in the code. W3's cursors are wrapped the
same way. Three segments, each joined by a 12 f content crossfade (a time
jump, §2.7):

| Segment | W5 frames | W3 frames | Shift | What plays (W3 plan shots) |
|---|---|---|---|---|
| A | 2277-2408 | 1339-1470 | +938 | 3.3: both typing, each sees the other's flagged caret |
| B | 2397-2966 | 1680-2249 | +717 | 4.1-4.6: Eleanor's prompt, two library refs, the shared thread in both panels, the suggestion streaming into both canvases |
| C | 2955-3148 | 2536-2729 | +419 | 5.3-5.4: Nadia accepts, and the insert lands in both canvases and settles |
| Close | 3149-3298 | **frozen at 2729** | — | `Freeze` so W3's ch.6 thread never starts |

Crossfades: sandbox split → A at 2277-2288; A → B at 2397-2408; B → C at
2955-2966. The W5 `Video` waits for `fontsReady` exactly as W3's does, because
the split editor's layout is measured.

---

## 4. The shot table

### Furniture

Opening title 0-89: kicker per §9 decision 2 (recommended `WALKTHROUGH 05`); name `Ethical walls`;
scenario line `WT_TITLES[5].scenarioLine` = `Who sees what, across three
firms on one project`. Glimpse 90-194: the ch.3 end state, frozen (`Freeze
frame={1700}` on the Eleanor | Nadia library split), label `Where this ends`,
line `Each firm sees only what it's given`, caption in 96, out 186. 195-206:
crossfade to ch.1's opening state (the split pair fades out and the single
window comes in).

### Chapter 1 · Set up (207-806)

| Shot | Frames | Dur | Ch | Seat | Status | Screen state | Camera | Cursor | Typed / streamed | Caption | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1.1 | 207-296 | 3.0 s | 1 | Rachel | BUILT 26-library · DEV dates (W2 §4.2) | `LibraryPage owner`, rail `Project library` lit, Rachel's shell (`RB`, `● Owner`). Both live rows and five references. @240 row hover on PEA (`#faf9f7`). | Wide | Fades in 210-219 at (760, 600). 219 → **240** to PEA title (420, 332), hand | — | In 207: label `1 / 5 · Set up`, seat tag `Rachel Bowen, Trentmoor Energy` · `Rachel's library holds everything on the project` | Readable hold of both rows. |
| 1.2 | 297-317 | 0.7 s | 1 | Rachel | as 1.1 | Hover holds. | Wide → Work m 1.3 on (768, 380), 297-317 | still | — | — | Region x 177-1359, y 48-712. It holds the MST row and the whole modal. |
| 1.3 | 318-371 | 1.8 s | 1 | Rachel | BUILT-NP `library.tsx` 43-80, 911-912 | @345 MST row hover, and `Transmit` hover fill. @355 `TransmitModal` and scrim fade in (5 f). | Work | 318 → **345** to `Transmit` (1056, 431), hand; **c 353** | — | In 309: `She shares the method statement with Redgate` | The modal is sm; the hint is `WT_WALL.transmit.hint` (DEV: the built hint's trailing `(ADR-0035)` is dropped as internal shorthand). |
| 1.4 | 372-442 | 2.4 s | 1 | Rachel | BUILT-NP `Combobox` | @398 the option list fades in (4 f) with six orgs. @402 `Red` types into the combobox, and @409 the list filters to `Redgate Ecology`. @439 the field reads `Redgate Ecology`, and `Transmit` enables. | Work | 366 → **388** to the combobox (768, 170), I-beam; **c 396**. 414 → **429** to the option (768, 206), hand; **c 437** | `HumanTyped` `WT_WALL.transmit.typed` (`Red`) from 402, seed 51, ends ≈ 408 | (c2 holds) | Picked from a list after a search: three typed characters, then a click (§2.11). |
| 1.5 | 443-520 | 2.6 s | 1 | Rachel | BUILT-NP `library.tsx` 681-688, 699 | @466 `Transmit` presses. @468 the modal fades out (5 f). @470 the note `WT_WALL.transmit.note` fades in under the sub, and the tables ease down 22. | Work | 443 → **458** to `Transmit` (918, 246); **c 466**; dwell | — | (c2 holds) | Note hold: 10 words, 80 f (470-550). |
| 1.6 | 521-541 | 0.7 s | 1 | Rachel | as 1.5 | Hold. | Work → Wide, 521-541 | still | — | — | — |
| 1.7 | 542-575 | 1.1 s | 1 | Rachel | BUILT-NP `library.tsx` (Open → status page) | @557 MST `Open` hover. **Cut** at 567 to the MST status page (W1 accepted variant, Rachel's seat). | Wide | 542 → **557** to `Open` (975, 453 after the shift), hand; **c 565** | — | In 551: `The record lists who it went to` | The rail stays on `Project library`. |
| 1.8 | 576-806 | 7.7 s | 1 | Rachel | BUILT 27-accepted-status · BUILT-NP `deliverable-status.tsx` 730-890 (T-350) · DEV dates | @585-612 the page scrolls down to the card (28 f, ≤ 600). The `TransmittalsCard` row reads `Sep 30, 2026` · `Issued to organisation` · `C01` · `Rachel Bowen` · `Redgate Ecology` · `● Awaiting acknowledgement` (warning badge), and the foot `WT_WALL.history.ownerFoot`. | Wide; → Work m 1.5 on (860, 470) 613-633; Work → Wide 783-803 | 640 → **656** to the recipient cell (900, 470), arrow; idle fade 760-765 | — | (c3 holds) | Readable hold 634-782 (row + foot, about 17 words, 136 f). There's no Calder & Hale row: Calder & Hale produced the document, so it never needed one (ADR-0035 §2). |

### Chapter 2 · Owner and member (807-1256)

| Shot | Frames | Dur | Ch | Seat | Status | Screen state | Camera | Cursor | Typed / streamed | Caption | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2.1 | 807-821 | 0.5 s | 2 | split | — | **Crossfade 15 f** into `SplitWindows`. Left: Eleanor's `LibrarySplit variant="calder"`. Right: Rachel's `variant="owner"`. Seat tags `● Eleanor Price, Calder & Hale` (`#6d5dd3`) and `● Rachel Bowen, Trentmoor Energy` (`#159a74`). Rachel's note line is gone (time has passed). | Wide (split) | Rachel's single-window cursor fades with the window | — | In 807: label `2 / 5 · Owner and member` · `Same library - each sees only their own` | No camera in split. |
| 2.2 | 822-1000 | 5.9 s | 2 | Eleanor | BUILT-NP `library.tsx` (access-resolved list) · DEV split reflow | Hold. @860 MST row hover in the left window. | Wide | **Eleanor** (left) fades in 826-835 at (400, 640). 836 → **858** to MST title (330, 330), hand; idle fade 900-905 | — | (c4 holds) | Eleanor's table has one live row and no gap. The reference table sits directly under it, so the two pages differ only by one row's height. |
| 2.3 | 1001-1256 | 8.5 s | 2 | Rachel | BUILT 26-library rows · DEV split reflow | @1040 PEA row hover in the right window. | Wide | **Rachel** (right) fades in 1001-1010 at (400, 640). 1011 → **1033** to the PEA title (330, 290), hand; idle fade 1200-1205 | — | In 1001: `Calder & Hale sees no trace of it` | Readable hold of both lists. The cursor points at the row Eleanor's list doesn't have. |

### Chapter 3 · Each firm (1257-1706)

| Shot | Frames | Dur | Ch | Seat | Status | Screen state | Camera | Cursor | Typed / streamed | Caption | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 3.1 | 1257-1268 | 0.4 s | 3 | split | — | **Right window only** crossfades 12 f from Rachel to Nadia's `LibrarySplit variant="redgate"` (before state). The right seat tag changes to `● Nadia Okonjo, Redgate Ecology` (`#3a6ea5`). Left unchanged. | Wide | — | — | In 1257: label `3 / 5 · Each firm` · `Redgate sees its own work and what's shared` | A different person's seat (§2.7). |
| 3.2 | 1269-1400 | 4.4 s | 3 | Nadia | BUILT-NP `library.tsx` 806-826 · DEV split reflow | Nadia's page: `Awaiting your acknowledgement` with `WA-EIA-MST-001` · `C01` · `Acknowledge receipt`; Live deliverables: `WA-ECO-PEA-001` only; five references. @1395 button hover. | Wide | **Nadia** (right) fades in 1300-1309 at (400, 640). 1370 → **1393** to `Acknowledge receipt` (650, 300), hand | — | (c6 holds) | Readable hold of both pages, 1269-1370. |
| 3.3 | 1401-1520 | 4.0 s | 3 | Nadia | BUILT-NP `library.tsx` 567-573 | @1403 click (`Btn` press). @1405 the note `WT_WALL.ack.note` fades in under the sub. @1405-1410 the `Awaiting…` section fades out. @1412 `WA-EIA-MST-001` fades into Live deliverables (second row, 3 f). | Wide | **c 1403**; dwell; idle fade 1460-1465 | — | In 1392: `Nadia acknowledges receipt for Redgate` | One acknowledgement clears it for the whole firm (CONTEXT "Share acknowledgement"). Nadia fires it as Redgate's document controller (§5). |
| 3.4 | 1521-1706 | 6.2 s | 3 | split | as 3.3 | Hold the after state. Left: Eleanor, MST only. Right: Nadia, PEA and MST. | Wide | none | — | In 1521: `Now it's open to everyone at Redgate` | The glimpse freezes this state at f 1700. |

### Chapter 4 · Sandboxes (1707-2276)

| Shot | Frames | Dur | Ch | Seat | Status | Screen state | Camera | Cursor | Typed / streamed | Caption | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 4.1 | 1707-1718 | 0.4 s | 4 | split | — | **Both windows** crossfade 12 f to `SandboxSplit` (§3.3), the flat overview. Rail: `Sandbox` lit. | Wide | — | — | In 1707: label `4 / 5 · Sandboxes` · `Each firm has its own private areas` | Time jump to Oct 02, after W3's document is created. |
| 4.2 | 1719-1900 | 6.1 s | 4 | Eleanor | BUILT-NP `sandbox.tsx` (cards, flat overview 1997) · DEV split reflow | @1760 hover on `Calder & Hale — working area` (left). | Wide | **Eleanor** (left) fades in 1722-1731 at (400, 640). 1732 → **1755** to the card (402, 288), hand; idle fade 1860-1865 | — | In 1840: `Nothing private shows across the wall` | Readable hold of both rows of cards. Each window's middle card is that firm's own, and only there. |
| 4.3 | 1901-2050 | 5.0 s | 4 | Eleanor | BUILT-NP `sandbox.tsx` (select → tree, member toolbar) | @1935 the shared card is selected (left). The overview swaps to the selected view: `3 in scope · Manage access` + `Locked structure…`, the name, and one row, `Land quality and ecology interface`. | Wide | 1904 → **1927** to the shared card (621, 288); **c 1935** | — | In 1918: `The shared space is the one overlap` | — |
| 4.4 | 2051-2160 | 3.7 s | 4 | Nadia | as 4.3 | @2085 the same selection in the right window, with the same row. | Wide | **Nadia** (right) fades in 2051-2060 at (400, 640). 2061 → **2077** to the shared card (621, 288); **c 2085** | — | (c11 holds) | The two windows now match. That match is the point. |
| 4.5 | 2161-2276 | 3.9 s | 4 | split | as 4.3 | Hold. | Wide | idle fades 2200-2205 | — | (c11 holds) | — |

### Chapter 5 · Together (2277-3148)

All content and cursors are W3's, time-shifted (§3.4). W3's own status marks
apply: BUILT-NP canvas, composer and callout; RULED shared thread (ADR-0039
§1); VISION live remote text, `PresenceFlag`, follow-scroll and tracked insert
(W3 plan §11).

| Shot | Frames | Dur | Ch | Seat | Status | Screen state | Camera | Cursor | Typed / streamed | Caption | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 5.1 | 2277-2288 | 0.4 s | 5 | split | — | Crossfade 12 f from the sandbox split to segment A (W3 1339). | Wide | — | — | In 2277: label `5 / 5 · Together` · `Two firms in one document at once` | Same seats on the same sides as W3. |
| 5.2 | 2289-2396 | 3.6 s | 5 | both | as W3 3.3 | Segment A: Nadia's text and, from 2341 (W3 1403), Eleanor's heading, each with the other's flagged caret. | Wide | W3 `nadia3`, `eleanor3` (+938) | W3's `RemoteTyped`, shifted | (c12 holds) | — |
| 5.3 | 2397-2408 | 0.4 s | 5 | split | — | Crossfade A → B (W3 1470 → 1680). | Wide | — | — | In 2388: `Eleanor asks the agent in the shared chat` | — |
| 5.4 | 2409-2729 | 10.7 s | 5 | Eleanor | as W3 4.1-4.4 | Segment B: the prompt types (W3 1726 → W5 2443), two `▤ From the library` picks, send (W5 2728). @2730 (W3 2013) the request shows in **both** panels, labelled `YOU` and `ELEANOR PRICE · CALDER & HALE`. | Wide | W3 `eleanor4` (+717) | W3's `HumanTyped` `WT_COLLAB.promptTyped`, shifted | (c13 holds) | Nadia's panel is the shared chat. That's the wall-relevant beat: one thread, for exactly the sandbox's people. |
| 5.5 | 2730-2954 | 7.5 s | 5 | split | as W3 4.4-4.6 | @2805 (W3 2088) `Done — 1 suggestion on the document.` streams. The callout and its four sourced claims stream into **both** canvases. Hold. | Wide | none | W3 `Streamed`, `CitedClaims`, shifted | In 2796: `Both see the suggestion arrive, with sources` | The pills cite only library documents both firms may see: GIR, BAS, FRA. |
| 5.6 | 2955-2966 | 0.4 s | 5 | split | — | Crossfade B → C (W3 2249 → 2536). | Wide | — | — | In 2946: `Nadia accepts - it lands for both` | — |
| 5.7 | 2967-3148 | 6.1 s | 5 | Nadia | as W3 5.3-5.4 | @2978 (W3 2559) `✓ Accept` presses in Nadia's canvas. The callout dissolves in both, the text lands as a green insert in both, and it settles 3094-3108. | Wide | W3 `nadia5` (+419) | — | (c15 holds) | — |

### Close and logo

| Shot | Frames | Dur | Status | Screen state | Caption |
|---|---|---|---|---|---|
| X.1 | 3149-3298 | 5.0 s | as 5.7 | `Freeze frame={2729}` on both `SplitSeat`s (W3-local). Chapter bar all done. Cursor fades in the first 12 f. | Label stays `5 / 5 · Together`; line `WT_TITLES[5].closeLine` = `Shared only where the owner opens it` |
| X.2 | 3299-3388 | 3.0 s | — | Logo (§2.9). | — |

### Camera share (chapters, 2,942 f)

Wide 2,506 f (85%) · Work 436 f (15%: 297-541 and 613-803 with their moves) ·
Detail 0. Within §2.6. The split chapters are Wide by rule.

---

## 5. Data

**World:** Wrenfield only, as W1-W4. Project `Wrenfield–Ashcombe 400kV
Connection`, owner Trentmoor Energy.

| Org | Role | Person on screen | What they see in the library |
|---|---|---|---|
| Trentmoor Energy | Owner | Rachel Bowen (RB) | everything: PEA, MST, five references |
| Calder & Hale | Member, consultant | Eleanor Price (EP), lead author (and, off screen, her firm's org admin; nothing turns on this) | MST (its own), five references. **Never PEA.** |
| Redgate Ecology | Member, ecology | Nadia Okonjo (NO), Redgate's nominated document controller (so controller mode, the default, applies; ADR-0035 §4) | PEA (its own), five references, then MST after acknowledging |

Owen Vance, the suppliers and Halvern Associates don't appear. The six
`WT_MEMBER_ORGS` appear only as the Transmit combobox's options.

**Documents:** `WA-EIA-MST-001` C01 (Calder & Hale, accepted Sep 29) is the
one Rachel transmits. `WA-ECO-PEA-001` v1 (Redgate's) is the one that's never
shared with Calder & Hale. The five references are unchanged. The shared
sandbox and document are W3's (`WT_COLLAB`). The one new document is Nadia's
private `Bat activity notes — brook corridor`, in `Redgate Ecology — working
area` (master §4.2 already places "bat activity notes" there).

**Dates** (built US order): transmitted `Sep 30, 2026` (Wed), acknowledged
`Oct 01, 2026` (Thu), sandbox split and ch.5 on `Oct 02, 2026`, W3's day. The
order holds: share, receipt, then the co-writing.

**Personal data:** invented people only. Nothing new about a real person.

### New `WT_*` values (lead adds to `src/data/wrenfield.ts`)

```ts
WT_TITLES[5] = {               // widen Record<1|2|3|4> to include 5
  kicker: 'Walkthrough 05',     // see §9 decision 2
  name: 'Ethical walls',
  deckLine: '',
  scenarioLine: 'Who sees what, across three firms on one project',
  glimpseLine: "Each firm sees only what it's given",
  closeLine: 'Shared only where the owner opens it',
  chapters: [ch('Set up', 600), ch('Owner and member', 450), ch('Each firm', 450), ch('Sandboxes', 570), ch('Together', 872)],
};
WT_REACH.NADIA = ['PEA', 'SCC', 'SCP', 'BAS', 'GIR', 'FRA'];   // + 'MST' after acknowledgement
WT_DATES.mstTransmitted = 'Sep 30, 2026';
WT_DATES.mstAcknowledged = 'Oct 01, 2026';
WT_COLLAB.cards.redgate = [
  { name: 'Personal workspace', org: 'Redgate Ecology', kind: 'Personal' },
  { name: 'Redgate Ecology — working area', org: 'Redgate Ecology', kind: 'Single organisation' },
];
WT_WALL = {
  transmit: {
    title: 'Transmit WA-EIA-MST-001',
    label: 'Issue to organisation',
    hint: 'A non-review transmittal — the receiving organisation must acknowledge before it grounds', // DEV: built ends " (ADR-0035)"
    placeholder: 'Search organisations',
    typed: 'Red',
    pick: 'Redgate Ecology',
    buttons: { cancel: 'Cancel', transmit: 'Transmit' },
    note: 'Transmitted — the receiving organisation must acknowledge before it grounds.',
  },
  history: {
    label: 'Transmittals and acknowledgements',
    heads: ['Date', 'Kind', 'Version', 'Issued by', 'Recipient', 'Acknowledgement'],
    row: { date: 'Sep 30, 2026', kind: 'Issued to organisation', version: 'C01', by: 'Rachel Bowen', recipient: 'Redgate Ecology' },
    awaiting: 'Awaiting acknowledgement',
    ownerFoot: 'The full distribution record — every recipient organisation and its acknowledgement state.',
  },
  ack: {
    label: 'Awaiting your acknowledgement',
    heads: ['Reference', 'Version', ''],
    button: 'Acknowledge receipt',
    note: 'Acknowledged — the deliverable is now visible and grounds for your organisation.',
  },
  redgateRow: { title: 'Bat activity notes — brook corridor', meta: 'Infora text · Sep 24, 2026' },
};
```

Every UI string above is copied from the built code with its em dashes,
except `typed`, `pick`, the dates and the new row.

### Lead changes outside `w5/`

1. Register `W5-ethical-walls` (3,389 f) in `Root.tsx`, and widen the
   `video: 1-4` types in `WalkthroughFrame` / `OpeningTitle`.
2. Export `Card` from `w3/sandbox.tsx`, and `useCursors` (or the path
   builders) from `w3/Video.tsx`.
3. Give W1's `DeliverableStatus` an `after?: ReactNode` slot for the
   transmittals card, or W5 copies the accepted layout locally.
4. Add the README row: `W5-ethical-walls` · `src/walkthroughs/w5/` · 3389
   (113.0 s).

---

## 6. Caption list

| # | In | Label | Line | Words | Hold ≥ |
|---|---|---|---|---|---|
| g | 96 | Where this ends | Each firm sees only what it's given | 7 | 80 |
| 1 | 207 | 1 / 5 · Set up | Rachel's library holds everything on the project | 7 | 80 |
| 2 | 309 | 1 / 5 · Set up | She shares the method statement with Redgate | 7 | 80 |
| 3 | 551 | 1 / 5 · Set up | The record lists who it went to | 7 | 80 |
| 4 | 807 | 2 / 5 · Owner and member | Same library - each sees only their own | 7 | 80 |
| 5 | 1001 | 2 / 5 · Owner and member | Calder & Hale sees no trace of it | 8 | 88 |
| 6 | 1257 | 3 / 5 · Each firm | Redgate sees its own work and what's shared | 8 | 88 |
| 7 | 1392 | 3 / 5 · Each firm | Nadia acknowledges receipt for Redgate | 5 | 75 |
| 8 | 1521 | 3 / 5 · Each firm | Now it's open to everyone at Redgate | 7 | 80 |
| 9 | 1707 | 4 / 5 · Sandboxes | Each firm has its own private areas | 7 | 80 |
| 10 | 1840 | 4 / 5 · Sandboxes | Nothing private shows across the wall | 6 | 75 |
| 11 | 1918 | 4 / 5 · Sandboxes | The shared space is the one overlap | 7 | 80 |
| 12 | 2277 | 5 / 5 · Together | Two firms in one document at once | 7 | 80 |
| 13 | 2388 | 5 / 5 · Together | Eleanor asks the agent in the shared chat | 8 | 88 |
| 14 | 2796 | 5 / 5 · Together | Both see the suggestion arrive, with sources | 7 | 80 |
| 15 | 2946 | 5 / 5 · Together | Nadia accepts - it lands for both | 6 | 75 |
| c | 3149 | 5 / 5 · Together | Shared only where the owner opens it | 7 | 80 |

Every gap is at least the hold (shortest: c10, 78 f against 75). There are no
em dashes; the hyphens are spaced as in W1-W4. No dates, no ADR numbers, and
none of the banned words. Seat tags: single window in ch.1 (Rachel); in the
split, the tags sit over the windows.

---

## 7. Narration (~240 words, 135-145 wpm)

| Cue | Text |
|---|---|
| 207 | Trentmoor Energy owns this project, so Rachel's library holds everything on it. |
| 309 | Calder & Hale's method statement has been accepted. Rachel shares it with Redgate Ecology, the project's ecologist. |
| 551 | The record now lists every organisation it went to, and whether they've acknowledged it. |
| 822 | Side by side: Eleanor at Calder & Hale on the left, Rachel on the right. |
| 1001 | Redgate's appraisal hasn't been shared with Calder & Hale, so Eleanor's list simply doesn't include it. No gap, no count, no hint. |
| 1269 | Redgate sees its own appraisal, and the method statement waiting for it. |
| 1392 | Nadia acknowledges receipt once, for her whole firm. |
| 1521 | Now everyone at Redgate can open it, and Infora can cite it in their answers. |
| 1719 | Sandboxes are where work in progress lives. Each firm has its own private areas, invisible to the other. |
| 1840 | Even the owner can't see into them without a recorded override. |
| 1918 | The shared sandbox, opened by the owner for named people, is the one place both firms meet. |
| 2289 | Inside it, Eleanor and Nadia write the same document at the same time. |
| 2409 | Eleanor asks the agent for a section, pointing it at two library documents. |
| 2730 | Her request appears in the shared chat on Nadia's screen too. |
| 2805 | The suggestion arrives in both windows, every claim tied to its source. |
| 2967 | Nadia accepts it, and the text lands in the document for both of them. |
| 3149 | Every firm sees its own work, and only what the owner chooses to share. |

Silent over the title, glimpse and logo, and for 1-2 s on each Wide hold. The
claims stay inside inventory §3.3: the override line is ADR-0018 (a private
*project* sandbox; a personal workspace has no override at all, which the
narration doesn't claim either way). "Cite it in their answers" is ADR-0035
§5 (acknowledgement gates grounding).

---

## 8. Vision and rulings (everything not BUILT)

| Element | Mark | Source |
|---|---|---|
| Library and sandbox pages at half width | DEV narrow reflow | W1's split precedent (§2.2) |
| Owner actions dropped in the library split | DEV | so the three seats differ only by rows |
| Transmit hint without `(ADR-0035)` | DEV | internal shorthand in built copy (CONTEXT/register rule) |
| Transmittals card under W1's accepted status page | BUILT-NP | `deliverable-status.tsx` 730-890 |
| Nadia as Redgate's document controller | data, off screen | ADR-0035 §4 controller mode (default) |
| Ch.5 live remote text, flags, follow-scroll, tracked insert | VISION | W3 plan §11 |
| Ch.5 shared thread | RULED | ADR-0039 §1 |
| Narration's owner override | RULED, not shown | ADR-0018 |

**Not built and not drawn:** the owner admitting organisations; the receiving
firm narrowing a document to named people (ADR-0035 §3; API T-137, no
screen); sharing reference material with members (no Transmit on reference
rows; done by an operator today).

---

## 9. Decisions for the owner

1. **"Org owner and a member" (part 2).** Planned as **project owner
   (Rachel, Trentmoor) against a member firm (Eleanor, Calder & Hale)**. It's
   built and it's the clearest wall picture. The other reading is a firm's
   own **org admin against one of its members**: Calder & Hale's admin
   limits a shared document to named colleagues, and Owen doesn't see it.
   That's ruled (ADR-0035 §3) and works in the API, but there's no screen,
   so it would be drawn as vision (a `Who at Calder & Hale sees this`
   picker on the receiving side). It would add about 15 s, or replace ch.3.
2. **Title kicker.** The deck has four pillars, so `PILLAR 05` is wrong.
   Options are `WALKTHROUGH 05`, or no kicker. Recommendation: `WALKTHROUGH 05`.
3. **How references reach members** (shown, not explained). Every member's
   library lists the five references, but the product has no screen for
   sharing reference material. The video doesn't claim one. If the owner
   wants it to, that's a design gap for the grill tracker, not for this
   video.
4. **Optional 4 s beat:** the owner's built **Conflict attestations** panel
   (personal settings: "Require each organisation on this project to confirm
   it operates a conflict-of-interest policy…") fits "setting up the
   project". It's left out to keep ch.1 on the library. Say if it's wanted.

---

## 10. As built (2026-10-17)

- Caption 5 is now `Calder & Hale sees no trace of it`. The caption linter
  counts `&` as a word, so the planned line came to 9.
- The coordinates were measured from stills: Transmit (1062, 453), Open
  (972, 453), the PEA title (470, 349), the Transmit button (900, 300), the
  recipient cell (875, 583) after a status-page scroll of **300**. The ch.1
  status framing is Work m 1.5 on (860, **490**). Nadia's `Acknowledge
  receipt` is at (640, 316).
- The note line sits in the gap under the sub (y 206), so the tables don't
  ease down.
- The library split keeps the built page sub and the reference sub.
- The sandbox split lays out W3's built cards as two over one (personal and
  working area, then shared), because the card is 254 wide.
- Rachel → Nadia (ch.3) is a 15 f window crossfade (one `SplitWindows` over
  another), not 12 f.
- The W5 data lives in one `WT_WALL` block (dates, Nadia's reach, the Redgate
  cards and row) plus `WT_TITLES[5]`, instead of extending `WT_REACH`,
  `WT_DATES` and `WT_COLLAB`.

## 11. Self-check

- [ ] Frames tile 207-3148 with no gaps; the chapters sum to 2,942; the total
      is 3,389 (§1).
- [ ] §0's wall rule holds in every frame: no greyed rows, counts, gaps or
      placeholders; no `Withheld …` line; no `▤ N sources` chip on screen.
- [ ] Eleanor never sees PEA-001. Nadia never sees `Calder & Hale — working
      area`. Eleanor never sees `Redgate Ecology — working area` or the bat
      notes.
- [ ] Built em dashes kept in UI; captions use hyphens; the project name keeps
      its en dash.
- [ ] No source pill on sandbox content; ch.5's pills cite library documents
      only.
- [ ] Render check per master §6.1: stills at 207, 353, 466, 565, 650, 807,
      1033, 1403, 1412, 1700 (glimpse), 1935, 2085, 2277, 2728, 2805, 2978,
      3149, 3299.
