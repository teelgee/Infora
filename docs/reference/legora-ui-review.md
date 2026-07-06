# Reference — Legora: product surfaces, UI and aesthetic (observed)

**What this is.** The UI/UX companion to [legora-architecture.md](legora-architecture.md): an observational record of what Legora's product *looks like* and how its surfaces behave, assembled from a browser research session over Legora's public material (all twelve Product-menu pages, the live in-app Editor keynote demo, and real product screenshots). Commissioned 2026-07-05 to ground the **surfaces alignment interrogation** — the review of Infora's UI mockups ([docs/design/mockups/](../design/mockups/index.html)) against the ADRs and component docs.

**Status & honesty.** Interpretation of public material, not hands-on use; nothing here is from a logged-in session. Every claim is tagged **[observed]** (seen in a screenshot/video, source named) or **[inferred]**; vendor page copy is quoted as *"They say"* and is positioning language, not necessarily literal in-app text. Dated **2026-07-05**; in-app frames are from the Nov 2025 "aOS"-era keynote (current at capture). Not part of the Infora design layer — it describes another company's product. Re-verify before relying on a specific claim.

**How to use it.** §1 answers (or explicitly fails to answer) the mockup-interrogation questions: chat-vs-drafting surface split, edit granularity, navigation structure, citation rendering, and the run-history/audit view. §4 lists what public material could not settle — where Infora decides for itself rather than mirrors.

---

Method note: built from Legora's own product/marketing pages (all twelve in the Product menu), one live in-app keynote demo (the "Editor" video on legora.com/product/editor, which shows the real `app.legora.com` web app), and the real product screenshots embedded on the Agent, Portal, Word Add-in, Tabular Review and Workflows pages. Claims are tagged **[observed]** (seen in a screenshot/video — source named) or **[inferred]**. For each surface I add a **"They say"** line = the vendor's own page copy (positioning language, not necessarily literal in-app text); **UI-copy in quotes elsewhere** = literal strings read off a screenshot. I did not log into the live app, so nothing is from hands-on use.

---

## 1. Product elements & surfaces

**Global navigation / left rail [observed — in-app frames, `app.us.legora.com/project/...`].** Persistent left sidebar, top-to-bottom: a **"+ Create new"** button; workspace-level items **Search**, **Library**, **Legal sources** ("Early" badge), **Organization databases**; a **Projects** section listing matters (Private, Project Rocket, Project Phoenix, Slip & Fall, Golden Crust, Regulatory Compliance, Securities Offering, Employment, Privacy, Precedent, Data Breach) ending in **"⋯ All projects"**; a **Portals** section (Pioneer Bank, Northgate, Hooli, Support); and the signed-in user at the bottom. URL scheme: `.../project/{id}/assistant?threadId=…` and `.../project/{id}/editor/{docId}?threadId=…`.

**Inside a matter [observed].** Expanding a project reveals four sub-items in order: **Assistant**, **Documents**, **Tabular Reviews**, **Editor**. So the matter is the container; those four are its tabs. Workspace-level = Search / Library / Legal sources / Organization databases.

**Workspace / matter home [observed — Editor demo].** Centered layout: collaborator avatar stack + "Last updated 6 hours ago"; editable project title (pencil icon); one-line description; a large central chat/prompt composer; a suggestion line ("Perform a [Database search] and analyze the results with [Tabular Review]"); and two panels — **Recent documents** and **History** (past agent tasks with tool-type icon + timestamp). Project top bar carries a dark **"⧉ Share"** and a **"🕐 Chat history"** button.

