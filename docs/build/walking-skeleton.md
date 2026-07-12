# Walking skeleton — the first build slice

> **Status: spec, 2026-07-01.** The first slice of Infora built as a **thin vertical through the whole shape**, not one layer built deep — so the architecture is proven end to end before anything is built out. Promoted from the grill tracker's [Path to MVP](../grill-sessions/grill-questions.md) into a standalone build spec. It is written against the [data model](data-model.md) and ADR-[0028](../adr/0028-orchestration-run-agent-model.md) / [0029](../adr/0029-context-assembly-contract.md) / [0027](../adr/0027-thinking-vs-doing.md), and includes the Copilot Ask surface (ADR-[0031](../adr/0031-copilot-ask-surface.md)). It invents no design: where it meets an undecided question it points **↩ back to the grill tracker**, it does not resolve it. Read the [data model](data-model.md) first; this spec assumes its five drawers.

## The journey this slice must run

One scenario, end to end (from the grill tracker and ADR-0028's Context):

> A consultant opens a project and asks the chat to draft a short governed section from the project's own sources. The orchestrator runs a real chain — **retrieve → draft → ground-check → cite** — and logs every step. The draft appears in the editor with citations. The consultant **accepts, edits, or rejects**, and that **Signal** is captured. The owner then logs in on a different role and sees the **work item** with live status and the full **audited run**, with access correctly scoped. Separately, the same consultant tags **`@Infora`** in Microsoft 365 Copilot, names the project, and gets the same grounded, cited answer back in Copilot — read-only, over the same API.

Nothing in this journey is faked at the seams. The seams — access resolution, the append-only audit trail, retrieve-through-Context, the Signal capture — are the whole point of a walking skeleton and are **real**. What sits *inside* a box may be thin (one model adapter, one sub-agent, a naive channel merge), but every box and every wire between them exists.

---

## The scope cut — real vs stubbed

The discipline (ADR-0028 §9): the *spine* is real, the *sophistication* is stubbed. Everything the wall, the audit trail, or the core journey depends on is real; everything that is moat or breadth is stubbed behind a real interface so it can be filled later without reshaping the skeleton.

### Real in the skeleton
- **The access model** — Organisation / User / Project / Membership / Participant (data-model Drawer 1; ADR-0015–0018). Access is resolved **before** retrieval, as a hard predicate, on every request (ADR-0022, ADR-0029 §2). This is the wall; it is never stubbed.
- **The Context-assembly gateway** — one call `(request, environment, requester) → assembled working input`, access-resolved inside the call, no scope-widening parameter (ADR-0029). In the skeleton the grounded channel (project library) is real; guiding and informing channels exist on the signature but may return empty.
- **The orchestration spine** — Conversation / Run / Step as an **append-only, immutable tree** (Drawer 3; ADR-0028 §3). The coded chain `retrieve → draft → ground-check → cite` runs the same way every time (ADR-0028 §5, ADR-0027 §6).
- **One retrieval sub-agent** — the `draft`/`retrieve` path spawns exactly one child Run to exercise the tree (`parent_run_id`, `child_run_id`), retrieving **only** through the Context gateway (ADR-0028 §4).
- **Grounded generation** — one model adapter behind the Router interface (`packages/model`); the single *thinking* leaf (ADR-0027 §6).
- **The `ground-check` verifier and `cite` resolution** — deterministic *doing* leaves; every grounded claim resolves to a retrieved source or is withheld (ADR-0027 §6, ADR-0028 §6). This is what makes "every grounded answer is verified and cited" provable, not probabilistic.
- **The full audit fields per Step** — model + version, tokens, cost, the **access-resolved source set**, and the **rail outcomes** (ADR-0028 §7). The two defensibility fields are populated, not placeholder.
- **The sandbox document** — the draft's home: a real, freely-editable working copy (manual editing with no agent, no Suggestion, no Signal — the draft-location decision below). The AI never grounds on it (ADR-0011).
- **Signal capture** — accept / edit / reject stored as an append-only Signal (Drawer 4; ADR-0028 §9); accepted or edited content is applied to the sandbox document.
- **The owner's cross-role read** — a second Participant, a different role, sees the work item's live status and the full run, access-scoped.
- **The Copilot Ask surface** — `@Infora` reaches the same Ask path over the same API, one project bound per conversation, read-only (ADR-0031).

### Stubbed or deferred (behind a real interface)
- **The Signal *sink*** — Signals are captured but distilled into nothing; the moat-write loop is Session 7 (data-model Drawer 4 note). *Capture real, loop thin.*
- **Other capabilities** — compliance checking, tabular review, plain-English, document understanding are registered as tool slots but not implemented (ADR-0028 §6, §9).
- **Custom / org-built agents** — Infora-built agent only in v1; `agent_provenance` carries the field, deployment is stubbed (ADR-0028 §8).
- **Parallel fan-out** — the tree is parallel-*capable* but v1 runs one sub-agent (ADR-0028 §4).
- **Multi-model routing** — one adapter behind the Router; no real model selection (ADR-0028 §9).
- **Real channel ranking / budget** — v1 is grounded-first concatenation within a fixed token budget; org-vs-programme precedence and contextual retrieval are Session 6 (ADR-0029 §5).
- **The full review cycle** — transmittal, round phases, two-level coding, snapshots (ADR-0005–0014). The skeleton draws only enough DRR/Comment for the owner to see status (data-model Drawer 5).
- **Drafting/Signals from Copilot** — Copilot is read-only; the Word add-in remains the drafting/Signal surface (ADR-0031 §6). The Word add-in itself is out of this slice.
- **The full sandbox model** — shared/private project sandboxes, the workspace sandbox, folders, the owner's audited override (ADR-0018/0019). The skeleton carries only the minimal Sandbox document table (one implicit private sandbox per organisation); the rest returns as its own drawer.
- **Programme / org-context / Knowledge stores, attached sources, authority-corpus internals, rails as scoped records** — all post-MVP drawers (data-model "What this first cut deliberately omits").

---

## ✅ Draft location — decided (owner-confirmed 2026-07-04)

The one design gap the data model flagged (Drawer 2 ↩) is closed, and the answer is neither of the two options as originally framed:

**The draft lives in the sandbox, as a real working document.** A **sandbox document** is an ordinary editable working copy: a consultant — or any user — can create it and edit it manually, exactly as they would if AI did not exist, with no Suggestion, no Signal, and no versioning ceremony (the sandbox definition, CONTEXT.md). A **Suggestion** exists only when a user prompts an agent to propose content — in the skeleton through the web editor's chat, later through the Word add-in. The Suggestion holds the proposed content and its Citations; the resolution (accept / edit / reject) is the Signal; accepted or edited content is applied to the sandbox document. Promotion from the sandbox into a controlled `Version` remains a document-management bridge, **stubbed** in this slice, exactly as before.

Against the original recommendation (a), this adds one small real table — the **Sandbox document** (data-model Drawer 2) — as the draft's home, rather than the draft dangling off the Suggestion alone. Drawer 2's controlled tables (`Container`/`Version`) stay read-only in this slice. M3 is unchanged in substance (the *proposed* draft is still held on the Suggestion); M4 gains the sandbox-document editor, manual editing, and the apply-on-accept write.

---

## Milestones

Six slices, built in order. Each is a thin cut that leaves the system runnable; the vertical is proven progressively rather than integrated at the end. Package names are from [repo-structure.md](repo-structure.md) (provisional).

### M0 — Foundation: schema, contracts, one model, seed data
Stand up the substrate the vertical rides on.
- **Data model:** all five drawers migrated (`packages/db`), append-only tables enforced at the DB layer (insert-only, no update/delete grants on `Version`, `Run`, `Step`, `Signal`, `Comment`).
- **Contracts:** the seed of `packages/contracts` — the handful of typed endpoints the journey needs (assembly call, run-a-chat, resolve-a-suggestion, read-work-item). Firmed in [contracts.md](contracts.md) next; M0 stubs the types.
- **Model:** one provider adapter behind the `packages/model` Router interface — the single seam multi-model routing fills later.
- **Seed:** two Organisations (an owner and a member — so the wall is *testable*, not just asserted), one Project with one owner + one member Membership, Participants for a consultant (member) and an owner user, **plus the wall-test subjects — one member-org User with no Participant on the project, and a third Organisation with no Membership at all** (M1's and M6's deny paths need them to exist), **one Work item** (`document_production`, titled, assigned to the consultant Participant — the governed-work anchor M3–M5 run against), and a small project library (a handful of live `Container`/`Version` rows `in_library = true, state = live`) to draft from.
- **Acceptance:** migrations apply clean; an attempt to `UPDATE` or `DELETE` an append-only row is rejected at the DB layer; seed produces one project two organisations can be scoped against.

### M1 — The access spine
Make access resolution real and hard, before anything reads a store.
- Resolve `(organisation, Participant, project)` → entitled slice; a hard predicate, not a post-filter (ADR-0022, ADR-0029 §2).
- **Acceptance:** the consultant's Participant resolves on the project; a User from the *second* organisation with **no** Participant on the project resolves to **nothing** (ADR-0031 §5's deny path, exercised on the native surface); there is no code path by which a caller passes a scope the predicate did not admit.

