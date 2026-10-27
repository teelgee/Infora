# Master plan: the Infora product film

Creative direction, 2026-10-04, revised the same day after the two reviews in
`demo/review/` (see §8, Revision log). Read with [../BRIEF.md](../BRIEF.md),
[../research/benchmark-product-videos.md](../research/benchmark-product-videos.md)
and [../research/product-inventory.md](../research/product-inventory.md). The
per-clip direction files are `video-01` to `video-05` in this folder. Where a
clip file and this file disagree on a shared rule (colours, easing, component
props, the readability rule), this file wins. Where they disagree on a clip's
own copy or frames, the clip file wins.

## 1. The story in one paragraph

Generic AI guesses. Infora's agent drafts a section of a real deliverable from
the project's accepted documents: every sentence carries a source that opens
to the page, anything unsupported is withheld, and an out-of-date version is
never used. Before the draft goes anywhere, the QA checker reads it like a
second reviewer. It finds a factual slip a person wrote, shows why, and waits
for a person. The document then crosses into the client's review. Trentmoor
Energy comments while Calder & Hale sees only that review is under way. When
the comments are released, they arrive together, are answered, and the
accepted document becomes something the AI may cite. Then the film turns:
anyone can **describe an app in one sentence**. The agent lifts the phrases
into steps, asks the questions that matter in plain words (will payments
depend on this, who sees what, what may a monthly run touch), takes a change
in the user's own words, and waits for a person to open it. The supplier-KPI
app ends on the same dashboard seen from two seats with different numbers. The
progress-pack app turns package leads' words and a spreadsheet's numbers into
a slide deck. A quick montage says "any tool you need", and the close says it
in two lines: *every answer from your record; every tool, built by asking*.

## 2. The clips

| # | File | Standalone | Body (standalone) | Body (film) | The promise it sells |
|---|---|---|---|---|---|
| 1 | [video-01-cited-drafting.md](video-01-cited-drafting.md) | 843 f = 28.1 s | 723 f | 723 f = 24.1 s | The AI drafts from your accepted documents; every claim opens to its page, and an out-of-date version is never used. |
| 2 | [video-02-qa-checker.md](video-02-qa-checker.md) | 623 f = 20.8 s | 503 f | 443 f = 14.8 s | A second reader catches the slip before your client does, shows why, and changes nothing without you. |
| 3 | [video-03-review-wall.md](video-03-review-wall.md) | 772 f = 25.7 s | 652 f | 532 f = 17.7 s | Client and consultant review in one place, each behind its own wall; only accepted work feeds the AI. |
| 4 | [video-04-kpi-app.md](video-04-kpi-app.md) | 900 f = 30.0 s | 780 f | 900 f = 30.0 s | Describe an app; the agent asks what matters and builds it, and each organisation sees only what it may see. |
| 5 | [video-05-deck-app.md](video-05-deck-app.md) | 899 f = 30.0 s | 779 f | 663 f = 22.1 s | Package leads type commentary, a spreadsheet brings the numbers, and the app drafts the deck. |

Standalone = ClipOpen 30 + body + EndCard 90. All five are inside 20–30 s
inclusive (clip 4 is exactly 900 f; clip 5 is 899 f).

Document control is not its own clip. It is carried by clip 1 (the out-of-date
version that is never used), clip 3 (the review and acceptance) and the
"accepted work feeds the AI" hinge.

### 2.1 How a clip is cut

```
Standalone clip = ClipOpen (30 f) + Body(standalone) + EndCard (90 f)
Film            = FilmOpen (69 f) + Body1..Body5 (film cuts) + Montage (75 f) + FilmClose (180 f)
```

- **ClipOpen**, 30 f: the ink wordmark card. Standalone only.
- **Body**: starts with the clip's TitleCard on the field (frames 0–59) and
  ends with a 12-frame fade to the empty field. Bodies butt-join with **hard
  cuts**, field to field.
- **Film cuts.** Each clip module exports `Body` with a `cut: 'standalone' |
  'film'` prop. Clip 1 is identical in both. Clips 2, 3 and 5 *drop* named
  shots in the film; clip 4 *inserts* a mid-card and an insight beat. Every
  clip file gives each shot's frames in **both** cuts.
- **EndCard**, 90 f (3.0 s): the clip's closing line on ink, then the
  wordmark. Standalone only.

Frames in clip files are **body-local** (frame 0 = first frame of the body).
Standalone composition frame = body frame + 30.

## 3. The joined film (≤ 3600 f)

