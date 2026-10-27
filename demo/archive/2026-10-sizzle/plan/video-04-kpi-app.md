# Video 04: the supplier-KPI app, built by asking

**Purpose.** The owner's headline ask. Rachel describes an app in one
sentence; the phrases lift into the steps. The agent asks the three questions
that matter, in plain words. Each is answered with one tap and ticks its step.
Rachel then changes the app in her own words. She reads it back and opens it.
Payoff: the **same dashboard** seen by Trentmoor Energy and by Netherfold
Cabling, side by side, with different numbers.

**Seats.** Rachel Bowen, Trentmoor Energy (owner), builds. Sam Kerridge,
Netherfold Cabling, is the second seat.

**Durations.** Body: standalone **780 f**, film **900 f** (inserts mid-card A
and the insight beat). Standalone 900 f (30.0 s) = 30 + 780 + 90. Film frames
1767–2666.

**EndCard line (standalone):** "Same app. Different *seats*."

Frames are body-local; standalone = +30.

## The builder stage (shared with video 05)

| Element | Screen rect (x, y, w, h) | Native at scale | Contents |
|---|---|---|---|
| BuilderHeader | 120, 48, 1680, 56 | Inter 22 direct | Left label "Tools / App builder / **Supplier KPI returns**". Right: Badge `neutral` pill "Draft — not yet open to anyone" (→ `success` "Open to 5 organisations" at publish), Badge `info` pill "Owner". |
| ChatPanel (shots 3–5) | 120, 136, **1120**, 864 | 467 × 360 at **2.4** | Header label "The builder's agent"; turns; composer "Ask the agent, or tell it what to change…". |
| StepRail (shots 3–5) | **1320**, 136, **480**, 864 | 267 × 480 at 1.8 | Micro label "STEPS"; seven rows with plain titles (master §4.9); a done row shows a black tick and one Greek'd summary line. |
| ChatPanel (shots 6–7) | 120, 136, **720**, 864 | 300 × 360 at 2.4 | Same panel, narrowed. Header gains the 7-dot progress strip ("5 of 7" → "7 of 7"). |
| Preview pane (shots 6–7) | 880, 160, 920, 762 | Dashboard 774 × 640 at 1.19 | Label "Preview · no returns yet", then the empty dashboard. |

The StepRail exits during shot 6 (opacity → 0, 372–380); its progress lives
on in the chat header's dot strip.

