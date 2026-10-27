> **Archived 2026-10-18.** The first attempt at demo videos: 20-30 s sizzle clips
> and a 2-minute joined film. The owner judged them too high-level and salesy, and
> they were replaced by the demo videos in `demo/videos/` (plans in `demo/plans/`).
> Paths below describe the layout at the time: the code now lives in
> `demo/studio/src/sizzle/`, and the videos are in `videos/` beside this file.

# Infora product demo videos

Short silent product videos that sell the *vision* of Infora, made with Claude
on 2026-10-04. They show where the product is heading, not only what is built
today, so some screens are recreated rather than captured. Music is not yet
added; every video has an empty audio track.

## The videos (`videos/`)

| File | Length | What it sells |
|---|---|---|
| `00-Infora-film-2min.mp4` | 1:59.5 | All five clips joined, with one opening and one close |
| `V01-cited-drafting.mp4` | 28 s | The AI drafts a section and cites every claim to the page. Anything it can't source is withheld. |
| `V02-qa-checker.mp4` | 21 s | A second reader checks the draft before the client sees it. It shows why, and a person decides. |
| `V03-review-wall.mp4` | 26 s | Client and consultant review the same document. Each firm's comments stay private until released. |
| `V04-kpi-app.mp4` | 30 s | Building an app by chatting: a supplier-KPI dashboard. Each organisation sees only what it may see. |
| `V05-deck-app.mp4` | 30 s | Building an app by chatting: written commentary plus a spreadsheet produce a monthly slide-deck pack. |

## How it was made

1. `BRIEF.md` records the owner's brief and the production rules.
2. `research/` holds a study of Harvey's and Legora's product videos, and an
   inventory of Infora's features, vocabulary and design system.
3. `plan/` holds the master plan and a direction file per video (shot by shot,
   frame-accurate).
4. `review/` holds the sense checks: a buyer's-eye review and an accuracy
   review of the plan, then a frame-by-frame review of the rendered film.
5. `product-video/` is the source. It is a Remotion project that draws Infora's
   interface in code, so the videos can be changed and re-rendered. Its README
   explains how to preview and render.

To re-render after an edit, run these from `product-video/`:
`npm install`, then `npx remotion render src/index.ts Film out/Infora-film.mp4`.
Copy the result into `videos/`.
