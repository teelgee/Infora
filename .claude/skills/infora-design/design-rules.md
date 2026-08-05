# Infora Design Rules

Companion to `design-tokens.json`. Every token referenced below exists in that file under the same dotted path (e.g. `semantic.color.text.primary`). This document is the rulebook; the JSON is the values.

---

## Self-check — coverage & what's still open

**Screens covered (source: `Workspace Redesign.dc.html`, turns 4–9):** Editor (canvas + suggestion/chat pane, incl. resize + tracked changes), Workspace landing, Library (table), Sandbox (file tree), dark mode (Editor only), and a components sheet (button/nav states, loading skeleton, dropdown/elevation‑4).

**Not yet mocked up — explicit out-of-scope, not ambiguity. Design these before building, using the patterns already defined:**
- Ask screen (chat-first, no document) — reuse `component.askBar` + message list.
- Review/cycle screens (DRR, comment threads, acceptance codes) — reuse `table`, `badge.status`, `suggestionCallout` as a starting point.
- Settings, History, Source panel/modal — reuse `pane` + `table`/`dropdownMenu`.
- Dark mode for Workspace landing, Library, and Sandbox — every semantic color already has a `dark` value (§ tokens file), so this is mechanical once someone applies it — just hasn't been visually verified screen-by-screen yet.
- Mobile/narrow layout — everything was designed at a fixed ~1280px desktop width; no breakpoint set exists (§C).
- Toast/error notification — not designed; §F gives the exact checklist for building it on-system when needed.
- Sandbox comments (T-112) and the format bar — deliberately excluded from this pass: both are mid-build per CONTEXT.md and get their own dedicated review rather than a speculative restyle now. Keep on old styling until then.

---

## A. Foundations

**Spacing.** All spacing is a multiple of 4px: `primitive.space` = 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Use the semantic `space.*` tokens (`gap.tight/default/loose`, `pane.gap`, `card.padding`, `section.gap`) in component code — never a bare pixel value. See Assumption 2: the mockup itself has not-yet-normalized values (e.g. 14px, 18px, 22px, 30px) — snap these to the nearest scale step during implementation.

**Type.** One serif (`primitive.font.family.serif`, Iowan Old Style) reserved for exactly two roles: the wordmark and the two largest headings (`type.display.lg` for a page greeting, `type.display.sm` for a section H2). Everything else — nav, buttons, body prose, table cells, labels — is sans (`primitive.font.family.sans`). Never mix serif into UI chrome (buttons, nav, labels, table). The scale is 8 steps (`font.size.50`–`700`, 10.5px–29px); `ui.default` (12.5px) is the base UI size and covers the plurality of text in the app — reach for it first.

**Color.** Base palette is monochrome (`neutral`/`neutralDark` — white through near-black, an 8–9 step warm-grey ramp). There is **no separate "brand" hue**: the sole accent in light mode *is* `neutral.900` (near-black), used for primary buttons, active nav state, and avatar/mark fills. Color is reserved for exactly two purposes:
1. **Status** (`feedback.success/warning/danger/info/neutral`) — small dots + text, used in badges and status columns only.
2. **Tracked changes** (`trackedChange.insert/delete`) — insertion (green, underlined) and deletion (red, strikethrough) in editor prose only.
Never use a feedback or tracked-change color for a button, nav item, or generic emphasis — that visual vocabulary is reserved so it stays meaningful.

