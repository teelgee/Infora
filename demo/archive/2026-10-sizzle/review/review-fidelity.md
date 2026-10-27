# Fidelity and production review

Reviewer: fidelity and production checker, 2026-10-04. Checked:
`demo/BRIEF.md`, `demo/research/product-inventory.md`,
`demo/plan/master-plan.md`, `video-01` to `video-05`. Also checked against
ADR-0056 (both addenda), the seed passages in `packages/db/src/seed.ts`, the
screenshots `09-editor.png`, `t2-07-marks.png` and `18-round-open.png`,
`docs/design/design-tokens.json` and `.claude/skills/infora-design/`. No plan
file was edited.

## Verdict

**Ready to build once 11 must-fixes are made.** The frame maths is almost
clean. Every shot table is contiguous with no gaps or overlaps. Every body
sums to its stated length, and the film adds up to 3,465 frames (115.5 s)
under the 3,600 cap. The data mostly adds up too: all of clip 4's
September totals, carbon sums, insight figures and Netherfold rows, and all of
clip 5's budget, forecast, variance and status counts are correct.

The vision holds on the big lines. Nothing shows training or pooling, an AI
verdict, the client seeing agent runs, or an AI stamp on an export.

The real problems are these:

- One ADR duty is dropped: the third wall question is never asked.
- One narrative collision: clip 2 finds a defect in the section clip 1 has
  just drafted.
- One impossible state: a brand-new app's preview already shows months of
  data.
- A handful of counting and positioning errors.
- A few under-specified components.

No invented organisation name matches a real UK company. One generic name
(Brookside) sits near real fencing traders, and is worth swapping.

---

## Must-fix

### 1. Clips 4 and 5 never ask the third wall question (ADR-0056 §2b; inventory §2.9 and §6.1)

ADR-0056 §2b names three things the builder must be walked through. Two are
asked: whether the data is contractual, and who may open each screen. The
third is never asked: what a scheduled run may touch. Ruling 6 was declined
precisely because "a chat can skip a question, a form cannot". The brief
sanctions chat-first building, but the inventory keeps the condition: "the
agent must still ask the three wall questions". As drawn, step 6 is marked
"✦ the agent asks" and then ticks done with nothing asked. Read-back line 4
is a statement, not a question.

**Fix (no change to body lengths):** turn read-back line 4 into the question.

- **Clip 4, read-back line 4** becomes a sunken block with a warning-tint
  left rule. Its label (11.5 px, 600, `#78766f`) reads "✦ the agent asks ·
  Step 6". Its text reads "The monthly run acts as you, Rachel Bowen, over
  Monthly KPI returns and Insights only. Is that everything it should
  touch?" Two secondary buttons follow: **"Yes — only these"** (chosen) and
  "Change what it touches".
  - Step 6: change "done 508" to **"Waiting for you" from 508, done 568**.
    The summary "Summarise the month · flag any change over 10%" stays.
  - Cursor: show 556 at (1300, 960). Go to "Yes — only these" (≈ (800, 770))
    over 556–564 and **click 566**. Then go to "Open to 5 organisations"
    (≈ (770, 880)) over 568–574 and **click 576**. Hide at 584.
  - At 568 the question block collapses to a receipt: green check plus
    "Step 6 · Analysis and prompts — runs as Rachel Bowen, over 2 tables".
- **Clip 5, same treatment.** The text reads "The monthly run acts as you,
  Eleanor Price, over Package commentary and Programme & cost figures only.
  Is that everything it should touch?"
  - Step 6: change "active 435, done 440" to **"Waiting for you" from 440,
    done 486**.
  - Cursor: show 474 at (1300, 980). Go to the reply over 474–482 and
    **click 484**. Then go to "Open to Calder & Hale" over 486–490 and
    **click 492**. Hide at 500.
- **Both clips' honesty notes:** replace "answered by the read-back's line
  4" with "asked in the read-back, answered by a click, receipt lands on
  step 6".

### 2. Clip 2 finds an accuracy defect in the section clip 1 just drafted

