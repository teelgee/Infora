# Pillar walkthroughs: product-accuracy review

Written 2026-10-05 by the product-accuracy reviewer. It covers the four plans in
`plan/` against the brief, the master plan, `CONTEXT.md`, the accepted ADRs,
`demo/archive/2026-10-sizzle/research/product-inventory.md` §3 (claims we must not make), the built
code, and the screenshots in `docs/architecture/user-story-screens/`.

**In plain words.** All four plans do what the owner asked, and the frame
arithmetic holds up. I found no claim that breaks the "must not say" list.
Six things must change before building. The most important are these. In
video 4, the chat-led builder skips one of the questions that decide who sees
what. That is the exact risk the owner's own ruling warned about, so the
question has to be shown. In video 4, the trip back in time to June is said
only in the narration, so the silent video reads as if Rachel built the app on
the same morning. The method statement that Rachel accepts in video 1 contains
the very location error the checker flags in video 4. The document creator is
drawn two different ways on the same day in videos 2 and 4. One rail item in
video 3 is lit where the real editor lights nothing. On the question I was
asked to rule on, **Rachel should keep confirming the ontology links in
video 2.** The decision record and the server both give that job to the
client, so moving it to Eleanor would be the inaccurate version.

---

## Verdicts

| Video | Verdict | Brief coverage | Notes |
|---|---|---|---|
| W1 Document management | **Ready, with 1 must-fix** | Complete: produce, bind, in-house check, promote, review, the wall, issue, respond (change and no change), P02, record, A1, C01, library | 127.9 s. Review +7 s and Respond +5 s go past the ±3 s allowance, but the total stays within 130 s. The reviewer side of "closed out" is thin (should-fix 1). |
| W2 Context layer | **Ready, with 1 must-fix (shared with W4) and a re-mark** | Complete: library, live/superseded, ontology, new document from related sources, Ask with a source on every claim, passage, access by seat | The Rachel-confirms question is ruled in Rachel's favour (§ ruling below). Narration is 240 words, under the 260–290 band, and the plan explains why. |
| W3 Collaboration | **Ready, with 1 must-fix** | Complete: shared sandbox with named access, Owen excluded, new document, two people at once, chat prompt, cited suggestion in both canvases, accept, mention, close | The card's `with …` line goes against built code. The plan flags it (should-fix 5). |
| W4 Tools | **Not ready: 3 must-fixes (one shared with W2)** | QA check, existing workflow (creator from a firm outline) and the chat-led KPI build are all present. Polished, and the KPI arithmetic is exact | 129.9 s, 3 frames under the ceiling, so adding the missing question means finding about 60 f elsewhere (must-fix 1 says where). |

---

## Ruling: who confirms the ontology links in W2

**Keep Rachel. Do not change it to Eleanor.**

- **ADR-0045, amended 2026-08-27, clause 2:** "Confirmation on a library
  container is the owner's act … once a container is published into the
  owner's library the record is the owner's, so **only the owner confirms**."
  Either party may *propose*.
- **The server already enforces this.** `apps/api/src/ontology.ts` 117–121,
  `mayConfirmEdge`: `target.inLibrary ? slice.membershipRole === 'owner' :
  producesIt(from, slice)`. All three edges on camera point at library
  reference material (`WA-GEO-GIR-004`, `WA-ENV-BAS-003`, `WA-WAT-FRA-001`),
  so if Eleanor clicked Confirm, the API would refuse it.
- **What is producer-only is the built screen, not the rule.** The only built
  confirm controls are in `OntologyPanel`, which is mounted on the plan row
  with `editable={canEditDelegated}` (`apps/web/src/screens/plan.tsx` 500).
  The plan row is Calder & Hale's, so the UI hasn't caught up with the
  amendment. `flows-context-tools.md` A.6 already casts Rachel as "the
  confirming hand on a library container".

So the fix is to W2's status marks, not its casting. See must-fix 6.

---

## MUST-FIX

### 1. W4 · Build (shots 4.6–4.8, frames 2162–2480) · the per-screen "who may open" question is skipped

