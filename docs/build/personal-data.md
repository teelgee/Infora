# Personal data — the register

> **Status: ♻ living reference, seeded 2026-08-01.** What personal data Infora holds, why it is held, and where it is deleted. Derived from `packages/db/src/schema` and the ADRs that put each field there — **not** a new design artefact and not a policy: it states what is already true, so four other things can be written against one source instead of four guesses.
>
> **Why it exists.** A competitive review on 2026-08-01 found `DPIA`, `personal data`, `data subject`, `right to erasure`, `eyes off` and `human access` returned **zero hits** across `docs/`, while `GDPR` appeared four times and only ever inside a posture list. The ethical wall is architecturally strong; the privacy programme was undocumented. This register is the first half of the fix, and the open questions are the second.
>
> **Four things read from it**, which is what makes it worth keeping current: **[ADR-0050](../architecture/adr/0050-the-privacy-programme-operator-access-and-deletion.md)** (operator access and deletion) was written against it and now supplies this file's deletion positions, its contract-end clause enumerates it, the **DPA** is drafted from it — still blocked on the controller/processor model, **`Q-035`** — and a customer's own **DPIA** needs it as the technical half.

**Working rule (CLAUDE.md):** a ticket or ADR that introduces, stores, or derives data about a **named person** says so, and names where that data is deleted. This file is where that lands.

## What is held

Grouped by *why* it exists, because that is the question a DPA and a DPIA both ask. **"Deleted where"** is the current position. Ruled **2026-08-03 by [ADR-0050](../architecture/adr/0050-the-privacy-programme-operator-access-and-deletion.md)**, whose governing distinction is **whose material it is** rather than where it sits: the **member organisation** may require complete deletion of its own material wherever it lives, the **library owner** retains the deliverables and the review-cycle metadata including named individuals, and library removal is the owner's act after withdraw.

### Identity and access

| What | Where | Why held | Deleted where |
|---|---|---|---|
| Name, email, organisation, org role | `users` | Identity; the project roster the wall deliberately exposes (ADR-0033 — the wall hides work, never presence) | ✅ Account data — deleted at contract end (ADR-0050 §8) |
| Entra subject | `users.externalIdentity` | SSO mapping (T-071). Populated when Entra lands; ADR-0047 §14 defers it behind password auth | ✅ With the account, at contract end |
| Password hash (scrypt) | `user_credentials` | Skeleton auth (T-021), scaffolding per ADR-0047 §14 | ✅ With the account, at contract end. **Pilot users are provisioned individually (T-322)** — the seeded shared dev password must never exist in the pilot environment |
| User preferences | `users.preferences` | Lens default and UI state (T-283) | ✅ With the account, at contract end |
| Sessions, incl. `lastSeenAt`, `revokedAt`, `revokedReason` | `sessions` | Revocable server-side sessions (T-251). `lastSeenAt` is **activity data about a named person**, not just a token | ✅ With the account, at contract end. Revocation is not deletion — a revoked row is retained evidence until then |
| Per-person project grants, as closed intervals | `participants` | The access model (ADR-0033). Intervals are append-only by construction, so "when did they lose access" survives | ⚠ **The interval is the audit answer.** Org B's own grants go at exit; a grant evidencing participation in **Org A's** review record is retained and disclosed (ADR-0050 §8) |

### The conflict register — the most sensitive object here

| What | Where | Why held | Deleted where |
|---|---|---|---|
| Named-person exclusions: `subjectUserId`, `declaredByUserId`, project A / project B, reason | `conflict_exclusions` | ADR-0046 §7 — an individual-grain internal wall | ✅ The firm's own material — deletable on request in use, and at exit (ADR-0050 §6) |
| Attestations and refusals: who attested, who was refused, when | `conflict_attestations`, `conflict_refusals` | ADR-0046 §8 — assurance without disclosure | ✅ With the register, at exit |

