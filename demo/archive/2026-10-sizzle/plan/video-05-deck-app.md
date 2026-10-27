# Video 05: the progress-pack app (commentary + spreadsheet → slide deck)

**Purpose.** The second app, and the consultancy's own. Package leads type
their commentary into a screen the app provides; a spreadsheet supplies the
numbers. Each month the app drafts a slide deck: one slide per package, with
the lead's own words and the spreadsheet's figures, visibly traced to each.
The build is chat-led as in clip 4, but the payments question gets the other
honest answer ("No — it's working notes"). The deck lands as a draft for
review; a person issues it.

**Seats.** Eleanor Price, Calder & Hale, builds. Owen Vance, Calder & Hale,
types commentary (vision casting: the seed casts him as internal QA; noted in
`wrenfield.ts`).

**Durations.** Body: standalone **779 f**, film **663 f** (shots 6–7 dropped,
plus a film-only tick sweep in shot 5). Standalone 899 f (30.0 s) = 30 + 779 +
90. Film frames 2667–3329.

**EndCard line (standalone):** "Every month, a draft *deck*."

Frames are body-local; standalone = +30. The builder stage layout is exactly
as in [video-04-kpi-app.md](video-04-kpi-app.md) "The builder stage" (shots
3–5 layout throughout; no preview pane in this clip), with these header
values: label "Tools / App builder / **Monthly progress pack**"; Badge
`neutral` "Draft — not yet open to anyone" (→ `success` "Open to Calder & Hale");
Badge `success` "Member".

## Fixed copy

**Prompt** (10 words, 69 characters):
`Monthly deck from package leads' commentary and our cost spreadsheet.`
Placeholder "Describe the app you want…". Author line "Eleanor Price · Calder & Hale".

**Words to workflow:**

| id | Phrase | Lands on |
|---|---|---|
| p1 | "Monthly" | step-5 When it runs |
| p2 | "deck" | step-6 What it writes |
| p3 | "package leads'" | step-1 Who it's for |
| p4 | "commentary" | step-2 What gets collected |
| p5 | "cost spreadsheet" | step-3 Where the numbers come from |

