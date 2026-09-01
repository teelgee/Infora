# ADR-0055 - A deliverable reaches a party with **no Infora account** as a **third transmittal kind** issued from the library: a **recipient record** (name and email, never an Organisation and never a Participant), an **expiring link to one named version**, a **reason** and a **message** the sender writes, a **standard message** the owner organisation may set, and a **project setting deciding who may issue** — with everyone below that line **requesting** and someone above it approving

*In plain terms:* a scheme has to send finished documents to people who will
never have an Infora login — a landowner whose field the route crosses, a
consultation respondent, a supplier engaged for one piece of work. Today there
is no way at all: Infora issues documents to organisations already on the
project, and anyone with no place on the project sees nothing. So the consultant
attaches the file to an email, and the record of what went to whom lives in
somebody's sent items.

This adds the missing path, and it lives in the **project library** beside the
document rather than in a tool of its own. You pick the deliverable, choose to
issue it outside the project, and give three things: the email address, the
**reason** you are sending it, and the **message** that goes in the email. The
recipient gets a link. They see that one document and nothing else — no
project, no other documents, no list of people. The client's senior person can
set a **standard message** that goes on every external email the project sends.
And the project owner decides who is allowed to issue these at all: anyone on
the project, any firm's senior person, or only the client's own senior people.
Anybody below that line can still **request** a send; somebody above it
approves it.

**Status:** Accepted (owner-ruled 2026-09-01, the Knowledge session — ruled
there for scheduling reasons rather than design adjacency, which the session
recorded when the owner challenged it). **Closes `Q-040`**, the last V1
capability whose shape was open. Extends
**[ADR-0035](0035-non-review-transmittal-and-intra-org-deliverable-visibility.md)**
§1's transmittal record with a third `kind` and reopens nothing in it.
References **ADR-0010** (a transmittal is an audited event record), **ADR-0013**
(supersede and withdraw as record states), **ADR-0016** (library visibility is
per organisation and default-deny), **ADR-0018** (the default-deny wall),
**ADR-0033** (whole-project configuration is the owner organisation's super
user), **ADR-0046** §8 and **T-371** (the same precedent), **ADR-0049**
(notifications), and **ADR-0050** (deletion and the privacy programme).
Decided against [v1.md](../../build/v1.md), which brought this capability
**into** pilot scope. **First personal-data entry for a person with no
account** — registered in [personal-data.md](../personal-data.md).

**Context:** `Q-040` was raised by the owner on 2026-08-17 and sat open because
every existing path assumed a Membership. ADR-0035 issues to an *organisation*
holding one; ADR-0016's default-deny means no Membership is no visibility at
all. The tracker carried a recommendation — a third transmittal kind, a
recipient record, an expiring link, no acknowledgement gate — and the owner
ruled it with three additions the recommendation did not have: the door is in
the **library**, the sender writes a **message**, and **who may issue is
project configuration**.

*The recommendation the owner reversed and then restored.* The session put the
attachment reading back to the owner after their first answer described an
email with the file attached, naming the consequence plainly: an attachment has
nothing to expire and no record of whether it was opened. The owner reversed it
in the next turn — *"It should be a link, not an attachment"* — so the link is
ruled rather than assumed, with the reasoning visible.

**Decision:**

**1. It is a third transmittal kind, not a second issue event.** ADR-0035 §1
already keeps one table with a `kind` discriminator (`review` | `non_review`);
this adds `external`. The audited facts are identical in all three — sender,
deliverable, version, purpose, date — and forking the record would cost the
single place *"who has this been issued to?"* is answerable, which is the whole
value of the transmittal record. The CHECK that keeps `round_id` and
`direction` null for the non-review kind extends to this one: no round, no edit
lock, no snapshot, no path by which an external issue can touch a review cycle.

**2. The door is in the project library**, on the deliverable — not a tool, and
not a new rail item. Issuing a document is something you do to a document you
are already looking at, and the library is where a promoted deliverable is
looked at. A tool would make the user find the document twice.

**3. The recipient is a recipient record: a name and an email address.** Never
an Organisation, never a Participant, never a Membership. **No clause of the
wall changes and none needs to** — there is no access grant to resolve, because
the link is the access. A recipient reaches **one named version of one
document** and nothing else: no project, no roster, no library, no sandbox.

**4. The link serves one named version and expires.** Not the file as an
attachment: an attachment cannot be withdrawn, cannot expire, and leaves the
platform with no way to say what was served. **A later version does not kill an
issued link** — an issued document is a snapshot of what was sent on the day,
which is the ISO 19650 position and is what ADR-0013's supersede-as-state
already says about the record.

