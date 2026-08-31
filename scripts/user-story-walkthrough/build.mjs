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
        img: '00a-review-period',
        lane: OWNER,
        screen: 'Deliverable schema',
        title: 'How long a review is expected to take',
        prose:
          'Beside the schema and deliberately not inside it: ten working days, the project’s default review period. ADR-0005 had always given a round “a configurable review period” without saying who configures it, and the cost showed in the build — the status bar rendered a target date and an overdue state off a column nothing ever set. It sits here rather than as a schema field because the schema’s fields are the header row of the deliverables template teams fill in Excel, and a review period would have arrived there as a column nobody should be completing. Working days are Monday to Friday: no holiday calendar is modelled anywhere in the system, and picking one would quietly pick a jurisdiction.',
        adrs: ['ADR-0005'],
      },
      {
        img: '00b-acceptance-codes',
        lane: OWNER,
        screen: 'Deliverable schema · acceptance codes',
        title: 'What “accepted” means here, and what the AI may rely on',
        prose:
          'The third thing settled before any deliverable exists: the project’s acceptance codes, seeded from ISO 19650’s 2021 National Annex and copied at creation, so nothing Rachel does here touches another project. Two columns decide what a code DOES rather than what it is called — contractual, which is what issues the C revision and is the difference between “we have agreed this” and “we have agreed most of this, with comments”; and grounds, whether a deliverable accepted under the code enters the AI’s reach. That second column has to be hers because the standard itself refuses to fix it: the 2021 Annex makes published codes stage-agnostic and requires each A-code’s meaning to be written into the project’s own information standard. Until this slice there was no write path at all, so a pilot firm could not represent its own scheme — a gap that had nothing to do with AI.',
        adrs: ['ADR-0003', 'ADR-0041', 'ADR-0011'],
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
      {
        img: '09c-checker-marks',
        lane: CONSULTANT,
        screen: 'Editor · Checks',
        title: 'The draft is checked before anyone else sees it',
        prose:
          'Before the draft goes anywhere, Eleanor runs the QA checker over it from the editor’s own toolbar, and works through what it found. The findings are marks anchored into the text and a panel grouped by the check that raised each one — two views of one set, from one read. She takes the mechanical corrections as a group, reads the rewritten wording one at a time, and clears the rest; nothing is applied automatically, and an open finding would stop the promotion two beats below exactly as an open comment thread would. That is what the story needs from the tool. How the tool itself works — the plan before the spend, the sentence that says what was covered, the accept-all that stops at rewrites, and the banner that appears when the text has moved under a finding — is its own section at the foot of this page, photographed step by step.',
        adrs: ['ADR-0048', 'ADR-0053'],
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
        screen: 'Sandbox · promote',
        title: 'The gate refuses, and says so before the click lands',
        prose:
          'Promote opens a window rather than firing an act, and the window has already asked the server what this click would do. The answer here is a refusal: this sandbox requires internal QA acceptance before anything is promoted, so the source is not legal and Promote is disabled with the reason stated beside it. The gate is a recorded choice rather than a rule of the product — a team turns it off deliberately, and the deliverable below that skips QA does exactly that.',
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
        img: '13a-promotion-window',
        lane: CONSULTANT,
        screen: 'Sandbox · promote to review',
        title: 'The window reconfirms; it does not compose',
        prose:
          'ADR-0008 made promotion a near-empty hand-off on purpose, because a form filled in the moment is a form filled wrong. This window survives that objection by splitting the fields rather than by tone. What promotes is named and read-only — the version internal QA accepted, and who accepted it, because the whole point of the gate is that the client receives the version that was checked. The plan-owned identity is shown and locked, so a thoughtless confirm produces exactly the plan’s state. Only what is already Eleanor’s to set takes input: the authoring metadata, the review group with its lead, and the review period. From the producing side every reviewer control writes a proposal — naming someone in another organisation proposes them and nothing more, because confirmation stays owner-side (an owner-side naming confirms outright, as owner grants always have), and that is why a producing organisation cannot open the wall from this window. Changing the lead reviewer is one act, not a remove-then-name pair — the swap either happens whole or not at all, and the window states the wait it buys before the click commits it. It reopens at every promotion, which earns its place at round two more than round one: six months and a staffing change later, the alternative is silently inheriting a review group named at planning and never looked at since.',
        adrs: ['ADR-0008', 'ADR-0038', 'ADR-0033'],
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
          'The submission, from the producing side: Infora froze P01 out of the window above, rendered the review PDF beside the native file, and sent round 1 to Trentmoor. The four-state bar says exactly where the deliverable stands — submitted, and not yet in review, because the round does not open on the promoter’s click. It opens when the lead reviewer accepts the appointment and acknowledges the submission — or, with the lead away, when a Trentmoor super user acknowledges in their stead — which is the next two beats and neither of them is Eleanor’s to make.',
        adrs: ['ADR-0034', 'ADR-0041', 'ADR-0051'],
      },
      {
        img: '15a-appointment',
        lane: REVIEWER,
        screen: 'Review · deliverable status',
        title: 'The person named says yes for themselves',
        prose:
          'Appointment used to be something two organisations did about a person: Calder & Hale proposed Rachel, Trentmoor confirmed her, and nowhere in the model did Rachel say anything at all. But a lead reviewer holds the deliverable’s contractual verdict, and nobody can give that undertaking on someone else’s behalf. So the card states the duty in four lines — the code on every round, the close that only she can make, the accepting code, the review group — and asks. Nothing about tables or grants: a professional undertaking should be readable by the person giving it. Until she accepts, the Acknowledge button above is disabled for everyone, a Trentmoor super user included, because the override covers the receipt and never the undertaking. Nobody told her: notifications are deferred, so she finds this by opening the deliverable, and the submission simply waits longer.',
        adrs: ['ADR-0033', 'ADR-0051'],
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
        img: '19a-record-wall',
        lane: CONSULTANT,
        screen: 'Review record',
        title: 'The wall is a different record, not a hidden column',
        prose:
          'The same review record Rachel is writing into, opened by Eleanor. Round one is present as a band — the round is not hidden, and its existence was never the secret — but it has no rows, and the notice says content exists and why it is out of reach. That is the house rule rather than a stylistic choice: greying the rows out would leak how many there are, and rendering an empty round would say something false, because silence reads as absence and absence is a different fact from “not yours yet”. Even the header counts only what Eleanor can actually read. The withholding is applied in the server’s read, so no client can undo it.',
        adrs: ['ADR-0014', 'ADR-0009'],
      },
      {
        img: '18a-moderation',
        lane: REVIEWER,
        screen: 'Review cycle · moderate',
        title: 'The lead moderates in the open, and cannot moderate in secret',
        prose:
          'Rachel amends a reviewer’s comment to absorb a duplicate and shape the group’s single position before any of it goes back. Two constraints make “in the open” true rather than claimed. There is <strong>no delete</strong> — a duplicate is amended to say so, never quietly emptied — and moderation is possible only while the round is <strong>open</strong>: issue freezes the snapshot, so what Calder & Hale eventually receives is the record as Rachel left it, once, and nothing can be edited behind an issued verdict. The amended comment is the record; there is no “original” hidden underneath it, because a moderated record with a shadow copy would be two accounts of one review.',
        adrs: ['ADR-0007', 'ADR-0009'],
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
          'ADR-0003 gives the scheme two behaviours the built product does not have. The system is meant to suggest the deliverable code from the comment codes, for the lead reviewer to confirm or override — Rachel picks hers from the list unaided, and the suggestion survives only as a note in the schema. And whether a comment’s code blocks acceptance is meant to be a property of that code in the project’s scheme, not hard-wired; the stored scheme carries a level, is_accepting, is_contractual and grounds — and nothing that blocks. Neither half carries a ticket yet.',
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
          'Version two arrives and the working screen stays on the round under review: round 2, freshly acknowledged, no comments yet — the reconciliation Rachel will read sits in the record one click away, which is the next beat. P02 took the same road as the first version, through its own internal QA pass, because one QA acceptance buys exactly one revision; and round 2 opened the way every round now opens, on acceptance and acknowledgement, not on the promoter’s click.',
        adrs: ['ADR-0009'],
      },
      {
        img: '24a-record',
        lane: REVIEWER,
        screen: 'Review record',
        title: 'One table, appended to — not a sheet per round',
        prose:
          'The chapter’s whole review history in one scroll: every comment in order with where it sits, its code, its author and the response that answered it, round one closed off by the deliverable code it concluded with, round two appended to the same table rather than opening a new one. This is what the Excel review notice could never do, and the reason ADR-0009 refused to materialise a second artifact from the record. Each answered comment’s response either points at the change — “Changed in P02”, with the passage — or states explicitly that none was made and why; a response written before its promotion reads “change prepared for the next revision” until the stamp lands (ADR-0004’s declare-now, stamp-later). Round two carries a band saying it has no code yet, because an open round with no verdict is a state rather than a gap, and no count of comments will ever fill it. There is no download, no “issue the record”, no print button anywhere on this screen: the DRN was dropped and a button here would quietly reinstate it.',
        adrs: ['ADR-0009', 'ADR-0004', 'ADR-0005'],
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
        title: 'The controlled record, apart from the material it was drawn from',
        prose:
          'WA-EIA-MST-001, revision C01, live in the project library. It is now project knowledge: the drafting assistant grounds on it, citations resolve into it, and the wall still decides who reaches it. The ground investigation and baseline reports it was drafted from are on the same page and in a different table — Reference material, received rather than produced here. Both ground and both are cited the same way; only one of them is this project’s record of its own work, and listing them together would let a corpus quietly launder itself into the record it exists to support.',
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
      {
        img: '27a-blast-radius',
        lane: OWNER,
        screen: 'Acceptance codes · stop grounding',
        title: 'The consequence, before the click rather than after it',
        prose:
          'Back on the scheme, and now A1 has actually admitted something: the row carries the count, and turning the code off states it — this many live deliverables leave AI answers, from the next question asked. It is not a checkbox because the damage it can do is invisible: every citation that already exists still resolves, so a project that quietly stopped relying on half its library would look exactly like one that had not. The change is recorded the way a rails change is, with a reason in Rachel’s own words, because who and when a timestamp already gives. And the promise about “the next question” is only honest because retrieval reads the flag live rather than caching a composite answer — the surface and the query had to agree, and this is the side making the claim.',
        adrs: ['ADR-0003', 'ADR-0030', 'ADR-0013'],
      },
    ],
  },
  {
    num: 'VII',
    title: 'Ending a deliverable that is no longer current',
    lede:
      'The journey does not end at acceptance, because a project outlives its documents. A study is overtaken, or found wanting, and the question is what stops — and what deliberately does not. Nothing is deleted and nothing becomes unreadable; what ends is the AI reaching for it silently.',
    beats: [
      {
        img: '28-withdraw',
        lane: OWNER,
        screen: 'Documents · withdraw',
        title: 'The button that did not exist',
        prose:
          'Until this slice nothing in the product set a deliverable superseded, and withdrawal reached only a producer’s own unpublished plan row — the same word for a different act. Authority now follows the publication boundary rather than the party: before publication the record is the producing organisation’s, and once published into the owner’s library it is the owner’s, with the producer pressing the same control to PROPOSE instead. The reason is mandatory, and it is mandatory because of who reads it: visibility follows the container, so the firm whose work this is reads why its deliverable was ended. A deliverable that stops being relied on with no explanation is a decision nobody can audit.',
        adrs: ['ADR-0013', 'ADR-0033'],
      },
      {
        img: '29-withdrawn',
        lane: OWNER,
        screen: 'Documents',
        title: 'It leaves the corpus, not the record',
        prose:
          'The deliverable is gone from the governed corpus and stands as a record on the plan, exactly as it did a moment ago except in one respect: the AI has stopped answering from it. Restoration is no longer symmetric — the container records which side withdrew it, and only that side may undo it, or the owner over a producer’s act. As built, either party could restore what the other withdrew with neither act recording the other, which is a disagreement the record could not show.',
        adrs: ['ADR-0013', 'ADR-0011'],
      },
      {
        img: '30-context-state',
        lane: CONSULTANT_SUPER,
        screen: 'Plan · deliverable detail',
        title: 'The badge names its reason',
        prose:
          'From the producing side: the row is still there, still readable, and now carries a second badge beside its status — not used for AI answers, and WHY. The distinction matters because there are three different reasons a deliverable can be out of the agent’s reach, with three different responses: superseded by another document, withdrawn with a reason, or accepted under a code this project decided not to rely on. Context state is derived from those three conditions and never stored, because a flag that could be set independently of its inputs would give the platform two state machines that could disagree — invisibly, since every citation would still resolve. And it is not access: anyone who could read this deliverable still can, and may pin it deliberately as an attached source, where the same marker travels with it.',
        adrs: ['ADR-0013', 'ADR-0003', 'ADR-0022'],
      },
    ],
    gaps: [
      {
        title: 'Being told, rather than noticing',
        prose:
          'The story has the consultant find out because Infora tells them — the bare fact and a link, never the reason, which is not the sort of thing that belongs in an email leaving the platform. The event is ruled and the notification is not built: it belongs to the notifications slice (T-329–T-332). Until it lands, the fact reaches the producing organisation where the withdrawal itself is read, on this screen and in Documents.',
      },
    ],
  },
];

