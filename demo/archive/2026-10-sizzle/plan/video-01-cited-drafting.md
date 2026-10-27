# Video 01: cited drafting

**Purpose.** Answer the hook "Generic AI *guesses*." with proof. The agent
drafts one section of a real deliverable from the project's accepted library.
Every sentence carries a source; one opens to its page. A sentence with no
source is withheld, and the clip says so. An out-of-date version of the source
is never used. The person accepts; nothing lands without them.

**Seat.** Eleanor Price, Calder & Hale (lead author), in the Editor, on
`WA-EIA-MST-001` *EIA Scoping Method Statement — Land Quality*.

**Durations.** Body 723 f in both cuts. Standalone 843 f (28.1 s) = ClipOpen
30 + 723 + EndCard 90. Film frames 69–791.

**EndCard line (standalone):** "Every claim, cited to the *page*."

Frames are **body-local**; standalone = +30. Film cut = standalone body (no
differences).

## Fixed copy and data

**Prompt** (11 words, 76 characters):
`Draft section 2 from the accepted ground investigation and baseline reports.`

**Suggestion prose** (five segments, each ≤ 12 words, each ending in its pill;
every fact is in the seeded passage it cites, `packages/db/src/seed.ts`):

| # | Text | Source | Shown as |
|---|---|---|---|
| 1 | "Made ground reaches 2.4 m at Wrenfield Sidings." | `WA-GEO-GIR-004` | Greek + sharp pill |
| 2 | "PAHs were elevated in three of eleven trial pits." | `WA-GEO-GIR-004` | Greek + sharp pill |
| 3 | "Perched water at 1.6–2.1 m could migrate toward Ashcombe Brook." | `WA-GEO-GIR-004` | **Focal** at 393 |
| 4 | "Ashcombe Brook supports brown trout; its WFD status is Moderate." | `WA-ENV-BAS-003` | Greek + sharp pill |
| 5 | "Two residential receptors lie within 150 m, at Ashcombe Lane." | `WA-ENV-BAS-003` | Greek + sharp pill |

**Withheld line** (7 words): "1 sentence withheld — no source supports it."

**Suggestion title** (label): "Suggestion ready · pending your decision". Buttons: Accept (primary sm) · Edit · Refine · Reject.