Clip 1 ends with section 2, "Baseline sources", rewritten from the library
and accepted, with five cited sentences. Clip 2 then shows a different
"2. Baseline sources" containing "PAH exceedances at three trial pits south
of the Wrenfield substation". It is in a differently named document, and a
red Required mark sits on it. Cut together, this reads as "the cited AI
draft was wrong", which undercuts the film's first promise.

**Fix:** keep the defect in text a person wrote.

- Clip 2's canvas shows §1 and §3 only. A 1-line Greek strip with a
  `WA-GEO-GIR-004` pill stands in for §2.
- Move the required mark into §3. The new §3 reads:
  "[advisory: A conceptual site model has been prepared for each land parcel
  crossed by the route.] Sources considered include historic landfill,
  agricultural fuel storage and made ground associated with the former
  works, including [required: the PAH exceedances at three trial pits south
  of the Wrenfield substation]."
- Suggested wording becomes "the PAH exceedances in three trial pits at
  Wrenfield Sidings".
- Shot 3's push re-centres on the §3 span.
- Clip 2 names its draft the same as clip 1. "Draft" select and second bar:
  "WA-EIA-MST-001 EIA Scoping Method Statement — Land Quality". Drop "Ashcombe
  Lane working copy".

### 3. Clip 4's preview shows data a new app cannot have yet

App tables start empty: rows only exist once suppliers submit them (ADR-0056
§2). The build is stamped "Published v1 · Rachel Bowen, 29 May 2026". Yet
the shot 5 preview already shows September 2026 figures.

**Fix:**

- In shot 5, render the preview with its block layout and empty values:
  - Tiles show "—" with the sub "no returns yet".
  - Charts show axes, plus faint `#e0ded8` placeholder bars and line at 40 %
    opacity, with no value labels.
  - The table shows one muted row: "No returns yet".
  - The preview header reads "Preview · as Rachel Bowen, Trentmoor Energy ·
    no returns yet".
- The filled numbers appear first at shot 7's hard cut. Its sub, "October
  2026 · accepted returns only", carries the time jump.
- Keep the block entry frames (456–496) and the count-up only in shot 7
  (tiles from 600 + 6).

### 4. Clip 3 split-screen geometry does not add up

Two panes of 860 px centred at x 490 and 1430 leave an **80 px** gutter, not
40 (left pane 60–920, right pane 1000–1860).

**Fix:** keep the 40 px gutter and centre the panes at **x 510 and x 1410**,
which gives 80–940 and 980–1840 with 80 px margins. Move clip 3 shot 3's
cursor targets by +20 px x: start at (720, 980), button at ≈ (780, 930).

### 5. Clip 3 comment counters are wrong at both ends

- **At the start of shot 2,** only A and C exist; B is typed at 96–164. The
  counter "Open · 3 comments" should read **"Open · 2 comments" from 60,
  then "Open · 3 comments" at 168**.
- **In shot 4,** the counter jumps from "0 of 3" straight to "3 of 3" when
  only B is answered on screen. The fix: from 330, the counter reads
  **"Responding · 2 of 3 comments answered"**, and A and C carry their
  "Answered" badges, blurred. At 436 it flips to "3 of 3 comments answered".

### 6. Clip 3 comment C has no text, but shot 3 shows it in full ("same text as Rachel's")

Define it:

- Author: Rachel Bowen. Code: `info` "S0". When: "Sep 02, 2026, 08:34 AM".
- Quote: "“ground gas migration” — p.1".
- Body: "Say which parcels need ground gas monitoring, and for how long."

Comment B's "when" is also undefined. Use "Sep 02, 2026, 08:41 AM".

### 7. Clip 3 writes the same reference two ways

The header title is "WA–EIA–MST–001" with en dashes, copied from the
screenshot's rendering. The payoff card in the same clip, and clips 1 and 2,
use `WA-EIA-MST-001` with hyphens. The inventory says to reuse references
verbatim.

**Fix:** use hyphens everywhere: header title "WA-EIA-MST-001". Store it once
in `wrenfield.ts` as `DOC_REF`.

### 8. Clip 5 Q2 user bubble frame

