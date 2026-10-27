# Pillar walkthroughs - the brief (v2)

The owner's brief (2026-10-05), recorded so every agent works from the same page.

## What changed from the first set

The first set (`demo/videos/`, built from `demo/archive/2026-10-sizzle/plan/`) was judged **too
high-level and too salesy**: big text cards, heavy zooms, 20-30 second
teasers. The owner wants **product demos**. Each one shows a specific,
detailed workflow in the product, and looks like what Infora is meant to look
like. Some features and content aren't built yet, and that's acknowledged;
those screens are drawn in the same design language as the built ones, not
invented in a different style.

Reuse what works from the first set: the Remotion project, the design tokens,
the Wrenfield world and data, and the fidelity rules. Drop what doesn't: the
sizzle cards between beats, the blurring of most of the screen, the extreme
zooms, and the pacing aimed at muted LinkedIn viewers.

## What we are making

**Four videos of about 2 minutes each, one per pillar** of the owner's deck
(`research/deck-source.md`, `research/four-pillars-slide.png`):

1. **Document management.** Follow one document through its controlled life:
   it's produced, promoted, and issued for review. The review happens, comments
   are dealt with by both sides and closed out, and the document becomes
   authoritative (accepted, and part of the project record).
2. **Context layer.** The project library, then Ask: someone asks a question,
   Ask answers from what's in the project library and gives sources for each
   answer from the library. Also show "every document feeds a living ontology,
   and every new document starts from it".
3. **Collaboration.** True multiplayer. Two people work in the editor on one
   document at the same time, using the chat window to prompt the AI to
   generate new text, and working together on that single document. Include
   the sandbox: creating new documents that the right people have access to.
4. **Tools.** Run a QA check; run an existing workflow; then build an app. The
   app builder must be a **really polished** version of producing the
   **supplier KPI dashboard**: the first and best example, chat-led (the
   owner's earlier critique still stands: the agent drives the builder's steps).

## Style

- **Walkthrough, not advert.** The full app is on screen most of the time, at
  a size where the interface reads. The camera moves gently to where the
  action is. A real cursor drives every action. Typing is shown at a believable
  speed.
- Short step captions say what is happening, in plain words, in a consistent
  lower-third or side position. They label the step; they don't sell it. Use at
  most a brief opening title (pillar number and name) and a brief close.
- Silent render. A **narration script** is written per video and delivered as
  a file, so the owner can record a voiceover later. Captions and pacing must
  work without it.
- Accuracy: the UI follows the real app (`docs/architecture/user-story-screens/`)
  and the design system. Unbuilt parts follow the mockups and the design
  system's components. Vocabulary follows `CONTEXT.md` and the deck language
  rules (hyphens, not em dashes, in on-screen copy).
- Data: the invented Wrenfield world only.

## References to study

- Competitors' walkthroughs: https://build.inc/walkthrough-video and
  https://www.nomic.ai/use-cases (Nomic is the owner's direct AEC comparison).
- Earlier research: `demo/archive/2026-10-sizzle/research/benchmark-product-videos.md` (Harvey,
  Legora) and `demo/archive/2026-10-sizzle/research/product-inventory.md` (Infora's features, design
  system, Wrenfield world, and claims we must not make).

## Where things go

- `demo/plans/`: this brief, `master-plan.md`, `research/`, `reviews/`, and
  one folder per video (`wN-<slug>/plan.md` and `narration.md`)
- Source: `demo/studio/src/walkthroughs/wN/` (same Remotion project)
- Renders: `demo/videos/`