| Segment | Frames | Start | End (incl.) | Seconds | What |
|---|---|---|---|---|---|
| FilmOpen: wordmark | 24 | 0 | 23 | 0.8 | Ink field, Wordmark 96 fades in over 0–7 |
| FilmOpen: hook card | 45 | 24 | 68 | 1.5 | Field. TitleCard "Generic AI *guesses*." |
| Body 1: cited drafting | 723 | 69 | 791 | 24.1 | Opens on "Drafts that show their *sources*." — the hook's answer |
| Body 2: QA checker (film) | 443 | 792 | 1234 | 14.8 | |
| Body 3: review wall (film) | 532 | 1235 | 1766 | 17.7 | |
| Body 4: KPI app (film) | 900 | 1767 | 2666 | 30.0 | |
| Body 5: deck app (film) | 663 | 2667 | 3329 | 22.1 | |
| Montage | 75 | 3330 | 3404 | 2.5 | "Build a [chip]." cycling three apps |
| FilmClose | 180 | 3405 | 3584 | 6.0 | Two lines, wordmark, tagline |
| **Total** | **3585** | | | **119.5 s** | 15 f under the 3600 cap |

Check: 24 + 45 + 723 + 443 + 532 + 900 + 663 + 75 + 180 = 3585.

**Montage (75 f, on the field).** A PromptHero (no author line, no send button)
centred at y 540 reads "Build a " followed by a chip-style phrase in the
Highlight tint, which swaps every 25 f with a 4 f crossfade: **"consent
tracker"** (0–24), **"RFI log"** (25–49), **"carbon report"** (50–74). Behind
it, on each swap, a Greek'd dashboard silhouette (Pane with Greek bars and
neutral chart shapes, scale 1.2, blur 6 px, opacity 0.35) changes layout. No
cursor, no typing. Hard cut to FilmClose at 75.

**FilmClose (180 f), exact:**

- 0–49: ink. TitleCard (tone `ink`) "Every answer from *your* record." WordReveal from 0.
- 50–65: line 1 moves up 90 px (centre y 540 → 450) and dims to 0.55 (`ease.out`).
- 52–78: line 2 "Every tool, built by *asking*." WordReveal at centre y 560.
- 100–119: both lines fade to 0 (12 f) while the Wordmark 96 fades in, **centre y 520**.
- 120–134: tagline in Inter 28 px `#c7c5be`, centre y 620: **"AI for infrastructure projects, behind the ethical wall"**.
- 135–179: hold. No call to action, no URL. The owner's music tails over the hold.

**Remotion:** `Film` = `<Series>` of the nine segments above with exactly these
`durationInFrames`; bodies rendered with `cut="film"`.

## 4. Visual language

### 4.1 Fields

| Name | Hex | Used for |
|---|---|---|
| `field` | `#f2f1ed` (neutral.100) | Every TitleCard and every floated-UI shot. |
| `ink` | `#1c1b18` (neutral.900) | ClipOpen, EndCard, FilmOpen wordmark, FilmClose. |
| `frame` | `#dedad0` (surface.frame) | Only inside AppShell. Never full-bleed. |

No gradients, textures, photos or stock footage.

### 4.2 Type scale (non-UI)

| Role | Font | Size / line-height | Weight | Colour |
|---|---|---|---|---|
| TitleCard | Source Serif 4 | **96 px** / 1.1, stepping to 88 then 80 (below) | 400 | `#1c1b18` on field, `#f2f1ed` on ink |
| TitleCard italic word | Source Serif 4 Italic | same | 400 | same |
| Wordmark 96 (film) | Source Serif 4 | 96 px; square 96 px, radius 21, gap 42 | 400 | `#f2f1ed` on ink |
| Wordmark 72 (clips) | Source Serif 4 | 72 px; square 72, radius 16, gap 32 | 400 | `#f2f1ed` on ink |
| Tagline | Inter | 28 px / 1.3 | 400 | `#c7c5be` |
| SeatLabel | Inter | 22 px / 1.2 | 600 | white on seat colour pill (h 44, radius 999, padding 0 20, 10 px white dot) |

**TitleCard size stepping:** set at 96 px. If the single line measures over
1500 px, re-set at 88 px; if still over, 80 px. **Never wrap mid-sentence.** A
card with two sentences may break at the full stop onto two lines (at the
same size). Every card must be render-checked (the list of all 20 cards is in
§6).

**Card copy rules:** sentence case, ≤ 6 words, exactly one italic word, ends
with a full stop. Cards hold 45 f (mid-clip) or 60 f (clip titles); the
FilmClose lines hold longer. One card on screen at a time; no captions over UI
except SeatLabels.

**Fonts (a deliberate deviation, stated):** Source Serif 4 (weights 400/500/600)
matches the kit. The kit's sans is the system stack and its mono is SF Mono;
for deterministic renders we load **Inter** (already in the token's sans
stack) and **JetBrains Mono** as stand-ins, via `@remotion/google-fonts`. Page
titles inside recreated UI use Source Serif 4 **weight 500** (token
`display.lg`), not 400.

### 4.3 Product UI scale and the readability rule

UI is authored at native token sizes (12.5 px main UI, 15.5 px prose) and
enlarged as a whole.

