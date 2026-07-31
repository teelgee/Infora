# Context (component 4)

Context is everything that can be assembled into an agent's working input, and the layer that assembles it. It is the moat: per-project knowledge, per-programme knowledge for a programme owner, and per-firm portable knowledge, all compounding the longer a project runs — by retrieval and codified workflows, never by training on customer data (ADR-0026). The component holds the stores, decides which of them may ground and which may only steer, retrieves from each, and assembles one working input per request without private material ever crossing an ethical wall by construction.

Context is the umbrella; **Knowledge** is the curated store within it. **Source** is raw ingested material; **Knowledge** is curated, structured memory — decisions, commitments, precedent positions, history — distilled from sources and signals. The two are not interchangeable: a Source is what came in, Knowledge is what we chose to keep and shape.

**The store model is three scoped stores, all private to their scope (ADR-0020).** Org context is private to one organisation and portable to every project it touches. Programme context is private to a programme owner and scoped to that programme's projects. Project context is scoped to one project and shared among its members by access. Grounding is bounded by confidentiality under one rule — **a scope may ground its own projects but never grounds outside itself**. So org context informs only (it travels to unrelated clients and must never ground a claim); a programme owner may let its own projects ground on programme-scoped corpora and sibling-project libraries, configured per project; and project context is the access-resolved grounding store. One working input is assembled per request from the requester's own private stores plus the access-resolved project slice, so org context never reaches another organisation by construction rather than by a redaction pass.

**Every input plays exactly one of three channel roles — grounded, guiding, informing (ADR-0021).** The dividing invariant is privacy: only non-private sources may ground, because a citation enters the shared project record and must never carry private material across a wall. So the grounded channel carries two non-private corpora — the access-resolved **project library** (cited as project fact) and the public **authority corpus** of legislation, policy and standards (cited as external authority) — while every private store can only steer. Steering splits by scope: the **guiding channel** is project-scoped steering (templates, style guides, guardrails, owner-curated into project context); the **informing channel** is private steering held in org and programme context (precedents, custom workflows, firm know-how), classified by ownership not purpose and never cited. This refines ADR-0011's "sole grounded corpus" to "any non-private corpus may ground".

**Retrieval is a separate pipeline per channel and per grounded corpus (ADR-0022).** The library is searched hybrid (vector + code/metadata) over its single live version per container, with superseded and withdrawn deliverables excluded; the authority corpus is searched as its own pipeline, public and licence-gated. An **attached-source** mode lets a user pin a specific document — including a sandbox file the channels never reach — to a single generation without it joining any corpus: badged distinctly from a grounded citation, so the trust distinction stays honest and the audit records who vouched for it.

**Every request runs inside exactly one assembly environment (ADR-0025), which — not the user's identity alone — sets the channels reachable to it.** A project environment reaches that project's grounded and guiding channels (access-resolved to the requester) plus the requester's own informing channel and the universal authority corpus; an organisation's own workspace reaches only its own informing channel and the authority corpus. The informing channel is portable and travels with a Participant into every environment; a project's grounded and guiding channels are fixed to that project and never travel. So one consultant in client A's project reaches A's context; the same consultant in client B's project reaches B's; A's context is never reachable from B's environment, by construction. Sandbox privacy is a separate axis: a private project sandbox still reaches its project's channels.

**The moat compounds without leaking through a distillation and egress boundary (ADR-0026).** Confidentiality is enforced by two mechanisms: the assembly environment makes another client's material structurally unreachable elsewhere, and a destination rule restricts what may feed portable org context to the firm's own material with client facts stripped (ownership of the material, then of the facts within it). Admission to portable Knowledge is a deliberate, abstracting curation act, never automatic. The moat compounds by retrieval and codified workflows; any future training use is per-tenant on de-identified or aggregate data only. The honest limit: this defeats automated and accidental leak; deliberate human egress is tracked and audited, not physically prevented.