**5. There is no acknowledgement gate, and the download is the receipt.**
ADR-0035's organisation-level gate exists because a receiving *organisation*
must formally accept a document before working from it. A landowner will not
click a confirmation, and chasing one is support work that produces nothing:
the recorded fact is that the link was issued, and that it was opened if it was.

**Stated plainly because Infora is now the thing producing the record:** there
is no account, so there is no identity — anyone holding the link is the
recipient. *"Issued to Mrs Patel"* means *sent to an address someone typed, and
opened by someone*. That is exactly as strong as the emailed attachment it
replaces and **no stronger**, and the record must not read as though it were.
The owner was shown this and it stands as the ruled position.

**6. The sender writes the message; the owner organisation may set a standard
one.** Three things the sender supplies: the recipient's email address, the
**reason** for sending, and the **message** that accompanies the link. Separately,
the **owner organisation's super user may define a standard message carried on
every external email from the project** — the same whole-project configuration
tier as `conflict_attestation_required` (ADR-0046 §8) and
`review_period_default_days` (T-371), applied rather than invented.

**7. The project owner sets who may issue, in three levels, and everyone below
the line requests.** The owner organisation's super user chooses:

- **any member of any organisation** on the project;
- **any super user of any organisation** on the project;
- **only super users of the project-owning organisation**.

Anyone below the chosen line does not simply lose the door: they **submit a
request** carrying every fact the issue needs — deliverable, version, recipient,
reason, message — and someone above the line approves or declines it. On the
strictest level a consultant's request is approved by the client, which is the
control the owner described first and is the point of that level existing. The
session's own recommendation — that the approver be the **sending** firm's own
super user — is **superseded** by this ruling.

**The tool set is assembled, never filtered** (T-269's rule, and ADR-0053 §8's):
a person who may not issue sees the **request** action, not a disabled issue
button — and a person who may issue never sees a request queue that is empty by
construction.

**8. The producing side sees that an external issue occurred.** ADR-0035's
addendum already shows a producing organisation that issues *happened* without
the recipient list; that treatment carries over unchanged rather than being
re-argued here. What the owner organisation reads is the transmittal log, which
is the answer to the session's stress test about a client wanting sight of what
leaves the scheme.

**9. Personal data, and it is a first.** The recipient's **name, email address,
the reason, and the message** are the first time Infora stores data about a
person who **has no account and never consented to anything** — closest
precedent is the PDF-extraction row in the register, where a corpus of
correspondence names members of the public. All four are typed by a person.
They are the **project owner's own material**, deleted on request in use and at
exit (ADR-0050 §6), with the transmittal event itself retained on the same
footing as every other issue record. **Registered in
[personal-data.md](../personal-data.md) at ruling** — the row landed with this
ADR; the commit that builds the store keeps it true rather than adding it
*(phrasing corrected in review 2026-09-01: the original said "in the commit
that builds it", contradicting this ADR's own Status line and the register)*.

**Consequences:** `Q-040` closes, and with it the last open shape in V1's
scope. **Slice External Issue, T-431–T-432.** The transmittal table gains a
third `kind` and a recipient record; a **migration is required** and is drawn in
[data-model.md](../../build/data-model.md) before it is written. Two new
whole-project settings join the owner-super-user tier (the standard message,
and who may issue). **The wall is untouched** — no Membership, no Participant,
no grant — which is the property that made this rulable without reopening
ADR-0016 or ADR-0018. ADR-0049's notification set gains nothing: a request
awaiting approval is a queue on the surface, not a tray event, and the pilot set
stays as ruled.

**Considered and not taken.** *A second issue-event record, separate from
transmittals* — it would fork the one place "who was this issued to" is
answered. *Emailing the file as an attachment* — described by the owner first
and reversed by them the same session, once the consequences were named: nothing
to expire, no record of a download, and no way to serve one named version.
*An acknowledgement gate on the recipient* — ADR-0035's organisation gate
misapplied to a person with no account and no reason to click. *Retracting
issued links on supersede* — contradicts ADR-0013 and the ISO 19650 position
that an issued document is a snapshot. *The sending firm's own super user as
the approver* — the session's recommendation, superseded by decision 7.
*Creating a lightweight Organisation or Participant for the recipient* — it
would put a person with no account inside the access model, where every
default-deny rule would then have to say something about them.

**Open — not decided here.** **Whether a recipient may be sent a later version**
of a document they already hold, and whether that is a second issue or a
re-issue of the same one. **What the client sees of external issues across the
whole scheme** beyond the transmittal log — raised as a stress test, answered
with the log, and untested against a real consultation programme.