- **Context scale 1.8**: for "you are here" shots and any pane the viewer is
  not meant to read.
- **Focal scale ≥ 2.4**: whatever the viewer must read renders at ≥ 2.4×
  native, i.e. **≥ 30 px on screen** for 12.5 px text. Achieve it with Float
  scale, Camera scale, or both (effective scale = Float × Camera).
- **AppShell** (shell mode): 1440×900 logical at scale 1.2, for ≤ 36 f only.

**The readability rule (hard rule, every shot):**

1. **One readable line at a time.** A *line* is any sentence-like text: agent
   turns, questions, user prompts and bubbles, notices, findings, quotes,
   insight sentences. At most **one** line is readable on screen at any frame,
   and it has **≤ 12 words**.
2. **Hold:** a line is on screen and readable for **≥ words × 8 f**, counted
   from its first character. *Recap* lines (a read-back repeating what the
   viewer already read) need ≥ words × 4 f.
3. **Everything else is Greek or blurred** (§4.7). Non-focal lines turn to
   Greek bars when the next line becomes focal.
4. **Labels are not lines.** Button labels, step titles, badges, tile labels
   and values, chart labels, chips, receipts ("✓ …") and seat labels may stay
   legible beside the focal line if they are ≤ 8 words each. Non-focal labels
   sit at opacity 0.6. A label must stay visible for ≥ words × 4 f. A user
   bubble that echoes a quick reply the viewer has just read on its button
   also counts as a label.
6. **Counting words:** dashes, "·" and "✓" are not words; numbers and
   hyphenated compounds count as one.
5. **Focal scale** as above (≥ 30 px on screen).

### 4.4 Camera

- **Slow push:** ×1.00 → ≤ ×1.08 over 60–90 f, `ease.inOut`.
- **Push-to-detail:** one move of 14–30 f, `ease.out`, to a named rect; any
  scale.
- **Pull-back reveal:** one per clip, 24–36 f, `ease.out`.
- **Pan:** 14–24 f, `ease.inOut`.
- Camera keys are **Camera** scale only. Float scale is separate; effective
  scale = Float × Camera.
- No rotation, 3D, shake or motion blur (except PhraseLift).

### 4.5 Motion and easing

| Name | Definition (Remotion) | Use |
|---|---|---|
| `ease.out` | `Easing.bezier(0.16, 1, 0.3, 1)` | Arrivals, push-to-detail |
| `ease.inOut` | `Easing.bezier(0.65, 0, 0.35, 1)` | Pans, slow pushes, cursor travel |
| `ease.in` | `Easing.bezier(0.7, 0, 0.84, 0)` | The body's 12-frame fade-out |
| `ui` | linear over 5 f (token `durationBase` 150 ms) | Badge flips, ticks, button fills |
| `panel` | `ease.out` over 9 f (token `durationSlow` 300 ms) | Cards and panes arriving |
| `press` | scale 1 → 0.97 → 1 over 3 f, primary buttons only | The only product transform |

**Shimmer** (loading): 42 f linear sweep, `#efeeeb` → **`#faf9f7`** (neutral.50)
→ `#efeeeb`, matching the kit's `.skeleton`. Never a spinner. Springs, if any,
`{damping: 200}`.

**WordReveal:** each word fades in and rises 12 px → 0 over 10 f, `ease.out`,
4 f stagger. Cards cut out (no fade).

**Agent typing:** agent turns reveal at 3 characters per frame. User typing
(TypedText) runs at about 2 characters per frame. Lines are kept short rather
than typed faster.

### 4.6 Colour (tokens only)

| Token | Hex | Video use |
|---|---|---|
| text.primary | `#1c1b18` | Text, primary buttons, done-tick circles |
| text.secondary / muted / faint | `#57564f` / `#78766f` / `#c7c5be` | Secondary UI text |
| border.strong | `#e0ded8` | Greek bars, rail line |
| pane | `#ffffff` | Floated cards |
| sunken | `#efeeeb` | Composer, nested cards, chips |
| neutral.50 | `#faf9f7` | Shimmer midpoint |
| prose | `#2c2b28` | Document prose (kit `--text-prose`) |
| success text / dot / tint | `#1a7a3a` / `#2f9e52` / `#e8f5ea` | Accepted, ticks, "On track", insert flash |
| warning text / dot / tint | `#8a5a12` / `#c4901f` / `#f8efdd` | Withheld, waiting, "At risk", Highlight, flagged bar |
| danger text / tint | `#b23b34` / `#fbeceb` | Required marks, "Behind", tracked delete |
| info text / tint | `#274a6d` / `#e9eff6` | "In review", "Owner", info notes |
| shadows | pane `0 10px 26px rgba(20,20,20,.12)` · popout `0 10px 28px rgba(20,20,20,.09)` · overlay `0 4px 8px rgba(0,0,0,.08), 0 24px 60px -12px rgba(0,0,0,.35)` | |

