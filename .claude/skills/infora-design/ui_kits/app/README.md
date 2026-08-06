# Infora app — UI kit

A click-through recreation of the product's authenticated surfaces, built on the
design system's own components. Open `index.html`.

## Screens

| Screen | File | Source |
|---|---|---|
| Workspace landing | `WorkspaceScreen.jsx` | `apps/web/src/screens/workspace.tsx` |
| Editor (canvas + run panel) | `EditorScreen.jsx` | `apps/web/src/screens/editor.tsx` |
| Library | `LibraryScreen.jsx` | `apps/web/src/screens/library.tsx` |
| Sandbox | `SandboxScreen.jsx` | `apps/web/src/screens/sandbox.tsx` |

## What is interactive

- Rail navigation switches screens; the rail collapses to the 64px icon rail.
- The editor's suggestion can be accepted (it becomes a tracked insertion in the prose) or rejected.
- The chat composer sends; the run panel is drag-resizable between 240 and 420px.
- Project rows on the landing open the editor.

## Not built

Ask (beyond an empty state), review/cycle, history, settings, and login have no
approved mockup yet — see the gap list in `../../readme.md`. Building them means
composing the existing components, not inventing new visual language.
