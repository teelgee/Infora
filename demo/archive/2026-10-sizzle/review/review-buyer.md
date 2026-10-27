# Buyer review: the product-film plan

Reviewed 2026-10-04 against [../BRIEF.md](../BRIEF.md),
[../research/benchmark-product-videos.md](../research/benchmark-product-videos.md),
[../plan/master-plan.md](../plan/master-plan.md), `video-01` to `video-05`, and
section 1 of [../research/product-inventory.md](../research/product-inventory.md).

**Who is watching.** Two buyers, sound off, in a LinkedIn feed, mostly on a phone:

- **(a)** a director at a large engineering consultancy. They want faster drafting
  that won't embarrass them in front of a client, and they want their firm's
  know-how kept away from rival firms.
- **(b)** a programme lead at a utility client. They want one controlled record,
  supplier reporting without spreadsheets, and an AI that relies only on
  documents they accepted.

## Verdict

The plan is well made. Its parts are right, its honesty rules are sound, and
clip 3's split screen (two firms looking at the same review and seeing different
things) is something no rival can film. But **as a sound-off feed video it
under-sells and over-informs.**

- **The first ten seconds don't say why this isn't generic AI.** The hook,
  "Infrastructure runs on *documents*.", is something everyone already agrees
  with. The first proof (a source pill) arrives at about 13 s, and "rival firms
  on one project" isn't said until 42 s.
- **Each clip has one title card and then 17–25 s of dense, unlabelled UI.**
  The benchmark alternates card, UI, card, UI. Our clips play a single card and
  then a long run of interface.
- **Much of the agent and read-back text appears faster than anyone can read
  it.** Clip 4's first question is about 40 words, typed in under a second.
- **The app builder answers the owner's critique only halfway.** The chat is
  there, but the step list beside it is the bigger pane and speaks builder
  language ("The tables", "Data connections", "Analysis and prompts"). The
  "chat" is mostly clicking one of two reply buttons. Nobody talks to the agent
  in their own words after the first prompt.
- **Both apps are present, but neither has a true wow.** The KPI payoff puts a
  supplier's *form* next to the client's dashboard, so the promise "same app,
  each sees their own" is never actually shown. Clip 5 re-runs clip 4's builder
  routine almost beat for beat before it reaches the deck.
- **Internal words leak onto the screen**, among them sandbox, round, issue,
  Promote, Freeze, S0, P02, C01, "acceptance step", "contractual data" and
  playbook. One leak is actively harmful: a "No document controls" pill on the
  first screen of a document-control product.

Fix the opening, add mid-clip cards, strip the text, and make clip 4's payoff
truly two-seat. With those changes this becomes the best product film in the
sector, which, as the benchmark notes, currently has none.

## The ranked changes

Frame numbers are body-local unless marked "film". The card rules from master
plan §4.2 still apply: ≤ 6 words, one italic word, a full stop. A frame ledger
for the film after all changes is at the end of this section.

### 1. Rebuild the first 5 seconds around "why not generic AI"

**Problem.** Wordmark (1.2 s), then "Infrastructure runs on *documents*." (1.8 s),
then clip 1's title (2.0 s), then a full AppShell at 1.2× (2.0 s). That is 7 s
before anything a buyer can read in the product, and nothing in it separates us
from a chatbot with access to the shared drive. The sharpest answer to "why not
Copilot?" is already in the plan but hidden: the source panel's 11.5 px muted
footer, "v1 superseded 12 Aug 2026 — never used for AI answers". A
general-purpose assistant searching the shared drive cites the superseded
version. Infora doesn't.

**Changes.**

- FilmOpen wordmark: 36 f → **24 f**.
- Hook card: replace "Infrastructure runs on *documents*." with
  **"Generic AI *guesses*."** at **45 f**. It now pairs with clip 1's title,
  "Drafts that show their *sources*.", and the two cards read as one contrast.
  (No product names on screen; the guardrail stands.)
