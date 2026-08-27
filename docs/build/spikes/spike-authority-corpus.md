# SPIKE — the authority corpus (T-276)

> **Status: findings, 2026-08-27. Research, not build.** T-276 is a spike: it
> blocks nothing and produces findings, not code. It exists because
> `authorityRef` runs through [contracts](../../../packages/contracts/src/assembly.ts),
> the citation table and the
> [ground-check](../../../packages/governance/src/ground-check.ts) — the shape
> of a citation to external authority is fully specified — and **there is no
> store behind it**. The canon half of Ask has no data.
>
> It answers T-276's three questions — *the v1 standard-tier instrument list
> with a licence basis for each*, *the in-force interval model*, and *org-tier
> ingest* — and recommends what **T-277** should build.
>
> ⚠ **The corpus itself is beyond V1**, both tiers (T-277 and T-278 are marked
> ⛅). Only this spike is frontier work. So the findings are written to be
> **still true when they are picked up**, which means separating what is a fact
> about the domain from what is a decision this build made.
>
> ⚠ **Licence positions here are research, not advice.** A spike can name a
> basis and a risk; it cannot rule a licence. Every position in Finding 1 is
> marked with what would confirm it, and the ones marked ⚠ must be confirmed by
> counsel before anything ships.

## What exists today

Everything except the data.

| | |
| --- | --- |
| [`assembly.ts`](../../../packages/contracts/src/assembly.ts) | `source: { versionId } \| { authorityRef: string }` — a citation already resolves to either corpus |
| [`ground-check.ts`](../../../packages/governance/src/ground-check.ts) | keys an authority source as `authority:<ref>`; the invariant already admits it |
| [`cite-leaf.ts`](../../../packages/orchestration/src/cite-leaf.ts), `run-reader.ts` | a run records an authority citation and reads it back |
| `citations.authority_ref` | the column is there, and the CHECK admits a row with it and no `version_id` |
| **the store** | **nothing.** No table, no ingest, no retrieval path |

So `authorityRef` is a **string with no referent**. Nothing writes one today,
which is why the gap has been invisible: the type admits a citation the product
cannot produce.

## Finding 1 — the standard tier is small, and its licence basis is one basis

ADR-0023's extension confined the standard tier to *"material Infora can ship
freely"*, and the practical content of that phrase is: **Crown copyright,
published under the Open Government Licence v3.0**. One basis covers nearly the
whole list, which is what makes the tier shippable at all.

| Instrument class | Examples | Publisher | Licence basis | Confidence |
| --- | --- | --- | --- | --- |
| **Primary legislation** | Planning Act 2008 | legislation.gov.uk | Crown copyright, OGL v3.0 | ✅ well established |
| **Secondary legislation** | Infrastructure Planning (EIA) Regulations 2017; Conservation of Habitats and Species Regulations 2017; Examination Procedure Rules 2010; Applications: Prescribed Forms and Procedure Regulations 2009 | legislation.gov.uk | Crown copyright, OGL v3.0 | ✅ |
| **National Policy Statements** | EN-1 to EN-5; National Networks; Ports; Water Resources; Waste Water; Airports | the designating department | Crown copyright, OGL v3.0 | ✅ for the text; ⚠ **annexes and figures may reproduce third-party material**, which OGL does not cover |
| **PINS Advice Notes** | Advice Notes 1–18 | Planning Inspectorate | Crown copyright, OGL v3.0 | ✅ |
| **s.51 advice** | published advice to applicants | Planning Inspectorate | Crown copyright, OGL v3.0 | ✅ |
| **Made DCOs** | Orders made as SIs | legislation.gov.uk | Crown copyright, OGL v3.0 | ✅ |
| **Decision Letters** | SoS decisions on DCO applications | the deciding department | Crown copyright, OGL v3.0 | ✅ text; ⚠ **contain named individuals** — see the register note below |

**Three carve-outs matter more than the list.**

**(a) OGL does not cover everything inside an OGL document.** The licence
excludes third-party rights, personal data, and departmental logos. An NPS
figure licensed from a consultant, or a table reproduced from a BSI standard,
is not OGL because the document around it is. **Ingest cannot assume the
document's licence covers every part of the document** — which argues for
provision-grain licence attribution rather than document-grain, and is the
cheapest place to put the guard.

**(b) Decision Letters and DCOs name people**, routinely — the Examining
Authority, the applicant's representatives, sometimes objectors. They are
published Crown-copyright documents, so this is not a leak; but Infora would be
**introducing a store of named individuals** by shipping them, and CLAUDE.md's
working rule says a ticket that does so says so and names where it is deleted.
**T-277 must register this in [personal-data.md](../personal-data.md)** before
it loads a single Decision Letter. Nothing here is deleted at a customer's
exit, because it is not the customer's material — it is public record shipped
by Infora — and that answer needs writing down rather than being inferred.

