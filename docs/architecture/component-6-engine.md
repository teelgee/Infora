# Engine (component 6)

The engine is the execution machinery — the thing that actually does the work. It plans and routes work across agents, runs the workflows (standard and custom), calls the capabilities (reusable skills), and produces the run, the audited record of every step. Everything that used to be split across separate components — standard workflows, the custom-workflow builder, and compliance-*checking* — lives here, because they are all the same machine seen from different angles: an engine, the recipes it runs, and the skills it calls.

**This component is largely firmed for the MVP.** Its core — the orchestration / run / agent model — is settled in **ADR-0028** (§1 firm); the thinking-vs-doing build constraint in **ADR-0027** (M2); the Context-assembly contract the chain calls in **ADR-0029** (M3); and the rails the engine runs inside in **ADR-0030**. The remaining structure (the MVP workflow set, workflow-definition mechanics, the custom-builder) is salvaged from the former standard-workflows, custom-workflow-builder and compliance components and is bucket-A reference-decidable, mostly post-MVP. Open questions are tracked in the grill doc.

The pieces are deliberately separated:

- **Orchestration** plans the work and routes it across specialist sub-agents.
- An **agent** is the software actor that runs a workflow's steps, drawing on capabilities and the assembled working input and producing suggestions. Provenance is one of two: an **Infora-built agent** ships with the platform; a **custom (org-built) agent** is built by an organisation, held in org context, and deployable to any project it works on. Both run identically.
- A **workflow** is the governed process behind a work item — the recipe the engine runs. **Standard** workflows are Infora-provided (document production, assurance, feedback triage, compliance check, internal reports, data interrogation, consultation analysis); **custom** workflows are org-built in the builder. Document production is the flagship; the document *review cycle* is the one workflow owned elsewhere, by document management (ADR-0012).
- A **capability** is a reusable domain skill a workflow composes — grounded generation, **compliance checking**, tabular review, plain-English, document understanding, and the chat/QA path. Compliance checking tests a document against the authority corpus, which is owned by Context (component 4, revised ADR-0023): the engine calls the skill, Context holds the corpus.
- A **run** is the recorded execution behind a work item, and the unit of the audit trail.

**Where an agent runs and what governs it is fixed.** Every agent executes inside exactly one assembly environment (ADR-0025), reaching only that environment's channels, and within the governance envelope (component 3), bound by the project's rails. A custom agent deployed into a project inherits the owner's rails and may tighten its own organisation's private work but never loosen them — the access-model invariant (component 2, ADR-0015) applied to governance. Infora-built and org-built differ only in provenance and deployment, not execution.

---

## Sub-component register (provisional)

The cut is by **domain capability**; because the component is largely ungrilled, the register names the parts and their owning concepts, to firm up as M1 and the workflow grills land.

**Cross-cutting.** Every agent runs in one assembly environment (ADR-0025) under the governance envelope (component 3), bound by the project's rails; every run writes each step to the audit trail; access is resolved by the access model (component 2) before any data is touched.

## 1. Orchestration, run and agent (M1) ✅

**Responsibility.** Define what an Agent is against workflow/capability/run/orchestration; how a Work item spawns a Run; how a Run decomposes into steps run by agents and sub-agents; what each step records for the audit trail; the fixed v1 chain (retrieve → draft → ground-check → cite); and the Infora-built vs org-built provenance and deployment model.
**Governing ADRs.** **ADR-0028** — every agent execution is a Run inside a Conversation (optionally bound to a Work item), decomposing into an append-only tree of Steps run by parallel-capable, isolated sub-agents that retrieve only through Context (M3); v1 is a coded spine (retrieve → draft → ground-check → cite) with agentic retrieval leaves. The Agent concept and deployment model are recorded there, not separately, so the actor/run/orchestration trio cannot drift.
**Terms owned.** Agent, Run, Conversation, Step. References Orchestration, Work item.
**Depends on.** Context (component 4) for the assembled working input and the assembly contract (M3); ADR-0012 (the Context/workflow boundary); governance (component 3).

## 2. The workflow set (standard)

**Responsibility.** Provide the Infora-built workflows — document production, assurance, feedback triage, compliance check, internal reports, data interrogation, consultation analysis; decide which ship first (the MVP set).
**Governing ADRs.** 0012 (boundary). **MVP set open.**
**Terms owned.** Workflow, Standard workflow, Assurance (workflow).
**Depends on.** Capabilities (§3); orchestration (§1).

## 3. Capabilities (incl. compliance checking)

**Responsibility.** Hold the reusable domain skills workflows compose — grounded generation, compliance checking, tabular review, plain-English, document understanding, chat/QA; keep each composable and independently callable. Compliance checking tests a document or output against the relevant authority and surfaces gaps and non-conformances (flags, severity, links to the offending text), reading the authority corpus from Context.
**Governing ADRs.** 0012; revised 0023 (the corpus is owned by Context); **0048 — checking-vs-generative and results presentation, ruled 2026-08-01.**
**Terms owned.** Capability, Compliance (the checking skill), **Finding**.
**Depends on.** The model layer (component 1); Context (component 4) for the assembled input and the authority corpus; document management (component 5) for document anchors on results.