**Handle with care.** ADR-0046 itself says this list *"reveals which of a firm's people are walled from what, which is close to revealing the engagements"*, and puts it **org-private on the ADR-0018 private floor** — never readable by a project owner, never across the wall. It is therefore the sharpest case in the privacy programme: a database superuser reads it regardless of the floor, so the operator is *outside the floor by policy and inside it by mechanism*. **Ruled 2026-08-03 (ADR-0050 §3): stated plainly, not encrypted.** Application-level encryption was rejected on a finding rather than on cost — the person who can read the database also controls the deployment and can therefore reach the application's key material, so only a customer-held key would hold, and a lost key is a lost register. The reduction that does work is **minimisation**: `reason` stays, with its purpose narrowed on screen to the fact rather than the client (T-342).

### Authorship and attribution — inside the controlled record

| What | Where | Why held |
|---|---|---|
| Comment authorship and `@`-mentions | `sandbox_comments` (`mentions uuid[]`) | Collaboration (T-112); mentions drive notifications (ADR-0049) |
| Presence heartbeats: `participantId`, `lastSeenAt` | `document_presence` | Multiplayer presence (ADR-0039, T-175). **Fine-grained activity data** — who had which document open, when |
| Check-out / binding / promotion actors | `sandbox_checkout_events`, `binding_events` | Append-only lifecycle trails (ADR-0032/0038) |
| Named authors, reviewers, acknowledgers (incl. the ADR-0051 submission acknowledger on rounds, T-346), responders, completion signals (ADR-0052, T-353) | `deliverable_authors`, `deliverable_reviewers`, `deliverable_acknowledgements`, `rounds`, `review_comments`, `responses`, `review_completions` | The review cycle (ADR-0032/0014); a named human signed this off |
| A lead-reviewer appointment's own answer: `accepted_at`, and for a refusal `declined_at` plus the **reason in free text** (ADR-0033 addendum, 2026-08-22; built T-372) | `deliverable_reviewers` | The appointment is the person's own undertaking, so the refusal is theirs too — and the reason is why the deliverable is visibly waiting |
| Label overrides: who overrode, and why | `label_overrides` | T-249 — an override without a name is not an audit record |
| **Who withdrew a deliverable**, beside the existing free-text reason | `containers.withdrawn_by_participant_id` (2026-08-27, ADR-0013) | Authority over record state follows the publication boundary, so restoration must know which side acted — and a withdrawal without a name is not an audit record. **The reason is read by anyone who can see the container**, including the producing organisation whose work it is about; that is deliberate (ADR-0013 §4) |
| Work-item assignee | `work_items.assigneeParticipantId` | Who owns the work |
| **Refused destructive acts:** who attempted to close-as-rejected, withdraw or restore a deliverable, and was stopped for want of the elevated tier | `elevated_refusals` | T-301 — a control nobody can see operating is a control nobody can audit. **Append-only by trigger**, deliberately: the people who hold this tier are exactly the people who would want a refusal gone |

⚠ **A refusal is data about a person exactly as an acceptance is**, the same reading `elevated_refusals` gets below. The decline reason is **owner-organisation-private, enforced in the server's read** rather than by the client hiding a field: it reaches the owner organisation and the person who wrote it, and the producing side learns only that a lead reviewer is awaited, never why. The refusal is **never revoked away** — a declined grant keeps its open interval and simply stops being a live lead — so **deletion follows the grant it sits on** (ADR-0050 §6's rule, as for everything else in this table). *(This paragraph previously lived as a fourth cell of the row above, which a three-column table silently discards at render — T-378's audit found it invisible in every rendered view of this file.)*

**`elevated_refusals` records an act that did NOT happen**, which is the row in this table most easily forgotten and the reason it is named here: it holds a named person's *attempt*, and an attempt is data about a person exactly as a completed act is. **Deletion follows its container** (ADR-0050 §6's rule, applied rather than extended): the trail of attempts on a deliverable in the owner's library is retained with that deliverable, and one on the producing firm's own material goes with it. **A cross-organisation attempt is never recorded at all** — it is answered `404` above the tier check, so no row exists to delete, which is the cheapest kind of minimisation available.