### M2 — The Context gateway
The one assembly call the `retrieve` leaf is coded against (ADR-0029).
- One signature `(request, environment, requester) → assembled working input`; access resolution (M1) runs **inside** the call, before retrieval; per-channel pipelines behind it (ADR-0022, ADR-0029 §3).
- v1 merge: **grounded-first concatenation within a fixed token budget**, drop lowest-priority channel first (ADR-0029 §5). Grounded = the project library (real); guiding/informing may be empty in the skeleton.
- Each returned item carries **channel + source identity** so the caller can cite grounded items and never cite steering ones (ADR-0029 §1).
- Both call modes on the one signature: **baseline** (run open) and **targeted** (sub-agent mid-run) — ADR-0029 §4.
- **Acceptance:** a query returns only library content the requester's Participant can reach; the same query from an unentitled requester returns nothing (the wall holds *through the gateway*, not by caller discipline); no parameter exists to widen scope; the response is annotated by channel.

### M3 — The orchestrated run (the heart)
The append-only Run/Step tree and the coded chain (ADR-0028, ADR-0027).
- Open a **Conversation** on the project (`work_item_id` null for plain chat; bound to a **Work item** when the draft is governed work); every **Run** append-only, immutable once finished.
- Run the coded chain `retrieve → draft → ground-check → cite` as Steps; `retrieve` calls M2; `draft` is the one *thinking* leaf (the model adapter); `draft`/`retrieve` spawns **one retrieval sub-agent** as a child Run (exercising `parent_run_id` / `child_run_id`); `ground-check` and `cite` are deterministic *doing* leaves (ADR-0027 §6).
- Every Step records the full field set including `source_set` and `rail_outcomes` (ADR-0028 §7).
- The produced draft is held against a **Suggestion** with its **Citations**, targeted at a **sandbox document** (the draft-location decision above); nothing is written to a controlled `Version`.
- **Acceptance:** the chain runs the same ordering every time (no LLM decides the plan); `ground-check` withholds any claim that does not resolve to a source in the step's `source_set`; every grounded claim in the surviving draft has a Citation to a live `Version` (or authority ref); the Run/Step tree is a readable, immutable audit of exactly what happened, with model+version, tokens, cost, source set and rail outcomes populated; the sub-agent appears as a real child Run.