**Seat colours (overlays only, not tokens).** Taken from the walkthrough's lane
colours (`docs/architecture/user-stories-walkthrough.html`, built by
`scripts/user-story-walkthrough/build.mjs`): consultant `#6d5dd3`, client
`#159a74`, and the walkthrough's *external* lane `#8a6d3b`, which we reuse for
suppliers. Never inside recreated UI.

**Chart palette:** series 1 `#1c1b18`, 2 `#78766f`, 3 `#c7c5be`, 4 `#e0ded8`
(1 px `#c7c5be` outline). Trend lines dashed 2 px `#57564f` (4/4). A flagged
bar uses `#c4901f`.

### 4.7 Focus: FocusBlur, Greek and Highlight

- **Non-focal layers:** `blur(6px)`, opacity 0.45, long text as **Greek** bars
  (4 px radius, height 0.55 × line-height, `#e0ded8`, widths from the shot spec
  or seeded 55–95 %).
- **Focal element:** sharp, scale ×1.00 → ×1.04, shadow `pane` → `overlay`.
- In/out over 9 f. Never blur the cursor or SeatLabels.
- **Highlight:** `#f8efdd` box, 4 px radius, 2 px horizontal padding, wiped in
  left to right over 6 f.
- **Greek-in-place:** inside an otherwise sharp card, a Greek'd line keeps its
  layout box and pills/badges; only its words become bars.

### 4.8 Cursor

- macOS arrow, 30 px, `#1c1b18` with 2 px white outline, shadow `0 2px 4px
  rgba(0,0,0,.25)`. Rendered above the Camera (fixed size). Coordinates are
  screen px.
- **Appears 10–20 f before a click; travels 8–20 f** on `ease.inOut`; fades in
  over 6 f and out over 6 f, starting 8 f after the click.
- Click: scale 1 → 0.88 → 1 over 6 f; ring 0 → 44 px, 2 px `#1c1b18` at 25 %,
  fading over 12 f. The control shows its pressed state on the click frame.
- Never during typing; keyboard sends show only the button press.

### 4.9 Agent voice and the builder's words

- Agent turns: plain text under "✦ Agent" (11.5 px native, 600, `#78766f`). No
  bubble, no persona, no "I". Each turn ≤ 12 words.
- User turns: bubbles (10 px radius, white, popout shadow), name above.
  A chosen quick reply becomes a user bubble **8 f after the click**.
- **Plain step names** (on screen; the seven steps are unchanged underneath):

  | n | Builder step | On screen |
  |---|---|---|
  | 1 | What the app is | **Who it's for** |
  | 2 | The tables | **What gets collected** |
  | 3 | Data connections | **Where the numbers come from** |
  | 4 | The interface | **What people see** |
  | 5 | How often it runs | **When it runs** |
  | 6 | Analysis and prompts | **What it writes** |
  | 7 | Check and open | **Check and open** |

- **The three wall questions, in plain words** (ADR-0056 §2b; each is asked in
  chat and answered with one tap, and each answer ticks its step):

  | Step | Question (≤ 12 words) |
  |---|---|
  | 2 | "Will payments depend on these numbers?" (or "…this commentary?") |
  | 4 | "Who should see the dashboard?" |
  | 6 | "Run as you, {first name}, on these two tables only?" |

### 4.10 Words never on screen (legible)

Sandbox, Promote, Freeze, playbook, round, issue, "No document controls",
"definition v1", "Run details", status/acceptance codes (S0, P01, C01),
"contractual data", "acceptance step". Where the real UI contains them, they
are Greek'd. Plus the guardrail list in §7.

## 5. Shared components (build once)

Location `demo/product-video/src/shared/`. Data `src/data/wrenfield.ts`. Clips
`src/clips/V0nName.tsx`, each exporting `BODY_FRAMES = {standalone, film}`,
`Body({cut})`, `Standalone`. Film `src/film/Film.tsx`. Compositions:
`V01-cited-drafting`, `V02-qa-checker`, `V03-review-wall`, `V04-kpi-app`,
`V05-deck-app`, `Film`; 1920×1080, 30 fps, no audio. Add dependencies
`lucide-react` and `@remotion/google-fonts`.

`F` = body-local frame. Animated props take absolute frames.

### 5.1 Foundations