**Chat/Agent (Assistant).**
*They say (Agent page):* "The execution engine of the aOS… It plans, executes, reviews, and delivers complex legal work end-to-end. You stay in control where judgment is required."
- **[observed]** Composer: "How can I help? Use **@** to add context…", with "+ Sources", tool chips, attach, and a dark send button; per-message action row (copy, download, thumbs-up/down, ⋯).
- **Plan-approval / human-in-the-loop [observed — Agent page]:** the Agent posts "**I've drafted a plan to complete this SPA. Review the steps below and approve to get started,**" rendered as a plan card with a **circular % progress ring (12%)**, a **todo checklist** ("Intake & Analysis" ✓, "SPA Architecture" ○, "Drafting Sequence" ○, "7 more todos") and two buttons — grey **"View plan"** and black **"Approve plan."** This is the explicit approve-gate.
- **Execute trace with parallel sub-agents [observed]:** "✦ Working on task → Read files in project → Thought → Read 7 documents → **2 subagents**," with per-subagent cards showing status/duration ("Detailed Gap Analysis… ✓ Completed in 3m 15s"; "Identifying risks ⟳ Working"). A shorter inline trace ("Analyzed query ✓ → Read 1 source ✓ → … → Generated response ✓ → ⌇ Document created") appears in simpler runs.
- **Deliver [observed]:** a "**Files — 3 created**" card listing typed outputs with metadata/status pills ("Chronology of Key Events · 425 rows"; "Obligations vs Breaches · 120 files · 20 columns"; "Case Assessment Memo · 7p · **Draft**").
- **Tool orchestration [observed]:** the Legora sparkle ringed by Word/Excel/PowerPoint/web-globe icons — "Every tool in Legora is a tool the Agent can use."

**Skills / Skill Studio [observed — Agent page].** A dedicated surface with header tabs (home · **Explore** · **My page** · **Skill studio**), settings/map icons, and a **"+ New skill"** button. Skill cards carry a lightning icon, name + description, and an **authorship badge**: "Legora" (built-in), "Junestrand & Labor" (firm-authored), or an individual ("Sophie Leader"). Examples: "Company Search Report…", "What's Market", "Identify Change of Control Terms", "Draft Employment Section of DD Report".
*They say:* "Skills let you encode your processes, preferences, and expertise so the Agent works the way your team does."

**Proactivity [observed — Agent page].** A push notification: "**Your weekly regulatory brief is ready. 7 new developments across your active monitors. 2 flagged as high relevance…**" *They say:* "The Agent doesn't wait to be asked. It monitors your email, documents, and projects and acts the moment something needs attention."

**Editor (document editor) [observed].**
*They say:* "AI-native drafting environment… **takes the output from tools like Tabular Review and Assistant, and turns them into working documents.**" So Editor is explicitly a *downstream* surface. "Refine drafts together… ask Legora for improvements… then **accept or reject with full control**." "Export in style… **exports directly to Word in the style of your choice**… apply firm house styles."
- Two-pane split: document canvas (~⅔) + right **Assistant panel** with tabs **"Assistant" / "Insert"**. Toolbar: Paragraph-style dropdown, B/I/U/S, lists, indent, alignment, link. Breadcrumb + collaborator avatars + **"Export as…"** / Share top-right.
- Draft-into-Editor routing: the chat composer carries "+ Sources", a source-reference chip (orange Tabular Review icon, "Employment contract due…"), and a removable **"⌇ Editor"** output-target chip — attach it and the draft lands in Editor, not the thread.
- **Real-time collaborative presence [observed]:** named colored selections in the document (orange "**Ben**", green "**Nicole**") — Google-Docs-style live cursors.
- Assistant empty-state chips: "Summarize this document", "Anonymize information", "Translate this document".

**How AI edits to an EXISTING document land [observed — Word Add-in page].** As **per-suggestion, inline tracked-change edits**. The pane shows "**Edit suggestions — 3 available**" over a numbered, expandable list (1. Tax Indemnification Coverage, 2. Tax Exception Addition, 3. Tax Indemnification Expansion). Each has a plain-language summary and three controls: an **eye (preview)** icon, **"Dismiss"**, and a black **"Apply ▾"** button (chevron implies apply-all). Insertions render **red, underlined, italic** inline. Granularity = per-suggestion (clause/section), accept/reject individually. *They say:* "tracked changes and redlines generated instantly in Word… every change is tracked natively, with clear citations."

**Word Add-in [observed].** Narrow task pane docked right of Word. Top bar: sparkle · **"+"** · **clock (history)** · avatar. Empty state: time-aware greeting ("Morning Madison, / What can I do for you?") with two cards — **Actions** (green lightning) and **Playbooks** (orange book) — over "Ask anything…". Copy names three distinct modes: **Actions** ("Fill template", "Anonymize", "Improve writing", "Translate — Powered by DeepL"); **Playbooks** (defined in the Legora app, run in Word, "provide cited reasoning and suggest precise redlines"); and drafting/redlining.

