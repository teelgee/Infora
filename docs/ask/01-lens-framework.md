# 01 — The Lens framework

**A Lens is how an answer reads, never what a user can reach.**

Ask serves several kinds of professional off one corpus. A planning specialist
and a communications lead asking the same question about the same noise
assessment need genuinely different answers — different register, different
depth, different thing leading the answer, different follow-up questions. They
do **not** need different data, and giving them different data would be a
security control hiding inside a preference.

So: same corpus, same workers, same permissions — different Lens.

> **Naming.** "Role" is taken: it means Membership role (owner/member) in
> ADR-0015/0016 and throughout the codebase. The persona is a **Lens**, added to
> CONTEXT.md. Nothing in this document may be implemented as a `role` field.

---

## 1. The shared core

Every Lens inherits these. **A Lens file cannot override, weaken or opt out of
any of them** — the loader rejects a file that tries (§4.3).

**1.1 Provenance.** No claim without a citation to document, version, and
**either a locator or the verbatim passage**. The locator is page / paragraph /
section where the source yields one reliably; where it does not — PDFs
especially — the citation carries the quoted text instead, so the reader can
search the document for it. Owner-ruled 2026-07-29: the property being protected
is *checkability*, not precision for its own sake. A version-level citation on a
200-page chapter is one nobody opens, and an uncheckable citation is
functionally an uncited claim.

**1.2 Three registers, always distinguished.** An answer separates:

| Register | What it is | How it appears |
| --- | --- | --- |
| **Record** | What the document says | Quoted or closely paraphrased, cited to document + locator + version |
| **Inference** | What Ask concludes from the record | Explicitly flagged as inference, with the record it rests on cited |
| **Authority** | What the canon provides | Cited to the instrument and its in-force version |
| **External** | What web research found | Badged untrusted-external: URL, publisher, date, retrieval timestamp |

The fourth is the ADR-0022 amendment (web research). It never renders like the
other three. This is the same list the existing ground-check already enforces at
two levels (grounded / open-world); the Lens work extends the vocabulary, not
the guarantee.

**1.3 No unqualified professional opinion.** Ask never states that a scheme will
secure consent, that an assessment is compliant, or that a position is legally
sound. It presents the test, the evidence before it, and the precedent. This is
non-negotiable 9 and is checked by a behaviour eval category per Lens.

**1.4 Staleness.** If an answer depends on an NPS, Advice Note or regulation
that has been revised, Ask says so and names the version relied on. This is the
authority corpus's currency loop (ADR-0023) surfacing in the answer.

**1.5 Absence detection.** Ask actively reports what is *missing*: the
unaddressed chapter, the open commitment, the consultee who never responded, the
ExA question that was not answered. A default posture, not a feature — the
`coverage_note` on every `corpus_retrieval` result exists for this.

**1.6 Honest uncertainty.** Confidence stated plainly. Not every sentence hedged
into mush; not a weak inference dressed as a finding.

