# Reference — Legora: architecture, approach & tech stack (our interpretation)

**What this is.** An external **reference record**: my best interpretation of how Legora (legal-AI workspace, formerly Leya) is built, assembled from public sources. Legora is the nearest public analogue to Infora — the same "profession-AI workspace" shape, one profession over (law, not construction consulting) — so it is the product we consciously mirror in many places. This record exists to be **checked against**: when we produce an ADR, component doc or data model, we test our choice against "what does Legora do, and are we mirroring or deliberately diverging?"

**Status & honesty.** Interpretation, not authority. Legora publishes architectural *philosophy and capability* freely but little implementation detail, so this mixes **direct quotes** (marked) with **reasoned inference** (marked *(inferred)*). Dated **2026-06-29**; re-verify before relying on a specific claim. Not part of the Infora design layer (CONTEXT.md / overview / component docs / ADRs / grill tracker) or the build layer — it describes *another company's* system. Sources at the foot.

**How to use it.** Two operational sections do the work: **§9 What Infora mirrors** (the Legora→Infora mapping, by term/ADR) and **§10 Where Infora deliberately differs**. Start there when checking a record.

**Companion doc.** [legora-ui-review.md](legora-ui-review.md) (2026-07-05) covers what this doc does not: Legora's observed product surfaces, UI patterns and aesthetic — navigation, chat/editor split, edit granularity, citations, run history, style tokens. Use this doc for architecture questions, that one for surface and UI questions.

---

## 1. What Legora is

A collaborative AI workspace for legal teams: research, drafting, review, document analysis and client delivery in one place. Founded 2023 (as Leya) by Max Junestrand, Sigge Labor, August Erséus; rebranded Legora 2024; YC W24. Serves ~800 law firms across ~16 countries, targeting cross-border M&A, regulatory work and large-scale contract review. As of **May 2026** the architecture is branded the **aOS — "agentic operating system."**

Positioning shift worth noting: from a workspace-of-tools to *"a single connected system"* that orchestrates agents end-to-end — "from first-mile matter intake, through research, drafting, and review, to last-mile client delivery." This is the direction Infora's Engine is also taking.

## 2. The execution model — the part we mirror most

Legora runs **two execution modes on one orchestration substrate (the aOS)**:

- **The Agent (open mode).** "Sits at the heart" of the aOS. It will *"plan, execute, review, and deliver the final product, involving you where human judgment is required."* It plans its own approach: *"It dynamically selects the right tool based on the task — creating a Tabular Review, running Legal Research, analyzing Monitors."* This is the open-ended agentic planner.
- **Workflows (defined mode).** *"agentic in the sense that it can make some decisions, but you still define the steps. Within those steps, it might choose how best to search or which terms to use. But it doesn't go off-script."* A defined-step spine with bounded agentic freedom inside each step.

The two are **modes above one substrate**, not two systems: *"a single connected system,"* and a single Workflow can itself *"create a Tabular Review… invoke a web search… and verify citations via a legal database"* — i.e. capabilities are called as composable tools from either mode, and the system *"picks up where the last round left off"* (shared memory/history across runs).

**The orchestration layer ("agentic harness")** is described as *"the orchestration layer that turns LLM technology into domain-specific agents,"* explicitly owning five concerns: **tool routing, control flow, memory management, model selection, and guardrails.**

