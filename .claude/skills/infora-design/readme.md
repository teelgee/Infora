# Infora Design System

AI-native document production and control for infrastructure projects. Infora is
where a client body, its consultants and its contractors draft, ground, review
and control the deliverables a scheme needs — consultation statements,
environmental chapters, traffic plans, land schedules — with every suggestion,
source access and model call written to an audit trail.

This design system holds the visual and behavioural rules for that product: the
tokens, the component kit, and a click-through recreation of the app's surfaces.

## Sources

Everything here was derived from the following, not from memory or screenshots:

- **Codebase:** the `infora` monorepo (attached locally). Specifically
  `packages/ui/src/` — the existing shared React kit and its `styles.css` /
  `tokens.ts` — and `apps/web/src/screens/` for the surfaces.
- **Glossary:** `CONTEXT.md` in that repo is the ubiquitous language. Interface
  labels must use its terms exactly (see Content fundamentals).
- **Approved mockups:** `Workspace Redesign.dc.html` in this project — the design
  exploration this system codifies, turns 4–11. Turn 10a is the canonical shell.
- **Written rules:** `design-rules.md` and `design-tokens.json` in this project.
  These remain the authoritative long-form specification; this readme is the
  orientation layer above them.

There is **no logo or brand mark** in any provided source, and none was invented.
The wordmark is the word "Infora" set in the serif alongside a plain near-black
square. If a real mark exists, supply it and it replaces the square.

## Index

| Path | What it is |
|---|---|
| `styles.css` | The global entry point. Consumers link this one file. |
| `tokens/` | Custom properties: colours, type, spacing, radius, elevation, motion, dark remap, fonts. |
| `chrome.css` | The class vocabulary the components emit — the visual spec. |
| `components/core/` | Button, IconButton, Chip, Badge, SourceChip, Card, SectionLabel, CommandBar, WithheldNotice, OutChip, MadeCard |
| `components/shell/` | AppFrame, Rail, RailNav, RailSpacer, ProjectSwitcher, UserChip, WorkspaceZone, Pane, PaneHeader, CollapseToggle, ResizeGrip |
| `components/content/` | ProjectCard, SuggestionCard, NumBadge, Table, RunTrace, Skeleton, CitedProse, Prose |
| `components/overlays/` | DropdownMenu, DropdownMenuItem, Modal, Drawer |
| `components/forms/` | Field, TextInput, TextArea, SelectInput, Combobox |
| `components/chat/` | ChatComposer, ChatBubble |
| `guidelines/` | Foundation specimen cards (colour, type, spacing, elevation, states, motion, icons). |
| `ui_kits/app/` | Click-through recreation: workspace, editor, library, sandbox. |
| `design-rules.md` | The full written rulebook — read this before making decisions. |
| `design-tokens.json` | The token source of truth in JSON form. |

### Intentional additions

The component list mirrors `packages/ui/src`'s exports. Four additions, each
because the redesign introduced a real element the old kit had no name for:

- **AppFrame / Pane / PaneHeader** — the old app had a full-width topbar and no
  frame concept. The new two-layer shell needs them named.
- **CollapseToggle / ResizeGrip** — rail collapse and pane drag-resize are new
  required behaviour.
- **IconButton** — the composer's send affordance was previously an unnamed span.
- **Prose / ChatBubble** — the document body and chat turn treatments, previously
  inline styles inside the screens.

`Markdown` from the old kit is deliberately absent: it is a rendering utility,
not a visual component, and carries no design decisions.

---

## Content fundamentals

**Voice: plain, specific, and never enthusiastic.** This is a system of record
for work that goes to a planning inspectorate. Copy states what happened and what
the user can do about it. It does not celebrate, encourage, or explain its own
cleverness.

**Second person for the user, no first person for the system.** "Your projects",
"pending your decision", "outside your organisation's access". The product never
says "I" and never says "we" — it has no persona. An agent's output is reported,
not narrated: "Done — 1 suggestion on the document, grounded on the Traffic
Management Plan v2," not "I've drafted a suggestion for you!"

**Sentence case everywhere.** Buttons, headings, labels, menu items: "Promote a
draft", "Ask across your firm's own knowledge", "New draft". Never Title Case,
never ALL CAPS in the copy itself — the uppercase micro-label style is applied by
CSS, so the source text stays sentence case.

