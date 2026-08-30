# Infora — the parking lot

**Proposals that cannot be built without amending an accepted decision.**
Every entry here contradicts the decision record *by construction*. That is the
entry criterion, not a defect of the file.

---

## ⚠ Standing instruction — read this before anything below

**Do not open this file during a grill session or a build session unless the
owner has named it.** Not to check whether something is here, not for
background, not to see if a ticket is related. If a task appears to need an
entry, stop and ask.

**Nothing in this file is agreed.** It is not the decision record, not backlog,
not design, and not an open-questions list:

- **Never cite an entry as a reason.** `CONTEXT.md` is the vocabulary
  authority and `docs/architecture/adr/` is the decision record — cite those.
- **Never build against an entry.** No ticket derives from this file. A
  proposal becomes buildable only after a grill session amends the ADRs it
  breaks, at which point it leaves the lot.
- **Never treat an entry's *shape* as design.** The "shape as understood"
  section of each entry is a sketch from the conversation that raised it,
  recorded so the thinking is not lost. It is explicitly non-binding and has
  survived no adversarial pass.
- **Never let an entry soften an ADR.** An accepted decision is not weakened by
  something parked against it. Until an ADR is amended, the ADR is simply what
  is true.

The reason for the strictness is mechanical rather than procedural. An entry's
whole content is *a description of rules it would break*. An agent that reads
one mid-task and treats it as context will produce work that conflicts with both
the built system and the decision record, and — worse — will do so while
sounding well-informed. That failure is invisible in review, because the work
will cite a real file.

---

## What belongs here, and what does not

| It goes… | When |
|---|---|
| **Here** (`P-###`) | The thing cannot be built without **amending a named, accepted ADR or a load-bearing invariant**. The entry must say which. |
| [grill-questions.md](grill-questions.md) (`Q-###`) | A gap or contradiction **inside** the current model — something the design owes an answer to. Includes two accepted ADRs disagreeing with each other. |
| [../build/plan.md](../build/plan.md)'s deferred register | A capability that **fits** the model, decided in principle, not scheduled. Each names its gate. |
| An ADR's *Considered and not taken* | An alternative that was **weighed and rejected**. Closed, not parked. |

An entry that cannot name what it breaks is not a parked proposal — it is a
feature wish, and it belongs in the deferred register. **This is the whole
discriminator.** Applied loosely, the file becomes a junk drawer within a
month, and a junk drawer that shadows the ADRs is worse than no file at all.

---

## Conventions

**Numbering.** `P-###` — **Next free number: P-003.** Derive it, don't trust
this line: `pnpm run check:parking -- --next`. The guard
(`scripts/parking-rules.mjs`, the third configuration of the shared counter
engine) scans this file, [grill-history.md](grill-history.md) and `git log`,
and `pnpm run check` fails if a number is claimed twice or the line falls
behind. Bump it in the same commit that claims one. Numbers are three digits
(`P-001`, never `P-1`).

**Leaving the lot.** A proposal leaves by being **taken up** — an owner
decision to grill it. The session's record goes to
[grill-history.md](grill-history.md) with everything else, the ADRs it amends
are edited there and then, and the entry here becomes a **struck one-line
pointer** to that record. Same convention as the tracker's, and the guard
understands it.

**Also leaving the lot: being dropped.** An entry the owner rules against is
struck with a one-line reason and a date. A parking lot that only ever grows is
a parking lot nobody reads.

**Sweeping.** Read at the **start of a design session, by the owner's
instruction** — never automatically. An unswept lot rots quietly; an
auto-loaded one contaminates every session it touches. Both failures are real
and they pull in opposite directions, which is why the sweep is a deliberate
act with a named trigger rather than a habit.

**Every entry carries:** the need in **user terms** (the situation and what
someone would see on screen — the tracker's convention, and it keeps a proposal
honest about whether anyone actually wants it); **what it breaks**, with each
decision named and linked; **shape as understood**, marked non-binding; and
**what would make it live** — the trigger, without which entries have no exit
and accumulate forever.

---

## Index by amended decision

The reason this index exists, and the second job the file does: **pressure on a
decision should be visible.** One proposal wanting to amend an ADR is a
proposal. Three wanting to amend the same clause is evidence about the *ADR*,
not about the proposals — and without an index that signal accumulates
invisibly across months of separate conversations.

| Decision | Clause under pressure | Entries |
|---|---|---|
| [ADR-0036](../architecture/adr/0036-sandbox-participant-scope-model.md) | §2 — the sandbox is the access boundary; a document's reach *is* its sandbox's grant set | P-001 |
| [ADR-0016](../architecture/adr/0016-permission-model-flat-library-per-deliverable.md) | Standing roles collapse to owner and member; contributor and viewer are retired | P-001 |
| [ADR-0033](../architecture/adr/0033-per-org-plans-appointment-grants-administration.md) | The roster — the wall hides work, never presence | P-001 |

---

## Parked proposals

