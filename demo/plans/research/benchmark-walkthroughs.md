# Benchmark: how competitors show a detailed product walkthrough

Researched 2026-10-05 for the four pillar walkthroughs (`../BRIEF.md`). It builds on
`demo/archive/2026-10-sizzle/research/benchmark-product-videos.md`, which covered short clips.

**How this was observed.** I downloaded the actual media and looked at frames.
Build's video I pulled frame by frame (1 per second). For Nomic, I downloaded both
tutorial MP4s and sampled them every 25 s, plus full-size frames, and I downloaded
every use-case illustration. For Harvey's *Workflow Builder Tour*, I took Mux
thumbnails every 4 s and its full subtitle track, which is the voiceover word for
word. For Legora's *Automating due diligence* I used the YouTube storyboard (one
frame every 2 s). I watched nothing with sound. Timings are accurate to about
±2 s. Anything marked *inferred* was not seen directly.

## The 10 strongest patterns to copy

1. **Say the task in the first 15 seconds, then do exactly that task.** Harvey's
   narration has the example by 0:13: "analyze a supply agreement and tailor the
   output based on whether you're representing the buyer or the supplier." Every
   later step serves that one task.
2. **Show the finished result briefly, then start from empty.** At 0:04–0:08,
   Harvey shows the completed workflow graph. At 0:12 it cuts to a blank canvas
   with "Add step". The viewer knows where the video is heading.
3. **Show the whole app to place the viewer, then work in a closer view.**
   Harvey's app sits at about 87% of the frame width on a dark textured
   background. It pulls back to the whole app at the start, after building, and at
   the end. Everything else is a push-in of 1.5–2.5×.
4. **Use one recognisable, realistic document from start to finish.** Harvey uses
   "Humacyte Supply Agreement.pdf" (*inferred*: a public SEC filing). Nomic uses a
   real public drawing set: Santa Clarita Valley Water Agency, *Well 201 VOC
   Treatment Improvements*, 69 sheets. Build uses Slough data-centre due diligence
   with SSEN grid-capacity maps. Specific data makes a demo believable.
5. **Show the AI's working steps, briefly.** Build shows "Searching uploaded files
   → Listing files → Finding project → +3 more". Nomic shows "Explored files",
   "Updated todos" and "Running the quality pass now to check for false
   positives". Harvey's runs show a working state and then stream the answer.
