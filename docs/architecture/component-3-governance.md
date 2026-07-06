# Governance (component 3)

The governance envelope is the cross-cutting concern that makes autonomy trustworthy. It is not one layer in the stack but the dashed envelope around all of them: grounding (tie every claim to a source, withhold unsupported output), citations, **rails** (register, negative constraints, confidence calibration), and the audit trail of every agent, user and system action — plus the security and compliance posture. Where the compliance-checking capability (run by the Engine, component 6) checks a specific body of external law, governance is the general guarantee that any output can be shown to have been produced and grounded properly.

The audit trail is **regulator-defensible**: it lets you show exactly how any output was produced and grounded, which matters at examination and judicial review. The security posture targets SOC 2, Cyber Essentials, G-Cloud and GDPR, and zero training on customer data.

**Rails carry an authority model that mirrors the access model (ADR-0015).** The project **owner** sets the project's rails — the ceiling every agent and member works within — and members inherit them. A member may **tighten** rails on its own private work but can never loosen the owner's or step outside them, exactly as a Participant grant narrows within Membership and never pierces an ethical wall. Every rail set or change is **audited** — configurable, but never silent. This is also the SaaS liability line: Infora ships rails so output can meet regulation; a firm that erodes its own rails owns that exposure, because it is the firm's name on the submission, not Infora's. Infora-built and org-built agents alike (the Engine, component 6) run inside this envelope, which is what makes the deployment model safe.

The component is **partly grilled**. Settled: the **rails authority model → ADR-0030** (owner-set ceiling, member tighten-only, the effective rail is the most-restrictive intersection, rails expressed at scopes, every change audited, org-built agents inherit at deploy time); and the **agent-execution audit trail → ADR-0028** (append-only, immutable). Open (tuning, not authority): how grounding thresholds are tuned and what happens to withheld output; audit retention and export format; deploy-time validation of a tightening; and data residency and sovereignty routing for public-sector buyers. Open questions are tracked in the grill doc.

---

## Sub-component register

The structural breakdown of the governance component into its build-able parts. Five artefacts divide the labour and this register is one of them: `CONTEXT.md` is the **language** (the glossary); the [overview](infora-overview.md) is the **vision** and whole-system map; this component doc is the **structure** (the prose above and the register here); `docs/adr/` holds the **decisions** (why each fork went the way it did); and the [grill tracker](../grill-sessions/grill-questions.md) is the **process log and open-questions backlog**. The register references the others rather than restating them.

The cut is by **domain capability**: grounding, rails, audit, and the security/compliance posture. Each wraps every other component rather than sitting beside them.

**Cross-cutting, true of every capability below.** This envelope wraps every layer; no component opts out of it. The audit trail records every agent, user and system action. The rails authority model mirrors the access-model ceiling (ADR-0015), so governance and access share one invariant: a subordinate scope narrows within a superior one and never pierces it.

---

## 1. Grounding and citations

**Responsibility.** Tie every generated claim to a source and withhold unsupported output; render citations; tune grounding thresholds and decide what happens to withheld output.
**Governing ADRs.** 0021 (the privacy invariant on what may ground). Threshold tuning **open**.
**Terms owned.** Grounding, Citation.
**Depends on.** Context (component 4) for the grounded channel and access-resolved corpora.

## 2. Rails

**Responsibility.** Apply governance rules at generation time (register, negative constraints, confidence calibration); enforce the owner-set, member-inheritable, tighten-only authority model; audit every rail change; carry the deploy-time inheritance for org-built agents.
**Governing ADRs.** **0030** (authority model — owner-set ceiling, member tighten-only, most-restrictive intersection, rails scoped, deploy-time inheritance for org-built agents; mirrors ADR-0015). Finer expression (per-capability rails, richer constraint types) evolvable within that model; grounding-threshold tuning **open**.
**Terms owned.** Rail.
**Depends on.** Access model (component 2) for the mirrored ceiling; the guiding channel (component 4), since a guardrail can be expressed as a negative constraint; the deployment model (the Engine, component 6).

## 3. Audit trail

**Responsibility.** Record every agent, user and system action on a run or project as a regulator-defensible trail; hold retention and export; make audit-of-every-action a foundational invariant rather than a later feature.
**Governing ADRs.** **0028** discharges audit-of-every-action for the **agent-execution** sense (append-only, immutable Run/Step). The user-UI-action and system-action senses remain a candidate ADR. Retention/export format **open**.
**Terms owned.** Audit trail.
**Depends on.** Every component writes to it; the `db` package for storage.

## 4. Security and compliance posture

**Responsibility.** Hold the platform's security posture and certifications target (SOC 2, Cyber Essentials, G-Cloud, GDPR, zero training on customer data); own data residency and sovereignty routing for public-sector buyers.
**Governing ADRs.** 0026 (zero-training posture — under revision; see the grill doc). Residency routing **open** (links to the model layer). The wider infra/security model (cloud, storage, encryption) is open — see [component-1-foundation.md](component-1-foundation.md) and the infra/security session.
**Terms owned.** None uniquely.
**Depends on.** The model layer (component 1, Foundation) for residency routing; the egress boundary (component 4, ADR-0026).

---

## Deferred or handed to other components

- **Compliance-against-legislation.** A narrower capability run by the Engine (component 6), not the general envelope.
- **Access resolution.** Owned by the access model (component 2); governance mirrors its ceiling but does not resolve access.
- **The guiding channel's storage.** Owned by Context (component 4); governance reads it as the rail source.
- **Open questions** — rails expression, grounding thresholds, audit retention/export, deploy-time validation, residency routing — are tracked in the grill doc.

## Repository mapping

The audit log, grounding/NLI checks, rails and access policy live in the `governance` package, depended on by every other package and never depending back, enforced at the API boundary so every surface inherits it. See the overview's app-architecture diagram (the dashed envelope).
