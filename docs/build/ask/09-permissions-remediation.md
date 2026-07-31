# 09 — Permission remediation

The eight findings from [phase-0-discovery.md §2](phase-0-discovery.md), turned
into requirements.

**Two of these are real leaks — R2 and R3.** Both describe material moving
*within* one assembly environment, which is exactly what the environment cannot
prevent. They sequence before the features that would exercise them, because the
cost of each rises sharply once workers exist.

The rest are hardening, audit quality or cost, and gate nothing. **R1 and R8 in
particular were originally rated as gaps and are not** — corrected 2026-07-30;
each says so in its own section.

Requirements that do touch a security boundary are reported in Phase 3 with
evidence in the interrogation format: claim, `file:line`, verdict.

---

## R1 — The conflict register *(finding F1)* · ADR-0046 — **built, and not a security control**

**Corrected 2026-07-30.** This was originally written as closing a leak: *"ADR-0026
closed the machine path; the human path is open."* That was wrong. A request runs
in exactly one assembly environment (ADR-0025) and the gateway has no
scope-widening parameter, so a person working for two clients **cannot reach one
client's material from inside the other's project**, whatever they personally
know. The leak this reached for cannot occur.

**What it actually is.** An optional administrative guardrail: a firm's org admin
records that one of its people must not be added to a project, and the platform
refuses the enrolment. Useful — it prevents an accidental grant and leaves an
audit record a compliance conversation can point at. It is **not** an input to
`resolveAccess`; a request resolves on whether the user holds a live Participant,
and nothing else. The re-check that briefly existed in the predicate has been
removed (ADR-0046 §3, struck).

**Built** as T-245/T-246. Nothing gates on it, and it should not have been
sequenced first — see the correction in ADR-0046 and [phase-0-discovery.md §4](phase-0-discovery.md).

---

## R2 — Label propagation on write-back *(finding F2)*

