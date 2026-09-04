# ADR-0021 - Context feeds a generation through three channels (grounded, guiding, informing), each input playing exactly one role; the grounding invariant is privacy, so the grounded channel carries two non-private corpora (project library and authority corpus) and every private store can only steer

**Status:** Accepted. Builds on ADR-0020 (three context stores). Refined in Session 3: programme context can feed the grounded and guiding channels (not only informing) within the programme's own projects, configured per project by the owner. Refines ADR-0011: "the project library is the sole grounded corpus" generalises to the privacy invariant below — any non-private corpus may ground, and the authority corpus is a second grounded corpus alongside the library.

**Context:** ADR-0020 settled *where* context lives — three stores: org and programme private-by-construction, project access-resolved — and that only project context grounds. But "informs only" lumped together two very different kinds of non-grounding context: a project's shared templates, style guides and guardrails, and an organisation's private precedents and know-how. They differ in who may see them and whether they persist when an organisation leaves. Two further things needed settling. First, the grounding rule is better expressed as a property of the *role an input plays in a generation* than of the store it sits in: a store says who can see a piece of context, a channel says what it is allowed to do when it feeds a generation. Second, ADR-0011's "library is the sole grounded corpus" was too narrow — claims about legislation, policy and standards must also cite, and that authority material is public, not project-private, so the real line is not "library versus everything" but private versus non-private.

**Decision:** Every input into a generation plays exactly one of three **channels**, in two families: grounded (may be cited) and steering (never cited). **The dividing invariant is privacy.** A citation enters the shared project record, so it must never carry material that is private across the ethical wall (ADR-0018); therefore only non-private sources may ground, and every private store can only steer. That gives three live channels.

**Grounded channel** — the cited sources; the only channel whose content may back a citation. It carries two corpora. The **project library** is this project's own knowledge, cited as project fact and access-resolved before retrieval, so citations are safe by construction (ADR-0020). The **authority corpus** is legislation, government policy, published standards and regulatory requirements, cited as external authority; it is public and cross-project, not project-private, so unlike the library it is not access-resolved per organisation — the law is the law — though licensed standards carry a licensing gate, which is distinct from the ethical wall. The dividing line between the two: produced by or for this project goes to the library; external and published goes to the authority corpus. Distilled Knowledge may power a grounded answer but cites through to one of these corpora, never standing as the citation itself.

**Guiding channel** — project-scoped steering: the project's templates, style guides and guardrails, owner-curated into project context the way deliverables are curated into the library. Shared among project members by access and persisting with the project when any member leaves. Never cited. It is also the one channel that configures the Rail, since a guardrail can be expressed as a negative constraint at generation time.

**Informing channel** — private steering: an organisation's precedents, custom workflows and firm know-how in org context, and a programme owner's portfolio knowledge in programme context. Classified by ownership, not purpose — material a consultant builds for a project is still informing if it is the consultant's IP, and it leaves when that organisation leaves the project. Private-by-construction: never shared, not even with the owner, and never cited.

The stores map onto the channels cleanly: the project library and the authority corpus feed the grounded channel; the rest of project context feeds the guiding channel; org context feeds the informing channel. Programme context can feed all three within the programme's *own* projects — a programme-scoped corpus and sibling libraries on the grounded channel, programme templates on the guiding channel, programme know-how on the informing channel — configured per project by the owner (refined in Session 3); outside the programme it does not exist. Channels are the bridge between the store model and generation, carrying ADR-0020's privacy and the grounding invariant into every output as a per-input property.

**Consequences:** "Can this input be cited?" has one answer — only if it is non-private and arrived on the grounded channel — so grounding is enforced where an input is admitted, not patched at output time, and it now spans project fact and external authority without a second mechanism. The split of "informs only" into guiding (shared, project-persistent) and informing (private, org-owned) makes the difference between project guidance and firm IP explicit, which matters when an organisation leaves: its informing context goes with it, the project's guiding context stays. The privacy invariant is a standing guarantee that private material can never be laundered into a citation. ADR-0011's "sole grounded corpus" wording is superseded by this generalisation, though its substance stands: within *project* material, still only the library grounds (never the sandbox or DRR). The authority corpus introduces a licensing gate as a new, non-wall access concept, and its currency — keeping legislation and standards up to date — is a concern of the authority register, now owned within Context (ADR-0023, as revised), not settled here. Sets up the retrieval architecture (ADR-0022), which gives each channel and each grounded corpus its own pipeline.

---

## Addendum (2026-09-04, owner-ruled): where the citation discipline applies, and where it does not

*In plain terms: the rules on this page about grounding and citing exist for
two situations — an Infora agent answering a question in Ask, and an Infora
agent writing text into a deliverable or creating a document. In both, the
agent must stick to the corpus and the other approved channels, must be able
to say where each piece of information came from, and must never invent a
fact. Outside those two situations, the platform does not demand citations.*

Ruled while exploring the future app builder, in the owner's words: *"what is
important is when an infora agent is drafting text in a deliverable or
creating a document, it can provide citations to where it sourced the
information from the corpus — aside from that the citation accuracy point is
not relevant."* Clarified in the same breath, 2026-09-04: **Ask is inside the
discipline too** — "if i went into the ask chat interface, that should
return responses based on citation accuracy" — which is how Ask has been
built since its first acceptance test. So the citation-and-grounding
discipline is a property of **Infora agents answering in Ask and drafting
into the record**, not of the platform at large: a surface that displays
data (a future app's map, table or dashboard) is outside it. Two companion rules for the app builder are recorded on its
deferred-register entry — app data reaches drafting only through the
record's own doors, and an exported artefact carries a provenance stamp —
because they are constraints on that future build, not amendments to the
channel model. Nothing above this line changes.