**(c) The list is deliberately UK-NSIP-shaped.** Jurisdiction scope was left
open by ADR-0023 (*"v1 jurisdiction scope remains open"*) and this spike
recommends closing it at **England (and Wales where an instrument extends
there)**, because extent varies *per provision* and a corpus that silently
mixes extents will answer a Welsh question with an English provision. See
Finding 2.

**What Infora does not ship, and this is the commercially load-bearing half.**
BSI (BS 4142, BS 5228, BS 8233) and ISO (ISO 19650) are copyright of their
issuing bodies and sold per user or per site. **Infora buys no subscriptions**
(ADR-0023 §3): a firm that needs them holds the licence it already holds and
adds them to its own shelf. DMRB, CIEEM, IEMA and CIRIA material is ⚠
**mixed** — some free-to-download, some member-restricted, and "free to
download" is not "free to redistribute". **All of it is org tier**, and the
rule that keeps this simple is: *if Infora would have to agree to anything to
ship it, it is not standard tier.*

## Finding 2 — "in force" is not one interval, and the second one is the useful one

This is the finding that changes the build.

**A provision, not a document, is the unit.** An Act is not in force; its
sections are, on different dates, by commencement order, with different
territorial extents. Modelling in-force at document grain is wrong in a way
that produces confidently wrong answers rather than obviously wrong ones.

**And there are two distinct time axes, which are routinely conflated:**

- **The text interval** — *when was this wording the wording?* A provision is
  amended, and the amended text has its own start date. This is what
  legislation.gov.uk's point-in-time view answers.
- **The applicability rule** — *which cohort of applications does this govern?*
  NPSs carry transitional provisions: a designated NPS applies to applications
  accepted after a date, and applications already in the system continue to be
  decided under the previous NPS. **The instrument in force today is frequently
  not the instrument that governs the scheme being asked about.**

The consenting questions that matter are almost all of the second kind — *which
NPS applied when this was accepted*, *which Advice Note version was the ES
drafted against* — which is exactly why T-278 makes `in_force_at` load-bearing
and why this cannot be `corpus_retrieval` with a flag.

**Recommendation: store the first, carry the second, compute neither.**

```
authority_instruments   id, title, type, publisher, jurisdiction, tier, licence_basis
authority_versions      instrument_id, version_label, in_force_from, in_force_to,
                        superseded_by, extent, editorial_state, transitional_note
authority_provisions    version_id, locator, heading, text, start_offset, end_offset
authority_chunks        provision_id, content, embedding, model id + version
```

- **Amendments are new `authority_versions` rows, never in-place edits** — the
  same append-only discipline `versions` already has, for the same reason: a
  citation into last year's wording must still resolve.
- **`in_force_to` is nullable and means "still current"**, and a row with
  `in_force_from` in the future is **prospective** — not returned by a query at
  today's date, but a drafter needs to know it is coming, so a query must be
  able to ask for it rather than being unable to see it at all.
- **`transitional_note` is text, and is returned beside every hit.** Infora
  cannot compute which cohort an application falls into — that depends on facts
  about the application — so it must not appear to. Returning the note is the
  honest form of "here is the rule; you decide".
- **`editorial_state`** records the thing legislation.gov.uk itself warns
  about: revised text carries *"changes to legislation not yet applied"*. A
  corpus that drops that caveat is asserting currency it does not have.
- **`extent` is per version**, not per instrument, because that is how extent
  actually works.

**The locator model is already built.** T-271 stores a character span and
derives the view; T-305 added page by writing a page separator into the text.
An authority provision's natural locator is its **number** (`s.104(2)`,
`reg. 5(2)(a)`), which is *typed into the text* — so the same span machinery
carries it, and the heading-number work in T-307 is directly reusable. **No new
locator mechanism is needed**, which is worth saying because it looks like it
would be.

## Finding 3 — the org tier's real problem is not ingest, it is *what counts*

Mechanically, org-tier ingest is solved: T-305 and T-306 built the extractors
and the loud per-document refusal, and a firm's standard arrives as a PDF like
everything else.

The hard part is the boundary ADR-0023 §2 draws. Org context **informs only**
(ADR-0020) — but an org-tier authority entry **grounds and is cited**, and the
ADR's reason is that *surface placement does not set channel role*: what
matters is **what the material is**. A firm's own precedent informs; a
published external instrument grounds.

**That distinction has to be enforced at ingest or it is not real.** The
operative test from the ADR is three facts — *an issuing body, a version, and
an in-force date*. So:

> **An org-tier entry requires an issuing body, a version label and a declared
> in-force date, and an upload that cannot supply all three is org context,
> not authority.** The form is the enforcement.

This is the whole of the safeguard, and it is cheap. Without it, "add to my
authority shelf" becomes a way to make a firm's own method document citable —
which is precisely the laundering ADR-0026's filters exist to prevent, arriving
through a door nobody was watching.

**Currency is org-declared, and the note must say so.** Infora cannot know a
customer's uploaded standard has been superseded. The entry carries
`last_reviewed`, and T-278's `currency_note` distinguishes *"Infora-maintained"*
from *"org-declared, last reviewed <date>"*. Reporting one guarantee for both
would be the most expensive small lie in the product.

**Licensing: Infora sees the attestation, never the licence.** The precedent is
the conflict register (ADR-0046 §8) — trust-plus-audit, because inspecting a
customer's licence would be theatre. At ingest the org admin attests that the
organisation holds a licence permitting internal use. ⚠ **The risk worth
naming**: BSI and ISO licences are commonly **single-user**, and Infora's org
tier makes the text reachable by *every* participant of that organisation. A
firm uploading a single-user PDF may be breaching its own licence, and Infora
would be the mechanism. **Recommendation: the attestation asks which licence
type, and the answer is recorded** — it costs one radio button and it moves the
question from "nobody asked" to "they said corporate".

## Finding 4 — the authority corpus must NOT live in `version_chunks`

A store-level finding, and the one with a safety consequence.

`version_chunks` is under row-level security (T-247) and every read of it goes
through `deliverableVisibleSql` — a predicate built entirely around **project
material**: producer, project owner, live share, acknowledgement, participant
narrowing. The standard tier is **deliberately outside per-tenant access
resolution** — the law is the law — and the org tier is walled by a *different*
rule (org-private, ADR-0018's floor), which that predicate cannot express.

Putting authority chunks in `version_chunks` would mean either widening the
wall predicate to admit rows it was not written for, or carrying a corpus with
no wall inside the table whose entire purpose is enforcing one. **Both are the
kind of change that looks small and is not.** ADR-0024 already notes the
authority corpus is the one corpus that may later split out of pgvector; this
spike recommends it be **separate from the start** — same database, same
extension, its own tables — because the cost of separating later is a
migration, and the cost of not separating is a wall predicate with an exception
in it.

**Sizing says nothing prevents it.** The standard tier is on the order of
**100–200 documents** — one Act, a handful of SIs, ten or so NPSs, eighteen
Advice Notes, and a growing set of DCOs and Decision Letters — which is smaller
than the pilot's own project library and an order of magnitude below anything
that would justify a separate store on performance grounds.

## Recommendation for T-277

In order, and the first two are the ones that carry risk:

1. **Separate tables, from the start** (Finding 4). Do not extend
   `version_chunks`.
2. **Register the named-individual exposure** in
   [personal-data.md](../personal-data.md) *before* loading Decision Letters
   (Finding 1b), including the answer that it is not deleted at a customer's
   exit because it is not the customer's material.
3. **Provision grain with two time axes** (Finding 2): a text interval stored,
   a transitional note carried, applicability never computed.
4. **Three required fields on org-tier ingest** — issuing body, version,
   in-force date — as the enforcement of ADR-0023 §2 (Finding 3).
5. **A licence-type attestation** at org-tier ingest, recorded (Finding 3).
6. **Reuse the locator machinery** — spans and the heading-number split — rather
   than inventing a provision-locator mechanism.

## What this spike does *not* settle

- **Whether the licence positions hold.** They are research. ⚠ The OGL
  third-party-rights carve-out and the BSI/ISO single-user question both need
  counsel before anything ships, and both are named above rather than assumed
  away.
- **Ingest cadence and its operator.** *Who* re-checks that an NPS has not been
  amended, and how often, is an operating question rather than a design one —
  and it is the one that decides whether "Infora-maintained" is a promise or a
  claim. It belongs with the operating envelope.
- **Jurisdiction beyond England and Wales.** Recommended as v1 scope; Scotland
  and Northern Ireland have a different consenting regime entirely, and
  admitting them is a corpus decision, not a schema one.
- **Whether the compliance-checking capability shares this retrieval path.**
  ADR-0023 says checking *reads* the corpus and does not own it; whether it
  reads it through `authority_lookup` (T-278) or its own path is T-310's
  business.
- **What happens when an org-tier entry and a standard-tier entry disagree.**
  Two organisations on one project holding different shelves is ruled correct
  and surfaced by the `tier` field. One organisation holding a *superseded*
  copy of something Infora also ships is a different case, and nobody has ruled
  it.
