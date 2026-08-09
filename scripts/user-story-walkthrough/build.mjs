// Builds docs/architecture/user-stories-walkthrough.html from one narrative
// source and the committed screenshots in docs/architecture/user-story-screens/.
// Pass --inline <path> to also emit a self-contained variant (data URIs) for
// publishing outside the repo. Capture/refresh the screenshots first with
// capture.mjs in this directory.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const REPO_IMGDIR = path.join(repoRoot, 'docs/architecture/user-story-screens');
const SHOTS = REPO_IMGDIR;
const REPO_HTML = path.join(repoRoot, 'docs/architecture/user-stories-walkthrough.html');
const inlineFlag = process.argv.indexOf('--inline');
const INLINE_HTML = inlineFlag > -1 ? process.argv[inlineFlag + 1] : null;

const CONSULTANT = { key: 'consultant', label: 'Eleanor Price — consultant, Calder & Hale' };
const REVIEWER = { key: 'reviewer', label: 'Rachel Bowen — lead reviewer, Trentmoor Energy' };

// ── the narrative ───────────────────────────────────────────────────────────
const acts = [
  {
    num: 'I',
    title: 'The plan decides first',
    lede:
      'Nothing in this journey starts with a blank page or an invented filename. The deliverable, its reference, its authors and its reviewers were all settled when the plan was built — the work starts by picking up what the plan already holds.',
    beats: [
      {
        img: '00-workspace',
        lane: CONSULTANT,
        screen: 'Workspace',
        title: 'One project, behind its wall',
        prose:
          'Eleanor Price signs in at Calder & Hale and lands on her workspace: the Wrenfield–Ashcombe 400kV Connection, owned by Trentmoor Energy. Three organisations work this project; everything that follows happens inside it, and the wall decides what each of them sees.',
        adrs: ['ADR-0001'],
      },
      {
        img: '01-plan',
        lane: CONSULTANT,
        screen: 'Plan',
        title: 'The deliverable already exists as a row',
        prose:
          'WA-EIA-MST-001 — EIA Scoping Method Statement, Land Quality. The reference was generated from the project’s naming rules the moment the row was created, and the reviewers were named on it. Eleanor did not invent a name and does not decide who reviews her work; that was settled in the plan.',
        adrs: ['ADR-0008'],
      },
      {
        img: '02-plan-drawer',
        lane: CONSULTANT,
        screen: 'Plan · deliverable detail',
        title: 'Appointments carried on the container',
        prose:
          'The row’s detail: producer, discipline, revision state, the authoring team, and the review group. Rachel Bowen was proposed as lead reviewer by the producing side and confirmed by the owner — and access follows confirmation, never proposal.',
        adrs: ['ADR-0008', 'ADR-0033'],
      },
    ],
  },
  {
    num: 'II',
    title: 'Drafting in the sandbox',
    lede:
      'Working drafts live in the producing organisation’s private sandbox. They never leak into anyone’s answers, and the v0.x working series never leaves — what the other organisations eventually see is a frozen, promoted revision.',
    beats: [
      {
        img: '03-sandbox',
        lane: CONSULTANT,
        screen: 'Sandbox',
        title: 'The draft, bound to the waiting container',
        prose:
          'Eleanor drafts in Calder & Hale’s sandbox. The working document is bound to the container that has been waiting for it since the plan was built, so promotion later carries no retyping — the metadata and the reference are already on the container.',
        adrs: ['ADR-0036', 'ADR-0041', 'ADR-0002'],
      },
      {
        img: '04-editor',
        lane: CONSULTANT,
        screen: 'Editor',
        title: 'Grounded drafting beside the draft',
        prose:
          'The draft in the Editor, the drafting assistant alongside. Its reach is the project library — the curated set of accepted material the owner trusts — so the text it helps produce is anchored to the project’s real positions, not to whatever half-finished files are lying around.',
        adrs: ['ADR-0011'],
      },
    ],
    gaps: [
      {
        title: 'The internal QA round — built below the surface',
        prose:
          'In the written story, Eleanor freezes the draft and an org-private internal QA round runs before anything crosses the wall. The API runs this whole path today and the e2e suite proves it end to end — but no screen can reach it: the QA cycle’s page resolves its deliverable against the library-scope plan and answers “not on a plan you can see”. Ticketed T-355.',
      },
      {
        title: 'Ambient version history — API only',
        prose:
          'The sandbox keeps a SharePoint-style ambient v0.x history with restore (ADR-0032). Both endpoints exist; no surface calls them yet.',
      },
    ],
  },
  {
    num: 'III',
    title: 'Promotion opens the round',
    lede:
      'Promotion freezes an immutable P-revision, generates the PDF that will be reviewed, keeps the native file in the same container, and opens the round. From that moment the review belongs to the review group — and the authoring side sees none of it until the lead issues.',
    beats: [
      {
        img: '05-submitted',
        lane: CONSULTANT,
        screen: 'Review · deliverable status',
        title: 'P01 submitted, awaiting acknowledgement',
        prose:
          'Promotion is almost nothing for Eleanor — one act, no form. Infora freezes P01, renders the review PDF beside the native file, and submits round 1 to the owner side. The four-state bar says exactly where the deliverable stands; the pen is with the review group.',
        adrs: ['ADR-0034', 'ADR-0041', 'ADR-0051'],
      },
      {
        img: '06-acknowledge',
        lane: REVIEWER,
        screen: 'Review · deliverable status',
        title: 'The submission is acknowledged into review',
        prose:
          'Rachel was named lead reviewer in the plan, so the submission arrives to her. Acknowledging it opens the round for the review group — a recorded receipt with a name on it, not a formality, and any confirmed reviewer of the deliverable can fire it.',
        adrs: ['ADR-0051'],
      },
      {
        img: '07-commenting',
        lane: REVIEWER,
        screen: 'Review cycle',
        title: 'Comments are made where the document is read',
        prose:
          'Rachel selects the text she means on the P01 PDF and writes the comment alongside, coded on the project’s acceptance scheme. The anchor — page, quote, quads — is stored on the comment itself, bound to the immutable version, never a sidecar file.',
        adrs: ['ADR-0004', 'ADR-0006'],
      },
      {
        img: '08-round-open',
        lane: REVIEWER,
        screen: 'Review cycle',
        title: 'One shared, live review record',
        prose:
          'Three comments, each pinned to the exact place it refers to, each coded, all landing in one record the whole review group sees as it is written — across organisations. Nobody is assembling a spreadsheet, and nobody is guessing what “page three, paragraph four” refers to.',
        adrs: ['ADR-0007'],
      },
      {
        img: '09-wall',
        lane: CONSULTANT,
        screen: 'Review cycle',
        title: 'The same round, from the authoring side: nothing',
        prose:
          'While the round is open, Eleanor sees the round exists and nothing of its content. The open round’s comments are reviewer-side state, withheld until the lead issues — enforced in the server’s read, not by the client hiding fields.',
        adrs: ['ADR-0014'],
      },
      {
        img: '10-completion',
        lane: REVIEWER,
        screen: 'Review · deliverable status',
        title: 'Each reviewer states their pass is done',
        prose:
          '“Review complete” is a stored, round-scoped signal — a reviewer with nothing to say is done, not absent. The set freezes when the round issues, and no count of completions closes anything: closing stays the lead’s human act.',
        adrs: ['ADR-0052', 'ADR-0005'],
      },
    ],
    gaps: [
      {
        title: 'Moderation — endpoint without a surface',
        prose:
          'The story’s lead reviewer “moderates in the open”: edits comments and codes, resolves duplicates, shapes the group position before it goes back. The PATCH endpoint exists; no control on the cycle screen calls it. Ticketed T-356.',
      },
      {
        title: 'The review period’s clock has no hands',
        prose:
          'The status bar renders a target date and an overdue state, but nothing ever sets the target and no reminder subsystem exists — the chrome is ready and permanently idle. Rides the V1 notifications work.',
      },
    ],
  },
  {
    num: 'IV',
    title: 'Issue, then answer every comment',
    lede:
      'Closing the round is a verdict, not a timeout. The record is issued to the consultant, and version two cannot leave until every comment carries a response — a change declared in the next revision, or an explicit no-change with a reason. There is no third state.',
    beats: [
      {
        img: '11-issue-modal',
        lane: REVIEWER,
        screen: 'Review cycle · close & issue',
        title: 'One authoritative code closes the round',
        prose:
          'Rachel sets the deliverable verdict — C, revise and resubmit — and closes the round. The review snapshot freezes on the record, the transmittal issues it to the authoring side, and only now does Calder & Hale see the comments.',
        adrs: ['ADR-0003', 'ADR-0005', 'ADR-0009'],
      },
      {
        img: '12-respond',
        lane: CONSULTANT,
        screen: 'Review cycle · respond',
        title: 'Point at the change, or say no change and why',
        prose:
          'For each comment Eleanor writes a response and declares the revised passage that answers it. The version that passage lands in does not exist yet — promotion is gated on the responses — so the link is declared now and the system stamps the version id when promotion creates it (T-354, fixed during this review).',
        adrs: ['ADR-0004'],
      },
      {
        img: '13-responses',
        lane: CONSULTANT,
        screen: 'Review cycle · respond',
        title: 'Three comments, three answers, no silence',
        prose:
          'Two changes declared, one explicit no-change with its reason on the record — the route-section point is reconciled by hand, not merged silently. Promote refuses while any comment is unanswered; the mandatory-response rule bites the transmittal back, not a dialog.',
        adrs: ['ADR-0004', 'ADR-0002'],
      },
    ],
    gaps: [
      {
        title: 'The response’s jump into P02',
        prose:
          'The story’s reviewer clicks a response and lands on the highlighted change in the version-two PDF. The anchor is now captured and the version id stamped (T-354); the navigation and highlight rendering are the remaining half, named as T-354’s residual.',
      },
      {
        title: 'Reviewers approving responses',
        prose:
          '“My reviewers approve the responses they are satisfied with, keep open the ones they are not” — no endpoint, no state, no UI anywhere yet. What approval gates, and who may give it, is a design question raised on the grill tracker (Q-038).',
      },
    ],
  },
  {
    num: 'V',
    title: 'Acceptance makes it true',
    lede:
      'An accepting code is the contractual act: the work item closes, the accepted revision becomes the controlled record, and the deliverable passes into the project library — from now on it is part of what the project treats as true, and retrieval grounds on it.',
    beats: [
      {
        img: '14-round2',
        lane: REVIEWER,
        screen: 'Review cycle · round 2',
        title: 'Version two arrives already reconciled',
        prose:
          'Rachel does not go hunting for what changed. Each response sits beside her comment in the same record, stamped “Changed in P02” with the passage that answers it; the no-change answer states its reason. Round 1 stands as the record it was; round 2 opens on the new version.',
        adrs: ['ADR-0009'],
      },
      {
        img: '15-accept-modal',
        lane: REVIEWER,
        screen: 'Review cycle · close & issue',
        title: 'The accepting code, stated in full',
        prose:
          'The chapter meets the standard the client is paying for. The modal says exactly what the accepting code does before Rachel commits it: the contractual revision is issued, the deliverable enters the project library, the review is complete — no further edits.',
        adrs: ['ADR-0003', 'ADR-0005'],
      },
      {
        img: '16-library',
        lane: REVIEWER,
        screen: 'Project library',
        title: 'The controlled record, in the corpus it came from',
        prose:
          'WA-EIA-MST-001, revision C01, live in the project library beside the ground investigation and baseline reports it was drafted from. It is now project knowledge: the drafting assistant grounds on it, citations resolve into it, and the wall still decides who reaches it.',
        adrs: ['ADR-0011'],
      },
      {
        img: '17-accepted-status',
        lane: REVIEWER,
        screen: 'Review · deliverable status',
        title: 'Complete',
        prose:
          'Submitted, in review, responding, complete. The work item is closed and the cycle ran to acceptance without a review spreadsheet, a chased document controller or an emailed comment sheet anywhere in it.',
        adrs: ['ADR-0005', 'ADR-0032'],
      },
    ],
  },
];