**Step summaries** (Greek'd on screen; kept here for the data file): 1
"Trentmoor Energy + 4 suppliers" · 2 "Monthly KPI returns, 8 columns, sign-off by
Trentmoor" · 3 "None needed" · 4 "Dashboard: each organisation sees its own" · 5
"Every month, on the 1st" · 6 "Runs as Rachel Bowen, on 2 tables" · 7 "Open to
5 organisations". The 8 columns: Month, Deliveries due, Delivered on time,
NCRs, Safety incidents, Carbon (tCO2e), Local spend (£), Notes.

## Fixed copy

**Prompt** (10 words, 67 characters):
`Monthly supplier KPI returns, with a dashboard and written summary.`
Placeholder "Describe the app you want…". Author line "Rachel Bowen · Trentmoor Energy".

**Words to workflow:**

| id | Phrase | Lands on (plain title) |
|---|---|---|
| p1 | "Monthly" | step-5 When it runs |
| p2 | "supplier" | step-1 Who it's for |
| p3 | "KPI returns" | step-2 What gets collected |
| p4 | "a dashboard" | step-4 What people see |
| p5 | "written summary" | step-6 What it writes |

**Chat** (agent lines ≤ 12 words; user bubbles that echo a tapped reply count as labels):

| Id | Kind | Text | Replies (chosen in bold) |
|---|---|---|---|
| Q1 | question | "Will payments depend on these numbers?" (6) | **"Yes — Trentmoor signs off each return"** · "No" |
| R1 | receipt | "✓ Monthly return form, with sign-off" | |
| Q2 | question | "Who should see the dashboard?" (5) | "Trentmoor only" · **"Everyone — each sees only their own"** |
| R2 | receipt | "✓ Dashboard: each organisation sees its own" | |
| U3 | user, typed | "Flag any supplier under 90% on time." (7) | |
| A3 | agent | "Done — added to the dashboard." (5) | |
| Q3 | question | "Run as you, Rachel, on these two tables only?" (9) | **"Yes — only these"** · "Change it" |
| R3 | receipt | "✓ Runs as Rachel Bowen, on 2 tables" | |

**Read-back** (heading "Check and open"; line 0 sharp as a recap, lines 1–2 Greek'd):
0 **"Open to Trentmoor and 4 suppliers"** · 1 "Suppliers submit; Trentmoor signs off" · 2 "Runs monthly as Rachel, on these returns only". Primary **"Open to 5 organisations"**. No playbook button.

## Data (accepted returns; the only figures any dashboard may show)

| Supplier | Month | Due | On time | NCRs | Safety | Carbon tCO2e | Local spend £ |
|---|---|---|---|---|---|---|---|
| Netherfold Cabling | Sep 2026 | 28 | 27 | 2 | 0 | 61 | 84,200 |
| Ashcombe Civils | Sep 2026 | 40 | 34 | 3 | 1 | 52 | 126,500 |
| Wrenfield Plant Hire | Sep 2026 | 22 | 21 | 1 | 0 | 21 | 38,900 |
| Wrenbrook Fencing & Reinstatement | Sep 2026 | 12 | 11 | 0 | 0 | 8 | 22,400 |
| **Total, Sep** | | **102** | **93** (91.2 %) | **6** | **1** | **142** | **272,000** |
| Netherfold Cabling | Aug 2026 | 26 | 25 | 2 | 0 | 64 | 79,600 |
| Ashcombe Civils | Aug 2026 | 34 | 31 | 3 | 0 | 55 | — |
| Wrenfield Plant Hire | Aug 2026 | 17 | 16 | 1 | 0 | 25 | — |
| Wrenbrook Fencing & Reinstatement | Aug 2026 | 9 | 9 | 0 | 0 | 10 | — |
| **Total, Aug** | | **86** | **81** (94.2 %) | **6** | | **154** | |

(August local spend is not shown anywhere except Netherfold's; leave the others undefined.)

- Carbon by month, all suppliers: Jun **171** · Jul **163** · Aug **154** · Sep **142**; since June **630**. Per supplier Jun/Jul/Aug/Sep: Netherfold 70/67/64/61 (262) · Ashcombe Civils 58/56/55/52 · Wrenfield Plant Hire 31/29/25/21 · Wrenbrook 12/11/10/8.
- On time by supplier, Sep (rounded %): Netherfold 96 · Ashcombe Civils **85** (flagged) · Wrenfield Plant Hire 95 · Wrenbrook 92.
- Netherfold's own rows: Sep 28/27/2/0/61/84,200 · Aug 26/25/2/0/64/79,600 · Jul 24/24/1/0/67/71,300 · Jun 22/21/1/0/70/66,800, all Accepted.

**Dashboard** (`Dashboard`, native **774 × 640**):

| Row | Content | Native height |
|---|---|---|
| pad | | 24 |
| 1 | Title "Supplier KPI dashboard" (serif 24, weight 500); label "October 2026 · accepted returns only" | 40 |
| gap | | 12 |
| 2 | Three KpiTiles 242 × 72, 12 gaps | 72 |
| gap | | 12 |
| 3 | BarChart 250 × 190 · LineChart 250 × 190 · donut 226 × 190 | 190 |
| gap | | 12 |
| 4 | InsightCard, full width | 96 |
| gap | | 12 |
| 5 | DataTable: header + 4 rows at 28 | 140 |
| pad | | 24 |

- KpiTiles (client): "On time · Sep 2026" → **"93 of 102"** · "Carbon · since June" → **"630 tCO2e"** (sub "4 months · accepted returns only") · "Local spend · Sep 2026" → **"£272,000"**.
- KpiTiles (Netherfold): **"27 of 28"** · **"262 tCO2e"** · **"£84,200"** (same labels and subs).
- BarChart "On time by supplier · Sep 2026, %", max 100; the client's has four bars, Netherfold's has one (96). `flagRule` Badge `warning` "Flags under 90% on time"; on data, Ashcombe Civils' bar turns `#c4901f` with Badge `warning` "Under 90% on time".
- LineChart "Carbon by month, tCO2e": 171, 163, 154, 142, trend on.
- Donut "Local spend by supplier · Sep 2026": the four values, centre "£272k".
- InsightCard (client only). Label (legible): **"Written 1 Oct · from accepted returns only"**. Meta (Greek'd; data): "Run 1 Oct 2026, 02:00 · scheduled · acted as Rachel Bowen over 16 rows in Monthly KPI returns". Text: "September's on-time delivery across four suppliers was 91%, down 3 points on August. **Ashcombe Civils accounted for 6 of 9 late deliveries.** Carbon fell 8% to 142 tCO2e. No supplier's NCR count rose by more than 10%." Only the bold sentence (8 words) is ever sharp.
- DataTable "All returns · September 2026": Organisation · Due · On time · NCRs · Safety · Carbon · State; the four Sep rows; State Badge `success` "Accepted".
- **Empty state** (shot 6 preview): tiles "—" with sub "no returns yet"; charts with axes and `#e0ded8` placeholder shapes at 40 %, no labels; InsightCard label "No runs yet"; table one muted row "No returns yet".
- **Payoff crop** (`crop: 'payoff'`): rows pad, 1, gap, 2 with `valueSize 52` (tiles 96 high), gap, 3 (bar chart only, 250 × 190, left-aligned), pad → native **774 × 398**.

**Note under Netherfold's crop** (info tint block, native 340 wide, 7 words): **"You see your own returns. Nothing else."**

## Shots

| # | Standalone | Film | On screen | Motion / camera | Text | Components |
|---|---|---|---|---|---|---|
| 1 | 0–59 | 0–59 | Field. Title card. | WordReveal, cut. | Card: "Describe an app. Watch it *build*." | TitleCard |
| 2 | 60–143 | 60–143 | PromptHero (x 960, y 460). | Enters 60 (0.94 → 1, 9 f). Placeholder to 64. TypedText **64–96**; focal 64–143 (80 f = 10 words). Send press **108** (keyboard). | Prompt. | PromptHero, TypedText |
| 3 | 144–203 | 144–203 | Words to workflow. | Highlights p1 **144**, p2 147, p3 150, p4 153, p5 **156** (6 f wipes). 156–170: PromptHero shrinks into the ChatPanel's first user bubble (`ease.inOut`, 14 f; bubble Greek'd from 172) as ChatPanel (158) and StepRail (162) enter (`panel`) and BuilderHeader fades in (162). PhraseLift (20 f each) p1 **168**→step-5, p2 171→step-1, p3 174→step-2, p4 177→step-4, p5 **180**→step-6; last arrives 200. | Labels only (step titles). | PromptHero, Highlight, PhraseLift, ChatPanel, StepRail, BuilderHeader |
| 4 | 204–287 | 204–287 | Q1. | Step 1 done **206**. Q1 reveals 208–221; focal 208–259 (52 f ≥ 48). Step 2 "Waiting for you" 208. Replies 223. Cursor show **246** at (900, 1010), travel 246–262 to reply 1 (≈ (420, 760)), **click 264**, hide from 272. Bubble **272**. Step 2 done **276**; R1 278; step 3 done **284**. | Q1. | ChatPanel, StepRail, Badge, Button, Cursor |
| 5 | 288–371 | 288–371 | Q2. | Q2 reveals 292–302; focal 292–335 (44 f ≥ 40). Step 4 waiting 292. Replies 304. Cursor show **330** at (900, 1010), travel 330–346 to reply 2 (≈ (560, 840)), **click 348**, hide from 356. Bubble **356**. Step 4 done **360**; R2 362; step 5 done **368**. | Q2. | ChatPanel, StepRail, Badge, Button, Cursor |
| A | — | 372–416 | Field. Mid-card A (film only). | WordReveal, cut. | Card: "Then just *ask* for changes." | TitleCard |
| 6 | 372–495 | 417–540 | Preview, then Rachel's own words. | (Film = standalone + 45 for all of shots 6–9.) 372–386: ChatPanel narrows to 720; StepRail fades out 372–380; Preview pane enters 378 (`panel`). Empty blocks enter **384, 388, 392, 396, 400, 404** (tiles row, bar, line, donut, insight slot, table). Composer TypedText **400–418**; U3 focal 400–455 (56 f). Send press **430** (keyboard); U3 becomes a bubble at 430. A3 reveals 456–466; focal 456–495 (40 f). Bar chart `flagRule` Badge at **462**. No camera move; no cursor. | U3, then A3. | ChatPanel, ChatComposer, TypedText, Dashboard (empty), BarChart, Badge |
| 7 | 496–579 | 541–624 | Q3. | Q3 reveals 498–513; focal 498–569 (72 f). Replies 515. Cursor show **552** at (900, 1010), travel 552–566 to reply 1 (≈ (300, 860)), **click 568**, hide from 576. Bubble **576**. R3 and dot strip "6 of 7" at **578**. | Q3. | ChatPanel, Button, Cursor |
| 8 | 580–633 | 625–678 | The human gate. | FocusBlur from 580 (ChatPanel and Preview become context; header stays sharp). ReadBack enters 582 (Float x 960, y 560, scale 2.4). Line 0 focal 586–621 (36 f ≥ 24, recap). Cursor show **604** at (1300, 960), travel 604–618 to the primary (≈ (960, 800)), **click 620** (press), hide from 628. Header badge flips at **626**; dot strip "7 of 7". | Line 0. | FocusBlur, ReadBack, Button, Badge, Cursor, BuilderHeader |
| 9 | 634–678 | 679–723 | Field. Mid-card B. | WordReveal, cut. | Card: "Open it from *either* side." | TitleCard |
| I | — | 724–798 | Insight beat (film only). Trentmoor's full dashboard with data (Float x 960, y 560, scale 1.19). SeatLabel `client` "Trentmoor Energy · Rachel Bowen" at (960, 60). | Enters 724. Tiles count up 728–745. Push-to-detail: Camera 1.0 → **2.05** (effective 2.44) over 730–750, centred on the InsightCard. Focal sentence **734–798** (65 f ≥ 64). | "Ashcombe Civils accounted for 6 of 9 late deliveries." | Float, Dashboard, InsightCard, SeatLabel, Camera |
| 10 | 679–767 | 799–887 | **Two seats, same dashboard.** Two payoff crops (scale 1.11, 859 × 442) centred at **x 510 and x 1410**, y 400. SeatLabels: `client` "Trentmoor Energy · Rachel Bowen" at (510, 130); `supplier` "Netherfold Cabling · Sam Kerridge" at (1410, 130). Note Float (x 1410, y 760, scale 2.4). | Left crop + label enter 679 (film 799); right 685 (film 805). Tiles in both crops count up **simultaneously 692–709** (film 812–829); bars grow 692–709. Ashcombe Civils bar turns amber with its Badge at **712** (film 832), left crop only. Note Highlight wipe **712** (film 832); focal 712–767 (film 832–887), 56 f. Left crop dims to 0.6 from 716 (film 836). | Note. Tile values as data. | Float, Dashboard (payoff crop), KpiTile, BarChart, Badge, SeatLabel, Highlight |
| 11 | 768–779 | 888–899 | Fade to field. | FadeOutToField. | — | FadeOutToField |

Contiguity, standalone: 0–59, 60–143, 144–203, 204–287, 288–371, 372–495, 496–579, 580–633, 634–678, 679–767, 768–779 → 780 f. Film: …288–371, 372–416 (A), 417–540, 541–624, 625–678, 679–723, 724–798 (I), 799–887, 888–899 → 900 f. Film frame = standalone + 45 for 372–678, + 120 for ≥ 679.

## Honesty notes

- Chat-first building is the owner's vision, reopening ADR-0056's addendum
  ruling 6. What the ruling protected is shown: all three wall questions are
  asked (payments/sign-off, who sees, what a run may touch), each answered by
  a tap, each ticking its step.
- The preview is empty: a new app has no rows until suppliers submit.
- The tiles sum and count ("93 of 102"). Percentages (the bar chart, the
  90 % flag, the insight's 91 %) are vision beyond the built grammar. The
  insight's numbers are computed in code; the model writes the sentence. No
  AI stamp anywhere.
- Netherfold's crop shows only Netherfold's figures and **no insight**: the
  insight was written for Trentmoor and names other suppliers.
- The owner sees every supplier's accepted rows; a supplier sees its own.
  "Same app. Different *seats*." is true for both.