**The store substrate is pgvector, co-located with the relational access data (ADR-0024).** This is the long-term substrate, not just the skeleton — chosen so vectors sit beside the memberships, per-deliverable grants, walls and document state that ADR-0022 must pre-filter on, keeping access-resolve-before-retrieve a real pre-filter rather than a leaky post-filter. Embeddings are pinned and versioned per index; a model change is a re-index migration, and domain-tuned embeddings are trained only on de-identified or non-client data.

Context owns the **authority register** (revised ADR-0023): the universal authority corpus of legislation, policy and standards, maintained Infora-wide with its own lifecycle — in-force currency, jurisdiction tagging, and a licensing gate for paid standards. It is the grounded channel's second corpus, public and not access-resolved (the law is the law). The compliance-checking capability (in the Engine, component 6) reads it but does not own it. The **project library** is owned and curated by document management (component 5); Context grounds on it but does not store it.

---

## Sub-component register

The structural breakdown of the context component into its build-able parts. Five artefacts divide the labour and this register is one of them: `CONTEXT.md` is the **language** (the glossary); the [overview](infora-overview.md) is the **vision** and whole-system map; this component doc is the **structure** (the prose above and the register here); `docs/adr/` holds the **decisions** (why each fork went the way it did); and the [grill tracker](../grill-sessions/grill-questions.md) is the **process log and open-questions backlog**. The register references the others rather than restating them.

The cut is by **domain capability**: the distinct jobs the layer does between a raw source arriving and an assembled working input leaving. A single request touches several at once.

**Cross-cutting, true of every capability below.** Grounding follows one rule set by confidentiality — a scope may ground its own projects but never outside itself (ADR-0020). Access is resolved by the access model (component 2) *before* any retrieval, so citations are safe by construction, never scrubbed after. Every ingestion, retrieval and assembly is written to the audit trail under the governance envelope (component 3).

---

## 1. Context stores (org / programme / project)

**Responsibility.** Hold the three scoped stores, each private to its scope; keep org context private-by-construction and inform-only; let a programme owner ground its own projects configurably; make project context the only access-resolved, groundable scope.
**Governing ADRs.** 0020.
**Terms owned.** Context, Org context, Programme context, Project context, Source, Knowledge, Precedent.
**Depends on.** Access model (component 2) for the project-context access resolution; document management (component 5) for the project library it grounds on.

## 2. Channels (grounded / guiding / informing)

**Responsibility.** Classify every input into exactly one of three roles; hold the privacy invariant that only non-private corpora ground; carry the two grounded corpora (project library, authority corpus) and the two steering channels (project-scoped guiding, ownership-scoped informing).
**Governing ADRs.** 0021, 0011 (refined).
**Terms owned.** Channel, Grounded channel, Guiding channel, Informing channel. References the Authority corpus, owned here by Context (§8, revised ADR-0023), and the Project library, owned by document management (component 5).
**Depends on.** Context stores (§1); the guiding channel also configures the Rail (component 3), since a guardrail can be expressed as a negative constraint.

## 3. Channel retrieval and attached source

**Responsibility.** Run a separate retrieval pipeline per channel and per grounded corpus; search the library hybrid over its single live version per container with superseded/withdrawn excluded; search the authority corpus public and licence-gated; offer the attached-source mode for user-pinned inputs. Carry the ontology's **semantic pre-filter** in the same statement as the access + state pre-filter (ADR-0045, extending 0022/0024): a scoped retrieval narrows to the containers under given classification terms *before* any embedding is compared. The vocabulary is owned by document management (component 5); Context owns only its application to retrieval — **and what selects the scope for a given question is open** (Session 6, grill tracker), so the pre-filter ships unwired from the agent path.
**Governing ADRs.** 0022, 0024, 0045.
**Terms owned.** Attached source.
**Depends on.** Context stores (§1); store substrate (§6); the access model (the pre-retrieval filter); document-state rules and the classification vocabulary from document management (component 5).

## 4. Assembly environment

**Responsibility.** Run every request inside one environment that fixes the reachable channels; keep the informing channel portable and the grounded/guiding channels fixed to their project; separate sandbox privacy from channel reachability; define the own-workspace (no-project) case.
**Governing ADRs.** 0025.
**Terms owned.** Assembly environment.
**Depends on.** Access model (component 2) for the requester resolution within a project environment; the channels (§2).