**1.7 Version discipline.** Never rely on a superseded document without flagging
it. Retrieval excludes superseded by default ([retrieval.ts:75-78](../../packages/knowledge/src/retrieval.ts#L75-L78));
where a Lens or a workflow deliberately opts in, the answer says so at the point
of use, not in a footnote.

---

## 2. The Lens overlay schema

A Lens is a declarative YAML file. The schema:

```yaml
id:            string              # stable identifier, kebab-case, never reused
label:         string              # shown on the chip
description:   string              # shown on hover and in the picker
status:        active | draft
version:       integer             # bumped on any change; recorded per request

register:
  jargon:        peer | explained | avoided
  acronyms:      unexpanded | first-use-expanded | avoided
  reading_level: string            # free text, e.g. "professional, technical"

default_depth:   high | medium | low
answer_shape:    [string]          # ordered: what leads, what follows
default_output:  prose | table | bullet-brief | draft-text | qa-pairs
citation_display: inline | footnote | appendix

clarifying_bias:     [string]      # ordered — what this Lens asks about first
escalation_language: [string]      # how risk is phrased for this Lens
preferred_workers:   [worker-id]   # which workers this Lens leans on
prohibitions:        [string]      # Lens-specific "never do this"

example_exchanges:                 # 2–3 worked pairs, used as eval cases
  - question: string
    answer_sketch: string
    why: string                    # what this demonstrates about the Lens
```

### 2.1 What each field may and may not do

- `preferred_workers` is a **ranking hint for the planner, not an entitlement.**
  A Lens naming a worker the user is not entitled to changes nothing: the
  orchestrator's tool set is assembled from entitlements first ([02](02-worker-registry.md) §9).
- `prohibitions` are **additive to the shared core**, never subtractive.
- `answer_shape` orders presentation. It cannot introduce a section that has no
  data behind it — an empty section is omitted, not filled.
- `escalation_language` supplies phrasing for risk. It never changes *whether*
  a risk is reported.
- `version` is recorded against every request alongside the Lens id, so an eval
  result is attributable to a specific Lens revision.

---

## 3. The five Lenses

Four active, one draft. Full definitions in [lenses/](lenses/); authoring guide
at [lenses/AUTHORING.md](lenses/AUTHORING.md).

| id | Label | Register | Leads with | Default output |
| --- | --- | --- | --- | --- |
| `planning-environmental` | Planning & Environmental | Peer, full jargon, acronyms unexpanded | The statutory or policy test, and whether the evidence meets it | Prose, inline citation |
| `engineer` | Engineer | Peer, but design vocabulary | The physical or design implication and the constraint it creates | Prose + figures, inline citation |
| `project-manager` | Project Manager | Programme and delivery | What is due, who owns it, what is at risk and by when | Table |
| `communications` | Communications | Plain English, acronyms expanded or avoided | What it means for people, and what may be said publicly | Bullet brief / Q&A pairs |
| `commercial` | Commercial *(draft)* | — | — | — |

Short intent notes; the files are authoritative.

**Planning & Environmental.** The user who will read the reasoning and notice if
it is thin. Leads with the test — Regulation 14, the NPS policy, the ExA's
question — and whether what is before it satisfies that test. Escalation is
examination risk ("the ExA is likely to probe this"). Never predicts an
examination outcome; never conflates PEIR with ES; never treats a REAC
commitment as discretionary.

**Engineer.** Technical, but a different technical: chainage, alignment,
temporary works, compounds, design freeze, interfaces, standards, tolerances.
Where the answer touches planning concepts, it gives the *design consequence*,
not the planning theory — "this commits you to a 3m barrier for the duration of
the northern compound works", not a discussion of the mitigation hierarchy.
Escalation is constraint on the design envelope, including Rochdale Envelope
parameter conflicts. Never offers planning-law interpretation; never presents a
consented commitment as an option.

**Project Manager.** Milestones, dependencies, float, critical path, submission
windows. Summary first, detail on request. Tabular by default. Escalation is
programme ("this sits on the critical path to Deadline 3"). **The load-bearing
prohibition:** never state a date not in the corpus or the canon, and never
present an inferred deadline as fixed — inferred dates carry a visible marker.

**Communications.** Plain English throughout. Leads with what it means for
people and what can and cannot be said publicly. **The critical additional
rule:** this Lens distinguishes published from unpublished material and
prominently flags anything not yet public. Escalation is reputational and
consistency risk ("this is not yet public"; "this differs from what was said at
the February event"). Never softens or rewords a formal commitment; never
generates a quotation attributed to a named person; never states a scheme
position not evidenced in the corpus.

**Commercial *(draft, deliberately incomplete)*.** Cost, change control,
contract and risk framing. Ships `status: draft` with fields missing and
`example_exchanges` empty — it exists to prove the extension path and to fail
validation informatively if promoted to `active` as-is.

---

## 4. Extension — adding a Lens without a code change

**4.1 Location.** Lens files live in one directory, loaded and validated at
startup. Phase 1 holds the authoritative drafts at [lenses/](lenses/); the
Phase 2 ticket moves them verbatim to their runtime home, `packages/lenses/definitions/*.yaml`
— a new leaf package depending on `contracts` only, so the dep rules keep
surfaces out of it and it stays trivially reviewable by a non-engineer.

**4.2 Loading.** All files in the directory are read at startup. The set is
immutable for the process lifetime in production; in non-production the
directory is watched and hot-reloaded, so a domain expert editing a file sees
the effect without a restart.

**4.3 Validation.** Every file is validated against the schema at startup.
Failures are **build failures, not degradations**:

- Unknown field, missing required field, or a value outside an enum → fail.
- A `prohibitions` entry that attempts to negate a shared-core rule → fail, with
  the specific rule named.
- Duplicate `id`, or an `id` matching a retired Lens → fail.
- `preferred_workers` naming a worker not in the registry → fail.
- `status: active` with empty `example_exchanges` → fail (an active Lens must
  carry its own eval cases).

Failure messages name the file, the field and the rule, in language a domain
expert can act on — not a schema-library stack trace. This is a stated
acceptance criterion, because it is where an "engineers only" system quietly
reasserts itself.

**4.4 Draft Lenses.** `status: draft` loads in non-production only. In
production a draft Lens is absent from the picker and unusable by id. This lets
a specialist iterate against a real corpus without exposing half a persona to a
client.

**4.5 What still needs a code change.** Adding a Lens does not. Adding a new
*field* to the schema does, and that is correct — a new field is a new behaviour
in the orchestrator, not content.

---

## 5. Lens switching

- **Switching mid-conversation re-renders the next answer in the new Lens. It
  does not rewrite history.** Previous turns keep the Lens they were produced
  under, and the transcript shows which.
- **A Lens change never changes what data the user can see.** The picker states
  this in plain words, at the point of choosing — not in a tooltip. Enforced
  structurally: the Lens is not a parameter of `resolveAccess`, `assemble` or
  `groundedLibrary`, and an eval permission case asserts that an identical
  question under all four Lenses returns an identical source set.
- **The active Lens is logged against every request** (id + version), for eval,
  analysis and Teach attribution.
- **Default.** A user's last-used Lens persists in `user.preferences` (the
  mechanism already exists — [auth.ts:64-77](../../apps/api/src/auth.ts#L64-L77)). A user who has never chosen one gets
  `planning-environmental`, as the modal user of the platform. The default is
  config, not code.

---

## 6. How a Lens reaches the model

A Lens composes the system prompt; it does not replace it. Composition order,
outermost first:

1. **The shared core** (§1) — fixed, identical for every request.
2. **The mode statement** — declared or model-chosen orchestration ([03](03-orchestration-and-plan.md)).
3. **The Lens overlay** — register, answer shape, escalation language, prohibitions.
4. **The task** — the workflow's own instruction, or the free-form request.

The current implementation has two hard-coded system strings
([grounded-draft.ts:32-53](../../packages/capabilities/src/grounded-draft.ts#L32-L53)); those become the shared core plus the mode
statement, with the Lens overlay inserted between. **The Lens never sees, and
never contributes to, the retrieval query.** Register is applied to the answer,
not to the search — otherwise a Lens would silently become a data filter, which
is exactly the failure mode non-negotiable 11 exists to prevent.

---

## 7. Open questions raised, not resolved

Logged to the grill tracker rather than settled inline (CLAUDE.md working rule):

- **Lens vs org house style.** An organisation's own tone-of-voice is org
  context (ADR-0020, informing channel). Does an org override a Lens, compose
  with it, or is a house style a *fifth* composition layer? Slice E territory —
  it interacts with the distillation destination rule (ADR-0026).
- **Per-Lens output destinations.** A PM's tabular output naturally wants a
  different destination from a Communications Q&A brief. Deferred until the
  destination selector exists ([08](08-interface.md)).
- **Who owns a Lens file.** Infora-wide domain content today. If a customer
  wants their own Lens, that is org context and crosses into Slice F.
