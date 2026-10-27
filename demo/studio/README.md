# Infora demo studio (Remotion)

The code that draws Infora's demo videos: recreated Infora screens in React,
rendered to MP4. How to plan and make a new demo video is in
[`../README.md`](../README.md); this file is the technical reference.

It holds two sets:

- **The demo videos** (`src/walkthroughs/`): the current ~2-minute product
  demos, W1-W5. Plans in `../plans/`.
- **The sizzle set** (`src/sizzle/`): the first, archived set of short clips
  and a joined film. Plans in `../archive/2026-10-sizzle/`. Kept so it still
  renders; don't extend it.

1920 × 1080, 30 fps, no audio track. This folder has its own npm install and
is **not** part of the pnpm workspace: use `npm`, never `pnpm`, here. The
shared colour palette is read from `docs/design/design-tokens.json` (see
`src/shared/theme.ts`), so a colour change in the design system reaches the
videos on the next render. Shadows, radii and type sizes are still copied into
`theme.ts`, and a few video folders use one-off colours; prefer the tokens in
new work.

## Preview, check, render

```bash
npm install                     # once
npx remotion studio             # browse every composition
node scripts/stills.mjs W1-document-management 207 700 1500   # check-frames, one bundle
npx remotion render src/index.ts W1-document-management ../videos/W1-document-management.mp4
```

`out/` is gitignored scratch (stills land in `out/stills/<id>/`); empty it
whenever you like. Finished videos go to `../videos/` (also gitignored).
Fonts load from Google Fonts at render time, so a render needs network access.

Sizzle compositions, for reference:

| Id | What | Frames |
|---|---|---|
| `V01-cited-drafting` … `V05-deck-app` | Standalone clips | 843 / 623 / 772 / 900 / 899 |
| `Film` | The five clips joined, with one open and close | 3585 |
| `Dev/…` | Single bodies and the component sheet | |

## Folder layout

```
src/
  index.ts, Root.tsx       registerRoot + every composition (reads durations from meta files)
  data/wrenfield.ts        every repeated name, number and string (master-plan §5.5)
  shared/                  the foundation — import from '../../shared'
    theme.ts               colour/shadow/radius/type tokens, fonts (C, CHART, SHADOW, FONT, TYPE, SCALE)
    motion.ts              ease, appear, vanish, between, keyed, holdFor, ui, pressScale, seeded, countWords
    film.tsx               Field, Wordmark, CardText, TitleCard, ClipOpen, EndCard, FadeOutToField, SeatLabel
    focus.tsx              Camera, Float, FocusBlur, contextStyle, Greek, GreekText, Highlight, Shimmer, Anchor
    cursor.tsx             Cursor, TypedText
    prompt.tsx             PromptHero, PhraseLift
    clip.tsx               BodyProps, ClipMeta, StandaloneClip, PlaceholderBody
    ui/primitives.tsx      Pane, Badge, Button, Chip, SourceChip, WithheldNotice, Tick, Avatar, MicroLabel, AgentGlyph
    ui/shell.tsx           AppShell, EditorSecondBar, EditorPanes, SideChat, Receipt
    ui/drafting.tsx        CitedProse, SuggestionCard, RunTrace, SourcePanel, DocCanvas, GreekStrip, Mark,
                           TrackedChange, SuccessFlash, FindingCard, FindingGroup
    ui/review.tsx          ProgressBar4, CommentCard
    ui/builder.tsx         ChatComposer, ChatPanel (+ Turn), StepRail, BuilderHeader, ReadBack, RowForm
    ui/charts.tsx          KpiTile, BarChart, LineChart, PieChart, InsightCard, DataTable, Dashboard
    ui/deck.tsx            Slide, SlideDeck, deckSlides(), SavedStrip
  sizzle/film/
    Film.tsx               the nine-segment <Series> (master-plan §3)
    segments.tsx           FilmOpen, Montage, FilmClose
  sizzle/vNN/              one folder per sizzle clip
    meta.ts                durations in frames (from the plan) and the card lines
    Body.tsx               export Body({ cut: 'standalone' | 'film' }) — currently a placeholder
    Standalone.tsx         ClipOpen + Body standalone + EndCard (don't edit)
  dev/ComponentSheet.tsx   render-check page for the shared components
  walkthroughs/            the demo videos W1-W5 (see "Walkthroughs" below)
scripts/stills.mjs         render many check-frames from one bundle
```