**Run trace** (title label "✦ Agent · Working" → "✦ Agent · Done"; details Greek'd):

| Row | Label | Detail (Greek'd) |
|---|---|---|
| 1 | Retrieved sources | 6 passages from WA-GEO-GIR-004 and WA-ENV-BAS-003 |
| 2 | Ground-checked claims | 5 supported · 1 withheld |
| 3 | Suggestion drafted | Section 2 · 5 sentences |

**Source panel** (native 380 px wide):

- Header labels: `WA-GEO-GIR-004` (mono 12.5) · "Ground Investigation Interpretative Report" (serif 15.5)
- Badges: `success` "v2 · Current" · `neutral` "Used for AI answers"
- Locator label: "p. 14 · §4.3 Groundwater"
- Passage (serif 14), a contiguous verbatim excerpt of the seed's v2 text; only the **hl** span is sharp, the rest Greek-in-place:
  "Elevated concentrations of polycyclic aromatic hydrocarbons (PAHs) were recorded in three of eleven trial pits (WS-TP03, WS-TP07, WS-TP09), with benzo(a)pyrene up to 18 mg/kg. A shallow **perched water table was encountered at 1.6–2.1 m** within the made ground. Monitoring over three visits confirmed seasonal persistence. The perched horizon provides a plausible migration pathway toward the Ashcombe Brook during construction dewatering."
  The hl span is 8 words.
- Footer, rising to focal at 549 (9 words): **"v1 superseded 12 Aug — never used by the AI."**

**Shell (shot 2)**, AppShell with `greekChrome`: legible only the topbar project pill "Wrenfield–Ashcombe 400kV Connection", the document title "EIA Scoping Method Statement — Land Quality" in the second bar, the composer placeholder "Ask for a draft into this document", and the chip "From the library". Greek'd: the reference, Freeze, Promote, all other chips, side tabs, rail labels, the canvas body. **The "No document controls" pill is not drawn.** Canvas section 2 shows a heading "2. Baseline sources" (Greek'd) and one shimmer bar (520 × 14).

**Accept receipt** (7 words, side panel, muted → focal): "Accepted · 5 sentences, each with its source"

## Shots

| # | Frames | On screen | Motion / camera | On-screen text and UI copy | Components |
|---|---|---|---|---|---|
| 1 | 0–59 | Field. Title card. | WordReveal, cut at 59. | Card: "Drafts that show their *sources*." | TitleCard |
| 2 | 60–95 | AppShell, Editor, Eleanor's seat, chrome Greek'd. | Shell enters 60 (Float entry 9 f) at scale 1.2. Push-to-detail 68–95: Camera 1.0 → 1.7 centred on the side panel composer (`ease.out`, 27 f). | Legible labels as listed. No line. | AppShell, ChatComposer, Camera |
| 3 | 96–191 | PromptHero on the field (x 960, y 500). | Shell blurs out 96–104 and is gone by 110. Composer scales 0.94 → 1 (9 f). Placeholder until 100. TypedText **102–140**. Highlight on "accepted" **144**. Send press **160** (keyboard). Line on screen 102–191 = 90 f (≥ 88). | Author line (Inter 22, muted): "Eleanor Price · Calder & Hale". Chip under composer, active: "From the library" (22 px). | PromptHero, FocusBlur, Highlight |
| 4 | 192–251 | RunTrace floated (Float x 960, y 560, scale 2.4). Above it the prompt as a user bubble, Greek'd from 192. | Trace arrives 192 (`panel`). Rows tick **204, 218, 232** (shimmer before each). Title flips to "✦ Agent · Done" at 236. No camera move. | Labels only. | Float, RunTrace, GreekText |
| 5 | 252–296 | Field. Mid-card. | WordReveal, cut at 296. | Card: "No source? It's *withheld*." | TitleCard |
| 6 | 297–392 | SuggestionCard floated (Float x 960, y 540, scale 2.4; native 640 wide). | Card enters 297. Segments arrive Greek'd with sharp pills at **303, 309, 315, 321, 327** (pill +3 f). WithheldNotice **333**, focal 333–392 (60 f ≥ 56). Slow push 1.00 → 1.05 over 330–392 (62 f). Buttons appear 340 (labels). | Title label; withheld line. | SuggestionCard, CitedProse, SourceChip, WithheldNotice, Camera |
| 7 | 393–476 | Segment 3 becomes the line. | Notice Greeks at 393. Segment 3 turns sharp with Highlight wipe **393**; focal 393–472 (80 f = 10 words). Cursor show **444** at (1300, 860), travel 444–460 to pill 3 (≈ (1180, 600)), **click 462**, hide from 470. Pill 3 `activeAt` 462. 466–476: card slides left to x 560 and blurs (FocusBlur context from 466). SourcePanel enters at **468** (Float x 1360, y 540, scale 2.4). | Segment 3 text. | CitedProse, Highlight, Cursor, SourceChip, FocusBlur, SourcePanel |
| 8 | 477–548 | The page. | hl span wipes in **480**; focal 480–548 (69 f ≥ 64). Slow push on the panel 1.00 → 1.06 over 480–548 (69 f), centred on the span. | Panel header, badges and locator as labels; hl span as the line. | SourcePanel, Highlight, Camera |
| 9 | 549–620 | The superseded line. | FocusBlur on the passage from 549. Footer rises 549–558 (`panel`) to the panel's centre, re-set at 15.5 px native in `#1c1b18`, Highlight wipe at **556**. Focal 549–620 (72 f = 9 words). | "v1 superseded 12 Aug — never used by the AI." | SourcePanel (footer.riseAt), FocusBlur, Highlight |
| 10 | 621–710 | Accept, and the draft lands. | Panel exits right 621–629; card returns to x 960 sharp, prose Greek'd. Cursor show **626** at (1300, 900), travel 626–642 to Accept (≈ (700, 840)), **click 644** (press), hide from 652. 648–680 pull-back reveal (`ease.out`, 32 f) to the AppShell canvas, Camera 1.0 at Float scale 1.7 centred on section 2: the card dissolves into the canvas as section 2's five sentences land as plain prose with pills (Greek'd), with **SuccessFlash at 662**. Receipt in the side panel at **654**, focal 654–710 (57 f ≥ 56). | "Accepted · 5 sentences, each with its source" | Cursor, Button, AppShell, DocCanvas, SuccessFlash, Camera |
| 11 | 711–722 | Fade to field. | FadeOutToField from 711. | — | FadeOutToField |

Contiguity: 0–59, 60–95, 96–191, 192–251, 252–296, 297–392, 393–476, 477–548, 549–620, 621–710, 711–722 → 723 f.

## Notes for the film cut

- Follows the hook "Generic AI *guesses*." (45 f); this title answers it. First
  readable product UI at film 129 (4.3 s).
- Ends on the field at 722; clip 2's title cuts in.

## Honesty notes

- "p. 14" is vision for seeded texts without pages (pages are built for sources
  that have them, T-305).
- The withheld sentence is counted, never shown.
- Only "From the library" is active: every pill is a library source (ADR-0022).
- Section 2 is never shown with a defect in any later clip (clip 2 marks a
  person-written clause in §3).
