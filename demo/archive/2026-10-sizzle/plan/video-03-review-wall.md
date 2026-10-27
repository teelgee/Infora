# Video 03: review across the ethical wall

**Purpose.** The differentiator in two seconds: client and consultant look at
the same review at the same moment and see different things. Trentmoor
Energy's reviewer is commenting; Calder & Hale sees only that Trentmoor is
still reviewing. When Trentmoor releases the comments, they arrive together.
They are answered, and the accepted document becomes something the AI may
cite, which hands the film to the app half.

**Seats.** Left: Rachel Bowen, Trentmoor Energy (lead reviewer). Right:
Eleanor Price, Calder & Hale (lead author).

**Durations.** Body: standalone **652 f**, film **532 f** (shot 5 dropped).
Standalone 772 f (25.7 s) = 30 + 652 + 90. Film frames 1235–1766.

**EndCard line (standalone):** "Only accepted work feeds the *AI*."

Frames are body-local; standalone = +30.

## Fixed copy and data

**Split panes.** Two Floats, each a cropped review screen at **scale 2.4**,
native 358 × 330 (on screen 859 × 792), centred at **x 510 and x 1410**, y 580
(spans 80–940 and 980–1840, 40 px gutter, 80 px margins; y 184–976).
SeatLabels centred above each pane at y 120:

- left `client`: "Trentmoor Energy · Rachel Bowen, lead reviewer"
- right `consultant`: "Calder & Hale · Eleanor Price, lead author"

**Both crops, top (labels):** the reference `WA-EIA-MST-001` Greek'd; title
label "EIA Scoping Method Statement — Land Quality"; ProgressBar4 `compact`,
labels "Submitted · In review · Responding · Complete", current 2. (No round
label, no review-period meta, no "Cycle active".)

**Left crop (Rachel), below the bar**, top to bottom:

- Counter label "Open · 2 comments" (from 60) → "Open · 3 comments" (at 110)
- Comment A (CommentCard, body Greek'd; code badge Greek'd)
- Comment B: a composer that types, then becomes a card at 110
- Comment C (collapsed, Greek'd)
- "Deliverable verdict" select, Greek'd and blurred (value unreadable)
- Primary button **"Release comments to Calder & Hale"**

**Right crop (Eleanor), below the bar:** WithheldNotice (warning tint), 12 words:
**"Trentmoor is still reviewing. You'll see every comment when they release them."**

**Comments (data; only B's body is ever focal):**

| | Author | When | Quote | Body |
|---|---|---|---|---|
| A | Rachel Bowen | Sep 02, 2026, 08:28 AM | “Asbestos in soils” — p.1 | Confirm the screening frequency for parcels with made ground. |
| C | Rachel Bowen | Sep 02, 2026, 08:34 AM | “ground gas migration” — p.1 | Say which parcels need ground gas monitoring, and for how long. |
| B | Rachel Bowen | Sep 02, 2026, 08:41 AM | “Conceptual site model” — p.1 | **State the made ground depth for each parcel.** (8 words) |

Code badges (the seed's S0) exist in the data but are always Greek'd.

**After release (right crop):** counter label "Responding · 3 comments to
answer"; three CommentCards (authors and quotes as labels, bodies Greek'd).
Both progress bars: step 2 done (black check), step 3 current.

**Response (shot 5, standalone only), under comment B:**

- Counter label "Responding · 2 of 3 comments answered" (A and C carry
  "Answered" badges, Greek'd), flipping to "3 of 3 comments answered" at 424
- Composer typed (10 words): **"Done — section 3 now gives the depth for each parcel."**
- Chip label: "Fixed in revision 2, section 3"
- Primary sm "Respond"; comment B Badge `success` "Answered"

**Payoff card (shot 7)**, native 640 wide at scale 2.4: one library row —
reference Greek'd · title label "EIA Scoping Method Statement — Land Quality"
· revision Greek'd · Badge `info` "In review" → `success` **"Accepted"**.
Under it, in order:

1. Line (6 words) **"Accepted by Rachel Bowen, Trentmoor Energy"** with label "29 Sep 2026"
2. Label with Lucide `book-open`: "In the project library"
3. Line (6 words) **"The AI can now cite this."** with SourceChip `WA-EIA-MST-001`

## Shots

| # | Standalone frames | Film frames | On screen | Motion / camera | Text and UI copy | Components |
|---|---|---|---|---|---|---|
| 1 | 0–59 | 0–59 | Field. Title card. | WordReveal, cut. | Card: "One review. Each firm *walled*." | TitleCard |
| 2 | 60–227 | 60–227 | **Split screen.** | Panes enter 60 (left) and 66 (right); SeatLabels 62 / 68. **60–129 left focal** (right pane blurred): TypedText of comment B **64–94**; "Comment" press 104 (keyboard); B becomes a card at **110**; counter flips to "3 comments" at 110; B's body focal 64–129 (66 f ≥ 64). **130–227 right focal** (left blurred; B's body Greeks): the notice, 98 f ≥ 96. Slow push 1.00 → 1.05 over 150–227 (78 f), centred on the notice. | Comment B; notice. | Float, SeatLabel, ProgressBar4, CommentCard, TypedText, WithheldNotice, FocusBlur, Camera |
| 3 | 228–272 | 228–272 | Field. Mid-card 1. | WordReveal, cut. | Card: "Comments arrive *together*." | TitleCard |
| 4 | 273–362 | 273–362 | Split again, both panes at labels-only (no line). | Hard cut. Cursor show **276** at (760, 1040), travel 276–292 to the release button (≈ (510, 928)), **click 294**, hide from 302. At **300** both ProgressBar4s advance (`ui`). Right: notice fades 300–308; CommentCards slide in (opacity + translateY 12 → 0) at **308, 314, 320**; counter label "Responding · 3 comments to answer" at 308. Left pane dims to 0.6 from 310. | Labels only. | Cursor, Button, ProgressBar4, CommentCard |
| 5 | 363–482 | — (dropped) | Eleanor's seat alone. | Left pane and its SeatLabel exit left 363–372 (translateX −120, opacity → 0). Right pane moves to x 960, 363–381 (`ease.inOut`); right SeatLabel follows to (960, 120). Push-to-detail: **Camera 1.0 → 1.25** (Float stays 2.4; effective 3.0) over 363–387, centred on comment B. TypedText of the response **371–403**; focal 369–448 (80 f). Chip at 410. "Respond" press **418** (keyboard). Counter → "3 of 3 comments answered" and B's "Answered" badge at **424**. Hold to 482. | Response line. | Camera, CommentCard, TypedText, Button, Badge, SeatLabel |
| 6 | 483–527 | 363–407 | Field. Mid-card 2. | WordReveal, cut. | Card: "Answered. Then *accepted*." | TitleCard |
| 7 | 528–639 | 408–519 | Payoff card (Float x 960, y 520, scale 2.4). | Card enters 528 (film 408). Badge flip **540** (film 420). Line 1 focal **544–591** (film 424–471), 48 f. Label "In the project library" at 592 (film 472). Line 2 focal **592–639** (film 472–519), 48 f; SourceChip pops 600 (film 480), `activeAt` 612 (film 492). Slow push 1.00 → 1.05 over 560–639 (film 440–519), 80 f. | Lines 1 and 2. | Float, Badge, SourceChip, Camera |
| 8 | 640–651 | 520–531 | Fade to field. | FadeOutToField. | — | FadeOutToField |

Contiguity, standalone: 0–59, 60–227, 228–272, 273–362, 363–482, 483–527, 528–639, 640–651 → 652 f. Film: 0–59, 60–227, 228–272, 273–362, 363–407, 408–519, 520–531 → 532 f. Film frame = standalone − 120 for every frame ≥ 483.

## Notes for the film cut

- The film goes from "comments arrive" straight to "Answered. Then *accepted*."
  The card carries the answering; the response shot lives in the standalone.
- Line 2, "The AI can now cite this.", is the hinge into clip 4.

## Honesty notes

- The client never sees agent runs or drafting history; Rachel's crop shows
  only the document, comments and progress.
- The notice is amber and states the withholding. A director reads it as "the
  client is still reviewing", not "the client hides comments".
- Closing a review requires a verdict in the product; the select is drawn,
  Greek'd, so the step is not implied away.
- "Accepted" is shown with who accepted it and when.
- The verb is "accept", never "approve".
