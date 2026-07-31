# Ask — the chat and analysis interface

**Status:** Phase 1 requirements, drafted 2026-07-29. Ticketed on the board as
Slice Ask (T-245 – T-299); Wave 0 part-built. **The MVP is scoped to end at the
Lens (ruled 2026-07-31) — see [what the MVP builds](#what-the-mvp-builds-and-what-waits) below.**
**Phase 0 discovery:** [phase-0-discovery.md](phase-0-discovery.md) — the
architecture map, the permission interrogation and its findings.

Ask is Infora's conversational surface: grounded question-answering over a
project, web research, codified-workflow execution, multi-step analysis, and
typed workers doing the above. It already exists in thin form (T-052/T-088) —
this specification takes it from a four-step coded chain to an agent harness.

Ask is not a general-purpose assistant. It is a specialist that behaves like a
competent colleague inside UK infrastructure consenting, and whose reliability
can be demonstrated to a client's technical and security teams.

---

## The documents

| # | Document | What it fixes |
| --- | --- | --- |
| — | [phase-0-discovery.md](phase-0-discovery.md) | What exists, what is missing, the permission findings F1–F8 |
| 01 | [01-lens-framework.md](01-lens-framework.md) | The Lens: register, depth and answer shape per user kind |
| — | [lenses/](lenses/) | The five Lens definition files + the authoring guide |
| 02 | [02-worker-registry.md](02-worker-registry.md) | The seven typed workers and their contracts |
| 03 | [03-orchestration-and-plan.md](03-orchestration-and-plan.md) | The two orchestration modes and the plan artefact |
| 04 | [04-model-routing.md](04-model-routing.md) | Task-class routing inside the ADR-0037 tier router |
| 05 | [05-clarifying-questions.md](05-clarifying-questions.md) | Scoping questions and how answers bind into the plan |
| 06 | [06-teach.md](06-teach.md) | Capture and triage, into the ADR-0026 Signal loop |
| 07 | [07-eval-harness.md](07-eval-harness.md) | Cases, fixtures, runner, categories, hold-out |
| 08 | [08-interface.md](08-interface.md) | Composer chips, progress rail, completion footer |
| 09 | [09-permissions-remediation.md](09-permissions-remediation.md) | F1–F8 turned into requirements, sequenced first |

**The tickets live on the board**, not here: [docs/build/plan.md](../plan.md),
Slice Ask, T-245 – T-299. One board and one "next free number" counter, because
concurrent sessions have collided over ticket numbers twice before.

---

## What the MVP builds, and what waits

**Ruled 2026-07-31.** The skeleton/MVP needs one thing from this specification:
Ask returns a **grounded, cited answer whose register changes with the Lens**.
This whole document set stays authoritative — but most of it is *ahead*, not
*now*, and reading it as the near-term build overstates what is coming.

| # | Document | MVP |
| --- | --- | --- |
| 01 | Lens framework | **Yes** — the terminal wave. §4.3's `preferred_workers` rule is deferred (no registry until T-269); §1.1, §1.4 and §1.5 of the shared core are **not deliverable at MVP** (see below) |
| 07 | Eval harness | **Yes, built** — T-255–T-258 complete; T-259's seed set closes the MVP, minus the two cases that rest on workers |
| 09 | Permissions remediation | **Partly** — F2/F3 closed (T-249/T-250), F1/F8 downgraded; T-251 recommended inside the MVP, the rest deferred |
| 03 | Orchestration and plan | **No** — the plan artefact is written (T-260) but nothing executes from it; a Lens is a prompt overlay on the existing coded chain |
| 02 | Worker registry | **No** — the whole of Wave 3 |
| 04 | Model routing | **No** — Wave 5. Task-class routing and the `verify` independence constraint |
| 05 | Clarifying questions | **No** — Wave 6 |
| 06 | Teach | **No** — Wave 7 |
| 08 | Interface | **Mostly no** — Wave 8. The Lens picker rides the existing Ask screen; composer chips, progress rail and completion footer wait |

**Three shared-core promises the MVP cannot keep**, stated here rather than
discovered in a demo. [01](01-lens-framework.md) §1.1 *checkable provenance*
needs locators (T-270/T-271) — citations are version-grain today, and §1.1
itself says an uncheckable citation is functionally an uncited claim. §1.4
*staleness* needs the authority corpus (T-276/T-277). §1.5 *absence detection*
needs the `coverage_note` on `corpus_retrieval` (T-272). The Lens loader can
refuse a file that *weakens* the shared core; it cannot make the runtime *keep*
it. **Non-negotiable 1 is therefore still open at MVP**, and the Lens work does
not close it.

**This folder is not deleted when the MVP closes.** It folds document by
document as each area is actually built (the note at the end of the Slice Ask
block on the board), and code throughout the repo cites its sections by number.
The one part that moves at MVP is [lenses/](lenses/) — the five definition files
and the authoring guide go to `packages/lenses/definitions/` at T-281, as a
move, so no second copy of a domain-expert-owned file survives.

Decision records touched: **ADR-0022** (web research carve-out), **ADR-0027**
and **ADR-0028** (the two orchestration modes), and new **ADR-0046** (the
conflict register). Vocabulary added to CONTEXT.md: **Lens**, and the
consenting-domain terms.

---

## The ten non-negotiables

These constrain every requirement below. Where a requirement and a
non-negotiable conflict, the non-negotiable wins.

1. **No assertion without provenance.** Every factual claim resolves to a
   document, a version, and **either a locator or the verbatim passage** —
   because the property that matters is that a reader can *check* it, and a
   citation nobody can check is functionally an uncited claim. Uncited claims are
   a build failure, not a style issue. *(Already true for the grounded register
   — [ground-check.ts](../../../packages/governance/src/ground-check.ts). The locator-or-quote rule is owner-ruled
   2026-07-29; T-270/T-271 on the board.)*
2. **Permissions are enforced at the data layer, never in a prompt.** Filters
   apply before retrieval. *(Already true — [retrieval.ts:73-83](../../../packages/knowledge/src/retrieval.ts#L73-L83). Guarded by a CI grep, [09](09-permissions-remediation.md) R6.)*
3. **Scope never escalates.** No worker holds a service account with wider reach
   than the requesting user. *(Structurally true today and tested — the child run
   carries the caller's participant id and `assemble` has no widening parameter.)*
   The brief's stronger form — that a worker's access be a strict *subset* — is a
   **hardening, not a requirement**: every worker runs inside the caller's single
   environment, so equal scope leaks nothing. Finding F8, downgraded 2026-07-30.
4. **Label propagation.** Anything written back inherits the most restrictive
   access label of any input that touched it. *(Absent today — finding F2.)*
5. **Untrusted external content never shares a context window with corpus
   content.** Web research returns labelled sources to the orchestrator; it does
   not read the corpus and the corpus does not enter its context. *(Absent by
   omission today — finding F3. Made a type-level impossibility.)*
6. **Workers return structured data, not prose.** The chat agent sees a worker's
   output object, never its reasoning trace.
7. **Workers are leaves.** Only the chat agent orchestrates. The single
   exception is `workflow_runner`, which executes a pre-declared DAG.
8. **No generic escape-hatch worker.** No `research_agent`, no
   `code_execution`, no `do_the_thing`. An eighth worker is almost always a
   workflow that has not been declared yet.
9. **The system never gives an unqualified professional opinion.** It presents
   the position, the evidence and the precedent. It does not say a scheme will
   pass examination or that an assessment is compliant.
10. **Document version status is respected everywhere.** Superseded documents
    are excluded by default and their use is always flagged. *(Exclusion already
    true — [retrieval.ts:75-78](../../../packages/knowledge/src/retrieval.ts#L75-L78). Deliberate opt-in with flagging is new.)*

### And one Infora-specific eleventh

11. **A Lens changes register, never reach.** The Lens shapes how an answer
    reads. It has no effect whatsoever on what data a user can see. This is
    enforced structurally: the Lens is not a parameter of any retrieval or
    access function, and cannot become one.

---

## Gate decisions carried into this phase

Ruled 2026-07-29; recorded in full at [phase-0-discovery.md §4](phase-0-discovery.md).

| Decision | Ruling |
| --- | --- |
| Orchestration | **Both modes, honestly labelled.** Declared orchestration is the product; model-chosen orchestration is a named, weaker-guarantee mode. ADR-0027/0028 amended |
| Web sources | **Citable, in a separate register.** ADR-0022 amended; the worker still holds no corpus access |
| Conflict register | In scope; built as T-245/T-246 with ADR-0046. **Scope corrected 2026-07-30** — an administrative guardrail at enrolment, never an input to access resolution |
| The persona's name | **Lens.** "Role" stays reserved for Membership role |
| Consenting vocabulary | **Admitted to CONTEXT.md** |
| Teach | **A capture path into the ADR-0026 Signal loop**, not a parallel system |
| Teach's boundary | **No aggregation across customers.** Teach improves the originating organisation's own layer only — no shared-domain destination, no de-identified egress to Infora. ADR-0026 applied unchanged |
| The conflict register | **ADR-0046 Accepted, not load-bearing.** Individual grain with an optional org-level form; the consultancy's own org admin declares, the owner may require an audited attestation but never sees the register; a refusal names that a wall applies and nothing more. **It prevents an accidental grant; it does not prevent a leak, because the assembly environment already makes the leak impossible** |
| Citation precision | **Checkable, not merely precise.** Where a format yields no reliable locator, the citation carries the verbatim passage — never a bare version reference |
| The authority corpus | **Two-tier** (ADR-0023 extended). Infora ships the freely-shippable standard tier (legislation, NPSs, PINS advice, DCOs, DLs — no paid subscriptions); organisations add their own licensed standards, guidance and policy into portable org context |
| Mode selection | **No user-facing mode selector.** The system chooses the mode and labels it honestly; the user pins a *tool* ([03](03-orchestration-and-plan.md) §1.4) |

---

## What is deliberately not in this specification

- **Streaming.** The current path returns on completion. Streaming is additive
  and orthogonal; it is named in [08](08-interface.md) as a follow-on, not
  specified here.
- **Cross-project and workspace-scoped Ask.** Deferred by ADR-0031 §3. One
  assembly environment per request stands.
- **A gold-standard case library.** [07](07-eval-harness.md) specifies the
  harness and ten to fifteen seed cases proving every assertion type and
  category. Authoring the real library is the domain expert's work.
- **The org-built worker.** Slice F territory. The registry is designed so an
  org-built worker is expressible, but none is built.