```ts
// tokens.ts — the only place hex values live (§4.6)
export const C = { field:'#f2f1ed', ink:'#1c1b18', frame:'#dedad0', pane:'#ffffff', sunken:'#efeeeb',
  neutral50:'#faf9f7', text:'#1c1b18', text2:'#57564f', muted:'#78766f', faint:'#c7c5be', prose:'#2c2b28',
  border:'#ececea', borderStrong:'#e0ded8', success:{text:'#1a7a3a',dot:'#2f9e52',tint:'#e8f5ea'},
  warning:{text:'#8a5a12',dot:'#c4901f',tint:'#f8efdd'}, danger:{text:'#b23b34',tint:'#fbeceb'},
  info:{text:'#274a6d',tint:'#e9eff6'}, seat:{consultant:'#6d5dd3',client:'#159a74',supplier:'#8a6d3b'} };
export const SHADOW = { pane, popout, overlay };
export const FONT = { serif:'Source Serif 4', sans:'Inter', mono:'JetBrains Mono' };
export const FOCAL_MIN_PX = 30;

// easing.ts
export const ease = { out, inOut, in };
export function appear(f: number, at: F, dur = 9): number;
export function between(f, [a, b], [from, to], easing?): number;
export const holdFor = (words: number, recap = false) => words * (recap ? 4 : 8);
```

### 5.2 Film furniture

| Component | Props | Notes |
|---|---|---|
| `Field` | `{tone: 'field' \| 'ink'}` | |
| `Wordmark` | `{size: 18 \| 72 \| 96; tone: 'onInk' \| 'onField'; opacity?: number}` | CSS square + "Infora". No invented mark. |
| `TitleCard` | `{text: string; tone?: 'field' \| 'ink'; from?: F; staggerF?: 4}` | `*word*` marks the italic. Auto size stepping 96 → 88 → 80 (§4.2). |
| `ClipOpen` | `{}` | 30 f: ink, Wordmark 72 fades in 0–8. |
| `EndCard` | `{line: string}` | **90 f** on ink: line WordReveal 0–(≈26) at 84 px (stepping applies); 40–54 line moves up 70 px and dims to 0.55 while Wordmark 72 fades in, centre y 590; hold to 89. |
| `FilmOpen` / `Montage` / `FilmClose` | `{}` | §3. |
| `FadeOutToField` | `{from: F; dur?: 12}` | |
| `SeatLabel` | `{seat: 'consultant' \| 'client' \| 'supplier'; text: string; at: F; x: number; y: number}` | Centre point. |

### 5.3 Camera, focus, cursor, typing

| Component | Props | Notes |
|---|---|---|
| `Camera` | `{keys: Array<{f: F; x: number; y: number; scale: number; ease?: 'out' \| 'inOut'}>; children}` | `x,y` = stage point placed at screen centre. |
| `Float` | `{x; y; scale; at?: F; exitAt?: F; shadow?: 'pane' \| 'popout' \| 'overlay'; children}` | Centre point in screen px. Entry: opacity + translateY 24 → 0 over 9 f. |
| `FocusBlur` | `{from: F; to?: F; focus; context}` | §4.7. |
| `Greek` | `{lines; lineHeight; widths?; seed?}` | |
| `GreekText` | `{text: string; greekFrom?: F; sharpFrom?: F}` | Renders text that turns into bars at `greekFrom` (or from bars to text at `sharpFrom`), keeping its layout. The workhorse of the readability rule. |
| `Highlight` | `{at: F; children}` | |
| `Cursor` | `{path: Array<{f; x; y}>; clicks: F[]; showFrom: F; hideAfter: F}` | §4.8. |
| `TypedText` | `{text; from: F; to: F; caret?; caretUntil?: F}` | Linear reveal. Caret 2 px × 1.1em, blinks 15/15 when idle. |
| `PromptHero` | `{placeholder; text; typeFrom; typeTo; sendAt?; author?: {name; org}; highlights?: Array<{phrase; at; id}>; chips?: string[]; swapChip?: Array<{text; from: F}>}` | Composer 1360 px wide, sunken, radius 20, popout shadow, `✦`, Inter 44 px / 1.35, padding 40, 64 px send circle. `swapChip` drives the Montage. |
| `PhraseLift` | `{id; from: F; dur?: 20; target: string}` | Phrase copy flies from its highlight rect to a StepRail row (scale 1 → 0.5, `ease.inOut`, 4 px blur in flight) and resolves into the row (crossfade 6 f). |

### 5.4 Product UI (recreated, native size)

Lift markup from `.claude/skills/infora-design/components/**` and `chrome.css`
(swap `window.DS` for imports). Lucide icons, 2 px stroke.