**These are the hard ones.** Attribution inside a **controlled record** is the record's evidential value — ADR-0002's immutability and ADR-0013's states-never-deletion exist precisely so it cannot be edited away. **Ruled 2026-08-03 (ADR-0050 §6, §8):** the **library owner retains** the deliverables and the review-cycle metadata, named individuals included, and attribution inside *another party's* record is **retained and disclosed in the DPA, never pseudonymised** — a sign-off is worth something because a named person made it. Removal from the library is the owner's own act, after withdraw, on the producing organisation's request (§7).

### Behavioural and usage data

| What | Where | Why held | Deleted where |
|---|---|---|---|
| Accept / edit / reject resolutions: `resolvedByParticipantId`, `editedContent` | `signals` | The moat loop (Session 7, ADR-0026) | ✅ The firm's own material — deleted at exit (ADR-0050 §6). ~~Session 7 must rule the within-tenant/cross-tenant boundary before this compounds~~ — **ruled 2026-08-26** (ADR-0026 amended). **The row itself never leaves the organisation**; only a derived record may, and only on the terms in the row below |
| **The derived craft record** — a de-identified characterisation of *what kind of change* a person made (never the prose on either side of it), carrying the Lens, the worker and whether a citation was present | derived from `signals` + `suggestions`; **abstracted inside the customer's boundary** before egress. Not yet built — Session 7 specifies the abstraction step | Infora's own product improvement: the craft path, ADR-0026 as amended 2026-08-26 | ⚠ **De-identification precedes egress** — no participant, no organisation, no project, no scheme. Deleting the source Signals removes the rows and anything still in the pipeline, but a record already corroborated across firms and written into a shipped Lens or checker rule **does not return** (ADR-0050 §6 rider): that artefact is Infora's own authored, multi-organisation work. **`Q-045`** asks who at Infora may read what, and **`Q-035`** carries it into the DPA |
| Who invoked which run, and what they asked | `runs` (`requesterParticipantId`, `request`, `response`) | The audit record (ADR-0028); producer-private (2026-07-12 ruling) | ✅ Producer-private, so it is **the producing firm's own material** — deletable on request and at exit (ADR-0050 §6). In-life retention is `Q-015` |
| Per-model-call egress facts | `steps` | ADR-0037 §6 — the posture provable per call | 🚧 `Q-015` |
| **Per-named-user cost** | derived: `steps.usage.cost` → `runs.requesterParticipantId` | T-254 | ✅ The firm's own material — deleted at exit (ADR-0050 §6) |

> ⚠ **The one that is live and easy to miss.** `GET /organisation/costs` aggregates spend at organisation **and named-user** grain. That is **per-person usage data, shipped in V1** — visible to an org admin, showing who spent what. It is **not a Signal**, so **Session 7 will never reach it**, and it is not covered by any current ruling. It needs naming in the DPA regardless of when Session 7 runs. *(Carve-out recorded on Session 7 in the tracker, 2026-08-01.)*

### Transient inputs — held nowhere, and that is the requirement

