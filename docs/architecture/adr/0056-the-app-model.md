# ADR-0056 - The app model: an app is a **project thing with a participant scope**; its tables are a **third kind of project record** whose every row carries the **organisation and person that entered it**; an app **acts as whoever is looking at it**; a scheduled run acts as its **owner**, narrowed to what the app declared; the **project owner may share a table** with a named organisation; a departing organisation's **accepted rows stay** and its **unaccepted rows follow the sandbox rule**; and a **playbook** carries structure and the firm's own reference data, **never anything entered in a project**

*In plain terms:* Infora's Tools section will let a team have an app built for
it — a form contractors fill in that the client sees as a dashboard, a land
register on a map, a health-and-safety board with an analyst inside — with an
agent writing the screens. This record fixes what such an app *is* so that the
rules that already keep one firm's work away from another keep working inside
it. An app lives in a project. The rows people type into it are a new kind of
project record: each one remembers which organisation and which person entered
it, is read by that organisation and by the project's owner, and by nobody
else. The app has no powers of its own — it shows each person exactly what
that person could already see. When it runs on a schedule with nobody looking,
it runs as the person who owns it, and only over the tables it declared. A firm
may keep an app as a **playbook** in its own workspace and deploy it into the
next project, but the playbook carries the *design* of the app and the firm's
own reference data, never a row that was entered on a client's project.

