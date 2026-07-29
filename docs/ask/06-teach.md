# 06 — Teach

**Capture and triage only. No automatic promotion into context, ever. And
nothing crosses the organisation boundary.**

Teach is how a user tells Infora it got something wrong. It is the front end of
the flywheel the platform already has — ADR-0026's distillation loop and
ADR-0028 §9's Signal capture — not a second, parallel learning system.

> **Ruled 2026-07-29 (owner).** *"No aggregation across customers — Teach
> improves the individual org's signals."* Teach lands **entirely inside the
> originating organisation's boundary**. There is no shared-domain-layer
> destination, no de-identified egress to Infora, and no cross-customer
> aggregation of any kind. This is not an extension of ADR-0026 — it is ADR-0026
> applied unchanged: *"The flywheel turns within an organisation's boundary,
> never across it."*

---

## 1. What Teach is not

Distinguishing these keeps the confidentiality model intact.

| | **Signal** *(exists — ADR-0028 §9)* | **Teach** *(new)* |
| --- | --- | --- |
| Origin | Behavioural: the user accepts, edits or rejects a suggestion | Deliberate: the user writes something |
| Content | The resolution event | Human-authored text |
| Volume | High, passive | Low, intentional |
| Boundary | Org-partitioned; pooling prohibited (ADR-0026, 2026-07-22) | **Identical — org-partitioned, pooling prohibited** |
| Destination | The Signal sink (Session 7, deferred) | The organisation's own layers (§4) |

The two are complementary and must not be merged. A Signal is evidence of what
happened; a Teach submission is a claim about what should have happened. **They
now share one boundary rule**, which is the simplification the ruling bought.

---

## 2. The control

Available on any completed response. Tooltip: *"Report a mistake to help Infora
learn."*

Opens a dialogue containing:

1. **Model-drafted text describing what should be learned**, fully editable. The
   draft is a starting point, not a form to approve — the user is expected to
   rewrite it, and the field is focused with the text selected.
2. **An explicit, visible statement of what is transmitted.** Not a link, not a
   collapsed section:
   > *"This stays inside <Organisation>. Only the text above is saved. Your
   > conversation, the plan and your documents are not copied — the record links
   > to them, and only people in your organisation who can already see them can
   > follow the link."*
3. **A confirmation checkbox:** *"I confirm this text contains no information
   that should not be reused on this organisation's other projects."*
   Submission is disabled until ticked.
4. **The tier**, pre-selected by the system's own classification and changeable
   by the user (§4).

### 2.1 The checkbox wording changed with the ruling

The original wording was *"contains no confidential or sensitive information"* —
which made sense when the text was about to leave for a shared layer. It no
longer is, so that wording would be both wrong and quietly misleading: it
implies an egress that does not happen, and it asks the wrong question.

The real risk under the ruling is **ADR-0026 Filter 2, internal to the firm**:
org context is *portable*, so it travels from this project to the same firm's
work for a rival client. The question the user must actually answer is therefore
not "is this confidential" but **"is this safe to carry to our other clients"**.
That is what the checkbox now asks.

### 2.2 What is captured on submit

```yaml
teach_submission:
  id:                        uuid
  text:                      string     # the EDITED text, nothing else
  tier:                      correction | steer | preference
  organisation_id:           uuid       # the real id — this never leaves
  submitting_participant_id: uuid       # attributable inside the firm
  project_id:                uuid
  lens_id:                   string
  lens_version:              int
  mode:                      declared | model_chosen        # 03 §1.2
  workflow_id:               string | null
  submitted_at:              timestamp
  plan_pointer:              plan_id    # a POINTER, not a copy
  status:                    new | triaged | approved | rejected | converted
```

**Real identifiers, not pseudonyms.** The earlier draft of this specification
pseudonymised the organisation at capture, because the submission was heading
for a shared layer. Under the ruling it is not, and pseudonymising would be
actively worse: the firm could no longer attribute a correction to the person
who made it, which is the accountability ADR-0026 requires of a curation act.
This is ordinary org-internal data and is held like ordinary org-internal data.

**`plan_pointer` is a pointer, not a copy.** It resolves under existing project
permissions, so a reviewer sees the context only if they could already see it.

---

## 3. Why mode and Lens are captured

A correction against a `model_chosen` run is evidence about that answer. It is
**not** evidence about a declared workflow, because the step sequence was not
the workflow's. Recording `mode` prevents a correction on an improvised run
being promoted into a codified workflow's definition, which would degrade the
thing the product is built on.

`lens_id` + `lens_version` are captured for the same reason: a register
complaint against Lens v1 is not automatically a complaint about Lens v3.

---

## 4. The three tiers

Every destination is inside the organisation.

| Tier | Example | Destination | Review |
| --- | --- | --- | --- |
| **Correction** | Wrong citation, misread paragraph, wrong instrument | The organisation's own eval case library + its review queue | **Human triage, mandatory** |
| **Steer** | Wrong approach, missed the right comparator | The organisation's own org context or its own custom workflow | **The firm's curator, mandatory (ADR-0026)** |
| **Preference** | Format, tone, house style | Organisation or user layer | None — applies immediately |

### 4.1 Correction

The highest-value tier and the one the eval flywheel runs on (§6). A correction
is a factual claim about a specific answer, so it converts naturally into a case
with `must_cite` / `must_not_cite` assertions — **in the organisation's own case
library, pinned to a fixture drawn from its own corpus** ([07](07-eval-harness.md) §3.1).

### 4.2 Steer

Under the ruling, this tier is **exactly ADR-0026's curation act** and needs no
new governance — which is the point of the ruling.