The master's `Turn` rule puts the user bubble 8 f after `chosenAt`. Q2 is
clicked at 420, so the bubble lands at **428**, not 426. Then step 4 done
moves from 430 to **432**; step 5 done 434 is unchanged. Alternatively, the
rule could be changed, but clips 4 and 5 use +8 everywhere else.

### 9. Clip 5 saved strip covers the deck's provenance footer

At camera scale 4.0, slide 4 occupies y 90–990 on screen. Its footer ("Data
as at 30 Sep 2026 · …") sits at about y 930–960. A strip centred at y 990
covers it, and that footer is the honesty stamp that replaces any AI label.

**Fix:**

- End the push at **scale 3.8** (slide 1520 × 855, y 112–967, centre
  ≈ (536, 664) unchanged).
- Centre the strip at **y 1024** (height 56 → 996–1052).

### 10. Clip 4 dashboard does not fit its declared native box

Header, 3 tiles, 3 charts, the insight card and a 5-row table do not fit in
774 × 576 native at 12.5 px UI. A minimal stack is about 634 px tall.

**Fix:** set the dashboard's native size to **774 × 640**, using this grid:

| Row | Content | Height |
|---|---|---|
| Padding | Top | 24 |
| 1 | Header | 40 |
| Gap | | 12 |
| 2 | Three tiles, 242 × 72 each, 12 gaps | 72 |
| Gap | | 12 |
| 3 | Bar 250 × 190, line 250 × 190, donut 226 × 190 | 190 |
| Gap | | 12 |
| 4 | InsightCard, full width | 96 |
| Gap | | 12 |
| 5 | Table: header plus 4 rows at 28 | 140 |
| Padding | Bottom | 24 |

- In the shot 5 preview (scale 1.5, pane 864 high), the pane clips at 576
  native, so the table is cut by the fold. That is fine and honest.
- In shot 7, Float at scale 1.55 gives 1200 × 992, y 64–1056. Move the
  client SeatLabel to (120, 24), or drop the scale to 1.5 (y 80–1040).
- Shot 8's left-half dashboard at scale 0.95 becomes 735 × 608.

### 11. Clip 4 shot 8 needs both seats labelled

Shot 8 puts the client's full dashboard, with all four suppliers' figures,
on the left and Netherfold's pane on the right. With only the supplier
SeatLabel on screen, a viewer can read the left side as what Netherfold
sees, which breaks claim 2.

**Fix:**

- The client SeatLabel "Trentmoor Energy · Rachel Bowen" stays, re-anchored
  above the left dashboard at (500, 150), from 675.
- The Netherfold pane's native size is defined as **560 × 520**, giving 840 ×
  780 at scale 1.5, spanning x 1010–1850.
- The supplier SeatLabel sits at (1430, 130).

---

## Should-fix

**Fidelity and copy**

1. **Clip 4 EndCard and master §2.** "Same app. Each sees their *own*." is
   not true of the owner: Trentmoor sees every supplier's accepted rows
   (ADR-0056 §2, §4). Use "Same app. Each sees what they *may*." (6 words,
   one italic), and promise "…and each organisation sees only what it may
   see."
2. **Clip 3 payoff: show who accepted.** Add a muted line under the row,
   "Accepted by Rachel Bowen, Trentmoor Energy · 29 Sep 2026", so "Accepted"
   cannot read as automatic.
3. **Clip 3: the close button with no verdict.** The built product requires
   a deliverable verdict to close a round (`18-round-open.png`: "A verdict
   is required to close the round"). Draw the "Deliverable verdict" select
   above the button, Greek'd and blurred with its value unreadable. That way
   the step is not implied away without inventing code semantics.
4. **Clip 5 spreadsheet source.** ADR-0056 §9 lets an app connect to a
   sandbox file, which is the honest local version of this beat. Change the
   file card's muted line to "In Calder & Hale — project sandbox · Sheet:
   Sep 2026 · 4 rows".
5. **Clip 5 home button.** The run is September's pack, made in October.
   "Generate this month's pack" becomes **"Generate September's pack"**.
6. **Clip 5 risk attribution is mixed.** Slide 4 quotes "— Owen Vance,
   package lead" while slides 2, 3 and 5 say "— package lead". Use the same
   form on all four. Either drop the name on slide 4, or name every lead
   (which needs three more invented names and a collision check).
7. **Clip 5 casting.** The seed casts Owen Vance as Calder & Hale's internal
   QA reviewer, not a package lead. That is acceptable as vision, but note it
   in `wrenfield.ts`.
8. **Clip 1 accepted receipt.** "Accepted · 5 sentences, 5 sources" counts
   pills, but there are 2 distinct sources. Use "Accepted · 5 sentences,
   each with its source".
9. **Clip 4 insight.** "down 3 points" comes from rounded figures (91.2 %
   vs 93.7 % is 2.5 points), and the plan says the numbers are computed in
   code. Change "August on time: 89 of 95" to **81 of 86 (94.2 %)**, which
   gives exactly 3.0 points. Netherfold's August 26/25 still fits: the other
   three suppliers have 60 due and 56 on time.
10. **Clip 4 tile label.** "Carbon · 2026 to date" over Jun–Sep reads oddly
    for an app published in May. Use "Carbon · since June" with sub "4
    months, accepted returns only".
11. **Clip 5 slide 2.** "4.1 km of 9.6 km" is 42.7 % against an actual of
    44 %. Use **4.2 km** (43.8 %).
12. **Clip 4 date order.** Clip 4's "29 May 2026" badge appears right after
    clip 3's September dates. That is acceptable, but if item 3 is fixed,
    "Published v1 · Rachel Bowen" with no date reads cleaner.

**Timing and legibility**

13. **Agent turns type far too fast to read.**

    | Turn | Characters | Frames | Rate |
    |---|---|---|---|
    | Clip 4 Q1 | 216 | 22 | ≈ 295 chars/s |
    | Clip 4 Q2 | 110 | 18 | 183 chars/s |
    | Clip 5 Q1 | 138 | 22 | 188 chars/s |
    | Clip 5 C1 | 79 | 14 | 169 chars/s |

    Clip 4 Q1 is 34 words with about 2 s on screen before the click. Shorten
    rather than retime:
    - **Clip 4 Q1:** "Monthly KPI returns: 8 columns. Is it contractual — does a payment
      or the scorecard hang on it?" The 8 columns already land in the step-2
      summary.
    - **Clip 5 Q1:** "Package commentary: is it contractual — does a payment or a
      condition hang on it?"
14. **Cursor lead-in rule.** The master (§4.8) says the cursor appears 10–16
    f before a click and travels 14–20 f. These cursors break it:

    | Clip | Shot / click | Gap or travel |
    |---|---|---|
    | 1 | Shot 7 click | 18 f |
    | 2 | Click at 90 | 18 f |
    | 2 | Click at 450 | 18 f |
    | 3 | Click at 232 | 18 f |
    | 4 | Clicks at 320, 406, 576 | 20 f |
    | 5 | Click at 366 | 20 f |
    | 5 | Click at 492 | 18 f |
    | 5 | Clicks at 284, 420, 590 | 8–12 f travel |

    Simplest fix: change §4.8 to "appears 10–20 f before a click; travels
    8–20 f".
15. **Camera rules.** Clip 3 shot 2's "slow push" is 29 f (180–209), against
    the rule of 60–90 f. Either call it a push-to-detail (`ease.out`) or
    start it at 150. Clip 2 shot 3 pushes to ×1.12, against the max of
    ×1.08. Use 1.08, or note the exception. Clip 2 shot 4's slow push has
    no frames: use **336–419**.
16. **Clip 3 shot 4 camera scale.** It mixes Float scale and Camera scale
    ("1.25 → 1.9"). Camera keys should read **1.0 → 1.52** (1.9 ÷ 1.25),
    with the Float staying at 1.25.
17. **PhraseLift spills past shot 3.** In clips 4 and 5, p4 lifts at 222
    and takes 24 f, so it arrives at 246, past the 244 boundary. That is
    harmless, since frames are absolute, but say so, or start p4 at 220.
18. **SlideDeck stagger conflict.** The master §5.4 says 5 f, clip 5 says
    4 f, and the master says it wins on props. Add a `stagger` prop
    (default 5) and set 4 in clip 5.
19. **Slide type sizes conflict.** The master `Slide` uses title 56 / body
    24. Clip 5 uses package title 52, body 26, title-slide 64. Make the
    master defer: "sizes per kind as in video-05".
20. **Package slide vertical layout is missing.** Specify it on the 1600 ×
    900 slide:

    | Element | Position |
    |---|---|
    | Title row | Baseline y 120 |
    | Left column chart | y 200–560 |
    | Budget line | y 610 |
    | Right column | x 760–1552 |
    | Block labels | y 200, 400 and 600 |
    | Footer | Baseline y 852 |
21. **TitleCard width risk.** "Infrastructure runs on *documents*." is 34
    characters. At Source Serif 4 96 px, that is about 1,530–1,600 px, over
    the 1,500 px max, with no full stop to break at. Add the rule: "if one
    line overflows 1,500 px, step the size down to 88 px, then 80 px; never
    wrap mid-sentence". Render-check all 13 cards.
22. **FilmClose wordmark position is ambiguous.** "40 px below where the
    line was": state **wordmark centre y = 580** (the original line centre,
    540, plus 40).

**Design tokens and fonts**

23. **Shimmer midpoint.** `#f7f6f3` is not a token. The kit's `.skeleton`
    uses sunken `#efeeeb` → neutral.50 `#faf9f7` → `#efeeeb`. Use `#faf9f7`.
24. **What exists and what does not.** Every other hex in master §4.6
    exists in `design-tokens.json`. `#2c2b28` (prose) exists only in the
    kit's `tokens/colors.css` as `--text-prose`, which is fine. The seat
    colours (`#6d5dd3`, `#159a74`, `#8a6d3b`) are **not tokens**. They come
    from `docs/architecture/user-stories-walkthrough.html`, where
    `#8a6d3b` is "external", not "supplier". Cite that file in §4.6 so a
    later reader doesn't think they were invented.
25. **Fonts.** Source Serif 4 matches the kit, which loads weights
    400/500/600. Note that the system's page titles (`display.lg`) are
    weight **500**, not 400. Inter is in `design-tokens.json`'s sans stack
    but not in the kit's `fonts.css`, which uses the system stack. Inter and
    JetBrains Mono, for SF Mono, are reasonable deterministic stand-ins;
    state that as a deliberate deviation.

**Real-world names (WebSearch, 2026-10-04)**

26. The names checked:

    | Name | Result |
    |---|---|
    | Netherfold Cabling | No match |
    | Ashcombe Civils | No match. Only an unrelated "Ashcombe Ltd" and "Ashcombe Advisers" exist. |
    | Wrenfield Plant Hire | No match |
    | Calder & Hale | No real firm. One unrelated fictional use on GitHub. |
    | Trentmoor Energy | No match. "Trent Energy" exists; the distance is acceptable. |
    | Redgate Ecology | No UK firm. "Redgate" the software company is unrelated. |
    | Owen Vance | Only a US person |
    | Sam Kerridge | Only an Australian footballer and an NZ developer |

    Two to act on:
    - **Brookside Fencing & Reinstatement:** there is no exact match, but
      "Brookside" is a common UK trading name in fencing. Brookside Drives &
      Patios sells fencing in Essex, and Brookside Nurseries does fencing in
      Lancashire. Replace it with **"Wrenbrook Fencing & Reinstatement"**,
      which had no hits and is built from the world's own place names.
    - **Rachel Bowen:** there is a real "Rachael Bowen" at ERM, a UK
      environmental consultancy, in the same sector. The spelling differs
      and the seed name is long-established, so this is low risk. If the
      owner wants zero sector overlap, rename the client seat in
      `wrenfield.ts` only (for example "Rachel Bowley"), knowing the
      screenshots keep the seed name.

    Ashcombe, Wrenfield and Netherfold are real or plausible English place
    names (Ashcombe is a Devon parish). Company names built from them are
    fine as long as no real firm carries them, and none does today.