- **P-001 — Mirroring, and the external-collaborator tier.** *Raised
  2026-08-17 (owner, in conversation; not yet grilled).*

  **The need, in user terms.** A project team needs to work on live documents
  *with* a body that is not a project member and must not become one — a local
  authority, a statutory consultee, a landowner's agent. Today the only shapes
  available are a transmittal (issue a finished thing, one-way) or full
  membership (a consultant's seat, with the whole platform behind it). Neither
  fits: the team wants a handful of named documents open to that party, edited
  side by side in the browser, with the party seeing nothing else of the
  project and getting no AI, no tools and no library. **What the owner would
  see on screen:** a sandbox they own, into which they select documents from
  their own working sandbox; the third party opens that sandbox, sees only
  those documents, and edits them in Office for the web alongside the team.
  What the *third party* sees is a short list of documents and nothing else —
  no plan, no library, no other sandbox, no agent.

  **What it breaks.**
  - **[ADR-0036](../architecture/adr/0036-sandbox-participant-scope-model.md)
    §2 — the load-bearing one.** Access is sandbox-grain: a document's reach
    *is* its sandbox's grant set, and `canAccessSandbox`
    (`packages/governance/src/sandbox.ts`) states it in terms — *"there is no
    within-sandbox exclusion to express here."* A mirrored document is
    reachable through a sandbox that is not its `sandbox_id`, which makes reach
    a property of the **document** for the first time. Four call sites resolve
    reach by walking `document → sandbox_id → grants`
    (`apps/api/src/sandbox.ts`, `apps/api/src/attached.ts`,
    `apps/api/src/runs.ts`, `packages/knowledge/src/label-facts.ts`); all four
    funnel through the one predicate, so the amendment is tractable, but it is
    an amendment.
  - **[ADR-0016](../architecture/adr/0016-permission-model-flat-library-per-deliverable.md)
    — the owner/member collapse.** A party with strictly less than the member
    baseline is the retired viewer tier returning. The cheaper route is a
    capability profile beside `elevated`, on the
    [ADR-0040](../architecture/adr/0040-per-sandbox-super-user-settings.md)
    precedent (*"no new stored role"*) — but note the asymmetry: `elevated`
    *adds*, so forgetting to check it fails **closed**, while a restricting
    flag fails **open**, in favour of the least-trusted party on the project. A
    capability **allowlist** rather than a denylist is the shape that keeps the
    cheap route and still fails closed.
  - **[ADR-0033](../architecture/adr/0033-per-org-plans-appointment-grants-administration.md)
    and the `CONTEXT.md` roster rule** — *"the wall hides work, never presence:
    every Participant sees the project roster … which is what lets reviewers,
    authors and assignees be picked from a list."* A restricted party inside
    the project is in the roster, and therefore **appointable**: nothing stops
    a lead author naming a statutory consultee as a reviewer or an assignee.
    The exposure is not what the party can reach but what an ordinary user can
    hand them.
  - **[ADR-0038](../architecture/adr/0038-bound-unbound-working-documents-and-the-binding-transition.md)**
    (2026-08-09 addendum) — a bound document reads its plan row through "by
    construction", so a mirrored bound draft discloses the coded reference,
    title, discipline and appointments. Suppressing the read-through
    contradicts the addendum's own anti-drift argument. Adjacent to `Q-039`.
  - **[ADR-0017](../architecture/adr/0017-authoring-side-and-appointment-model.md)**
    — authorship eligibility follows sandbox membership, so a mirrored party is
    structurally eligible to author a formal deliverable, and its edits would
    enter an immutable Version on promotion. A professional-liability question,
    not a UI one.
  - **T-249 / label propagation** (`packages/governance/src/label.ts`) —
    `sandboxDocumentAudience` computes a document's audience from its one home
    sandbox, so it would return the home's grant set and **silently omit** the
    mirrored party. An answer grounded on material narrower than the mirror
    could be written into the document and read by the third party. This is
    finding F2 reopened, and it fails in the dangerous direction.
  - **[ADR-0043](../architecture/adr/0043-editing-and-coauthoring-substrate-wopi-host.md)**
    — the WOPI host gates bytes on `sandbox_scope_grants` and the collaboration
    space "inherits its grants". One file reachable through two grant sets has
    no rule for which gates the bytes. Also the sequencing fact: browser
    co-authoring, which is the *point* of this proposal, is CSPP-gated
    regardless.
  - **[ADR-0039](../architecture/adr/0039-multiplayer-document-collaboration.md)**
    — multiplayer and the shared Conversation scope to "the document's sandbox
    participant scope", singular.
  - **[ADR-0050](../architecture/adr/0050-the-privacy-programme-operator-access-and-deletion.md)
    and [personal-data.md](../architecture/personal-data.md)** — named individuals at
    the third party, and what Purge reaches when the engagement ends.

  **Shape as understood — non-binding, from the raising conversation.** Three
  framings were tried and two discarded. *(1) A mirrored folder with its own
  read/write permissions* — rejected: it makes a folder an access object, which
  three decisions forbid, and puts a wall inside a sandbox. *(2) Placement — one
  document in two sandboxes, access the union* — survives the wall model but
  leaves two grant sets over one file and an ambiguous multiplayer scope. *(3)
  The one that held: **sandbox B is a view, not a store.*** A curated window
  onto selected documents whose single home stays the producing
  organisation's own sandbox. That settles reference-vs-copy outright (no
  second store, no drift, nothing for Purge to chase), and it resolves two
  residuals cleanly — agent surfaces follow the **home** sandbox and never
  travel through a mirror, which is where "no AI for the third party" comes
  from structurally rather than as a switch; and the view can be ruled
  **head-only**, so admitting a party on day 90 does not hand them 90 days of
  drafting history. What the view framing does *not* avoid is the ADR-0036
  amendment above: it settles storage and changes nothing about access.
  **Explicitly unresolved:** the tier's capability set; document-grain reach
  and the audience union; what a view shows of a bound document; promotion and
  attribution; and the roster/appointability problem, which is the sharpest of
  them.

  **What would make it live.** A named customer pull — a pilot where a consultee
  or authority must co-edit and membership is genuinely refused. Absent that,
  it stays parked: the amendment surface is wide (three decisions and a
  wall-critical audience function), and the headline capability is CSPP-gated
  anyway, so nothing is lost by waiting for the pull.

  **Related, and deliberately not folded in:** `Q-019` (the personal→project
  push — the same cross-scope-move question one rung down, and it should be
  settled *with* this rather than before it) and `Q-039` (a plan-locked shared
  sandbox disclosing the TIDP's shape — the same disclosure-through-structure
  exposure).