// ── the tools ───────────────────────────────────────────────────────────────
//
// T-400, on the owner's ruling of 2026-08-31: this page's charter is the
// journey AND the tools, because no product surface should ship without a
// picture. A tool is not a user story and gets none — `user-stories.md`
// follows one deliverable through its life, and a tool is a standalone thing
// opened on any day against whatever is in hand — so these sections live
// after the acts rather than inside them, and nothing here was written into
// the stories. The rule that keeps the two from saying the same thing twice:
// AT MOST ONE journey beat per tool, saying what happened in the story and
// pointing here; the granular shots live here.
const toolSections = [
  {
    key: 'creator',
    title: 'The document creator',
    lede:
      'Instead of opening a blank editor, you build a document: choose its shape, say what it is for, pick the library documents it may draw on, and see what will run — and what it will and will not cover — before a word is drafted. The order is the design rather than a form’s field order: the sources are chosen ahead of the drafting, so the result can be checked against what was asked for rather than against whatever retrieval happened to find.',
    beats: [
      {
        img: 't1-01-tools',
        lane: CONSULTANT,
        screen: 'Tools',
        title: 'Two tiles, and a third tool with none',
        prose:
          'Tools holds Infora’s standard tools, each with what it does written under its name: the document creator and the QA checker. The list is assembled for the person asking rather than filtered on the way out, so a tool somebody cannot use is absent from this page rather than sitting on it disabled — the section can never advertise a capability the viewer has no way to reach. There is a third built tool, the extractor, and it has no tile at all: what a user would pick first, and where its output would land, is an unruled design question, and a tile promising a screen nobody has designed is worse than no tile.',
        adrs: ['ADR-0053', 'ADR-0027'],
      },
      {
        img: 't1-02-launcher',
        lane: CONSULTANT,
        screen: 'Tools · Document creator',
        title: 'What it asks, before anything is drafted',
        prose:
          'The launcher as it opens: the shape, what the document is for, its title, the working area it goes to, and the library documents it may use. Nothing has run and nothing can yet — the only button is <em>See the plan</em>. The answers survive being shown a plan, so a change of mind about one of them does not mean re-entering the rest; what a change does discard is the plan itself, because a plan is about the inputs it was computed from and a stale one shown beside changed answers would be a lie the reader cannot see.',
        adrs: ['ADR-0053'],
      },
      {
        img: 't1-03-brief',
        lane: CONSULTANT,
        screen: 'Tools · Document creator',
        title: 'The outline is chosen, and the intent is stated',
        prose:
          'Eleanor picks the assessment chapter section — the test, the baseline, the effect and the mitigation, in the order a reader expects them — says in her own words what this one is for, names it, and sends it to Calder & Hale’s working area. The outline is chosen rather than composed: the shape carries its own four parts and each part its own guidance, and the guidance says what belongs in the part and never what to conclude, because a template that told the model what to find would make every document produced from it agree with the template rather than with the sources. What the brief cannot do here is speak to one section at a time; that gap has a card at the foot of this section.',
        adrs: ['ADR-0053'],
      },
      {
        img: 't1-04-sources',
        lane: CONSULTANT,
        screen: 'Tools · Document creator',
        title: 'The sources are bound before a word is written',
        prose:
          'Two of the five library documents Eleanor can reach: the ground investigation report and the environmental baseline. Binding them here rather than letting the run go looking is what gives the draft an explicit source manifest — a list of what it actually rests on, checkable against the document afterwards. The five are the ones her access resolves to and no more: a document she could not reach is absent from this list rather than greyed out in it, so the picker cannot reveal that it exists.',
        adrs: ['ADR-0011', 'ADR-0053'],
      },
      {
        img: 't1-05-plan',
        lane: CONSULTANT,
        screen: 'Tools · Document creator',
        title: 'The plan, and a price that refuses to be zero',
        prose:
          'One step — draft four sections into the chosen shape from the two bound sources — with what it covers stated beneath it and the cost beneath that. The plan is computed in ordinary code before any model is involved, which is what lets the tool promise the same steps in the same order for the same inputs tomorrow; it is rendered and it is not editable, and you shape it by changing an answer above and watching it regenerate. The cost here reads <em>not priced — this deployment has no rate for the model that would run it</em>, and that sentence is the point: this substrate’s model has no rate, and an unpriced step says so rather than showing a plausible £0.00 that somebody builds a business case on.',
        adrs: ['ADR-0053', 'ADR-0027'],
      },
      {
        img: 't1-06-result',
        lane: CONSULTANT,
        screen: 'Tools · Document creator',
        title: 'The same sentence afterwards, with what happened in it',
        prose:
          'The run finishes and its coverage comes back in the same shape it took before: one of four sections written, one of the two bound sources used, one drafting pass — and one sentence withheld for resting on no source. Reading the two lines against each other is the whole design: <em>four sections</em> becoming <em>one of four</em> is a fact the reader meets rather than something to go looking for. The withheld sentence was an unsupported figure, and it was not written at all rather than written and flagged, because a built document gets no weaker guarantee than a grounded answer does.',
        adrs: ['ADR-0053', 'ADR-0011'],
      },
      {
        img: 't1-07-landing',
        lane: CONSULTANT,
        screen: 'Sandbox',
        title: 'Where it landed',
        prose:
          'The working area named in the launcher, with the new draft in it: v0.1, unbound, sitting at the root of the plan-locked tree beside the discipline folders. It is an ordinary sandbox document from the moment it exists — it can be edited, checked, bound to a plan row and promoted exactly as a hand-written one can, and the tool has no privileged write path of its own.',
        adrs: ['ADR-0038', 'ADR-0040'],
      },
      {
        img: 't1-08-bound-refusal',
        lane: CONSULTANT,
        screen: 'Tools · Document creator',
        title: 'The first honest refusal, and a layout that is not honest at all',
        prose:
          'Arriving at the creator from a deliverable in the plan instead of from Tools, the screen refuses and says why: whether a bound deliverable’s plan row should seed the document’s structure is an open design question (Q-037), and a structure invented here would be shaped by an answer nobody has given. Refusing and naming the question is right. The rendering is not: the notice is laid out as a row, so its clause number and its link are thrown into columns and the sentence is close to unreadable. That is a real defect in the shared notice component rather than anything about this tool, it affects every notice carrying a link or a code, and it is photographed rather than cropped out — this capture is where it was found.',
        adrs: ['ADR-0053'],
      },
    ],
    gaps: [
      {
        title: 'Per-section intent, and sources bound per section',
        prose:
          'The tool was specified as compose the outline, state the intent for each section, and bind library sources per section before anything generates. What is built asks for one brief and one set of sources for the whole document, and takes the outline and its per-part guidance from the shipped shape. The ordering that matters — sources before drafting — is built and is the half that makes the output auditable; the per-section grain is not, and it has no ticket.',
      },
      {
        flag: 'Found by this capture',
        title: 'The coverage sentence counted a section the document does not have',
        prose:
          'The document this run created is empty, while the sentence above it says one of four sections was written. Both halves are explicable and only one is defensible. The drafting call here is served by the substrate’s deterministic stand-in, which answers in prose with none of the shape’s headings in it — so every sentence lands outside any section, which is why nothing was written into the document and why this beat photographs the working area rather than the open editor. But the count is drawn from the same unsectioned material and reports it as a section written, and that is the after-statement overstating, on the one surface whose entire job is to be the difference between a clean result and an unexamined one. Not ticketed here — this session was allowed one number, and it spent it on the walkthrough.',
      },
    ],
  },
  {
    key: 'checker',
    title: 'The QA checker',
    lede:
      'Read a draft against the writing rules that bind it and the project record it rests on, and get findings anchored in the text that a person takes or leaves one at a time. Its tile stands beside the creator’s in the Tools shot at the head of the section above — one page, two tiles, and a second photograph of it would have been the same picture. The draft below is a working copy of its own: by this point in the story the journey’s draft has been frozen, promoted, reviewed and accepted, and a frozen head is read-only, while everything here rewrites the text it works on.',
    beats: [
      {
        img: 't2-02-draft',
        lane: CONSULTANT,
        screen: 'Tools · QA checker',
        title: 'One document, chosen first',
        prose:
          'A check covers one document, and the screen says so: its findings are marks in that draft, not a report about several. The same launcher opens from the editor’s Check button with this first step already filled in — one run shape, one place the scope is stated — rather than a second, quieter path that would run a check with no plan and no coverage statement. Below the draft, the launcher opens on the full check rather than the quick one, deliberately: a too-cheap default fails invisibly, and a too-expensive one fails visibly.',
        adrs: ['ADR-0053'],
      },
      {
        img: 't2-03-adjusted',
        lane: CONSULTANT,
        screen: 'Tools · QA checker',
        title: 'How hard to look — and a preset that is a starting point, not a mode',
        prose:
          'Eleanor takes the quick check and then turns one check off by hand. A preset sets the five families and the record’s search depth together, as one honest choice, and every part of it stays individually adjustable afterwards — which is why the internal-consistency box can be cleared without leaving the preset. Two of the five say <em>No AI</em> on their face: readability and completeness are arithmetic, they cost nothing, and a checker described as so many model calls would have been describing half of itself. The depth select is present only because the accuracy check is still on, and it names its own trade in the option text: once per section is faster and will miss a figure the section is not mainly about.',
        adrs: ['ADR-0053', 'ADR-0027'],
      },
      {
        img: 't2-04-attach',
        lane: CONSULTANT,
        screen: 'Tools · QA checker',
        title: 'Two ways to give it something to read, and one that is not built',
        prose:
          'The two document controls are named differently because they are two different guarantees, and the copy under each says which you get. Narrowing the library scope yields findings that <strong>cite normally</strong> and resolve to a place in a source document; attaching one of your own drafts yields findings that are <strong>never cited</strong> and quote an excerpt instead. Attaching a library document would silently take the weaker path, which is why neither control is called “choose a document”. Below them is the second honest refusal on this page: handing the checker a file directly is not built, the control says so in plain words rather than sitting there doing nothing, and the absence now has a ticket of its own (T-399).',
        adrs: ['ADR-0053', 'ADR-0022'],
      },
      {
        img: 't2-05-plan',
        lane: CONSULTANT,
        screen: 'Tools · QA checker',
        title: 'The plan says what shape it took, and why',
        prose:
          'The plan opens by explaining itself: one pass over the whole draft, because it all fits in a single read — and the consistency check comes free in that shape, since one reader genuinely sees everything and there is nothing left to compare afterwards. Then the steps, then what will be covered, then the cost. Beside them a notice states the price of the attached document before the run rather than after it: it is read but never cited, and if citations are wanted the way to get them is to scope to the library document instead. Every caveat this plan carries is stated before the button, never under the result — a run that reported its findings and then admitted it had not looked everywhere would be degrading quietly, which is the one thing the tool must not do.',
        adrs: ['ADR-0053'],
      },
      {
        img: 't2-06-run',
        lane: CONSULTANT,
        screen: 'Tools · QA checker',
        title: 'The same sentence, before and after, in one frame',
        prose:
          'The run finishes under the plan that promised it, and both sentences are visible at once: six sections, four checks, the library searched once per section, five of five style clauses, one attached document — and then six of six sections read, four checks, five passages of the record read, five of five clauses, one attached excerpt never cited. Three findings. That coverage line is not a footnote: it is the only thing that distinguishes a clean result from an unexamined one, which is why <em>no findings</em> here would have to be read as <em>no findings in what was read</em>. It also appends what the findings list cannot show — sections the library said nothing about, and suggested findings thrown away for not pointing at real text — and this run had neither to report.',
        adrs: ['ADR-0053'],
      },
      {
        img: 't2-07-marks',
        lane: CONSULTANT,
        screen: 'Editor · Checks',
        title: 'The findings are marks in the draft',
        prose:
          'Opening the draft, the findings are where they belong: underlined in the text they are about, and listed beside it under the check that raised each one. Every finding says what is wrong and shows what it rests on, and the three kinds of evidence are rendered as three different things. A quoted writing rule appears as a quotation with its clause number — §2.1 of the project style guide, §4.2 of Calder & Hale’s own manual — and deliberately never as a source chip, because a rule steers the author and asserts nothing about the scheme; only a finding grounded in the record gets a chip. Where the project’s guide and the firm’s own disagree, the project’s wins and the firm’s fills the gaps.',
        adrs: ['ADR-0048'],
      },
      {
        img: 't2-08-panel',
        lane: CONSULTANT,
        screen: 'Editor · Checks',
        title: 'Two views of one set',
        prose:
          'Clicking an entry in the panel selects the passage it is about in the draft — here the passive sentence about the conceptual site model, highlighted in the text with its mark still underlined and the informal “the former works” underlined a few lines below it. The document carries the marks, the panel carries the list, and both are drawn from a single read: they are two views of one set rather than two lists that have to be kept in step. The link runs both ways — clicking a mark in the text opens its entry in the panel — and a finding whose text has since been edited simply points at nothing rather than at the wrong words.',
        adrs: ['ADR-0048', 'ADR-0053'],
      },
      {
        img: 't2-09-drift',
        lane: CONSULTANT,
        screen: 'Editor · Checks',
        title: 'Edit the text under a finding, and the fix refuses',
        prose:
          'Eleanor rewrites the sentence herself — “the former works” becomes “the former railway works at Wrenfield Sidings”, visible at the foot of the draft — and then asks the checker to apply its own correction to it. It does not. The banner at the top of the panel says one mark has moved since the check ran, that nothing was written for it, and that the text it pointed at has been edited, so she should look at it herself rather than take the suggestion blind. The finding stays open rather than being applied to words that have changed under it. This is the degrade path’s only visible sentence, and it is the honest failure: the alternative is a fix landing quietly on the wrong text.',
        adrs: ['ADR-0048'],
      },
      {
        img: 't2-10-accept-all',
        lane: CONSULTANT,
        screen: 'Editor · Checks',
        title: 'The accept-all sits above the mechanical fixes, and no rewrite gets one',
        prose:
          'With the sentence put back, the group’s layout is the ruling made visible. A mechanical correction — the same substitution applied consistently, stated in one line as <em>former works → scheme</em> — sits under a button that accepts the lot and says how many places that is; here it is one, and at fifty-five it would be one decision applied fifty-five times rather than fifty-five decisions. Below it the screen states in plain words that the rest are rewritten wording and are read one at a time, and the rewrite that follows has no accept-all anywhere near it. Which kind a fix is comes from the text of the fix itself, computed in code — never from a judgement made on the screen, and never from the model that proposed it.',
        adrs: ['ADR-0053', 'ADR-0048'],
      },
      {
        img: 't2-11-rewrite',
        lane: CONSULTANT,
        screen: 'Editor · Checks',
        title: 'The rewrite, read one at a time',
        prose:
          'The mechanical correction is taken and gone, and what is left in House style is the one rewrite: the rule it rests on, the sentence the model proposes in its place, and three buttons — accept it, edit it into your own words, or set it aside. There is no button here that takes it unread, and there never will be: accepting new prose is not the same act as normalising a capital letter. The counter above has moved to one resolved, and the note at the foot says what resolved means — the promotion gate counts what is still open, not how it was cleared, so dismissing a finding with a reason of your own is as final as accepting it.',
        adrs: ['ADR-0048', 'ADR-0049'],
      },
      {
        img: 't2-12-dismiss',
        lane: CONSULTANT,
        screen: 'Editor · Checks',
        title: 'Declining a whole group is one judgement, not forty',
        prose:
          'The rewrite has been accepted and the draft now reads “Calder & Hale has prepared a conceptual site model…”, which is the paragraph in the text behind the panel. What remains is the readability finding — a grade against the project’s reading-age target and the draft’s own median, offered as a measurement and never as a pass or a fail — and above it a control that dismisses the whole group at once. Bulk dismissal takes anything and records no reason, deliberately: declining forty advisory findings from one rule is one professional judgement, and demanding forty typed reasons would buy a record nobody would ever read.',
        adrs: ['ADR-0053', 'ADR-0048'],
      },
    ],
  },
];