## Rules for clip engineers (sizzle set, archived)

1. **Only edit `src/sizzle/vNN/`** (your own clip). Do not edit `shared/`,
   `data/`, `film/`, `Root.tsx` or another clip's folder. If a shared
   component is missing something, build a local variant in your folder (or
   wrap the shared one) and tell the lead; don't patch shared files in
   parallel.
2. Anything you need beyond `shared/` lives in your own folder
   (`src/sizzle/vNN/shots/…`, local helpers, local constants).
3. **Use the data in `src/data/wrenfield.ts`** for every name, number and
   line (`PROJECT`, `DOC_REF`, `PEOPLE`, `CARDS`, `KPI_APP`, `DECK_APP`,
   `DASHBOARD`, `PROGRAMME`, `COMMENTARY`, …). Clip-only copy that appears in
   one shot may live in your folder.
4. Keep `Body`'s export name and its `cut` prop. The body must be exactly
   `META.body[cut]` frames long: title card 0–59, the plan's shots, a
   12-frame `FadeOutToField` at the end. Don't change `meta.ts` durations
   without changing the plan (the film timing table depends on them).
5. Frames are **body-local** (frame 0 = first frame of the title card), as
   in the plan. Standalone composition frame = body frame + 30. For the film
   cut, branch on `cut` and use the plan's film-frame column.
6. **Deterministic only:** drive everything from `useCurrentFrame()` (via
   `appear`, `between`, `keyed`, …). No `Math.random`, `Date`, timers or CSS
   animations/transitions. Use `seeded()` for any pseudo-random widths.
7. Hex values come from `theme.ts` (`C`, `CHART`, `SHADOW`) only. Seat colours
   (`C.seat`) are for SeatLabels, never inside recreated UI.
8. **The readability rule (master-plan §4.3)** is yours to enforce per frame:
   one readable line ≤ 12 words at a time, held ≥ words × 8 f, at ≥ 30 px on
   screen (Float scale × Camera scale ≥ 2.4 for 12.5 px text); everything
   else Greek (`GreekText`, `Greek`) or blurred (`FocusBlur`, `contextStyle`).
   `holdFor(words)` and `countWords(text)` help.
9. Render-check your stills (`npx remotion still …`) and look at them before
   handing back; run `npx tsc --noEmit`.

## How the pieces fit (notes for clip engineers)

- **Coordinates.** `Float` takes a screen-space centre `(x, y)` and a `scale`
  for native-size UI; `Camera` takes keys `{f, x, y, scale, ease}` where
  `(x, y)` is the stage point put at screen centre. Effective scale =
  Float × Camera. Put `Cursor`, `SeatLabel`, `PhraseLift` and `SavedStrip`
  **outside** the Camera (they are screen-space and never blurred).
- **Animated props take frames** (`at`, `from`, `pressAt`, `doneAt`, …),
  body-local. Before `at`, a component is hidden; most entries use the
  `panel` motion (9 f, `ease.out`); state flips use `ui` (5 f linear).
- **ChatPanel / StepRail** take on-screen `width`, `height`, `scale` (native =
  on-screen ÷ scale) and position with an absolute wrapper. ChatPanel Greeks
  older lines automatically when a newer line arrives (override with
  `greekFrom`); a question's echo bubble lands at `chosenAt + 8`; replies
  appear 2 f after the question finishes typing (3 chars/f). Progress dots
  take `done` as a count or the list of frames each step finished.
- **PhraseLift** measures `data-anchor` elements live: PromptHero highlights
  carry their `id`; StepRail rows expose `step-1` … `step-7`. Mount the
  `PhraseLift`s at the top level of the body.
- **Cursor targets** are screen px; the plan's "≈" points are estimates —
  render a still at the click frame and adjust so the tip sits on the
  control. Buttons expose `data-anchor` (`reply-0`, `reply-1`,
  `file-button`, `readback-primary`, `suggestion-accept`, `group-primary`,
  `rowform-submit`) if you want to measure.
- **SourceChip** takes `docRef` (React reserves `ref`). It is the plan's
  "SourceChip"; `CitationChip` is an alias. Never put one on uploaded or
  spreadsheet material.
