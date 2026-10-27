# Final review: the rendered film and clips

Reviewed 2026-10-04 against `out/Infora-film.mp4` (3585 f, 30 fps) and
`out/clips/V01…V05`. Every film frame was read at 2 fps (241 stills). The cuts
were read frame by frame, and the standalone clips were sampled at their logo
opens, their end cards, all of V04 and V05 at 2 fps, and the shots that only
appear in the standalone cuts of V02 and V03. Timings are given as film
seconds, with the film frame in brackets (`t × 30`).

## Verdict

**Nearly there, but not ready to post.** The film reads as one story with no
sound: generic AI guesses; ours cites, withholds and never uses a superseded
version; a second reader catches the slip; the review stays walled; accepted
work feeds the AI; then anyone can build an app by asking. The "why not
generic AI" lands three times in the first 25 s: the hook, the *withheld* card
and the superseded line. The hard cuts between bodies are clean, field to
field.

On the owner's critique, **V04 answers it convincingly**. The user types one
sentence, the phrases fly into the step list, the agent asks in plain words and
ticks each step, the user types a change in their own words, the agent confirms
it, and the app opens to both seats. **V05 shows both halves of app 2 clearly**:
commentary typed into the app's own form, a connected spreadsheet, and a slide
deck with a "Download PowerPoint" action. In the film cut, though, V05's
builder stalls before it finishes (must-fix 4).

Seven defects need fixing before release. The worst three are overlays that
survive the fade at the end of a clip, the unfinished-looking KPI payoff (the
LinkedIn cover frame), and a cited sentence whose highlighted source supports
only half of the claim.

## MUST-FIX

1. **Overlays survive the fade-out and pop at the cut.**
   *Film 88.5–88.9 s (f2655–2666), end of V04; film 110.6–110.97 s
   (f3318–3329), end of V05. Also at the ends of the V04 and V05 standalone
   bodies.* The dashboards fade to the empty field, but the two seat pills
   ("Trentmoor Energy · Rachel Bowen", "Netherfold Cabling · Sam Kerridge") stay
   at full opacity on a blank field, and so does the "Saved as a draft for
   review · Download PowerPoint" strip. Then they vanish on the hard cut. This
   is the only cut in the film that jumps. *Cause:* `SeatLabel` has `zIndex: 50`
   (`src/shared/film.tsx`, about line 353) and `SavedStrip` has `zIndex: 40`
   (`src/shared/ui/deck.tsx`, line 259), while `FadeOutToField`
   (`src/shared/film.tsx`, line 303) has no z-index. *Fix:* give
   `FadeOutToField`'s `Field` `zIndex: 1000`. That fixes every clip at once.

2. **The KPI two-seat payoff looks unfinished, and it is the LinkedIn cover
   frame.** *Film 86.5–89 s (f2595–2666); V04 standalone about 25–27 s.*
   - In each 774-px dashboard pane, the bottom row holds only a 250-px bar
     chart, so the right two-thirds of both panes are empty white.
   - The bottom 45% of the frame is empty apart from the note.
   - The chart labels render at about 13 px, which is unreadable on a phone.
   - The first payoff frame (86.5 s, f2595) reads "0 of 0 · 0 tCO₂e · £0" on
     both seats, which looks like a broken, empty dashboard before the count-up
     starts.

   *Fix (`src/shared/ui/charts.tsx` `Dashboard` `crop:'payoff'`;
   `src/videos/v04/Body.tsx` `Payoff`):*
   - Either drop the bar chart from the payoff crop (tiles only, at 774 × 220),
     or give the chart the full width (`w≈750`).
   - Raise `PAYOFF_SCALE` from 1.11 to about 1.4 and re-centre at y ≈ 470.
   - Render the tile values as "—" until `T.count`, rather than counting up
     from 0.

3. **The cited claim is only half supported by its highlighted source.**
   *Film 16.5–21.5 s (f495–645), V01.* The focal sentence is "Perched water at
   1.6–2.1 m could migrate toward Ashcombe Brook." The source panel highlights
   only "perched water table was encountered at 1.6–2.1 m". The migration half
   has no visible support. A sceptical buyer will pause on exactly this frame,
   because "every claim, cited to the page" is the product's promise. The
   seeded passage already contains the supporting words ("…provides a
   plausible migration pathway toward the Ashcombe Brook…",
   `src/data/wrenfield.ts` line 107). *Fix:* in `GIR_PASSAGE`, mark that
   fragment `hl: true` as well, as a second highlighted line in the panel
   (`src/videos/v01/Body.tsx` source-panel shot). The other option is to cut
   the claim back to the depth alone.