**Step summaries** (Greek'd; data): 1 "Calder & Hale package leads" · 2 "Package
commentary; Programme & cost figures; no sign-off" · 3 "Wrenfield–Ashcombe cost
& programme.xlsx, read only" · 4 "Commentary screen: package leads" · 5 "Every
month, on the 1st working day" · 6 "One slide per package, then a summary; runs as
Eleanor Price on 2 tables" · 7 "Open to Calder & Hale".

**Chat:**

| Id | Kind | Text | Replies (chosen in bold) |
|---|---|---|---|
| C1 | agent | "Connect the spreadsheet so nobody retypes numbers." (7) | |
| F1 | file | name label "Wrenfield–Ashcombe cost & programme.xlsx"; meta Greek'd (data: "In Calder & Hale — project sandbox · Sheet: Sep 2026 · 4 rows"); secondary button **"Connect"** | |
| RM | receipt | "✓ 5 of 5 columns matched · read only" | |
| Q1 | question | "Will payments depend on this commentary?" (6) | "Yes" · **"No — it's working notes"** |
| R2 | receipt | "✓ Commentary screen: package leads only" | |
| Q3 | question (standalone) | "Run as you, Eleanor, on these two tables only?" (9) | **"Yes — only these"** · "Change it" |
| R3 | receipt (standalone) | "✓ Runs as Eleanor Price, on 2 tables" | |

Column mapping (data only, not shown): Package → Package · Plan % → Planned %
complete · Act % → Actual % complete · Budget (£k) → Budget £k · Fcst (£k) →
Forecast £k.

**Read-back (standalone):** line 0 sharp **"Open to Calder & Hale package
leads"**; Greek'd lines "Numbers from the cost spreadsheet, read only" · "Each
deck lands as a draft for review". Primary **"Open to Calder & Hale"**.

**Commentary screen** (RowForm, native 360 wide, scale 2.4): title label "Write
this month's commentary"; label "September 2026"; fields:

| Field | Shown as | Value |
|---|---|---|
| Package | choice label | "Ashcombe Brook crossing" |
| Progress this month | Greek'd | "Launch pit complete. Drill rig mobilised." |
| Key risks | **typed, focal** (9 words) | **"Perched water in the launch pit after heavy rain."** |
| Decisions needed | Greek'd | "Confirm night working for the pull-back." |
| Status | Badge `danger` pill | "Behind" |

Primary "Save"; after save, label "Saved".

**App home card** (native 380 wide, scale 2.4): title label "Monthly progress
pack"; label "September 2026 · 4 of 4 packages written"; primary **"Generate
September's pack"**.

**Saved strip** (overlay outside the Camera, white pill bar, pane shadow,
Inter 22, centred x 960, **y 1024**, height 56): Lucide `file-text` icon, label
**"Saved as a draft for review"**, secondary button **"Download PowerPoint"**.

## Data

**Programme & cost figures** (the spreadsheet):

| Package | Planned % | Actual % | Budget £k | Forecast £k | Status |
|---|---|---|---|---|---|
| Cable route — Netherfold to Wrenfield | 46 | 44 | 18,400 | 18,650 | At risk |
| Wrenfield substation works | 38 | 39 | 12,200 | 12,050 | On track |
| Ashcombe Brook crossing | 30 | 22 | 4,800 | 5,260 | Behind |
| Reinstatement | 5 | 4 | 2,100 | 2,100 | On track |
| **Total** | | | **37,500** | **38,060** (+1.5 %) | 2 on track · 1 at risk · 1 behind |

**Package commentary** (the leads' words; quoted on the slides, attributed
uniformly "— package lead"):

| Package | Progress this month | Key risks | Decisions needed |
|---|---|---|---|
| Cable route — Netherfold to Wrenfield | 4.2 km of 9.6 km of duct laid. | Wet ground is slowing trenching near Netherfold. | Agree the haul road crossing at Ashcombe Lane. |
| Wrenfield substation works | Bay foundations poured; steel erection started. | Transformer delivery slot not yet confirmed. | None this month. |
| Ashcombe Brook crossing | Launch pit complete. Drill rig mobilised. | Perched water in the launch pit after heavy rain. | Confirm night working for the pull-back. |
| Reinstatement | Field drain survey complete on 3 of 11 parcels. | Drain records are incomplete for the Netherfold parcels. | None this month. |

## The deck

Six slides; each `Slide` renders at **1600 × 900 native**, white, 48 px
margins; shown in the grid at 0.25. **Type sizes here win over the master.**
Footer on every slide, baseline y 852, Inter 16 `#78766f`: left "Data as at 30
Sep 2026 · Programme & cost figures, Package commentary", right "n / 6". Never
an AI label.

| n | Kind | Content |
|---|---|---|
| 1 | title | Serif 64 (500) "Wrenfield–Ashcombe 400kV Connection", baseline y 380; serif 40 muted "Progress, September 2026", y 460; Inter 24 muted "Monthly progress pack · Calder & Hale for Trentmoor Energy", y 520. |
| 2–5 | package | One per package in table order (2 Cable route, 3 Substation, 4 **Brook crossing**, 5 Reinstatement). Layout below. |
| 6 | summary | Title "Summary" (baseline y 120). Inter 30: "4 packages · 2 on track · 1 at risk · 1 behind" (y 200); "Forecast £38,060k against budget £37,500k (+1.5%)" (y 250). Grouped horizontal BarChart planned vs actual for all four packages, x 48–1000, y 320–800. Right column x 1060–1552: label "DECISIONS NEEDED (2)" (y 320) and the two decisions (Inter 26). |

**Package slide layout** (1600 × 900):

| Element | Position and type |
|---|---|
| Title | Source Serif 4 52 px, weight 500, baseline y 120, x 48; status Badge at 2× (23 px text) right of the title, same baseline. Badge tones: On track `success`, At risk `warning`, Behind `danger`. |
| Chart | Left column x 48–688, y 200–560: BarChart "Planned vs actual, % complete", two horizontal bars (Planned `#78766f`, Actual `#1c1b18`; slide 4's Actual bar `#c4901f`), value labels Inter 24. |
| Budget line | Inter 32, baseline y 610, x 48: "Budget £{b}k · Forecast £{f}k" (slide 4: "Budget £4,800k · Forecast **£5,260k (+£460k)**"). Slide 4 only: Inter 20 `#78766f` label "from cost & programme.xlsx" at baseline y 650. |
| Right column | x 760–1552. Micro labels (Inter 14, 600, uppercase, 0.6 px tracking, `#78766f`) at y 200 "PROGRESS", y 400 "KEY RISKS", y 600 "DECISIONS NEEDED". Text Inter 26 under each. The key risk is a quote in Source Serif 4 italic **34 px** with "— package lead" (Inter 20 muted) beneath. |
| Footer | Baseline y 852 (above). |

At the final push (Camera ×3.8 on a 0.25 thumbnail = 0.95 effective) the quote
reads at 32 px and the budget line at 30 px.

## Shots

| # | Standalone | Film | On screen | Motion / camera | Text | Components |
|---|---|---|---|---|---|---|
| 1 | 0–59 | 0–59 | Field. Title card. | WordReveal, cut. | Card: "Commentary in. A *deck* out." | TitleCard |
| 2 | 60–143 | 60–143 | PromptHero (x 960, y 460). | Enters 60. Placeholder to 64. TypedText **64–96**; focal 64–143 (80 f = 10 words). Send press **108**. | Prompt. | PromptHero, TypedText |
| 3 | 144–201 | 144–201 | Words to workflow. | Highlights p1 **144**, p2 147, p3 150, p4 153, p5 **156**. 156–170: PromptHero shrinks into the first user bubble (Greek'd from 172); ChatPanel 158, StepRail 162, BuilderHeader 162. PhraseLift (20 f) p1 **168**→step-5, p2 171→step-6, p3 174→step-1, p4 177→step-2, p5 **180**→step-3; last arrives 200. | Labels only. | PromptHero, Highlight, PhraseLift, ChatPanel, StepRail, BuilderHeader |
| 4 | 202–277 | 202–277 | The spreadsheet connects. | Step 1 done **204**. C1 reveals 204–221; focal 204–259 (56 f). F1 file card at **223**. Cursor show **240** at (900, 1010), travel 240–254 to "Connect" (≈ (980, 700)), **click 256**, hide from 264. Step 3 shimmer 256; RM receipt and step 3 done **262**. | C1. | ChatPanel (agent, file, receipt), Button, Cursor, StepRail |
| 5 | 278–357 | 278–357 | The payments question. | Q1 reveals 280–294; focal 280–327 (48 f). Step 2 waiting 280. Replies 296. Cursor show **318** at (900, 1010), travel 318–334 to reply 2 (≈ (560, 760)), **click 336**, hide from 344. Bubble **344**. Step 2 done **348**; R2 350; step 4 done **352**; step 5 done **354**. **Film only:** step 6 done 356, step 7 done 357, header badge flips to "Open to Calder & Hale" at 357. | Q1. | ChatPanel, StepRail, Badge, Button, Cursor |
| 6 | 358–433 | — (dropped) | Q3 (standalone). | Q3 reveals 360–375; focal 360–431 (72 f). Step 6 waiting 360. Replies 377. Cursor show **406** at (900, 1010), travel 406–422 to reply 1 (≈ (300, 860)), **click 424**, hide from 432. Bubble **432**; R3 and step 6 done **433**. | Q3. | ChatPanel, StepRail, Button, Cursor |
| 7 | 434–473 | — (dropped) | The human gate (standalone). | FocusBlur from 434; ReadBack enters 434 (Float x 960, y 560, scale 2.4). Line 0 focal 438–465 (28 f ≥ 24, recap). Cursor show **448** at (1300, 960), travel 448–462 to the primary (≈ (960, 800)), **click 464**, hidden at 473. Badge flips and step 7 done at **470**. | Line 0. | FocusBlur, ReadBack, Button, Badge, Cursor |
| 8 | 474–518 | 358–402 | Field. Mid-card. | WordReveal, cut. | Card: "Their words. Your *numbers*." | TitleCard |
| 9 | 519–594 | 403–478 | A package lead writes in the app. | Hard cut. RowForm (Float x 960, y 580, scale 2.4) enters 519. SeatLabel `consultant` "Calder & Hale · Owen Vance, package lead" at (960, 90), 521. Key risks TypedText **525–549**, Highlight wipe on the typed text at 552; focal 523–594 (72 f). "Save" press **580** (keyboard); label "Saved" 584. | Key risk. | Float, RowForm, TypedText, Highlight, Badge, Button, SeatLabel |
| 10 | 595–766 | 479–650 | The deck. | Home card enters 595 (Float x 960, y 540, scale 2.4). Cursor show **596** at (1300, 900), travel 596–610 to "Generate September's pack" (≈ (960, 640)), **click 612**, hide from 620. Card fades 614–620. SlideDeck (`stagger 4`) enters at **618**, 622, 626, 630, 634, 638 (3×2 grid centred at (960, 540)). Push-to-detail **640–663**: Camera 1.0 → **3.8** centred on slide 4 (≈ (536, 664)), `ease.out`; slide 4 spans 1520 × 855, y 112–967. Quote Highlight wipe **664**; quote focal 664–735 (72 f). Forecast Highlight **736** on "£5,260k (+£460k)" with its "from cost & programme.xlsx" label; held to 766 (31 f, labels). Saved strip fades in at **744**. | Quote; forecast label. | Float, Button, Cursor, SlideDeck, Slide, BarChart, Badge, Highlight, Camera |
| 11 | 767–778 | 651–662 | Fade to field. | FadeOutToField (strip fades with it). | — | FadeOutToField |

Contiguity, standalone: 0–59, 60–143, 144–201, 202–277, 278–357, 358–433, 434–473, 474–518, 519–594, 595–766, 767–778 → 779 f. Film: 0–59, 60–143, 144–201, 202–277, 278–357, 358–402, 403–478, 479–650, 651–662 → 663 f. Film frame = standalone − 116 for every frame ≥ 474.

## Notes for the film cut

- The film has just seen clip 4's third question and gate, so clip 5's film
  cut drops them and ticks steps 6 and 7 in one sweep after the payments
  question. The payments question stays: its honest "No" is new information.
- Body ends on the field; the Montage follows.

## Honesty notes

- A slide-deck output is the owner's vision (export is ruled as Excel or Word,
  ADR-0056 §8). The bridge is on screen: "Saved as a draft for review", and a
  person issues it.
- Live connections are ruled but deferred to deployment (ADR-0057). The file
  is a sandbox file the app reads (ADR-0056 §9); no key, URL or credential
  appears. "read only" is the only connection detail.
- Risks on the slides are quoted from the leads' commentary, never invented by
  the model. Spreadsheet figures carry a plain-text origin label, never a
  source pill.
- The footer names the data and its date; never "Generated by AI".
