# Final review: W1 Document management and W2 Context layer

Written 2026-10-05 by the final reviewer. It reviews the renders
`demo/product-video/out/walkthroughs/W1-document-management.mp4` (127.9 s) and
`W2-context-layer.mp4` (117.2 s), both 1920×1080 at 30 fps. They were checked
against `BRIEF.md`, `plan/master-plan.md`, `plan/w1-document-management.md`,
`plan/w2-context-layer.md` and `docs/architecture/user-story-screens/`.

**Method.** Every 1-fps frame of both videos was read (`out/review/w1-NNN.png`,
`w2-NNN.png`). Frame `NNN` sits at roughly `NNN − 1` seconds. Single frames
were pulled where a click, a cut or small text needed checking. Times below are
`m:ss`, with the video frame (30 fps) where it matters.

**In plain words.** Both videos tell their story completely and credibly with
the sound off. Nothing is garbled, and nothing contradicts the product. W1 has
one visible cursor error at the end and two badly framed close-ups. W2 has one
story gap that a professional viewer will notice: the method statement that
was just linked does not appear among the "related" sources. It also has two
layout faults on the connections map, and one line of text that is cut in half
in its most important shot. All of these can be fixed in the scene code. None
needs a re-plan.

---

## W1 Document management

**Verdict: ship after the must-fixes.** All six chapters are present, in order,
and readable. Draft → bind → freeze → in-house check (answered) → promote P01
→ appointment accepted → comment pinned to the page → the ethical-wall split →
S0 issued → both kinds of answer recorded → P02 → record read → A1 → C01, with
the amber badge gone. The chapter bar, captions and seat tags stay in step
throughout. The fidelity to screenshots `02`, `07`, `08`, `11`–`25` and `27` is
high.

### Must-fix

1. **Cursor appears to click `Review record` on the final screen.**
   `1:56`–`2:00` (frames ≈3504–3596; 1-fps `w1-118`…`121`, and single frames
   at 3515/3525). Rachel clicks `Back to status` at 3502. The cut to the
   status page at 3504 leaves the cursor where it was. On the new page that
   spot is `Review record`, which shows its hover state under the pointer for
   the whole of the chapter's end and the start of the close. A viewer reads
   this as a second click that never resolves. **Fix:** start the idle fade at
   3504, not 3597, or move the cursor 40 px down into empty space over 10 f
   after the cut. Also suppress the hover on `Review record` (it must not take
   hover from a cursor that arrived through a cut). *File:* `w1/Video.tsx`
   (the 6.5/6.6 cursor path and the S22 hover prop); `w1/status.tsx`.

2. **The Respond close-up is framed off-centre, cutting the round header and
   the PDF.** `1:17`–`1:26` (shots 5.2–5.4, frames 2259–2572; `w1-079`…`087`).
   At Work m 1.4 on (987, 555), the left edge cuts `ROUND 1 · P01`, the
   `● Issued` pill and the first letters of every PDF line ("A Scoping…").
   About 130 px of empty pane and window edge show on the right. This is the
   beat where Eleanor answers the client, so the status line (`0 of 3` → `1 of
   3 comments answered`) must be in frame. **Fix:** move the camera centre
   left to about (900, 545). Check that the panel's right edge (x 1386) and the
   round header both sit inside the frame at m 1.4. If they don't fit, drop to
   m 1.3. *File:* `w1/Video.tsx` (camera keys for 5.2–5.4).

3. **The review-record Detail overshoots the window.** `1:43`–`1:46` (shot
   6.2, frames 3069–3158; `w1-105`…`107`). The Detail at (1109, 410, m 1.8)
   leaves a band of about 165 px (at 1280 wide) of stage background to the
   right of the table. Meanwhile the COMMENT column is cut mid-word on the
   left ("ground thickness", "R-SOIL") and the column headers are clipped at
   the top. The plan clamps cx at 1109.3, but the render shows that the clamp
   does not account for the window's right edge. **Fix:** clamp the Detail so
   that the window's right edge (native 1536) lands on the frame's right edge.
   That puts cx at about 1065. Lower cy by about 20 so that the
   `CODE · RESPONSE` header row is inside the frame. *File:* `w1/Video.tsx`
   (camera keys 3069/3159); check `shared/frame.tsx` clamp.