// ── page assembly ───────────────────────────────────────────────────────────
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
// `"` too (review, 2026-08-31): esc feeds attribute values (alt=), where an
// unescaped quote would end the attribute early.

// T-400 — PROSE MAY CARRY A LITTLE EMPHASIS, and until now it could not: `esc`
// escaped the `<` of a `<strong>` written into a beat, so Act IV's moderation
// beat had been rendering a literal `&lt;strong>` on the page since T-356.
// `<strong>` and `<em>` pass through and NOTHING ELSE does — one pass over the
// split, so an escaped `&` can never be unescaped by a later replace, and a
// beat still writes "Calder & Hale" rather than spelling out an entity.
// rich() covers beat.prose, gap.prose, tool.lede and act ledes; titles,
// screen labels and alt text stay esc-only ON PURPOSE — markup there is a
// bug, and adding <strong> to one reproduces the T-356 literal-tag failure.
const rich = (s) =>
  s
    .split(/(<\/?(?:strong|em)>)/)
    .map((part, at) => (at % 2 === 1 ? part : esc(part)))
    .join('');

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
    <p>${rich(beat.prose)}</p>
    <p class="tags">${chips}</p>
  </figcaption>
</figure>`;
}

function gapHtml(gap) {
  const drawn = gap.mockup
    ? `\n  <p class="gap-mockup">Drawn: <a href="../design/mockups/${gap.mockup}">${gap.mockup}</a></p>`
    : '';
  // T-400 — the flag is a field now. Most cards say "designed, not yet
  // surfaced", which is a claim about a DESIGN that ran ahead of the build; a
  // card recording something the capture itself walked into is a different
  // claim, and wearing the wrong label would make it a softer one.
  return `
