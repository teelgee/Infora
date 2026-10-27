# Product demo videos — the brief

The owner's brief (2026-10-04), recorded so every agent works from the same page.

## What we are making

A set of **short feature videos, 20–30 seconds each**, that also join together
into **one film of about 2 minutes or less**. They sell the *vision* of
Infora: what it will do, not only what is built today. **Accuracy to the
current build is not required.** The app still has unfinished content, so
scenes may show unbuilt screens. They must stay true to Infora's decided
direction, though: its vocabulary (`CONTEXT.md`), the ethical wall, and grounded,
cited AI.

## The owner's critique, which the videos must answer

**The app builder is too step-focused.** It should be **agent/chat-based**: the
user talks to an agent, and the agent then walks through the builder's steps
on their behalf. The steps stay visible as progress, but the user doesn't fill
them in by hand.

The videos must show **two apps being built** this way:

1. **A supplier-KPI reporting app.** It takes supplier KPIs and builds a
   dashboard.
2. **A slide-deck dashboard app.** Users type their written, qualitative
   input (commentary, narrative, risks) into the app's interface, then connect
   a spreadsheet for the quantitative data. The app produces a **dashboard
   delivered as a slide deck** (PowerPoint-style).

## Reference products

Harvey and Legora (legal AI) are the benchmark for how product videos in this
category look and pace. Nomic is the closest competitor in our own sector
(engineering and infrastructure consultancies).

## Production frame (fixed, so parallel work fits together)

- Remotion (React → MP4) project in `demo/product-video/`, 1920×1080, 30 fps.
  It has its own npm install and is not part of the pnpm workspace.
- Scenes are **recreated UI in React using Infora's design system**
  (`docs/design/design-tokens.json`, `.claude/skills/infora-design/`), with
  real screenshots from `docs/architecture/user-story-screens/` where they
  help. Recreated UI lets us show the vision, including the chat-first
  builder.
- No voiceover by default. The story is told with on-screen text, a visible
  cursor, typing, and zooms (adjust only if the research strongly says
  otherwise). Music is added later by the owner. Leave the audio track empty.
- Data is from the invented Wrenfield world only (Calder & Hale, Trentmoor
  Energy, and so on). No real companies, people or clients.

## Where things go

- `demo/research/`: benchmark research and the product inventory
- `demo/plan/`: the master plan and one direction file per video
- `demo/review/`: the sense-check reviews
- `demo/product-video/`: the Remotion source; renders go in `demo/product-video/out/`