**Problem.** The built builder asks *who may open* once **per screen**
(`packages/contracts/src/app-builder.ts` 775, computed for every interface;
`BuilderAgentPane` lists each under "Still to ask you"). ADR-0056 §2b says the
same thing: "who may open **each** interface". W4 shows only the dashboard
question, and A4 settles the form's access by itself ("Suppliers open the form
and their own returns"). That is a chat skipping a required question, which is
exactly why the 2026-09-06 addendum (ruling 6) declined a chat that fills the
steps in. The producer wants all three wall questions to be visible.

There is a second, smaller problem. The quick replies `Trentmoor Energy only`
and `Everyone — each sees their own` are not the built answers. The built ones
are `Everyone the app is open to` plus one toggle per organisation
(`app-builder.tsx` 650–680).

**Exact fix.**
- After A3 (screens written, 2208), ask the questions in the built order,
  form first. Step 4 shows `Waiting for you` until both are answered.
  - **Q2a**, streamed in full (the built text, ~214 ch, ~72 f): `Who may open
    “Submit this month’s KPIs”? Everyone the app is open to, or only some of
    those organisations. Whatever you choose, it can only narrow — a screen
    shows each person what they could already see, and never more.` Replies:
    `Everyone the app is open to` · `Trentmoor Energy` · `Netherfold Cabling` ·
    … (show the first two and `More…` if width is short). Rachel taps
    `Everyone the app is open to`, and it echoes as a bubble.
  - **Q2b**, streamed as its first sentence only (D-3 style; ~37 ch, ~13 f):
    `Who may open “Supplier KPI dashboard”?`. Rachel taps `Trentmoor Energy`,
    and it echoes as `Trentmoor Energy`.
- Change A4 to `Set: the form opens to everyone the app is open to; Supplier
  KPI dashboard opens to Trentmoor Energy only.`. R4 becomes `✓ Step 4 · The
  interface — 2 screens; the form to everyone, the dashboard to Trentmoor
  only`. The step 4 recorded line becomes `2 screens · form: everyone ·
  dashboard: Trentmoor only`.
- Caption 12 becomes **"Rachel decides who opens each screen"** (6 words). The
  narration at 2335 becomes "Who may open each screen? The form, every
  supplier. The dashboard, Trentmoor only."
- **Frames.** The second question costs about 60 f (13 f stream, about 40 f of
  cursor travel and tap, and the echo). Take it from holds that carry no
  action, with no change to the ceiling: shot 5.5 hold 96 → 66 f (−30),
  shot 6.5 notice hold 3543–3612 → −15 f, and shot 1.7 read hold → −15 f.
  Then re-time the later frames.
- Remove D-5 from §9 and from the owner's open items.

### 2. W4 · Build (caption 9 at 1473, shot 4.1) · the jump back to June is invisible in the silent render

**Problem.** Chapters 1–3 are Oct 05. Chapter 4 is the build in June. Only the
narration says "Earlier in the project". Caption 9 reads "Rachel describes the
app in her own words", and caption 16 then says "Months later", so the silent
viewer gets a forward jump with no backward jump before it. Master §2.7 says
that every time jump is said in the caption line.

**Exact fix.** Change caption 9 to **"Earlier, Rachel describes the app she
needs"** (7 words). Keep caption 16 ("Months later, the returns are in").

### 3. W1 · all PDF and canvas shots (S5, S7, S12, S13, S16, S19; §4.6, §4.12) · the accepted record contains the error W4's checker flags