**The checker's settled position (ADR-0048).** Output is a list of **findings** — structured records, never prose — each naming the input it arose from (corpus, attached document, or rulebook), an **anchor into the draft**, a severity and its evidence. Three properties are load-bearing:

- **It checks; it does not write.** A finding may carry a proposed revision, but that revision enters the **existing accept/edit/reject Suggestion mechanism** and is never auto-applied — the checker gains no write path the drafting side lacks. Proposed fixes are collapsed by default and never applied in bulk, because a reviewer accepting patches instead of reading findings performs the human check in appearance only.
- **A finding states a defect, never a verdict** — §6's first answer invariant, applied where it is easiest to cross by accident.
- **The rulebook guides, and a finding may quote it verbatim without citing it.** A house rule is an instruction to the author, not a fact about the scheme, so quoting it asserts nothing about the project. **The render must differ from a grounded citation** — a quoted rule is not a source chip. And because the rulebook lives in org context, a **quoted rule is org-private**: a finding quoting Org B's manual must never appear on a surface Org A reads.

## 4. Workflow definition and checkpoints

**Responsibility.** Decide how a workflow is defined (config, code, or composed steps); where the human-in-the-loop checkpoints sit; how a workflow drives a work item's status and ties to the document review/approval lifecycle (component 5).
**Governing ADRs.** **Open.** Relates to ADR-0027 (thinking vs doing — the code/LLM split per step).
**Terms owned.** Work item (shared with document management, component 5, which closes it on acceptance).
**Depends on.** Document management (component 5); orchestration (§1).

## 5. Custom-workflow builder, deployment and rails inheritance

**Responsibility.** Let an authorised role compose a custom workflow or org-built agent held in org context; deploy it into a project bound to that project's assembly environment and governance envelope; inherit the owner's rails (tighten-only, never loosen); express and validate a tightening at deploy time; govern sharing (org-only now, shareable/sellable later) and pre-deploy validation.
**Governing ADRs.** Rails inheritance settled — **ADR-0030** (owner-set ceiling, member tighten-only, deploy-time inheritance for org-built agents; mirrors ADR-0015). Building interface, tightening validation and sharing **open**.
**Terms owned.** Custom workflow, custom (org-built) agent.
**Depends on.** Org context (component 4) as the home; governance (component 3) for the envelope and rails; access model (component 2); assembly environment (ADR-0025).

## 6. Answer invariants

*Moved here from the Ask slice's non-negotiables 2026-07-31 — properties of what
the engine may say and how a persona may shape it, which outlive the slice that
wrote them down.*

**Responsibility.** Hold two guarantees about the engine's output:

1. **The system never gives an unqualified professional opinion.** It presents
   the position, the evidence and the precedent. It does **not** say a scheme
   will pass examination, or that an assessment is compliant. Infora assists; a
   human checks, edits and signs off, and the consultant carries the
   professional liability (the 2026-07-12 ruling). This is a product boundary,
   not a prompt preference.
2. **A Lens changes register, never reach.** A Lens shapes how an answer *reads*
   — tone, depth, ordering, what it foregrounds and what it refuses — and has
   **no effect whatsoever** on what data a user can see. Enforced structurally
   rather than by convention: the Lens is not a parameter of `resolveAccess`,
   `assemble` or `groundedLibrary`, and cannot become one. Giving different
   personas different data would be a permission control hiding inside a
   preference.

**Governing ADRs.** 0021, 0027, 0028; ADR-0015/0016 for why the persona is a
**Lens** and not a `role` (that word is taken by Membership role).
**Depends on.** Orchestration (§1); the access model (component 2 §7), which
owns the reach half of invariant 2 and must stay the only owner of it.
**Verified by.** T-281's signature test, and eval case `PERM-05` — the same
question under all four Lenses must return an identical source set.

---

## Deferred or handed to other components

- **The document review cycle.** The one workflow owned by document management (component 5), not here (ADR-0012).
- **The authority register/corpus.** Owned by Context (component 4, revised ADR-0023); the compliance-checking capability reads it but does not own it.
- **The governance envelope and rails authority.** Owned by governance (component 3); the engine runs inside it and inherits rails at deploy time.
- **Cross-org marketplace / monetisation** of custom workflows. A later question, flagged not designed.
- **Open questions** — the M1/M2 grills, the MVP workflow set, workflow definition and checkpoints, the building interface, tightening validation, sharing and pre-deploy testing — are tracked in the grill doc.

## Repository mapping

The planner, sub-agents, tool registry and run state live in `orchestration`; the capabilities (incl. compliance checking) in `capabilities`; the workflows that compose them in `workflows`; custom workflows and agents are authored against those and stored in `knowledge` (org context). `api` composes `workflows`; governance and audit wrap them from `governance`. See the build layer's repo-structure.