4. **In the film cut, the deck app's builder stalls before it finishes.**
   *Film 99.5–101.5 s (f2985–3045), V05.*
   - The last builder frame shows the "No — it's working notes" bubble, but
     step 2 still says "Waiting for you".
   - Steps 4–7 are unticked.
   - The app is never opened.

   The film then cuts to "Their words. Your *numbers*." The owner's critique
   asks for the agent to *walk through the steps*. App 1 does this; in the film
   app 2 visibly stops halfway, which undercuts the second required app. The
   standalone does it correctly (V05 ~13.5 s: steps 2, 4 and 5 tick).
   *Fix (`src/videos/v05/Body.tsx`, film cut):*
   - Keep about 24 f after the bubble so that step 2 ticks, steps 4–5 tick and
     the "Commentary screen: package leads only" receipt lands.
   - Then add a 15 f press on "Open to Calder & Hale".
   - Pay for it by trimming the deck-grid landing (film 106.5 s), which is
     unreadable at 0.25 scale anyway.

5. **The seat pill covers a chart title in the insight beat.** *Film 84.0–84.5
   s (f2520–2535), V04, film only.* The "Trentmoor Energy · Rachel Bowen" pill
   (`SeatLabel` at y = 60, `src/videos/v04/Body.tsx` line 339) sits on top of
   the "Carbon · since June" chart title, leaving "Ca…" peeking out. *Fix:*
   anchor the pill above the dashboard's top edge (move the dashboard down by
   about 50 px), or put the pill at top-left (x ≈ 260, y ≈ 40) clear of the
   chart row.

6. **The same flag label appears twice and gets clipped.**
   - *Film 76.5–79.5 s (f2295–2385):* the builder preview shows "Flags under
     90% on time" inside the chart header *and* again in the callout below the
     outlined chart.
   - *Payoff, film 87–89 s:* Trentmoor's chart header carries "Flags under 90%
     on time" *and* "Under 90% on time" side by side, and the second badge runs
     into the card edge.

   *Fix (`src/shared/ui/charts.tsx` lines 145–146):* when `flagRule` is shown,
   don't also render the per-bar `flag.badge` in the header; colouring the bar
   amber is enough. In the builder preview, drop either the header badge or the
   callout (`src/videos/v04/Body.tsx` line 241).

7. **A posted comment collides with the ghost of its "Comment" button.** *Film
   45.5 s (f1365), V03.* On the frame where Rachel's comment posts, "State the
   made ground depth for each parcel." is drawn over the fading "Comment"
   button. *Fix:* in the compose-to-posted transition
   (`src/videos/v03/Body.tsx` / `CommentCard` in `src/shared/ui/review.tsx`),
   remove the button on the post frame, or fade it out over the 5 f *before*
   the text reflows.

## SHOULD-FIX

- **V03 standalone, ~17 s.** After the push-in on the response shot, the
  "Calder & Hale · Eleanor Price, lead author" pill sits on the stepper labels
  ("In review", "Responding"). Fade it out when the push starts
  (`src/videos/v03/Body.tsx` line 122).
- **The "Required" finding badge is amber** (film 35.5–39 s, V02), while its
  underline and leader line are red. Master plan §4.6 makes Required marks the
  danger colour. Fix: `src/shared/ui/drafting.tsx` line 412, `tone="danger"`.
- **Montage crossfade** (film ~112 s, f3360): "RFI log" is drawn over the
  fading "…t tracker", reading as "RFI logt tracker". Fade the old chip's text
  out before the new one fades in, or animate the chip width
  (`src/film/segments.tsx`, Montage).
- **The comments on Eleanor's side are out of time order** (film 52.5–53.5 s):
  08:28, 08:41, 08:34. Also, "“ground gas migration”" is lowercase while the
  other quotes are title case. Sort them by time and capitalise the quote
  (`src/data/wrenfield.ts` lines 152–164).