**Past tense for what the system did; imperative for what the user can do.**
Run traces read "Retrieved sources", "Ground-checked claims", "Suggestion
drafted" — outcomes, not gerunds ("Retrieving…" only while genuinely in flight).
Actions read "Accept", "Reject", "Promote", "Refine".

**Say the number.** "7 of 11 deliverables drafted", "2 sources withheld",
"Three active projects, one awaiting your response". Vague quantities ("several",
"a few") are not acceptable in a product whose value is traceability.

**Use the glossary word, always.** `CONTEXT.md` fixes one word per concept:
Organisation, Workspace, Project, Programme, Owner, Member, Library, Sandbox,
Deliverable, Source, Suggestion, Run, Cycle. Never substitute a synonym in the
interface — no "company" for Organisation, no "citation" for Source (renamed
2026-07-13), no "contributor" or "viewer" (retired roles). If a needed concept
has no glossary term, that is a language gap to raise, not a word to invent.

**Withholding is stated, not hidden.** When an ethical wall or a missing grant
means content exists but is out of reach, say so and say why: "2 files withheld —
Calderhale Energy's private sandbox." Silence would read as absence, which is a
different and wrong fact.

**No emoji in product chrome.** The `✦` ask glyph is the only non-Lucide symbol, and it is a
typographic mark, not emoji. The mockups use 📎, ▤ and ▧ as placeholders where a
Lucide icon belongs — replace them.

**Empty states name the next action.** One line of plain text plus the primary
action, no illustration, no encouragement: "Ask a question to begin a run."

---

## Visual foundations

**The defining idea: two layers, not three.** The nav rail is *part of the frame*
— flush on the warm-grey shell fill, no card, no radius, no shadow, no divider
seam. The content panes (canvas, chat) are white cards that float on it, inset
from the top, right and bottom edges. The read is "one continuous rail that the
panes sit in front of," not "three side-by-side panels." Every full-app screen
follows this, whether it carries one floating pane or two. This is the single
most important rule in the system; get it wrong and nothing else reads right.

