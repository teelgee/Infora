# Infora product inventory, for the demo videos

Prepared 2026-10-04 for the build agents working under [demo/BRIEF.md](../BRIEF.md).
This is the reference for **what Infora is, what to show, what to call it, what it
looks like, and what never to claim**. Every fact cites the file it came from.
Where this file and a cited source disagree, the source wins.

Status marks used throughout:

- **BUILT**: running in the app today, usually photographed in
  `docs/architecture/user-story-screens/` (all shots are **1440×900**, 16:10,
  light theme; they need scaling or letterboxing in a 1920×1080 frame).
- **RULED, NOT BUILT**: decided in an accepted ADR, not built yet. Safe to show
  as vision, provided it matches the ruling.
- **OWNER'S NEW VISION**: in the 2026-10-04 brief, not in the decision record,
  and in one case **against** a recorded ruling (flagged where it applies).
  Show it as the vision, and never present it as a contradiction of the wall.

---

## 1. The pitch, in plain English

**What Infora is.** Infora is where an infrastructure project's documents get
written, checked, reviewed and controlled, with AI doing the heavy lifting.
Several organisations work on one project: the client who owns it and the
consultancies and contractors it appoints. Each one's work stays behind its own
wall. The AI drafts from the project's own approved documents and shows
exactly where every claim came from.
(Sources: `CLAUDE.md`, `docs/architecture/infora-overview.md` "What Infora is" and "The wedge".)

**Who buys it.**

- **Infrastructure consultancies** (environmental, engineering and planning
  firms) that produce the documents a scheme needs: EIA chapters, method
  statements, flood risk assessments, consultation statements. They buy
  faster drafting and checking, plus a private toolkit (their "org context":
  rulebooks, precedents, templates, and later their own apps) that goes with
  them to every client project and never leaks across.
- **Their clients**, the infrastructure owners (in the demo world, an energy
  network owner promoting a 400kV connection). They buy one controlled record:
  a deliverable plan, review in a PDF viewer instead of emailed spreadsheets,
  and an AI that only relies on documents the client actually accepted.