### M4 — The consultant surface + Signal loop
The sandbox document in the editor, the draft proposed against it, and the resolution captured.
- `web-consultant`: open project, create/open a **sandbox document**, edit it **manually** with no ceremony (no Suggestion, no Signal — as if AI didn't exist), chat, draft rendered **with citations**, accept / edit / reject controls.
- Resolution written as an append-only **Signal** on the Suggestion (`accepted` | `edited` | `rejected`, `edited_content` when edited) — Drawer 4; on accept or edit, the content is **applied to the sandbox document**.
- **Acceptance:** the consultant sees the cited draft; each of the three resolutions writes exactly one Signal; accept/edit lands the content in the sandbox document, reject leaves it untouched; a manual edit writes no Suggestion and no Signal; the Signal is stored and **sunk nowhere** (the loop is thin — nothing distils it yet, as intended); a re-draft opens a **new Run** on the same Work item (ADR-0028 §2), leaving the first Run's record intact.

### M5 — The owner's cross-role read
Prove access scoping across a role boundary on real data.
- `web-owner` (or a role switch in the consultant app for the slice): the owner Participant reads the **Work item** — live status — and the **full audited Run/Step tree**.
- **Acceptance:** the owner sees the work item's live status and the complete run; access is correctly scoped (the owner sees what the owner role admits, no more); the audit trail the owner reads is the same immutable record M3 wrote — nothing was mutated between production and review.

> **Superseded in part, owner-ruled 2026-07-12 (T-104):** the record turns inward. Every Run is producing-organisation-private background data — the consultant carries the professional liability for the work product, and the client owner reviews the *document* through the review cycle, never the agent's internals. M5's cross-role read becomes the work item's review-cycle facts; the owner audit screen built for this milestone was scaffolding that proved the record and is retired. What M5 permanently established stands: the record is immutable, byte-identical between production and any later read, and access-scoped through the one predicate.

### M6 — The Copilot Ask surface
`@Infora` in Microsoft 365 Copilot over the same API (ADR-0031).
- New `apps/copilot-agent`: a **declarative agent** (what users tag) + an **API plugin** calling Infora's API — no intelligence in the client (ADR-0031 §1).
- **Entra SSO → Participant:** the M365 identity maps to an Infora User (`external_identity` on User) and resolves its Participant on the bound project (ADR-0031 §5); no Copilot-specific access path.
- **One project bound per conversation:** the user names/picks the project on the first turn; the Copilot **Conversation** (`surface = copilot`, `work_item_id` null) binds to that one `project_id` for its life (ADR-0031 §2). Every Run records `surface` in the audit trail (§7).
- **Read-only:** grounded, cited answers rendered back in Copilot; no drafting, no Signals (§6).
- **Acceptance:** a tagged `@Infora` query with a named project returns a grounded, cited answer through the *same* Ask path (a Run in a Conversation, assembled by M2) — nothing about the agent is re-implemented; a Copilot user with no Participant on the bound project gets nothing (§5); the query reaches only what that Participant could reach natively (the wall is untouched by the doorway — §4); the Run is distinguishable as Copilot-originated in the audit trail.

---

## End-to-end acceptance (the skeleton is "done")

The slice is complete when the **whole journey** runs against real seed data:

1. The consultant opens the project (M1 resolves access) and asks the chat to draft a governed section.
2. The orchestrator runs `retrieve → draft → ground-check → cite` (M3), retrieving only through the gateway (M2), spawning one real sub-agent, logging every step append-only with the two defensibility fields populated.
3. The draft appears in the editor **with citations to live project sources** (M4), proposed against the consultant's sandbox document; ungrounded claims were withheld by `ground-check`.
4. The consultant accepts / edits / rejects; exactly one **Signal** is captured (M4) and sunk nowhere; accepted content lands in the sandbox document, which the consultant can also edit by hand with no Signal at all.
5. The owner logs in on a different role and reads the **work item's live status and the full immutable run**, access correctly scoped (M5).
6. The consultant tags `@Infora` in Copilot, names the project, and gets the **same grounded, cited answer** read-only over the same API, audited as Copilot-originated (M6).

And two negative tests that prove the wall, not just the feature:
- A user from the **second organisation** with no Participant on the project gets **nothing** — on both the native surface (M1) and through Copilot (M6).
- There is **no call, parameter, or surface** by which any caller retrieves outside the environment's access-resolved set (ADR-0029's structural guarantee).

---

## What this spec sends back to the grill tracker

- **Draft location before promotion** — ✅ **closed, owner-confirmed 2026-07-04** (the ✅ section above): the draft lives in the sandbox as a real working document; Suggestions arise only from agent prompts; manual editing is always possible with no Signal. Nothing remains open on the [grill tracker](../grill-sessions/grill-questions.md) for this slice.

No other new design question is raised: every stub above is already tracked (Signal sink → Session 7; channel ranking → Session 6; custom agents / distillation → Sessions 4/5; review cycle → document management; infra/security → the decision session). This spec composes settled decisions into a build order; it does not decide anything new.

## Next build-doc

[contracts.md](contracts.md) — firm the handful of typed endpoints M0–M6 call (the assembly signature of ADR-0029, the run/resolve/read endpoints of ADR-0028), seeding `packages/contracts`. This spec names them; that doc types them.