### Should-fix

1. **A half-line is clipped at the top of every Work shot.** Owen's round
   (`0:27`–`0:33`, `w1-028`…`034`) and Rachel's comment shot (`0:51`–`1:02`,
   `w1-052`…`063`) both show a sliver of the line above (subtitle and status
   card text) cut through at the frame's top edge. Nudge cy so the top edge
   falls in the gap between rows. *File:* `w1/Video.tsx` camera keys.
2. **Respond form at 1:19–1:24 (`w1-080`…`085`).** The passage input's
   placeholder truncates to "The revised passag…". `Record the response` wraps
   to two lines in the narrow panel. Check both against `22-respond.png`. If
   the built panel keeps the button on one line, match it with
   `white-space: nowrap` or the built width. *File:* `w1/cycle.tsx` (respond
   form).
3. **Scrolled Respond view, 1:28 (`w1-089`).** `ROUND 1 · P01` is clipped by
   the pane top. Scroll 290 rather than 298. *File:* `w1/Video.tsx` (S16
   scroll).
4. **Sep 17 header, 1:36–1:37 (`w1-097`/`098`).** With five header buttons, the
   title block wraps to four lines. There is also a stray glyph fragment at the
   top of the comment panel's scroll region (y ≈ 118 at 1280). Check the
   fragment: it looks like a clipped character of the card above. Clip the
   scroll region cleanly. *File:* `w1/cycle.tsx`.
5. **Two verdict-pill colours side by side, 1:16 / 1:37 (`w1-077`, `w1-098`).**
   The header's `verdict ● S0 — …` pill and the round header's `● S0 — …` pill
   render in different tones (slate and amber). The plan specifies amber for
   both (§4.16, §4.17). Make them match unless `22-respond.png` shows
   otherwise.
6. **Accepted subtitle, 1:57 (`w1-118`).** `· verdict` ends one line and the A1
   pill is orphaned onto the next. Allow the subtitle to break before `·
   verdict`, or shorten it. *File:* `w1/Video.tsx` S21 header.
7. **Final status page, transmittals.** The narrow table wraps `Sep 29,/2026`
   and `Review —/issued` (`w1-120`…`127`). This is cosmetic, but it is the
   frame held for 5 s at the close. Give the date column `nowrap`. *File:*
   `w1/status.tsx`.
8. **The footer row of the review record is clipped** by the window bottom at
   Work (`w1-102`…`104`, `1:41`–`1:43`): `Round 2 has no deliverable code
   yet`. The plan's §5 says the Work view holds `3 answered` and Round 2's
   `No comments yet` together, and those are in frame. Showing the foot line
   too would make "no code yet, nothing raised" read in one look. Lower cy
   by about 15.

### What works

- **The workflow is complete and is shown, not told.** Binding gives the draft
  its plan reference on screen. The freeze banner, the promotion window's
  `Source version P01 — accepted by internal QA` and `FROM THE PLAN ● Locked`,
  the appointment's four bullets, the drag-to-anchor, the S0 code chosen from
  a real select, and the issue modal's "does not publish to the library" line
  are all readable when their captions land.
- **The split is the strongest shot in the set.** `1:02`–`1:08` (`w1-065`…
  `071`): Rachel's three coded cards beside Eleanor's clean P01 and the amber
  withheld notice, with seat tags in each firm's colour. A document controller
  understands the ethical wall in one look.
- **Both kinds of answer are on camera.** "Changed in P02" carries a passage
  that really is in P02 (the 2.4 m sentence is visible in round 2's PDF,
  `w1-111`). "No change" carries a typed reason. The record then pairs every
  comment, code and answer (`2 rounds · 3 comments · 3 answered`).
- **The ending pays off.** `● Accepted`, `C01 — issued on acceptance`, A1, and
  no amber "Not used for AI answers" badge. It is the same frame as the
  opening glimpse, so the video closes the loop.
- Dates progress consistently (Sep 01 → Sep 29). Names, codes and the GIR `v2`
  citation are consistent with W2. Typing speed is believable. No captions
  collide with the action.

---