| Component | Props | Notes |
|---|---|---|
| `AppShell` | `{seat: Person; nav: NavItem; topbar: {project; owner; role}; secondBar?; greekChrome?: boolean; children}` | 1440×900, as `09-editor.png`. `greekChrome` Greeks every control except those passed as `keep`. |
| `Pane` | `{w?; h?; pad?; children}` | |
| `Badge` | `{tone; label; pill?; at?; flipTo?: {tone; label; at}}` | |
| `Button` | `{variant: 'primary' \| 'secondary'; size?; label; icon?; pressAt?: F; fadeAt?: F}` | |
| `SourceChip` | `{ref; variant?: 'library' \| 'auth'; at?; activeAt?}` | |
| `CitedProse` | `{segments: Array<{text; source?; focalFrom?: F; greek?: boolean}>; revealFrom; stagger?; size?}` | Segments can arrive Greek'd with sharp pills, then go sharp at `focalFrom`. |
| `WithheldNotice` | `{text; at}` | Warning tint, never red. |
| `SuggestionCard` | `{title; segments; revealFrom; withheld?; actionsAt?: F; acceptAt?: F}` | Title is a label; Edit/Refine/Reject labels stay, Accept primary. |
| `RunTrace` | `{title; steps: Array<{label; detail?; doneAt}>; startAt}` | Details Greek'd. |
| `SourcePanel` | `{ref; title; badges; page; passage: Array<{text; hl?: boolean}>; footer?: {text; riseAt?: F}; at}` | Non-`hl` passage text Greek'd. `footer.riseAt` moves the footer up to become the focal line (15.5 px native, primary colour, Highlight). |
| `ChatComposer` | `{placeholder; value?; typeFrom?; typeTo?; chips?; activeChip?}` | |
| `ChatPanel` | `{title; progress?: {done: number; of: 7}; turns: Turn[]; composer: ChatComposerProps; width: number; scale: number}` | Newest turn on screen; older turns Greek per §4.3. `progress` draws a 7-dot strip in the header ("5 of 7"). |
| `Turn` | `{kind:'user'; name; text; at}` · `{kind:'agent'; text; at}` · `{kind:'receipt'; label; at}` · `{kind:'question'; text; at; replies: string[]; chosen; chosenAt}` · `{kind:'file'; name; meta; button; pressAt}` · `{kind:'mapping'; label; at}` | Agent text reveals at 3 chars/f. Question replies appear 2 f after the text completes. Chosen reply presses at `chosenAt`; others fade to 0.4; user bubble at `chosenAt + 8`. |
| `StepRail` | `{steps: Array<{n; title; asks?; activeAt?; waitingAt?; doneAt?}>; compact?: boolean}` | Slim column. Plain titles (§4.9). Circles 28 px, line fills down. Waiting: amber Badge "Waiting for you". Summaries are one Greek'd line under each done title. Exposes `step-n` targets. |
| `BuilderHeader` | `{crumb; app; badge}` | |
| `ReadBack` | `{lines: string[]; focalLine: 0; primary: string; pressAt: F; badgeFlip?}` | Heading "Check and open". Line 0 sharp (recap), the rest Greek. No playbook button. |
| `ProgressBar4` | `{labels; current; advanceAt?; compact?: boolean}` | `compact`: 340 native wide, labels only, meta and round label omitted. |
| `DocCanvas` | `{blocks: Array<{kind: 'h' \| 'p' \| 'strip'; text: string \| ReactNode}>; width?: 600}` | `strip` = 1 Greek line with a pill. |
| `Mark` | `{kind: 'advisory' \| 'required'; at; children}` | |
| `TrackedChange` | `{del?; ins?; at}` | |
| `SuccessFlash` | `{at; children}` | `#e8f5ea` background fading 1 → 0 over 12 f. Replaces tracked-insert green for accepted drafts. |
| `FindingCard` | `{severity; defect; source?; rule?: {clause; from; quote}; fix?; suggested?; actions?}` | Rule quote and suggestion Greek'd unless focal. |
| `CommentCard` | `{author; when; quote; body; at; greekBody?: boolean; answeredAt?: F}` | Code badges are never drawn legibly (Greek). |
| `DataTable` | `{columns; rows; revealFrom?; stagger?: 3}` | |
| `KpiTile` | `{label; value; sub?; at; countFrom?: F; valueSize?: 29 \| 52}` | `valueSize 52` for the two-seat payoff. |
| `BarChart` | `{title; data: Array<{label; value; flag?: {at: F; badge: string}}>; max; unit?; at; empty?: boolean; flagRule?: {label; at}}` | `empty`: faint placeholder bars at 40 %, no labels. `flagRule` adds a warning Badge to the chart header. |
| `LineChart` | `{title; points; trend?; at; empty?}` | |
| `PieChart` | `{title; data; at; donut?: true; centre?: string; empty?}` | |
| `InsightCard` | `{label: string; text: string; focalSentence: string; at; empty?: string}` | Only `focalSentence` sharp. `empty` shows a muted label instead. |
| `Dashboard` | `{seat: 'client' \| 'supplier'; data: DashboardData; empty?: boolean; crop?: 'full' \| 'payoff'; at}` | 774 × 640 native grid (video-04). `crop:'payoff'` = header + tiles + bar only (774 × 378). |
| `RowForm` | `{title; fields: Array<{label; value?; typeFrom?; typeTo?; kind?; choice?; greek?}>; submitLabel; pressAt?}` | |
| `SlideDeck` | `{slides: SlideSpec[]; at; stagger?: 5; layout: 'grid'}` | Slides render at 1600×900 native, displayed at 0.25 (400×225); 3×2 grid, 24 px gaps. |
| `Slide` | `{spec: SlideSpec}` | **Type sizes per kind are as in video-05**, which wins. |

