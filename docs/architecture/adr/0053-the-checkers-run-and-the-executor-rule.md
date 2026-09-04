# ADR-0053 - The QA checker's run is a **plan computed in code** from the document and the checks the user chose; when material will not fit it **splits rather than drops**, and it states its **coverage** before and after, so an absence of findings is never an unqualified claim. Bulk acceptance is permitted for **mechanical** fixes only. And — the engine change every V1 tool needs — **a plan step executes the capability it names**

*In plain terms (added in review, 2026-08-30 — the opening the register rule asks of every new ADR):* when someone runs the QA checker over a document, the system works out up front — in ordinary code, before any AI is involved — which checks will run and roughly what they will cost, and shows that plan. A document too big to check in one pass is split and every piece is checked; nothing is silently dropped. Every run states what it covered, before and after, so "no findings" always means "no findings in what was read" — said out loud, never implied. Reviewers still resolve the AI's suggested wording changes one at a time; only purely mechanical corrections may be accepted in bulk. And the engine rule every tool was waiting for: a step in a plan now genuinely runs the tool it names, under guards this document sets out.

**Status:** Accepted (owner-ruled 2026-08-30, the checker session). **Fills in [ADR-0048](0048-the-checker-findings-not-prose.md)'s run semantics without reopening it** — what a finding *is*, that the checker checks rather than writes, and the three inputs' three treatments all stand exactly as ruled. Closes `Q-030`, `Q-031` and `Q-046`. Carries two **dated addenda to ADR-0048** (2026-08-30): a channel correction found by this session, and the narrowing of §3's no-bulk-accept rule. References **ADR-0011** (the library grounds), **ADR-0021** (the three channels), **ADR-0022** (the attached-source working set), **ADR-0027** (thinking vs doing, and the 2026-08-11 agent-act amendment), **ADR-0028** (Run/Step and the plan artefact), **ADR-0029** (the channel merge and the guiding-over-informing precedence), **ADR-0049** (the promotion gate), and [operating-envelope.md](../operating-envelope.md) as re-cut 2026-08-30. Decided against [v1.md](../../build/v1.md). **Carries six dated addenda of its own (the sections at the foot of this file): three owner-ruled 2026-08-31 (the creator's launch re-cut, the content plan editable as a parameter, the price line removed from the tools' plan surfaces), two owner-ruled 2026-09-01 (the creator never launches from the plan — closing `Q-037` — and composed outlines saveable as firm-scoped starting outlines), and one owner-ruled 2026-09-04 (the extractor's tool leaves V1; the set returns to two).**

**Context:** ADR-0048 settled what a finding is and stopped the checker becoming a rewriter. It settled nothing about **how a run behaves** — and the board recorded that gap honestly rather than building around it: the QA checker was held as **fog** in Slice V1-T, deliberately not ticketed because it could be *stated* and not *specified*, and the document-creation DAG (T-309) stopped mid-build on the discovery that `runChain` dispatches on **stage** and reads a step's named worker never. Three tracker questions and one build stop were pointing at the same missing thing.

*Why a new ADR rather than an addendum to 0048.* Two of the rulings below are not about the checker at all. The **executor rule** governs how any plan step runs any capability — the document creator needs it identically, and the three built-but-unreachable workers are its other face. Filing engine execution semantics inside an ADR titled *the checker returns findings, not prose* would put a general rule where nobody looking for it would find it. What genuinely *does* extend ADR-0048 — the channel name in its §4, and the narrowing of its §3 — is recorded there, dated, in the form that ADR never gets rewritten.

*What the session found by drawing the run rather than describing it.* Four things, each of which changed a position that had been held confidently:

