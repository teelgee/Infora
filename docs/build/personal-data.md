# Personal data — the register

> **Status: ♻ living reference, seeded 2026-08-01.** What personal data Infora holds, why it is held, and where it is deleted. Derived from `packages/db/src/schema` and the ADRs that put each field there — **not** a new design artefact and not a policy: it states what is already true, so four other things can be written against one source instead of four guesses.
>
> **Why it exists.** A competitive review on 2026-08-01 found `DPIA`, `personal data`, `data subject`, `right to erasure`, `eyes off` and `human access` returned **zero hits** across `docs/`, while `GDPR` appeared four times and only ever inside a posture list. The ethical wall is architecturally strong; the privacy programme was undocumented. This register is the first half of the fix, and the open questions are the second.
>
> **Four things read from it**, which is what makes it worth keeping current: **[Q-032](../grill-sessions/grill-questions.md)** (operator access) is written against it, **[Q-033](../grill-sessions/grill-questions.md)**'s contract-end clause enumerates it, the deferred controller/processor **DPA** is drafted from it, and a customer's own **DPIA** needs it as the technical half.

**Working rule (CLAUDE.md):** a ticket or ADR that introduces, stores, or derives data about a **named person** says so, and names where that data is deleted. This file is where that lands.

## What is held

Grouped by *why* it exists, because that is the question a DPA and a DPIA both ask. **"Deleted where"** is the current position, and where it is unruled the entry says so and points at `Q-033` rather than inventing an answer.

### Identity and access

| What | Where | Why held | Deleted where |
|---|---|---|---|
| Name, email, organisation, org role | `users` | Identity; the project roster the wall deliberately exposes (ADR-0033 — the wall hides work, never presence) | 🚧 `Q-033` — account data, deleted at contract end |
| Entra subject | `users.externalIdentity` | SSO mapping (T-071). Populated when Entra lands; ADR-0047 §14 defers it behind password auth | 🚧 `Q-033`, with the account |
| Password hash (scrypt) | `user_credentials` | Skeleton auth (T-021), scaffolding per ADR-0047 §14 | 🚧 `Q-033`. **Pilot users are provisioned individually (T-322)** — the seeded shared dev password must never exist in the pilot environment |
| User preferences | `users.preferences` | Lens default and UI state (T-283) | 🚧 `Q-033`, with the account |
| Sessions, incl. `lastSeenAt`, `revokedAt`, `revokedReason` | `sessions` | Revocable server-side sessions (T-251). `lastSeenAt` is **activity data about a named person**, not just a token | 🚧 `Q-033`. Revocation is not deletion — a revoked row is retained evidence |
| Per-person project grants, as closed intervals | `participants` | The access model (ADR-0033). Intervals are append-only by construction, so "when did they lose access" survives | ⚠ **Collides with deletion** — an interval is the audit answer. `Q-033` zone 2 |

### The conflict register — the most sensitive object here

| What | Where | Why held | Deleted where |
|---|---|---|---|
| Named-person exclusions: `subjectUserId`, `declaredByUserId`, project A / project B, reason | `conflict_exclusions` | ADR-0046 §7 — an individual-grain internal wall | 🚧 `Q-033` — behavioural/account data, deleted at exit |
| Attestations and refusals: who attested, who was refused, when | `conflict_attestations`, `conflict_refusals` | ADR-0046 §8 — assurance without disclosure | 🚧 `Q-033` |

**Handle with care.** ADR-0046 itself says this list *"reveals which of a firm's people are walled from what, which is close to revealing the engagements"*, and puts it **org-private on the ADR-0018 private floor** — never readable by a project owner, never across the wall. It is therefore the sharpest case in **`Q-032`**: a database superuser reads it regardless of the floor, so the operator is *outside the floor by policy and inside it by mechanism*. Whether that is stated plainly or closed with application-level encryption is the open question.

### Authorship and attribution — inside the controlled record