## 5. Distillation and egress boundary (the moat write loop)

**Responsibility.** Distil Knowledge from Sources and Signals; enforce the destination rule on what may feed portable org context (own material, client facts stripped); keep admission a deliberate curation act; ensure the moat compounds by retrieval and codified workflows, never by training on customer data.
**Governing ADRs.** 0026, 0016 (visible ≠ distillable), 0027 (thinking-vs-doing, the compiled-rule improvement path).
**Terms owned.** None uniquely; operates on Source, Knowledge, Precedent, Signal.
**Depends on.** Assembly environment (§4, the structural mechanism); the Signal sink in document management (component 5, where Signals are captured). **Largely open** — the distillation *engine* and Signal *sink* are not yet grilled (Sessions 4 and 7); see the grill doc.

## 6. Store substrate

**Responsibility.** Hold the per-tenant corpora in pgvector co-located with relational access data so the access filter is a real pre-filter; pin and version embeddings per index; treat a model change as a re-index migration.
**Governing ADRs.** 0024.
**Terms owned.** None uniquely; the physical substrate for §1–§3 and §8.
**Depends on.** The `db` and `data` packages (Foundation, component 1).

## 7. Guidance note (per-document steering)

**Responsibility.** Generate and maintain a per-document living `.md` from the Signals gathered as people edit and interact with an agent on a document; steer any agent working on that document without ever grounding or being cited; travel with the document beside its immutable revisions, with visibility following document access.
**Governing ADRs.** 0002 (lives beside the immutable revision), 0006 (not a sidecar). **ADR pending** — the guidance-note decision and its residual cross-organisation confidentiality question are not yet grilled; see the grill doc.
**Terms owned.** Guidance note.
**Depends on.** The Signal (document management, component 5); document access (access model, component 2).

## 8. Authority register (the authority corpus)

**Responsibility.** Hold and keep current the universal authority corpus (legislation, government policy, published standards, regulatory requirements); operate its lifecycle — ingestion, in-force currency, jurisdiction tagging, a licensing gate for paid standards; serve it dual-purpose, retrievable for generation on the grounded channel and as the reference the compliance-checking capability tests against. Public and not access-resolved (the law is the law).
**Governing ADRs.** 0023 (revised — register owned here in Context). Operational detail (encoding, currency cadence, jurisdiction) **open**.
**Terms owned.** Authority corpus, authority register.
**Depends on.** Channels (§2) and retrieval (§3); the model/data packages for ingestion. The compliance-checking capability (the Engine, component 6) reads it but does not own it.

---

## Deferred or handed to other components

- **The authority register's operational detail** (encoding format, currency cadence, jurisdiction scope). Owned here in Context (§8, revised ADR-0023) but not yet grilled — formerly tracked under the compliance capability.
- **The project library's storage and curation.** Owned by document management (component 5, ADR-0011). Context grounds on it but does not store it.
- **The Signal capture surface** (accept/edit/reject on Comments and Suggestions). Captured in document management (component 5); Context is the eventual sink (Session 7, open).
- The **Context-assembly contract + v1 channel merge** is settled → **ADR-0029** (one gateway call, access-resolved before retrieval, grounded-first merge within a token budget; agentic sub-agent retrieval on the same signature).
- **Open questions** — library RAG strategy (contextual retrieval), the distillation engine, precedent selection, and the full channel ranking/budget beyond M3's naive merge — are tracked in the grill doc, not restated here.

## Repository mapping

The stores, distillation and signal capture live in the `knowledge` package (the moat); the connectors, ingestion and retrieval live in `data` (pgvector); the physical schema and migrations in `db`. The context-assembly contract the orchestrator calls sits at the `knowledge`/`orchestration` boundary (ADR-0012; the v1 contract is ADR-0029). Access resolution is enforced in `governance` at the API boundary before any retrieval runs. See the overview's app-architecture diagram.