### 5.5 `src/data/wrenfield.ts`: every repeated value

| Key | Value |
|---|---|
| `PROJECT` | "Wrenfield–Ashcombe 400kV Connection" (en dash) |
| `DOC_REF` | "WA-EIA-MST-001" (hyphens, everywhere) |
| `DOC_TITLE` | "EIA Scoping Method Statement — Land Quality" |
| `ORGS` | Trentmoor Energy (client, owner); Calder & Hale (consultant); Netherfold Cabling, Ashcombe Civils, Wrenfield Plant Hire, **Wrenbrook Fencing & Reinstatement** (suppliers) |
| `PEOPLE` | RACHEL {Rachel Bowen, RB, Trentmoor Energy, lead reviewer, owner}; ELEANOR {Eleanor Price, EP, Calder & Hale, lead author}; OWEN {Owen Vance, OV, Calder & Hale — *cast as package lead, Ashcombe Brook crossing; the seed casts him as internal QA reviewer, so this is vision casting*}; SAM {Sam Kerridge, SK, Netherfold Cabling} |
| `LIB` | `WA-GEO-GIR-004` "Ground Investigation Interpretative Report" (v2 current, v1 superseded 12 Aug 2026); `WA-ENV-BAS-003` "Environmental Baseline Compendium" |
| `GIR_PASSAGE` | the seed v2 excerpt quoted in video-01 |
| `STEPS` | the seven plain step names (§4.9) |
| `SUPPLIER_KPI` | the September and August tables, the carbon series and Netherfold's rows (video-04) |
| `KPI_DERIVED` | Sep 93 of 102 (91.2 %); Aug 81 of 86 (94.2 %); carbon Jun–Sep 171/163/154/142, total 630; local spend Sep £272,000; Netherfold 27 of 28, 262 tCO2e, £84,200; on-time % Sep 96/85/95/92 |
| `INSIGHT` | the four sentences and label (video-04) |
| `PROGRAMME` | the four packages' planned/actual/budget/forecast and totals 37,500 / 38,060 (video-05) |
| `COMMENTARY` | the four packages' progress/risk/decision text (video-05) |
| `DATES` | review target 16 Sep 2026; accepted 29 Sep 2026; insight run 1 Oct 2026, 02:00; data as at 30 Sep 2026 |

## 6. Title-card register (render-check every one)

| Where | Card |
|---|---|
| Film hook | "Generic AI *guesses*." |
| Clip 1 title / mid / end | "Drafts that show their *sources*." · "No source? It's *withheld*." · "Every claim, cited to the *page*." |
| Clip 2 title / mid / end | "A second reader, *before* review." · "It shows *why*, then waits." · "Catch it before your *client* does." |
| Clip 3 title / mid 1 / mid 2 / end | "One review. Each firm *walled*." · "Comments arrive *together*." · "Answered. Then *accepted*." · "Only accepted work feeds the *AI*." |
| Clip 4 title / mid A (film only) / mid B / end | "Describe an app. Watch it *build*." · "Then just *ask* for changes." · "Open it from *either* side." · "Same app. Different *seats*." |
| Clip 5 title / mid / end | "Commentary in. A *deck* out." · "Their words. Your *numbers*." · "Every month, a draft *deck*." |
| FilmClose | "Every answer from *your* record." · "Every tool, built by *asking*." |