**Sub-agents.** The Agent *"dispatches sub-agents to work in parallel across corporate, IP, commercial, employment, real estate, data protection, litigation, and tax"* — i.e. **domain-specialist sub-agents running in parallel**. This is the orchestrator-worker pattern (cf. Anthropic's multi-agent research system: a lead agent spawning 3–5 isolated sub-agents in parallel, each with a self-contained task and fresh context, synthesised with a separate citation pass).

**Human-in-the-loop.** *"It pauses when judgment is needed, flagging the calls a senior associate would otherwise pre-write."* Oversight is a first-class control point, not an afterthought — lawyers *"want to see what the system is doing, and they value transparency… they can guide or correct it when needed."*

## 3. Retrieval & grounding (RAG)

Answers are grounded in source documents with reliable citations: Elastic *"anchors responses in actual legal documents and specific laws, ensuring citations are accurate and reliable."* Vector search surfaces *"semantically related legal cases even when search terms differ"* — i.e. hybrid semantic + keyword retrieval over the legal corpus, citation-linked back to source. RAG is delivered *"through its 'AI Agents' feature… across multiple documents."*

## 4. Capabilities (the composable skills)

- **Tabular Review** (signature differentiator). Bulk documents → a structured grid: *"one row per document, one column per question, with each cell linked to the source."* Columns are prompts; users *"shape the data… specifying formats, filtering, and sorting."* Collaboration: *Mark as Reviewed, Lock Cells, Review Mode.* Import from *DMS, databases or VDRs.* Runs at scale via *"tens of thousands of parallel calls"* — concrete proof of why sub-agent/parallel fan-out matters.
- **Legal Research** — cited synthesis over case law and legislation.
- **Monitors** — ongoing watch/analysis (referenced as a tool the Agent can invoke).
- **Drafting / summarisation / analysis** — general workspace capabilities.

## 5. Models & the router

Multi-model with redundancy, "always the latest": **GPT-4o** and **o1** via **Azure OpenAI**, *and* **Anthropic Claude** (chosen for *"strong reasoning, longer context windows, and safety-focused design"* for hundred-page documents). Migrated from raw OpenAI APIs to Azure OpenAI for *"enhanced security, compliance, and data privacy."* The router selecting a model per task is one of the aOS's five named concerns ("model selection").

## 6. Knowledge / the moat

Institutional knowledge layered into every agent action: *"firm playbooks, precedent libraries, clause banks, negotiated positions, and full matter history,"* such that the system *"compounds institutional knowledge into every piece of work."* The moat is **retrieval + accumulated firm knowledge + workflow capture**, not a model trained on client data — the same thesis as Infora's org context / informing channel / Knowledge.

## 7. Tech stack & infrastructure *(inferred where unmarked)*

- **Cloud:** Microsoft Azure (EU regions for residency).
- **Models:** Azure OpenAI (GPT-4o, o1) + Anthropic Claude.
- **Search/RAG:** Elasticsearch (vector + keyword; their core search platform — *"stability, performance, and scalability… instead of managing search infrastructure"*).
- **Tenancy:** multi-tenant with **authentication on every query**.
- **Surfaces/integrations:** Web workspace, **Microsoft Word add-in**, **Outlook add-in**, **SharePoint**, DMS / legal-research-database / VDR / email connectors, and **MCP** connectors feeding agent context. **Portal** for firm-to-client collaboration.
- **App stack** *(inferred; no primary source)*: conventional SaaS — React frontend, a service backend, Postgres-class relational store alongside Elastic. (The one "how to build like Legora" article found was generic and AI-light; treat its stack claims as unverified.)

## 8. Security, tenancy & compliance

EU-native data-residency architecture (GDPR without extra contractual safeguards), **ISO 27001:2022**, **SOC 2 Type I & II**. Multi-tenant; auth on every query. Critically — **the tenant boundary is the firm**: Legora isolates one firm from another, but operates *inside* a single firm. It has no published equivalent of multiple independent organisations collaborating on one shared matter behind an ethical wall.

## 9. What Infora mirrors (Legora → Infora)

| Legora | Infora equivalent | Infora ref |
|---|---|---|
| aOS orchestration layer (tool routing, control flow, memory, model selection, guardrails) | Engine — orchestration + Router + governance | component 6; **ADR-0028** |
| Agent (open) vs Workflows (defined-step, "doesn't go off-script") | Conversation-run (open, post-MVP) vs Work-item-run (defined spine); v1 holds the coded spine for both | **ADR-0028 §1, §5** |
| Parallel domain-specialist sub-agents | Parallel-capable, isolated sub-agents; child Runs | **ADR-0028 §3, §4** |
| Capabilities called as composable tools (a Workflow invokes Tabular Review, search, citation check) | Capabilities as typed tools via a registry | **ADR-0028 §6**; Engine §3 |
| Separate citation step / cite-linked cells | Standalone `cite` step in the v1 chain | **ADR-0028 §6** |
| Pause-for-judgment HITL | Human-in-the-loop checkpoints | Engine §4 (open) |
| RAG grounding, citations, hybrid vector+keyword | Grounded channel; hybrid retrieval | ADR-0021, **ADR-0022** |
| Elasticsearch (vector+keyword, co-located) | pgvector co-located with relational | **ADR-0024** |
| Firm playbooks / precedent / matter history as moat | Org context / informing channel / Knowledge | ADR-0020, ADR-0026 |
| Multi-model router, "always the latest" | Router (model-agnostic) | component 1; CONTEXT "Router" |
| Word/Outlook add-in, DMS/VDR connectors, MCP | Surfaces (Word add-in) + Connectors | components 7, 8 |
| Tabular Review (row=doc, col=prompt, cell→source) | Tabular-review capability | Engine §3 (stubbed in v1) |
| Azure, EU residency, SOC2/ISO27001, auth-per-query | Governance/security posture | component 3 (open infra session) |

## 10. Where Infora deliberately differs

1. **The ethical wall — the big one.** Legora's tenant = one firm; it isolates firms from each other but works *within* a firm. **Infora has multiple independent organisations (owner, consultants, contractors) on one shared project, walled from each other**, with org context portable across rival clients. This is a harder access problem than Legora solves, and it forces machinery Legora doesn't need: access-resolution-*before*-retrieval, the assembly environment (ADR-0025), the distillation/egress boundary (ADR-0026), and the rule that **all retrieval — even agentic sub-agent retrieval — routes through Context** so the wall holds by construction (ADR-0028 §4). When mirroring a Legora pattern, always re-ask: *does it survive the cross-org wall?*
2. **Grounding-by-privacy invariant.** Infora's hard line — only non-private sources may ground, because a citation enters the shared record (ADR-0021) — has no Legora analogue (a firm's own corpus is all "groundable" to it). Our channel split (grounded / guiding / informing) is finer than Legora's flat firm-knowledge layer.
3. **Document-control rigour.** Infora carries a controlled-document lifecycle (immutable revisions, DRR, transmittal, assurance cycle — ADRs 0001–0014) from the construction-deliverable world. Legora's document handling is lighter (analysis and drafting, not a controlled-record regime).
4. **Determinism posture.** Infora commits to thinking-vs-doing / deterministic-by-default (ADR-0027) and a coded v1 spine even for chat (ADR-0028 §5), trading agentic flexibility for *provable* grounding. Legora leans more openly agentic in its Agent mode. We are deliberately more conservative for v1.
5. **Regulator-defensibility of the audit trail.** Infora makes the Run/Step record append-only and immutable, capturing the access-resolved source set and rail outcomes per step (ADR-0028 §3, §7). Legora emphasises transparency/oversight but publishes no equivalent immutability commitment.

