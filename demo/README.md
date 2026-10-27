# Demo videos

Short product demos of Infora: about 2 minutes each, silent, with step
captions and a separate narration script for a voiceover. They show the
product the way it is meant to look, which includes **screens that are not
built yet**, drawn in the same design language.

> **Vision, not evidence.** A demo video is neither a record of what Infora
> does today nor a decision about what it will do. Never cite one as either.
> The record of what is built is the user-story walkthrough
> (`docs/architecture/user-stories-walkthrough.html`). Proposals for unbuilt
> screens are mockups (`docs/design/mockups/`), and decisions are ADRs. A
> feature that appears only in a demo video has no standing until it goes
> through that loop. The name is "demo video" on purpose: "walkthrough" in
> this repo means the photographed record.

## What's here

| Path | What it is |
|---|---|
| `videos/` | **The current demo videos** (MP4, gitignored; back up elsewhere). W1 Document management, W2 Context layer, W3 Collaboration, W4 Tools, W5 Ethical walls. |
| `plans/BRIEF.md` | The owner's brief for the current set, and the style it asks for |
| `plans/master-plan.md` | The shared rules: the on-screen grammar (window, captions, chapter bar, camera, cursor, typing), the app shell for each seat, the cast and the data |
| `plans/wN-*/plan.md` | One video's script: chapters, a frame-accurate shot table, captions |
| `plans/wN-*/narration.md` | That video's voiceover script, timed to frames |
| `plans/research/` | Competitor benchmarks, the owner's deck, and the screen-by-screen maps of the real product the plans were built from |
| `plans/reviews/` | The review rounds, kept as a record |
| `studio/` | The code that draws the videos (Remotion). Its README is the technical reference |
| `archive/2026-10-sizzle/` | The first attempt: 20-30 s sizzle clips and a 2-minute film, judged too high-level and salesy. Kept for reference only |

## How to make a new demo video

The order matters, and so does showing the owner early. The first full run
spent heavily on review layers before the owner saw anything. Don't repeat
that.

1. **Agree the story in one paragraph** with the owner: whose seat, which
   workflow, what the viewer should believe by the end. Put it in
   `plans/BRIEF.md` or a short addition to it.
2. **Check what's real.** Find the screens in
   `docs/architecture/user-story-screens/` and the governing ADRs. Mark each
   beat as built, ruled (decided, not built) or vision (neither). Reuse
   `plans/research/` before researching again.
3. **Write the plan** in `plans/wN-<name>/plan.md`, following
   `plans/master-plan.md`: 5-6 chapters, 110-130 s, a frame-accurate shot
   table, captions of 8 words or fewer with hyphens not em dashes, and a
   narration script of about 240 words. Reuse screens from earlier videos
   wherever you can; W5 is mostly built from W1-W3's parts.
4. **Show the owner the plan** (a short summary, not the file) and get a yes,
   or the decisions only they can make.
5. **Build it** in `studio/src/walkthroughs/wN/` (see `studio/README.md`). Add
   any new names or strings to `studio/src/data/wrenfield.ts`, using the
   invented Wrenfield world only.
6. **Check a handful of frames**: each chapter's key frame, each click, each
   cut. That's 25-35 stills with `node scripts/stills.mjs`, at half scale.
   Fix what's wrong.
7. **Render** to `videos/` and **show the owner the video** before any further
   polish. Fix what they point at.

Rules that keep the videos honest:

- **Built screens match the screenshots.** Layout, wording and states follow
  the real app. Unbuilt screens follow the mockups and the design system.
- **Nothing contradicts an accepted ADR** without saying so. A deliberate
  departure is flagged to the owner, who decides whether it goes on the
  open-questions list. In the current set, the chat-led app builder (which
  reverses ADR-0056's ruling 6), live co-editing presence and "How the
  library connects" appear only in the videos, by the owner's choice.
- **The ethical wall holds on screen.** A viewer is never shown that a
  document they can't see exists: no greyed rows, no withheld counts.
- **Use the design tokens.** The shared colour palette is read from
  `docs/design/design-tokens.json`; new work should use it rather than typing
  in colours. (Shadows, radii, type sizes and some one-off colours in the
  current videos are still copied by hand.)

## Where the files live, and why

- **Git** holds everything small: plans, narration, research, reviews and the
  studio's source.
- **Video files are not committed** (`demo/videos/`, the archive's MP4s and
  `studio/out/` are gitignored), because 100+ MB of binaries would bloat the
  repo for good. They can be regenerated from the studio. Keep a copy of the
  current set somewhere shareable (e.g. the owner's Google Drive).
- **The archive** keeps superseded attempts whole, so their reasoning stays
  readable, out of the way of the current set.