- **Dashboard** reads `DASHBOARD.client` / `DASHBOARD.supplier`; `crop:
  'payoff'` gives the 620 × 468, shown at about 1.4×; `empty`
  draws the no-returns preview; `countFrom`, `flagRuleAt`, `flagAt`,
  `insightFocalFrom` drive the beats. The supplier seat never renders the
  insight.
- **SlideDeck** takes `deckSlides({ quoteHighlightAt, forecastHighlightAt })`
  and renders a 1248 × 474 grid (unpositioned; centre it yourself). Slide 4
  carries the amber actual bar, the forecast delta and the
  "from cost & programme.xlsx" label.
- **AppShell** is 1440 × 900 native. With `greekChrome`, every chrome label
  is Greek'd except those listed in `keep`; Freeze/Promote and the document
  reference are always Greek'd (§4.10). `EditorPanes` gives the canvas +
  side panel.

## Walkthroughs (the demo videos, W1-W5)

Five ~2-minute product demos: one per pillar, plus the ethical walls. The spec is
[`../plans/master-plan.md`](../plans/master-plan.md)
(shared rules: grammar §2, shell §3, cast and strings §4, components §5); each
video's shot table is `../plans/wN-*/plan.md` and its voiceover script
`../plans/wN-*/narration.md`. Where a
video plan and the master plan disagree on a shared rule, the master plan wins.

| Id | Folder | Frames (final plans) |
|---|---|---|
| `W1-document-management` | `src/walkthroughs/w1/` | 3837 (127.9 s) |
| `W2-context-layer` | `src/walkthroughs/w2/` | 3517 (117.2 s) |
| `W3-collaboration` | `src/walkthroughs/w3/` | 3525 (117.5 s) |
| `W4-tools` | `src/walkthroughs/w4/` | 3891 (129.7 s) |
| `W5-ethical-walls` | `src/walkthroughs/w5/` | 3389 (113.0 s) |
| `WalkthroughSheet` | `src/walkthroughs/WalkthroughSheet.tsx` | 13 pages × 100 f; still at `page × 100 + 80` |

All live in the Studio's **Walkthroughs** folder. Renders go to
`../videos/` under the composition id; check-frames come from
`node scripts/stills.mjs <id> <frames…>`.

```bash
npx remotion render src/index.ts W1-document-management ../videos/W1-document-management.mp4
node scripts/stills.mjs W1-document-management 1234
```

### Rules for the walkthrough engineers

1. **Only edit `src/walkthroughs/wN/`** (your own video). `src/walkthroughs/shared/`,
   `src/shared/`, `src/data/`, `Root.tsx` and the other videos' folders belong
   to the lead. If a shared part is missing something, wrap it or build a local
   variant in your folder and tell the lead; don't patch shared files in
   parallel.
2. **Shared data goes through the lead.** Every name, date, reference and UI
   string comes from the `WT_*` exports at the end of `src/data/wrenfield.ts`
   (`WT_PEOPLE`, `WT_LIB`, `WT_DATES`, `WT_PLAN_ROWS`, `WT_REVIEW`, `WT_ASK`,
   `WT_COLLAB`, `WT_TOOLS`, `WT_KPI_STATES`, `WT_RUN`, `WT_TITLES`, …). If you
   need a string that isn't there, ask the lead to add it; copy used in one
   shot only may live in your folder. Don't use the first set's `COMMENTS`,
   `WALL_NOTICE`, `RESPONSE_LINE`, `STEPS`, `KPI_APP.q1–q3`, `GIR_LOCATOR` or
   `DATES` (master plan §0, ruling 7).