## 11. Gaps — what we don't know about Legora

Unconfirmed from public sources (do not assume): whether Agent/Workflows/Tabular share one literal "run/thread" data primitive or are merely unified at the orchestration layer; the audit/history persistence model; how (or whether) they enforce determinism in any step; embedding/model-routing specifics; how memory is scoped and expired; their data model. Treat the mirror as *architectural shape*, not implementation detail.

---

## Sources
- [Elastic — Legora customer story](https://www.elastic.co/customers/legora) (RAG, vector search, Elasticsearch, Azure, multi-tenant, ISO/SOC2)
- [Microsoft — Legora & Azure OpenAI](https://www.microsoft.com/en/customers/story/23171-legora-azure-openai) (GPT-4o/o1, Azure OpenAI, multi-agent, parallelism, Word/SharePoint)
- [aivortex — Legora tool profile](https://www.aivortex.io/legal/ai-tools/legora/) (Claude foundation, Tabular Review, EU residency, workspace model)
- [Legora — aOS product page](https://legora.com/product/aos) (orchestration layer, the five concerns, parallel sub-agents, knowledge layering)
- [Legora — aOS newsroom announcement](https://legora.com/newsroom/legora-introduces-the-legora-aos-the-agentic-operating-system-for-legal-work)
- [Legora — Introducing the Agent](https://legora.com/blog/introducing-the-agent) (plan/execute/review/deliver, dynamic tool routing, parallel domain sub-agents, pause-for-judgment)
- [Legora — How agentic systems unlock more flexible workflows](https://legora.com/blog/how-agentic-systems-unlock-more-flexible-workflows) (the "you still define the steps… doesn't go off-script" quote)
- [Legora — Workflows launch](https://legora.com/blog/legora-workflows-the-orchestration-layer-for-legal-work)
- [Legora — Tabular Review product page](https://legora.com/product/tabular-review) (row/column/cell-to-source model, collaboration, VDR/DMS import)
- [Artificial Lawyer — Legora launches aOS](https://www.artificiallawyer.com/2026/05/07/legora-launches-aos-agentic-operating-system/)
- Adjacent (not Legora, used for the agent-pattern reference): [Anthropic — multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system); OpenAI Assistants API (Run / run-step schema).
