# 05 — Clarifying questions

**Frame this as scoping, not as an interruption.** Scoping is a step planners
already recognise and already do — agreeing what a piece of work covers before
starting it. Presented that way, a clarifying question reads as competence. The
word "clarify" does not appear in the UI; the stage is called **Scoping**.

---

## 1. When they trigger

Two triggers, both mechanical:

1. **The orchestrator's confidence in scope falls below a threshold.** The
   threshold is configuration, tuned per Lens, not a constant in code.
2. **The question maps to a declared workflow with unbound required
   parameters** ([03](03-orchestration-and-plan.md) §4). This trigger is deterministic and is the more
   valuable of the two — it is the mechanism by which routing into a workflow
   feels like being understood rather than being interrogated.

Clarification runs at the frontier tier ([04](04-model-routing.md) §2): the recommendation is doing
the teaching, and a weak recommendation costs more trust than a slow one.

---

## 2. Presentation

A numbered set of multiple-choice questions, paginated, with a visible position
indicator ("2 of 4").

Each question offers:

- **Options** — at most one carrying a `RECOMMENDED` badge.
- **An info affordance per option**, explaining the *consequence* of choosing
  it. Not a definition — a consequence.
- **A Custom free-text field.**
- **Skip this question.**

And always available, never buried:

- **Skip All Questions.**

### 2.1 The info affordance is the product

This is where the system demonstrates it understands the user's job. The
difference between:

> *PEIR — the Preliminary Environmental Information Report.*

and:

> *PEIR — the pre-application version. Choose this if you are asking what was
> consulted on. If you are asking what the ExA is examining, choose the
> submitted ES; the two differ on the compound layout.*

is the difference between a glossary and a colleague. The second is the
specification. Option explanations that merely expand an acronym fail review.

### 2.2 The recommendation

- **At most one** option per question is recommended. Zero is acceptable — where
  there is genuinely no better default, recommending one is dishonest.
- The recommendation is derived from the corpus state where possible (the most
  recent controlled version, the deadline nearest the question), not from a
  static default.
- The reason for the recommendation is in its info affordance.

---

## 3. Lens-aware content

Question content comes from the active Lens's `clarifying_bias`, in order
([01](01-lens-framework.md) §2). This is why the field is ordered rather than a set: it is the
priority in which ambiguities get asked about.

| Lens | Asks first about |
| --- | --- |
| Planning & Environmental | Which document version; which examination stage; which topic or receptor |
| Engineer | Which option or alignment; which construction phase; which asset or chainage |
| Project Manager | By when; whose deadline; which milestone |
| Communications | Which audience; which channel; what is already public |

The same vague question therefore produces different scoping questions under
different Lenses — which is correct, because the ambiguity that matters differs
by reader.

**A clarifying question never asks about access.** "Which documents should I
look at?" is a scoping question about relevance, answered within the user's
entitled slice. It is never a question about permission, and the options never
include something the user cannot reach.

---

## 4. Skipping

**Skipping is recorded, not punished.**

- A skipped question is recorded as skipped in the plan, with the option the
  system would have recommended.
- **If a user skips all, the system proceeds on stated assumptions which it
  names at the top of the answer** — not in a footer, not in the plan only. The
  assumptions are part of the answer because they change how it should be read.
- Assumptions are written in the active Lens's register, like everything else.
- Skip rates per question are a product signal: a question skipped by almost
  everyone is a question that should not be asked, and one whose recommendation
  is almost always accepted is a question that should be a default.

---

## 5. Binding into the plan

Answers bind into the plan artefact and are visible there
([03](03-orchestration-and-plan.md) §3.1 `clarifications`).

```yaml
clarifications:
  - id:           uuid
    ordinal:      int
    question:     string
    options:
      - id, label, consequence, recommended: bool
    answer:       { option_id } | { custom: string } | { skipped: true }
    recommended_option_id: string | null
    answered_at:  timestamp
```

- Bound answers populate `workflow.parameters` in declared mode, or the
  orchestrator's scope in model-chosen mode.
- The plan's `assumptions` array is populated from every skipped question,
  using the recommendation that was not taken.
- Because the plan is editable and re-runnable ([03](03-orchestration-and-plan.md) §3.4), changing a
  clarification answer and re-running is a supported path — and the natural fix
  when a user realises they answered on the wrong document version.

---

## 6. The plan state machine

```
draft ──(clarification needed)──► awaiting_clarification
  │                                       │
  │                          (answered or all skipped)
  │                                       ▼
  └──────────(no clarification needed)──► ready ──► running ──► complete
```

- A plan sits in `awaiting_clarification` without consuming model budget.
- Abandoning a conversation leaves the plan in `awaiting_clarification`; it is
  readable and shows what was being asked. It is never silently discarded, since
  the questions themselves are useful evidence of how the system reads the
  request.

---

## 7. What is deliberately not built

- **Multi-turn clarification.** One scoping round per plan. If the answers
  reveal a different question, that is a new plan, which is honest and keeps the
  artefact simple.
- **Clarification in the Copilot surface.** ADR-0031 makes Copilot a read-only
  Ask surface with a bound project; a paginated question set does not fit the
  channel. Copilot proceeds on stated assumptions, which the answer names.
