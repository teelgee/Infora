# Document management - user stories

Two end-to-end journeys built from the document management ADRs (0001-0012), using a Routewide EIA Scoping Method Statement for Land Quality as the worked example. The first follows the consultant who produces it; the second follows the client lead reviewer who reviews and accepts it. Both run on a project in record configuration, where Infora holds the controlled record.

---

## The consultant: producing and getting a chapter accepted

*As an environmental consultant at the appointed consultancy, I want to draft my Land Quality chapter, put it through review, and resolve the client's comments, so that the chapter is accepted as a controlled deliverable without me ever maintaining a separate review spreadsheet or chasing a document controller.*

When the project was set up, the team agreed the schedule of deliverables, and my Land Quality chapter already exists as a row in the deliverable plan. Its reference was generated from the project's naming rules the moment the row was created, its reviewers are named on it, and its status reads not-yet-produced. I did not have to invent a name or decide who reviews it; that was settled in the plan.

I draft in the sandbox. As I write in Word, the drafting assistant grounds on the project library, the curated set of accepted material the owner trusts, so the text it helps me produce is anchored to the project's real positions, not to whatever half-finished files happen to be lying around. My messy working drafts stay in the sandbox and never leak into anyone's answers.

When the chapter is ready, I drop it into the container that has been waiting for it and promote it. Promotion is almost nothing for me: the metadata and the reference came from the plan, so I am not typing any of that. Infora freezes my draft as an immutable version one, generates the PDF that will be reviewed, and keeps my native Word file in the same container as the source I still own. Promoting opens the review round and notifies the reviewers. From here I see nothing of their review while it is open; that is deliberate.

Some time later the lead reviewer closes the round and the comment set comes to me, and now several of us on the consultant side can work it. I open the live review record, a table where every comment sits against the exact place in my version-one PDF that it refers to, with its code. I work the comments back in the sandbox and prepare version two. For each comment I write a response, and I cannot mark it addressed without pointing at the specific change in the version-two PDF that answers it; the only way out is to say explicitly that no change was made and why. Where my draft had already moved on, I reconcile the rejected points into it by hand rather than letting anything merge silently.

I promote version two, which opens a fresh round, and we repeat until the lead reviewer applies an accepting code. At that point the work item closes, the accepted version becomes the controlled record, and it enters the project library automatically, so from now on it is part of what the project treats as true.

*Decisions exercised: deliverable plan and planned containers (0008); project library grounding (0011); immutable versions, one in flight, conscious reconciliation (0002); PDF review with native source retained and mandatory response links (0004); phased DRR access with no live consultant visibility (0007); anchors carried into the DRR (0006); the assurance cycle and acceptance closing the work item (0005); record configuration (0001).*

---

## The client lead reviewer: running review and accepting

*As the client's lead reviewer for this chapter, I want my reviewers to mark up the document where they read it, moderate their comments into one position, and decide when it is good enough to accept, so that the review is faster and clearer than an emailed spreadsheet and I stay in control of the contractual decision.*

I was named as lead reviewer on this chapter when the deliverable plan was built, so when the consultant promotes version one I am notified that it is ready for review. My reviewers and I are the review group; some of us sit in different organisations on the project, which is fine.

I open the version-one PDF in Infora's viewer. My reviewers comment by highlighting the text they mean or dropping a point on the page, and each comment lands in one shared review record that all of us in the group can see as it is written. There is no assembling of separate spreadsheets and no guessing what "page three, paragraph four" refers to, because every comment is pinned to the place it came from. Each reviewer codes their comment on our project's scheme, where a blocking code means it must be addressed before we accept.

I moderate in the open. I can edit or amend my reviewers' comments and their codes, resolve duplicates, and shape the group's position before any of it goes back. There is a target date on the round that chases people with reminders and flags it overdue if it slips, but nothing closes the round on a clock. I decide when review is complete. When it is, I set the one authoritative code for the deliverable; the system suggests it from the comment codes, but mine is the one that counts. Closing the round issues the record to the consultant; only then do they see it.

When version two comes back, I do not go hunting for what changed. The consultant's response sits beside each of my comments in the same record, and clicking a response jumps me straight to the highlighted change in the version-two PDF. My reviewers approve the responses they are satisfied with, keep open the ones they are not, and raise new comments on version two where they need to. When the chapter meets the standard we are paying for, I apply an accepting code, the deliverable is accepted and the work item closes, and the accepted version passes into the project library as trusted project knowledge.

*Decisions exercised: review group appointed in the plan (0008); cross-organisation, live, shared DRR scoped to the review group (0007); in-PDF anchored comments (0004, 0006); two-level configurable acceptance coding with the lead reviewer authoritative (0003); human-closed rounds with the review period as a guide (0005); one live DRR with response links and internal snapshots on issue (0009); transmittal as an event record (0010); accepted version auto-admitted to the library (0011).*