- **The destination is the firm's own portable org context**, or its own custom
  workflow definition (a Slice F artefact).
- **Filter 2 applies, unchanged and for the original reason.** Org context is
  portable: it travels to every project the firm works on, including work for a
  rival of the client whose project produced the correction. So a Steer encodes
  the *method* — how a question of this shape should be approached, which
  comparator matters — and never a client constant: not a scheme name, a site, a
  figure, a position or a party. The firm owns how it argued; the client owns
  what it argued about.
- **Filter 1 applies too.** A Steer may draw only on material the firm owns, not
  on project content it can merely see. *Visible ≠ distillable.*
- **The approver is the firm's own curator**, accountable inside the firm —
  ADR-0026's named role, now with a UI. Not an Infora reviewer, because Infora
  is not in this loop at all.
- **No auto-promotion, and no code path that could be flipped on to enable it.**
  No `autoApprove` flag, no config key, no environment variable. The promotion
  function takes an approving participant id as a required, non-nullable
  argument, so promotion without a named human is not expressible.

### 4.3 Preference

Format, tone, house style. Applies immediately at organisation or user layer, no
review — it changes nothing outside the organisation and nothing about
correctness.

**Preference is where context sprawl begins**, so it carries a discipline the
other tiers do not need: preferences are held as a bounded, structured set, not
free text accumulated into a prompt. A preference that cannot be expressed in
the set is not a preference — it is a Steer, and is re-tiered on review.

---

## 5. What this costs Infora, stated plainly

The ruling is right, and it has a real consequence that should not be discovered
later:

**Infora's own product quality does not improve automatically from customer
corrections.** Nothing flows back. Infora's shipped Lens definitions, workflow
definitions and seed eval library are built by Infora, from Infora's own
fictional fixtures, informed by its own domain expertise — not harvested from
what customers correct.

Three things follow, and they are all fine:

1. **Infora needs a separate, ordinary support channel** for genuine product
   defects — *"your citation chip renders wrong"*, *"the rail showed a stage that
   didn't run"*. That is a bug report, not learning, and it carries no customer
   content beyond what the reporter chooses to write. Teach is not that channel
   and should not be bent into it; the dialogue offers a plain "report a problem
   with Infora" link instead.
2. **Aggregate telemetry stays available and is not affected** — skip rates,
   fall-through-to-`model_chosen` rates, per-category eval results on Infora's
   own fixtures. These are counts about the product's behaviour, not content
   derived from customer work.
3. **The moat argument gets stronger, not weaker.** "Your corrections make your
   instance better and can never surface in a rival's" is a better thing to say
   to a consultancy than any cross-customer learning story, and it is the same
   sentence ADR-0026 already commits the platform to.

---

## 6. The reviewer queue

An **organisation-facing** surface, held by the firm's curator and org admin.
Not an Infora-internal tool.

- **List**, filterable by tier, status, Lens, project and date.
- **View a submission**: the text, the tier, the Lens and version, the mode, the
  submitting participant, and the plan via its pointer — the pointer resolving
  only for reviewers who could already see that project.
- **Actions:** Approve · Reject · Convert to eval case · Re-tier.
- **Audit trail:** every action records who, when, and the reason, append-only on
  the existing pattern.
- **Scoped like everything else.** The queue is reached through the same access
  resolution as every other surface; a reviewer sees submissions from projects
  they are entitled to, and the ethical wall holds inside the queue exactly as
  it does outside it.

**Approval is a human action.** Rejecting for under-abstraction is the expected
common outcome on the Steer tier, not a failure — it is Filter 2 working.

---

## 7. From a triaged correction to an eval case

The loop terminates in an eval, which is the whole point — a correction that
does not become a test is a complaint, not learning.

```
correction → the firm's curator converts → a case in THIS ORGANISATION's library
    → RUN THE NEW CASE AGAINST THE CURRENT SYSTEM
        → it FAILS  ⇒ the case is real. Add it.
        → it PASSES ⇒ the report is NOISE. Close it. Do not add it.
```

**The "expect it to fail" step is not optional.** A case that already passes
proves the reported behaviour is not reproducible — the user may have
misremembered, the answer may have been under a different Lens, or it may already
be fixed. Adding it inflates the library with cases that can never catch a
regression, and library inflation is how an eval suite quietly stops meaning
anything.

The generated case is pinned to a frozen fixture drawn from the organisation's
own corpus at conversion time ([07](07-eval-harness.md) §3.1), so it stays valid as the live corpus
moves on — and so it never needs to travel to be useful.

---

## 8. Context discipline

The anti-pattern this section exists to prevent: **every Lens, org tweak and
Teach submission inflates the prompt, and context that only grows becomes
context that only degrades.**

Requirements:

- Infora's own domain layer is **versioned like code**, with an owner and a
  review process — which it already is, since Lens and workflow definitions are
  files in the repository.
- **An organisation's accumulated Steer and Preference content is subject to the
  same discipline**, held as versioned records with a curator, not as an
  ever-growing prompt fragment.
- **Deletions are a normal, expected operation.** The reviewer queue has a path
  to remove content, not only to add it. A quarterly review that removes nothing
  is a red flag.
- **A budget per composition layer**, enforced at load: the shared core, the Lens
  overlay and the organisation's own layer each have a token ceiling. Exceeding
  it fails rather than silently truncating — an organisation that has taught
  Infora more than fits is told so, and asked to curate.
- **Eval-gated.** A change to an organisation's own layer runs that
  organisation's case library before it takes effect, reported per category
  ([07](07-eval-harness.md) §4.1). A Steer that improves one category and regresses another is a
  trade for a person to decide, not something to absorb silently.