| What | Where | Why held |
|---|---|---|
| Comment authorship and `@`-mentions | `sandbox_comments` (`mentions uuid[]`) | Collaboration (T-112); mentions drive notifications (ADR-0049) |
| Presence heartbeats: `participantId`, `lastSeenAt` | `document_presence` | Multiplayer presence (ADR-0039, T-175). **Fine-grained activity data** — who had which document open, when |
| Check-out / binding / promotion actors | `sandbox_checkout_events`, `binding_events` | Append-only lifecycle trails (ADR-0032/0038) |
| Named authors, reviewers, acknowledgers, responders | `deliverable_authors`, `deliverable_reviewers`, `deliverable_acknowledgements`, `review_comments`, `responses` | The review cycle (ADR-0032/0014); a named human signed this off |
| Label overrides: who overrode, and why | `label_overrides` | T-249 — an override without a name is not an audit record |
| Work-item assignee | `work_items.assigneeParticipantId` | Who owns the work |

**These are the hard ones.** Attribution inside a **controlled record** is the record's evidential value — ADR-0002's immutability and ADR-0013's states-never-deletion exist precisely so it cannot be edited away. `Q-033`'s recommended position: **never deleted, by anyone including the owner**, with withdraw/supersede as the answer — and attribution sitting inside *another party's* record is **retained and disclosed in the DPA**, because that customer's contract has not ended.

### Behavioural and usage data

| What | Where | Why held | Deleted where |
|---|---|---|---|
| Accept / edit / reject resolutions: `resolvedByParticipantId`, `editedContent` | `signals` | The moat loop (Session 7, ADR-0026) | 🚧 `Q-033` — deleted at exit. **Session 7 must rule the within-tenant/cross-tenant boundary before this compounds** |
| Who invoked which run, and what they asked | `runs` (`requesterParticipantId`, `request`, `response`) | The audit record (ADR-0028); producer-private (2026-07-12 ruling) | 🚧 `Q-033`, and retention is `Q-015` |
| Per-model-call egress facts | `steps` | ADR-0037 §6 — the posture provable per call | 🚧 `Q-015` |
| **Per-named-user cost** | derived: `steps.usage.cost` → `runs.requesterParticipantId` | T-254 | 🚧 `Q-033` |

> ⚠ **The one that is live and easy to miss.** `GET /organisation/costs` aggregates spend at organisation **and named-user** grain. That is **per-person usage data, shipped in V1** — visible to an org admin, showing who spent what. It is **not a Signal**, so **Session 7 will never reach it**, and it is not covered by any current ruling. It needs naming in the DPA regardless of when Session 7 runs. *(Carve-out recorded on Session 7 in the tracker, 2026-08-01.)*

### Transient inputs — held nowhere, and that is the requirement

| What | Where | Why held | Deleted where |
|---|---|---|---|
| An uploaded schema spreadsheet, which routinely names **authors and reviewers** in its role columns | **nowhere** — parsed in-request (T-337) | Schema import: the firm's existing schema becomes candidate fields | **Never persisted.** Not admitted to the library, not chunked, not retrievable |

⚠ **The trap this row exists to close.** `runs.request` is persisted (above), so echoing the uploaded file body into the run record would turn a transient parse into a **permanent store of named people** that no ruling covers and no deletion zone in `Q-033` reaches. T-337 carries "the run request must not echo the file body" as an acceptance criterion for exactly this reason. The general rule it instances: **a transient input stops being transient the moment the audit record quotes it.**

### Derived and non-obvious stores

Deletion that reaches only the row is not deletion. `Q-033`'s stress test lives here:

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

It is **not** the DPA, and not a DPIA. The controller/processor model and the DPA are owner-deferred; a DPIA travels with them, being a controller obligation Infora may not owe as processor. This register is the **technical half** both are drafted from. It is also not a ruling: where a cell says 🚧 `Q-033`, the position is genuinely open and the tracker holds the recommendation.