<aside class="gap">
  <span class="gap-flag">${esc(gap.flag ?? 'Designed, not yet surfaced')}</span>
  <h4>${esc(gap.title)}</h4>
  <p>${rich(gap.prose)}</p>${drawn}
</aside>`;
}

// anchors for the contents nav (T-400 follow-up, 2026-08-31): stable ids per
// act and per tool, derived from what is already unique — the act's numeral,
// the tool's title
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function build(srcFor) {
  // The tools' sections render with the acts' furniture and a different head:
  // they are not acts, they are not numbered, and the reader should be able to
  // see at a glance that the story has ended and something else has started.
  const toolsHtml = toolSections
    .map(
      (tool) => `
<section class="act tool" id="tool-${slug(tool.title)}">
  <header class="act-head">
    <span class="act-num tool-num">Tool</span>
    <div>
      <h2>${esc(tool.title)}</h2>
      <p class="lede">${rich(tool.lede)}</p>
    </div>
  </header>
  ${tool.beats.map((b) => beatHtml(b, srcFor(b.img))).join('\n')}
  ${(tool.gaps ?? []).map(gapHtml).join('\n')}
</section>`,
    )
    .join('\n');

  const actsHtml = acts
    .map(
      (act) => `
<section class="act" id="act-${act.num}">
  <header class="act-head">
    <span class="act-num">${act.num}</span>
    <div>
      <h2>${esc(act.title)}</h2>
      <p class="lede">${rich(act.lede)}</p>
    </div>
  </header>
  ${act.beats.map((b) => [beatHtml(b, srcFor(b.img)), ...(b.gapAfter ?? []).map(gapHtml)].join('\n')).join('\n')}
  ${(act.gaps ?? []).map(gapHtml).join('\n')}