**Status:** Accepted (owner-ruled 2026-09-05 → 06, the app-builder design **Amended 2026-09-06 (the first look at T-438's drawings): six rulings — the drawn step order, working and published definition copies, draft rows read by the entering organisation alone, a required rejection reason, the agent as a pane, the step-filling chat declined — Claude's recommendations confirmed wholesale by the owner; the dated addendum below is the record.** **Amended again 2026-09-07 (after the T-442/T-444 review): a submitted row freezes until decided; a narrowed interface binds its builders; the reassignment scope and export retention confirmed; blocks-versus-code deferred to T-446 — the second dated addendum below.** **Amended a third time 2026-10-18 (owner-directed, Claude-designed on delegated authority): the builder becomes AGENT-LED, reversing the first addendum's ruling 6 — a description leads, the agent asks what it must, a server-side gate refuses publishing past an unanswered required question — the third dated addendum below.** **Amended a fourth time 2026-10-19 (owner-ruled during the T-446 walk): BLOCKS NOW, BOXED CODE LATER — the second addendum's ruling 5 closes; the builder's agent keeps assembling screens from the fixed block grammar and writes no code for V1; code-built apps are a later direction, gated on a sealed "box" being designed and ruled first (`Q-056`) — the fourth dated addendum below.** **Amended a fifth time 2026-10-25 (owner-ruled after the T-446 walk's defects were rechecked): a chart may group by the organisation that entered each row, and a builder may add a column to a table on the working copy; the client accepts or rejects from the dashboard; a rejected return reaches its contractor through the home work queue, with no new notification; rejected and replaced rows never count in a dashboard's figures or a run's analysis — the fifth dated addendum below.**
session; the record is in [grill-history.md](../../grill-sessions/grill-history.md),
Session AB). **Closes `Q-051` and `Q-052`.** Builds on the eleven owner rulings
of the 2026-09-04 exploration (Session X), which this ADR restates only where
a rule depends on them. Extends **[ADR-0036](0036-sandbox-participant-scope-model.md)**
(the participant-scope ladder, borrowed whole), **[ADR-0016](0016-permission-model-flat-library-per-deliverable.md)**
and **[ADR-0035](0035-non-review-transmittal-and-intra-org-deliverable-visibility.md)**
(the owner's share, borrowed for a table), **[ADR-0050](0050-the-privacy-programme-operator-access-and-deletion.md)**
§6 (deletion follows *whose material it is*), **[ADR-0025](0025-assembly-environment.md)**
and **[ADR-0053](0053-the-checkers-run-and-the-executor-rule.md)** §8 (the one
access gateway), **[ADR-0021](0021-context-channels-grounded-guiding-informing.md)**'s
2026-09-04 addendum and **[ADR-0011](0011-project-library-knowledge-corpus.md)**'s
2026-09-06 addendum (what an app is *not*: a grounding source). Its companion
is **[ADR-0057](0057-connections-and-stored-credentials.md)** (connections to
outside systems). **Nothing here is in V1.** The register entry that carried
the exploration's two constraints now points here.

> **Written ahead of its build, on purpose.** Every ticket of the pilot
> deployment was open when this was ruled; Infora ran on one machine with no
> object store, no secrets store and password logins. The owner decided
> (2026-09-06) to build the app builder locally ahead of deployment and to
> defer only what deployment supplies. **§13 lists what this record assumes**,
> so the session that builds it re-checks those assumptions instead of
> trusting the text.

**Addendum (2026-09-06, owner-ruled on the first look at T-438's two drawings — six rulings, recorded in [grill-history.md](../../grill-sessions/grill-history.md) under Session AB's follow-on).** *In plain terms: the owner looked at the two drawings, asked for Claude's recommendation on each open fork, and confirmed all six in one line. Nothing above this line is rewritten; where a clause below is touched, a dated note points here.* **(1) The builder's step order is confirmed as drawn:** what the app is and who it is open to → the tables → data connections → the interface → how often it runs → analysis and prompts → check and open. **(2) An app's definition has a working copy and a published copy** (§11): the builder edits the working copy; the people in the app's scope open the published one, and a scheduled run acts only against it; "check and open" is the act of publishing, recorded with who and when; an app with nothing published is open to its builders alone. Without this, a builder's every save would change a form a contractor is filling in at that moment — Retool's draft-versus-live release model, adopted (T-437's review, §6 P1). **(3) A draft row is read by its entering organisation only** (§2): the owner reads a row from `submitted` onward. A draft is an unfinished number, the same standing as unfinished work in a sandbox before promotion; the owner's dashboard shows "no return yet" for that month, which is the honest state. **(4) A rejection carries a required reason** (§2a): the decider says why, and the submitting organisation reads it on the row, on the review record's precedent that every comment gets a response; a rejection with no reason becomes a phone call, which is the record failing. This reverses drawer 9's "no reason on a rejection" and the personal-data register's note. **(5) The builder's agent sits in its own pane beside the steps**, the conversation continuous across them; every choice is recorded in the form itself, never only in the chat, so closing the pane loses nothing. **(6) Declined: a chat that fills the steps in.** The steps stay the spine because they make the three wall questions (§2b) unavoidable — a chat can skip a question, a form cannot. Revisit after the owner has built the returns app in the builder (T-446). *How these were ruled:* Claude's recommendation on each, with the case that would make it wrong, put to the owner together; the owner: *"okay let's write the addendum and do the other things and give me a report for my co-captain."* Confirmed wholesale rather than one at a time — recorded as such so a review can put any of the six back to the owner.

**Addendum (2026-09-07, owner-ruled after the T-442/T-444 review — four rulings and one deferral, put to the owner in plain terms with a recommendation each).** *In plain terms: the built app builder raised five questions; the owner answered four and chose to test the fifth in person.* **(1) A submitted row freezes until the client decides.** T-441 had left a submitted return editable by the firm that entered it (its record's stated deviation 2); the owner ruled the other way — *"until client accepts or rejects"* — so from submission the row is locked: no edit and no retire until the decision lands, after which a correction is the door as before. **(2) A narrowed interface binds the building firm's own people on the published copy** — confirmed as built: a screen marked for the client alone is the client's alone, its builders included; the working copy the builders edit still carries every screen, and the data rules apply underneath regardless. **(3) The reassignment recipient scope is confirmed:** an app is handed within its own firm or to the project owner's people, never to a third firm — that transfer is a close-and-rebuild. **(4) A kept export file is not reached by a later erasure** — confirmed: the stored copy stands as the download's server-side twin, deleted with its app and the project's retention, and named in the DPA (the register's row carries the position). **(5) Deferred to T-446, not ruled: whether the agent may write screen CODE.** The built mechanism is a closed block grammar (§11's posture made mechanical — six block kinds, no field that can hold a URL or a key, the parser refusing whole); the owner heard the blocks-versus-code fork on 2026-09-07 and said *"let's test this as part of the user-testing later on. i'm not sure i agree but we'll check"* — so chart blocks (bar, line with trend, pie) are added to the grammar with T-443 so the owner's acceptance walk can judge whether blocks draw the screens they actually want, and the code question is answered there, not before. *(Ruled 2026-10-19 during the walk — blocks now, boxed code later; the fourth addendum below.)*

**Addendum (2026-10-18, the agent-led builder — owner-directed, with the mechanism designed by Claude on the owner's delegated authority; Session AC in [grill-history.md](../../grill-sessions/grill-history.md) carries the delegation and the veto list).** *In plain terms: building an app stops being a form you walk and becomes a conversation you have. You tell the agent what you want; it works out what it needs to ask you — including the questions it is never allowed to skip — and builds the app in front of you, with everything it has decided visible beside the chat and nothing publishable until the required questions have answers.* The owner's words (2026-09-09, reaffirmed 2026-10-18): *"the agent is almost a sidenote, whereas it should be the main focus - you should be describing to the agent what you want, it then creates the steps it needs to ask you to build the app for you"* — *"agent led not defined - more like a lovable or other experience."*

**This reverses the first addendum's ruling 6** (*"a chat that fills the steps in — declined"*), early and deliberately: that ruling said *revisit after the owner has built the returns app*, and the owner revisited after studying the built builder and the market instead ([nomic-docs-review.md](../../reference/nomic-docs-review.md), [app-builder-ui-review.md](../../reference/app-builder-ui-review.md) — context, never authority). Ruling 6's REASON — *a chat can skip a question, a form cannot* — is not reversed; it is re-housed in the one place no surface can route around:

**(1) The publish gate, non-negotiable and server-side.** Publishing is REFUSED while any required question stands unanswered — for every declared non-insight table, *does it hold contractual data* (§2a); for every interface, *who may open it* (§2b). The refusal says which questions remain, in words. The agent cannot skip what the server will not let past, and neither can a person driving the API directly — which closes a gap the T-442 review had already noted (the questions were computed and shown, and nothing refused a publish past them).

**(2) Description leads; the agent drafts, the person corrects, the wall questions are never defaulted.** The agent acts on the working copy through the same typed acts a person has — declaring tables, writing screens from the grammar, setting the schedule, the analysis prompt, the connection requirements — speculatively and without ceremony, because the working copy is builders-only by the first addendum's ruling 2, so the worst case of a wrong draft is a builder's own screen to fix. The two required questions are the exception: the agent must ASK them, in its own turn, and record the person's answer — it never assumes an answer, however obvious. (Lovable needs a separate ask-first mode because its agent edits the live thing; Infora's working/published split is what makes draft-then-confirm safe here.)

**(3) What the agent may never do is unchanged and restated:** nothing it does widens access. Scope grants, table shares, publishing, reassignment and closure are human acts it may propose and never perform (§4, §6, §7); the screen grammar is untouched and blocks-versus-code stays deferred to the owner's acceptance walk (second addendum, ruling 5) *(ruled 2026-10-19 — the fourth addendum)*; the one row predicate stays where it is.

**(4) The state of the app stands beside the conversation, and it is directly editable.** A panel shows what is decided — tables, screens, who may open each, schedule, prompts, requirements — and what is still open, so closing the chat loses nothing (the first addendum's ruling 5 survives as this panel) and a person can fix a label without asking. The agent reads before writing and respects manual edits (the market's own guardrail, Nomic's builder). The seven steps die as navigation; their seven concerns live on as the panel's sections.

**(5) The build conversation is STORED, against the app's working copy.** An agent you describe an app to across days needs to remember the conversation; it is builders-of-this-app private, carries the names of the people who spoke, and is deleted with the app — registered in [personal-data.md](../personal-data.md) at this ruling, the build keeping it true. (T-442 deliberately did not store it; this reverses that with the register row the original record said it would need.)

*How this was ruled:* the direction (agent-led, the split, "like Lovable") is the owner's; the mechanism — the gate, draft-then-confirm, the editable panel, the stored conversation — is Claude's on delegated authority (*"use your ingenuity to design this yourself then build it"*, 2026-10-18), each item on Session AC's veto list. Tickets T-448–T-450 build it; T-446 and T-447 move behind it.

**Addendum (2026-10-19, owner-ruled during the T-446 acceptance walk — one ruling, closing the second addendum's deferral (ruling 5), and one open question raised).** *In plain terms: the owner has decided that, for now, apps are put together from ready-made building blocks and nobody — not the agent, not a person — writes program code for them. The owner wants code-built apps later, so that sophisticated apps can run on Infora and reach the project's data or an outside product. But that only happens once we have designed, and the owner has agreed, the sealed "box" such code would run inside — so it cannot cross an ethical wall, leak anything, or change Infora itself. Until then, the question is research, not building.* The owner ruled this in principle before the walk's evidence arrived, after the walker explained how the builder's agent works (it fills a fixed answer shape — a closed list of acts, screens drawn from the grammar's block kinds — and never writes code). The owner, lightly edited: *"As a beginning — prototyping and the first iteration of Infora — the blocks approach makes sense. In the future we want to be able to write code and create sophisticated apps hosted on Infora, accessing data in the project library, a sandbox, or through an API integration to an external product. What we need to think about is how that code is boxed within Infora's environment and controlled, so it creates no risk to ethical walls, no leakage, and no changes to Infora's own software."*

**(1) Blocks are the V1 answer.** The closed block grammar (the second addendum, ruling 5; §11's posture made mechanical) stands as built: six block kinds plus the three chart kinds, no field that can hold an address or a key, the parser refusing a screen whole. The walk still judges whether the blocks draw the screens the owner actually wants — a block kind that is missing is a ticket, not a reason to open the code door. **(2) Code-built apps are a later direction, gated.** Nothing writes code for an app — no agent, no person — until the box's design is ruled; the board's deferred register carries the entry, and `Q-056` carries the design question, to be researched (how Salesforce, Retool, Airtable, Shopify and Microsoft's Power Platform contain their customers' code) before anything is drawn. §11's "generated code runs in the browser" is narrowed by this: what runs in the browser today is a block description, not code. **(3) The starting brief for the box — heard and agreed in principle, not yet ruled in detail:** code runs *as the person using it* and reaches data only through the same read checks every screen uses today, so the walls hold by construction and the code never holds a database credential of its own (§4); it runs isolated from Infora — it cannot read, change or reach Infora's own code, and a failure stays inside the box; it reaches nothing outside except through a connection a person has approved (ADR-0057's principle), never an address the code supplies; a person approves it before anyone can use it and again on every change (the "only a person opens the app" principle, §4 and the first addendum's ruling 2); and every run is recorded — who ran it, what it touched, what it sent out. Each of these is a line `Q-056` must either confirm or replace with a reason.

*How this was ruled:* the owner's direction, in the owner's words; the shape of the record — addendum, register entry, open question — is the walker's recommendation, which the owner accepted; the co-captain recorded it the same day. T-446's done-when line ("the blocks-versus-code question has a recorded answer") is met by this addendum; the walk's evidence on the blocks themselves still arrives with T-446.

**Addendum (2026-10-25, owner-ruled after the T-446 walk's defects were rechecked — four rulings).** *In plain terms: the acceptance walk found four things the returns app could not do that a client and a contractor would expect, and a recheck of the code on 2026-10-25 found all four still true. Claude put a recommendation on each to the owner in plain terms, and the owner chose all four. A chart can now show figures per firm — "electricity by contractor" — and a builder can add a column to a table that already exists. The client can accept or reject a return straight from the dashboard. A contractor whose return is rejected finds it on their home page under "waiting on you", with the client's reason, one click from the form — without a new kind of notification. And neither a dashboard nor the written analysis ever counts a return the client rejected, or one that was replaced by a correction; returns still waiting for the client's decision do count, and the dashboard says how many.* Nothing above this line is rewritten; where a clause above is touched, a dated note points here.

**(1) A chart may group by the organisation that entered each row; and a builder may add a column to an existing table, on the working copy.** The walk's "electricity by contractor" could not be drawn, because a chart groups by a declared column and the firm that entered a row is not a column (the walk's defect 6). **The closed block grammar (the second addendum's ruling 5, kept by the fourth addendum's ruling 1) widens by one field:** a chart may group by *the entering organisation* instead of by a declared column. The organisation's name already arrives on every row a viewer receives, so such a chart shows nothing the row table's Organisation column does not, and the wall is untouched — a viewer only ever sees the organisations whose rows they may read (§2, §4). The new field is a choice from a fixed list, not text: it can hold no address, no key and no code, and the grammar's kinds are unchanged. Separately, **a builder may add a column to a table that already exists, on the WORKING copy** — by hand in the panel, or through the agent, which acts with the same typed acts a person has (the third addendum's ruling 2). The people using the app see the new column from the next publish and not before, because a builder's save must not change a form somebody is filling in (the first addendum's ruling 2). The rows already entered carry no value for it, so an added column is optional. **Removing a column, or changing its type, stays out — because rows have already been entered under it.** Removing one would throw away figures people entered and the client may have accepted, and an accepted row is the owner's record, never edited in place (§2a); changing its type would leave stored values that no longer fit it. A table that needs a different shape is a new table.

**(2) The client may Accept or Reject a row directly from a dashboard's row table.** The walk found the client's two decisions only under "What it holds → Open" (defect 7). A dashboard's row table now carries Accept and Reject on each row awaiting a decision, **shown only to the side that decides** — the people the opened table already offers them to, by the same check; everyone else sees the row as before. **A rejection still requires a reason** (the first addendum's ruling 4): Reject asks why before anything is recorded, exactly as it does in the opened table.

**(3) A rejected return reaches its contractor through their home "waiting on you" work queue (T-467).** The walk found nothing told the contractor (defect 8). The item says it in words — *"Your October return was rejected — correct it"* — carries the client's reason, and is one click from the form. It is shown to the people who may correct the row, by the work queue's own rule that a person who could not do the thing by hand is not told it is waiting, and it leaves the queue once the row is corrected or withdrawn. **No new notification event is added:** the 2026-09-06 decision not to add an app notification stands, and [ADR-0049](0049-notifications-and-the-promotion-gate.md) is not amended.

**(4) Rejected and replaced rows never count.** A dashboard's totals, counts and charts, and a run's written analysis, leave out every row the client rejected and every row a later row replaced — a correction, or a newer import of the spreadsheet a table is fed from ([ADR-0059](0059-the-file-source.md) §1). **Rows awaiting a decision do count**, because they are the best figure there is so far, and the line says how many: *"includes 3 not yet accepted"*. The walk found the opposite: the analysis totalled a return the client had just rejected (defect 9), and the recheck found that a corrected rejected return would be counted twice. A person can still read every row and its state; this ruling is about what is added up, not about what may be seen.

*How these were ruled:* Claude's recommendation on each, put to the owner in plain terms on 2026-10-25 with the walk's shots ([t446.md](../../walks/t446.md)) and the recheck's findings; the owner chose all four. **Owner-ruled 2026-10-25.** T-489 builds them; the walk's other defects are T-487 and T-488.

**Context:** The 2026-09-04 exploration settled *where* an app lives and *whose*
its data is, and handed five mechanical items to a design session. Two of
them — the third kind of project thing, and the app acting as its viewer —
are this ADR; one (connections) is ADR-0057; one is a clause on ADR-0011; and
one (playbooks) arrived as Claude's proposal, never ruled, and is ruled here
(§10). The research behind the exploration found that every app-builder
incident of the last five years came from access rules written into the app
rather than enforced by the data platform, or from a saved connection
reusable beyond its app, or from governance done by inventory afterwards.
Infora already has the three things those incidents lacked — one access
gateway, the wall as structure, a closed registry of capabilities — so the
design question was never how to sandbox code. It was what an app's own data
is relative to the stores, and who an app *is* when it reads.

**Decision:**

**1. An app is a project thing with a participant scope.** An **app instance**
lives in exactly one project, like a sandbox, and carries a **participant
scope on the ADR-0036 ladder** — a set of organisations, one organisation, a
team, or named people — initial at creation and live-mutable and revocable
after it. A sandbox is something an app may *connect to* (§9), never where it
lives. An app has one **owner**, a person on the project, whose entitlements
its scheduled runs use (§5), and a creator, recorded. The workspace is where
**playbooks** live (§10), never instances.

**2. App tables are a third kind of project record.** An app **declares its
tables** — name, columns, column types — as part of its definition, and their
rows live in the project. They are shaped like library records, not like
sandbox content: **every row is stamped with the organisation whose person
entered it and with that person**, and **a row is read by its entering
organisation and by the project owner organisation, within the app's
participant scope, and by nobody else** unless the owner shares the table
(§6). No setting an app's builder can make widens that. *(Narrowed 2026-09-06, the addendum's ruling 3: a row in `draft` state is read by its entering organisation only; the owner reads it from `submitted` onward.)* Edits keep the
previous version of a row, on the platform's standing append-only discipline,
so an insight computed last March still explains itself. *(Widened 2026-10-25, the fifth addendum's ruling 1: a column may be added to a declared table on the working copy, reaching the app's people at the next publish; no column is removed or retyped.)*

**2a. The acceptance step is the builder's choice, per table.** A table may
carry a **submission flow** — draft, submitted, accepted or rejected, with a
correction as a new row that supersedes the old — or none. *(Owner, 2026-09-05:
"the acceptance point is important if the app is holding contractual data —
the user when building the app should be able to configure this.")* A returns
table whose accepted figure is a payment trigger or discharges a planning
condition has one; a firm's private land register need not. **The moment of
acceptance is the moment a row changes hands**: until then it is the
submitting organisation's own material; on acceptance it becomes the **project
owner's record**, retained exactly as accepted review-cycle metadata is
retained under ADR-0050 §8. An accepted row is never edited or deleted in
place. A table with no acceptance step never changes hands. *(Added 2026-09-06, the addendum's ruling 4: a rejection carries a required reason, read by the submitting organisation on the row.)* *(Narrowed 2026-09-07, the second addendum's ruling 1: a submitted row is frozen — no edit and no retire — until it is accepted or rejected.)* *(Added 2026-10-25, the fifth addendum: the client decides from the dashboard as well as the opened table; a rejected row reaches its organisation through the home work queue; and rejected and replaced rows never count in a dashboard's figures or a run's analysis.)*

**2b. The builder's agent must ask.** *(Owner, 2026-09-05: "the app builder /
agent needs to be able to guide the user through this and ask/prompt the user
to think about these things.")* Whether a table holds contractual data, who
may open each interface, and what a run may touch are choices the builder is
**walked through**, not settings to be found. This is a design duty on the
builder, carried by its ticket.

**3. A run's insight is itself a row.** The app's agent produces a **static
insight per run** (Session X ruling 7), kept as a record with its date,
trigger, rows covered and definitions version. That record is a row in a
declared insights table, **stamped with the organisation of the person whose
entitlements the run used** — so it is read by that organisation and the
owner, and reaches anyone else only when a person issues it (§8). A chat over
the same data is an addition whose answers are not part of the record.

**4. The app has no identity of its own: it acts as whoever is looking at
it.** Every read and write an app makes goes through the one access gateway
(ADR-0025, ADR-0053 §8) **as the viewing person**, so an app cannot show
anyone a row they could not already reach. A builder's choices about what an
interface shows **can only narrow** what a viewer could see, never widen it.
This is what makes one app behave as two — the client's engineer sees every
contractor's figures, a contractor's site manager sees only their own — at no
cost: it is the rule that already governs Ask and the library.

**5. A scheduled run acts as its owner, narrowed to what the app declared.**
Apps are schedulable (Session X ruling 8). A run with nobody looking acts
under the **app owner's** entitlements and may touch **only the tables and
connections the app's definition names**. It **stops** the moment the owner
loses the entitlement, the project, or the right to build; the project owner
is told and reassigns the instance or closes it — ruling 10's reassign-or-die
applied to schedules. *(Owner-ruled 2026-09-06: there is no notification —
an ownerless app is instead **marked defunct in the project**, visibly not
working, until someone reassigns or closes it. A broken thing that says so
on its face, rather than a message in a tray.)* **Never more than its owner**: an app with standing
powers of its own is a shared service account by another name — a set of
permissions nobody personally holds, doing things nobody personally did. If a run needs rows its owner cannot see, either a person
who can see them owns the app, or the owner shares the table (§6). Outside
systems are reached through a dedicated integration credential, never a
person's login (ADR-0057). **This closes `Q-051`.**

**6. The project owner may share an app table with a named organisation.**
All rows, as a deliberate, audited, revocable act — the shape of the owner's
library share (ADR-0016, ADR-0035), applied rather than invented. A shared
table still never reaches a third organisation. This is how a consultancy's
app reads every contractor's rows on a project the consultancy does not own;
the alternative — the client must own the app — was declined because it
takes the firm out of the seat that runs its own playbook. Revoking the share
narrows the consultancy's next run to its own rows; insights already produced
stay as they were. *A consultancy therefore cannot promise in its playbook
that its dashboard will work on a client's project; it can only ask —
which is the honest position, since the client's data was never the
consultancy's to promise.*

**7. When an organisation leaves the project, its rows split by whose material
they are — closing `Q-052`.** The playbook leaves with the firm; it was never
in the project. **Accepted rows are the owner's record and stay**, readable by
the owner as before, which is what keeps a contractor's accepted returns safe
when the consultancy that built the app departs. **Unaccepted rows are the
departing organisation's own material**: they stay in the project, invisible
to the owner except through the same audited override the sandbox uses
(ADR-0018, ADR-0036 §4), and the departing organisation may require their
deletion under ADR-0050 §6 exactly as it may for its sandbox files, or take an
export of them on the way out on the same footing as any export — only the
rows it could see. **The instance needs a living owner**: losing project
membership is the same event as losing the right to build, so the project
owner is told and either reassigns the instance to one of its own people or
closes it. A closed app keeps its tables readable under the rules above.
Nothing runs on a departed person's entitlements for a minute. The three
candidate answers Q-052 arrived with were all declined: *the sandbox rule
exactly* strands the client's accepted evidence behind an override; *export
and remove* lets a departing firm walk out with rows the client relies on;
*remove outright* destroys both.

**8. An export is a file, and its stamp is provenance, not authorship.**
Session X ruling 9 stands whole: the app produces, a person issues; an export
is a file (Excel, Word) with no "agent drafted" marking, edited, checked and
put through the normal review cycles; it carries only the data the exporting
person may access. The companion constraint recorded with ADR-0021's addendum
is made precise here: **the export's provenance stamp records what data
generated it and when — never the producer.** A stamp naming the app's agent
as author would drift into the label the owner declined.

**9. What an app is not: a grounding source.** App tables are outside the
agent's reach for drafting, creation and Ask (Session X ruling 7); app data
reaches drafting only by being filed into the record through its normal
doors, never sideways into a drafting call (the register's constraint, now
here). An app reading a sandbox file its viewer can already open, and
computing over it, is **not grounding** — ADR-0011's 2026-09-06 addendum
carries the sentence. The one later door, designed when it is wanted:
attaching an app table to a **single** Ask question, never automatic, never a
standing feed.

**10. A playbook carries structure and the firm's own reference data, never
anything entered in a project.** A playbook is the **"dumb" template** of an
app — in the owner's words, the finished definition of its steps: *"defining
data connections, defining the interface, how often it runs, any analysis or
prompts given to an agent as part of it running … something with no
connections or client data, but the hard work of defining the steps etc has
been done."* It lives in the firm's workspace, org-private, never visible
across the wall. **Deploying it copies the definition into the project** —
the tables' shapes, the interfaces and who may open them, the per-table
acceptance choice, the schedule, the insight definitions, and the
*requirements* for connections — and copies **no rows, no connections, no
credentials**. The instance names the playbook version it came from; updating
the playbook never changes a deployed instance, because a firm must not be
able to change what runs inside a client's project without anyone there
seeing it. **The reverse path exists**: an app built from scratch inside a
client's project may be saved back to the firm's workspace as a template, and
**the platform strips every project-entered row on the way**. *The rule, corrected to the owner's meaning
(2026-09-06, on the co-captain's veto pass):* **a playbook carries structure
and never rows — of any origin.** The recorded "softening" (firm-authored
reference rows riding a playbook) had no read-back behind it, and when put
back to the owner the answer was: *"by reference tables i meant the database
structure for an app — not the content from within it."* So **"structure"
explicitly includes a reference table's definition** — its name, its
columns, its kind — and a deployed instance starts every table empty; the
deploying firm loads its own lookup rows (emission factors, review
categories) into the fresh instance, a small cost the owner's cleaner wall
rule accepts. The line is **no rows travel in a template**, full stop. This
is Q-014's wall-through-the-definition test made mechanical; the firm's
judgement travels as shape, the content never does.

**11. Generated code runs in the browser; Infora's own parts run the engine.**
The builder's agent writes **screens** that run in the viewer's browser and
call Infora's API as the viewer, holding no secret and reaching no outside
system. Anything needing the server — the scheduled insight, a pull from an
outside system, the export — is done by Infora's **built** parts, which the
builder *configures* through the stepped flow and never writes. The worst
case of bad generated code is a broken screen for one viewer. *(Added 2026-09-06, the addendum's ruling 2: the definition has a working copy the builder edits and a published copy the app's people open and a schedule runs against; publishing is a recorded act.)* (The
alternative, generated code on Infora's servers, is the lane every managed
platform wraps in its own runtime rules; it is not taken now and is not ruled
out.) *(Narrowed 2026-10-19, the fourth addendum: for V1 what the browser runs
is a block description from the closed grammar, not code; code-built apps wait
on the sealed box of `Q-056`.)* *(Widened by one field 2026-10-25, the fifth addendum's ruling 1: a chart may group by the organisation that entered each row.)* Because the substrate — tables, scope, runs, insights, export — must
exist before the builder can produce anything, it is built as the builder's
first tickets, and **Infora's own pre-built apps** (Session X ruling 1's first
layer) arrive afterwards as **supplied templates on the same shelf as a
firm's own**.

**12. Each organisation decides who among its own people may build** (Session
X ruling 10, restated because §5 and §7 depend on it). Widening can reverse;
an app whose builder loses the right is reassigned or dies, never left running
ownerless.

**13. What this record assumes, to be re-checked at build.** (a) Password
login and per-project participants as the only identities — Entra changes
nothing above but changes who "the owner" resolves to at a firm. (b) No object
store: export lands wherever `file_ref` points on the day; ADR-0047 §3 makes
that S3 once deployed. (c) No secrets store, which is why ADR-0057's build is
deferred to deployment and no connection is built locally. (d) No always-on
scheduler: runs are triggered by hand until a server stays on; the schedule is
stored from the first ticket and honoured when a clock exists. (e) The Tools
surface as built by T-334–T-336 and Slice Tools 2 — the app builder is a
fourth tool on it.

*Re-checked against the build, 2026-10-26 (T-447). In plain terms: of the five
things this record assumed would be true when it was built, four still are and
one is not. **(a) holds** — password login and per-project participants are the
only identities; sign-in moving to Entra is still future. **(b) holds** — no
object store exists in the code; export and file-source files still sit where
`file_ref` points locally. **(c) holds** — no secrets store, so no connection is
built, as ruled. **(d) holds** — nothing runs on a clock; a run is started by a
person, and the schedule is stored and labelled as such on the screen. **(e) no
longer holds** — apps are not a tool: ADR-0058 (2026-10-18) took them off the
Tools surface and gave them an Apps section of their own, beside Tools in the
project's menu, and the workspace's shelf of kept templates is its own section
too. The "fourth tool" sentence above, and the matching sentence in
Consequences below, record the assumption as it was made and are superseded by
that ruling.*

**Considered and not taken.** *The client must own every cross-organisation
app* (§6). *A departing firm's instance follows the sandbox rule exactly,
or is exported and removed, or removed outright* (§7). *A playbook with no
rows of any kind* (§10). *Generated code on the server* (§11). *Code-written app screens at all, for V1* (the fourth addendum, 2026-10-19 — a later direction behind `Q-056`'s box, not a refusal). *A chat that fills the builder's steps in, instead of steps with an agent beside them* (the 2026-09-06 addendum, ruling 6). *(Taken after all, 2026-10-18 — the third addendum reverses ruling 6, re-housing its reason in a server-side publish gate.)* *A pre-built returns app hand-built by Infora before the builder* — Claude's recommended
first step; the owner chose the builder first, and tests it by building the
returns app in it. And, from Session X, still declined: a labelled
agent-drafted narrative in the export; a declared "system" tier; the creator
choosing where data is stored.

**Consequences:** A ninth drawer is drawn in [data-model.md](../../build/data-model.md)
— apps, scope grants, tables, rows, shares, runs, exports and playbooks — before
any migration is written. The access gateway gains a new subject kind whose
predicate is *entering organisation or owner, within scope, or shared*, and
nothing else. The privacy programme's deletion rule reaches app rows with no
new clause: whose material it is decides, and acceptance is where that
changes. The Tools surface gains its fourth tool *(superseded 2026-10-18 by
ADR-0058: apps have an Apps section of their own, not a place on Tools)* and
the workspace gains a playbook shelf. Five glossary terms land in `CONTEXT.md` (app, app table,
scope of an app, playbook, connection). **Personal data:** app rows will hold
data about named people — a land register's landowners and negotiation notes —
and every row names the person who entered it and, where there is an
acceptance step, who decided it; the register carries the row, and the
deletion path is the app's own: a row by its organisation, the table with the
app, an accepted row with the owner's record.