**Radius.** A 4-step scale (`radius.xs/sm/md/lg` = 4/8/12/16px) plus `full` (999px, pills) and `circle` (50%, avatars). The rule is hierarchical, not decorative: the biggest radius (`lg`) goes on the few big "layer" surfaces (nav, canvas, chat pane, the outer app frame); nested cards inside a pane use `md`; controls (buttons, chips, nav items) use `sm`; the tightest elements (badge dots' containers, tag corners) use `xs`. Never give a small control a bigger radius than the pane containing it.

**Elevation / shadows — 4 levels, and the core rule of this system:**
| Level | Token | Used on | Shadow |
|---|---|---|---|
| 1 — flat | `elevation.level1.flat` | App frame/page background **and the nav rail** (the rail is part of the frame, not a card on it); hairline tables; dense list rows | none |
| 2 — pane | `elevation.level2.pane` | Content panes that float on the frame: canvas, chat/panel — **not** the nav | soft, moderate (`shadow.level2`) |
| 3 — popout | `elevation.level3.popout` | Nested "cards" inside a pane: suggestion callouts, ask-bar, project rows, chat bubbles, the composer | soft, diffuse ambient-only (`shadow.level3` — no tight/crisp component) |
| 4 — overlay | `elevation.level4.overlay` | Dropdowns, menus, modals, toasts — floats above everything, positioned outside any pane's box | strongest, two-part (`shadow.level4`) |

The app frame (the outermost background a pane sits on) **never** gets a shadow — it's the "floor," not a layer. If you're about to add a shadow to something and can't say which of these 4 levels it is, don't add it; make it flat (level 1) instead. Dense/tabular data (tables, list rows) stays level 1 — never give a table row its own shadow, even inside a level-2 pane.

**Shadow formula (final):** each level's shadow is a `(y-offset, blur, spread, opacity)` tuple, blur roughly doubling and opacity easing off as the surface floats further from the frame: level 2 = `10px / 26px / 0 / 12%` (or `40%` opacity in dark mode, since shadows need more contrast against a dark page). Level 3 reuses the same blur but drops to a single ambient-only shadow at `9%` opacity (`30%` dark) — deliberately softer than level 2 per unit blur, since it's a smaller surface nested a level deeper and shouldn't compete with its parent pane's shadow. Level 4 combines a tight contact shadow (`4px / 8px / 0 / 8%`) with a wide ambient one (`24px / 60px / -12px / 35%`) — roughly 2.3× level 2's blur — so an overlay reads as clearly "above" any pane. **Extrapolation rule:** if a 5th tier is ever needed (tooltips, toasts stacking above modals), scale blur by ~1.3× level 4's ambient layer and keep the same tight/ambient pairing rather than inventing a new shadow shape.

**Hard rule:** never hardcode a raw hex/px value in app code. Always reference a semantic or component token. If no existing token fits, follow §F before inventing one.

---

## B. Component inventory

For each: variants/states present in the mockups, tokens used, one-line usage note. States marked *(designed)* were explicitly shown (turn 8); states marked *(derive)* follow the same pattern but weren't drawn pixel-by-pixel — apply the token math directly.

### NavRail (`component.navRail`)
- **Elevation 1 — the rail is part of the frame, not a card on it.** No fill of its own (it shows the frame's `surface.frame` through), no radius, no shadow, no divider at its trailing edge. This is the defining move of the shell: see §C "Shell z-order."
- **States:** default *(designed)*, item hover *(designed)*, item active/selected *(designed)*, item focus *(designed, ring)*, collapsed *(rule only — see below)*.
- **Fills for controls on the rail use the `frame*` tokens, not the pane ones:** hover `surface.frameHover` (#e5e3dc), active/selected `surface.frameActive` (#c9c5b8), quiet filled blocks (org switcher, user chip) `surface.frameSunken`. The ordinary `surface.hover`/`surface.active` tokens are tuned for white panes and are invisible against the frame — never use them here.
- **Collapsed spec:** width drops to `navRail.width.collapsed` (64px), labels hidden, glyphs centered, tooltip on hover shows the label (the `title` attribute already carries it). Triggered by the `«`/`»` collapse toggle (`component.collapseToggle`) in the nav header.
- **Resizable:** drag handle (`component.resizeGrip`) on the trailing edge, range `resize.min`–`resize.max` (160–420px). Width is user state, persisted per user (not a design token).
- Tokens: `navRail.*`, `iconography.*` (Lucide, 15px, stroke 2). Note it does **not** use `pane`'s shadow/radius.
- Use for: the app's primary section switcher (Home/Ask/Editor/Sandbox/Tools/Knowledge), present on every authenticated screen.

### Pane (canvas / chat-panel / any primary content column) (`component.pane`)
- **States:** default *(designed)*, resizing *(designed — live width via drag)*, loading *(designed, `skeleton`)*.
- Header row: breadcrumb/location chip + title + primary action, bottom hairline (`border.default`).
- Resizable the same way as NavRail; width is live component state, not persisted styling.
- Use for: Editor canvas, chat/suggestion panel, any main content column that sits beside the nav.

### AppFrame (`component.appFrame`)
- The outer shell every screen sits in: flat fill, `radius.lg`, `overflow: hidden`, **no padding of its own**.
- The nav rail runs flush to the frame's edges (the frame's radius clips the rail's outer corners). Only the content region to the right of the rail is inset — `contentRegion.padding` of 12px on top/right/bottom and **0 on the left**, so the first floating pane's shadow falls against the rail rather than a gap.
- Dark variant swaps fill only (`appFrame.background.dark`); panes inside remap per their own dark tokens.

### Button — primary (`component.button.primary`)
- **States, all designed in turn 8:** default, hover (darkens to pure `#000000`), active/pressed (`scale(.97)` + inset shadow), disabled (opacity `.35`, `cursor: not-allowed`), focus (ring, `focus.shadow`).
- Use for: exactly one primary action per view/toolbar (Promote, Accept, Send).

### Button — secondary (`component.button.secondary`)
- **States, all designed:** default (bordered, white/pane-colored fill), hover (`surface.hover` fill), active (`surface.active` fill), disabled (opacity `.4`), focus (ring).
- Use for: Edit, Reject, Cancel, and other non-primary actions.

### Chip (`component.chip`)
- **States:** default (transparent, hairline border), hover (border darkens + `surface.hover` fill) *(designed)*.
- Use for: attach-context tokens (Files, Sources/Library) beside a composer or ask-bar — never for navigation or primary actions.

### Badge — status dot (`component.badge.status`)
- **Variants, all designed:** success (green), warning (amber), danger (red), info (slate/blue), neutral (grey). Each is a 6px dot + label, no background fill by default (the table/list variant); a tinted-background pill variant (using the matching `.tint` token) is available for card contexts — see `projectCard`'s role badge for the pill form.
- Use for: document/version status, membership role, review state — anywhere a single-word state needs to be scannable in a dense list.

### Suggestion callout (`component.suggestionCallout`)
- **States:** pending *(designed)* — checkmark badge + prose + Accept/Edit/Refine/Reject actions; stale/superseded (older proposal stacked below, per the existing app's refine-stack rule — reuse `elevation.level3.popout` at reduced opacity, *(derive)*).
- Contains inline tracked-change spans when showing an edit (`trackedChange.insertion`/`.deletion`).
- Use for: AI-drafted suggestions inline in the editor canvas.

### Ask-bar / composer (`component.askBar`)
- **States:** empty/placeholder *(designed)*, focused (ring, `(derive)`), with attached chips *(designed)*, sending/disabled while a run is in flight *(derive — apply `button.primary` disabled pattern to the send button)*.
- Use for: the primary "ask anything" input on the workspace landing, and the in-context composer in Editor/Ask.

### Table (`component.table`)
- **States:** default row, row hover *(designed)*, folder row (icon + no status cell) *(designed)*, empty state *(derive — center a one-line message + primary action, no table chrome)*.
- Never add a shadow to a row or the table itself; the containing pane already carries `elevation.level2`.
- Use for: Library (documents), Sandbox (folder tree, with an added indent per depth level, `table.cell.indent.folder`), and any future dense list (review comments, work items).

### Project card (`component.projectCard`)
- **States:** default *(designed)*, hover *(derive — same lift pattern as suggestionCallout, subtle `translateY` optional)*.
- Use for: "your projects" list on the workspace landing; the numbered circle communicates progress (drafted/total), not a percentage bar.

### Dropdown / menu (`component.dropdownMenu`)
- **States:** closed, open *(designed — elevation 4)*, item hover *(designed)*, item current/disabled (derive from table/nav active pattern).
- **Placement rule:** always `position: absolute`, opening from the trigger; the parent container must reserve enough space (or the overlay must be portalled) so the open menu never gets clipped by `overflow: hidden` or collides with content below it.
- Use for: project/org switcher, any "..." overflow menu, command palettes.

### Skeleton / loading (`component.skeleton`)
- **States:** shimmering bars at 3 widths (40/92/86/60% demonstrated) *(designed)*.
- Use for: canvas content and chat responses while a run is in flight. Do not use a spinner for these — the shimmer communicates "content is coming" without implying a determinate progress %.

### Collapse toggle (`component.collapseToggle`)
- **States:** default, hover *(designed)*.
- Use for: the nav-rail collapse control and the chat/panel collapse control (top-right of a pane header).

### Tracked changes (`component.trackedChange.insertion` / `.deletion`)
- Insertion: tinted background + colored text + colored underline. Deletion: tinted background + colored text + strikethrough, no underline.
- The **only** other place besides status badges where a hue outside the monochrome ramp appears — keep it that way.

---

## C. Layout & responsive rules

- **Shell z-order — the canonical layout.** Two layers, not three parallel ones. The nav rail is the **background layer**: flush on the frame, no card, no shadow, no seam. The content panes (canvas, chat/panel) are the **floating layer**: white, `radius.md`, `elevation.level2`, inset from the frame's top/right/bottom edges. The read is "one continuous rail that the panes sit in front of," not "three side-by-side panels." Every full-app screen follows this, whether it has one floating pane (workspace landing, library, sandbox) or two (editor: canvas + chat).
- **The gutter is 12px, and only one thing may own it.** The content region sets `gap: 0`. Where two panes are resizable, the 12px `ResizeGrip` between them *is* the gutter; where they are not, a 12px margin between adjacent panes supplies it. Setting both a row gap and a grip triples the gutter to 36px — this is the single easiest spacing mistake to make in this shell, and it has been made twice.
- **Design width:** every mockup is authored at a fixed **1280px** app-frame width (desktop-first; this is a professional B2B document tool, not a marketing site). No breakpoint narrower than this has been designed.
- **Pane proportions (default, pre-resize):** nav 216px · canvas flexible (fills remainder) · chat/panel 308px. These are *defaults*, not fixed — every pane is user-resizable (§B) between its stated min/max.
- **Container widths inside a pane:** document prose (`body.prose`) caps at **560–600px** measure, centered, regardless of pane width — never let editor text run edge-to-edge.
- **Grid:** the workspace project list and the library "create" cards use CSS grid at fixed column counts (3-up) rather than a fluid grid — there is no responsive column-count rule defined yet. If a build needs it, default to `repeat(auto-fill, minmax(260px, 1fr))` rather than a hardcoded 3.
- **Breakpoints:** none defined. Flag any responsive/mobile requirement to design before building — do not guess a breakpoint set.

---

## D. Accessibility rules

- **Contrast — measured, not estimated** (WCAG relative-luminance formula, both surfaces as actually specified):
  | Pairing | Ratio | Passes |
  |---|---|---|
  | `text.primary` / `surface.pane` (light) | 17.22:1 | AA + AAA |
  | `text.secondary` / `surface.pane` (light) | 7.37:1 | AA + AAA |
  | `text.muted` / `surface.pane` (light, corrected to #78766f) | 4.53:1 | AA (body text) |
  | `text.primary` / `surface.sunken` (light) | 14.84:1 | AA + AAA |
  | `action.primary.text` / `action.primary.bg` | 17.22:1 | AA + AAA |
  | `feedback.danger.text` / `surface.pane` | 5.89:1 | AA + AAA |
  | `feedback.success.text` / `surface.pane` | 5.40:1 | AA + AAA |
  | `feedback.warning.text` / `surface.pane` | 5.91:1 | AA + AAA |
  | `feedback.info.text` / `surface.pane` | 9.18:1 | AA + AAA |
  | `text.primary` / `surface.pane` (dark) | 14.21:1 | AA + AAA |
  | `text.secondary` / `surface.pane` (dark) | 11.64:1 | AA + AAA |
  | `text.muted` / `surface.pane` (dark) | 8.24:1 | AA + AAA |
  | `trackedChange.insert.text` / `.tint` (light) | 4.80:1 | AA |
  | `trackedChange.delete.text` / `.tint` (light) | 5.13:1 | AA |
  | `trackedChange.insert.text` / `.tint` (dark) | 7.69:1 | AA + AAA |
  | `trackedChange.delete.text` / `.tint` (dark) | 5.68:1 | AA + AAA |

  `text.faint` (`neutral.400`, #c7c5be, 1.73:1) is **decorative only** (separators, slashes) — never use it for body text or a label that carries meaning; it does not and is not intended to pass AA.
- **Focus:** every interactive element (buttons, nav items, chips, table rows, dropdown items) must show a visible focus ring on keyboard focus — `focus.ring` token, 3px offset ring as shown in turn 8. Never rely on hover-only affordance for an action reachable by keyboard.
- **Target size:** minimum interactive hit target is **32×32px** (nav items, buttons, chips all meet this at their designed padding) — do not shrink a clickable control below this even if the visible icon/label is smaller; pad the hit area.
- **Motion:** hover/press transitions are short (100–150ms) and opacity/color-based, not motion-based — safe under `prefers-reduced-motion` as-is. The loading shimmer should be paused/replaced with a static tint under `prefers-reduced-motion: reduce`.
- **Color independence:** every status badge pairs its color with a dot **and** a text label — never color alone. Tracked changes pair color with underline (insert) vs. strikethrough (delete) — never color alone.

---

## E. Migration map — old → new

Source of the "old" column: `packages/ui/src/tokens.ts` and `packages/ui/src/styles.css` (the T-049 "Legora-clean" mockup system currently implemented).

| Old (CSS var / class / value) | New | Notes |
|---|---|---|
| `--paper` (#faf9f6) | `semantic.color.surface.frame` (#dedad0) *or* `surface.rowHover` (#faf9f7) depending on use | Old paper was both page-bg and quiet-strip; the new system splits these — see which role the old usage played before mapping |
| `--panel` (#ffffff) | `semantic.color.surface.pane` | Direct swap |
| `--ink` (#1c1b18) | `semantic.color.text.primary` | Same value, now also doubles as `action.primary.bg` (monochrome accent) |
| `--ink-soft` (#55524a) | `semantic.color.text.secondary` (#57564f) | Deliberate refinement, final |
| `--muted` (#8a867c) | `semantic.color.text.muted` (**#78766f**) | Corrected for accessibility: the visually-similar #8a8880 contrasts at only 3.55:1 on white, failing AA for the small/bold uppercase labels it's used on. #78766f (4.53:1) is the value to ship — see §D |
| `--hairline` (#e7e4de) | `semantic.color.border.default` (#ececea) | Deliberate refinement, final |
| `--hairline-soft` (#f0eee9) | `semantic.color.border.subtle` (#f2f1ed) | — |
| `--accent` / `--accent-soft` / `--accent-ink` (green family) | **Removed as a UI accent.** Green is now reserved for `feedback.success` and `trackedChange.insert` only | This is the biggest change — audit every use of `.b-green`, `.cite.lib`, `.btn.primary` (which was green) and re-home it: primary actions → `action.primary` (now black); "current/accepted" badges → `feedback.success`; citations → keep as its own component, recolor to monochrome + `feedback.info` for the authority variant |
| `--authority` / `--authority-soft` (slate blue) | `feedback.info` | Keep for the "external authority" citation variant only — do not use for anything else |
| `--amber` / `--amber-soft` | `feedback.warning` | Direct role match |
| `--danger` / `--danger-soft` | `feedback.danger` | Direct role match |
| `--radius` (10px) / `--radius-sm` (6px) | `primitive.radius.md` (12px) / `.sm` (8px) | Not a direct value match — re-classify every old `border-radius: var(--radius)` by **role**, per this fixed rule: 4–5px → `xs` (4px, tight tags/dots); 6–8px → `sm` (8px, controls: buttons/chips/nav items); 9–11px → `md` (12px, nested cards); 14–16px → `lg` (16px, panes/frame/composer) |
| `--serif` / `--sans` / `--mono` | `primitive.font.family.serif/sans/mono` | Sans stack is now `-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, "Helvetica Neue", Arial, sans-serif` — a merge that keeps the old stack's OS coverage (Segoe UI/Roboto) and adds the mockups' Inter/Helvetica Neue emphasis |
| `.rail`, `.wordmark`, `.project-switcher`, `.rail nav a` | `component.navRail` | Three changes, all required: (1) the rail loses its card treatment entirely — no fill, radius, shadow, or divider (§C shell z-order); (2) its hover/active fills move to the `surface.frame*` tokens, since the pane-tuned ones vanish against the frame; (3) resize and collapse are new required behavior |
| `.topbar` | Pane header (`component.pane` header row) | Old topbar spanned the full main column above tabs; new header is per-pane |
| `.command` | `component.askBar` | Old command bar was a flat hairline box; new is a filled soft-pill with no border — full restyle, not a token swap |
| `.card`, `table`/`thead`/`tbody` | `component.table` (for tabular), or a nested card via `elevation.level3.popout` (for card-shaped content) — **decide per use**, they are no longer the same thing | Old `.card` was used for both roles; new system splits dense-tabular (flat, level 1) from card-shaped content (popout, level 3) |
| `.badge` + `.b-green/.b-slate/.b-amber/.b-grey/.b-red` | `component.badge.status` variants `success/info/warning/neutral/danger` | Direct rename, recolor `.b-green`→success (still green, now via `feedback.success` not `--accent`) |
| `.btn` / `.btn.primary` / `.btn.quiet` / `.btn.danger` | `component.button.secondary` (default) / `.primary` / `.secondary` with no border (quiet) / `.secondary` + `feedback.danger.text` color override | `.btn.primary` was green — becomes monochrome black per the new accent rule |
| `.suggest-panel`, `.s-card` | `component.pane` (panel) + `component.suggestionCallout` | — |
| `.proposed` / `.proposed.stale` | `component.suggestionCallout` (current) / same at reduced opacity for stale (§B) | Old used a colored left-border accent bar — **removed**, this is exactly the "rounded container with left-border accent" pattern the new system avoids; replaced by the plain nested-card treatment |
| `.ins` / `.del` | `component.trackedChange.insertion` / `.deletion` | Direct role match, values updated to the new green/red primitives |
| `.project-grid` / `.project-card` | `component.projectCard` in a CSS grid | Old cards had no progress indicator; new adds the numbered circle badge — **new required field**, not optional |
| `.tree` / `.ficon` / `td.indent` | `component.table` with `table.cell.indent.folder` | — |
| `.location-chip`, `.switcher-menu`, `.src-chip`/`.src-picker` | `component.chip` (location/source chips) + `component.dropdownMenu` (switcher/picker) | Switcher menu was `position:absolute` inside the rail with no elevation-4 shadow — **upgrade required**: give it `elevation.level4.overlay` and verify it doesn't get clipped (§B placement rule) |
| `.format-bar` | Keep, align later | Not restyled in the mockups yet — leave as-is for now, migrate when the Editor toolbar gets its own pass |
| `.comment-thread`, `.comment-*`, `.canvas-mirror`, `.mention*` (T-112 sandbox comments) | Keep, align later | Untouched by this system; still in active development per CONTEXT.md — do not restyle speculatively |
| Dark theme (`:root[data-theme='dark']` block) | `semantic.color.*.dark` values throughout `design-tokens.json` | The old dark remap was comprehensive (matches every light var); the new dark remap only covers what turn 7 (Editor) showed — extend the same pattern to other screens per §F, reusing the existing old dark values as a starting reference where the new light token has no dark counterpart yet |
| Any inline `style={{ color: 'var(--muted)' }}` etc. in `apps/web/src/**` | Same semantic token, new value | The component *names* referenced in CSS vars carry over almost 1:1 in meaning — this migration is mostly "same variable name, adjusted value + a few role reassignments (accent, card vs. table)," not a rebuild of the component tree |

**Net effect for the coding agent:** `packages/ui/src/tokens.ts` and `styles.css` should be regenerated from `design-tokens.json` (same job, new source of truth) — do not hand-edit both files going forward, since as of this migration the JSON is authoritative and CSS custom properties are generated/derived from it (§F explains how to add to the JSON so the CSS stays in sync).

---

## F. Extension rules — how to grow the system

New components and tokens are expected and welcome. Follow these rules so new work stays on-system instead of drifting back into ad-hoc values.

1. **Which tier does a new value belong in?**
   - A brand-new raw value (a color, a size) → **primitive**. Only add a primitive if nothing in the existing ramp is within ~5% of it — reuse an existing step first.
   - A new *use* for an existing primitive (e.g., "the color for a warning toast background") → **semantic**. Name it by intent (`feedback.warning.toastBg`), not appearance.
   - A value specific to one component that no other component will ever reuse → **component**, and it must still reference a semantic token, never a raw primitive directly.

2. **Naming:** always intent-first. `feedback.danger`, not `red`. `action.primary`, not `black-button`. `text.muted`, not `grey-13px`. If the underlying color/value changed tomorrow, the name must still make sense unchanged. Reject any token name that describes *appearance* (a color name, a pixel size) or *position* (primary/secondary/tertiary used as a stand-in for "first/second/third button") rather than *role*.

3. **When to add a component token vs. reuse semantic directly:** if a component's use of a semantic token is a straight pass-through (e.g. a button just uses `text.primary` as-is), don't wrap it in a component token — reference the semantic token directly in code. Add a component token only when the component customizes the value in a way worth naming (e.g. `button.primary.background.hover` is darker than any generic `surface.hover`).

4. **Introducing a new component:** it must ship with, at minimum:
   - Every interactive state it can be in: default, hover, focus, active/pressed, disabled — and loading/error if applicable.
   - Which elevation level it lives at (1–4, §A) — decide this before styling it, it determines whether it gets a shadow at all.
   - Which radius step it uses and why (is it a pane, a nested card, or a control?).
   - An entry in the Component Inventory (§B) with the same "states / tokens / when to use" shape as the existing entries.
   - A dark-mode value for every color token it introduces (even if dark mode for that screen isn't built yet — the token should exist so dark mode is mechanical later).

5. **Extending a scale (spacing, type, radius) vs. reusing a step:** default to reusing the nearest existing step. Only add a new step to a scale if a real, recurring design need can't be expressed by rounding to an existing one (not "this looks 1px better") — and when you do, insert it in scale order and update both files together. Don't add a one-off value outside any scale "just for this component."

6. **Status/feedback colors are a closed set of 5** (success/warning/danger/info/neutral) by design (§A) — do not add a 6th hue for a new status without a real product reason (e.g., a genuinely new state class that can't be expressed by the existing 5). If you do, it still must pair with a text label, never stand alone, and must get light+dark values.

7. **New icons:** always Lucide, always 2px stroke, `currentColor`. Don't hand-draw or source icons from a different set — the whole nav/table/button icon language depends on one consistent line weight.

8. **Toast/notification example (a plausible next component):** would be elevation level 4 (floats above panes), reuse `feedback.*` tokens for tone, `button.secondary`-style dismiss control, and needs a documented auto-dismiss/manual-dismiss state pair — following this checklist end to end is exactly what "on-system" means in practice.