- The overview's long-term pitch is a platform on which firms build their
  *own* AI tools for the sector (`infora-overview.md` "The wedge and the
  long-term vision"). The app builder is the first piece of that.

**The four strongest selling points.**

1. **AI that cites, not AI that guesses.** Drafts are grounded in the project
   library. Each claim carries a source pill that opens the exact passage, with
   page where the source has pages. Unsupported sentences are withheld, not
   shipped (`v1.md` "Real in V1": locator T-271, page T-305; `CONTEXT.md`
   "Grounding", "Citation"; `t1-12-result.png` prose: "sentences withheld for
   resting on no source").
2. **Rival firms on one project, safely.** The ethical wall is the default, not
   a setting. It is enforced in the database itself (row-level security), not
   only in screens. Withheld content is *stated*, never silently hidden
   (`CONTEXT.md` "Ethical wall"; `v1.md` "Three organisations"; walkthrough
   beat `19a-record-wall`). Infora's overview says plainly that a single-firm
   tool cannot make this claim.
3. **Document control that is already in the product, not bolted on.** It
   follows ISO 19650: plan first (every reference generated), sandbox drafting,
   internal QA, promotion, PDF review with anchored comments, acceptance codes,
   a live review record (the DRR) instead of a spreadsheet, the project
   library, and supersede or withdraw with a reason. Acceptance decides what
   the AI may rely on (`docs/architecture/user-stories.md`; `CONTEXT.md` "The four axes", "Context state").
4. **Build your own tools, chat-first** (vision, partly built). A team
   describes an app and an agent builds it: tables, screens, a schedule, a
   written insight each run. The same app shows the client every
   organisation's figures and each contractor only its own, because the app
   acts as whoever is looking at it (`docs/architecture/adr/0056-the-app-model.md` §4).

A fifth point for any compliance-minded buyer: **the checker finds defects, it
never gives verdicts, and it applies nothing without a person**
(ADR-0048; `CONTEXT.md` "Finding").

---

## 2. Candidate features for the videos

Ordered roughly by how well each sells. "Screens" lists real screenshots in
`docs/architecture/user-story-screens/` and mockups in `docs/design/mockups/`.

### 2.1 Grounded, cited AI drafting (the flagship)

- **What the user sees.** In the Editor, a document on a serif canvas with the
  agent's chat panel on the right (tabs: *Chat · Comments · Checks*). The
  composer reads "Ask for a draft into this document". Beneath it are
  source-row chips: *From the library · Attach a file · Prompts · Style · Web
  search · Sandbox search · Model* (`09-editor.png`). The agent shows a run
  trace in the past tense ("Retrieved sources", "Ground-checked claims",
  "Suggestion drafted"). It then proposes a **suggestion callout** with
  Accept / Edit / Refine / Reject. The callout's prose carries **source pills**
  labelled with the document reference (for example `WA-GEO-GIR-004`) after the
  claim each one backs. Clicking a pill opens the source passage.
- **The document creator** is the structured version (built): say what kind of
  document and register; pick the style guides; compose an outline section by
  section; bind library sources (each with a one-line description); then read
  "The document this will write" as section-by-section descriptions. Fix any
  section with **Ask the agent**. Afterwards the coverage line confirms it: "4
  of 4 sections written · 2 of 2 sources used".
- **Why it sells.** It answers the first objection every consultancy has
  ("will it make things up?"). The plan is shown *before* anything runs; the
  sources are chosen *before* drafting; every claim is traceable.
- **Status.** BUILT: editor drafting, citations to a character span and page,
  the ground-check, and the document creator (`v1.md`; walkthrough "The
  document creator" section). Citation rendering ships two registers, Record
  and Inference. The Authority register (legislation, policy) is **RULED, NOT
  BUILT** (`v1.md` "Named deviation"). A video may show an authority pill
  (slate-blue `auth` SourceChip variant) as vision.
- **Screens.** `09-editor.png` (editor plus composer chips; no suggestion is
  visible); `t1-02-launcher.png` to `t1-14-from-the-working-area.png`
  (document creator: `t1-08-proposal`, `t1-09-agent-pane`,
  `t1-10-agent-revised`, `t1-12-result` are the best). **No screenshot shows a
  cited suggestion or the source panel.** Recreate them with the
  `SuggestionCard`, `CitedProse` and `SourceChip` components (section 4). Use
  real passages from the seed library (section 5.4) so the cited text matches
  the quoted source.

### 2.2 Ask, with Lens

- **What the user sees.** A chat over the whole project with cited answers. A
  **Lens** chip picks how the answer is written for the reader: *Planning &
  Environmental · Engineer · Project Manager · Communications*. A cited claim
  opens the **source panel**, showing the source as a document with its state
  badged (`docs/design/ui-vocabulary.md` "Panel").
- **Why it sells.** It is the Harvey/Legora-style moment: ask a hard question
  about the scheme and get a cited answer in seconds. The Lens shows domain
  depth: the same question, answered for an engineer versus for a
  communications lead.
- **Status.** BUILT (Lens in Ask only, V1). Not photographed. Lens changes
  *register, never reach*, and the picker says so (`CONTEXT.md` "Lens").
- **Screens.** None. Recreate it.

### 2.3 The QA checker

- **What the user sees.** Tools → QA checker. Pick the draft. A switch chooses
  between the quick and the full check. Tick checks (Accuracy, House style,
  Internal consistency, Readability "No AI", Completeness "No AI"). Attach a
  document if wanted. Click **See the plan** for numbered steps and a
  "Covers:" line, then **Run the check**, with steps ticking off live. A "What
  was checked" summary matches the plan sentence. In the Editor, findings are
  **underlined marks in the text** plus a **Checks (5)** panel grouped by
  check. Each finding has a severity badge (Advisory / Required) and *Go to
  it*. A house rule is quoted as a grey quotation block with its clause number
  ("§2.1 (project style guide)"), never as a source pill. A finding grounded in
  the record gets a pill. **Accept 1 mechanical correction** (a primary button)
  sits above the mechanical fixes only, and every rewrite is read one at a
  time (Accept / Edit / Dismiss).
- **Why it sells.** A visible, honest assistant to a senior reviewer: it says
  what it read ("6 of 6 sections read · 5 passages of the record read"),
  refuses to apply a fix to text that has changed under it, and never
  auto-applies.
- **Status.** BUILT (ADR-0048, ADR-0053; walkthrough "The QA checker" section).
- **Screens.** `t2-05-plan.png`, `t2-06-progress.png`, `t2-06-run.png` (plan
  and result in one frame), `t2-07-marks.png` (best single frame), `t2-08-panel.png`,
  `t2-09-drift.png`, `t2-10-accept-all.png`, `t2-11-rewrite.png`,
  `t2-12-dismiss.png`, `09c-checker-marks.png`.

### 2.4 Cross-organisation review behind the ethical wall

- **What the user sees.** The client's lead reviewer (Rachel Bowen, Trentmoor
  Energy) opens the PDF of `WA-EIA-MST-001 P01` in Infora's viewer. She
  highlights text, writes a comment and codes it (S0 to S5, A1...). Each
  comment lands in one live record beside the page. A four-step bar reads
  *Submitted → In review → Responding → Complete*. **At the same moment**, the
  consultant (Eleanor Price, Calder & Hale) sees the same round with an amber
  notice: "The round is open. Its comments are withheld until the lead
  reviewer closes the round and issues it". Then the lead closes and issues the
  round with one code. The consultant answers every comment by pointing at the
  change in version two, or by saying "no change, and why".
- **Why it sells.** It is the moment that differentiates Infora. A split
  screen of the two seats, the same round, makes the wall visible in two
  seconds. It also kills the emailed comment spreadsheet.
- **Status.** BUILT (walkthrough Acts IV to VI).
- **Screens.** `17-commenting.png`, `18-round-open.png` (reviewer seat),
  `19-wall.png` (consultant seat; **pair with 18 for a split screen**),
  `19a-record-wall.png`, `18a-moderation.png`, `20-completion.png`,
  `21-issue-modal.png`, `22-respond.png`, `23-responses.png`,
  `24-round2.png`, `24a-record.png`, `25-accept-modal.png`,
  `27-accepted-status.png`.
- **Also wall-relevant.** In the workspace, the topbar pill reads
  "Org-private — no project context reachable here" (`01-workspace.png`).

### 2.5 The deliverable plan and document control

- **What the user sees.** "Deliverable plan" with a TIDP badge: a table of
  coded references (`WA-EIA-MST-001`, `WA-DRN-SUR-001`...), titles,
  discipline, status code, security classification, and status badges
  (*Planned*, *In production*). Buttons: *Coding scheme · Columns · Import from
  Excel · + New deliverable*. Next comes the bind card ("binding is a
  confirmation, never a side effect"), then Freeze, the internal QA round, and
  the promotion window that *reconfirms* (reference locked, reviewers listed,
  ten-working-day review period prefilled). Finally the **project library**,
  split into *Live deliverables* and *Reference material*.
- **Why it sells.** It is the ProjectWise-replacement story: the plan decides
  first, references are generated and never invented, and acceptance flows
  straight into what the AI may use.
- **Status.** BUILT.
- **Screens.** `00-schema.png`, `00b-acceptance-codes.png` (the "grounds"
  column: what the AI may rely on), `02-plan.png`, `03-plan-detail.png`,
  `07-bind.png`, `08-sandbox.png`, `10-gate-refused.png`, `11-frozen.png`,
  `12-qa-round.png`, `13a-promotion-window.png`, `14-promoted.png`,
  `15-submitted.png`, `26-library.png`.

### 2.6 "The AI stops relying on it": withdraw, supersede, context state

- **What the user sees.** The owner withdraws a deliverable *with a mandatory
  reason*. The row stays, now badged "Withdrawn from the library" plus an amber
  "Not used for AI answers — withdrawn". Before the click, a blast-radius
  confirmation shows the consequence.
- **Why it sells.** It is a strong, unusual trust beat: retiring a document
  takes it out of the AI's reach without deleting the record.
- **Status.** BUILT. **Screens.** `27a-blast-radius.png`, `28-withdraw.png`,
  `29-withdrawn.png`, `30-context-state.png`.

### 2.7 External issue to someone with no account

- **What the user sees.** From the library row, *Issue externally...*: the
  recipient's name and email, a **reason** (kept on the record) and a
  **message** (which they read), plus a link expiry. The recipient's page shows
  one revision of one document ("For the attention of Mrs A Patel... expires in
  30 days") with Download PDF and Download .docx. The sender's log later shows
  "Opened".
- **Why it sells.** It is a nice 5-second closer for a document-control video.
- **Status.** BUILT, except actual email sending (the link is handed back to
  the sender). **Screens.** `26a-external-issue.png`,
  `26b-external-link.png`, `26c-external-document.png`,
  `26d-transmittal-receipt.png`.

### 2.8 Knowledge: a style guide becomes rules

- **What the user sees.** A project style guide is uploaded and becomes a list
  of typed rules that a person accepts (term, pattern, structure, measured,
  judgement). Two shelves: the firm's own and the project's.
- **Why it sells.** It explains *why* the checker's findings are trustworthy.
  It is secondary for a 2-minute film.
- **Status.** BUILT (ADR-0054, T-422 to T-430). Not photographed.

### 2.9 The app builder, re-cast chat-first (the owner's headline ask)

See section 6 for detail. In summary:

- **Built today** (T-439 to T-445, all built 2026-09-06 to 09-07,
  `docs/build/plan.md` lines 660-668): a **seven-step builder** with the agent
  in a side pane, app tables with an optional acceptance step, generated
  screens from a closed set of blocks (including bar, line-with-trend and pie
  charts), manual runs that write an insight, export to a file, and
  playbooks.
- **OWNER'S NEW VISION, and it reverses a recorded ruling.** ADR-0056's
  2026-09-06 addendum, ruling 6, says: "Declined: a chat that fills the steps
  in... Revisit after the owner has built the returns app in the builder
  (T-446)". The brief is the owner reopening that ruling for the videos. Show
  it as vision. Keep what the ruling protected: **the agent must still ask the
  three wall questions, and every answer visibly lands in a step** (section 6.3).
- **Screens.** Mockups `docs/design/mockups/app-builder-stepped-flow.html` and
  `returns-app-two-seats.html` (both approved by the owner, "these are
  perfect"). No screenshots. Built code: `apps/web/src/screens/app-builder.tsx`,
  `app-screen.tsx`, `apps.tsx`, `playbooks.tsx`.

### 2.10 Runs and insights

- **What the user sees.** On the client's dashboard, an "Latest insight" card:
  "Run 1 Sep 2026, 02:00 · scheduled · acted as Rachel Bowen over 14 rows in
  Monthly returns · definition v3 · All runs →". It holds one paragraph in
  which **the numbers are computed in code and the model only writes the
  sentence** (`plan-history.md` T-443).
- **Why it sells.** Yes, briefly: "a written analysis every month, and it shows
  its working" is the payoff shot of the KPI app.
- **Status.** BUILT for manual runs ("Run the analysis now"). The schedule is
  stored but **not honoured** until a server stays on (ADR-0056 §13d). A video
  may show "scheduled" as vision.

### 2.11 Playbooks

- **What the user sees.** "Save as a playbook" puts the app on the firm's
  playbook shelf in its own workspace. Deploying it into the next project
  creates a fresh, **empty** app instance.
- **Why it sells.** Yes, as a 5 to 8 second tag on the app-builder video: "your
  firm's know-how, reusable on every project, with none of the last client's
  data". This is the build-your-own moat story.
- **Status.** BUILT (T-445). The rule to respect on screen: **a playbook
  carries structure, never rows of any origin** (ADR-0056 §10;
  `CONTEXT.md` "Playbook").

### 2.12 Lower priority or not recommended

- Sandbox structure assistant (`04-structure.png`: "A folder tree, asked for in
  words"). BUILT. Useful as a quick "agent inside the product" beat.
- Schema import from a spreadsheet (owner): BUILT. Thin visually.
- Word add-in, Microsoft 365 Copilot `@Infora`, GIS/CAD/BIM, ProjectWise
  connectors, the authority corpus: all deferred (`v1.md` "Out"). Show only
  fleetingly, if at all, and only as "coming".

---

## 3. Words on screen

### 3.1 Use these (from `CONTEXT.md` and `docs/design/ui-vocabulary.md`)

| Say | Meaning, and notes |
|---|---|
| **Organisation** | A company with an account. Never "company" or "tenant". |
| **Workspace** | An organisation's own environment ("Calder & Hale — workspace"). |
| **Project** | One scheme: "Wrenfield–Ashcombe 400kV Connection". |
| **Owner / Member** | The project roles (badges top-right: "● Owner", "● Member"). |
| **Client / Consultant / Contractor** | The role an organisation plays on a project, not an account type. |
| **Ethical wall** | Isolation between organisations; the default. |
| **Deliverable plan** | The TIDP (one firm's) or MIDP (the owner's consolidated view). |
| **Project library** | The approved documents the AI grounds on. |
| **Reference material** | Received documents loaded into the library (badge "Reference"). |
| **Sandbox** | Where drafts live, with no document controls ("No document controls" pill). |
| **Bind / Freeze / Promote** | The three crossings. Promote = hand a frozen version into review. |
| **Review cycle / round / review record** | The DRR is "the review record" on screen. |
| **Lead reviewer / review group / lead author** | Review roles. |
| **Acceptance code** | S0 to S5, A1, An... The terminal verb is "accept" by default. |
| **Source** | The inline pill after a claim. "Cited" / "sources" are fine in captions. |
| **Suggestion** | An agent-proposed change, ruled on by Accept / Edit / Refine / Reject. |
| **Finding** | One checker result. It states a defect. |
| **Run** | One recorded agent execution; "Run details" opens the steps. |
| **Tool** | What users launch on the Tools page (document creator, QA checker, apps). |
| **App / app table / playbook / insight** | The app builder's nouns (`CONTEXT.md` "App", "App table", "Playbook"). |
| **Lens** | Ask's writing persona (capital L). |
| **Attached source** | A file the user pins; shown as user-supplied, never cited. |
| **Context state** | On screen: "Not used for AI answers — withdrawn". |

**Copy style** (`.claude/skills/infora-design/readme.md` "Content fundamentals"):

- Sentence case everywhere.
- Say the number ("7 of 11 deliverables drafted").
- Past tense for what the system did; imperative for what the user can do.
- No emoji. `✦` is the only typographic mark, used for Ask and the agent.
- The product UI never says "I" or "we". The approved app-builder mockup's
  agent does say "I've written two screens". Keep agent first person to a
  minimum and prefer the "Done — ..." form.
- Withholding is stated, never hidden ("2 sources withheld — outside your
  organisation's access", in warning tone, never danger).

### 3.2 Avoid these words on screen

- **company / tenant / customer account**: say organisation.
- **contributor, viewer**: retired roles. Say member, participant, reviewer.
- **workflow** as a thing users open: say **tool**. "Workflow" is the engine's word.
- **citation chip**: the pill is a **source**.
- **task**: reserved, not built. Don't label work as tasks.
- **deliverable** for every work item: it is reserved for formal outputs. A
  draft is a "draft" or "document".
- **suitability**: the older word. Prefer **status code** (the plan screenshot
  still says "Suitability code", so don't zoom on it).
- **archive** as a place a document "moves to": superseded and withdrawn
  documents **stay in the library** and only leave the AI's reach.
- **approve** as the default verb: "accept" is the default; "approve" is a
  per-project label.
- **compliant, certified, approved by AI, verified, guaranteed,
  hallucination-free**: the system "does not give an unqualified professional
  opinion" (`CONTEXT.md` "Finding").
- **copilot** for Infora's agent: it collides with Microsoft 365 Copilot, a
  separate surface.
- **bot, assistant persona names, "Infora AI"**: the product has no persona.
- **AI-generated / drafted by AI** stamps on exports or app files: ruled out
  (ADR-0056 §8; `CONTEXT.md` "App").
- **wizard**: the brief's whole point is that the builder isn't one.

### 3.3 Claims we must NOT make (each one contradicts an accepted ADR or the built record)

1. **Not** "your data trains our AI" or "the AI learns from every customer's
   documents". The moat compounds by retrieval and codified workflows, **never
   by training a shared model on customer data**. Infora's own product may
   improve only from a de-identified characterisation of *what people
   changed*, held in readable artefacts (rules, Lens definitions), never in
   model weights, and never a scheme, figure, firm or person (ADR-0026 as
   amended 2026-08-26; `CONTEXT.md` "Signal"). Safe line: "Your documents never
   train a shared model." Better still, say nothing about training.
2. **Not** any suggestion that one organisation's material, rulebook, prompts
   or agent runs reach another. Org context **steers but never grounds**, is
   never cited, and never crosses the wall, *not even to the project owner*
   (ADR-0018, ADR-0020, ADR-0021). A finding quoting Calder & Hale's manual
   must never appear in Trentmoor's seat.
3. **Not** "the client sees how the AI drafted it" or "full AI audit for your
   client". The run record is **producer-private**; the owner sees documents,
   never agent internals (`v1.md` "four wall negatives"; memory note "Audit
   liability model"; ADR-0018 note on Runs).
4. **Not** "the owner can see everything". The owner sees what is shared,
   promoted or submitted. A member's private sandbox is reachable only by an
   **audited, exceptional override** (ADR-0018). In the app builder, the
   client does **not** see a contractor's **draft** rows, only submitted ones
   (ADR-0056 addendum, ruling 3). The client's screen says "No return yet".
5. **Not** "the AI approves", "AI-checked and compliant", or "one click to fix
   everything". Findings state defects, never verdicts. Fixes are never
   auto-applied. Bulk accept exists only for *mechanical* substitutions;
   rewrites are read one at a time (ADR-0048; walkthrough `t2-10`, `t2-11`).
6. **Not** citations to sandbox drafts, uploads or web results as if they were
   grounded. Attached sources are badged user-supplied and **never cited**
   (ADR-0022). The AI never grounds on the sandbox automatically (ADR-0011).
7. **Not** a Lens that unlocks or hides data. A Lens changes register, never
   reach (`CONTEXT.md` "Lens").
8. **Not** "the app has its own admin powers" or a "service account". An app
   acts as whoever is looking at it, and a scheduled run acts as its owner,
   narrowed to the tables it declared (ADR-0056 §4 to §5).
9. **Not** "playbooks bring your last project's data". A playbook carries
   structure only. Every table starts empty (ADR-0056 §10).
10. **Not** live outward integrations that write to a client's systems without
    approval. Connections are owned by the system's organisation, the key is
    written once and never read back, reach is declared, and **writing out
    needs the project owner's approval** (ADR-0057). Built connections do not
    exist yet (deferred to deployment).
11. **Not** "deleted" for superseded or withdrawn documents. They stay as
    records and leave the AI's reach (ADR-0013).
12. **Not** certifications as achieved: SOC 2, Cyber Essentials, G-Cloud and
    GDPR are listed as the security posture (`infora-overview.md`
    "Governance"), not as held certifications. Don't show trust badges. "Speaks ISO 19650" is fine;
    "ISO 19650 certified" is not.
13. **Not** real companies, people or clients anywhere: no National Grid, no
    Network Rail, no real consultancies, no Nomic, Harvey or Legora names on
    screen (brief). `CONTEXT.md` uses "National Grid" as an example. Do not
    copy it.
14. **Not** "the agent decides who sees what" in the builder. The platform
    decides row by row. A builder's screen choices can only **narrow**, never
    widen (ADR-0056 §4). On-screen line from the mockup: "Whatever a screen is
    told to show, the platform decides row by row what each viewer may see."

---

## 4. The design system, for rebuilding the UI in React

The authorities are `docs/design/design-tokens.json` (tokens) and
`docs/design/design-rules.md` (rules). The mirrored, ready-to-use kit is
`.claude/skills/infora-design/`. Production CSS is
`packages/ui/src/styles.css` (2,027 lines) plus `packages/ui/src/tokens.generated.css`.

### 4.1 Files you can copy directly

| Path | Use |
|---|---|
| `.claude/skills/infora-design/styles.css` | Entry point. It only `@import`s the files below. |
| `.claude/skills/infora-design/tokens/colors.css` | All colour custom properties (light). |
| `.claude/skills/infora-design/tokens/dark.css` | Dark remap under `:root[data-theme='dark']`. |
| `.claude/skills/infora-design/tokens/{typography,spacing,radius,elevation,motion,fonts}.css` | The other token groups. `fonts.css` imports Source Serif 4 from Google Fonts. |
| `.claude/skills/infora-design/chrome.css` | The class vocabulary (508 lines): `.frame-content`, `.wordmark`, `.rail-nav`, panes, chips and so on. |
| `.claude/skills/infora-design/components/**/*.jsx` | Plain React components: Button, Badge, Chip, SourceChip, Card, WithheldNotice, AppFrame, Rail, RailNav, Pane, PaneHeader, ProjectCard, SuggestionCard, Table, RunTrace, CitedProse, Prose, ChatComposer, ChatBubble, Modal, Drawer, DropdownMenu, form fields. Each has a `.prompt.md` usage note. They read from `window.DS` in the kit, so swap that for imports. |
| `.claude/skills/infora-design/ui_kits/app/*.jsx` | A click-through recreation of Workspace, Editor, Library and Sandbox, including inline Lucide SVG paths for the nav icons. |
| `packages/ui/src/*.tsx` | The production components (`rail.tsx`, `app-frame.tsx`, `cited-prose.tsx`, `suggestion-card.tsx`, `run-trace.tsx`, `progress-rail.tsx`, `chat-composer.tsx`, `table.tsx`). They import `@infora/contracts` types, so copy the markup, not the imports. |
| `docs/design/mockups/app-builder-stepped-flow.html`, `returns-app-two-seats.html` | Self-contained HTML with tokens inlined at the top. Good to lift layouts for the builder and the two app seats. |

**Logo.** There is **no logo file and no brand mark** anywhere in the repo
(skill `readme.md` "Sources": "none was invented"). The wordmark is an **18×18px
near-black (`#1c1b18`) square with 4px radius**, followed by **"Infora" in
Source Serif 4, 18px, regular weight**, with an 8px gap (`packages/ui/src/styles.css`
line 165; `chrome.css` line 60). Recreate it in CSS. Do not invent a mark.

### 4.2 Colour (light theme; hex exact)

There is no brand hue. The accent **is** near-black. Hue is reserved for five
status tones and for tracked changes. Using a status colour for generic
emphasis breaks the system.

| Role | Hex |
|---|---|
| Frame (app shell background, behind everything) | `#dedad0` |
| Frame hover / frame active (nav item selected) | `#e5e3dc` / `#c9c5b8` |
| Pane (white cards) | `#ffffff` |
| Sunken (nested cards, chip fills, composer, hover on pane) | `#efeeeb` |
| Active fill | `#ececea` |
| Row hover | `#faf9f7` |
| Border default / subtle / strong | `#ececea` / `#f2f1ed` / `#e0ded8` |
| Text primary / secondary / muted / faint | `#1c1b18` / `#57564f` / `#78766f` / `#c7c5be` |
| Document prose text | `#2c2b28` |
| Primary button bg (hover `#000000`), text | `#1c1b18`, `#ffffff` |
| Focus ring | `#cfcac0` (3px) |
| Success: text / dot / tint | `#1a7a3a` / `#2f9e52` / `#e8f5ea` |
| Warning: text / dot / tint | `#8a5a12` / `#c4901f` / `#f8efdd` |
| Danger: text / tint | `#b23b34` / `#fbeceb` |
| Info (slate; authority sources, Owner badge, "In review"): text / tint | `#274a6d` / `#e9eff6` |
| Neutral dot | `#c7c5be` |
| Tracked insert: text / bg / underline | `#1a7a3a` / `#e8f5ea` / `#2f9e52` (1.5px) |
| Tracked delete: text / bg | `#b23b34` / `#fbeceb`, line-through |
| Modal scrim | `rgba(20,20,20,.28)` |

Dark mode ramp (if used): `#100f0c` frame, `#1c1b17` pane, `#25241f` sunken,
`#ece9e1` text (`design-tokens.json` `neutralDark`). Only the Editor has been
verified in dark, so **the videos should stay light**.

**Seat colours for video overlays only (not product UI).** The walkthrough uses
lane colours to label whose seat a screen is: consultant `#6d5dd3`, client
reviewer `#159a74`, internal QA `#b8622f`, external `#8a6d3b`
(`scripts/user-story-walkthrough/build.mjs` `:root`). They are handy for
captions like "Calder & Hale's view" or "Trentmoor's view", but keep them out
of the recreated app chrome.

### 4.3 Type

- **Serif: Source Serif 4** (Google Fonts, `family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600`).
  Used for the wordmark (18px), page greeting/H1 (29px, weight 500, line height
  1.3), section H2 (24px), project titles (15.5px), and **all document prose**
  (15.5px / 1.75, measure 560 to 600px). With Remotion, use
  `@remotion/google-fonts/SourceSerif4`.
- **Sans: the system stack** `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto...`.
  The screenshots show SF Pro (macOS). For deterministic renders, load
  **Inter** (it is already in the token stack) via Google Fonts.
- **Mono: `'SF Mono', 'Cascadia Code', Menlo, Consolas`**. It is used for
  document references in tables (`WA-EIA-MST-001`) and for mechanical fix
  lines ("routewide works → scheme, 1 place").
- **Scale:** 10.5 (micro labels: uppercase, bold, 0.6px letter-spacing, e.g.
  "YOUR PROJECTS", "REFERENCE") · 11.5 (labels, chips, badges) · **12.5 (the
  main UI size)** · 13 (dense body) · 15.5 (prose) · 18 (heading.md, sans
  semibold) · 24 · 29.

### 4.4 Radii, shadows, spacing, motion

- **Radius:** 4px (tags, wordmark square) · 8px (controls, panes, nested
  cards) · 10px (the frame, chat bubbles, composer) · 999px (chips, badges) ·
  50% (avatars).
- **Shadows (four levels; the frame and the rail are never shadowed):**
  - pane `0 10px 26px rgba(20,20,20,.12)`
  - popout (nested cards, ask-bar, bubbles, composer) `0 10px 28px rgba(20,20,20,.09)`
  - overlay (menus, modals) `0 4px 8px rgba(0,0,0,.08), 0 24px 60px -12px rgba(0,0,0,.35)`
- **Spacing:** a 4px base (4/8/12/16/20/24/32...). The pane gutter is 12px,
  card padding 16px, nested card padding 12px, table cell padding 10px 8px,
  and nav item padding 7px 10px.
- **Motion:** hover 150ms ease, press 100ms with `scale(.97)` plus an inset
  shadow on the primary button (the only transform), panel collapse 300ms.
  Loading is a **shimmer** (1.4s linear sweep), never a spinner. Nothing
  bounces or slides. Video camera moves (zooms, pans) are ours. The UI itself
  should stay calm.
- **Cards are filled and shadowed, never bordered.** No left accent bars. The
  one exception in screenshots: quiet bordered tool tiles on the Tools page.
- **Icons:** Lucide only (`lucide-react`), 2px stroke, 15px in the nav and 14px
  inline. No emoji.

### 4.5 The app shell (what every screen looks like)

From `01-workspace.png`, `02-plan.png`, `09-editor.png` and design-rules §C
"Shell z-order":

- **Two layers, not three.** The whole window is the warm-grey frame
  (`#dedad0`). The **nav rail is part of the frame**: no fill, no shadow, no
  border, 216px wide (collapsible to 64px). Content panes are **white cards
  floating on the frame**, inset 12px from the top, right and bottom, with
  **0px on the left** so the first pane's shadow falls against the rail. Pane
  radius is 8px; the frame radius is 10px.
- **Rail, top to bottom (project view):**
  1. Wordmark ■ Infora, with a collapse toggle « at the right.
  2. A line reading "Calder & Hale" with "All projects ▸" on the right.
  3. A project switcher block (fill `#e5e3dc`, radius 8) holding the micro
     label "PROJECT" and the name "Wrenfield–Ashcombe 400kV Connection ▾".
  4. Nav items, each a Lucide icon plus a label: *Home · Ask · Editor · Plan ·
     Project library ▸ · Review · Notifications · Sandbox ▸ · Tools ·
     Knowledge · History*.
  5. At the foot, the user chip: a dark circle avatar with initials ("EP"),
     the name in bold, and "Calder & Hale — Consultant" in muted text.

  The workspace view's nav is *Home · Ask · Editor · Personal sandbox · Tools ·
  Your knowledge*, with a "WORKSPACE / Calder & Hale ▾" switcher. The active
  item is filled `#c9c5b8`.
- **Topbar inside the main pane:** an outlined pill with the project name, then
  "· Owner: Trentmoor Energy" in muted text. Right-aligned is a role badge:
  "● Member" (green tint) or "● Owner" (slate tint). A hairline divider sits
  under it.
- **Editor second bar:** a location chip ("▧ Calder & Hale — project sandbox"),
  "/ WA-EIA-MST-001 EIA Scoping Method Statement — Land Quality", then on the
  right *Freeze*, a primary **⇧ Promote** button, and a "● No document
  controls" pill.
- **Editor layout:** two floating panes. On the left is the canvas, with a
  format bar (B, I, H2, H3, • List, 1. List, Quote, Comment, ✓ Check, then
  Write/Preview on the right) and serif prose. On the right is the side panel
  (308px, resizable 240 to 420) with tabs *Chat · Comments · Checks (n)*.
- **Page heading pattern:** a serif 29px title with an optional badge pill
  ("Deliverable plan  ● TIDP"), a muted one-line description, toolbar buttons
  on the right (secondary buttons with Lucide icons, one primary "+ New
  deliverable"), then a hairline table with uppercase micro headers.

### 4.6 Key components and how they look

- **Status badge:** a 6px dot plus a word. Flat in tables; tinted pill on
  cards. Tones: success = accepted/current/member; warning = awaiting/checked
  out/withheld; danger = rejected/failed; info (slate) = owner, external
  authority, "In review"; neutral = planned/no state. Examples from
  screenshots: "● Planned" (neutral pill), "● In production" (green), "● In
  review" (slate), "● S2" (slate), "Advisory" (neutral), "Required" (amber),
  "Reference" (neutral).
- **Source pill (SourceChip):** 999px radius, 2px 8px padding, 11.5px. Library
  variant: fill `#efeeeb`, border `#ececea`, text `#57564f`, label = document
  reference. Authority variant: fill `#e9eff6`, border/text `#274a6d`. It sits
  directly after the claim it backs.
- **Suggestion callout (SuggestionCard):** a sunken `#efeeeb` card, 8px
  radius, popout shadow, 14px 16px padding. A 20px near-black circle badge
  with a check, a title line ("Suggestion ready · pending your decision"),
  cited prose, then Accept (primary, small) / Edit / Refine / Reject. Inserted
  text shows as green tracked changes when accepted.
- **Run trace (RunTrace):** a step checklist. Done steps get a filled check;
  the current step shows a muted numeral. Labels are past tense: "Retrieved
  sources · Ground-checked claims · Suggestion drafted". Collapsed form: "Run
  details · every step in the audit trail".
- **Chat composer (ChatComposer):** a sunken fill with 10px radius, popout
  shadow, `✦` glyph, placeholder text, and a 30px send button. Source-row
  chips below it are transparent with a hairline border and 999px radius.
- **Chat bubbles:** the **user** gets a bubble (10px radius, popout shadow).
  The design rule is that the **agent never gets a bubble; its output is
  content** (`components/chat/ChatBubble.prompt.md`). For the chat-first
  builder, render agent turns as plain text under a small "Agent" label, as
  the approved mockup does, with quick-reply buttons as secondary buttons.
- **Withheld notice:** a warning (amber) tint block, e.g. "The round is open.
  Its comments are withheld until the lead reviewer closes the round and
  issues it" (`19-wall.png`). It is never red.
- **Findings panel:** grouped by check ("House style (4)", "Dismiss all"). Each
  finding is a white card with a severity badge plus *Go to it*, the defect
  sentence, a quoted rule in a sunken block with a mono clause number, a mono
  fix line, and Accept/Edit/Dismiss secondary buttons. Marks in the text are
  dashed underlines (advisory) or solid red underline with a pink tint
  (required/accuracy) (`t2-07-marks.png`).
- **Progress bar for a review:** four numbered circles joined by a line
  (*Submitted · In review · Responding · Complete*). Done steps get a black
  check circle. It sits on a sunken card with "Review period target Sep 16,
  2026 — 14 days left" and a "● Cycle active" slate pill (`18-round-open.png`).
- **Modals:** a white pane with overlay shadow, a header with a mono reference
  ("WA-EIA-MST-001") and an X button, over a scrim (`30-context-state.png`).
- **Project card:** a sunken card holding the serif project title, "Owner:
  Trentmoor Energy" in muted text, and a "● Member" green pill (`01-workspace.png`).

---

## 5. The Wrenfield world (demo data)

All of this is fictional and seeded in `packages/db/src/seed.ts`. Email domains
are `*.example`.

### 5.1 Organisations

| Organisation | Role | Notes |
|---|---|---|
| **Trentmoor Energy** | Client; **owner** of the main project | An energy network owner. |
| **Calder & Hale** | Consultant (the lead consultancy) | The producing side in every story. Has its own *Calder & Hale Drafting Manual*. |
| **Redgate Ecology** | Consultant (ecology) | Produced the *Preliminary Ecological Appraisal* (`WA-ECO-PEA-001`). Cast as a **contractor** submitting returns in the app mockups. |
| **Halvern Associates** | An organisation with no membership on the project | A wall-test subject. Useful as "the rival firm that sees nothing". |
| **Marchwood Aggregates** | Client; owner of a second project | Calder & Hale acts for both clients (the conflict-register scenario). |

### 5.2 People

| Person | Organisation | Role in stories |
|---|---|---|
| **Rachel Bowen** | Trentmoor Energy | Owner super-user and **lead reviewer**; the client's seat. Initials RB. |
| **Eleanor Price** | Calder & Hale | **Lead author**, super-user, org admin; the consultant's seat. Initials EP. |
| **Owen Vance** | Calder & Hale | Internal QA reviewer; enters Calder & Hale's returns in the app mockup. |
| **Marcus Webb** | Calder & Hale | Has no access to this project (wall test). |
| **Nadia Okonjo** | Redgate Ecology | The contractor's seat in the returns app. Initials NO. |
| **Priya Nair** | Halvern Associates | Outsider (wall test). |
| **Hannah Sturt** | Marchwood Aggregates | Owner admin of the second project. |
| **Mrs A Patel** | (no account) | External issue recipient, a landowner or consultee (`26c-external-document.png`). |

### 5.3 Projects and places

- **Wrenfield–Ashcombe 400kV Connection**, owned by Trentmoor Energy. Places in
  the documents: **Wrenfield Sidings** (former railway land, ceased 1968),
  **Ashcombe depot** (plant maintenance, ceased 1994), **Ashcombe Brook**
  (brown trout; WFD "Moderate"), **Ashcombe Lane** (residential receptors;
  construction traffic concerns), **Wrenfield East** historic landfill (closed
  1979), **Wrenfield substation**, and parish councils at **Wrenfield,
  Ashcombe and Netherfold**.
- **Marchwood Quarry Rail Link**, owned by Marchwood Aggregates.

### 5.4 Deliverables and library documents (reuse these references verbatim)

**The journey's deliverable:** `WA-EIA-MST-001`, *EIA Scoping Method Statement
— Land Quality*, by Calder & Hale, discipline EEN. Revisions run P01 → P02 →
C01 (accepted). The lead reviewer is Rachel Bowen.

**Other plan rows** (`02-plan.png`):

- `WA-DRN-SUR-001` Surface Water Drainage Strategy (EDR)
- `WA-EIA-MST-002` EIA Scoping Method Statement — Ecology
- `WA-GEO-GIR-005` Factual Ground Investigation Report — Phase 3 (EGE)
- `WA-GEO-IRP-001` Interpretative Ground Investigation Report

**Library reference material, with real seeded text to quote in citations**
(`seed.ts` lines 263-380):

- `WA-GEO-GIR-004`, Ground Investigation Interpretative Report (v2 current, v1
  superseded): "made ground to a depth of 2.4 m, comprising ash, clinker and
  demolition fill over glacial till... Elevated concentrations of polycyclic
  aromatic hydrocarbons (PAHs) were recorded in three of eleven trial pits
  (WS-TP03, WS-TP07, WS-TP09), with benzo(a)pyrene up to 18 mg/kg. A shallow
  perched water table was encountered at 1.6–2.1 m..."
- `WA-ENV-BAS-003`, Environmental Baseline Compendium (v3): the arable
  corridor, Ashcombe Brook, Wrenfield East landfill within 250 m, two
  receptors within 150 m at Ashcombe Lane, and monitoring from March 2026.
- `WA-WAT-FRA-001`, Flood Risk Assessment — Screening Note: Flood Zone 2 for
  380 m either side of the brook; a trenchless crossing.
- `WA-CON-SCC-002`, Statement of Community Consultation: two rounds (October
  2025, March 2026) and the themes raised.
- `WA-EIA-SCP-001`, EIA Scoping Report: the topics, and the house style
  ("formal register, cite project sources by document reference, avoid cost or
  programme commitments").
- `WA-HER-DBA-002`, Heritage Desk-Based Assessment: **withdrawn** 02 Jul 2026,
  "superseded methodology". A good "not used for AI answers" example.
- `WA-ECO-PEA-001`, Preliminary Ecological Appraisal (Redgate Ecology). Redgate
  also has *Bat activity survey — working notes* in its sandbox, which is
  perfect for "invisible to Calder & Hale".

**Style material:** *Wrenfield–Ashcombe Project Style Guide* (§2.1: "Refer to
the works as 'the scheme', in lower case, throughout. Do not capitalise it as a
proper noun.") and the *Calder & Hale Drafting Manual* (§4.2).

**Dates.** The seed lives in **Aug to Sep 2026** (issued Sep 02, 2026; review
target Sep 16, 2026). Today is 2026-10-04, so September or October 2026 dates
read naturally.

### 5.5 Extra names for the two new apps (invented here; keep them obviously fictional)

The seed has consultants, not suppliers. For the supplier-KPI app, add a small
supplier set derived from the world's own place names. These are **new
inventions, not in the seed**, so the build agents should check no real-company
collision is implied and keep `.example` domains:

- **Netherfold Cabling**: HV cable supply and pulling
- **Ashcombe Civils**: trenching, haul roads, the compound
- **Wrenfield Plant Hire**: plant and welfare
- **Brookside Fencing & Reinstatement**: fencing, drainage reinstatement

The client is Trentmoor Energy throughout. Calder & Hale can be the
consultancy that builds and runs the apps for the client (ADR-0056 §6's case:
a consultancy's app reads every contractor's rows only if **the owner shares
the table**). A simpler casting for video is **Rachel Bowen at Trentmoor
building it herself**, which is the mockup's casting.

---

## 6. The app builder: what exists, and how to show it chat-first

### 6.1 What it does today (built T-439 to T-445; code `apps/web/src/screens/app-builder.tsx`)

**The seven steps** (ADR-0056 addendum ruling 1; `STEPS` constant in
`app-builder.tsx`), in order:

1. **What the app is**, and who it is open to (scope: a set of organisations,
   one organisation, a team, or named people).
2. **The tables**: what people fill in, and *whether it holds contractual
   data*. Columns are typed `text, number, date, boolean, choice`. A table's
   kind is *data* ("Data people fill in"), *insight* ("Where a run writes what
   it found"), or *reference* (a lookup list; used by playbooks).
3. **Data connections**: systems outside Infora. Declared now, connected after
   deployment.
4. **The interface**: the screens, and who may open each. "Describe each screen
   in plain words and the agent writes it."
5. **How often it runs**: *Only when someone presses Run · Every day · Every
   week · Every month*.
6. **Analysis and prompts**: what the agent says each run.
7. **Check and open**: read it all back, then **publish** (working copy →
   published copy, stamped with who and when). "Save as a playbook" also lives
   here.

The agent sits in **its own pane beside the steps**, with one conversation
across all of them. Steps that need an answer carry a "✦ the agent asks" marker
on the step rail. The two questions it *must* ask are computed from the
definition by `pendingBuilderQuestions` in `@infora/contracts`, so they do not
depend on the model's mood. The header shows "Draft — not yet open to anyone".

**The three wall questions** the agent must ask (ADR-0056 §2b):

- **Step 2:** "Does this table hold contractual data? Something a payment hangs
  on, that discharges a condition, or that Trentmoor Energy will rely on as
  its record." *Yes — add an acceptance step* / *No — rows never change
  hands*.
- **Step 4:** "Who may open the dashboard?" *Trentmoor Energy only* /
  *Everyone — each sees their own*.
- **Step 6:** "The scheduled run acts as you, Rachel Bowen, over the tables it
  declares... Is that everything it should touch?"

**The screen grammar** (`packages/contracts/src/app-builder.ts`,
`APP_SCREEN_BLOCK_KINDS`). A generated screen is `{version: 1, blocks: [...]}`
built from **nine closed block kinds**: `heading`, `paragraph`, `rowForm`
(a form over named columns, with a submit label), `rowTable` (the rows the
viewer may read, with optional organisation and state columns), `total` (the
sum of one number column), `count`, `barChart`, `lineChart` (with an optional
trend line), and `pieChart` (each naming a category column and a value
column). No block can hold a URL, a key or a style. The agent picks from this
menu and never writes code. Whether the agent may write *real* screen code is
**deferred** to the owner's acceptance walk (T-446; ADR-0056 second addendum,
ruling 5: "I'm not sure I agree but we'll check").

**Rows.** Each row is stamped with the organisation and person who entered it.
With an acceptance step, a row goes *Draft → Submitted → Accepted or
Rejected* (a rejection needs a reason). A submitted row is frozen until
decided. A correction is a new row that supersedes the old one. Totals count
**accepted rows only**.

**Runs and insights.** "Run the analysis now" writes one insight row (date,
trigger, rows covered, definition version). The numbers are computed in code
and the model writes the sentence. **Export...** produces an Excel file (or
Word for an insight) containing only what the exporter may see, stamped with
the data and the time, **never "made by AI"**. Playbooks: save to the firm's
shelf, deploy as an empty copy.

**The two-seat payoff** (`returns-app-two-seats.html`). Nadia (Redgate) sees a
form and "Your returns — Redgate Ecology" only, with an info note: "This app
shows you what you could already see". Rachel (Trentmoor) sees KPI tiles
("Landfill, project to date 1,284 t · accepted returns only"; "Recycled 71%"),
the latest insight, every organisation's rows with Accept/Reject, and an
inline confirm strip: "Accept Calder & Hale's August 2026 return? Once accepted
it becomes Trentmoor Energy's record..."

### 6.2 Built versus vision, for these two apps

| Element | Status |
|---|---|
| Tables, acceptance flow, two seats, totals, counts, bar/line/pie charts, manual insight run, Excel export, playbooks | **BUILT** |
| A schedule that actually fires | **RULED, NOT BUILT** (stored; honoured "when a clock exists") |
| Connecting a live spreadsheet or outside system | **RULED, NOT BUILT** (ADR-0057; deferred to deployment). The vision shot is fine; show the key as "written once, never shown again". |
| KPI averages, percentage tiles, RAG status, targets, tables in the dashboard beyond the nine blocks | **OWNER'S NEW VISION** (the grammar sums and counts only; the mockup's "71%" tile is drawn, not built) |
| **Chat-first building** (the agent drives the steps) | **OWNER'S NEW VISION**, reopening ADR-0056 addendum ruling 6 |
| **A slide-deck (PowerPoint) output** | **OWNER'S NEW VISION**. Export is ruled as "a file (Excel, Word)" (ADR-0056 §8). Infora does have authored documents of kind *slides* ("a slide-shaped document", `CONTEXT.md` "Document origin"), and Word/PowerPoint exports, which is the honest bridge. |

### 6.3 How to show it chat-first without breaking the record

The owner's critique: "The user talks to an agent, and the agent then walks
through the builder's steps on their behalf. The steps stay visible as
progress." Recommended screen layout, built on the approved mockup's parts:

- **Left (main pane, about 40%): the conversation.** It opens with a big
  composer ("Describe the app you want..." with a `✦` glyph). The user types
  one paragraph. Agent turns are plain text under an "Agent" label (no bubble),
  each followed by a compact **"Done" receipt** naming the step it just
  filled: "✓ Step 2 · The tables — Monthly KPI returns, 7 columns".
- **Right column: the seven steps as a progress rail.** Numbered circles join
  into a line, like the review progress bar (`18-round-open.png`). They tick in
  order as the agent fills them. Each step expands to show *what was recorded*
  (the table's columns, the schedule). This keeps ruling 6's point: **every
  choice is visible in the form, never only in the chat**.
- **Below or beside them: a live preview of the generated screen**, which
  re-renders as blocks arrive. This is the Lovable/Retool pattern the research
  found (`docs/reference/app-builder-ui-review.md` §1c: "Chat is the front door
  and the preview is the proof").
- **The wall questions stay unskippable.** When the agent reaches step 2 or 4,
  it **stops and asks** with quick-reply buttons. The step shows an amber
  "Waiting for you" badge until answered. This is the one moment the user
  clicks, and it is a *selling* moment: "Infora asks the questions other
  builders don't" (the research found neither Retool nor Lovable asks about
  contractual data or who may open each screen).
- **The finish is the publish act.** Step 7 shows "Check and open": a read-back
  summary and a primary **Open to 4 organisations** button. The header badge
  goes from "Draft — not yet open to anyone" to "Published v1 · Rachel Bowen,
  4 Oct 2026".
- **Seat switch.** Cut to the same app opened by a supplier (only their own
  rows) and by the client (everything). Caption: "Same app. Each person sees
  exactly what they could already see."

### 6.4 App 1: the supplier-KPI reporting app

**Prompt the user types** (Rachel Bowen, Trentmoor Energy):
"I need a monthly supplier KPI return. Each supplier on Wrenfield–Ashcombe
reports on-time delivery, non-conformances, safety incidents, carbon and local
spend. I want a dashboard with trends and a written summary at the start of
each month."

**What the agent fills, step by step:**

1. *Supplier KPI returns*, open to Trentmoor Energy, Netherfold Cabling,
   Ashcombe Civils, Wrenfield Plant Hire, and Brookside Fencing &
   Reinstatement.
2. Table **Monthly KPI returns**, with columns: Month (date), Deliveries due
   (number), Delivered on time (number), Non-conformance reports (number),
   Safety incidents (number), Carbon, tCO2e (number), Local spend, £ (number),
   Notes (text).
   - The agent asks: "Does this table hold contractual data?" The user
     answers: "Yes, KPIs feed the supplier scorecard in the contract." The
     result is an **acceptance step**.
   - An **Insights** table is added by step 6.
3. No connections.
4. Two screens:
   - **Submit this month's KPIs** (a `rowForm` plus a `rowTable` of own
     returns), open to everyone in scope.
   - **Supplier KPI dashboard** (`total`: carbon this year; `count`: returns
     awaiting decision; `barChart`: NCRs by supplier; `lineChart` with trend:
     carbon by month; `pieChart`: local spend by supplier; `rowTable` with
     organisation and state columns).
   - The agent asks "Who may open the dashboard?" The user answers "Trentmoor
     only".
5. Every month, on the 1st.
6. "Summarise the month: which supplier's on-time rate fell, any NCR spike,
   and carbon against last month. Flag anything over 10%." The agent restates
   who the run acts as, and over which tables.
7. Publish, then save as a playbook.

**Payoff shots.**

- The dashboard with an insight card. Sample text, written in the house style:
  "September's on-time delivery across four suppliers was 91%, down 3 points
  on August. Ashcombe Civils accounted for 6 of 9 late deliveries. Carbon fell
  8% to 142 tCO2e. No supplier's NCR count rose by more than 10%." Show
  "acted as Rachel Bowen over 16 rows".
- One supplier seat, Netherfold Cabling, seeing only its own rows.
- Accept/Reject on a submitted row, with "Reject — say why...".

Honesty note: a percentage like "on-time %" is vision. The built grammar sums
and counts, so a strict version shows totals of *delivered on time* against
*deliveries due*.

### 6.5 App 2: qualitative input plus spreadsheet, as a slide-deck dashboard

**Prompt** (Eleanor Price, Calder & Hale, building for the client's monthly
progress board, or Rachel herself):
"Each month package leads write their commentary (progress, key risks,
decisions needed) and we pull the numbers from our cost and programme
spreadsheet. Turn it into a monthly progress pack as a slide deck."

**What the agent fills:**

1. *Monthly progress pack*, open to Trentmoor Energy and Calder & Hale.
2. Two tables:
   - **Package commentary** (data; text columns: Package, Progress this month,
     Key risks, Decisions needed, Status (choice: on track / at risk /
     behind)). Agent question: contractual? The answer is "No — working data",
     so rows never change hands. This shows the question has two honest
     answers.
   - **Programme & cost figures**, filled from the spreadsheet (columns:
     Package, Planned % complete, Actual % complete, Budget £k, Forecast £k).
3. **Data connection: `Wrenfield–Ashcombe cost & programme.xlsx`**. The agent
   maps the spreadsheet's headers to columns (this echoes the built **schema
   import assistant**, where "recognisable headers map with no model call",
   `v1.md`). Vision caveat: connections are ruled and deferred to deployment.
   Do **not** show a credential in the clear.
4. Screens:
   - **Write this month's commentary** (a form per package; the interface for
     qualitative input the brief asks for).
   - **Progress dashboard** (bar chart planned vs actual by package; total
     forecast; the commentary table).
5. Monthly.
6. "Write one slide per package: status, the two biggest risks in the
   package lead's own words, and the numbers from the spreadsheet. Then a
   summary slide."
7. Publish, then add the deck output.

**Payoff.** A "Generate this month's pack" button produces a **deck** shown as
slide thumbnails in Infora's style: a serif title, "Wrenfield–Ashcombe 400kV
Connection — Progress, September 2026", one slide per package (Cable route —
Netherfold to Wrenfield; Wrenfield substation works; Ashcombe Brook crossing;
Reinstatement), each with a status badge, a bar chart, and quoted commentary.
It closes with "Download .pptx".

**To stay inside the rules:**

- The deck lands as an **ordinary draft in the sandbox** that a person then
  checks, edits and issues. "The app produces, a person issues" (ADR-0056 §8).
- Stamp the deck footer with "Data as at 30 Sep 2026 · Programme & cost
  figures, Package commentary", never "Generated by AI".
- Commentary is the package leads' words, so quote it rather than letting the
  model invent risks.

### 6.6 Suggested caption lines (plain, sentence case, no first person)

- "Describe the app. The agent builds it, step by step."
- "It asks the questions that matter: is this contractual? Who sees what?"
- "Same app. Each organisation sees only its own."
- "Every claim, cited to the page it came from."
- "Comments stay with the reviewers until the round is issued."
- "Withdraw a document. The AI stops relying on it. The record stays."
- "Your firm's apps, reusable on every project. None of the last client's data."

---

## 7. Source index

| Topic | Files |
|---|---|
| Brief | `demo/BRIEF.md` |
| Vision and features | `docs/architecture/infora-overview.md`, `README.md` |
| V1 scope | `docs/build/v1.md` ("V1 on one page", "Real in V1", "The two new workflows") |
| Vocabulary | `CONTEXT.md`, `docs/design/ui-vocabulary.md` |
| Stories and beats | `docs/architecture/user-stories.md`, `scripts/user-story-walkthrough/build.mjs` (`acts` and `toolSections`), `docs/architecture/user-story-screens/*.png` |
| App builder | `docs/architecture/adr/0056-the-app-model.md` (+ two addenda), `docs/architecture/adr/0057-connections-and-stored-credentials.md`, `docs/build/plan.md` (T-437 to T-447), `docs/build/plan-history.md` (T-439 to T-445 records and review note), `docs/reference/app-builder-ui-review.md`, `packages/contracts/src/app-builder.ts`, `apps/web/src/screens/app-builder.tsx` |
| Mockups | `docs/design/mockups/app-builder-stepped-flow.html`, `docs/design/mockups/returns-app-two-seats.html` |
| Design | `docs/design/README.md`, `docs/design/design-rules.md`, `docs/design/design-tokens.json`, `.claude/skills/infora-design/` (readme, tokens, chrome.css, components, ui_kits/app), `packages/ui/src/styles.css` |
| Wall and data | ADR-0018, ADR-0020, ADR-0021, ADR-0022, ADR-0026, ADR-0048, ADR-0053 |
| Seed world | `packages/db/src/seed.ts` |