- Clip 1 shot 2 (the AppShell): 60 f → **36 f** in both cuts, and Greek out
  everything except the document title and the composer: the "Freeze" and
  "Promote" buttons, the "No document controls" pill, the chip row except
  "From the library", and the side tabs. **Delete the "No document controls"
  pill outright.** On screen it reads "this product has no controls".
- Clip 1 shot 6: make the superseded line the focal element of a second beat.
  At 500–530 (body), FocusBlur the passage. The footer rises to the focal line,
  set at 15.5 px in the default text colour with a Highlight wipe:
  **"v1 superseded 12 Aug — never used by the AI."** Hold 30 f. Pay for it by
  shortening shot 4 (below).
- Result: the first readable product UI arrives at about film 3.5 s (it was
  5.0 s), and the "why us" reaches viewers twice before 20 s: once in words
  (the hook), once as proof (the superseded line).

### 2. Tell the story with cards between beats, not one card per clip

**Problem.** Benchmark pattern 2 is a ~2 s text card, a UI beat, a card, a UI
beat. Every clip here has one card at frame 0 and then no words outside the UI,
so a sound-off viewer has to decode 20 s of UI unaided. This is the biggest gap
between the plan and Harvey's pacing.

**Changes.** Add one or two 45 f mid-clip TitleCards per clip, cut hard on the
field as at the start. Exact copy and placement:

| Clip | After shot | Card | Pays for it by |
|---|---|---|---|
| 1 | 4 (run trace) | **"No source? It's *withheld*."** | Run trace 90 f → 60 f; the three rows tick at +12, +26, +40. |
| 2 | 3 (marks) | **"Caught *before* your client sees it."** | Cutting shot 2 in the film (change 6). |
| 3 | 2 (split) | **"Comments arrive *together*."** | Shot 4 cut in the film (change 7). |
| 3 | 4 (response) | **"Accepted work feeds the *AI*."** | As above; this card replaces the need to read the library row. |
| 4 | 4 (questions) | **"Then just *ask* for changes."** | Introduces change 4's chat edit. |
| 4 | 6 (gate) | **"Same app. Different *seats*."** | Leads into the two-seat payoff (change 5). |
| 5 | 6 (commentary) | **"Their words. Your *numbers*."** | Film cut of the build (change 6). |

Note: "Caught *before* your client sees it." is 6 words. If the director wants
5, use **"Caught *before* the client."**

### 3. Cut the words on screen by about two-thirds, and plan for the phone

**Problem.** Float scale 1.8 makes body UI text 22.5 px on a 1920 px frame. In a
phone feed, where a 16:9 video is about 390 pt wide, that is roughly
**4–5 pt**, which can't be read. Only the 96 px cards survive. Meanwhile the
plan puts whole paragraphs on screen for a second or less:

- Clip 4 Q1: about 40 words, typed over 22 f.
- Clip 4 T1: about 15 words, typed over 17 f.
- The read-back: four lines including five organisation names, shown for about
  1.5 s before the click.
- The InsightCard meta line: "Run 1 Oct 2026, 02:00 · scheduled · acted as
  Rachel Bowen over 16 rows in Monthly KPI returns · definition v1 · All runs →".
- The clip 3 split: two panes, each with a title, progress bar, PDF at 9 px
  and a comment column.

**Changes.**

- **Rule for every shot:** at most **one readable sentence (≤ 12 words) on
  screen at a time**, held for at least `words × 8 f`. Everything else is
  Greek. Apply it in the master plan §4.7 as a hard rule, not a
  recommendation.
- Focal UI scale: **2.4 minimum** for the element the viewer must read (it is
  1.8 now). Keep 1.8 only for "you are here" context.
- Clip 4 InsightCard meta → Greek, except the words **"Written 1 Oct · from
  accepted returns only"**.
- Clip 3 split → Greek the PDF body, the progress-bar meta and comments A and
  C. Readable on the left: only the comment Rachel is typing. Readable on the
  right: only the amber notice.
