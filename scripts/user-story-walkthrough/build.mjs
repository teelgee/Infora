// Builds docs/architecture/user-stories-walkthrough.html from one narrative
// source and the committed screenshots in docs/architecture/user-story-screens/.
// This page is the record of what EXISTS: every beat is the real application.
// Anything built that the user stories describe is captured here in its final
// form, and the mockup that proposed it is then deleted (docs/design/README.md).
// A design that is ruled but unbuilt is a gap card, never a beat — and it
// carries `mockup` so the drawing and the story can be read against each other.
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

// One person can act in more than one capacity: the same colour keeps the
// organisation legible, the label says which hat is on.
const CONSULTANT = { key: 'consultant', label: 'Eleanor Price — lead author, Calder & Hale' };
const CONSULTANT_SUPER = { key: 'consultant', label: 'Eleanor Price — super-user, Calder & Hale' };
const REVIEWER = { key: 'reviewer', label: 'Rachel Bowen — lead reviewer, Trentmoor Energy' };
const OWNER = { key: 'reviewer', label: 'Rachel Bowen — owner super-user, Trentmoor Energy' };
const INTERNAL = { key: 'internal', label: 'Owen Vance — internal QA reviewer, Calder & Hale' };

// ── the narrative ───────────────────────────────────────────────────────────
const acts = [
  {
    num: 'I',
    title: 'The plan decides first',
    lede:
      'Nothing in this journey starts with a blank page or an invented filename. The deliverable, its reference, its authors and its reviewers were all settled when the plan was built — the work starts by picking up what the plan already holds.',
    beats: [
      {
        img: '00-schema',
        lane: OWNER,
        screen: 'Plan · deliverable schema',
        title: 'Before the plan, someone decides what a plan records',
        prose:
          'The journey does not open on a deliverable. It opens on Rachel Bowen defining the project’s schema for Trentmoor Energy: which fields make up a document’s coded reference and in what order, which are metadata carried beside it, and which are appointment roles filled per deliverable. Everything downstream — the reference, the plan’s columns, the folder tree, the bind card — reads off this one definition. The schema also exports as a fillable Excel workbook whose header row is the schema’s own attribute fields — the coded and metadata ones, not the appointment roles, because appointments are explicit acts and never a spreadsheet side effect — and which carries no reference column at all: teams draft the deliverables list in a spreadsheet, and the numbering is generated when the plan imports it, never typed in the sheet.',
        adrs: ['ADR-0008'],
      },
      {
        img: '01-workspace',
        lane: CONSULTANT,
        screen: 'Workspace',
        title: 'One project, behind its wall',
        prose:
          'Eleanor Price signs in at Calder & Hale and lands on her workspace: the Wrenfield–Ashcombe 400kV Connection, owned by Trentmoor Energy. Three organisations work this project; everything that follows happens inside it, and the wall decides what each of them sees.',
        adrs: ['ADR-0001'],
      },
      {
        img: '02-plan',
        lane: CONSULTANT,
        screen: 'Plan',
        title: 'The deliverable already exists as a row',
        prose:
          'WA-EIA-MST-001 — EIA Scoping Method Statement, Land Quality. The reference came from the project’s naming rules the moment the row was created, and the reviewers were named on it. Eleanor did not invent a name and does not decide who reviews her work; that was settled in the plan. The columns beside the title — discipline, suitability, security classification — are Calder & Hale’s organisation standard, set once by its super user for every member: there are no personal column layouts to drift apart.',
        adrs: ['ADR-0008', 'ADR-0033'],
      },
      {
        img: '03-plan-detail',
        lane: CONSULTANT,
        screen: 'Plan · deliverable detail',
        title: 'The row’s detail, on a card',
        prose:
          'Producer, discipline, revision state, the authoring team, the review group. Rachel Bowen is the confirmed lead reviewer, and access follows that confirmation — a proposal on its own confers nothing. Eleanor sees the full editing set here because she is Calder & Hale’s super user on this project, withdrawal and lead-author reassignment included. The narrower right this card also carries is the one the walkthrough session added: a row’s live lead author, super user or not, may edit the title, the classification and the authoring team, and may propose reviewers — never confirm them, never reassign the lead, never touch the coded reference.',
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
        img: '04-structure',
        lane: CONSULTANT_SUPER,
        screen: 'Sandbox · create folder structure',
        title: 'A folder tree, asked for in words',
        prose:
          'Before anyone drafts, the sandbox needs a shape. Eleanor describes the one she wants and an assistant fills the builder with a candidate tree — or, with no model call at all, she seeds it from the disciplines already on her organisation’s plan. Either way nothing has been created: the proposal lands in an editable builder and only the confirm button writes. That split is structural rather than polite — there is no apply endpoint for the assistant to call, so the only writer is the deterministic one.',
        adrs: ['ADR-0027', 'ADR-0040'],
      },
      {
        img: '05-settings',
        lane: CONSULTANT_SUPER,
        screen: 'Sandbox · settings',
        title: 'Three decisions a team records about itself',
        prose:
          'Who may create folders, whether that still holds inside a deliverable’s own folder, and whether promotion demands QA acceptance first. These are per-sandbox settings a super user sets deliberately, not preferences that drift: the third one is a governance gate, and turning it off is a visible act with a name attached.',
        adrs: ['ADR-0040', 'ADR-0032'],
      },
      {
        img: '06-plan-locked',
        lane: CONSULTANT,
        screen: 'Sandbox · plan-locked',
        title: 'The tree the plan already implies',
        prose:
          'In plan-locked mode nobody names folders at all: a folder per discipline, a working folder per deliverable, derived from Calder & Hale’s own plan rows and appearing as rows are created. A retitled row renames its folder. A withdrawn row keeps its folder, badged off-plan — nothing is deleted and no work is orphaned, which is the same never-delete instinct that keeps the coded reference immutable. One open question rides this mode: in a sandbox shared across organisations, folder names derived from the whole plan would disclose the shape of the TIDP to everyone granted access. Raised, not yet settled (Q-039).',
        adrs: ['ADR-0040'],
      },
      {
        img: '07-bind',
        lane: CONSULTANT,
        screen: 'Sandbox · bind',
        title: 'Binding is a confirmation, never a side effect',
        prose:
          'The draft sits in WA-EIA-MST-001’s folder, so that deliverable arrives pre-selected — pre-selected, not silently bound. The card shows exactly what the draft is about to wear: the coded reference, the plan row’s title, its schema metadata, the appointments already made on it, and the consequence stated in a sentence before Eleanor commits to it. Binding is one-way.',
        adrs: ['ADR-0038'],
      },
      {
        img: '08-sandbox',
        lane: CONSULTANT,
        screen: 'Sandbox',
        title: 'The draft wears the plan row’s title',
        prose:
          'The working title is now dormant: the bound draft displays its plan row’s title and metadata by reference, so retitling on the plan retitles the draft and the two can never disagree. The rename control has simply gone from the row’s menu — there is nothing to rename here any more, and the API refuses it too, pointing at the plan row where the title actually lives. The container has been waiting for this document since the plan was built, so promotion later carries no retyping.',
        adrs: ['ADR-0038', 'ADR-0036', 'ADR-0002'],
      },
      {
        img: '09-editor',
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
        title: 'Ambient version history — API only',
        prose:
          'The sandbox keeps a SharePoint-style ambient v0.x history with restore (ADR-0032). Both endpoints exist; no surface calls them yet.',
      },
    ],
  },
  {
    num: 'III',
    title: 'The organisation checks its own work first',
    lede:
      'Internal QA used to be optional ceremony. It is now what this team has decided its work goes through: the gate is on by default for a project sandbox, and with it on, promotion has exactly one legal source — the version internal QA accepted. Read against the ISO 19650 common-data-environment states, this act is Content Check and Approve for Sharing, and it all happens inside Calder & Hale. Nothing here crosses the wall.',
    beats: [
      {
        img: '10-gate-refused',
        lane: CONSULTANT,
        screen: 'Sandbox',
        title: 'The gate, refusing',
        prose:
          'Eleanor promotes, and Infora declines. The live head is not a legal source in this sandbox until the draft has been through internal QA; the refusal says so and names the two ways out — run the review, or have a super user turn the gate off. The rule fails closed: it refuses on any state it cannot read as an explicit exemption. The personal workspace is gated too, so drafting round the back of it buys nothing.',
        adrs: ['ADR-0032'],
      },
      {
        img: '11-frozen',
        lane: CONSULTANT,
        screen: 'Editor',
        title: 'Freeze stops the head moving',
        prose:
          'Freezing snapshots the working head into Calder & Hale’s own org-private container and locks it: v0.1 in the internal series, and the thing being checked cannot drift while it is being checked. Nobody outside the organisation can see any of this — that container is org-private by scope, not by a filter on the way out. Once the internal reviewer is in place, a second freeze issues the internal revision and opens the round on it.',
        adrs: ['ADR-0041', 'ADR-0032'],
      },
      {
        img: '12-qa-round',
        lane: INTERNAL,
        screen: 'Internal QA · review cycle',
        title: 'The same review machinery, pointed inward',
        prose:
          'Owen Vance checks his colleague’s work on exactly the screen the client’s reviewers will use later: the same anchored comments on the same rendered PDF, the same coded scheme, the same record. The page states what it is — an org-private internal review whose record never crosses the wall — and it carries no coded reference, because an internal check is not a revision of anything the project has seen.',
        adrs: ['ADR-0032', 'ADR-0006'],
      },
      {
        img: '13-qa-verdict',
        lane: INTERNAL,
        screen: 'Internal QA · review cycle',
        title: 'An internal verdict, on the organisation’s own record',
        prose:
          'Owen closes the round with a verdict. Accept, and the frozen version becomes what may be promoted; ask for revision, and it goes back to the authors — who can answer, because the internal container carries the plan row’s authors as well as its reviewers. One thing visible in this shot is wrong, and is left in rather than cropped out: the modal still speaks the project review’s language, promising that the code “enters the project library”. Nothing of the sort happens here — an internal acceptance only unlocks promotion. The mechanism is right for an org-private round; that sentence is not.',
        adrs: ['ADR-0032', 'ADR-0003'],
      },
      {
        img: '14-promoted',
        lane: CONSULTANT,
        screen: 'Sandbox',
        title: 'What promotes is what QA accepted',
        prose:
          'Promotion succeeds now, and says which of the two legal sources it took: the QA-accepted frozen version, not the head as it has drifted since. That distinction is the whole point of the gate — the client receives the version that was checked. One acceptance buys exactly one revision, so version two below runs its own internal pass rather than quietly re-issuing the same content under a new number.',
        adrs: ['ADR-0032', 'ADR-0002'],
      },
    ],
    gaps: [
      {
        title: 'Staffing the internal round — API only',
        prose:
          'A freeze opens an internal round only once the frozen container has a confirmed lead reviewer, and no screen could appoint the first one: the reviewer control on the internal QA status page was gated to the owner or an existing lead, and granted non-lead. So two acts in this act were driven through the API — appointing Owen, and the second freeze that opens the round once he is in place, which the Editor cannot offer while the head is already locked. T-372 closed the first half: the producing organisation now staffs its own internal QA from that page, lead reviewer included, because an org-private container has no owner in the loop and no lead to inherit the right from. The second freeze is still an API act here. The round itself, its comment, its verdict and its issue are clicks on the screens above.',
      },
    ],
  },
  {
    num: 'IV',
    title: 'Promotion opens the round',
    lede:
      'Promotion freezes an immutable P-revision, generates the PDF that will be reviewed, keeps the native file in the same container, and opens the round. From that moment the review belongs to the review group — and the authoring side sees none of it until the lead issues.',
    beats: [
      {
        img: '15-submitted',
        lane: CONSULTANT,
        screen: 'Review · deliverable status',
        title: 'P01 submitted, awaiting acknowledgement',
        prose:
          'This is promotion as it stands today, and the 2026-08-19 walk replaced it: one click, no form. Infora freezes P01, renders the review PDF beside the native file, and submits round 1 to the owner side. The four-state bar says exactly where the deliverable stands; the pen is with the review group. What goes in front of that click — and what it asks before anything is committed — is the card immediately below.',
        adrs: ['ADR-0034', 'ADR-0041', 'ADR-0051'],
        gapAfter: [
        {
          title: 'The promotion window',
          prose:
            'Promotion is one click today. The 2026-08-19 walk replaced it with a window that reconfirms rather than composes: the coded reference and the plan-owned identity metadata shown and locked, authoring metadata editable, the review group listed by name with the lead reviewer swappable by the lead author or a producing super user, and the review period prefilled. It reappears at every promotion, so a version two six months later is reviewed by the team that exists then rather than the one named at planning. Nothing in it confers access — naming a reviewer proposes them, and confirmation stays owner-side, which is where the share-first invariant bites. Ruled, not yet ticketed.',
          mockup: 'promotion-window.html',
        },
        {
          title: 'The review period gains an owner',
          prose:
            'The status bar renders a target date and an overdue state, and nothing has ever set the target — the chrome was ready and permanently idle. Ruled on 2026-08-19: the project carries a default of ten working days, set on the schema screen as project configuration rather than as a schema field, because a schema field would arrive as a column in the exported deliverables template; the lead author may adjust it for a particular submission in the promotion window. Working days are Monday to Friday, with no holiday calendar — none is modelled anywhere. The reminders that chase the date still ride the V1 notifications work. Built as T-371: the project default is set on the schema screen and every round now opens with a real target date, so the bar’s overdue state finally has something to be overdue against; the per-submission adjustment arrives with the promotion window above.',
          mockup: 'promotion-window.html',
        },
        {
          title: 'Accepting the appointment',
          prose:
            'A named lead reviewer has no way to say yes. The appointment is confirmed by the owner about them, never by them; no act anywhere has a person state they will run this review, and there is no way to decline one. Ruled on 2026-08-19: acceptance becomes the appointee’s own act, and where they sit in the owner organisation it doubles as the ADR-0033 confirmation, so appointment and access are one click. Acknowledgement then waits on it. The same act fills the hole Act III names — no screen can appoint the first internal QA lead reviewer either. Notifications stay deferred (owner, 2026-08-22), so an appointed reviewer is told nothing and finds out by opening the deliverable — the gate holds, the submission just waits longer. Built as T-372: the undertaking card, Accept and Decline-with-a-reason, and the receipt gated on the acceptance — a declined appointment leaves the deliverable visibly awaiting a lead reviewer, and the refusal’s reason stays inside the owner organisation.',
          mockup: 'appointment-acceptance.html',
        },
        ],
      },
      {
        img: '16-acknowledge',
        lane: REVIEWER,
        screen: 'Review · deliverable status',
        title: 'The submission is acknowledged into review',
        prose:
          'Rachel was named lead reviewer in the plan and has accepted the appointment, so the submission is hers to receive. Acknowledging it opens the round for the review group — a recorded receipt with a name on it, not a formality. Who may fire it is narrower than the shot suggests, and deliberately so: the act belongs to the lead reviewer alone, or to a super user of the owner organisation when the lead is away. It was briefly wider — an addendum of 2026-08-06 extended it from the owner organisation to any live confirmed reviewer, because gating on the owner alone would park a round behind a firm with no stake in its pace — and the narrowing of 2026-08-22 answers that reasoning rather than discarding it: it does not gate on the owner organisation either, but on the lead reviewer, who may sit outside it and who fires the receipt in the ordinary case. What went is a non-lead reviewer signing for a submission they do not run. The override covers the receipt and never the undertaking: until a lead has accepted, nobody may acknowledge at all, the super user included, and their move in the face of an absent lead is to re-appoint.',
        adrs: ['ADR-0051', 'ADR-0033'],
      },
      {
        img: '17-commenting',
        lane: REVIEWER,
        screen: 'Review cycle',
        title: 'Comments are made where the document is read',
        prose:
          'Rachel selects the text she means on the P01 PDF and writes the comment alongside, coded on the project’s acceptance scheme. The anchor — page, quote, quads — is stored on the comment itself, bound to the immutable version, never a sidecar file.',
        adrs: ['ADR-0004', 'ADR-0006'],
      },
      {
        img: '18-round-open',
        lane: REVIEWER,
        screen: 'Review cycle',
        title: 'One shared, live review record',
        prose:
          'Three comments, each pinned to the exact place it refers to, each coded, all landing in one record the whole review group sees as it is written — across organisations. Nobody is assembling a spreadsheet, and nobody is guessing what “page three, paragraph four” refers to. The openness is bounded rather than general: it runs to the appointed review group and stops at its edge — open across organisations inside the group, invisible to the project outside it.',
        adrs: ['ADR-0007'],
        gapAfter: [
        {
          title: 'The DRR as a table',
          prose:
            'The component doc has always named this surface — “the DRR table interface” — and the build drew round cards instead: comments in a div grid, the round’s code as a badge in its header. Ruled on 2026-08-19: one continuous table either side can open, every comment in order with its code, its author and its response, each round closed off by the deliverable code it concluded with, appended to as rounds open. The wall still shapes it — the authoring side reads every round but the open one. Nothing is ever issued out of it: ADR-0009 dropped the DRN and it stays dropped.',
          mockup: 'review-log.html',
        },
        ],
      },
      {
        img: '19-wall',
        lane: CONSULTANT,
        screen: 'Review cycle',
        title: 'The same round, from the authoring side: nothing',
        prose:
          'While the round is open, Eleanor sees the round exists and nothing of its content. The open round’s comments are reviewer-side state, withheld until the lead issues — enforced in the server’s read, not by the client hiding fields. What she is blind to is exactly one round, and that is a guarantee rather than a coincidence: a deliverable carries one controlled revision in flight at a time, so only one round is ever open, and every round but this one stays permanently readable to her. Writing alternates with it — while the round is open only reviewers may write, and the pen crosses back at the transmittal.',
        adrs: ['ADR-0014', 'ADR-0002'],
      },
      {
        img: '20-completion',
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
    ],
  },
  {
    num: 'V',
    title: 'Issue, then answer every comment',
    lede:
      'Closing the round is a verdict, not a timeout. The record is issued to the consultant, and version two cannot leave until every comment carries a response — a change declared in the next revision, or an explicit no-change with a reason. There is no third state.',
    beats: [
      {
        img: '21-issue-modal',
        lane: REVIEWER,
        screen: 'Review cycle · close & issue',
        title: 'One authoritative code closes the round',
        prose:
          'Rachel sets the deliverable verdict — C, revise and resubmit — and closes the round. The review snapshot freezes on the record, the transmittal issues it to the authoring side, and only now does Calder & Hale see the comments. Nothing is sent anywhere: the transmittal is an event record — who issued which version to whom, and when — and no file moves on the platform, because both organisations were always reading the one record.',
        adrs: ['ADR-0003', 'ADR-0005', 'ADR-0009', 'ADR-0010'],
      },
      {
        img: '22-respond',
        lane: CONSULTANT,
        screen: 'Review cycle · respond',
        title: 'Point at the change, or say no change and why',
        prose:
          'For each comment Eleanor writes a response and declares the revised passage that answers it. The version that passage lands in does not exist yet — promotion is gated on the responses — so the link is declared now and the system stamps the version id when promotion creates it. Nor is this Eleanor’s alone: the pen passes to the authoring side the plan named, lead author and authors together, so several of Calder & Hale can work the returned comments at once.',
        adrs: ['ADR-0004', 'ADR-0017'],
      },
      {
        img: '23-responses',
        lane: CONSULTANT,
        screen: 'Review cycle · respond',
        title: 'Three comments, three answers, no silence',
        prose:
          'Two changes declared, one explicit no-change with its reason on the record — the route-section point is reconciled by hand, not merged silently. Promote refuses while any comment is unanswered; the mandatory-response rule bites the transmittal back, not a dialog. The rule pays twice over: every comment now leaves the round paired with the response that resolved it, and that pairing — not the prose either side wrote — is the comment-to-resolution material the moat distils.',
        adrs: ['ADR-0004', 'ADR-0002', 'ADR-0032'],
      },
    ],
    gaps: [
      {
        title: 'The coding scheme’s unbuilt half',
        prose:
          'ADR-0003 gives the scheme two behaviours the built product does not have. The system is meant to suggest the deliverable code from the comment codes, for the lead reviewer to confirm or override — Rachel picks hers from the list unaided, and the suggestion survives only as a note in the schema. And whether a comment’s code blocks acceptance is meant to be a property of that code in the project’s scheme, not hard-wired; the stored scheme carries a level and an is_accepting flag and nothing that blocks. Neither half carries a ticket yet.',
      },
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
    num: 'VI',
    title: 'Acceptance makes it true',
    lede:
      'An accepting code is the contractual act: the work item closes, the accepted revision becomes the controlled record, and the deliverable passes into the project library — from now on it is part of what the project treats as true, and retrieval grounds on it.',
    beats: [
      {
        img: '24-round2',
        lane: REVIEWER,
        screen: 'Review cycle · round 2',
        title: 'Version two arrives already reconciled',
        prose:
          'Rachel does not go hunting for what changed. Each response sits beside her comment in the same record, stamped “Changed in P02” with the passage that answers it; the no-change answer states its reason. Round 1 stands as the record it was; round 2 opens on the new version — which took the same road as the first, through its own internal QA pass, because one QA acceptance buys exactly one revision.',
        adrs: ['ADR-0009'],
      },
      {
        img: '25-accept-modal',
        lane: REVIEWER,
        screen: 'Review cycle · close & issue',
        title: 'The accepting code, stated in full',
        prose:
          'The chapter meets the standard the client is paying for. The modal says exactly what the accepting code does before Rachel commits it: the contractual revision is issued, the deliverable enters the project library, the review is complete — no further edits.',
        adrs: ['ADR-0003', 'ADR-0005'],
      },
      {
        img: '26-library',
        lane: REVIEWER,
        screen: 'Project library',
        title: 'The controlled record, in the corpus it came from',
        prose:
          'WA-EIA-MST-001, revision C01, live in the project library beside the ground investigation and baseline reports it was drafted from. It is now project knowledge: the drafting assistant grounds on it, citations resolve into it, and the wall still decides who reaches it.',
        adrs: ['ADR-0011'],
      },
      {
        img: '27-accepted-status',
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
  const drawn = gap.mockup
    ? `\n  <p class="gap-mockup">Drawn: <a href="../design/mockups/${gap.mockup}">${gap.mockup}</a></p>`
    : '';
  return `
<aside class="gap">
  <span class="gap-flag">Designed, not yet surfaced</span>
  <h4>${esc(gap.title)}</h4>
  <p>${esc(gap.prose)}</p>${drawn}
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
  ${act.beats.map((b) => [beatHtml(b, srcFor(b.img)), ...(b.gapAfter ?? []).map(gapHtml)].join('\n')).join('\n')}
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
    --internal: #b8622f;
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
  .shot--internal .shot-lane { color: var(--internal); }
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
  .gap-mockup { margin: 8px 0 0; font-size: 12px; color: var(--muted); }
  .gap-mockup a { color: var(--internal); }

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
    <span class="doc">docs/architecture · recaptured 2026-08-09</span>
  </header>

  <h1>The document management journey, on screen</h1>
  <div class="intro">
    <p>This is <a href="user-stories.md">user-stories.md</a> rendered as the built product: the owner who decides what a
    deliverable is described by, the consultant who produces a Land Quality method statement, the colleague who checks it
    before it leaves the office, and the client lead reviewer who runs the review and accepts it.
    Every screenshot is the real application, driven live through the whole cycle on the seeded Wrenfield world — nothing
    is a mockup, and nothing was staged for the photograph. Where the written story runs ahead of the build, the beat is
    flagged <em>designed, not yet surfaced</em> and points at its ticket, or at the session that ruled it where the ticket is not yet minted.</p>
    <p class="prov">Recaptured 2026-08-09 against the e2e substrate (deterministic model providers, seeded corpus).
    This page is now the single rendering of the two journeys: the companion decision map
    (<code>user-stories-graphic.html</code>) was deleted on 2026-08-18, its accurate content absorbed into the beats and
    gap cards below — it had been built from ADRs 0001–0012 and predated the sandbox, binding, internal-QA and
    acknowledgement decisions this page is captured against. A second owner-directed walk on 2026-08-19 produced the
    four rulings flagged in Act IV; the screenshots still show the build as it stood on 2026-08-09, and are recaptured
    once those are built.</p>
  </div>

  <div class="cast">
    <div class="card">
      <div class="who"><span class="dot" style="background:var(--consultant)"></span>Eleanor Price</div>
      <p>Environmental consultant and lead author at Calder &amp; Hale, the appointed consultancy — and its super-user on this project. Sets the sandbox up, drafts, promotes, answers the review.</p>
    </div>
    <div class="card">
      <div class="who"><span class="dot" style="background:var(--internal)"></span>Owen Vance</div>
      <p>Colleague of Eleanor’s at Calder &amp; Hale. Checks her work in the organisation’s own QA round, before anything crosses the wall.</p>
    </div>
    <div class="card">
      <div class="who"><span class="dot" style="background:var(--reviewer)"></span>Rachel Bowen</div>
      <p>Owner super-user at Trentmoor Energy: defines the project schema, then runs the review group as lead reviewer and holds the accepting code.</p>
    </div>
    <div class="card">
      <div class="who"><span class="ref">WA-EIA-MST-001</span></div>
      <p>EIA Scoping Method Statement — Land Quality, on the Wrenfield–Ashcombe 400kV Connection. Planned, produced, QA’d, reviewed and accepted below.</p>
    </div>
  </div>

  ${actsHtml}

  <footer class="prov-foot">
    <p><strong>Provenance.</strong> Recaptured 2026-08-09 from the running application: e2e API substrate with deterministic
    model providers, the seeded three-organisation Wrenfield world, Playwright-driven browser sessions for all three personas.
    The one beat Playwright cannot photograph — the library modal’s embedded PDF pane — is represented by the library
    table instead.</p>
    <p><strong>What was driven through the API rather than clicked.</strong> Setting up the world: four plan rows beside
    the seeded one and their schema metadata, the organisation’s column standard, the draft and its text, and filing that
    draft into its deliverable folder. Running the cycle: appointing the internal reviewer and the re-freeze that opens the
    QA round (both explained in Act III’s gap card), the owner’s acknowledgement of each submission, and version two’s
    internal QA pass and promotion, which repeat Act III’s road and are narrated rather than re-photographed. Everything a
    screenshot on this page shows being done was done on that screen.</p>
    <p><strong>What moved under the last capture.</strong> An owner-directed walk of the previous version of this page
    produced nine rulings, built the same day as tickets T-355 and T-358–T-366. Five of them are new beats here: the schema
    screen the story now opens on, the structure builder and its assistant, the three-way folder mode beside the promotion
    gate, the plan-locked tree, and the bind confirmation card. The sixth changed how this page is captured at all — the QA
    gate is on by default, so promotion of a live head is refused, and the capture runs the real freeze → staff → review →
    accept → promote path rather than turning the gate off. The internal QA round was flagged
    <em>designed, not yet surfaced</em> on the previous version of this page; it is Act III now.</p>
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