LinkedIn cover frames (owner's posting note): clip 1 the source passage with
highlight; clip 2 the Required mark; clip 3 the split; clip 4 the two-seat
dashboards; clip 5 slide 4 full frame. Never the ink wordmark.

## 7. Guardrails every build agent checks before rendering

- No real company, person or product name anywhere. Emails, if any, `.example`.
- No "AI-generated", "made by AI", "verified", "compliant", "certified",
  "approved by AI", trust badges or padlocks. No call to action or URL.
- None of: "workflow", "wizard", "copilot", "task", "tenant", "company",
  "citation chip", "Infora AI", plus §4.10.
- Withheld or walled content is stated in warning tone, never red.
- The client never sees agent internals. A supplier never sees another
  supplier's rows, figures or Trentmoor's insight.
- Only the mechanical fix is shown accepted in one click; rewrites wait.
- Attached or uploaded material never carries a source pill. A spreadsheet
  figure is labelled with plain text ("from cost & programme.xlsx"), never a
  pill.
- A new app's tables start empty: no figures before the publish.
- The deck lands as a draft for review; a person issues it.
- The readability rule (§4.3) holds in every frame.

## 8. Revision log

**2026-10-04, revision 1** (after `demo/review/review-buyer.md` and
`demo/review/review-fidelity.md`; producer's rulings applied).

*Fidelity must-fixes (all 11):*

1. Third wall question now asked in chat in clips 4 and 5 ("Run as you,
   {name}, on these two tables only?" → "Yes — only these"), ticking step 6.
   In the film cut of clip 5 it is elided with the gate (clip 4 has just shown
   both); it stays in clip 5 standalone.
2. Clip 2 no longer marks a defect in the AI-drafted section: §2 is a Greek
   strip with a pill, and the Required mark moves to a person-written clause
   in §3. Clip 2's draft is now `WA-EIA-MST-001`.
3. Clip 4's preview renders empty ("no returns yet"); figures first appear
   after the publish.
4. Clip 3 split geometry: panes centred x 510 / 1410, 40 px gutter.
5. Clip 3 counters: "2 comments" → "3 comments" on Rachel's side; "2 of 3" →
   "3 of 3 answered" on Eleanor's.
6. Comment C and comment B timestamps defined.
7. `DOC_REF` uses hyphens everywhere.
8. Bubbles land 8 f after the click everywhere.
9. Deck push ends at ×3.8; saved strip at y 1024, clear of the provenance footer.
10. Dashboard native box 774 × 640 with the specified grid.
11. Both seats labelled in clip 4's payoff, with defined geometry.

*Fidelity should-fixes adopted:* KPI end card true for both seats ("Same app.
Different *seats*."); accepted-by line; Greek'd verdict select above the
release button; "Generate September's pack"; uniform "— package lead"
attribution; Owen's casting noted; "each with its source" receipt; August
**81 of 86** (exactly 3.0 points); "Carbon · since June"; "4.2 km"; dateless
publish badge; shorter agent lines rather than faster typing; cursor rule
10–20 f lead-in, 8–20 f travel; camera rules and Float/Camera scale separation;
PhraseLift kept inside its shot; SlideDeck `stagger` prop; Slide sizes deferred
to video-05; package-slide layout; TitleCard size stepping; FilmClose wordmark
position; shimmer midpoint `#faf9f7`; seat colours cited; font stand-ins
stated; **Brookside → Wrenbrook Fencing & Reinstatement**. Rachel Bowen kept
(producer).

*Buyer changes adopted:*

- **1 (hook):** "Generic AI *guesses*." (45 f) after a 24 f wordmark; the shell
  beat is 36 f with controls Greek'd and the "No document controls" pill
  deleted; a superseded-version beat ("v1 superseded 12 Aug — never used by
  the AI.") is now a focal line in clip 1.
- **2 (cards between beats):** mid-clip cards in every clip (§6). Two buyer
  lines were changed to avoid repeating an end card in the standalone: clip 2's
  mid-card is "It shows *why*, then waits." (the end card keeps "Catch it
  before your *client* does."); clip 3's second mid-card is "Answered. Then
  *accepted*." (the end card keeps "Only accepted work feeds the *AI*."). Clip
  4's "Then just *ask* for changes." is film-only to keep the standalone at 30 s.
- **3 (readability):** the one-line, ≤ 12-word, ≥ 2.4× rule is now §4.3's hard
  rule. All prompts were cut to ≤ 12 words. No 4:5 render (producer).
- **4 (chat-led builder):** chat pane 1120 px at 2.4×, slim 480 px step column;
  plain step names; ≤ 12-word agent lines; a free-text change ("Flag any
  supplier under 90% on time."); a short read-back with no playbook button.
- **5 (two-seat payoff):** Q2 answered "Everyone — each sees only their own";
  the payoff shows the same dashboard for Trentmoor and Netherfold with
  different numbers. Netherfold sees no insight (Trentmoor's insight names
  other suppliers).
- **6 (repetition):** clip 2's settings panel is standalone-only (60 f, one
  click); "Fix 1 house-style wording"; clip 5's mapping collapses to one
  receipt; the word-and-number highlights on slide 4 and the new saved-strip
  copy. Deviation: clip 5's film cut keeps the "will payments depend on this
  commentary?" exchange (its honest "No" is new information) and drops the
  third question and gate instead, because the film had the time.
- **7 (clip 3 wording):** the buyer's title, button, chip and response lines;
  the notice is cut by one word to fit 12 ("Trentmoor is still reviewing.
  You'll see every comment when they release them."); codes and the reference
  Greek'd; the response shot is standalone-only. The optional third-firm ghost
  pane was not added.
- **8 (close):** the two closing lines and the tagline; the 75 f montage (it
  fits: film 3585 f). No "Book a demo", no URL (producer).

*Buyer minor notes adopted:* plain prose with a success flash instead of
tracked-insert green on accept; "Open to 5 organisations" header badge;
LinkedIn cover frames. Not adopted (time): the "house style · private" chip
beat and clip 5's slide-6 pass-over.

*Frame maths re-verified:* every shot table is contiguous in both cuts;
bodies 723/503/652/780/779 standalone and 723/443/532/900/663 film; standalones
843/623/772/900/899 f; film 3585 f.