- **Deliverable addition (owner decision, it touches the fixed frame):**
  render each standalone clip a second time at **1080×1350 (4:5)**, the
  LinkedIn feed shape, with the floats re-centred and the focal scale 2.8. The
  16:9 film stays for the website and for meetings. If the owner holds the
  frame at 16:9 only, the one-sentence rule above becomes non-negotiable.

### 4. Make the builder visibly chat-led: chat is the hero, steps are the progress bar

**Problem.** The owner asked for "talk to an agent, the steps visible as
progress". In shot 4 of clips 4 and 5 the StepRail pane (920 px) is *wider*
than the chat (720 px). Its rows use builder vocabulary, and the only "talking"
after the prompt is two button clicks. A buyer sees a form with a chat beside
it, which is the step-focused builder again.

**Changes.**

- Layout (shots 3–4, both clips): ChatPanel **1120 px** wide at x 120. StepRail
  becomes a slim **480 px** progress column at x 1320 showing titles and ticks
  only, with summaries in muted 1-line text.
- Rename the step titles on screen, in plain words that keep the same seven
  steps:

  | n | Was | Show |
  |---|---|---|
  | 1 | What the app is | **Who it's for** |
  | 2 | The tables | **What gets collected** |
  | 3 | Data connections | **Where the numbers come from** |
  | 4 | The interface | **What people see** |
  | 5 | How often it runs | **When it runs** |
  | 6 | Analysis and prompts | **What it writes** |
  | 7 | Check and open | **Check and open** |

- Rewrite the agent's turns to ≤ 12 words each:
  - Clip 4 T1 → **"Done — open to Trentmoor and its four suppliers."**
  - Clip 4 Q1 → **"Will payments depend on these numbers?"** Replies:
    **"Yes — Trentmoor signs off each return"** (chosen) · "No". The 8-column
    list moves into the rail's step-2 summary, Greek'd.
  - Clip 4 Q2 → **"Who should see the dashboard?"** Replies: "Trentmoor only" ·
    **"Everyone — each sees only their own"** (chosen; see change 5).
  - Receipts → plain ticks: **"✓ Monthly return form, with sign-off"**,
    **"✓ Dashboard: 2 screens"**.
  - Clip 5 C1 → **"Connect the spreadsheet so nobody retypes numbers."**
  - Clip 5 Q1 → **"Will payments depend on this commentary?"** Replies "Yes" ·
    **"No — it's working notes"** (chosen).
  - Clip 5 Q2 → **"Who writes the commentary?"** → **"Our package leads"**.
- **Add one free-text chat edit** to clip 4. Talking in your own words is what
  makes it read as an agent and not a form. After the preview assembles
  (shot 5), Rachel types in the composer (TypedText, 30 f), and the agent
  answers:
  - Rachel: **"Flag any supplier under 90% on time."**
  - Agent (receipt): **"Done — added to the dashboard."** The BarChart re-colours
    Ashcombe Civils' bar to the warning amber (`#c4901f`) and adds a small
    Badge `warning` "Under 90% on time" (5 f `ui`). (Ashcombe's 34 of 40 is
    85%; the others are all over 90%.)
  - Budget: +75 f. Take 30 f from the read-back (see below) and 45 f from
    shot 3. The PhraseLift beat runs 85 f; tighten it to 55 f with the four
    lifts at 4 f stagger, 20 f flight.
- Read-back (clip 4) → three lines, ≤ 8 words each, and line 4's meaning kept:
  **"Open to Trentmoor and 4 suppliers"** · **"Suppliers submit; Trentmoor signs
  off"** · **"Runs monthly as Rachel, on these returns only"**. Hide "Save as a
  playbook" (Greek it or drop it; nobody outside the team knows the word).

### 5. Give the KPI app a real two-seat payoff: the same dashboard, different numbers

**Problem.** Q2's chosen answer is "Trentmoor Energy only", so payoff 2 can only
show the supplier a *submission form* beside Trentmoor's dashboard. The clip's
promise ("Same app. Each sees their *own*.") is then told, not shown. The
strongest wow available in the whole film goes unused: the same screen, side by
side, showing two organisations different rows. It is also the one moment that
makes "the ethical wall" understandable to a non-technical buyer.

