# 08 — The Ask interface surface

Standing constraints from the repo, not restated per component: semantic design
tokens only, no `window.prompt`, surfaces depend on `contracts` + `ui` only
(enforced by [scripts/dep-rules.mjs](../../../scripts/dep-rules.mjs)), and every surface is a thin client over
the one typed API. UI vocabulary: [docs/design/ui-vocabulary.md](../../design/ui-vocabulary.md).

The current Ask screen is [apps/web/src/screens/ask.tsx](../../../apps/web/src/screens/ask.tsx) — 237 lines, a
composer with a source-insert popover, agent messages with inline citations, and
a `<details>` expander wrapping `RunTrace`. Everything below is additive to it.

---

## 1. Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Ask · <project>                          [Grounded & cited]     │
├────────────┬─────────────────────────────────────┬───────────────┤
│  PROGRESS  │  transcript                         │  source panel │
│  RAIL      │                                     │  (on demand)  │
│  (§4)      │  ┌───────────────────────────────┐  │               │
│            │  │ answer                        │  │               │
│            │  │ … inline citations …          │  │               │
│            │  ├───────────────────────────────┤  │               │
│            │  │ COMPLETION FOOTER (§5)        │  │               │
│            │  └───────────────────────────────┘  │               │
│            │                                     │               │
│            ├─────────────────────────────────────┤               │
│            │  composer                           │               │
│            │  [Lens][Model][Sources][Tools][Ctx] │  (§2)         │
└────────────┴─────────────────────────────────────┴───────────────┘
```

The source panel already exists ([source-panel.tsx](../../../apps/web/src/source-panel.tsx), T-105) and is unchanged.

---

## 2. Composer chips

Below the input. Each is a button showing current state, opening a popover.

### 2.1 Lens chip

- Shows the active Lens label: **"Planning & Environmental"**.
- Click opens the picker: label, description, and — **stated in the picker
  itself, not in a tooltip** — *"A Lens changes how answers are written. It does
  not change what you can see."*
- Draft Lenses do not appear in production ([01](01-lens-framework.md) §4.4).
- Changing it re-renders the **next** answer. History keeps the Lens it was
  produced under, and each past answer shows its Lens in the footer.
- Persists to `user.preferences` (mechanism exists — [auth.ts:64-77](../../../apps/api/src/auth.ts#L64-L77)).

### 2.2 Model chip

- Shows what the router selected for the current turn, with an **Auto**
  indicator: **"Auto · Opus"**.
- Click to pin a specific model as an override **for this conversation**, with a
  clear reset to Auto.
- **Default is always Auto.** A pin is per-conversation and never sticky across
  conversations.
- Pinning is logged on the plan and shown in cost reporting ([04](04-model-routing.md) §6).
- **The tier constraint is not overridable.** The pin list contains only routes
  conforming to the deployment tier ([tiers.ts:156-175](../../../packages/model/src/tiers.ts#L156-L175)); a
  non-conforming model is absent, not disabled.

### 2.3 Data sources chip

- Shows how many sources are in scope: **"8 data sources"**, or a **warning
  state when none** — because a grounded answer over an empty scope is the single
  most misleading state Ask can be in.
- Click to view and refine which parts of the corpus are in play for this
  conversation: by classification facet and term (the ontology pre-filter,
  ADR-0045 / T-242), by document type, by container.
- **Shows only what the user is entitled to.** The list is built from the same
  `deliverableVisibleSql` pre-filter as retrieval ([library.ts:10](../../../apps/api/src/library.ts#L10)), so the
  chip cannot show a document the answer could not have used.
- **Refinement narrows, never widens.** The chip's selection is intersected with
  the entitled slice server-side; it is a relevance control, not an access one.

### 2.4 Tools chip

Browse and pin Infora's codified workflows. "Tools" not "Skills" — a *tool* is
the packaged capability a user launches and a *workflow* the codified sequence
it runs (CONTEXT.md; renamed 2026-07-13, T-109). Pinning a tool biases
classification toward it for the conversation; it does not force it.

### 2.5 Context indicator

Context budget consumed for the conversation, against the assembly budget
([gateway.ts:20](../../../packages/knowledge/src/gateway.ts#L20)). Informational.

### 2.6 Teach

On completed responses, not in the composer. Tooltip: *"Report a mistake to help
Infora learn."* Opens the dialogue specified in [06](06-teach.md) §2.

---

## 3. Output destination selector

At the top of a **new** conversation: where analysis outputs are written.

**This carries permission consequences and is not a preference.** Under the
label-propagation rule (non-negotiable 4), the destination's access label
constrains what may be written there.

- Destinations are the sandboxes the user can reach, at their real scope —
  named-user, team, single-organisation or multi-organisation (ADR-0036).
- **Warn visibly when the selected destination is broader than the source
  material.** Writing an answer grounded on a deliverable narrowed to named
  Participants (ADR-0035 §3) into a multi-organisation sandbox is a downgrade,
  and the warning names both labels: *"This answer draws on material restricted
  to 3 named people. The selected destination is shared with 2 organisations."*
- **Broader than sources → block by default**, with an explicit override that is
  recorded on the plan and in the audit trail. Narrower than sources → allowed,
  no warning needed.
- The destination's computed label appears in the completion footer.

**This cannot ship before finding F2 is closed** ([09](09-permissions-remediation.md) R2). A destination
selector without label propagation is a UI that implies a guarantee the backend
does not make.

---

## 4. The progress rail

A visible left-hand stage list, updating live. **A significant trust signal, not
decoration.**

| Stage shown | From ([03](03-orchestration-and-plan.md) §2) |
| --- | --- |
| Understanding your question | `understand` |
| Loading context | `load_context` |
| Scoping | `clarify` |
| Searching project documents | `search_corpus` |
| Checking the consenting canon | `check_authority` |
| Researching publicly available sources | `research_web` |
| Planning the analysis | `plan` |
| Running the analysis | `analyse` |
| Verifying citations | `verify` |
| Report | `present` |

**Rules, all load-bearing:**

- **Stages reflect real execution.** A stage that did not run is never shown as
  having run. A conditional stage that was not needed is either absent or shown
  explicitly as not run — never quietly completed.
- **Failed and skipped stages show as failed and skipped** ([03](03-orchestration-and-plan.md) §6), never
  as completed. A run that lost a branch says so on the rail.
- Stage transitions come from the plan's step states, not from a client-side
  timer. A rail driven by a timer is a lie that happens to look right most of the
  time.
- The rail is the natural home for streaming when it lands; until then it
  updates by poll and the answer arrives whole.

---

## 5. The completion footer

Below every completed answer.

**Always visible:**

- What was produced, in one line.
- **The orchestration mode, in words** — *"Ran the declared workflow: Answer a
  question about the project"* or *"Composed for this question"* ([03](03-orchestration-and-plan.md) §1.2).
  This is a hard requirement, not a nicety.
- The Lens the answer was produced under, with version.
- Counts: claims cited, claims withheld, uncited claims labelled open-world —
  read off the existing `railOutcomes` ([ask.tsx:194-198](../../../apps/web/src/screens/ask.tsx#L194-L198)).
- **Where verification could not be taken independently, say so** ([04](04-model-routing.md) §3).

**Behind a Details affordance:**

- The **plan artefact**, rendered as steps with their states, editable and
  re-runnable ([03](03-orchestration-and-plan.md) §3.4).
- The workers invoked.
- Per-step model and cost, with pinned models marked.
- The **full citation manifest** — every source, with document reference,
  version, locator, and its register (record / authority / external).
- The existing `RunTrace` ([run-trace.tsx](../../../packages/ui/src/run-trace.tsx)), which this replaces the
  `<details>` wrapper around rather than duplicating.

---

## 6. Rendering the four registers

Non-negotiable 1 and shared-core rule 1.2 must be visible, not merely true.

| Register | Rendering |
| --- | --- |
| **Record** | Inline citation chip, opens the source panel. Current behaviour ([cited-prose.tsx](../../../packages/ui/src/cited-prose.tsx)). Where the source yields no reliable locator, the chip carries the **verbatim passage** so the reader can search for it — never a bare version reference |
| **Inference** | Visibly marked as inference, with the record it rests on cited |
| **Authority** | Citation chip carrying the instrument and its in-force version |
| **External** | **Visually distinct from all three.** URL, publisher, date, retrieval timestamp, badged untrusted-external |
| Uncited (chat mode) | Existing open-world badge ([ask.tsx:220-226](../../../apps/web/src/screens/ask.tsx#L220-L226)) |

**The external register must not be mistakable for the others at a glance.**
Different chip shape and colour, not a different tooltip. A user skim-reading an
answer has to be able to tell a web source from a project document without
hovering — this is the visible half of the ADR-0022 carve-out, and the half a
client will judge.

Superseded sources, where deliberately included, carry a flag **at the point of
use** in the prose, not only in the manifest (non-negotiable 10).

---

## 7. Not in scope here

- **Streaming.** Additive and orthogonal; the rail and footer are designed to
  accommodate it without rework.
- **The Copilot surface.** ADR-0031 makes it read-only with a bound project and
  no clarification round ([05](05-clarifying-questions.md) §7). It renders the answer and citations only.
- **A plan-editing UI beyond step inputs.** Reordering and branching in the UI
  is deferred; the artefact supports it, the surface starts with edit-and-rerun.