| What | Where | Why held | Deleted where |
|---|---|---|---|
| An uploaded schema spreadsheet, which routinely names **authors and reviewers** in its role columns | **nowhere** — parsed in-request (T-337) | Schema import: the firm's existing schema becomes candidate fields | **Never persisted.** Not admitted to the library, not chunked, not retrievable |
| A super user's free-text **ask** to the structure-builder agent (T-364), which a person may well type a colleague's name into | **nowhere** — sent to the model, answer parsed in-request | Proposing a candidate folder tree | **Never persisted** — no Run record, no prompt log (see T-364's residual: when the first embedded assistive agent records its call, this one adopts that pattern, and *then* the register gains a row for what is stored). It does **egress** to the model provider under the deployment's tier, like any other chat call |
| A plan batch-import spreadsheet, whose **author and reviewer columns carry named people** (T-359, 2026-08-09 session S3 — T-337's row-import sibling) | **nowhere** — parsed in-request | Batch-creating plan rows from the organisation's Excel-drafted deliverables list | **Never persisted.** T-337's three constraints carry over verbatim: never corpus, never chunked, never retrievable; the run record must not echo the file body; an unparseable row fails loudly and names the row. What *is* stored is the plan rows the import creates — appointment names land in `deliverable_authors` / `deliverable_reviewers`, already registered above |

⚠ **The trap this row exists to close.** `runs.request` is persisted (above), so echoing the uploaded file body into the run record would turn a transient parse into a **permanent store of named people** that no ruling covered and no deletion act in ADR-0050 reaches. T-337 carries "the run request must not echo the file body" as an acceptance criterion for exactly this reason. The general rule it instances: **a transient input stops being transient the moment the audit record quotes it.**

### Derived and non-obvious stores

Deletion that reaches only the row is not deletion — **ADR-0050 §5 and §7 make reaching these stores the definition of Purge and of removal**, which is what separates them from withdraw and from the bin:

- **Chunks and embeddings** — `version_chunks`, colocated in pgvector (ADR-0024). Text a person authored survives in derived form after the source row goes.
- **S3 object versions** — versioning is **on** (ADR-0047 §3), so a delete writes a delete-marker. Real erasure needs a version-level purge.
- **PITR** — 14-day recovery window (ADR-0047 §4). Deleted data remains restorable for a fortnight *by design*; the DPA must state the lag rather than imply instant erasure.
- **Backups** — same residency, same CMKs, retention ≥ the PITR window.
- **Logs** — structured request logs with request IDs, retained ≥ 30 days (T-219); telemetry in Sentry's **EU** region with PII scrubbing on (ADR-0047 §15).
- **Notifications** — the record and its email nudge (ADR-0049). Email has **left the platform** and cannot be recalled, which is exactly why §4 of that ADR forbids content in the body.
- **Dangling provenance** — where a referent is gone, reuse T-253's **`unreconstructable`** count rather than rendering a silent gap.

## Sub-processors

Transcribed from ADR-0047 — facts already decided, gathered here because a DPA and a customer's DPIA both ask for exactly this list. **Not a decision; keep it in step with §1, §15 and §16.**

| Sub-processor | Purpose | Region | Notes |
|---|---|---|---|
| **AWS** | Hosting, database, object storage, keys, email | `eu-west-2` (London) | All customer documents, database and backups at rest |
| **Anthropic** | Model inference (chat) | **US** | Under the `pilot` tier (ADR-0037 as amended by ADR-0047 §12). ⚠ **Valid only under a zero-data-retention agreement** — without it the tier's declared `retention: zero` is false and it must not be used |
| **Voyage AI** | Embeddings | **US** | Same retention posture required. ADR-0047 §13 moves embeddings to Bedrock, which folds them under the AWS agreement and takes the corpus load off the Anthropic clock |
| **Amazon SES** | Notification email | `eu-west-2` | ADR-0047 §16. Carries a pointer and a bare fact, **never content** (ADR-0049 §4) |
| **Sentry** | Error tracking | **EU** | ADR-0047 §15. Telemetry and stack traces only; PII scrubbing on; no document content, prompt or completion bodies |

**Residency, stated in three parts** because it is not uniform (ADR-0047 §15): documents, database and backups **UK**; model inference **US** under zero retention; error telemetry **EU**. A pilot agreement states this rather than letting a buyer infer UK-only.

## What this file is not

It is **not** the DPA, and not a DPIA. The **controller/processor model remains open as `Q-035`** and blocks the DPA; a DPIA travels with it, being a controller obligation Infora may not owe as processor. This register is the **technical half** both are drafted from. Its deletion column is now a transcription of [ADR-0050](../architecture/adr/0050-the-privacy-programme-operator-access-and-deletion.md) rather than a set of open questions — where a position is genuinely still open the cell says so and names the question.