## W2 Context layer

**Verdict: ship after the must-fixes.** The library → connections → creator →
Ask → source → access arc is all there, and the Ask and access chapters are
excellent. The must-fixes are one story gap between chapters 2 and 3, two
layout faults in the ontology close-up, and a line cut in half under the
composer in the video's key frame.

### Must-fix

1. **The creator contradicts the ontology chapter.** `0:43`–`0:51` (shots in
   ch 3, frames ≈1266–1556; `w2-044`…`055`). Thirty seconds earlier Rachel
   classified `WA-EIA-MST-001` as **Land quality** and confirmed its links to
   GIR, BAS and FRA. Yet in Eleanor's new land quality document, MST is listed
   under **`OTHER LIBRARY DOCUMENTS`**, while SCP is "related". In the same
   list, GIR's reason is `Same work package` rather than the link Rachel
   confirmed. Only one row (BAS, `A source of the accepted method statement`)
   pays off chapter 2. Plan §1 promises that "two of those reasons are the
   links Rachel just confirmed". A technical director will notice that the
   newest, most relevant document in the work package is demoted. **Fix:**
   move MST into `RELATED IN THE PROJECT ONTOLOGY` with the chip `Same work
   package`. Give GIR the chip `A source of the accepted method statement`
   (it is: `derived from WA-GEO-GIR-004`), and keep BAS's. That makes four
   related rows and two "other" rows (SCC, FRA). Re-measure the two tick
   targets (GIR, BAS) after the list changes. This is a data and plan fix
   (plan §4.6 table). *Files:* the creator source list in `w2/Video.tsx` /
   `shared/creator.tsx`, data in `src/data/wrenfield.ts` (`WT_LIB` reasons).

