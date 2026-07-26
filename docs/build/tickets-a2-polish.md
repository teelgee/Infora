# Slice A2 polish pack — sandbox + review-cycle interfaces

*Drafted 2026-07-26 from a code + rendered-UI review (owner feedback: "clunky,
cards overlapping, chips with `_` in the text, general lack of polish").
Numbering continues from the board (last taken: T-222). Each ticket is scoped
for a less-experienced coder: exact files, steps, what not to touch, and a
verifiable acceptance test. Work them ticket-by-ticket, one commit each,
`pnpm -r typecheck` + the named checks green before the commit.*

**House rules that apply to every ticket here**
- Never use `window.prompt` / `window.confirm` / `window.alert` — real Modal +
  form controls ([packages/ui/src/dialog.tsx](../../packages/ui/src/dialog.tsx)).
- Use design-system primitives from `@infora/ui` (Button, Badge, SelectInput,
  Modal, DropdownMenu, Skeleton…) instead of raw styled elements.
- Icons are Lucide components, never emoji.
- Verify UI work with a throwaway Playwright spec + screenshot, then delete the
  spec (pattern: every `_shot.spec.ts` in this session's history).
- Don't restyle anything outside the ticket's stated scope.

---

## Findings summary (what the review found, with evidence)

**Confirmed defects**
1. **Underscore chips** — API error details render verbatim in a danger Badge:
   `super_user_required`, `round_not_open`, `reason_required`…
   Source: [cycle.tsx:115](../../apps/web/src/screens/cycle.tsx#L115)
   (`setNotice(error.body?.detail ?? error.body?.error ?? 'failed')`) rendered
   raw at line 150. The same raw-detail habit exists in sandbox/editor flows,
   and `ask.tsx:228` / `history.tsx:68` render `run.state` / `entry.state` raw.
2. **Card overlap on the review rail** — the verdict `<select>`
   ([cycle.tsx:444](../../apps/web/src/screens/cycle.tsx#L444)) is a raw
   element whose intrinsic width (long option text "… (accepting — publishes to
   the library)") exceeds the comments card (`.review-drr`, flex-basis 320px),
   so the select, the "Close & issue" button and the hint all spill past the
   card's right edge. Screenshot-verified at 1440×900.
3. **Two raw `<select>`s** in cycle.tsx (lines 394, 444) bypass `SelectInput`.
4. **Sandbox row-action noise** — `DocActions`
   ([sandbox.tsx:758](../../apps/web/src/screens/sandbox.tsx#L758)) renders up
   to 7 inline text buttons per row with `flexWrap`; rows have different action
   sets so nothing aligns, and rows wrap to two lines.
5. **`window.prompt` / `window.alert` still live in the editor** —
   [editor.tsx:270](../../apps/web/src/screens/editor.tsx#L270), 498, 520, 522,
   546 (freeze/promote feedback). Direct violation of the standing rule.
6. **Hardcoded 620px heights** — `.review-viewer` and the comments rail both
   cap at 620px ([styles.css:935](../../packages/ui/src/styles.css#L935),
   [cycle.tsx:349](../../apps/web/src/screens/cycle.tsx#L349)): wasted space on
   tall screens, double scrollbars on short ones.
7. **One `note` string for success and error** in the sandbox
   ([sandbox.tsx:1305](../../apps/web/src/screens/sandbox.tsx#L1305)) — both
   render in the same banner, indistinguishable.
8. **No loading states** — `Skeleton` exists in `@infora/ui` but sandbox /
   cycle / plan flash empty while fetching.
9. **Unstructured cycle header actions** — "Open the draft…", "Promote…",
   "Close as rejected" float inline with no grouping; on the reviewer side
   "Close as rejected" floats alone under the title.
10. **Verdict chip shows only the code** (`verdict A`) — the description and
    the code→label map (T-197) exist but aren't used here.
11. **Ad-hoc date formatting** — `fmtDate` lives only in library.tsx; other
    screens call `toLocaleDateString()` inline with varying options.

**Best-in-class gaps (Aconex / ACC / iManage-style patterns worth adopting)**
- No activity trail on the cycle page (who promoted / issued / closed, when) —
  the data already exists (transmittals, verdicts, closedReason).
- Closed rounds render at full height stacked newest-first — no
  collapse/summary, so a 3-round cycle is a wall of cards.
- No "n of m comments answered" progress cue, even though the respond gate
  (`unanswered_comments`) already enforces completeness.
- Transmittal `dueAt` exists in the schema but is never surfaced.
- The sandbox table has no search/filter (the plan screen already has one).

---

## T-223 — Human-readable API errors everywhere (kill the underscore chips)

**Why.** Users see `super_user_required` in a red chip. Every screen invents
its own error copy or shows the raw detail.

**Where.**
- New: `apps/web/src/api-errors.ts`
- Edit: [apps/web/src/screens/cycle.tsx](../../apps/web/src/screens/cycle.tsx)
  (the `act` catch, ~line 115), sandbox.tsx promote/freeze catches
  (`PROMOTE_REASON` at ~1489 moves), plan.tsx / schema.tsx / library.tsx
  catches, [ask.tsx:228](../../apps/web/src/screens/ask.tsx#L228) and
  [history.tsx:68](../../apps/web/src/screens/history.tsx#L68) raw states.

**How.**
1. Create `api-errors.ts` exporting
   `describeApiError(detail: string | undefined | null): string`.
   - A `Record<string, string>` mapping every known detail code to a short
     actionable sentence. Seed it by grepping the API for detail strings:
     `grep -rhoE "detail: '[a-z_]+'" apps/api/src | sort -u` (also the
     `forbidden(c, '...')` / `conflict(c, '...')` second arguments).
     Fold in the existing `PROMOTE_REASON` map from sandbox.tsx — move it
     here, don't duplicate it.
   - Fallback for unknown codes: `detail.replaceAll('_', ' ')` with a
     capitalized first letter — never render a bare underscore.
2. Replace every `setNotice(error.body?.detail …)` / `setNote(...)` catch with
   `describeApiError(...)`.
3. `ask.tsx` / `history.tsx`: pass the raw state through `statusBadge(...)`
   (shared.tsx) instead of printing it.

**Don't touch.** API responses themselves — the wire codes stay machine-readable.

**Acceptance.**
- Triggering a 403 on close-rejected as a non-elevated user shows a sentence
  (e.g. "Only an elevated super-user can do this"), not `elevated_required`.
- `grep -rn "body?.detail ?? " apps/web/src` returns nothing.
- Full typecheck + existing e2e green.

---

## T-224 — Fix the review-rail overflow (the overlapping-cards bug)

**Why.** The verdict select/button/hint spill outside the comments card.

**Where.** [cycle.tsx](../../apps/web/src/screens/cycle.tsx) lines ~388–470
(comment composer select at 394, verdict select at 444, `field` const at 669).

**How.**
1. Replace both raw `<select>`s with `SelectInput` from `@infora/ui`
   (see plan.tsx for usage; options are `{ value, label }`).
2. Shorten the accepting suffix in option labels to `" (accepting)"` — the
   full "publishes to the library" explanation already lives in the hint text
   and the confirm modal (T-202).
3. On the rail's inner grid add `minWidth: 0`; ensure every child of
   `.review-drr` is `width: 100%` / `maxWidth: '100%'`.
4. Delete the now-unused parts of the `field` style const if nothing else
   consumes them (the comment textarea still may — keep what's used).

**Acceptance.** Throwaway Playwright spec: for each of widths 1280 / 1440,
assert `boundingBox()` of the verdict select and the "Close & issue the round"
button is fully inside `boundingBox()` of the `.review-drr` element. Delete
the spec after screenshotting. Cycle e2e + typecheck green.

---

## T-225 — Viewport-based heights for the review viewer + rail

**Why.** Both panes hard-cap at 620px: dead space on tall monitors, double
scrollbars on laptops.

**Where.** [styles.css](../../packages/ui/src/styles.css) `.review-viewer`
(~935) and the inline `maxHeight: 620` on the rail
([cycle.tsx:349](../../apps/web/src/screens/cycle.tsx#L349)).

**How.**
1. `.review-viewer { max-height: clamp(420px, calc(100vh - 320px), 1100px); }`
   (320px ≈ header + round header + margins; tune against a screenshot).
2. Give the rail the same computed max-height via the same CSS class (add
   `.review-rail` beside `.review-drr` rather than inline styles).
3. Keep exactly one scrollbar per pane: the comments list scrolls
   (`overflowY: auto` stays on the inner list), the composer stays pinned.

**Acceptance.** Screenshots at 1440×900 and 1440×1200: the viewer grows with
the window, no double scrollbar, composer visible without scrolling the rail.

---

## T-226 — Structure the cycle header (actions + verdict chip)

**Why.** Three unrelated buttons float under the title; the verdict chip
reads `verdict A` with no meaning.

**Where.** [cycle.tsx](../../apps/web/src/screens/cycle.tsx) ~120–160.

**How.**
1. One header row: title block left, actions right, using a flex row with
   `marginLeft: 'auto'` — order: quiet "Open the draft in the Editor",
   primary "Promote the next version", then a visual gap
   (`borderLeft: '1px solid var(--border-default)'`) before the danger
   "Close as rejected". Danger never sits adjacent to primary.
2. Verdict chip: look up the code's description from the loaded
   `codes` list (`codes.find(c => c.code === row.deliverableCode.code)`), and
   render `A — Accepted` in the Badge; fall back to the bare code.
3. The status chip line keeps its current content otherwise.

**Acceptance.** Screenshot as author (3 actions) and reviewer (danger only,
right-aligned). No layout shift when `notice` appears.

---

## T-227 — Sandbox rows: primary action + overflow menu

**Why.** Up to 7 text buttons per row wrap onto two lines and nothing aligns.
Best-in-class DMS rows (Drive, iManage, ACC) use: row click = open, one or two
quick actions, the rest behind a kebab.

**Where.** `DocActions`
([sandbox.tsx:758](../../apps/web/src/screens/sandbox.tsx#L758)) and the two
tables that render it; `DropdownMenu` / `DropdownMenuItem` already exist in
`@infora/ui` ([dropdown-menu](../../packages/ui/src/dropdown-menu.tsx)).

**How.**
1. Row click (on the document name cell) opens the Editor (currently the
   "Open in Editor" button). Keep the cursor/hover affordance.
2. Visible quick actions shrink to two icon buttons: Freeze/Release (lock
   icons, `title` + `aria-label`) and Promote (bound docs only).
3. Everything else — Move, Metadata, Rename, Bind, Replace file — moves into a
   `DropdownMenu` behind a `MoreHorizontal` (Lucide) icon button. Menu items
   keep their current conditional visibility rules (comments at 783–796
   explain them — preserve those comments).
4. Fixed-width actions column so rows align regardless of doc state.

**Don't touch.** The freeze/release/promote handler logic itself.

**Acceptance.** Screenshot: every row is single-line with aligned action
columns. All previous actions reachable (menu open screenshot). The folder e2e
and slice-a e2e stay green (update selectors if they clicked the old buttons).

---

## T-228 — Toned, dismissible notices (sandbox + cycle)

**Why.** Success and error currently share one look; users can't tell which
happened.

**Where.** sandbox.tsx `note` (~1305), cycle.tsx `notice` (~150). The
`.banner` CSS class ([styles.css](../../packages/ui/src/styles.css)) is the
base.

**How.**
1. State becomes `{ text: string; tone: 'success' | 'error' } | null` in both
   screens.
2. Add `.banner--success` / `.banner--error` modifier styles (green/red
   left-border + tinted background using existing token colours; follow the
   Badge tone colours).
3. Success notices auto-dismiss after ~5s (`setTimeout` in a `useEffect`,
   cleared on unmount); errors stay until dismissed (keep the ✕ button).
4. Callers pass the tone: promote failure = error, freeze/release done =
   success, etc.

**Acceptance.** Trigger one of each on the sandbox screen; screenshot both.
Typecheck green.

---

## T-229 — Loading skeletons + empty states (sandbox / cycle / plan)

**Why.** All three screens flash blank while fetching; `Skeleton` exists and
is unused here.

**Where.** sandbox.tsx, cycle.tsx, plan.tsx initial-load branches;
`Skeleton` from `@infora/ui`.

**How.**
1. While the primary list/cycle fetch is in flight (`items === null` -style
   guards already exist), render 3–4 `Skeleton` rows shaped like the real
   content (card-height blocks for sandbox cards, table rows for tables,
   a viewer-shaped block for the cycle).
2. Empty states get one sentence + the primary action, e.g. sandbox with no
   documents: "No documents yet — create one or drop a file." with the New
   document button. Plan and cycle equivalents.

**Acceptance.** Throttled-network screenshot shows skeletons (Playwright:
`page.route` with a delayed fulfil). Empty-state screenshot per screen.

---

## T-230 — Purge `window.prompt` / `window.alert` from the editor

**Why.** Five violations of the standing rule live in editor.tsx (lines 270,
498, 520, 522, 546) — including the freeze/promote feedback path that pairs
with the sandbox flows.

**Where.** [editor.tsx](../../apps/web/src/screens/editor.tsx).

**How.**
1. Line 270 (`window.prompt('Edit the proposed content', …)`): replace with a
   small Modal + TextArea (see TextModal in sandbox.tsx:106 for the pattern —
   consider extracting it to `@infora/ui` if it fits cleanly).
2. Lines 498–546 (`window.alert` for freeze/promote outcomes): replace with
   the toned notice pattern from T-228 (do T-228 first; reuse its banner).
   Reuse `describeApiError` (T-223) for failure details.

**Acceptance.** `grep -rn "window\.\(prompt\|alert\|confirm\)" apps/web/src`
returns nothing. Freeze + promote from the editor verified by screenshot.

---

## T-231 — Round history: collapse closed rounds, show comment progress

**Why.** Rounds stack newest-first at full height; a 3-round cycle is a wall.
And reviewers/authors can't see response progress at a glance even though the
respond gate counts it.

**Where.** cycle.tsx round mapping (~245–258) and `RoundCard`.

**How.**
1. Only the newest round renders expanded. Earlier rounds render as a
   one-line summary row: `Round n · P0n · <state badge> · <verdict chip if
   any> · <issued date>` with a chevron; clicking expands that round (local
   `useState<Set<roundId>>`).
2. In each round header add a progress line when comments exist:
   "3 of 5 comments answered" — computed from
   `round.comments.filter(c => c.response !== null)` (check the exact
   response field on `ReviewComment` in contracts before coding).
3. No API changes.

**Acceptance.** Seed a 2-round cycle (promote → issue for revision →
respond → re-promote); screenshot shows round 1 collapsed to a summary line,
round 2 expanded. Cycle tests + e2e green.

---

## T-232 — Cycle activity trail (stretch)

**Why.** Best-in-class review tools show the audit line inline: promoted by X
on date, issued by Y with verdict Z, closed-rejected with reason. All facts
already exist (transmittals with sender/recipients/dueAt, verdicts,
closedReason, closedBy).

**Where.** cycle.tsx (new `ActivityTrail` component at the bottom of the
page); data is already in the `ReviewCycle` payload — check
`packages/contracts` for what `rounds[].transmittals` carries and extend
`readCycle` (apps/api/src/cycle.ts) only if a needed fact (e.g. sender name)
is missing.

**How.**
1. Flatten cycle → events: each transmittal (direction, sender, date, dueAt),
   each verdict set, the close (accepted / rejected + reason).
2. Render as a compact vertical list: Lucide icon + one sentence + relative
   date, oldest first. `SectionLabel` "Activity".
3. If sender names aren't in the payload, add them in `readCycle` (join
   participants → users like `toPlanRows` does) — keep the shape additive.

**Acceptance.** On an accepted deliverable the trail reads: promoted →
issued (verdict A — Accepted) → published. Screenshot. API tests green
(additive contract change only).

---

## T-233 — Consistency sweep: dates + status chips

**Why.** Date formatting is ad hoc per screen; two screens print raw states.

**Where.** shared.tsx (new helpers), library.tsx `fmtDate` (move it),
plan.tsx / cycle.tsx `toLocaleDateString` call sites, ask.tsx:228,
history.tsx:68.

**How.**
1. Move `fmtDate` into shared.tsx as `formatDate(iso: string)`; one style
   everywhere: `25 Jul 2026`. Replace every inline `toLocaleDateString`.
2. Route ask/history raw states through `statusBadge`.
3. While there: `statusBadge`'s tone guessing (`status.includes('review')`)
   gets an explicit map for the known statuses (planned, in_production,
   in_review, responding, accepted, rejected, withdrawn) with the current
   fallback retained.

**Acceptance.** `grep -rn "toLocaleDateString" apps/web/src` shows only
shared.tsx. Screenshots of ask + history show humanized chips.

---

## Suggested order

1. **T-223** (error copy — unlocks T-228/T-230, most user-visible win)
2. **T-224** (the overlap bug)
3. **T-227** (sandbox row noise — biggest layout win)
4. **T-228** → **T-230** (notices, then the editor purge that reuses them)
5. **T-226**, **T-225** (cycle header + heights)
6. **T-229**, **T-233** (skeletons, consistency)
7. **T-231**, then **T-232** (round collapse, activity trail)
