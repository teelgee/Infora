# UI vocabulary — the shared names for interface elements

> **Status: reference, 2026-07-12; sources renamed and History added 2026-07-13 (T-105–T-108); Workflows renamed Tools 2026-07-13 (T-109).** One name per element, matching the component names in `packages/ui` and the screens in `apps/web` — so feedback, tickets and code all say the same thing. When a new element lands, name it here in the same commit.

## Layout regions

| Term | What it is |
|------|------------|
| **Rail** | The left sidebar (`Rail`). Holds the wordmark, workspace zone, switcher, nav and user chip. |
| **Workspace zone** | The org name + "All projects" link at the top of a project rail (`WorkspaceZone`). |
| **Topbar** | The strip across the top of the main area; its text is the **crumb** (breadcrumb), status pills sit right. |
| **Content area** | Everything under the topbar: **page heading**, **page subtitle**, **section labels** (`SectionLabel`). |
| **Panel** | A right-hand column with its **panel header**: the Editor's **chat panel**; Ask's **source panel** (`SourcePanel`, T-105 — the clicked source rendered as a document, state badged). |

## Navigation

| Term | What it is |
|------|------------|
| **Switcher** | The workspace/project chip atop the rail (`ProjectSwitcher`); opens the **switcher menu** (T-099). |
| **Nav item** | One rail entry: glyph + label (`RailNav`). |
| **Drill-down / sub-items** | The chevron on a nav item and the layer it opens beneath (sandbox documents, library references) (T-099). |
| **User chip** | The name block at the rail's foot (`UserChip`); opens settings (T-092). |

## Small elements

| Term | What it is |
|------|------------|
| **Badge** | A non-clickable status pill (`Badge`): *Live*, *Member*, *Completed*, "includes model knowledge". |
| **Source** | The inline pill after the claim it backs (`SourceChip` — renamed from *citation chip*, 2026-07-13); clicking it opens the source panel in Ask (T-105), the source modal elsewhere (T-094/T-095). |
| **Chip** | A clickable pill: the **source** above, the **location chip** (editor topbar → sandbox, T-098), the **open-in-editor chip** (under an Ask answer → a fresh sandbox document, T-106), and the **source-row chips** (composer, T-100 — say "source-row chip", not "source chip", now that *source* names the inline pill). |
| **Card** | A bordered container (`Card`); tables and forms sit in cards. |
| **Banner** | The wide notice block (the audit screen's shield banner). |
| **Empty state** | A page/table body naming what isn't here yet and which slice brings it. |

## Chat

| Term | What it is |
|------|------------|
| **Composer** | The chat input box (`ChatComposer`, T-097): input, send button, **stop button** while a run is in flight. |
| **Source row** | The chip row beneath the composer (`ComposerSources`, T-100; Style added T-107); **pickers** (e.g. the library picker) pop up from it. |
| **Bubble / who label / note** | One message; the name above it; a muted system line (e.g. a cancellation). |
| **Run details expander** | The collapsed "Run … · every step in the audit trail" line (T-088); opens the **run trace** (`RunTrace`, the step checklist). |

## Editor

| Term | What it is |
|------|------------|
| **Canvas** | The document surface; the **format bar** sits over it with **Write/Preview** modes (T-096). |
| **Callout** (or **proposed block**) | A suggestion in the document: **tag line**, **cited prose** (`CitedProse` — claims with their inline sources), **withheld notice**, **action row** (Accept / Edit / Refine / Reject), **refine dialog** (T-091/T-096). |
| **Refine stack** | Stacked proposals in one callout area: the newest is **current** (green), older ones **stale** (red) (T-091). |
| **Source modal** | The overlay opening a cited version (`SourceModal`, T-094) — still used on the rail drill-down and in the Editor; Ask uses the source panel (T-105). |

## Tools

| Term | What it is |
|------|------------|
| **Tool** | The packaged, launchable capability on the Tools page (owner-ruled 2026-07-13, T-109): Infora-standard, org-built, or your own. The minimal tool is a single workflow with a name and description; a richer tool (e.g. a QA tool) steps through several. Users only ever see tools. |
| **Workflow** | The engine's term for the codified step sequence a tool — or the review cycle — runs (`packages/workflows`, ADR-0026/0027). Never a navigation destination; say "tool" on the surfaces. |
| **Builder** | The build-a-tool entry inside Tools (Slice F); a built workflow surfaces as your own tool, org-visible in the MVP (scoping ruling on the tracker). |

## Screens

The routable pages: **workspace landing**, the workspace **section pages** (Ask/Editor/Personal sandbox/Tools/Your knowledge), **project home**, **Ask**, **Editor** (and its **entry screen**), **Documents** (the project library), **Sandbox**, **Review**, **Tools** (was Workflows, T-109), **History** (your prompted turns, T-108), the **audit screen** (work item), **settings**.
