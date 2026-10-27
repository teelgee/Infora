# Video 02: the QA checker

**Purpose.** A second reader a senior reviewer would trust. It marks defects
in the text, says why each one is a defect, and waits for a person. It catches
a factual slip a person wrote, against the record. Only the mechanical
house-style fix is accepted in one click; the rewrite waits to be read.

**Seat.** Eleanor Price, Calder & Hale, on `WA-EIA-MST-001` *EIA Scoping Method
Statement — Land Quality* (the same document as clip 1). The defect is in §3,
which a person wrote; §2, which the agent drafted in clip 1, is shown only as a
Greek strip with its pill.

**Durations.** Body: standalone **503 f**, film **443 f** (shot 2 dropped).
Standalone 623 f (20.8 s) = 30 + 503 + 90. Film frames 792–1234.

**EndCard line (standalone):** "Catch it before your *client* does."

Frames are body-local; standalone = +30.

## Fixed copy

**Checker plan card (shot 2, standalone only)**, native 360 wide at scale 2.4:
the form at the top (Draft, Depth, Checks) is entirely Greek'd. Below it the
plan block, heading label "The plan":

1. **"Read against 5 rules and the record"** (7 words, the focal line)
2. "Check gaps and readability" (Greek'd)

Primary button label "Run the check".

**Canvas (shot 3)**, DocCanvas native 600 wide; only the Required span is
sharp, everything else Greek-in-place with its marks:

> **1. Purpose and scope** (Greek) — paragraph Greek, with an **advisory** dashed mark on the span "the routewide works".
>
> **2. Baseline sources** — a single `strip`: one Greek line ending in SourceChip `WA-GEO-GIR-004` (sharp).
>
> **3. Conceptual site model** (Greek) — "[advisory: A conceptual site model has been prepared for each land parcel crossed by the route.] Sources considered include historic landfill, agricultural fuel storage and made ground associated with the former works, including [required: **the PAH exceedances at three trial pits south of the Wrenfield substation**]."
> The Required span (12 words) is the only sharp text.

Label chip floating at the canvas's top-right corner (Float with the canvas): "Checks (5)".

**Accuracy finding (shot 5)**, FindingCard native 360 wide: group label
"Accuracy (1)"; Badge `warning` pill "Required" · "Go to it"; defect line
(9 words, focal): **"The record puts these PAH hotspots at Wrenfield Sidings."**
followed by SourceChip `WA-GEO-GIR-004`; label "Suggested wording" with a
Greek'd sunken block (its text, for the data file: "the PAH exceedances in
three trial pits at Wrenfield Sidings"); buttons Accept · Edit · Dismiss
(secondary). Not clicked.

**House style group (shot 6)**, native 360 wide: header label "House style
(4)"; primary button **"Fix 1 house-style wording"**; its muted explanatory line
Greek'd; finding card: Badge `neutral` "Advisory" · "Go to it"; defect line (9
words, focal): **"This project says “the scheme”, not “the routewide works”."**;
rule block Greek'd except the mono label "§2.1"; fix line Greek'd (data:
"routewide works → scheme, 1 place"); buttons Accept · Edit · Dismiss.

**Strip (shot 6):** one canvas line, Greek except the span: "…for **the routewide works**." → after the fix "…for ~~the routewide works~~ **the scheme**."

After the click the primary button reads **"Fixed · 1 place"** (success text).

## Shots

| # | Standalone frames | Film frames | On screen | Motion / camera | Text and UI copy | Components |
|---|---|---|---|---|---|---|
| 1 | 0–59 | 0–59 | Field. Title card. | WordReveal, cut. | Card: "A second reader, *before* review." | TitleCard |
| 2 | 60–119 | — (dropped) | Checker plan card (Float x 960, y 540, scale 2.4). | Card enters 60. Plan row 1 sharp, focal 62–119 (58 f ≥ 56). Cursor show **64** at (1500, 960), travel 64–80 to "Run the check" (≈ (760, 820)), **click 82**, hide from 90. Rows shimmer from 84; row 1 tick **96**, row 2 tick **110**. | Plan row 1. | Float, RunTrace (plan rows), Button, Cursor, GreekText |
| 3 | 120–239 | 60–179 | Canvas (Float x 960, y 540, scale 2.4). | Hard cut. Marks draw: advisory "the routewide works" **128 (film 68)**; Required span **140 (film 80)**; advisory CSM sentence **152 (film 92)**. "Checks (5)" chip at 154 (film 94). Required span focal 140–239 (100 f ≥ 96). Slow push 1.00 → 1.08 over 170–239 (film 110–179), 70 f, centred on the Required span. | Required span. | DocCanvas, Mark, SourceChip, GreekText, Camera |
| 4 | 240–284 | 180–224 | Field. Mid-card. | WordReveal, cut. | Card: "It shows *why*, then waits." | TitleCard |
| 5 | 285–380 | 225–320 | FocusBlur: canvas as context (left, Float x 700, scale 1.8, blurred); Accuracy FindingCard focal (Float x 1240, y 540, scale 2.4). | Card enters 287 (film 227). Connector line (2 px `#b23b34`) from the card's left edge to the blurred Required span draws 297–307 (film 237–247). Defect line focal **291–380** (film 231–320), 90 f ≥ 72. SourceChip pops 300 (film 240). No cursor. Slow push 1.00 → 1.04 over 316–380 (film 256–320), 65 f. | Accuracy finding copy. | FocusBlur, FindingCard, SourceChip, Camera |
| 6 | 381–490 | 321–430 | House style group (Float x 1240, y 500, scale 2.4) and the strip (Float x 520, y 860, scale 2.4). | Hard cut. Defect line focal **381–452** (film 321–392), 72 f. Cursor show **434** (film 374) at (1500, 980), travel 434–450 (film 374–390) to "Fix 1 house-style wording" (≈ (1060, 300)), **click 452** (film 392), hide from 460 (film 400). **TrackedChange at 458** (film 398) in the strip; button flips to "Fixed · 1 place" at 458 (`ui`); the Advisory finding card collapses 464–472 (film 404–412). | House style copy; strip. | Float, Button, FindingCard, TrackedChange, Cursor |
| 7 | 491–502 | 431–442 | Fade to field. | FadeOutToField. | — | FadeOutToField |

Contiguity, standalone: 0–59, 60–119, 120–239, 240–284, 285–380, 381–490, 491–502 → 503 f. Film: 0–59, 60–179, 180–224, 225–320, 321–430, 431–442 → 443 f. Film frame = standalone frame − 60 for every frame ≥ 120.

## Honesty notes

- Findings, never verdicts: no pass/fail, score or "compliant".
- The Accuracy finding is a rewrite and is **not** accepted on screen.
- The house rule is quoted as a rule (Greek'd block with "§2.1"), never as a
  source pill; only the record-grounded finding has a pill.
- The defect is in person-written text, never in clip 1's cited section.
