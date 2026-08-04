# ADR-0050 - The privacy programme: no standing human credential and a break-glass path that is disclosed on request; the conflict register protected procedurally and stated as such; deletion as two acts, bounded by *whose material it is* rather than by where it sits; and removal from the project library as the **owner organisation's** act on the producing organisation's request

**Status:** Accepted (owner-ruled 2026-08-03, the privacy design session). Closes **`Q-032`** (operator access) and **`Q-033`** (deletion in use and at contract end). Extends **ADR-0047**, which settled the infrastructure and deliberately reached neither. References **ADR-0018** (the private floor), **ADR-0046 §7** (the conflict register), **ADR-0026** (the egress boundary and Filter 1), **ADR-0016** (the project library is the owner's), **ADR-0013** (states, never deletion), **ADR-0002** (immutable revisions), **ADR-0024** (the colocated derived store), **ADR-0028** (the append-only record), **T-128** (soft delete with self-service restore), **T-247** (the two database roles), **T-253** (`unreconstructable`). Decided against **[personal-data.md](../../build/personal-data.md)** and **[operating-envelope.md](../../build/operating-envelope.md)**.

**Context:** A competitive review on 2026-08-01 found `DPIA`, `personal data`, `data subject`, `right to erasure`, `eyes off` and `human access` returning **zero hits** across `docs/`, while `GDPR` appeared only inside posture lists. The ethical wall between customers was architecturally strong and thoroughly argued; the wall between Infora and its customers was undocumented. [personal-data.md](../../build/personal-data.md) was the first half of the fix — a register of what is held. This ADR is the second half: what may be reached, and what may be removed.

Three findings shaped the session.

*First, ADR-0047 did not merely leave privacy open — it created the paths that make it urgent.* §9 runs migrations with the owner credential, which per T-247 is the one role RLS does not constrain; §18 loads the pilot corpus "as an operator action". Both are new, both are correct, and neither was governed.

*Second, this is on the pilot's critical path through somebody else's calendar.* ADR-0047 §18 makes the DPA with the pilot firm a precondition of loading the corpus, and a DPA is drafted from exactly these two positions. A design ruling can be made in an afternoon; a counterparty's legal review cannot.

*Third, the product has never been asked to erase anything.* `DELETE /sandbox-documents/:id` is a **soft** delete — `deletedAt` plus a self-service `undelete`, deliberately, because T-128's rule was that recovery is never a helpdesk ticket ([sandbox.ts:370](../../../apps/api/src/sandbox.ts#L370)). Nothing in the controlled library can be removed by anyone at all. So "delete" in Infora means *put in the bin*: the row stays, the text stays, and so do the derived passages the retrieval index is built from. The owner's direction that org superusers may delete in use is the first time the system has been asked for anything else.

---

## Part A — operator access

**1. Two roles, and conflating them is what makes the claim dishonest.** `Q-032`'s own recommendation was *"no human holds the credential, and every use is break-glass"*. The second clause is false as written: ADR-0047 §9 uses the owner credential on **every deploy**, which is routine and continuous. The honest cut is two distinct roles:

- **The pipeline role** — non-human, assumable only by GitHub Actions through OIDC federation, running migrations as a one-off task. It holds powerful rights, but **no interactive session with it is possible**; there is nothing for a person to type at.
- **The human break-glass role** — assumed by a named person, **time-bounded**, requiring a **stated reason**, with **CloudTrail as the out-of-band record** the assuming party cannot edit, and **no production data leaving the environment** (generalising §18's rule for the corpus load).

The claim this licenses, and the only one that survives its first question, is **"no human holds a standing credential to customer data."** Not *"no human can read it"*, which would be a lie, and not *"every use is break-glass"*, which the deploy pipeline falsifies.

**2. Disclosure is a right to ask, not a notification — and the reason is honesty, not cost.** The DPA carries a clause: *on request, Infora will report every occasion an Infora person accessed the customer's data, and why.* **Proactive per-event notification to an org admin is named as the destination, not adopted at V1.** ADR-0049 has already built the notification record it would ride on, so the objection is not plumbing: **the role checkout happens in AWS, outside the product**, so the application does not know it occurred. The faithful version is real infrastructure work; the cheap version is an engineer remembering to post a notice — an honour system wearing the costume of a control, which is **worse** than the right to ask, because a customer would reasonably read it as automatic.

*Claude's call on the residual:* the report is **one undifferentiated list**. Access the customer requested and access Infora initiated are distinguished by the **stated reason** on each entry, not by separate categories — a category is a place to park things, a reason is not.

**3. The conflict register is protected procedurally, and the gap is stated rather than papered over.** ADR-0046 §7 puts the register on ADR-0018's private floor: unreadable by a project owner, unreadable across the wall. A break-glass operator reads it regardless. It is the sharpest case in this ADR because of what it is — a stolen document exposes one project, whereas the register is a **map of the firm's whole book of business**, from which the engagements can be inferred. ADR-0046 says so itself.

**Application-level encryption was considered and rejected on a finding, not on cost.** The person who can read the database is the same person who controls the deployment, and can therefore reach whatever key material the application uses to decrypt. The only construction that genuinely holds requires the **customer** to hold a key Infora never has — at which point a lost key is a lost register, an operational burden no pilot firm will accept. Encryption here would buy the *appearance* of a structural guarantee over a procedural one, which is the precise failure this ADR exists to avoid elsewhere.

**The reduction that does work is minimisation.** `conflict_exclusions.reason` is nullable free text ([drawer1-parties.ts:196](../../../packages/db/src/schema/drawer1-parties.ts#L196)) and is the single field that turns "a person and two project ids" into a client roster. It **stays** — a compliance partner reviewing a two-year-old wall needs to know why it is there — with its purpose **narrowed on screen**: record the fact, not the client. One sentence of interface guidance is the difference between a useful note and a disclosure.

**The gap is stated plainly, on the ADR-0026 "determined authorised human" precedent:** the operator is **outside ADR-0018's private floor by policy and inside it by mechanism**. That sentence belongs in the DPA. A claim that survives being read aloud to an ethics partner is worth more than one that survives only until it is tested.

**4. There is no support access in V1, and the shape of any future one is ruled now, while it is still free.** Bugs are diagnosed from error reporting and conversation; where customer content genuinely must be seen, that is break-glass — logged, reasoned, reportable. Building an impersonation feature for a single pilot firm is work spent avoiding a video call.

**The standing rule, which is the load-bearing half:** any support-view capability Infora ever builds is **customer-initiated, time-bounded, self-expiring and visible to that customer in its own audit**. Operator-initiated impersonation is **forbidden**, with or without notice. The difference between the two is who holds the switch, and once the operator holds it no wording repairs it — *"we can watch you work, and we'll mention it"* is not a position a consultancy accepts about its clients' work. Ruling this now costs a paragraph; ruling it after a silent admin toggle ships costs the claim in decision 1.

---

## Part B — deletion

**5. Delete and Purge are two acts, not one.** **Delete** remains the bin: restorable, self-service, exactly as T-128 built it, because recovery-without-a-helpdesk-ticket is a product virtue being deliberately kept. **Purge** genuinely erases — including the **derived** stores, which is the half that makes it real — and is available to the org admin only, behind a typed confirmation, recorded as an act with a name against it. Before this, a firm saying "this must not exist" had no button that meant it, and "raise a ticket with the vendor" is the incumbent behaviour Infora exists to displace.

**6. What may be purged is decided by *whose material it is*, not by where it sits or how it arrived.** Two parties, two answers:

- **The member organisation (Org B)** may require **complete deletion of its own material, wherever it lives** — sandbox and personal-sandbox documents, org context, drafts, its own **Runs** (producer-private by the 2026-07-12 liability ruling), its Signals, its cost attribution, its conflict register. Everything except what has been promoted into the library.
- **The library owner (Org A)** **retains the deliverables and the review-cycle metadata, named individuals included.**

This **corrects two recommendations**, and both corrections matter more than the position they replace.

*It corrects `Q-033`'s three-zone sketch*, which drew the line between "working area" and "controlled record". The real line is **whose material it is**. The zones were a description of the outcome mistaken for its cause.

*It corrects this session's own proposal* to license purge by the **absence of a work item** — the marker V1 uses to distinguish loaded reference material from produced deliverables. The owner rejected it, correctly: **a stakeholder's report loaded into the project library is full corpus.** It grounds, it is cited, it is exactly what the library is for. That absence records *how a document arrived*, not *what it is worth*, and it earns no deletion rights.

**7. Removal from the project library is two steps, and the second is the owner organisation's.**

- **Withdraw** — already built and already sufficient as the first step. `containers.state = 'live'` is a **pre-filter inside the retrieval query** ([retrieval.ts:90](../../../packages/knowledge/src/retrieval.ts#L90)), in the same statement as the wall, so a withdrawn container **stops grounding the moment it is withdrawn**. No build.
- **Removal** — the **owner organisation** removes a withdrawn container from the library, **on request from the producing organisation** (whoever put it there; for loaded corpus, the firm that handed the folder over — the only party that knows it should not be there).

**Why the lever sits with the owner rather than the producer.** It is where the property already sits: ADR-0016 and ADR-0026's first filter both make the project library the owner's. And it forecloses the failure the alternative invites — a consultancy purging six months of corpus ahead of a dispute, leaving the produced record intact but **uncheckable**, every citation in every accepted deliverable resolving to nothing. Uncheckability is the one thing the grounding argument cannot survive, and no policy prevents it once the lever is in the producing firm's hand.

**Removal means erased, not delisted.** The row goes, and so do the derived copies — chunks and embeddings in the colocated index (ADR-0024) and **S3 object versions**, since versioning is on (ADR-0047 §3) and a delete writes a delete-marker rather than erasing. Delisting would buy nothing that withdraw has not already bought, and would leave another client's document sitting in the database of a project it should never have touched.

**The citing run stays, and does not lie.** T-253 already built the case: a passage that can no longer be reconstructed is reported as **`unreconstructable`**, not as a silent gap. So the audit row honestly reads *"I read something here and it can no longer be produced"* — neither erased nor false.

**One consequence is accepted rather than solved.** Remediating a wrong-client load now depends on **another organisation acting**, and the request itself discloses the document's presence to them. That is defensible — it is their library and they can already see it — but the response time on a confidentiality incident is set by somebody else's inbox, and the DPA is written against that.

**8. Contract end.** Three positions:

- **The hand-off** is the customer's documents as files in their folder structure, **plus the review record in readable form** — who authored, who reviewed, what verdict, when. Not a database dump, which is unusable and leaks the schema. Not files alone, which hands back the documents and discards the thing that made Infora worth buying: the evidence they were properly produced. **No export path exists today**; this is named as build work rather than discovered when a contract ends. It is **post-V1** — the DPA needs the clause, the feature is needed when a contract ends.
- **The lag is stated as a number**, because erasure is not instant and the contract must not imply it is: erased from live systems on exit, and aged out of the **14-day** point-in-time recovery window (ADR-0047 §4) and the backups within a fortnight after. A stated fortnight is honest; "immediately" is false the moment anyone checks.
- **Attribution inside the owner's record is retained and disclosed, never pseudonymised.** A sign-off is worth something *because a named person made it*; "a reviewer at Firm X accepted this" is evidence of nothing, and degrading the owner's record to protect a firm that chose to leave is the wrong party bearing the cost. The exit clause states it rather than hollowing the record out quietly.

---

**Consequences:** The DPA can be drafted — its two open clauses now have positions, and ADR-0047 §18's precondition for loading the corpus is one owner action away rather than one design session and one owner action away. [personal-data.md](../../build/personal-data.md)'s 🚧 `Q-033` cells resolve to real answers. [operating-envelope.md](../../build/operating-envelope.md)'s security floor gains a governed operator path where it previously named two open questions. The product gains a second deletion act it has never had, and the library gains a removal path it has never had — both narrow, both audited, both bounded by whose material is in question. Infora acquires a written position on its own access to customer data, which it did not have in any form on 2026-07-31.

**Considered and not taken.** *Application-level encryption of the conflict register* — rejected on the finding in decision 3, not on cost: the operator controls the deployment and therefore the key. *Proactive per-event break-glass notification at V1* — deferred in decision 2, because the achievable version is an honour system that reads as a control. *Operator-initiated support impersonation, even with notice* — forbidden in decision 4. *Purge licensed by the absence of a work item* — rejected in decision 6; loaded corpus is corpus. *A unilateral purge of library material by the producing organisation* — rejected in decision 7; it hands a firm the ability to make six months of signed-off deliverables uncheckable. *Pseudonymising attribution at exit* — rejected in decision 8; the name is the evidence. *A full database export as the hand-off* — rejected in decision 8 as unusable by the recipient.

**Open — not decided here.** The **controller / processor model** — whether Infora is controller or processor, and for whom — is raised as **`Q-035`** and blocks the DPA alongside these two, because a DPA is literally a controller–processor agreement and cannot be drafted around the question. It surfaced twice in this session and has no answer without a ruling: an individual reviewer at a departed firm asking for their name out of the owner's record cannot be answered by Infora alone. **Audit retention and export format** stay with `Q-015`, and the certification-evidence half of the export interacts with decision 8's hand-off. **Org admin reach into a personal sandbox** (`Q-024`) now interacts with purge, since decision 6 gives the org admin an act that reaches a user's private working area.
