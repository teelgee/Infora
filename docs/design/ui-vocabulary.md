# UI vocabulary — the shared names for interface elements

> **Status: reference, 2026-07-12.** One name per element, matching the component names in `packages/ui` and the screens in `apps/web-consultant` — so feedback, tickets and code all say the same thing. When a new element lands, name it here in the same commit.

## Layout regions

| Term | What it is |
|------|------------|
| **Rail** | The left sidebar (`Rail`). Holds the wordmark, workspace zone, switcher, nav and user chip. |
| **Workspace zone** | The org name + "All projects" link at the top of a project rail (`WorkspaceZone`). |
| **Topbar** | The strip across the top of the main area; its text is the **crumb** (breadcrumb), status pills sit right. |
| **Content area** | Everything under the topbar: **page heading**, **page subtitle**, **section labels** (`SectionLabel`). |
| **Panel** | The right-hand column in the Editor (the chat panel), with its **panel header**. |

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
| **Chip** | A clickable pill: **citation chip** (`CitationChip`, opens the source — T-094/T-095), **location chip** (editor topbar → sandbox, T-098), **source chip** (composer source row, T-100). |
| **Card** | A bordered container (`Card`); tables and forms sit in cards. |
| **Banner** | The wide notice block (the audit screen's shield banner). |
| **Empty state** | A page/table body naming what isn't here yet and which slice brings it. |

## Chat

| Term | What it is |
|------|------------|
| **Composer** | The chat input box (`ChatComposer`, T-097): input, send button, **stop button** while a run is in flight. |
| **Source row** | The chip row beneath the composer (`ComposerSources`, T-100); **pickers** (e.g. the library picker) pop up from it. |
| **Bubble / who label / note** | One message; the name above it; a muted system line (e.g. a cancellation). |
| **Run details expander** | The collapsed "Run … · every step in the audit trail" line (T-088); opens the **run trace** (`RunTrace`, the step checklist). |

## Editor

| Term | What it is |
|------|------------|
| **Canvas** | The document surface; the **format bar** sits over it with **Write/Preview** modes (T-096). |
| **Callout** (or **proposed block**) | A suggestion in the document: **tag line**, **cited prose** (`CitedProse` — claims with inline citation chips), **withheld notice**, **action row** (Accept / Edit / Refine / Reject), **refine dialog** (T-091/T-096). |
| **Refine stack** | Stacked proposals in one callout area: the newest is **current** (green), older ones **stale** (red) (T-091). |
| **Source modal** | The overlay opening a cited version (`SourceModal`, T-094). |

## Screens

The routable pages: **workspace landing**, the workspace **section pages** (Ask/Editor/Personal sandbox/Workflows/Your knowledge), **project home**, **Ask**, **Editor** (and its **entry screen**), **Documents** (the project library), **Sandbox**, **Review**, **Workflows**, the **audit screen** (work item), **settings**.