- **Date formats are mixed.** The comments use the US style "Sep 02, 2026,
  08:28 AM"; everything else uses the UK style ("29 Sep 2026", "Written 1
  Oct"). Use "2 Sep 2026, 08:28" (`src/data/wrenfield.ts`).
- **The superseded beat has no referent** (film 21.5–24 s). When "v1 superseded
  12 Aug — never used by the AI." rises, the "v2 · Current" badge is already
  blurred, so a cold viewer has nothing to read "v1" against. Keep the v2 badge
  sharp, at opacity 0.6, as a label.
- **"✦ ASKS" chips appear under steps 2 and 6 in V05 but nowhere in V04**
  (`src/shared/ui/builder.tsx` line 426). The chips read as internal jargon.
  Drop them; the "Waiting for you" badge already carries the meaning.
- **V05 never lets the user talk in their own words** after the first prompt.
  V04 has "Flag any supplier under 90% on time." If time allows, add one typed
  change in V05's standalone cut (for example "Put the risk quote first.").
- **"✓ Checks (5)" appears without a cause** (film 30.5 s, V02). Give it a
  6 f shimmer-to-result transition, or a cursor press, so it reads as the
  checker running.
- **The run-trace card grows upward with each tick** (film 9.5–11 s): its top
  edge climbs about 40 px. Anchor the card by its top edge.
- **"Generate September's pack" renders as pure black** (film 106 s), not ink
  `#1c1b18` (`src/videos/v05/screens.tsx`).
- **Prompt cards overhang the chat pane** for a few frames as they shrink in
  (film 65 s V04, film 95 s V05): about 8 px past the pane's right edge, and
  across the header rule. Clip them to the pane, or land them 10 px inside it.
- **The KPI insight beat's first frame** (film 84.0 s) shows bars mid-count
  (93/82/92/89) at full sharpness, and they differ from the final
  96/85/95/92. Start the insight beat after the count, or blur the bars from
  its first frame.

## What works well

- **The opening pair.** "Generic AI *guesses*." → "Drafts that show their
  *sources*." is the strongest ten seconds in the sector, and it pays off at
  once with the *withheld* card and the superseded line.
- **The cuts are clean.** Every body-to-body cut is field to field, apart from
  must-fix 1. There are no blank frames that shouldn't be there, and no
  fallback fonts (Source Serif 4, Inter and JetBrains Mono throughout).
- **The rule of one readable line per frame is honoured almost everywhere.**
  Mid-clip cards break up the UI as the buyer review asked, and agent turns
  are short and held long enough to read.
- **The review wall.** Rachel types while Eleanor's side says "Trentmoor is
  still reviewing. You'll see every comment when they release them.", then
  both sides move to Responding together. It is legible without sound, and no
  competitor can film it.
- **The hinge.** "Accepted by Rachel Bowen, Trentmoor Energy" becomes "The AI
  can now cite this. WA-EIA-MST-001". This ties document control back to the
  AI.
- **V04's builder is the chat-led builder the owner asked for.** The phrases
  are lifted into plain-named steps, the questions are plain-word ("Will
  payments depend on these numbers?", "Who should see the dashboard?", "Run as
  you, Rachel, on these two tables only?"), the steps tick as each answer
  lands, a free-text change gets the reply "Done — added to the dashboard.",
  and "Open to 5 organisations" ends the build.
- **The numbers are consistent across clips.**
  - 93 of 102 on time.
  - Ashcombe 34/40 = 85%, flagged.
  - 6 of the 9 late deliveries are Ashcombe's.
  - Carbon: 171 + 163 + 154 + 142 = 630.
  - Spend: 84,200 + 126,500 + 38,900 + 22,400 = £272,000.
  - Netherfold: 27 of 28 on time and 262 tCO₂e, which matches its June–Sep
    rows.
  - Checks (5) = 1 accuracy finding + 4 house-style findings; after the fix,
    House style (3).

  No typos were found.
- **V05's slide 4.** Owen's own words ("Perched water in the launch pit after
  heavy rain.") sit beside spreadsheet numbers labelled in plain text "from
  cost & programme.xlsx", with "Saved as a draft for review · Download
  PowerPoint". It shows the brief's second app exactly.
- **The close.** "Every answer from *your* record. / Every tool, built by
  *asking*." then the wordmark and tagline. It names both halves of the film.