**Changes.**

- Q2 chosen reply → **"Everyone — each sees only their own"** (ADR-0056 §4 is
  exactly this: the app acts as whoever is looking). Step 4 summary → **"1
  dashboard · each organisation sees its own rows"**. Read-back line 1 is
  unchanged.
- Shot 8 (payoff 2), 63 f → **105 f**: two copies of the **same dashboard
  layout**, side by side at Float scale 1.0 each (x 500 and x 1420), with the
  SeatLabels above.
  - Left, Trentmoor: tiles "93 of 102" / "630 tCO2e" / "£272,000"; the NCR
    bars show all four suppliers.
  - Right, Netherfold: the same tiles read **"27 of 28"** / **"262 tCO2e"**
    (70+67+64+61) / **"£84,200"**; the NCR chart shows **one** bar (Netherfold,
    2); the table shows Netherfold's rows only.
  - The tiles count up simultaneously (18 f) so the eye catches the different
    numbers landing on the same layout. That moment is the wow.
  - Then the info note appears under the right pane, Highlight wipe:
    **"You see your own returns. Nothing else."** This replaces "This app
    shows you what you could already see.", which is accurate but reads as a
    riddle.
- Keep the supplier's submit form out of this clip. The form is plumbing.
- EndCard (standalone) is unchanged: "Same app. Each sees their *own*." It is
  now true on screen.

### 6. Stop the film repeating itself: cut the QA settings panel and compress clip 5's build

**Problem.** Two stretches show the same thing twice or show configuration:

- **Clip 2 shot 2** (120 f, 4 s) is a settings panel: a Draft select,
  Quick/Full depth, five checkboxes, "See the plan", "Run the check". That is
  the step-focused form the owner just rejected for the builder, in a clip a
  director needs only for the moment the checker catches an error.
- **Clip 5 shots 2–5** (450 f, 15 s) repeat clip 4's prompt → phrase-lift →
  two questions → read-back → click routine. By film minute 1:30 the viewer has
  seen it. Benchmark pattern 8 says show the full cycle once, then montage.

**Changes.**

- **Film cut of clip 2:** drop shot 2. Open on the marks drawing into the draft
  (shot 3) straight after the title card, then the new mid-card "Caught
  *before* your client sees it." at the end of shot 3. Standalone keeps a
  **60 f** version of shot 2: show only the plan block's two ticking rows. The
  form above them (Draft, Depth, Checks) is Greek'd, and the cursor makes one
  click, on "Run the check".
- **Clip 2 shot 5 copy:** "Accept 1 mechanical correction" → **"Fix 1 house-style
  wording"**. Its muted line → Greek. After the click: **"Fixed · 1 place"**.
- **Film cut of clip 5 (new `filmCut` prop on Body; standalone unchanged):**
  - prompt typed: 66 f, at the larger scale
  - PhraseLift: 45 f
  - spreadsheet connect, with the mapping rows collapsed to one line **"5 of 5
    columns matched · read only"**: 75 f
  - the two questions skipped (clip 4 showed the gate); one receipt line **"✓
    Open to Calder & Hale package leads"**, plus the rail ticking 4–7 in one
    sweep: 45 f
  - commentary (shot 6): unchanged
  - deck (shot 7), with change 6b below
  - Clip 5 film body: 720 f → about **540 f**.
- **6b. Make the "words + numbers → slide" link explicit.** It is the second
  required app and its only wow. At the push-in on slide 4 (body 658+):
  - Re-run the amber Highlight wipe on the quoted risk, **"Perched water in the
    launch pit; high brook levels after rain."**, at 664. It is the same wipe
    the viewer saw while Owen typed it.
  - Highlight the forecast **"£5,260k (+£460k)"** at 676, with a muted label
    under it, plain text (not a source pill, per the guardrail): **"from cost &
    programme.xlsx"**.
  - Hold to 707.
  - Saved strip copy → **"Saved as a draft for review · Download PowerPoint"**.
    Drop "project sandbox" and ".pptx".