3. **Keep `Video` and `META`.** `wN/Video.tsx` exports `Video`; `wN/meta.ts`
   exports `META` (chapters from `WT_TITLES[N].chapters`, exact **frames**,
   laid end to end from frame 207; they reproduce your plan's §2 table). To
   retime, ask the lead to change `WT_TITLES`; `Root.tsx` reads `META.total`.
4. **Frames are video-local** (frame 0 = the title's first frame), exactly as
   in your shot table. Never wrap your body in `<Sequence>` (it resets time);
   use `<Show from to>` for cuts and `<Crossfade at>` for seat changes and time
   jumps. Deterministic only: everything from `useCurrentFrame()`; no
   `Math.random`, `Date`, timers or CSS transitions.
5. **Author points in native px** (the app's own CSS px, 1536 × 864; the
   screenshots' coordinates transfer 1:1, with the extra 96 px in the main
   pane). Cursors take native points and ride the camera; `useAppPoint()`
   maps a native point to the stage if you need it.
6. **No Greek, no blur, no title cards between chapters.** The retired kit
   (`Greek*`, `FocusBlur`, `Float`, `PhraseLift`, `PromptHero`, `TitleCard`,
   `EndCard`, `greekChrome`) is not used here.
7. Run `npx tsc --noEmit`, render stills at every chapter start, every hero
   click and the glimpse, close and logo, and read them before handing back
   (master plan §6.1). The scaffold lints your captions with `checkCaptions`
   and warns in the console.

### What the frame does for you

`<WalkthroughFrame video chapters captions camera glimpse overlay splits>` is
the whole skeleton (§2.1): the title (0–89), the window fading in (84–101), the
glimpse (90–194, label "Where this ends", line from `WT_TITLES`), the
crossfade into your body (195–206), the chapter bar and caption block, the
close (camera back to Wide automatically, close line from `WT_TITLES`) and the
logo. You pass **chapter captions only**, the window content (`children`, the
Shell at native size) and a screen-space `overlay` (cursors, split windows).

- **Camera:** `camera={[key(0, WIDE), key(420, work(1160, 520, 1.4)), key(600, WIDE)]}`.
  A key's frame is when the move **starts**; its length defaults to the §2.6
  rule (Wide↔Work 21, pan 18, Work↔Detail 15, Detail→Wide 24). Centres are
  clamped to the plate. `cameraMoving(f, keys)` tells you if a frame is
  mid-move (never type, stream or move the cursor then).
- **Cursor:** `<WtCursor path={[{ f, at: { x, y }, shape }]} clicks={[…]} showFrom hideAfter idle />`.
  `f` is the **arrival** frame; the departure is computed from the travel rule
  (`travelFrames(d)` = clamp(15, 10 + d/45, 27)). Dwell 8 f before a click and
  6 f after are yours to leave in the path. `linear: true` makes a key a drag
  (20 px/f); pair it with `drags={[{ from, to }]}`. `window="left" | "right"` in split.
- **Typing:** `<HumanTyped text from seed />` (seeded cadence ≈ 0.5 c/f; +4 f
  after a comma, +8 f after a full stop). `typedEndsAt(text, from, seed)` and
  `sendAt(…)` give the frames for your shot table. Agent text: `<Streamed text from rate={3} />`;
  cited claims: `<CitedClaims claims from />` (4 c/f, pills 2 f after each claim),
  `claimsEndAt(…)`.
- **Split:** pass `splits={[{ from, to }]}` to the frame and render
  `<SplitWindows at={from} exitAt={to} left={{ seat, content }} right={…}/>` in the
  overlay, with `<Shell width={752} height={832} …>` as each side's content.
- **Glimpse:** `glimpse={<EndGlimpse at={META.closeFrom + 60}>{body}</EndGlimpse>}`
  freezes your own end state.

### The shared parts (`src/walkthroughs/shared/`)

| File | Parts |
|---|---|
| `geometry.ts` | `NATIVE`, `K`, `WINDOW`, `SPLIT`, `WIDE`, `work()`, `detail()`, `key()`, `cameraAt`, `moveFrames`, `mainToScreen`, `layChapters`, `SKELETON` |
| `frame.tsx` | `WalkthroughFrame`, `AppWindow`, `WindowFrame`, `Plate`, `SplitWindows`, `OpeningTitle`, `ClosingLogo`, `EndGlimpse`, `Show`, `Crossfade` |
| `captions.tsx` | `Caption`, `ChapterBar`, `SeatTag`, `checkCaptions` |
| `cursor.tsx` | `WtCursor`, `cursorAt`, `travelFrames`, `dragFrames` |
| `typing.tsx` | `HumanTyped`, `typingSchedule`, `typedEndsAt`, `sendAt`, `Streamed`, `streamEndsAt`, `claimsSchedule`, `Caret` |
| `shell.tsx` | `Shell` (project, workspace, crumb topbar, collapsed rail), `navPoint()`, `workspaceNavPoint()`, `RAIL`, `PANE`, `EditorBar`, `EditorBody`, `PanelTabBar`, `Prose`, `QuietAction`, `ProjectPill`, `RoundAvatar` |
| `ui.tsx` | `StatusPill`, `FadeIn`, `Page`, `PageHeader`, `SectionLabel`, `SearchInput`, `Btn`, `Table`, `Modal`, `Banner`, `Toast`, `Dropdown`, `Field`, `TextInput`, `Select`, `Checkbox`, `PickRow`, `KeyValueCard`, `NumBadge`, `ComposerChip`, `PanelComposer`, `ChatEntry`, `CitedClaims`, `SuggestionCallout`, `PresenceStack`, `PresenceFlag`, `RemoteSelection` |
| `pages.tsx` | `PlanPage` (02-plan), `LibraryPage` (26-library), `RefCell` |
| `pdf.tsx` | `PdfPage` (W1's renditions with `pending` / `saved` / `active` anchors and the select drag; W2's GIR page 1 via `cover` + `runningHead`) |
| `creator.tsx` | `CreatorScreen` (W2 ch 3 and W4 Workflow, one component), `SunkenCard`, `CreatorSection` |

Also added for the final plans: `OpeningTitle` shows `WT_TITLES[n].scenarioLine`;
`Shell` takes `nav={null}` (nothing lit) and `unreadAt` (the collapsed rail
draws the 7 px dot); `EditorBar.titleMax`; `Dropdown direction="up"`;
`SelectMenu` (318 wide, 28 px rows, ellipsis); `Segmented`; `CitedClaims`
`pillStagger` (3 f) and `activeRef`; `SuggestionCallout` `settleAt` /
`acceptedPills` (render it in both canvases from the same props);
`PresenceStack` `editingAt`; `PresenceFlag` `hideAt` / `reshowAt`;
`RemoteSelection` `from` / `exitAt`; `RemoteTyped` (a person's typing with
their flagged caret riding it, same props in both seats, `local` in the
typist's own seat). Two cursors at once = two `<WtCursor>`s.

**CreatorScreen page y.** It lays its cards out in flow, so the plans' page-y
figures are approximate: the sources card starts at page y ≈ 1303 with the
outline empty (W2 wrote 1180), so W2's "scroll 1060" framing is scroll ≈ 1183.
Set your scroll keys from a still (`WalkthroughSheet` pages 10–11), not from
the plan's numbers.

### What each engineer builds locally (in `src/walkthroughs/wN/`)

Only one video uses these, so they are **not** shared. Build them from the
shared pieces above; if a second video turns out to need one, ask the lead to
move it.

| Video | Build locally |
|---|---|
| **W1** | `ReviewPanel` + `CommentCard` (response block on any round, respond form states, withheld and issued modes, compact split mode), `CycleStatusBar`, `DeliverableStatus` (`appointment`, `appointment-accepted`, `open`, `accepted`), `PromotionWindow` (P01/P02), `ReviewRecordTable`, `SandboxPage` (W1's views), the bind / issue / accept modals on the shared `Modal` |
| **W2** | `DocumentModal` + `RevisionStrip` (body = shared `PdfPage`), `OntologyView`, `OntologyDetailCard`, `AskScreen` (single + `compact` split, "What ran" rail ticks, `prefilled` composer), `AnswerFooter`, `SourcePanel` (column form, `locator`, `hlAt`), the `List · How it connects` switch (use shared `Segmented`), W2's `SandboxPage` (folders only) |
| **W3** | `SandboxPage` (flat overview + selected views), `NewSandboxWizard`, the New document modal, `ChatThread` + `LibraryTokenInput` (plain-text ` per <ref>` inserts, list opens up), `CommentsTab` + `MentionBox`, `PillHoverCard`, the selection `Comment` bubble, the `📎 Attach source` row, the split editor canvas timeline |
| **W4** | `ToolsPage` (+ the VISION apps composer), `QaCheckerSetup` / `PlanCard` / `RunProgress`, `FindingsPanel` (+ hover card), `BuilderScreen` = `BuilderConversation` + `StepColumn` + preview slot, `ReadBackCard`, `KpiDashboard` (full and 676 narrow, `empty`, count-up), `ReturnsForm`, `AcceptStrip`, `RunsCard` + insight card, `KeepPlaybook`, W4's working-copy canvas text (it must NOT read `WT_MST_TEXT`) |