**Tabular Review [observed].** Grid: breadcrumb ("Tabular Review / Case Preparation… ▾"), toolbar (assistant icon, "Add document", "Add column", "Templates"), checkbox + numbered rows, "Document" column (red PDF icons + filenames), prompt-driven columns. Cells expand into a **source card** (extracted passage with defined terms bolded, "PDF Document · Page 26", "View in document"). Per-cell **right-click menu [observed — Portal page]:** "Open in review mode", "Edit cell", "**Mark as reviewed**", "**Lock**", "**Flag ▸**", "**Comment**", "**Activity**", "**Rerun**". View toggle (list/table) + translate. *They say:* "AI-powered spreadsheet… each cell can be expanded to show reasoning and source documents." "Use template / Save as template."

**Workflows [observed].** Vertical stack of numbered **step cards** mixing natural-language instructions with inline **tool tokens** ("Run Tabular Review", "Search Database", "Input …" paperclip) and lavender **cross-reference chips** ("Step 1"). A library lists saved workflows with a **"Run"** button each. *They say:* "Orchestrate complex legal tasks… built to think and reason, guided by context, logic, and institutional knowledge… built, customized, and iterated by lawyers without writing a line of code."

**Portal (client-facing) [observed].** White-label client workspace. Matters/folder home ("… v. Williams - Criminal Defense", "X files shared", "All matters"); branded workspace (firm breadcrumb "Acme Inc. | 📗 ESG Policy & Governance Review", filter tabs "All 9 / Favorites 9", sortable "Document ↓", **nested folder tree** with mixed file types incl. a green Excel "Cap Table … .xlsx"); a **client query composer** (real cited-answer prompt + send button); a firm-workflows list with per-row "Run"; and a **white-label login** (frosted card, firm logo "Junestrand & Labor", Email/Password, "Continue"). *They say:* "AI-native workspace for law firms and in-house teams… **No guest license required**… Your IP stays protected — the underlying prompts, logic, and firm knowledge stay completely hidden… answers grounded and cited, with links back to the exact source."

**Legal Research [observed].** Structured answer with bold lead-in labels (Main claim / Legal & Factual Basis / Supporting Arguments / Key Evidence), inline citation chips, and a hover source card ("PDF Document · Page 1", "View in document" / "Ask follow up"). *They say (important for the citations question):* the Assistant draws on **"three powerful legal research sources — internal databases, the open web, and trusted legal content"** and cites "case law, precedents, statutes, regulations, guidelines, books." Sources are region-tagged (EDGAR/US, FromCounsel/UK, Cour de cassation/FR, Bundesrecht/DE, Sveriges domstolar/SE, Lovdata/NO, Retsinformation/DK, DRE-Legislation/PT, etc.).

**Lists [copy-only, no UI observed].** *They say:* the Agent auto-generates a **closing checklist** from transaction docs, extracting conditions precedent into structured rows with "description, reference clause, assignee, and due date," each row linking back to its source clause, with a full audit trail "for partner sign-off." Model: "Agent builds the list → Structure takes shape → Review, assign, deliver."

**Monitors [copy-only, no UI observed].** *They say:* a regulatory feed scoped to your "regulatory perimeter," model **Set up → Triage → Act** (choose jurisdictions/topics; articles carry "a summary, metadata, and a link to the original source"; filter/prioritise/assign owners; compare current law, assess impact, produce deliverables). Audit trail throughout.

**Outlook Add-in [copy-only, no UI observed].** *They say:* summarize long threads, draft replies "without leaving your inbox," and one-click save emails/threads/docs into Legora.

**Mobile app [copy-only, no UI observed].** *They say:* iOS + Android; "Assistant history stays in sync across desktop and mobile"; access documents, ask questions, generate summaries "citations included." A separate **01:28 mobile demo** exists (Precedent, Nov 6 2025) — not yet watched.

**Citations — how rendered [observed + copy].** Inline **chips carrying a mini source-type icon + number** (e.g. tabular glyph). Hover **highlights the cited sentence in lavender** and opens a **hover card** naming the source and its type (orange Tabular Review icon + "Answer found in table"; or "PDF Document · Page 1"). In research answers, a **filled magenta chip** = active/hovered citation, **grey chip** = inactive. The copy confirms a deliberate **three-source model** (internal DB / web / legal content), which maps to the differing chip icons — though I could not confirm a distinct *visual* style for case-law vs legislation specifically.

**Run history / audit [observed + copy].** (a) Inline thread trace (checklist + sub-agents); (b) project-level **"History"** panel and **"Chat history"** button; (c) per-cell **"Activity"** in Tabular Review. Copy makes "audit trail / every change logged / defensible / sign-off" a product-wide theme (Agent, Lists, Monitors, Portal), plus aOS-level "full audit trails … every tool call, file access, and agent action."