// ── page assembly ───────────────────────────────────────────────────────────
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function beatHtml(beat, src) {
  const chips = beat.adrs.map((a) => `<span class="tag">${a}</span>`).join('');
  return `
<figure class="beat">
  <div class="shot shot--${beat.lane.key}">
    <div class="shot-bar"><span class="shot-lane">${esc(beat.lane.label)}</span><span class="shot-screen">${esc(beat.screen)}</span></div>
    <img src="${src}" alt="${esc(beat.title)} — ${esc(beat.screen)} screen" loading="lazy">
  </div>
  <figcaption>
    <h3>${esc(beat.title)}</h3>
    <p>${esc(beat.prose)}</p>
    <p class="tags">${chips}</p>
  </figcaption>
</figure>`;
}

function gapHtml(gap) {
  return `
<aside class="gap">
  <span class="gap-flag">Designed, not yet surfaced</span>
  <h4>${esc(gap.title)}</h4>
  <p>${esc(gap.prose)}</p>
</aside>`;
}

function build(srcFor) {
  const actsHtml = acts
    .map(
      (act) => `
<section class="act">
  <header class="act-head">
    <span class="act-num">${act.num}</span>
    <div>
      <h2>${esc(act.title)}</h2>
      <p class="lede">${esc(act.lede)}</p>
    </div>
  </header>
  ${act.beats.map((b) => beatHtml(b, srcFor(b.img))).join('\n')}
  ${(act.gaps ?? []).map(gapHtml).join('\n')}
</section>`,
    )
    .join('\n');

  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Infora — the document management journey, on screen</title>
<style>
  :root {
    --paper: #f7f5f0;
    --card: #ffffff;
    --sunken: #efeeeb;
    --ink: #28261f;
    --muted: #6f6a5e;
    --hairline: #e2ded4;
    --frame: #dedad0;
    --consultant: #6d5dd3;
    --reviewer: #159a74;
    --gap-tint: #f3ede0;
    --gap-edge: #d8c9a4;
    --serif: 'Source Serif 4', 'Iowan Old Style', 'Times New Roman', Georgia, serif;
    --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    --mono: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: var(--sans);
    font-size: 15px;
    line-height: 1.6;
  }
  .page { max-width: 1080px; margin: 0 auto; padding: 56px 28px 80px; }

  /* masthead */
  .mast { display: flex; align-items: baseline; gap: 10px; margin-bottom: 40px; }
  .mast .mark { width: 13px; height: 13px; background: var(--ink); border-radius: 3px; align-self: center; }
  .mast .word { font-family: var(--serif); font-size: 21px; font-weight: 600; letter-spacing: .01em; }
  .mast .doc { color: var(--muted); font-size: 12.5px; margin-left: auto; font-family: var(--mono); }

  h1 { font-family: var(--serif); font-size: 40px; line-height: 1.15; font-weight: 600; margin: 0 0 14px; max-width: 21ch; text-wrap: balance; }
  .intro { max-width: 68ch; color: var(--ink); font-size: 16px; }
  .intro p { margin: 0 0 12px; }
  .intro .prov { color: var(--muted); font-size: 13px; }
  .intro code, .gap code { font-family: var(--mono); font-size: .92em; background: var(--sunken); padding: 1px 5px; border-radius: 4px; }

  /* cast */
  .cast { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin: 30px 0 8px; }
  .cast .card { background: var(--card); border-radius: 8px; padding: 14px 16px; box-shadow: 0 10px 26px rgba(20,20,20,.08); }
  .cast .who { font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 8px; }
  .cast .who .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .cast .card p { margin: 6px 0 0; color: var(--muted); font-size: 13px; }
  .cast .ref { font-family: var(--mono); font-size: 13px; }

  /* acts */
  .act { margin-top: 64px; }
  .act-head { display: flex; gap: 18px; align-items: flex-start; margin-bottom: 26px; }
  .act-num { font-family: var(--serif); font-size: 26px; color: var(--muted); border: 1px solid var(--hairline); border-radius: 50%; width: 52px; height: 52px; display: grid; place-items: center; flex: none; background: var(--card); }
  .act-head h2 { font-family: var(--serif); font-size: 27px; font-weight: 600; margin: 6px 0 6px; }
  .act-head .lede { margin: 0; color: var(--muted); max-width: 66ch; }

  /* beats */
  .beat { margin: 0 0 44px; }
  .shot { background: var(--card); border-radius: 10px; box-shadow: 0 10px 26px rgba(20,20,20,.12); overflow: hidden; }
  .shot-bar { display: flex; align-items: center; gap: 10px; padding: 9px 14px; border-bottom: 1px solid var(--hairline); font-size: 12px; }
  .shot-lane { font-weight: 600; }
  .shot--consultant .shot-lane { color: var(--consultant); }
  .shot--reviewer .shot-lane { color: var(--reviewer); }
  .shot-lane::before { content: ''; display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 7px; background: currentColor; vertical-align: 1px; }
  .shot-screen { margin-left: auto; color: var(--muted); font-family: var(--mono); font-size: 11.5px; }
  .shot img { display: block; width: 100%; height: auto; }
  .beat figcaption { padding: 14px 4px 0; max-width: 74ch; }
  .beat h3 { font-family: var(--serif); font-size: 19px; font-weight: 600; margin: 0 0 6px; }
  .beat figcaption p { margin: 0 0 8px; color: var(--ink); }
  .tags { display: flex; gap: 6px; flex-wrap: wrap; }
  .tag { font-family: var(--mono); font-size: 11px; color: var(--muted); background: var(--sunken); border-radius: 4px; padding: 2px 7px; }

  /* gaps */
  .gap { background: var(--gap-tint); border: 1px dashed var(--gap-edge); border-radius: 8px; padding: 14px 18px; margin: 0 0 18px; max-width: 76ch; }
  .gap-flag { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: #8a6d1f; font-weight: 600; }
  .gap h4 { font-family: var(--serif); font-size: 15.5px; margin: 6px 0 4px; }
  .gap p { margin: 0; color: var(--ink); font-size: 13.5px; }

  /* provenance footer */
  .prov-foot { margin-top: 70px; border-top: 1px solid var(--hairline); padding-top: 18px; color: var(--muted); font-size: 12.5px; max-width: 76ch; }
  .prov-foot p { margin: 0 0 8px; }

  @media (max-width: 720px) {
    h1 { font-size: 30px; }
    .act-head { flex-direction: column; gap: 8px; }
    .page { padding: 32px 16px 60px; }
  }
  @media (prefers-reduced-motion: no-preference) {
    .beat, .gap { animation: rise .5s ease both; }
    @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  }
</style>
<div class="page">
  <header class="mast">
    <span class="mark"></span><span class="word">Infora</span>
    <span class="doc">docs/architecture · captured 2026-08-09</span>
  </header>

  <h1>The document management journey, on screen</h1>
  <div class="intro">
    <p>This is <a href="user-stories.md">user-stories.md</a> rendered as the built product: the consultant who produces
    a Land Quality method statement and gets it accepted, and the client lead reviewer who runs the review and accepts it.
    Every screenshot is the real application, driven live through the whole cycle on the seeded Wrenfield world — nothing
    is a mockup. Where the written story runs ahead of the build, the beat is flagged
    <em>designed, not yet surfaced</em> and points at its ticket.</p>
    <p class="prov">Captured 2026-08-09 against the e2e substrate (deterministic model providers, seeded corpus).
    The companion piece <a href="user-stories-graphic.html">user-stories-graphic.html</a> tells the same two journeys as a
    decision map; this page shows them as screens.</p>
  </div>

  <div class="cast">
    <div class="card">
      <div class="who"><span class="dot" style="background:var(--consultant)"></span>Eleanor Price</div>
      <p>Environmental consultant and lead author at Calder &amp; Hale, the appointed consultancy. Drafts, promotes, answers the review.</p>
    </div>
    <div class="card">
      <div class="who"><span class="dot" style="background:var(--reviewer)"></span>Rachel Bowen</div>
      <p>Lead reviewer at Trentmoor Energy, the owner. Runs the review group, moderates, and holds the accepting code.</p>
    </div>
    <div class="card">
      <div class="who"><span class="ref">WA-EIA-MST-001</span></div>
      <p>EIA Scoping Method Statement — Land Quality, on the Wrenfield–Ashcombe 400kV Connection. Planned, produced, reviewed and accepted below.</p>
    </div>
  </div>

  ${actsHtml}

  <footer class="prov-foot">
    <p><strong>Provenance.</strong> Captured 2026-08-09 from the running application: e2e API substrate with deterministic
    model providers, the seeded three-organisation Wrenfield world, Playwright-driven browser sessions for both personas.
    The one beat Playwright cannot photograph — the library modal’s embedded PDF pane — is represented by the library
    table instead.</p>
    <p><strong>Fixed on the way.</strong> The respond form could not declare ADR-0004’s change link before this capture —
    every response was recorded as “no change made”. T-354 (2026-08-09) added the declaration and the promotion-time stamp;
    the round-2 screenshot shows the result.</p>
  </footer>
</div>
`;
}

// repo variant: relative paths beside the committed screenshots
fs.writeFileSync(REPO_HTML, build((img) => `user-story-screens/${img}.png`));
console.log('wrote', REPO_HTML);

// inline variant: data URIs, self-contained (opt-in)
if (INLINE_HTML) {
  fs.writeFileSync(
    INLINE_HTML,
    build((img) => `data:image/png;base64,${fs.readFileSync(path.join(SHOTS, `${img}.png`)).toString('base64')}`),
  );
  console.log('wrote', INLINE_HTML, Math.round(fs.statSync(INLINE_HTML).size / 1024), 'KB');
}