### 7. Reframe clip 3 in buyer words and remove the document-control codes

**Problem.** The wall clip is our sharpest differentiator, but its copy is
written in document-control language. A consultancy director can also read it
the wrong way: *my client can hide comments from me?*

- **The card.** "Shared review. *Private* until issued." Buyers don't know what
  "issued" means here.
- **The notice.** "The round is open. Its comments are withheld until the lead
  reviewer closes the round and issues it."
- **The button.** "Close & issue the round".
- **The codes.** "S0", "P01 · Round 1", "Cycle active", "Points to P02 · §3",
  "P02 → C01".

Two specific traps:

- To an ISO 19650-literate UK programme lead, **S0 means "work in progress"**.
  Seeing it as a comment code will look wrong even though it is Infora's
  acceptance-code range.
- **"Ethical wall"** never appears, so the clip doesn't name what it proves.

**Changes.**

- TitleCard → **"One review. Each firm *walled*."** (Standalone EndCard → see
  change 8.)
- Rachel's button → **"Release comments to Calder & Hale"**.
- Eleanor's notice → **"Trentmoor is still reviewing. You'll see every comment
  together when they release them."** (Warning tint, as planned.)
- Remove the code badge from the comment cards (S0), or Greek it. Header: keep
  the document title in words. Greek the reference "WA–EIA–MST–001" and the
  round label. The progress bar keeps its four labels, which are plain English.
- Response chip "Points to P02 · §3" → **"Fixed in revision 2, section 3"**.
  Response text → **"Done — section 3 now gives the depth for each parcel."**
- Payoff row: show the badge flip **"In review" → "Accepted"** and the line
  **"In the project library · the AI can now cite this"**. Greek "P02 → C01".
- **Film cut:** drop shot 4 (the response typing, 120 f). The new mid-card
  "Comments arrive *together*." and the counter flip to "3 of 3 answered" at
  the end of shot 3 carry it. Standalone keeps shot 4.
- Add a third SeatLabel ghost for weight: a greyed, Greek'd third pane edge at
  the far right labelled `supplier` **"Netherfold Cabling · can't see this
  review"**, for 45 f during shot 2. It says "many firms, one project" without
  a word of copy, and it sets up clip 4's supplier. *(Optional. If it crowds
  the split, skip it; the card carries the message.)*

### 8. Close on a line that covers both halves, plus a call to action; sharpen the weak end cards

**Problem.** "Grounded in *your* record." speaks only to the document half of
the film; the last 49 s were about apps. The tagline "Document production and
control for infrastructure" is a category label, not a reason. There is no
call to action. A LinkedIn buyer who is interested has nowhere to go.

**Changes.**

- FilmClose, 165 f → **195 f**:
  - 0–50: **"Every answer from *your* record."**
  - 50–100: the line moves up and dims. Then **"Every tool, built by *asking*."**
  - 100–120: the wordmark.
  - 120: the tagline **"AI for infrastructure projects, behind the ethical
    wall"**.
  - 140: in sans 24 px `#c7c5be`, **"Book a demo"** plus the owner's URL. The
    owner supplies the URL; never invent a domain.
- Standalone EndCards:
  - Clip 2: "Findings, not *verdicts*. You decide." → **"Catch it before your
    *client* does."** "Verdicts" frames the product defensively; the buyer's
    fear is being caught out.
  - Clip 3: "Accepted means *citable*." → **"Only accepted work feeds the
    *AI*."** "Citable" is our word, not theirs.
  - Clips 1, 4 and 5 are good. Keep them.