**Dense grid vs clean aesthetic [observed].** The grid keeps the restrained palette (hairline grey rules, roomy padding, small mono type, white ground) and pushes density into expandable cell cards; colour is used only for meaning (red PDF glyphs, a single purple citation badge).

---

## 2. UI & interaction patterns

**Layout grids / split views [observed].** Dominant working layout is three zones: fixed narrow left rail + main content + right Assistant panel (Editor ≈ ⅔ doc / ⅓ Assistant). Tabular Review = rail + full-width grid. Document viewers add a left thumbnail page-navigator + viewer toolbar (Download file / Translate / Print / Search) and page controls ("2/2", zoom). Word add-in = single right-docked pane.

**Loading / streaming [observed].** A progressively-revealed **checklist of agent steps** with checkmarks per completed step and a spinner/grey dot on the in-progress one; sources and sub-agent cards nest under their step; a duration label ("Worked for 6s"). Final output surfaces as a "Document created" / "Files created" card.

**Human-in-the-loop pauses [observed].** Explicit: the Agent posts a **plan and waits for "Approve plan"** (with "View plan" alternative) before executing; the Word "Edit suggestions" pane stages proposals for per-item Apply/Dismiss rather than auto-writing.

**Empty states [observed].** Warm/personalized: "Morning Madison, / What can I do for you?" with Actions/Playbooks cards; Editor's suggested-action chips; placeholders that invite ("Give me a task…", "Ask a follow up…", "How can I help? Use @ to add context…").

**"Review needed" vs "done" [observed].** Filled green checkmarks on completed steps/sub-agents; status pills on artifacts ("Draft"); Tabular Review modes ("Mark as reviewed", "Review mode", "Lock", "Flag"); risk flagging uses **Red / Amber(Yellow) / Green**.

**Collaboration presence [observed].** Overlapping circular **avatar stacks** (project home, Editor top bar) + "Last updated…"; **named colored live selections** in Editor ("Ben"/"Nicole"); real-time co-editing claimed for Editor, Tabular Review, Portal.

**Word add-in task-pane layout [observed].** Top utility bar (sparkle · + · history clock · avatar) → content (greeting + Actions/Playbooks cards, or numbered "Edit suggestions" with eye/Dismiss/Apply) → "Ask anything…" input with attach + send. User messages = right-aligned bubbles with attached-file chips.

---

## 3. Style & aesthetic

**Colour [observed; hex approximate from screenshots].** *Marketing site:* warm off-white/cream (~`#F5F2EC`), near-black ink (~`#1A1A1A`), deep **forest-green** accent reserved for "Book a demo"/links (~`#0E4A34`). *In-app:* cleaner near-white (~`#FBFBFB`/white), dark-grey text, very light grey rules/fills (~`#F2F2F2`). Functional accents: **purple/lavender** for citations & cross-refs (~`#7C4DA0`, pale `#EFE6F5` highlight), **orange** for Tabular Review/Playbooks (~`#E07B39`), **green** for Actions (~`#7FB08A`), **blue** for web/globe research; **red** for PDF glyphs and redline insertions.

**Typography [observed].** **Serif** for the LEGORA wordmark and firm names; a clean **geometric-humanist sans** for all UI and product copy. Weight used semantically: bold for greeting first line, citation lead-ins, defined terms; lighter grey for secondary/placeholder text. Marketing hero heads are very large, light-to-regular weight.

**Density & whitespace [observed].** Generous; airy marketing, comfortably-spaced app. Density is deliberately hidden inside expandable cards/panels.

**Border/shadow/radius [observed].** Soft rounded corners throughout (~8–14px; pill-shaped primary buttons and chips), hairline light-grey borders, soft diffuse shadows on hover cards/dropdowns/suggestion cards; glassmorphism on the Portal login.

**Iconography [observed].** Thin monochrome line icons in-app (clock, share, eye, paperclip, chevrons). Tool/source system uses **colored rounded-square app icons** (blue globe=web, orange bars=Tabular Review, beige scales=legal/case law, database stack, "文A" translate, dark chat bubble). Numbered badges: black rounded squares (edit suggestions), filled/outlined circles (citations).