**The gap.** Written output takes the writer's own organisation
([sandbox.ts:129](../../../apps/api/src/sandbox.ts#L129)), not the most restrictive label among the sources that
produced it. Ask's "Open in editor" ([ask.tsx:60-65](../../../apps/web/src/screens/ask.tsx#L60-L65)) is a live instance: an
answer grounded on a deliverable narrowed to named Participants (ADR-0035 §3)
can be carried into a document in a sandbox scoped `multi_org` (ADR-0036).

**Requirements:**

1. **Compute the label.** Given a run's source set, resolve the most restrictive
   access label across every source: participant-narrowed ⊂ single-organisation
   ⊂ multi-organisation ⊂ project-wide. The inputs already exist —
   `step.source_set` records every source seen ([drawer3-execution.ts:127](../../../packages/db/src/schema/drawer3-execution.ts#L127)).
2. **Enforce on write.** A write to a destination broader than the computed
   label is **refused by default**, with a stated reason naming both labels.
3. **Override is explicit, recorded and attributed** — never a config default.
4. **Applies to every write path**, not just Ask: `document_builder`, "Open in
   editor", exports, and any future workflow declaring `writes`. A workflow
   declaring `writes` must declare its propagation behaviour ([03](03-orchestration-and-plan.md) §4).
5. **Surfaced.** The destination selector warns before the fact ([08](08-interface.md) §3); the
   completion footer states the computed label after it.

**Blocks:** the output-destination selector, and `document_builder`.

---

## R3 — Untrusted content isolation *(finding F3)*

**The gap.** No web fetch path exists today, so the guarantee holds by omission
rather than by enforcement. The seam is already declared: `attached_sources.kind`
includes `'web'` ([drawer3-execution.ts:62](../../../packages/db/src/schema/drawer3-execution.ts#L62)), pinnable over HTTP
([attached.ts:78-101](../../../apps/api/src/attached.ts#L78-L101)), stored and never read. And the prompt is built by
concatenating `retrieved.items` ([grounded-draft.ts:60-76](../../../packages/capabilities/src/grounded-draft.ts#L60-L76)), so any pipeline
appending an item reaches the model.

**Requirements — the barrier is a type, not a rule:**

1. `web_research` returns `ExternalSource[]`, a **distinct type** from
   `AssembledItem`. **No conversion function exists**, and adding one is a
   reviewable event.
2. `groundedDraft` accepts `AssembledInput` and cannot be passed an
   `ExternalSource`. The compiler enforces this.
3. **The worker's dependencies carry no `Db`, no `assemble`, no
   `EntitledSlice`** — it physically cannot query a store. This mirrors the
   existing pattern where the retrieve leaf's only store reach is its injected
   gateway ([retrieve-leaf.ts:2-3](../../../packages/orchestration/src/retrieve-leaf.ts#L2-L3)).
4. **The orchestrator is the only place the two meet**, holding them in separate
   fields and rendering them in separate registers ([08](08-interface.md) §6).
5. **A dependency rule**, enforced in CI like the existing package rules
   ([scripts/dep-rules.mjs](../../../scripts/dep-rules.mjs)): the web-research package may not import `@infora/db`
   or `@infora/knowledge`.
6. **Resolve the reserved `web` attached-source kind**: either wire it under the
   same barrier or remove it, so a declared-but-unenforced path does not sit in
   the schema.

**Blocks:** the `web_research` worker.

---

## R4 — Session lifetime and in-flight authority *(finding F4)*

**The gap.** The session cookie is set with no `maxAge` and no `expires`
([auth.ts:41-46](../../../apps/api/src/auth.ts#L41-L46)) — a browser-session cookie with no server-side expiry and
no session table. The run executes inside the request, and the retrieve leaf
re-reads the participant's organisation but **does not re-run `resolveAccess`**
([retrieve-leaf.ts:72-81](../../../packages/orchestration/src/retrieve-leaf.ts#L72-L81)). A Participant revoked mid-run keeps their
authority to the end of the chain.

Seconds today. Minutes once a plan fans out across workers.

**Requirements:**

1. **Absolute session lifetime** plus idle timeout, both configuration.
2. **A server-side session record**, so a session can be revoked — a signed
   cookie alone cannot be.
3. **Re-resolve the slice per plan step**, not once per request. A step whose
   re-resolution fails does not run; the run reports what it completed and why it
   stopped ([03](03-orchestration-and-plan.md) §6).
4. **Revocation takes effect on the next step**, consistent with the colocated
   store's immediate-effect property (ADR-0024) and the live-mutability of
   sandbox scope grants (ADR-0036).

**Interaction with the infra/security session.** Production identity is
committed as Entra-first and that session owns it. R4 is the minimum that must
hold **before long-running plans**, whatever identity provider lands — it is
about session lifecycle and in-flight authority, not about the login mechanism.

**Blocks:** multi-worker plans.

---

## R5 — Passage-grain audit *(finding F5)*

**The gap.** `step.source_set` records source *identities* (version ids). The
assembled passage text is not stored, so "what did your AI see" answers at
document-version grain.

**Requirements:**

1. **Record `chunk_id` in `source_set`**, alongside the version id. The chunks
   are immutable rows, so the exact assembled passages become reconstructible
   without storing text twice.
2. **A retrieval read** that reconstructs a run's assembled context from its
   source set, producer-private like the rest of the run record
   ([runs.ts:200-212](../../../apps/api/src/runs.ts#L200-L212)).
3. **Retention is named**, not left unbounded. Audit retention and export are
   already Slice C scope; this requirement states the dependency rather than
   pre-empting the design.

Low cost, high value in a client security review — it converts "we log what it
saw" from a claim into a demonstration.

---

## R6 — Defence in depth on the mandatory filter *(finding F6)*

**The gap.** The tenant filter is unavoidable *by construction* — `groundedLibrary`
requires an `EntitledSlice`, and both query arms build their WHERE from the one
`liveLibraryFilter` ([retrieval.ts:73-83](../../../packages/knowledge/src/retrieval.ts#L73-L83)). But there is no row-level
security: a new query written elsewhere against `version_chunks` returns
everything. Correct today; fails *open* at the database.

**Requirements:**

1. **Row-level security** on `version_chunks` and `containers`, as defence in
   depth. The application still applies its pre-filters; RLS is the backstop for
   the query nobody reviewed.
2. **A dependency rule**: no package outside `@infora/knowledge` may import the
   `versionChunks` schema object. Enforced in CI beside the existing rules.
3. **A CI grep guard** for permission-shaped strings in prompt templates —
   `do not mention`, `you may only`, `do not reveal`, `is not authorised`,
   `never mention`, `do not disclose`, `must not reveal`, `not permitted to`.
   This currently returns zero hits and the guard is what keeps it at zero.

---

## R7 — Real cost attribution *(finding F7)*

**The gap.** Provider rates default to `0` ([grounded-draft.ts:92-94](../../../packages/capabilities/src/grounded-draft.ts#L92-L94)) and the
running app binds the draft leaf with no options ([app.ts:118](../../../apps/api/src/app.ts#L118)) — **every step
in the live system records a cost of exactly zero.** Token counts are real.

**Requirements:**

1. Provider rates per model id in deployment config, passed at leaf
   construction.
2. Aggregation at organisation and user grain over a date range,
   producer-private.
3. Pinned models marked in cost reporting ([04](04-model-routing.md) §6).
4. The rate-limit store moves off the per-process `Map`
   ([rate-limit.ts:3](../../../apps/api/src/rate-limit.ts#L3)) before multi-instance deployment — a named seam,
   restated because one plan now means many model calls.

---

## R8 — Scope attenuation *(finding F8)* — **a hardening, not a gap**

**The position.** A child run is opened with the parent's participant id verbatim
([retrieve-leaf.ts:48](../../../packages/orchestration/src/retrieve-leaf.ts#L48)), and `assemble` has no scope-widening parameter
([wall.test.ts:126](../../../packages/knowledge/src/wall.test.ts#L126)). **Escalation is structurally impossible**, which is the half
that matters and is already true.

Scope is **equal**, never narrowable. Corrected 2026-07-30: that is not a gap.
Every worker runs inside the caller's single environment, so equal scope leaks
nothing — a worker cannot reach further than the user because there is nowhere
further to reach. Narrowing is worth having as defence in depth and as a way to
express intent, but it **blocks nothing** and should not be treated as a
prerequisite for the worker registry.

**If built:**

1. An optional narrowing on `EntitledSlice` — container or classification
   constraints intersected into the pre-filter, **never unioned**.
2. Monotonic composition: a child's narrowing intersects with its parent's, and
   no operation removes one.
3. The existing signature guarantee preserved, with the no-widening test extended
   to assert narrowing cannot widen either.

**Blocks:** nothing.

---

## Sequencing

Corrected 2026-07-30. Ordered by **what actually gates work**, not by how alarming
each finding sounded on first reading.

| Order | Requirement | Blocks |
| --- | --- | --- |
| 1 | **R2** label propagation | The destination selector, `document_builder` |
| 2 | **R3** untrusted-content type barrier | `web_research` |
| 3 | **R6** RLS, dep rule, CI grep guard | Nothing — cheap defence in depth, done early |
| 4 | **R4** session lifetime + per-step re-resolution | Multi-worker plans |
| 5 | **R5** passage-grain audit | Nothing; worth doing before a client review |
| 6 | **R7** real cost attribution | Cost reporting |
| 7 | **R8** scope attenuation | Nothing — a hardening, not a gap |
| — | ~~**R1** conflict register~~ | **Built (T-245/T-246).** Gates nothing; sequenced first on a severity rating that did not survive scrutiny |

**R2 and R3 are the two that describe real leaks**, and both describe movement
*within* a single environment — which is precisely what the assembly environment
does not protect against, and why they are the ones that matter. Everything else
here is hardening, audit quality or cost.

All are independently shippable and none breaks the running app. The eval harness
([07](07-eval-harness.md)) can land before any of them; nothing in this document gates it.
