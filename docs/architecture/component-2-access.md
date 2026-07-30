# Access model (component 2)

> **Drawn:** [access-and-channels.html](access-and-channels.html) — two client projects, two supplier organisations, and what each reaches per environment across the three channels. The one-page version of everything below.

The access model resolves who can see and do what across organisations, workspaces, projects, programmes, roles and ethical walls. It sits below every surface and runs before any data is touched; no other component resolves its own permissions. In the app architecture it is the access layer through which every request passes.

Infora is a network, not a hierarchy. An organisation acts through its workspace and works across many projects, owning some and joining others. Each project has exactly one owner organisation and other organisations as members; a programme groups projects under one owner and gives a portfolio view. Owner is a per-project role a client or a consultant can hold; ownership transfer is possible in principle but is not designed for.

Access has two levels. The organisation is level one: its Membership sets the ceiling of what the firm may touch on the project. The user is level two: a Participant is a user with project access, and a Participant grant is access-bearing, gating what the user may see and do rather than acting as a label. A user-level grant only ever narrows within the organisation's ceiling. It can never reveal a deliverable the owner has not shared with the organisation, and it can never pierce an ethical wall the organisation is outside. The organisation boundary always binds, so no wall can be punched through one user at a time (ADR-0015).

Standing roles collapse to owner and member (ADR-0016). Every member shares one baseline: promote deliverables, start review cycles, work in shared sandboxes, and read the deliverables it authored or the owner has shared with it. The owner is the one member that also controls project settings and the library. Contributor and viewer are retired; the differences between members come only from per-deliverable grants.

Library visibility is default-deny, decided per deliverable, per organisation (ADR-0016, ADR-0011). A deliverable is visible only to the owner organisation, its authoring organisation, and organisations the owner has shared it with. The library may be presented flat or foldered per project configuration (refined 2026-07-06), but folders are never access objects — there are no sections to grant against, so the only access objects are the deliverable (read, per organisation) and the in-review deliverable with its DRR (per person). The owner grants all cross-organisation sharing; absent a deliberate, audited share, only the owner and the author see a deliverable.

**The share, made an event and gated (2026-07-20, ADR-0035).** The owner's cross-organisation share is realised as a **non-review transmittal**: a first-class audited issue-event, not a silent visibility flip, and the general form of transmittal for a promoted library deliverable issued outside a review cycle (it carries no round, edit lock or DRR snapshot). Two conditions now sit on the share branch of deliverable visibility, both enforced as retrieval pre-filters, never post-filters (ADR-0035 §5), and both contained within the receiving organisation. First, an **organisation-level acknowledgement**: the receiving organisation must accept receipt once — at organisation grain, per version — before the deliverable is visible or groundable to anyone in it; who may fire it is the organisation's own **acknowledgement mode** (controller or open), the owner never reaching inside. Second, an optional **intra-organisation narrowing** to named Participants (per-participant grant, hand-set or driven by a standing rule keyed on the deliverable code), held by the receiving organisation's org admin or controller. The producer and owner branches are never gated. The cross-organisation audit story is unchanged — "who can see what across organisations" still reduces to the owner's transmittals — while the acknowledgement and narrowing add a trail that never crosses an organisation boundary.

Ethical walls are the standing posture, not a feature switched on (ADR-0018). Isolation is the default: an organisation sees only its own work, what the owner has shared, and the shared sandboxes it is in. A private floor is never shared, not even with the owner: an organisation's org context and its private sandbox. No grant can expose the private floor. The owner is the single point that opens any cross-organisation visibility, by sharing a deliverable or by adding an organisation to a shared sandbox. Within an open review round, comments are visible across the review group, the one live cross-organisation window. Competing organisations on one project therefore need no special wall: they do not see each other's work unless the owner shares it.