**Illustration/photo [observed].** Warm lifestyle photography (wood, bookshelves, leather, neutral studio) as backdrops for angled/floating real-UI mockups; a cinematic 3D "glass documents" render on Agent; abstract concept diagrams on aOS. Customer logos as a grey wordmark row (Bird & Bird, Cleary Gottlieb, White & Case, Linklaters, Deloitte, MinterEllison).

**Motion [observed, limited].** Progressive reveal of the run checklist (streaming); hover reveals (citation cards, dropdowns). Anything more would be inference.

**Dark mode [not confirmed].** Every app frame seen was light; no toggle or dark screenshot found.

**Tone of voice [observed].** Warm, human, lightly imperative. Buttons = plain verbs ("Apply", "Dismiss", "Approve plan", "Run", "View in document", "Export as…"). Empty states conversational/personalized. Marketing heads aspirational and terse ("Legal work, redrafted.", "Word, like you've never seen before.", "Turn document chaos into insights", "Own every task. Every fact. Every deadline.").

---

## 4. Honesty appendix

**Provenance**

- Left-rail structure; workspace-vs-matter split; matter sub-tabs; project home; Recent documents/History; Share/Chat history — **[observed]**, Editor keynote frames (legora.com/product/editor).
- Agent plan-approval card, %-ring, todo checklist, "Approve/View plan"; Execute trace + parallel sub-agents; "Files — 3 created" deliverables; Skill Studio (tabs, "+ New skill", authorship badges); Proactivity notification; tool-orchestration icons — **[observed]**, legora.com/product/agent.
- Editor split view, Assistant/Insert tabs, composer chips, "Export as…", named live-collaboration selections — **[observed]**, Editor demo + Editor page.
- Word "Edit suggestions" (per-item Apply/Dismiss/preview, red inline redlines); task-pane empty state; Actions/Playbooks — **[observed]**, legora.com/product/word-add-in. Apply-all — **[inferred]** from the "Apply ▾" chevron.
- Tabular Review grid, source cards, right-click menu (incl. "Activity"/"Rerun"), templates — **[observed]** (tabular-review + portal pages).
- Portal folder tree, client query composer, workflows-with-Run, white-label login — **[observed]**, legora.com/product/portal.
- Legal Research answer + citation hover; three-source model; content types — answer/hover **[observed]**; three-source/content-type **[observed as page copy]**.
- Citation chip states (magenta active / grey inactive) — **[observed]**.
- Lists, Monitors, Outlook Add-in, Mobile app functionality — **[copy-only, no UI observed]**.
- Palette hex — **[observed but approximate]** (eyeballed from JPEGs).
- Dark mode, detailed motion, explicit accept-all, case-law-vs-legislation citation styling — **[inferred/unconfirmed]**.

**Copy coverage.** Full page copy captured for all twelve Product-menu pages: aOS, Word Add-in, Outlook Add-in, Editor, Mobile app, Tabular Review, Workflows, Legal Research, Portal, Monitors, Agent, Lists. Literal in-app microcopy captured only where legible in screenshots (button labels, menu items, placeholders, greeting strings).

**URLs visited.** Real product imagery: `/product/editor` (live-app demo), `/product/agent` (multiple real panels below the film), `/product/portal`, `/product/word-add-in`, `/product/tabular-review`, `/product/workflows`, `/product/legal-research`. Copy but little/no real UI: `/product/aos` (concept diagram), `/product/monitors`, `/product/lists`, `/product/outlook-add-in`, `/product/mobile-app`. Blog `/blog` and `/blog/introducing-the-agent` (mostly talking-head videos).

**Questions I still could NOT fully answer**

1. An explicit **accept-all / apply-all edits** control (only per-item Apply/Dismiss + an unexpanded "Apply ▾" seen).
2. Whether citations give **case law vs legislation** a distinct *visual* style (both are cited; three-source model confirmed; per-jurisdiction styling not confirmed).
3. **Dark mode** existence.
4. **Settings/admin** UI appearance (referenced in copy only).
5. The **Documents** sub-tab's own view, and any review view distinct from Tabular Review.
6. **Mobile app UI** (copy captured; 01:28 demo not yet watched).
7. Fine-grained **motion/transitions** beyond streaming reveals and hover cards.

**Age caveat.** In-app frames are from the Nov 2025 "aOS"-era Precedent keynote (current). The Word Actions walkthrough imagery is older (~10 months) and may lag the current add-in. Marketing screenshots are staged, so spacing/hex are approximate.