- **P-002 — Citation integrity: does a cited source still support the sentence
  attached to it?** *Raised 2026-08-30 (owner, the checker session; ruled out of
  V1 and parked on the owner's explicit instruction).*

  ⚠ **This entry does not meet the file's stated entry criterion, and is here
  on the owner's explicit instruction of 2026-08-30.** It breaks no accepted
  decision — see *What it breaks* below. In the same conversation the owner
  ruled that **the parking lot's criterion is itself wrong** and instructed
  that it be revised after the session; a parallel session carries that change,
  together with the two decisions it needs — what the new criterion is, and
  whether the read-gate above survives, since that gate's justification *is* the
  current criterion. Until that lands, this entry is the file's one exception
  and is flagged rather than filed quietly. It takes no row in the *Index by
  amended decision* table, because it pressures no decision.

  **The need, in user terms.** A consultant opens a 50-page chapter. One
  sentence reads *"Bedford is in Cambridgeshire"* and carries a citation to a
  library document. The citation is not fabricated: an agent drafted that
  sentence correctly, cited the document, and a human later edited the sentence.
  The cited document is still in the library, still live, still authoritative —
  the citation resolves, the source chip opens, everything looks right. **What
  the reader sees on screen is a grounded claim.** What is true is that the
  passage behind it no longer says what the sentence says.

  **The two halves, and only the second is hard.**
  - **Structural** — code, free: does the citation resolve; is the source still
    in the library; is the version superseded or withdrawn.
  - **Support** — a model call per citation, batchable: does the cited passage
    actually say what this sentence claims it says. An agent-assisted 50-page
    chapter could carry ~200 citations.

  **What it breaks: nothing, and that is the point of the flag above.** No
  accepted ADR requires citations to be support-verified, and none forbids it.
  Building it later needs nothing amended. Under this file's own discriminator
  it is a feature that *fits* the model and is not scheduled — which is the
  deferred register's definition, and the reason the owner concluded the
  criterion is drawn too narrowly.

  **The finding that outlives the parking, and does *not* live only here.**
  [`groundCheck`](../../packages/governance/src/ground-check.ts) is a
  **membership** test — `admitted.has(refKey(claim.sourceRef))` — asking only
  whether a claim names a source the run actually saw, never reading that
  source's text, and running **once, at generation**. It is a **fabrication
  guard, not a support guard**. So a source chip in an Infora document
  guarantees *"the model saw this source"*, not *"this source says this"*, and
  nothing re-checks after a human edits an agent-written cited sentence. That
  is a standing property of the platform rather than a missing feature, so it is
  recorded in **[ADR-0053](../architecture/adr/0053-the-checkers-run-and-the-executor-rule.md)
  §14** and is citable from there. Nothing in this entry needs to be read to
  know it.

  **Shape as understood — non-binding, no adversarial pass.** A check family
  inside the QA checker, switchable at launch like the others: structural half
  free and always on when the family is selected; support half batched several
  citations to a call. **Provenance is not needed** — an earlier position in the
  session held that the drift case required per-span records of which text an
  agent wrote, which the build lacks; the owner's framing retired it, because
  checking every citation against its sentence makes *how* it came to be wrong
  irrelevant.

  **What would make it live.** V1 shipping with agent-assisted drafting in real
  use, so documents exist that carry citations across human edits — the
  condition under which the defect can occur at all. Or the parking-lot
  criterion being revised, at which point this is an ordinary deferral and
  should move to [../build/plan.md](../build/plan.md)'s deferred register rather
  than stay here.