The producing and reviewing sides are appointed symmetrically (ADR-0017). A deliverable has a review group (reviewers and a lead reviewer) and an authoring team (authors and a lead author), both named on the deliverable plan and inherited when the review cycle launches. The named sets are defaults, not frozen: each side amends only its own set, at any time including mid-cycle. The owner amends the review group, because cross-organisation membership is the owner's domain; the lead author amends the authoring team, within the organisations that share the deliverable's sandbox. A membership change governs the current and future rounds only and never alters past rounds, whose comments and responses stay attributed and frozen.

DRR access is split into visibility and write rights (ADR-0014, refining ADR-0007). Every party with deliverable access sees every issued round permanently; only the currently open round is hidden from the consultant, until the lead reviewer issues it. A single edit lock decides who may write, and it alternates with the cycle, flipped by transmittal in both directions: the reviewers hold it while a round is open, the authoring team holds it once the round is issued, and it returns to the reviewers when the lead author promotes the next version. This rests on the one-open-round invariant, so the consultant always sees every round but the single open one.

**Administration and the roster (2026-07-18, ADR-0033).** The project roster — every Participant's name, organisation and project role — is visible to all Participants: the wall hides work, never presence, which is what lets reviewers, authors and assignees be picked from a list. An **org admin** (`org_role` on the user) manages the organisation's own users and enrols or removes them on projects the organisation is a member of — the owner opens the seat, each organisation staffs it. The access edges are auditable records: Membership carries ADR-0019's propose-then-confirm as a state with added-by and timestamps; a Participant is an interval (removal closes it, auto-revoking live grants from that moment) so attribution in past rounds survives departures. Appointments themselves are stored as append-only interval grant rows per deliverable, reviewer rows propose-then-confirm by the owner (see ADR-0033 and Drawer 5).

**An elevated admin/super-user tier is an open theme (2026-07-18).** The destructive, governance-level lifecycle actions — close-a-cycle-as-rejected (ADR-0032/0013), and owner supersede/withdraw — should not sit on the general surface for ordinary project roles. Whether these belong to the org admin above (extended from an enrolment power to a lifecycle one), to a project-scoped elevation of the owner, or to a new tier above both — and how that squares with ADR-0016's deliberate collapse of standing roles to owner and member — is unresolved. Tracked on the grill tracker (owner-feedback theme) and ticketed **T-133**; until then the ungated reject action is withheld from the surface.

Membership is flat and owner-approved (ADR-0019). Only the owner admits an organisation; a member may propose one, such as a contractor proposing its sub-consultant, but there is no nested membership and no organisation holds access on behalf of another. Sharing splits by location: work in progress is shared through shared sandboxes, while a promoted library deliverable is owner-controlled and only the owner can share it. Cross-organisation authoring happens in a shared sandbox, since sandbox membership is what lets an author see the work.

Access resolution is a first-class layer, not UI logic. Every other component consumes its decisions: document management, for instance, consumes the per-deliverable visibility, the DRR visibility and the edit lock rather than implementing its own.

---

## Sub-component register

The structural breakdown of the access-model component into its build-able parts. Five artefacts divide the labour and this register is one of them: `CONTEXT.md` is the **language** (the glossary); the [overview](infora-overview.md) is the **vision** and whole-system map; this component doc is the **structure** (the prose above and the register here); `docs/adr/` holds the **decisions** (why each fork went the way it did); and the [grill tracker](../grill-sessions/grill-questions.md) is the **process log and open-questions backlog**. The register references the others rather than restating them.

The cut is by **domain capability**: the distinct access questions the layer answers. A single resolution call may touch several at once.

**Cross-cutting, true of every capability below.** This component runs below every surface and before any data is touched; nothing above it resolves its own permissions. The hard invariant under everything: a user-level (Participant) grant is always a subset of the organisation's (Membership) ceiling, and no grant crosses an ethical wall the organisation is outside (ADR-0015). Every resolution and every grant change is written to the audit trail under the governance envelope (component 3), so the audit of who-can-see-what reduces to the owner's sharing actions plus each lead's appointments.

---

## 1. Organisation membership and roles