**Problem.** W1's method statement reads "The GIR records PAH exceedances at
three trial pits **south of the Wrenfield substation**" in v0.1, P01, P02 and so
in C01. Rachel accepts it with A1 as the contractual record, and it goes into
the library, which Eleanor's checker and creator then draw on. A week later in
W4, the Accuracy finding says that sentence contradicts the record ("The record
puts these PAH hotspots at Wrenfield Sidings, not south of the Wrenfield
substation", citing GIR-004). Across the series, the review in W1 looks as if
it missed a factual error, and W4's checker looks as if it found one in an
accepted document. That undercuts both pillars.

**Exact fix.** Add a DEV on the same footing as E-9 ("the scheme"). In W1's
editor canvas and in every PDF version (P01, P02, C01), §2's sentence reads
`The GIR records PAH exceedances in three trial pits at Wrenfield Sidings and a
perched water table within the made ground west of Ashcombe Lane.` W4's working
copy keeps the old wording. It's an older copy, so it is still the thing the
checker catches. Add a row to W1 §8: `DEV · §2 location wording matches the GIR
(cross-video, W4 accuracy finding)`.

### 4. W2 ch 3 (§4.6) and W4 ch 3 (S4) · the document creator is drawn two ways on the same day

**Problem.** On Oct 05, Eleanor's document creator shows three differences
between the two videos:

- **W2** shows a work-package field (`Which work package is it part of?`) and
  a source list grouped `RELATED IN THE PROJECT ONTOLOGY` / `OTHER LIBRARY
  DOCUMENTS`. Its "Start from:" row is plain `t1-02`: `Assessment chapter
  section · Technical note`.
- **W4** (10:05 AM) has no work-package field and a flat source list in built
  order. Its "Start from:" row includes `Land quality technical note` `Your
  firm`.

A viewer who watches both sees one screen in two versions, and W2 is missing a
firm outline that W4 shows existed that morning.

**Exact fix.**
- **W4 S4:** draw the vision field and the grouping as W2 draws them. The
  work-package field holds `Land quality`. It sits above the outline card and
  isn't framed, because W4's scroll passes it, so no extra click is needed. At
  scroll 1300, the sources card uses W2's grouped order:
  - related: `WA-GEO-GIR-004` `Same work package`, `WA-ENV-BAS-003`
    `Derived-from source of WA-EIA-MST-001`, `WA-EIA-SCP-001`;
  - other: `WA-CON-SCC-002`, `WA-WAT-FRA-001`, `WA-EIA-MST-001`.

  Re-measure the two tick targets. They become adjacent rows, which shortens
  the second travel. Mark it `VISION (A.11 route 2), as W2`.
- **W2 §4.6:** the outline card's "Start from:" row adds `Land quality
  technical note` + `Your firm` (BUILT: render tests at `render.test.tsx` 542).
  It is scrolled past, so no frames change.

### 5. W3 · shot 2.6 and the split rail (§3.6, shots 3.x–6.x, glimpse, close) · `Editor` drawn as the active rail item

**Problem.** The built editor lights **no** rail item (`09-editor.png`,
`11-frozen.png`, `t2-07-marks.png`). W1 §4.1 gets this right with `nav: null`.
W3 has `Nav Editor active` in shot 2.6 and an "active fill" on Editor in the
collapsed split rail.

**Exact fix.** Set `nav: null` in shot 2.6 and in both split shells. Remove
"Rail flip on the click frame" from shot 2.6's notes, because the click cuts
to the editor and the rail clears. Do the same for W4 S3 if its build sets an
active item (the plan is silent).

### 6. W2 · §8 (vision and rulings) and shots 2.4–2.5 · the confirm act is marked VISION with the wrong reason

**Problem.** §8 marks "Owner confirming links on a library container" as
`VISION per flows A.6 (the built panel's editor is the producer)`. The
authority is ruled and built server-side (see the ruling above). Leaving it
marked VISION invites a later "fix" that would move the act to Eleanor and
break ADR-0045.

**Exact fix.** Change the §8 row to: `Owner confirms edges into library
containers | RULED ADR-0045 (amended 2026-08-27, clause 2) · BUILT server
rule apps/api/src/ontology.ts 117–121 · owner-side controls not yet on screen
(built panel is plan-row only, plan.tsx 500)`. In shot 2.5, change the status
to `RULED ADR-0045 am. §2 · BUILT-NP controls ontology-panel.tsx`. Keep
Rachel, the captions and the narration exactly as written.

---

## SHOULD-FIX

### W1

1. **Ch 6 (shot 6.2, caption 14) · the reviewer side of "closed out".** The
   owner asked for comments to be "dealt with by both sides and closed out".
   Rachel's side is a pan over the record with the caption "Later, every
   comment sits beside its answer". Reviewer approval of each response is not
   built (Q-038 is open), so don't invent it. Make the close-out explicit with
   what is built instead:
   - hold Work on the record subtitle `3 comments · 3 answered` and the
     Round 2 row `No comments yet` for 45 f;
   - change caption 14 to **"Rachel reads every answer before accepting"**;
   - add the narration line "Every comment is answered, and none is raised
     again in round two."
2. **S7 (shot 2.3) · title mismatch in one frame.** The Internal QA subtitle
   keeps the pre-bind `Land Quality scoping method statement — working draft`,
   while the same frame's PDF first line was changed to the plan title (DEV
   E-10). Either apply E-10 to the subtitle as well, or keep the capture's
   pre-bind line on the PDF. Don't mix them.
3. **Shot 2.3 · Owen's own S0 comment stays at `0 of 1 comment answered`
   while he accepts A1.** This is built, but the camera dwells on it at Work.
   Frame the Work key on the verdict block (for example, centre (1210, 640))
   so the unanswered counter isn't the read.

### W2

4. **§4.4 · the ontology sub-line contradicts the screen.** `WT_ASK.ontology.sub`
   says every link "was proposed and confirmed by a person". The chapter then
   shows links arriving already proposed, by the agent (VISION, ADR-0045:
   agent-proposed, human-confirmed). Change it to `…every link between
   documents is confirmed by a person before it counts.`
5. **§4.4 · classification in Rachel's seat.** Classification is the authoring
   team's editable field (ADR-0045). The built panel shows it read-only to
   anyone else. Draw Rachel's five classification boxes as disabled selects
   (the built disabled style), not live ones.
6. **§4.5 · the sandbox row repeats W4's result.** Eleanor's sandbox already
   lists `Land contamination — Ashcombe Lane parcels · Oct 05` (W4's 10:05
   result). She then starts "a new land quality document" from the same two
   sources. Drop the row from W2's sandbox (show the three folders only), and
   leave W2's creator beat undated. Nothing on screen dates it.
7. **Narration 207.** "Rachel Bowen owns Trentmoor Energy's project library"
   should be "Rachel Bowen, for Trentmoor Energy, opens the project library."
   The library is the project owner's, not a person's.

### W3

8. **Shot 1.8 and every shared card (§12 item 5) · the `with Calder & Hale,
   Redgate Ecology` line.** With `Only specific people`, the built card shows
   no `with` line. `organisationIdsInScope` counts organisation grants only
   (`apps/api/src/sandboxes.ts` 254–258, `sandbox.tsx` 1849–1894). This is a
   built screen drawn differently. My recommendation is to drop the line and
   let `Shared` + `3 in scope` + Owen's two cards against Eleanor's three carry
   the beat. If the owner keeps it, mark it DEV on every card where it appears
   (1.8, 2.1, 2.2).
9. **Caption c9 (2200).** "Nadia sees Eleanor's request in her own thread"
   reads as a private thread, which is the opposite of ADR-0039 §1. Change it
   to **"Nadia sees Eleanor's request in the shared thread"** (8 words).
10. **Caption c2 (628).** "Only Eleanor and Nadia are let in" ignores that the
    creator's side is always included (the wizard hint says so). Change it to
    **"Rachel lets in only Eleanor and Nadia"**.
11. **Master §4.7 · Nadia's heading.** W3's `1. Ecological receptors`, typed,
    is right: accept appends, so her section comes first. Update master §4.7
    and `WT_COLLAB.nadiaText` so the shared data doesn't keep `2.`.

### W4

12. **Q1 quick replies (S6, 1950).** `Yes — it’s contractual` / `No — it’s
    working data` are not the built options. The built ones are `Yes — add an
    acceptance step` / `No — rows never change hands` (`app-builder.tsx`
    500–502). Use the built labels on the chips, keep `What counts as
    contractual?` as the vision third, and keep U1 typed. The master §4.8
    "built punctuation" note quotes a non-built string, so correct it there too.
13. **Captions 3 and 16 · the label is out of step with the chapter bar.** Cue
    3 keeps `1 / 6 · QA check` until 650, while the bar flips to chapter 2 at
    627. Cue 16 shows `5 / 6` from 2748, while the builder is still on screen
    until 2757. End cue 3 by 621, with its 88 f minimum met from 523, and bring
    cue 4 in at 627. Bring cue 16 in at 2757.
14. **Shots 4.6 and 4.10 · cursor fade frames written outside their shot**
    (`fades out 2071–2076` in a 2120–2212 row; `2485–2490` in a 2554–2651
    row). Move each note into the shot it happens in, or the builder will key
    them wrongly.
15. **Sam's accepted-row stamps (S7).** Aug reads `Sep 03, 2026 · Rachel
    Bowen, Trentmoor Energy`, while Jul and Jun read `· Rachel Bowen` only.
    Pick one form (the shorter one) for all three.

### Series

16. **Master §4.4 date table.** Add the dates the plans introduced:
    - Netherfold's Jun/Jul/Aug acceptance dates (Jul 02, Aug 04, Sep 03);
    - Sam's draft saved at 10:58 AM;
    - W3's reply at 11:05 AM;
    - a note that W2's creator beat is undated (after should-fix 6).

    Every weekday in the table checks out: Sep 01 Tue … Oct 05 Mon.
17. **Chapter allowances.** W1 (+7 s, +5 s) and W4 (+11 s) go past ±3 s, and
    each gives its reason. All four totals sit within 110–130 s. This is the
    lead's call. Nothing in it is inaccurate.

---

## Cross-video consistency: what checks out

- **People and roles.** These are the same in every video:
  - Rachel: owner and lead reviewer;
  - Eleanor: Calder & Hale, Member, lead author;
  - Owen: internal QA, and the member left out of the shared space in W3;
  - Nadia: Redgate;
  - Sam: Netherfold, `— Contractor`, which is flagged and never visible in
    W4's collapsed rail.

  Halvern, Marcus Webb, Priya Nair and Mrs A Patel never appear.
- **Library and reach.** C01 is issued Sep 29 and the PEA Sep 08, in W1 and
  W2. Eleanor reaches 6 sources in W2's chip, W3's library list, W4's
  checker list and W4's creator list, never the PEA. Rachel reaches 7.
- **Timeline.** It runs Sep 01 → Sep 29 (W1), Oct 02 (W3), and Oct 05: W4
  09:40 and 10:05, W4 11:02–11:24, then W2's Ask at 02:10 PM. The build in
  June is coherent once must-fix 2 is in. Every "N days left" agrees with
  calendar days (14, 13, 6, 2).
- **KPI numbers.** All of them recompute: `66 of 74` → `93 of 102`, `569` →
  `630 tCO2e`, 15 → 16 rows, `£188k` → `£272k`, monthly carbon
  171/163/154/142, bars 96/85/95/92, and all four insight sentences (91%, down
  3; 6 of 9; −8% to 142; no NCR rise).
- **Strings.** Every typed string is the length the plans say (113, 84, 75,
  118, 68, 45, 60, 108, 89, 66, 45, 120, 65, 36), and every one is ≤ 120.
  Streaming end frames recompute (W2's answer 1, 3R and 3E; W3's four claims;
  W4's turns and the 214-character insight).
- **Shell.** The owner's run-together org line, the member org line, the
  badges and chip lines match `02`, `18` and `26`. Ask labels the user by first
  name (`ask.tsx` 265) and the agent `Infora agent` (built). The builder's
  pane heading `The builder’s agent` is built (`app-builder.tsx` 1042).
- **Punctuation.** Captions, titles and narration use hyphens only. Product UI
  keeps the built em dashes and the project name's en dash. US dates appear in
  the UI only.
- **Required lines.** All four are verbatim.
- **Claims (§3.3).** No training claim, no AI approval or verification, no
  bulk accept of a rewrite, no cited sandbox or upload, no Lens that changes
  reach, no run internals in another organisation's seat, and no
  "deleted"/"archived". The playbook carries no rows. Both the run's acting
  identity and the narrowing are stated.

## Frame-maths spot checks

- **W1.** Shots tile 207–3596. The chapter sums are 450/270/330/930/750/660,
  for 3,837 f. Camera moves are ≥ 90 f apart. Detail is 0%.
- **W2.** Shots tile 0–3506, for 3,060 chapter frames. The single Detail runs
  119 f. Claim streams recompute exactly at 4 c/f with 4 f gaps.
- **W3.** Shots tile 0–3536 (720/390/420/630/390/540). c14 holds exactly its
  75 f minimum.
- **W4.** Chapter 4 shots sum to 1,290. The total is 3,897, which leaves
  **3 f** under the 130 s ceiling. That is why must-fix 1 names where its
  ~60 f come from.
- **Caption holds.** Every caption I checked meets `max(75, words × 8 + 24)`.
  The only timing issue is W4's label/bar mismatch (should-fix 13).