- **Add a 75 f montage before FilmClose** (benchmark pattern 8, "rule of
  three"). A PromptHero cycles its last word chip-style over 25 f each:
  "Build a *consent tracker*." → "*RFI log*." → "*carbon report*." Each shows
  a 1-frame-glimpse Greek'd screen behind it. It turns two demo apps into "any
  tool you need".

### Frame ledger after all changes (film)

| Segment | Was | Now |
|---|---|---|
| FilmOpen | 90 | 69 |
| Clip 1 | 660 | 681 (shell −24, trace −30, mid-card +45, superseded beat +30) |
| Clip 2 | 510 | 435 (shot 2 −120, mid-card +45) |
| Clip 3 | 570 | 495 (shot 4 −120, two mid-cards +90, shorter split −45) |
| Clip 4 | 750 | 840 (chat edit +75, mid-cards +90, payoff +42, shots 3/6 −75, Q&A tightened −42) |
| Clip 5 | 720 | 585 (build compressed; mid-card +45) |
| Montage | — | 75 |
| FilmClose | 165 | 195 |
| **Total** | **3465 (115.5 s)** | **3375 (112.5 s)** |

The apps now begin at film **56 s** (was 61 s). Standalone clip 4 would be 840 +
135 = 975 f (32.5 s), over the 30 s ceiling. Cut its standalone version to
**body 765 f** by keeping only the second mid-card ("Same app. Different
*seats*.") and dropping shot 7's push-in hold by 30 f.

## Minor notes

- **Order.** Keep it: draft → check → review → accepted → build. It is one
  document's life and then the turn to tools, and the "accepted work feeds the
  AI" card is a clean hinge. But **post clip 4 first on LinkedIn**, not clip 1.
  It is the owner's headline and the most visual.
- **Missing for a consultancy director:** nothing says *my firm's know-how stays
  mine*. One option is a 30 f beat in clip 1's shell where the composer's
  "Style" chip reads **"Calder & Hale house style · private"**. That is cheap,
  true (org context, ADR-0020) and answers their second objection. Don't add a
  clip for it.
- **No outcome claim** ("weeks to hours"). That's right: nothing supports one.
  Don't add one.
- Clip 1 TrackedChange green on accept reads as "edited", not "added". Consider
  plain prose with the pills, and a brief success-tint flash instead.
- Clip 1 locator "p. 14 · §4.3 Groundwater": keep it. Page-level citation is a
  real buyer moment.
- Clip 1 prose: "benzo(a)pyrene up to 18 mg/kg" and "PAHs" are fine as texture
  and credible to engineers. Don't make them focal.
- Clip 2: the Accuracy finding is the best single "wow" in the document half
  (it caught a factual error against the GI report). Give it 30 f more hold if
  anything gets added back.
- Clip 4: "NCRs" and "tCO2e" are industry-standard for both buyer personas.
  Keep them.
- Clip 4 header badge "Published v1 · Rachel Bowen, 29 May 2026" → **"Open to 5
  organisations"**. The date logic is for us, not the viewer.
- Clip 5: the deck is mostly package slides. To read as a "dashboard deck",
  briefly show slide 6 (the summary chart) on the push path: a 15 f pass-over
  before landing on slide 4.
- Clip 5 commentary status: "Behind" in danger red is correct for project
  status (not withheld content), so the warning-tone rule isn't broken.
- **"Sandbox" on screen:** Infora's vocabulary keeps it, but buyers read it as
  "test environment". Where it must appear in UI, Greek it. In overlays and
  strips say **"draft"** or **"Calder & Hale workspace"** (both in the
  vocabulary list).
- **"Playbook"**, **"Promote"**, **"Freeze"**, **"Run details"**,
  **"definition v1"**: Greek them all whenever they appear. None is focal in any
  beat.
- **Cursor:** the plan is disciplined. Keep it. Do check that no cursor appears
  in the new chat edit (it is typing, so it should be caret only).
- **Thumbnail:** set each clip's LinkedIn cover frame to its strongest still:
  - clip 1: the source page with highlights
  - clip 3: the split
  - clip 4: the two-seat dashboards
  - clip 5: slide 4 full frame

  Never the ink wordmark.