**Responsibility.** Hold the organisation-to-project edge; admit organisations to a project, flat and owner-approved (propose-then-confirm as a stored state); set the owner/member distinction and the shared member baseline; carry programme grouping under one owner.
**Governing ADRs.** 0015, 0016, 0019, 0033.
**Terms owned.** Membership, Project role, Owner, Member, Org admin.
**Depends on.** The network-with-single-owner model (the agreed top-level shape).

## 2. Participant access

**Responsibility.** Hold the user-to-resource edge; gate what each user may see and do; keep every Participant grant a subset of the organisation's ceiling and never a parallel system that outruns it.
**Governing ADRs.** 0015.
**Terms owned.** Participant.
**Depends on.** Organisation membership (the ceiling it narrows within).

## 3. Deliverable visibility and sharing

**Responsibility.** Resolve library visibility default-deny per deliverable per organisation; carry the owner's per-deliverable sharing (the non-review transmittal) as the only cross-organisation override; on the share branch, gate on the receiving organisation's per-version acknowledgement (organisation grain) and narrow to any per-participant grants present (participant grain), both as retrieval pre-filters; share work in progress by sandbox membership and the record only by the owner.
**Governing ADRs.** 0016, 0011, 0019, 0035.
**Terms owned.** Non-review transmittal, Share acknowledgement, Acknowledgement mode, Per-participant deliverable grant (with the standing routing rule). Resolves visibility of the Project library, owned by document management (component 5).
**Depends on.** Organisation membership; the project library (component 5); ethical walls; the transmittal event (component 5, §7).

## 4. Ethical walls

**Responsibility.** Enforce organisation isolation as the default posture; keep the private floor (org context and the private sandbox) invisible even to the owner; make owner sharing the only thing that opens cross-organisation visibility.
**Governing ADRs.** 0018.
**Terms owned.** Ethical wall.
**Depends on.** Deliverable visibility and sharing; the context component (component 4) for org context, which the wall keeps as a private floor.

## 5. Appointment of the authoring and review sides

**Responsibility.** Name the review group and the authoring team per deliverable as append-only interval grants on the container; the cycle reads the live sets (no copy at launch); reviewers propose-then-confirm — the producing organisation proposes from the visible roster, the owner confirms and maintains; let each lead amend only its own set at any time within owner-granted scope; keep past rounds frozen across any membership change (reconstructed from intervals).
**Governing ADRs.** 0017, 0008, 0016, 0015, 0033.
**Terms owned.** Author, Lead author, Authoring team, Reviewer, Lead reviewer, Review group.
**Depends on.** Deliverable plan (component 5, where both sides are named); organisation membership (the owner-granted scope each lead distributes within).

## 6. DRR access: visibility and the edit lock

**Responsibility.** Resolve permanent per-round DRR visibility with only the open round hidden from the consultant; hold the single edit lock and alternate it with the cycle, flipped by transmittal in both directions.
**Governing ADRs.** 0014, 0007.
**Terms owned.** Edit lock.
**Depends on.** The DRR and transmittal (component 5, which consume this); appointment (§5, which says who holds the lock at each phase); the one-open-round invariant (ADR-0002, ADR-0005).

---

## Deferred or handed to other components

- **Ownership transfer between organisations.** Possible in principle, not designed for.
- **Billing seats.** A Participant is distinct from a billing seat; the seat and licensing model is not part of access resolution.
- **Org context and project context internals.** Owned by the context component (component 4). The access model only enforces org context as a private floor and project context as shared by access; how either is assembled or grounded lives in component 4.

## Repository mapping

Access resolution is the cross-cutting access policy in the `governance` package, enforced at the API boundary so every surface inherits it. The data model carries access on two edges in the `db` package: an organisation-to-project edge (Membership) and a user-to-resource grant (Participant access), with the hard invariant that the second is always a subset of the first. See the overview's app-architecture diagram (the access layer) and the build layer's repo-structure.