2. **The ontology close-up shows a column of orphaned numbers.** `0:29`–`0:35`
   (Work shot over the confirm clicks; `w2-030`…`036`). The Work framing cuts
   the facet column's labels and keeps its counts. The result is a strip of
   bare numbers ("4 1 1 1 2 1 7 7 4 1 1 1") down the left edge, held for about
   6 s. The top edge also cuts the description mid-line ("…and every link
   between documents is confirmed by a person before it counts. It organises
   the library; it is never"). **Fix:** move the Work centre right by about
   60 native px so the frame starts at the graph card's left edge, or widen
   enough to include the facet labels. Then drop cy so that the top edge falls
   between the description and the cards. *File:* `w2/Video.tsx` (ch 2 camera
   keys).

3. **The method statement's "live" dot sits on top of `C01`.** `0:24`–`0:37`
   (`w2-025`…`038`, worst in the Work shot `w2-030`/`036`). On the new
   `WA-EIA-MST-001 · C01` node, the green status dot overlaps the final "1" of
   `C01`. Every other node's reference is short enough to clear the dot. This
   is the node the whole chapter is about. **Fix:** reserve right padding for
   the dot (about 14 px) on all nodes, or let the node grow. *File:*
   `w2/Ontology.tsx` (node component).

4. **The run line is cut in half under the composer in the glimpse, chapter 5
   and the close.** `0:04`–`0:06`, `1:20`–`1:30`, `1:52`–`1:55` (`w2-006`…
   `008`, `081`…`092`, `113`…`116`). When the source panel opens, the
   transcript narrows. The answer reflows taller, and the `▸ Run 3f9c21a0 ·
   Succeeded · every step in the audit trail` line is sliced through by the
   composer's top edge. These are the glimpse and the close: the frame that
   opens and ends the video shows half a line of text. **Fix:** after the
   panel opens, scroll the transcript up by the reflow height (about 30
   native px). Alternatively, end the scroll region above the composer's
   shadow with a fade mask, as the built `ask.tsx` does. *File:* `w2/Ask.tsx`
   (transcript scroll for the narrowed state).

### Should-fix

1. **Caption 13 states something the screen never shows.** `1:24`–`1:31`,
   "From the live v2 - v1 found no groundwater". The source panel proves "v2 ●
   Live". Nothing in the video shows what v1 said. Chapter 1's revision strip
   shows only "v1 Superseded". The claim reads as an assertion. Either add v1's
   one-line summary ("No groundwater encountered") to the strip in the chapter
   1 modal (`w2-016`…`020`), or re-word the caption to "From the live v2 - the
   superseded v1 never reached it". *Files:* `w2/Library.tsx`, `w2/Video.tsx`
   captions.
2. **The library table is cut at the window bottom.** `0:08`–`0:13`
   (`w2-009`…`014`). Only four of the five reference rows are visible:
   `WA-WAT-FRA-001` falls below the pane. That report is later cited in
   answer 1 and appears in the creator list. Scroll the page about 40 px, or
   tighten the wide framing, so all five rows are visible.
3. **The classification is inconsistent with W1.** The ontology card for MST
   reads `Discipline V — Environmental` and `Document type RP — Report`
   (`w2-030`). W1 shows the same document as `Role / Discipline EEN`. It is a
   method statement, so the UK annex document type would be `MS`, not `RP`.
   Use `MS — Method statement`, and either reconcile the discipline label with
   W1 or have the owner confirm that the ontology uses Uniclass role letters
   while the plan uses the firm's discipline code. *Data:*
   `src/data/wrenfield.ts`.
4. **The Detail on the source panel cuts the transcript mid-word.** `1:25`
   (`w2-086`): "nd reaches 2.4 m", "ction dewatering". The highlighted passage
   reads well, but the half-words read as a glitch. Move cx right so that the
   frame's left edge lands on the panel divider plus the pill column (keep the
   outlined `WA-GEO-GIR-004` pill in shot), or accept the cut and soften it
   with the window's own edge. *File:* `w2/Video.tsx` (`key(2461,
   detail(1152, 400, 2.0))`).
5. **Rail fragments at the edge of Work shots.** The creator (`w2-044`…`050`)
   shows orphan `▸` arrows and "be" from the rail. The Ask typing shot
   (`w2-057`…`063`) shows "ws what actually ran," / "mpty until the run".
   Shift the centres slightly so that the cut falls on a gutter.
6. **The ontology graph is thin before MST arrives** (`w2-024`). Only one
   existing edge is shown (FRA → GIR). ECO, SCP and SCC have no links, which
   undercuts "every document feeds a living ontology". Add one or two
   confirmed links that already exist (for example `SCP references BAS`, `SCC
   responds to SCP`) so that the map looks lived-in before the new links
   arrive.
7. **The GIR "PDF" in the chapter 1 modal** carries a few lines and then blank
   page (`w2-016`…`020`). It is acceptable at the Work zoom, but a fuller first
   page (a title block and two paragraphs) would look less like a placeholder.

### What works

- **Ask is the best product footage in the set.** `0:54`–`1:19`: real typing,
  the "What ran" rail ticking through five stages, claims streaming one by
  one, each with its pill, then `6 cited claims · Composed for this question ·
  Planning & Environmental Lens v1` and the built honesty line, held long
  enough to read.
- **The source opens on the passage** (`w2-081`…`092`): `WA-GEO-GIR-004 · v2 ●
  Live`, `Cited passage · page 14`, the highlighted sentences matching the
  claim word for word, and the clicked pill outlined in the transcript.
- **Access shown as absence lands exactly as the brief asks**
  (`w2-092`…`111`). Both seats get the same question, `7 sources` against `6
  sources`, and two PEA claims on Rachel's side only. Eleanor's trout and
  pathway claims are word-for-word identical to Rachel's. Eleanor's screen
  has no greyed row, no count and no mention of Redgate. The `4 cited claims`
  / `2 cited claims` footers make the difference countable without a word.
- **The confirm sequence is clear.** The three dashed `suggested` links turn
  solid one click at a time, and `Confirm / Reject` becomes `Retire`. The
  caption "Rachel confirms each link herself" lands with the clicks.
- The vision screens (connections map, creator work-package field, revision
  strip) sit naturally in the design language. They use the same cards,
  micro-labels, chips and mono references as the built screens, and nothing
  looks like a different product.

---

## Cross-video

- C01, Sep 29, the GIR `v2` citation and "at Wrenfield Sidings" are
  consistent between W1's ending and W2's library and answers.
- The one cross-video mismatch is the MST classification (W2 should-fix 3).