- **The unit of work is a property of each check, not of the run.** The tracker's `Q-031` asked whether the sweep runs per section, per chunk, or with whole-document context, as though one answer served. It does not: a style check needs one section, a readability score is arithmetic over a section and then the document, and self-contradiction needs the whole thing at once. The owner's re-cut of the check list produced this, and it retired the single fan-out the session opened with.
- **Not every check is a model call.** Readability is arithmetic. Completeness is a template comparison and a placeholder search. Under ADR-0027 these are *doing* steps, classified at design time, deterministic, and incapable of the failure mode a model has. A checker described as "N model calls" was describing only half of itself.
- **A REAC is a document in the library.** The session spent a stretch designing a commitments-reconciliation capability against the `extractor`'s `commitments` schema before the owner collapsed it: the register is a library document, so checking against it is the ordinary corpus check with a consequential source. No machinery. The stronger version — reconciling a chapter against a *stored* register — has no second side to reconcile against, because nothing in V1 persists one.
- **Three unrelated tracker items were one problem.** `Q-046` (the rulebook truncated by the token budget), the corpus check's retrieval simply not matching, and `Q-028`'s user-narrowed scope all produce the same screen: a clean marked-up edit that reads as *your document is fine* and means *we did not look*. One answer had to cover all three, and does — decision 5.

*And one error, found by applying the record's own test.* ADR-0048 §4 places the firm's rulebook on the **guiding** channel while asserting that nothing in ADR-0021 is amended. Both cannot hold: ADR-0021 maps org context to the **informing** channel and classifies **by ownership, not purpose** — a firm's drafting manual is the firm's own IP and leaves when the firm leaves the project. T-308 built it as ADR-0048 wrote it, so [`guidingRules`](../../../packages/knowledge/src/guiding.ts) queries `rulebooks` by `organisationId` and tags every row `channel: 'guiding'`, while the informing pipeline is a stub returning `[]`. The owner found it by asking whether a project style guide beats a consultant's rulebook — a question ADR-0029 answered in 2026-07-06 and the mislabel would have made unreachable.

**Decision:**

**1. The checker is a tool, reached two ways that are one mechanism.** V1's tool set is the **document creator**, the **QA checker** and — added by this session — the **extractor** (decision 11). The checker is launched from the rail's **Tools** section, or from the document editor via a tool chip that opens the same launcher with the document already bound. These are not two paths: the editor route is the Tools route with its first step pre-filled, so there is one run shape and one place the scope is stated. This closes `Q-030`, whose ruled half already fixed Tools as the home and whose residual asked exactly these two things.

**A run covers one document.** The marked-up edit is a document surface and findings anchor into *a* draft; a set sweep produces a report, which ADR-0048 §1 deliberately made the checker not be. Document sets and cross-document drift are deferred, named in decision 13.

**The launch keeps its state.** Pick the document, pick the checks and their settings, see the plan, go back and change one thing without re-entering the rest. The plan is a step in that sequence, not a modal.

**2. Six check families, and two of them cost nothing.**

| Family | What one call holds | Cost |
| --- | --- | --- |
| Style guide | one section + the style guides | model, per section |
| Corpus accuracy | one section + the passages retrieved for it | model, per section (see depth) |
| Self-contradiction | the section summaries | model, **one call** |
| Readability | — | **code** |
| Completeness | — | **code** |

Self-contradiction is one call rather than one per section because each section's call returns a short summary of what that section asserts as a by-product, and the final call compares the summaries. **Readability is scored per section against a project target with outliers flagged, never pass/fail** — Flesch-Kincaid scores technical infrastructure prose badly by construction, and a pass/fail on it would be a verdict the system is not entitled to give (ADR-0048 §3). **Completeness** is missing template sections and placeholder text.

**Every family is switchable at launch**, and the corpus check additionally carries a **depth**: *quick*, which searches once per section, or *full*, which extracts the section's checkable assertions and searches for each one. The two are presented as presets — **Quick check** and **Full check** — that set the families and the depth together and remain individually adjustable. **Full is the default**, because a too-cheap default fails *invisibly* (findings that never appear) while a too-expensive one fails visibly (it took longer), and a system should prefer the failure its user can see.

**3. What the checker checks against — three inputs, unchanged in kind, corrected in scope.**

