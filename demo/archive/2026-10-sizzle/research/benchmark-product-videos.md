# Benchmark: how Harvey, Legora and peers make product videos

Researched 2026-10-04. **How it was observed:** I pulled the actual video files
or storyboards rather than relying on marketing copy. For Harvey, that meant Mux
storyboards (about one frame per second), Mux caption tracks (which show whether a
video has a voiceover) and the HLS durations. For Legora, I downloaded the
homepage and product-page MP4s and pulled frames every 0.7–1.5 s. For YouTube, I
read the storyboard sprites (one frame per second). I watched no video with
sound, so anything said here about the music is taken from the caption tags,
such as "(upbeat music)". Shot lengths are measured to within about ±1 s.
Anything marked *inferred* was not seen directly.

## The 12 patterns to copy

1. **Feature clips are about 24–31 s, use music only, and tell the story in a few
   large words.** Harvey's *Workflow Builder* (30.0 s), *Words to Workflows*
   (23.8 s) and *Visualize Legal Data* (31.5 s) have no voiceover: their caption
   tracks read only "(upbeat music)" or "(light music)". Their longer *Tour*
   videos (2–4 min) are the ones with narration. Our silent-with-text brief
   matches the benchmark's short format exactly.
2. **The rhythm runs text card, UI beat, text card, UI beat.** Harvey's 30 s clip
   is: logo 2 s → title 2 s → UI 5 s → "Start Simple" 2 s → UI 3 s → "Or Add
   Complexity" 2 s → UI 6 s → "Every workflow is *yours* to / shape, scale, and
   share." 4 s → end lockup 6 s. Each text card holds for about 2 s, and a
   phrase builds word by word across two cards.
3. **The UI is isolated and enlarged. It is never a whole screen.** Harvey
   lifts a single component (one dropdown, one chat turn, one plan table) and
   floats it, large, on a plain off-white field. The app's sidebar and chrome
   appear for about 1 s, to place the viewer, and then disappear.
4. **Only the focal element is readable.** Legora's loops "greek" every other
   line of text into grey bars and blur the background. The one thing you are
   meant to read stays sharp.
5. **The prompt is the hero shot.** Harvey types the request at display size
   ("Create a|n interactive liti|gation timeline"), filling the frame, with a
   blinking caret. Then it pulls back to the normal UI and clicks send.