</section>`,
    )
    .join('\n');

  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Infora — the document management journey and its tools, on screen</title>
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

  /* the tools' part: not acts, and the page should say so before the reader
     has to work it out from the headings */
  .contents { margin: 34px 0 8px; padding: 18px 22px; background: var(--card); border: 1px solid var(--hairline); border-radius: 10px; }
  .contents-head { display: block; font-family: var(--mono); font-size: 11.5px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-bottom: 8px; }
  .contents ol { list-style: none; margin: 0 0 14px; padding: 0; columns: 2; column-gap: 28px; }
  .contents ol.c-tools { margin-bottom: 0; }
  .contents li { break-inside: avoid; margin: 0 0 6px; }
  .contents a { color: var(--ink); text-decoration: none; }
  .contents a:hover { text-decoration: underline; }
  .c-num { display: inline-block; min-width: 34px; font-family: var(--mono); font-size: 11.5px; color: var(--muted); }
  @media (max-width: 640px) { .contents ol { columns: 1; } }
  .part-break { margin-top: 84px; border-top: 2px solid var(--frame); padding-top: 26px; }
  .part-break h2 { font-family: var(--serif); font-size: 30px; font-weight: 600; margin: 0 0 8px; }
  .part-break p { margin: 0; color: var(--muted); max-width: 68ch; }
  .act.tool { margin-top: 44px; }
  .tool-num { font-family: var(--sans); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }

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
    <span class="doc">docs/architecture · Recaptured 2026-08-31</span>
  </header>

  <h1>The document management journey, and its tools, on screen</h1>
  <div class="intro">
    <p>This is <a href="user-stories.md">user-stories.md</a> rendered as the built product: the owner who decides what a
    deliverable is described by, the consultant who produces a Land Quality method statement, the colleague who checks it
    before it leaves the office, and the client lead reviewer who runs the review and accepts it.
    Every screenshot is the real application, driven live through the whole cycle on the seeded Wrenfield world — nothing
    is a mockup, and nothing was staged for the photograph. Where the written story runs ahead of the build, the beat is
    flagged <em>designed, not yet surfaced</em> and points at its ticket, or at the session that ruled it where the ticket is not yet minted.</p>
    <p>After the seven acts come <strong>the tools</strong> — the document creator and the QA checker, each photographed
    action by action. The owner's ruling of 2026-08-31 widened this page's charter to cover them: a product surface that
    has never been photographed is a surface nobody has read back. The tools are not user stories and are deliberately
    not written into one; the journey keeps at most a single beat per tool, saying what happened in the story and
    pointing into the tool's own section.</p>
    <p class="prov">Recaptured 2026-08-31 against the e2e substrate (deterministic model providers, seeded corpus).
    This page is now the single rendering of the two journeys: the companion decision map
    (<code>user-stories-graphic.html</code>) was deleted on 2026-08-18, its accurate content absorbed into the beats and
    gap cards below — it had been built from ADRs 0001–0012 and predated the sandbox, binding, internal-QA and
    acknowledgement decisions this page is captured against. The second owner-directed walk (2026-08-19 → 22) produced
    four rulings which were carried here as gap cards and are now beats: the review period’s owner, the promotion
    window, the appointment the named person accepts for themselves, and the review record as one appended table
    (T-371–T-375). The drawings that proposed them have been deleted, which is what a mockup is for — the capture is the
    record now, and their reasoning lives in the ADR addenda of the same date.</p>
    <p class="prov">The tools’ two sections were added the same day (T-400), on the ruling that widened the charter.
    Nineteen of the fifty-nine shots below are theirs. Two beats left the journey to make room for them without saying
    the same thing twice: the checker’s plan and its coverage statement were beats in Act II and are now the checker’s
    own section, which photographs both in one frame.</p>
  </div>

  <nav class="contents" aria-label="Contents">
    <span class="contents-head">Contents</span>
    <ol>
      ${acts.map((act) => `<li><a href="#act-${act.num}"><span class="c-num">${act.num}</span> ${esc(act.title)}</a></li>`).join('\n      ')}
    </ol>
    <span class="contents-head">The tools</span>
    <ol class="c-tools">
      ${toolSections.map((tool) => `<li><a href="#tool-${slug(tool.title)}"><span class="c-num">Tool</span> ${esc(tool.title)}</a></li>`).join('\n      ')}
    </ol>
  </nav>

  <div class="cast">
    <div class="card">
      <div class="who"><span class="dot" style="background:var(--consultant)"></span>Eleanor Price</div>
      <p>Environmental consultant and lead author at Calder & Hale, the appointed consultancy — and its super-user on this project. Sets the sandbox up, drafts, promotes, answers the review.</p>
    </div>
    <div class="card">
      <div class="who"><span class="dot" style="background:var(--internal)"></span>Owen Vance</div>
      <p>Colleague of Eleanor’s at Calder & Hale. Checks her work in the organisation’s own QA round, before anything crosses the wall.</p>
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

  <section class="part-break">
    <h2>The tools</h2>
    <p>Two standalone tools, each photographed action by action. They appear on this page without a user
    story of their own because they do not have one and should not: <a href="user-stories.md">user-stories.md</a>
    follows a single deliverable through its life, while a tool is a thing a consultant opens on any day
    against whatever is in front of them. They are here because a product surface that has never been
    photographed is a surface nobody has read back — the owner's ruling of 2026-08-31, which widened this
    page's charter from the journey to the journey and the tools.</p>
  </section>

  ${toolsHtml}

  <footer class="prov-foot">
    <p><strong>Provenance.</strong> Recaptured 2026-08-31 from the running application: e2e API substrate with deterministic
    model providers, the seeded three-organisation Wrenfield world, Playwright-driven browser sessions for all three personas.
    The one beat Playwright cannot photograph — the library modal’s embedded PDF pane — is represented by the library
    table instead.</p>
    <p><strong>What was driven through the API rather than clicked.</strong> Setting up the world: four plan rows beside
    the seeded one and their schema metadata, the organisation’s column standard, the draft and its text, and filing that
    draft into its deliverable folder. Running the cycle: appointing the internal reviewer and the re-freeze that opens the
    QA round (both explained in Act III’s gap card), version two’s acknowledgement — round 1’s is the beat-16 click —
    and version two’s internal QA pass and promotion, which repeat Act III’s road and are narrated rather than
    re-photographed. In the tools’ sections: the working copy the checker reads, created and filled through the API
    because it exists only to be checked, and the single act of putting its edited sentence back after the drift beat —
    which is a reset rather than a step of the tool. Everything a screenshot on this page shows being done was done on
    that screen.</p>
    <p><strong>What the tools’ capture walked into, recorded rather than staged around.</strong> Three things, all
    photographed as found. The estimated cost on both tools reads <em>not priced</em>, because this substrate’s model
    carries no rate and an unpriced step says so rather than showing a plausible £0.00. The creator’s bound-deliverable
    refusal renders its clause number and its link as columns — a layout defect in the shared notice component, not in
    the tool, affecting every notice that carries a link. And the creator’s run reports one of four sections written into
    a document that is empty: the substrate’s deterministic stand-in answers in prose with none of the shape’s headings,
    so nothing landed under a section, and the count reports that unsectioned material as a section written anyway. The
    last two have gap cards on the creator’s section and no ticket; this session was allowed one number and spent it on
    the page.</p>
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