- **Two style sources, both guiding-or-informing material, both quoted verbatim and never cited.** The **project style guide** — project context, owner-curated, binding every organisation on the project — is not a new object: [CONTEXT.md](../../../CONTEXT.md)'s guiding channel has always been *"the project's templates, style guides and guardrails"*, and it has simply never been built. The **firm rulebook** is org context (T-308, built). **On conflict the project style guide wins and firm know-how fills in where the project is silent** — ADR-0029's precedence, refined 2026-07-06, applied rather than invented. Each finding names which source it arose from.
- **The corpus.** The default is the **whole access-resolved library**. A picker allows narrowing to named library documents; findings from them **cite normally**, resolve to locators, and carry currency. This is `Q-028`'s *explicit* case — a scope selected pre-retrieval, recorded on the plan, visible to the user — and needs nothing ruled; `Q-028`'s hard half, how a *question* becomes a scope, stays open and the checker sidesteps it.
- **Attached documents**, by upload or by selection from the user's own sandbox. ADR-0022's working set: **never grounds, never cited**, evidence is an excerpt with a user-supplied marker. `Q-020` asks whether sandbox material may enter *chat context as a channel*, which is the system pulling; this is the user pinning, which ADR-0022 already rules.

**The two must be named differently on screen, because they are two guarantees.** Attaching a *library* document yields a strictly worse result than scoping to it — no citation, no locator, no currency — and a user choosing "select a document to check against" would have no way to know they took the weak path.

**A REAC or similar register is a library document**, checked against by the ordinary corpus check. Nothing about commitments is special-cased.

**4. The plan is computed in code, shown before the run, and shaped by parameters rather than edited.**

A **planner** reads the document's structure and length and the user's chosen checks, applies fixed rules, and emits the plan. **It is code, not a model call**, and that is load-bearing rather than an optimisation: if a model decided the run's shape, the same document would produce different plans on different days and the checker could not be a **declared** workflow at all — losing the one guarantee (same inputs, same steps, same order) a tool is sold on. ADR-0027's line is not merely respected here; the run depends on it.

Three shapes, and the plan names which one it took:

- **Short document** — one pass, all checks together. Self-contradiction is free, because one reader sees everything.
- **Ordinary document** — fan out per section, then compare the section summaries.
- **Very long document** — as above, but the summaries themselves exceed one call, so they are compared in **groups**, and **the plan says cross-section checking is weaker**. It degrades loudly or not at all.

**The plan is rendered before execution, and the user may not edit its steps.** They shape it by changing **parameters** — which document, which checks, what depth, which style guides, which library documents — and the plan regenerates. Parameter selection keeps the run `declared`; hand-editing a step list does not, and decision 12 follows from this.

**5. Coverage is a first-class output, stated twice, and the planner splits rather than drops.**

The context available to one model call is finite, and the style guides, the section under check and the retrieved passages compete for it. The built merge drops the lowest-priority channel first — correct for an Ask answer, where losing some steer degrades tone, and **wrong for a checker, whose silence is a claim**.

- **The planner splits rather than drops.** A style guide that will not fit alongside a section is run over that section in **two passes**, half the clauses each. It costs another call and it covers the whole manual. The context limit stops being a silent truncator and becomes something the plan routes around.
- **Coverage is stated before the run, in the plan, and after it, beside the findings, in the same shape** — sections, checks, depth, and *"style guide: 80 of 80 clauses, in 2 passes"*. It is an output beside the findings, **not a footnote**, because it is the only thing distinguishing a clean result from an unexamined one.
- **Refusal is reserved for the pathological case** — material that cannot be covered even by splitting — and it is said **in the plan, before any spend**, not as a caveat under a clean result.

This answers `Q-046` and its growth stress test together. A firm's manual outgrowing the budget over a year has **no day on which the checker silently weakens**, because every run's plan states the coverage: the manual growing from 60 clauses to 90 changes the plan from one pass to two, visibly, and costs slightly more. It answers the other two doors identically — the corpus check states what it searched and at what depth, and a user-narrowed scope is named in the plan that the narrowing produced.

**6. Triage: bulk acceptance is permitted for *mechanical* fixes only, and this narrows ADR-0048 §3 deliberately.**

ADR-0048 §3 forbade bulk-accepting proposed fixes, because a reviewer who accepts patches instead of reading findings performs the human check in appearance only. **The guard was written imagining a handful of findings and the distinction it needs is not the one it drew.** The owner's case: in the editor or the Word add-in you are **drafting**, so every acceptance is a separate authorial act; in the checker, fifty-five identical capitalisations are **one** decision applied fifty-five times, and clicking it fifty-five times adds nothing but fatigue — and fatigue is what gets the tool switched off, which is the outcome `Q-031`'s stress test predicted.