6. **Put a citation on every claim the AI makes.** Harvey puts numbered chips
   (23, 24 … 33) inside the cells of its "Summary Table of Key Suggested Changes".
   Build puts a green chip [1] after "Slough is characterised by robust grid
   infrastructure". Nomic's issue findings link to a cloud markup on the exact
   sheet ("S-6 shows EQUIPMENT PAD in right room only. M-6 shows pump skid pads
   …").
7. **Show control as well as speed.** Harvey spends about 2:33–2:43 on a "Manage
   build access" dialog (Owner / Can view / Can edit), then shows Publish.
   Nomic's drawing review has severity, an "Ignored" status and an open-to-resolved
   lifecycle. Buyers in professional firms look for who can see and who signs
   off.
8. **Let the cursor make every choice, at human scale.** Harvey's cursor is
   enlarged and moves smoothly (*inferred*: a Screen Studio-style tool), switching
   to an I-beam in text fields and a hand on options. Clicks land on visible
   labels such as "Supplier", "Add step" and "Publish".
9. **Narrate one step per sentence, at a calm pace.** Harvey's voiceover is about
   430 words in 2:57, which is about 145 words per minute. Each sentence follows
   the same shape: "We'll add a [block] that [does X]." It ends on a single
   payoff line: "If you can define the process you can build the workflow."
10. **Open on a quiet title and close on the wordmark.** Harvey opens with a
    serif "Workflow Builder" on off-white (0:00–0:03) and closes with a white
    wordmark on black (2:56). Legora opens on its wordmark and a small title,
    "Legora Agent: End-to-end VDR to DD report", and closes on the wordmark held
    for about 9 s. Neither uses a big sales card in the middle.

## Build (build.inc)

Source: <https://build.inc/walkthrough-video>. The page plays
`/uploaded/offering-animation.webm`: **29.9 s, silent, looping, 1080p**. Below
it are three steps: "Message Build" (email the AI worker, "Dougie"), "Expert
Judgement" and "Agents Execute".

**Observed, second by second.** The whole video is **composited onto a monitor
between two silhouetted viewers**, with a hand resting on a mouse. The screen
takes up about 48% of the frame width.

- 0–3 s: a blank document window over a New York photo.
- 5–9 s: navigation labels slide across the screen in large type ("Projects",
  "Site Sel…", "Analysis", "Asset Management").
- 10 s: a "Workflows" grid. "Technical Due Diligence" is the only sharp card;
  the others are grey placeholder blocks. A click ripple shows.
- 14 s: the full app. A ticked progress list (Geospatial Research, Air Quality,
  Environmental, Geotechnical, Hazards…) sits beside a signed "Note on
  Deliverable".
- 16–18 s: a prompt is typed: "Can you cross-check our Slough data center
  assumptions (power, cooling, connectivity)…". The agent's steps appear next to
  a Vault "Risk Assessment Matrix" graded A Power, B Acoustic, C Water.
- 20–22 s: a street map of Slough, then a site-radius map with utility lines.
- 26 s: "Dougie by Build", with the prompt "I've dropped in [SL004.pdf] DD.
  Please highlight the top risks…".
- 28 s: a report section "4.5.1 Power" with a citation chip.
- 30 s: "Appendix 2 - National Grid & SSEN Capacity, West London".

**Verdict.** The page is titled *Product Walkthrough* but it is a 30 s mood
loop. The data is excellent: real places, a real grid operator, a plausible
project code. The presentation works against it. The UI is small, shots last
1–2 s, and nothing can be read for long enough to check.

## Nomic (nomic.ai): the direct AEC comparison

Sources: <https://www.nomic.ai/use-cases> and its seven subpages:
[project research](https://www.nomic.ai/use-cases/active-project-research),
[drawing review](https://www.nomic.ai/use-cases/automated-drawing-review),
[BIM/IFC](https://www.nomic.ai/use-cases/bim-ifc),
[code compliance](https://www.nomic.ai/use-cases/code-compliance-of-drawings),
[detail search](https://www.nomic.ai/use-cases/firm-wide-detail-search),
[submittal review](https://www.nomic.ai/use-cases/submittal-review),
[Parse API](https://www.nomic.ai/use-cases/drawing-parse-api). On
<https://www.nomic.ai/learn> there are two videos:
`getting-started-2026-09-02c.mp4` (17:13) and `changelog-august-2026.mp4`
(18:28). The [YouTube channel](https://www.youtube.com/@NomicAI) has only three
webinars of about an hour each.

**The use-case pages contain no video.** Each page follows the same template:
Problem → Solution → "How it works" 01/02/03 → integration logos → an Aurecon
quote with "+30% productivity / +20% engineering capacity" → FAQ. The
illustrations are **recreated, stylised UI** on a green gradient, with the
secondary content blurred. Several carry **placeholder copy that has nothing to
do with AEC**: "Analyze the competitive landscape", "Create a marketing plan for
the product launch", "GadgetGuru_Review_202…", "Project name". Others are generic
issue cards ("Fire Door Label Required … Room 302").

**The getting-started video (observed).** This is a **raw Zoom-style recording**.
The founder appears on webcam in the bottom-left (about 18% of the frame). The
app fills about 80% of the width on a black letterbox. In order:

- Sign-up starts from the homepage (0:25), then onboarding questions.
- "Hey there, ready when you are." He types "tell me about this asset" while the
  23.7 MB drawing set uploads, with real waiting time (5:30).
- The agent's raw reasoning is shown, including search regexes (9:40).
- A "Construction Drawing Coordination Review" lists Issues (20) by severity,
  with a cloud markup on a sheet zoomed to 530% (14:20). The agent then says
  "20 findings recorded. Running the quality pass…".

Nothing is edited out and nothing is zoomed. The changelog video has the same
grammar, with two webcams.

**What Nomic stresses to AEC buyers.**

- **Vocabulary:** drawing set, sheets, QA/QC standards, specs, project manual,
  submittals and submittal log, RFIs ("RFI Anticipator"), cited PDF markups,
  Bluebeam, "native issues" that move "from open to resolved", quantity
  takeoffs, IFC.
- **Claims:** "every answer cited back to the source"; "380+ codes"; "80% faster
  code checks"; "respecting your existing access permissions"; it works inside
  Autodesk Forma, ProjectWise, Fieldwire, SharePoint and Egnyte.
- **Scope:** a single firm's knowledge, used to check and find.

**Where Infora can be more concrete.**

- Nomic never shows a document's controlled life. Its issues go back to *other*
  systems. Infora can show one document issued for review, commented on by the
  other organisation, answered, closed out and accepted, all on screen.
- Nomic never shows two people working together, and never shows anything that
  crosses between organisations.
- Nomic's citations point at a sheet. Ours should be **clicked open** to show the
  exact passage in the project library.
- Nomic's illustrations use placeholder copy. Every frame of ours carries
  consistent Wrenfield data.
- Nomic's only "how it works" footage is 17 minutes long. A credible two-minute
  edit is a real gap in the AEC market.

## Harvey: Workflow Builder Tour (2:57)

Source: <https://www.harvey.ai/resources/videos/workflow-builder-tour> (Mux, 1886×1080,
subtitle track = voiceover).

**Observed shot list.**

| Time | What is on screen |
|---|---|
| 0:00–0:03 | Title card |
| 0:04–0:08 | The finished graph, whole app |
| 0:12–0:16 | Empty canvas ("Harvey AI Staging" workspace visible, so this is a real recording) |
| 0:20–0:30 | Zoomed in: the "Edit workflow details" dialog, with the name and practice areas typed in |
| 0:32–1:58 | Blocks added one at a time, about 10–15 s each: file upload, selection list, conditional, prompt (413/4000 characters, typed visibly; a model picker showing Auto/GPT-4.1/Claude 3.7 Sonnet/Gemini 2.5 Pro), response, then the supplier branch. The camera alternates between the canvas and the settings panel |
| 2:00–2:04 | Pull back to the whole graph |
| 2:08–2:32 | A test run in chat: choose Buyer, then Supplier. The answer streams, with citation chips |
| 2:36 | A blurred whip transition |
| 2:40 | The access dialog |
| 2:44 | Publish |
| 2:48–2:52 | The whole app, then the workflow library |
| 2:56 | Wordmark |

**How the camera divides its time.** Of 45 samples, about 18% show the whole
app, about 73% are zoomed in, and about 7% are title cards. **No burned-in
captions are visible** in the frames I sampled. The earlier research note said
they were burned in; what I saw here says the captions are a subtitle track
only.

## Legora: Automating due diligence with the Legora Agent (3:34)

Source: <https://www.youtube.com/watch?v=TC68rB0uYXg>. The channel also has
Pleadings Matrix 3:26, Regulatory updates 3:09 and Lists 2:02.

**Observed.**

- 0:00–0:06: the wordmark, then a small title at upper right.
- About 0:06–1:00: **two presenters** (an engineering manager and a legal
  engineer) talk in a bookshelf set. Small name captions appear at mid-left.
- About 1:00–2:30: **a screen recording of the whole browser window** at about
  85% of the frame on cream, with **no zooms** and a normal-size cursor. It
  shows a prompt in a matter code-named "Project Cheesecake", a phased plan
  (Phase 0 → IV), a review table of the data-room documents with yellow and
  green highlights, a "Due Diligence Report [PROJECT NAME]" template, and a
  Word document full of red tracked changes.
- About 2:30–3:25: talking heads again.
- 3:25–3:34: the wordmark.

The screen is on for only about 42% of the runtime. There is an auto-generated
caption track, which *implies* a spoken voiceover; I could not retrieve its
text.

## Walkthrough grammar for the four Infora pillar videos

**Length and chapters.** Each video runs 1:50–2:10, with 5–6 chapters of 15–25 s
and one action per chapter. A thin **chapter rail** runs along the bottom margin
(for example "1 Draft · 2 Promote · 3 Issue · 4 Review · 5 Close out · 6
Accepted"). The current chapter is in ink and the others are muted. This is
Infora's equivalent of Harvey's "one task, step by step".

**Framing.** The video is 1920×1080. The app window is about 1680×945, centred
on a quiet backdrop taken from the design tokens, and stays legible at 1×. The
margin under the window is kept clear for captions and the rail. There is no
monitor, no silhouettes and no device frame.

**Camera.** Use three states only:

- **Wide** (1.0×, the whole app): about 55% of runtime.
- **Work** (1.3–1.6× on the active pane): about 40%.
- **Detail** (no more than 2.0×, for no more than 4 s): a citation passage, a
  typed field, a status chip. About 5%.

Moves ease over 600–900 ms and never happen mid-typing. Every chapter starts
Wide. This is deliberately less zoomed than Harvey (whose 73% zoomed loses the
sense of place) and more than Legora (whose 0% leaves the detail unreadable).

**Captions.** Bottom-left, in the margin below the window, never over the UI.

- Two lines: a small "2 / 6 · Promote" label, then one plain sentence of 8 words
  or fewer in the present tense ("Sam promotes the draft to the project
  library").
- They appear 300 ms before the action and hold until the next step.
- Names and organisations appear the first time a person acts ("Priya - Halden
  Engineering, reviewer"), like Legora's name supers.
- Hyphens, not em dashes.

**Cursor and typing.**

- One cursor per person, enlarged about 1.25×, on smoothed paths of 0.6–0.9 s.
- It pauses about 250 ms on a target before each click and shows a click
  ripple.
- Prompts are 120 characters or fewer and typed at about 15–20 characters per
  second (sped up, like Harvey's *(inferred)*).
- Long text is never typed. It streams in from the AI.
- In the collaboration video, two cursors carry name flags and both are on
  screen together. None of the four competitors shows this.

**How the AI appears.**

- A step list of 3–4 working rows, shown for 2–3 s (the Build/Nomic pattern).
- The answer streams at a readable rate, with citation chips.
- **One chip is always clicked**, opening the library document at the
  highlighted passage. Hold that Detail shot for 3 s. This is the beat that no
  competitor completes on screen.
- In the Tools video, the agent proposes a plan for the supplier KPI dashboard.
  The user approves it. Blocks appear in the builder while the chat narrates
  them, then the dashboard renders on Wrenfield supplier data, and is shared.
  This copies the order of Harvey's test → access → publish.

**Opening (0:00–0:08).**

- A title card: "Pillar 1 - Document management" plus one scenario line naming
  the Wrenfield document. Hold it 3 s.
- Then 3–4 s showing the **end state** wide (for example the accepted document
  with its record), with the caption "Where this ends".
- Then cut to the start.

**Closing (last 8–10 s).**

- Return to Wide on the end state, with a caption that says what is now true
  ("Accepted - part of the project record, with every comment closed").
- Then a 3 s wordmark card. No tagline montage.

**Narration script.** Write it per chapter at 135–145 words per minute, which is
about 260–290 words per video. Use one sentence per action and leave a 1–2 s gap
on each Wide shot. The captions are not the script. They are the
shortened version, so the silent render stands on its own.

**Data.** Use Wrenfield throughout, with consistent document numbers,
organisations and people across all four videos. Never show "[PROJECT NAME]",
"Project name" or blurred placeholder blocks. Unbuilt screens use the real
components, never a different style.

## Pitfalls seen

- **Mood instead of product** (Build): the UI is shrunk inside a staged scene,
  shots last 1–2 s, and the type slides across the screen. It is credible as a
  brand piece and not as a walkthrough.
- **Placeholder copy** (Nomic's illustrations, Legora's "[PROJECT NAME]"
  template): one non-domain string undoes the realism of everything around it.
- **Raw and unedited** (Nomic's 17 minutes): honest, but buyers will not watch
  uploads and regex traces. Compress waits with a visible "Working…" state;
  never pretend the answer is instant.
- **Too much zoom** (Harvey): the viewer rarely sees where they are in the app.
- **Too much talking** (Legora): more than half the runtime is presenters, and a
  silent render cannot rely on that.
- **Unverifiable numbers** ("+30% productivity", "80% faster"): leave them out.
  Also respect `demo/archive/2026-10-sizzle/research/product-inventory.md` §3.3. Show no training on
  customer data, and nothing crossing the ethical wall.
- **Big interstitial sales cards** between steps: the first Infora set's main
  fault. The chapter rail and captions replace them.