6. **Words become structure.** In *Words to Workflows*, phrases in the typed
   request are highlighted ("upload a supply agreement", "buyer or the
   supplier"). The highlights lift out of the sentence, turn into blocks, and
   lock into a branching workflow graph. This is the strongest single
   reference for our agent-led builder.
7. **The agent's work appears as a step list with ticks.** Harvey's agent shows
   "Working…" with rows that go from a spinner to a ✓ ("Reviewing the financial
   report → Analyzing the revenue trends → Generating a summary → Finalizing
   sources"). Before acting, it asks the human to approve a plan ("Does this
   research plan seem right to you?" with a table and Edit / Submit buttons).
   Legora does the same with "Suggested next steps", a checklist and an
   "Approve plan" click.
8. **Show the rule of three, then a montage.** *Visualize* runs the cycle of
   prompt, then file chip, then rendered artefact three times (a timeline, a
   structure chart, a compliance dashboard). It then cycles "Create [chip]"
   with the chip changing quickly (financial_flow → regulatory_dashboard →
   witness_network). Harvey's *Create and Edit Files* does the same for
   Documents, Spreadsheets and Presentations. That lines up directly with our
   two apps (KPI dashboard, slide deck).
9. **One brand-wide type and colour system.** Harvey uses a serif wordmark and
   serif cards (with an italic accent word, "*yours*", "*agency*", "*You*"),
   a sans-serif UI, a near-white field (#f7f7f5-ish), and black (#111) bumper
   cards at each end. Legora uses a cream field, a dark green wordmark, and one
   flat accent colour per loop (orange, sage, grey-green).
10. **Open fast and close long.** Every Harvey clip opens on its wordmark within
    0–1 s. The end card holds for 3–6 s, which is 15–20% of the runtime, with a
    two-beat line ("Built by You." → "Built by You. Powered by Harvey.") before
    the logo.
11. **Use a cursor, but sparingly.** Cursors appear only at the moment of a
    choice (Add step, Approve plan, Submit, a file chip). Between those moments
    the UI animates by itself.
12. **Show trust through the product, not through badges.** No SOC 2 or padlock
    shots were seen in the feature clips. Trust appears as citations on output,
    "Finalizing sources", approve-the-plan gates, and in the long tours a
    "Manage access" sharing modal. *Agents Overview* also runs a staged
    clarifying question ("You mentioned 10-Ks. Did you want me to query EDGAR?").

## Harvey

Sources: [videos hub](https://www.harvey.ai/resources/videos),
[Workflow Builder 30 s](https://www.harvey.ai/resources/videos/workflow-builder),
[Workflow Builder Tour 2:57](https://www.harvey.ai/resources/videos/workflow-builder-tour),
[Agents Overview 50 s](https://www.harvey.ai/resources/videos/agents-overview),
[homepage](https://www.harvey.ai/) (60 s hero film),
[Agent Builder blog](https://www.harvey.ai/blog/introducing-agent-builder).
The other clips (Words to Workflows, Visualize Legal Data, Create and Edit Files)
are on the videos hub.

- **Formats.** Three tiers: feature stings of 24–55 s (music only, 1080p);
  tours of 2–4 min (screen recordings with an instructional voiceover); and
  customer films of 3–4 min (interviews over b-roll).
- **The look of the stings.** These are recreated or isolated UI, not raw
  captures. Components float on off-white, there are no device frames, and the
  scale is very large (a text input fills about 60% of the width). In the 30 s
  Workflow Builder clip the graph grows block by block, with a cursor on "Add
  step". At the climax it zooms out to show the whole branching tree.
- **The look of the tours.** These are real screen recordings, cropped tight,
  with pushes in on whichever panel is active. The app sits on a dark textured
  backdrop with soft shadow. Captions are burned in from the voiceover.
- **Homepage hero (60 s).** A brand film of paper collage and kinetic type,
  with clean UI cards cut in. It ends on the "H" monogram. Take only the
  alternation of texture and crisp UI.
- **Agents Overview (50 s).** The hook is a text card ("For all the times
  you've thought" → a stack of SEC filings → "'I can't believe I went to law
  school for this'"). Then "Now with more *agency*", a file drop, suggested
  prompts, the ticked "Working…" list, streamed answer text, a follow-up, a
  clarifying question, plan approval, a second step list, and the end card
  "Agents That Work Like You Do".

## Legora

Sources: [homepage](https://legora.com/) (two hero MP4s, 29.5 s and 12.9 s),
[Workflows page](https://legora.com/product/workflows) (four UI loops, plus an
"Introducing Workflows" 1:00 that I could not retrieve),
[YouTube @WeAreLegora](https://www.youtube.com/@WeAreLegora),
[aOS film 0:47](https://www.youtube.com/watch?v=PtAePtZt9Yk),
[Introducing the Legora Agent 1:28](https://www.youtube.com/watch?v=2UAwMMt1L4k),
[Introducing Lists 2:02](https://www.youtube.com/watch?v=Hx5dgtjkSGw),
[Workflows launch PR](https://legora.com/blog/legora-workflows-the-orchestration-layer-for-legal-work).

- **Homepage hero (29.5 s, 4K source).** Cinematic stock-style b-roll (a dusk
  skyline, silhouettes, faces) cut against glassy, frosted, almost 3D UI: a
  prompt typing "…organize the pro… and rename", "Generating plan", "Suggested
  next steps", "Approve plan", file icons swirling into particle clouds that
  resolve into "Building chronology" and "Creating task list", and output
  cards. Shots average about 2 s. The prompt is the first UI shot, at 3 s.
- **aOS film (47 s).** The same glass UI with no people. It ends on a small
  tagline, then the "LEGORA" wordmark on white, held for about 5 s.
- **Product-page loops (7–15 s each, silent, 1080², 1080×1440 or 1080p).**
  Each shows one interaction on a flat colour field: pick legal sources
  (orange), add a tabular-review column and open a cell (sage), "Update
  Payment Terms Clause" with a tracked-changes redline and "Apply edits"
  (cream), and create a workflow → "Add step" → tools menu (green, cut against
  musician b-roll). They loop seamlessly because the last frame matches the
  first.
- **YouTube launches.** Talking heads (a product lead in a bookshelf set),
  question title cards ("How does it work?") and about 15 s of screen recording.
  The brand campaign ships each feature as a 0:30 and a 1:2x cutdown, the same
  short-plus-long pairing as our brief.

## Adjacent and Nomic (brief)

- **Linear.** I did not watch these directly. From a [roundup](https://www.moonb.io/blog/product-launch-video):
  dark UI, no voiceover, ambient sound, sharp on-screen type, one job per
  45–90 s film, with the camera moving through the real product one action at
  a time.
- **Rogo** ([rogo.ai](https://www.rogo.ai/)). The hero is a 15 s skyline
  loop with no UI: mood, not demo.
- **Nomic** ([nomic.ai](https://www.nomic.ai/), [YouTube @NomicAI](https://www.youtube.com/@NomicAI)).
  There is **no product video**. The homepage uses static screenshots in
  device frames and sketch/drawing/construction photography. YouTube has only
  three webinars or fireside chats of about 1 hour each. **Our sector has no
  polished product-video benchmark yet**, which is an opening for us.

## Do / don't: our 20–30 s clips

**Do**
- Open on the Infora wordmark, or a 1-line problem card, within the first
  second. The first UI shot should arrive by about 3 s.
- Build each clip as 3–4 UI beats separated by text cards of about 2 s
  (5–7 words, serif, one italic accent word). Hold the end card for 3–5 s.
- Show the request as a large typed prompt. Then show the agent's step list
  ticking through the builder's steps (sources → data → layout → preview).
  This is the visual answer to the owner's point that the builder is too
  step-led.
- Lift phrases out of the prompt into builder blocks, as *Words to Workflows*
  does. Use it for "supplier KPIs" → data source and "dashboard" → layout.
- Include one human gate per clip ("Does this plan look right?", then
  Approve). It shows control, and it is honest about the ethical wall.
- Put citation chips on generated figures and narrative text, and end on the
  produced artefact (a KPI dashboard, a slide deck).
- Float isolated components on a plain field. Grey-out or "greek" the
  non-focal text. Keep zooms to slow pushes (about 1.0→1.15× over 2–3 s) plus
  one zoom-out reveal per clip.
- Show a cursor only at clicks. Ease it, and keep it fixed in size.

**Don't**
- Don't show full-screen app captures at 1:1 scale. The text is unreadable at
  social sizes.
- Don't hold any text card for more than about 2.5 s, or put more than about
  8 words on screen at once (outside the UI).
- Don't use stock people, skylines, padlocks or "SOC 2" badges. We have no
  footage budget, and the benchmark shows trust through the product.
- Don't show more than one new idea per beat, or fill the gaps with cursor
  wandering.

## Do / don't: the ≤2 min joined film

**Do**
- Use one bumper system throughout. Open on a black or ink wordmark card
  (1–2 s), then a hook card. Each feature enters with the same title-card
  transition (Harvey style: off-white card, serif label, then a hard cut or a
  short cross-fade into the UI).
- Order the film as: hook (problem) → the agent builds app 1 → the agent builds
  app 2 → a "rule of three" montage ("Build a [chip]", with the chips cycling
  through other apps) → a trust beat (citations, the wall, an approval) → end
  lockup.
- Close on a two-beat line, then the wordmark, held for 4–6 s, e.g. "Described
  by *you*." → "Built by Infora."
- Cut the 20–30 s clips so each one starts and ends on the shared off-white
  field. Joining them then needs no extra transitions.

**Don't**
- Don't re-run each clip's logo open and end card inside the film. Strip the
  bumpers and keep one at each end.
- Don't change the background colour or type treatment between clips. A
  per-clip accent colour, as Legora uses, is fine.
- Don't make it longer than 2:00. Harvey's music-only films stop at about
  60 s, and anything longer needs a voiceover or a person on camera.