**Colour: monochrome, with hue as a reserved signal.** A ten-step warm-grey ramp
(#ffffff → #1c1b18) plus a distinct four-value frame ramp (#dedad0 base, #e5e3dc
hover, #c9c5b8 active) for anything sitting directly on the shell. There is no
brand hue: the accent *is* near-black, used for primary buttons, active nav, and
avatar fills. Hue appears in exactly two places — five status tones (success,
warning, danger, info, neutral) and tracked changes (green insert, red delete).
Using a status colour for a button or generic emphasis is a system violation,
because it spends the meaning the reservation buys.

**Type: one serif, four roles.** Source Serif 4 carries the wordmark, the two
largest headings — a page greeting at 29px, a section H2 at 24px — project titles
at 15.5px, and the document body. Everything else, all interface chrome, is the
system sans. An eight-step scale from 10.5px to 29px; the 12.5px UI size carries
the plurality of the app. Document prose sits at 15.5px / 1.75 leading, capped at
a 560px measure and centred regardless of how wide the pane is dragged. The serif
on the canvas is deliberate: these are consultation statements and environmental
chapters going to a planning inspectorate, and the serif is what makes the canvas
read as the document of record rather than as interface. Source Serif 4 is the
primary face on every platform; Iowan Old Style, the Apple system face the
product started on, sits behind it in the stack and is no longer what most users
see.

**Backgrounds: flat fills only.** No gradients anywhere. No imagery, no
illustration, no pattern, no texture, no noise. The warm grey does the work a
gradient would do in a lesser system — it makes white feel like paper rather than
like a void. Two background colours per screen maximum: the frame and the panes.

**Elevation: four levels, and the frame is not one of them.** Flat (frame + rail,
hairline tables, dense rows) → pane (`0 10px 26px rgba(20,20,20,.12)`) → popout
(`0 10px 28px rgba(20,20,20,.09)`, for nested cards, suggestion callouts, the
ask-bar, chat bubbles) → overlay (a tight contact shadow plus a wide ambient one,
for menus and modals). Blur grows and opacity eases off as a surface floats
further from the frame. If you cannot say which level a thing is, it is flat.
Never shadow a table row, and never shadow the frame.

**Corner radii are hierarchical, not decorative.** 4 / 8 / 12 / 16px plus pill
and circle. The biggest radius goes on the biggest surface: 16 for the frame,
chat bubbles and the composer; 12 for floating panes and nested cards; 8 for
controls; 4 for tags and tight marks. A small control never gets a bigger radius
than the thing containing it.

**Cards: filled, soft, and shadowed — never bordered.** A nested card is a
`#efeeeb` fill at 12px radius with the popout shadow. No border, no left-accent
bar (the old system's proposal card had one; it is removed). Borders in this
system are hairlines that *separate* (a pane header's underline, a table row
rule), never outlines that *contain*.

**Interaction: colour and fill, not movement.** Hover fills a surface one step
darker (150ms, `ease`) — on a pane that is `#efeeeb`, on the frame it is
`#e5e3dc`, and using the wrong one makes the state invisible. Press on the
primary button is `scale(.97)` plus an inset shadow at 100ms; that 3% scale is
the only transform in the system. Project rows lift 1px on hover. Nothing
bounces, nothing springs, nothing slides in. Panel collapse takes 300ms.

**Focus is always visible.** A 3px `#cfcac0` ring on every interactive element —
buttons, nav items, chips, table rows, menu items. The primary button adds a
second 5px ring in the button's own colour so the ring reads against its dark
fill. No element is reachable by keyboard without showing where the keyboard is.

**Loading is a shimmer, not a spinner.** A 1.4s linear gradient sweep across
sunken-fill bars at varied widths, so it reads as prose arriving rather than as a
determinate percentage. Paused under `prefers-reduced-motion`.

**Transparency and blur: essentially none.** One scrim (`rgba(20,20,20,.28)`)
behind modals and drawers. No frosted glass, no translucent panels — the layer
model is communicated by shadow and fill, and adding blur would make two
competing systems for the same job.

**Density: comfortable, not airy.** 12px gutters between panes, 8px between
sibling rows, 7–10px padding inside a nav item, 10px in a table cell. The
original redesign brief called the old UI too empty; the answer was tighter
gutters and more content per pane, not more decoration.

**Layout is desktop-first and fixed.** Authored at 1280px. The rail (216px,
collapsing to 64) and the side panel (308px) are user-resizable by dragging a
12px grip — which carries the whole gutter, so the flex row's own `gap` must be
zero or the spacing doubles. No breakpoints below 1280px have been designed; a
responsive requirement is a design question, not an implementation guess.

**Dark mode is a remap, not a second design.** Every semantic token has a dark
counterpart (`tokens/dark.css`, scoped to `:root[data-theme='dark']`). Shadows
gain opacity to read against a dark page; the near-black accent inverts to
near-white with dark text on it. Only the Editor has been visually verified in
dark.

---

## Iconography

**Lucide, exclusively.** 2px stroke, `currentColor`, 15px in the nav, 14px
inline, 12–14px in controls. No icon font, no sprite sheet, no PNG icons — the
codebase has no icon assets of its own, and Lucide is what `packages/ui`'s
`RailNavItem.glyph` documents as the expected input. Load it from CDN
(`lucide-static` or `lucide-react`); the specimen card in
`guidelines/iconography.html` shows the five nav glyphs inline as SVG paths so
the card renders without a network dependency.

**Substitution flagged:** the mockups use a handful of unicode placeholders where
a Lucide icon belongs — `📎` (attach), `▧` (sandbox), `▤` (library/document),
`⇧` (promote), `⌇` (draft), `✓` (accept), `✦` (ask), `»`/`«` (collapse). Only `✦` is
intended to stay as a typographic mark. The rest should be
replaced with `Paperclip`, `FolderOpen`, `ArrowUpFromLine`, `FileText`, `Check`
and `ChevronsLeft`/`ChevronsRight` when implemented.

**No emoji, ever, in product chrome.** Where the mockups show one, it is a
placeholder.

**A glyph never carries meaning alone.** Nav items pair icon with label (the
collapsed rail restores the label as a tooltip). Status pairs a dot with a word.
Tracked changes pair colour with an underline or strikethrough.