**The axis is the nature of the fix, not the check family.** "Style" contains both *"use 'scheme', not 'project'"* — fifty-five substitutions, one decision — and *"avoid the passive voice"* — fifty-five **rewritten sentences**, which is precisely what §3 exists to prevent shipping unread. So:

- **A mechanical fix** is the same substitution applied consistently, expressible as find-and-replace and displayable in one line (*"Scheme → scheme, 55 places"*). **Bulk-acceptable.**
- **A rewrite** is model-written prose. **Per-mark, always. No exceptions, no accept-all-of-one-rule.**
- **Which kind a fix is, is declared on the finding and checkable in code.** If it cannot be expressed as a substitution and shown in one line, it is not mechanical — the model does not self-certify its own fixes into the bulk lane.

**Findings are grouped by check and also anchored in the document** — two views of one set, per the owner's sketch. A group shows its mechanical fixes with an accept-all above its rewrites without one, so the honest fact — that accepting new prose unread is not the same act as normalising a capital letter — is on the screen rather than only in this ADR.

**Bulk dismissal is permitted by rule, severity or check, and records no reason.** Dismissing changes no work product; declining forty advisory findings from one rule is one professional judgement, not forty skipped. Promotion's gate is unaffected in kind: ADR-0049 §7 blocks on *open* findings, and dismissal **resolves** rather than overrides.

**7. The executor rule: a plan step executes the capability it names.** `runChain` dispatches on **stage** and never reads a step's `worker` ([chain.ts](../../../packages/orchestration/src/chain.ts)), so the drafting stage runs the draft leaf whatever a step names. That is why the checker cannot call the built corpus search, and why T-309 stopped. The rule:

- **The step names a capability; that capability runs.** Stage keeps two jobs — deciding what runs a step naming *no* capability (`analyse` and `present` are the orchestrator's own leaves, not workers), and being the vocabulary the plan and the completion footer are written in. It loses the job of choosing an executor for a step that named one.
- **Only capabilities the requester is entitled to**, resolved through the set **assembled** for this requester (T-269). A step naming one they lack fails with the entitlement refusal, not a generic error.
- **This creates no generic worker.** The executor is a dispatcher over a **closed registry of built capabilities**; it cannot invent one, and non-negotiable 8 is untouched. `workflow_runner` remains the one non-leaf.
- **A capability that writes gets its existing guard made to bite.** It may run only inside a workflow that declared `writes` and declared its label-propagation behaviour — already validator rule 4, unreachable until now because no worker ran at all.
- **ADR-0027 holds, and the S10 amendment with it.** Whether a capability is code or a model call is fixed **per capability at design time**; the executor reads the declaration and never judges. A writing capability drafts into the invoker's own sandbox — **content work**, entering the human's existing queue — so it is not the direct-execution lane the 2026-08-11 amendment opened for administrative acts, and the draft existing is not acceptance.
- **A fan-out step is added to the workflow format.** The definition holds a fixed `steps` list and cannot express *"check every section"* becoming eleven steps at plan time. The template declares the fan-out; the **planner** (decision 4) computes its width in code; the plan records the resulting steps. The width is never model-chosen.
- **Cost attribution lands here.** A cost is recorded on a Step row and the row is opened by the executor, which is why per-step cost is absent today.
- **The interim validator refusal is deleted by the ticket that lands this rule**, and its test inverts: a definition naming a capability on a non-retrieve stage must now **load and execute**. The refusal was the honest interim — a definition naming an executor the engine did not have must not load — and it expires the moment the engine has one.

**8. Scope is inherited and remains inexpressible.** Nothing here widens reach and nothing may. A step cannot declare a scope — the type has no field and `scope`, `corpus`, `visibility`, `project_id` and their relatives are refused **by name** with the reason that there is no correct spelling (validator rule 3, and T-267's identical rule for an edited plan). All retrieval reaches the store through the one assembly gateway, which resolves the requester's access as SQL pre-filters in the same query that fetches the passage. **The model never queries the library; it sees only what was assembled for it.** The library picker of decision 3 is **assembled, not filtered** — a document the user cannot see is **absent**, never greyed, so the picker cannot reveal that it exists.

**9. Findings inherit the org-private posture, and the two style sources differ in it.** ADR-0048 §6 made a quoted rule org-private because the rulebook was the only style source. A **project style guide** is project context, shared by access among the project's members — quoting it across the wall is the point of it. So the privacy posture is a property of **the source's scope**, not of the word "rulebook". A quoted firm-rulebook clause remains private to that firm.

**10. The project style guide may be deselected at launch, so it is advisory in practice.** The owner ruled the check selection user-controlled, and that includes which style guides apply. This is recorded plainly rather than discovered later: **an owner's project style guide is not enforced by the checker.** The mitigation is decision 5's coverage statement, which records which style guides were applied — so an owner reviewing a document can see that it was checked without theirs.

**11. V1's tool set is three, and the extractor's tool is unspecified.** Slice V1-T ruled two standalone tools. The `extractor` is built, carries six named schemas, returns rows with source and locator attached and failures beside them — and is reachable by nothing. *"Pull every commitment out of these twelve documents"* is a tool a consultant would open Tools to find. It is added to V1's set as a **third tool**, and because nothing says what a user selects, how a register is scoped, or where the output lands, it enters the board as **fog plus `Q-049`** and is ticketed when that is grilled — the same discipline the checker itself was held to.

**12. The plan edit-and-re-run endpoint is deferred out of V1, explicitly.** T-267 built `POST /runs/:runId/plan/rerun` and it has no caller. It stays that way. Hand-editing a step list makes a plan `model_chosen` by T-267's own correct rule — a declared workflow promises the same inputs produce the same steps, and a hand-edited copy makes no such promise. For the two tools V1 sells on that promise, it is the guarantee a user should not be able to switch off in passing. Re-running a tool is **relaunching with the same parameters**, which stays `declared` and needs no endpoint. The plan editor's home is the Ask path's power-user story, post-V1.

**13. What is deferred, named so it is not mistaken for an oversight.** Document **sets** as a run scope, and the cross-document terminology drift only a set sweep can find. The consistency of edits proposed by **successive runs on one document** — ADR-0048's own open lifecycle question, now with a driver: a run that re-raises a finding dismissed last week is a tool that does not listen. And **citation integrity**, parked as `P-002` on the owner's instruction (decision 14).

**14. A finding recorded because it outlives its feature: the ground-check is a fabrication guard, not a support guard.** [`groundCheck`](../../../packages/governance/src/ground-check.ts) is a **membership** test — `admitted.has(refKey(claim.sourceRef))` — asking whether a claim names a source the run actually saw, and never reading that source's text. It runs **once, at generation**. So a source chip in an Infora document guarantees *"the model saw this source"*, not *"this source says this"*, and nothing re-checks after a human edits an agent-written, cited sentence. The owner's case: a sentence cited to a document that is live, in the library and authoritative, whose text no longer supports what the sentence says — structurally perfect, semantically broken, and invisible to everything in the build. Checking it is out of V1 and parked; **the fact is recorded here because it is a standing property of the platform, not a missing feature**, and "cited" reads to any user as "verified".

**Consequences:** `Q-030`, `Q-031` and `Q-046` close. The QA checker **stops being fog** in Slice V1-T and is ticketed as **T-336** and its supporting tickets; **T-309 unblocks** on decision 7, and **T-334**, **T-335** and **T-311** are re-cut. The three built workers — `corpus_retrieval`, `extractor`, `document_builder` — become reachable as a **consequence of decision 7 and the tickets that already exist**, and need no reachability tickets of their own; component 6 §3's standing warning that *"nothing executes one as a plan step"* is retired. The workflow definition format gains a fan-out and the interim refusal is deleted. Per-step **cost attribution** starts working. **A project style guide is a new store**, and the first material the guiding channel has ever actually carried. [operating-envelope.md](../operating-envelope.md), re-cut 2026-08-30, is the sizing guide this design is measured against and **not a budget any ruling here is compliant with** — the checker is the first V1 capability whose one user action is not one model call, which is what prompted that re-cut. **No new personal data**: findings attach to documents, and the accept/reject Signals the triage produces already exist under ADR-0026. `Q-049` is raised for the extractor's tool. Nothing in ADR-0048, ADR-0021, ADR-0022 or ADR-0029 is reopened; ADR-0048 carries two dated addenda recording what this session corrected and narrowed.

**Considered and not taken.** *A single fan-out unit for the whole sweep* — per section, per chunk, or whole-document, as `Q-031` framed it; retired when the check list showed each family needs its own grain. *Whole-document context in one call* — it does not fit at 50 pages and its failure is silent truncation, which is the very problem decision 5 exists to prevent. *A commitments-reconciliation capability* — collapsed when the owner established that a REAC is a library document; the stronger register-reconciliation version has no stored register to reconcile against. *A third render for unsourced model-knowledge findings* — proposed so the checker could catch *"Bedford is in Cambridgeshire"* with nothing to cite; dropped once the owner set the corpus-check mechanic, under which the check simply does not fire where the corpus is silent, and every finding is citable end to end. The cost is that a wrong statement the corpus cannot speak to ships, which is consistent with ADR-0048's refusal to give unqualified professional opinions. *Qualifying rather than splitting* — `Q-046`'s tracker recommendation (b); it accepts the truncation and apologises for it, and a caveat under a clean result is invisible to a reader under deadline. *A hard per-run call cap* — a refusal the user cannot act on, against a legitimate document. *Bulk accept by check family without the mechanical/rewrite split* — the owner's first formulation; it would ship fifty-five rewritten paragraphs unread behind a button labelled "accept all style findings". *Letting the model classify its own fixes as mechanical* — rejected in decision 6; the test is structural.

**Open — not decided here.** **Whether a run's findings persist across runs of the same document**, so that a dismissal is remembered — decision 13; ADR-0048 left it open and this session gave it a driver without ruling it. **`Q-028`'s hard half** — how a *question* becomes a retrieval scope — untouched; the checker uses the explicit case only. **`Q-020`** — sandbox material as a *channel* — untouched. **`Q-049`** — the extractor as a tool. **The project style guide's own governance** — who may load and amend it, and whether amending it mid-project is an event anyone is told about — is a store question the ticket that builds it must answer or raise.

---

## Addenda to ADR-0048 recorded by this session (2026-08-30)

Both are carried **on ADR-0048's own Status line, dated — that is the single
copy** (this section names them without restating them, because a second copy
is how two copies start disagreeing; deduplicated in review, 2026-08-30):
§4's channel corrected from *guiding* to *informing*, and §3's no-bulk-accept
rule narrowed to rewrites (decision 6 above).

---

## Addenda (2026-08-31, owner-ruled — the document-creator feedback session)

The owner reviewed the built creator against its photographs and re-ruled
three things. Each is dated and additive; nothing above is rewritten. The
session's full record is in
[grill-history.md](../../grill-sessions/grill-history.md); the tickets are
T-403–T-410.

**A1 — The creator's launch is re-cut, and drafting consumes style guides for
the first time.** *In plain terms: the creator's first screen stops asking for
a "shape" and instead asks four plain questions — what kind of document this
is, what language register it should use, which style guides apply, and
whether it is a whole document, a chapter or a section. Then, instead of the
outline arriving ready-made from a template, the author builds it: add a
section, say what it should contain, add the next.* The launcher asks
**Purpose** (technical note / planning document / internal document / external
document), **Language** (technical / non-technical / simple English),
**Style** (which project style guide or guides apply — more than one may be
selected, and the store has always been able to hold more than one), and
**Type** (whole document / chapter / section). *Shape* retires as a term and
as a mechanism; the two shipped templates survive only as optional starting
outlines inside the define-sections step, their per-part guidance becoming
pre-filled section purposes the author can edit or discard. **The drafting
call consumes the selected style guides and the Language answer** — until now
style material existed only for the checker to mark against, never for
drafting to follow. On conflict between the two, **a style guide wins on
terms and vocabulary; the author's Language answer wins on register — and the
plan states both**, so the resolution is visible rather than discovered in
the output *(this precedence was Claude-ruled as a session residual under the
standing arrangement and stands unless the owner re-cuts it)*. **Source
binding stays whole-document**: the owner's re-cut describes one source
binding for the document, superseding T-335's per-section binding, and the
walkthrough's gap card closes to this design rather than to the old one.

**A2 — The creator's plan is a proposed document, editable as a parameter —
and the step list underneath stays code.** *In plain terms: the plan page
becomes a short prospectus of the document about to be written — an overview
of the overarching instructions, then section by section what will go in each
— and the author can fix it before anything runs: click a section and edit
its description directly, or ask the agent beside the plan to revise it
("no, this should set out X in bullets"). Accepting the plan is what creates
the document.* What the author or the agent edits is the **brief** — a
parameter of the run, exactly like the launcher's answers. The **step list**
underneath remains computed in code from those parameters, is not editable by
anyone, human or model, and regenerates when a brief changes. So §4's
guarantee holds — same inputs, same steps — and **§12 is not reopened**: no
step list is ever hand-edited; what changed is that one more input became
conversationally revisable before the run.

**A3 — The price line is removed from both tools' plan surfaces.** *In plain
terms: the owner ruled the on-screen cost estimate off — it is not needed at
launch.* It was on screen because §4 above deliberately put it there, so its
removal is this ruling and not a build defect. **Per-step cost attribution
(§7) is unchanged** — cost is still recorded on every step as an audit and
operations fact; it simply stops being shown to the person launching the
tool. §4's estimate machinery (including the refusal to show a false £0.00)
retires from the display layer only.

---

## Addenda (2026-09-01, owner-ruled — the second tools feedback session)

The owner's second render review of both tools. The session's full record is
in [grill-history.md](../../grill-sessions/grill-history.md); the tickets are
T-412–T-420.

**A4 — The creator is never launched from the plan, and `Q-037` closes the
other way.** *In plain terms: you will never start the document creator from
a deliverable in the owner's plan. You start it from Tools, or from a
location in your working area — and a document started from a working-area
location is created in that location.* This closes `Q-037` by cutting the
link rather than ruling what may cross it: the tracker's recommendation
(seed the plan row's read-only facts) is **superseded** — nothing of the
plan row reaches the creator, so the owner-controlled plan and
producing-side authoring stay fully separate and the `Q-034`
wall-through-content territory is never entered. The bound-path refusal
screen T-335 shipped loses its reason to exist along with every doorway
that led to it.

**A5 — A composed outline can be saved as a starting outline, scoped to the
firm.** *In plain terms: having built an outline, you can keep it — it
appears beside the shipped starting outlines next time, for your firm
only.* The word is **starting outline** — already the shipped term for
exactly this thing, a seed and never a lock; *template* stays reserved for
the Word-format idea recorded in the deferred register. The store is
**org-private** (the firm's own know-how, like its rulebook — another
organisation on the project never sees it). **Anyone in the firm saves;
saved outlines are visibly marked as the firm's own** beside the
Infora-shipped ones, **and a curator may delete one** — the light-touch
answer to the half-baked-outline-looking-authoritative stress test, ruled
by the owner 2026-09-01.

---

## Addendum (2026-09-04, owner-ruled)

**A6 — The extractor's tool leaves V1, and the set returns to two.** *In
plain terms: the owner decided the third tool — the one that pulls
commitments, responses, deadlines and the like out of documents into a
table — will not get its screen in the first pilot. The machinery stays
built; nothing is deleted; the screen is simply not V1's work.* Decision 11
added it 2026-08-30 because the capability was built and reachable by
nothing; the owner's ruling of 2026-09-04 ("drop extractor from the v1")
moves the tool to the deferred register, where its design question
(`Q-049`, still open) gates it. The Tools section is unaffected — decision
11's own choice was that an unspecified tool gets no tile, so nothing on
screen changes. The same instruction opened an exploration of an **app
builder** in Tools, which may become the extractor tool's eventual home —
recorded on the deferred register's builder entry, not here.
