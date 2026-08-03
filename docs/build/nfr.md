# Non-functional requirements — the pilot envelope

> **Status: ✅ agreed. Re-cut for V1 on 2026-08-01** as the first act of the infra/security decision session, closing **Q-027**. The 2026-07-25 draft was a strawman written against a one-organisation pilot; [v1.md](v1.md) moved the pilot to **three organisations**, which fired revisit trigger 1 by construction and made RLS blocking. The availability, recovery and latency figures below are no longer proposals — they are the numbers the infra decisions are made against, and the numbers a pilot agreement may point at.

The design artefacts define what Infora does; this one-pager states the operational envelope the pilot deployment must meet. Every figure here is a *target for the first external pilot*, not the product's ceiling; the revisit triggers at the end say when this document must be re-cut.

## Scale assumptions (owner-ruled 2026-07-25, re-cut for V1 2026-08-01)

| Dimension | Pilot target |
|---|---|
| Organisations | **3 on the pilot project** — one real firm, plus an owner organisation and a third consultant that are operator-held or fictional ([v1.md](v1.md)) |
| Users | ≤ 25 |
| Projects | 1–2 |
| Documents (sandbox + library) | the **100–500 document corpus** plus sandbox work; ≤ 1,000 total |
| Blob volume (natives + renditions) | ≤ 5 GB |
| Concurrent active users | ≤ 10 |
| Model-invoking runs | ≤ 200/day |

**Why three organisations does not move the other numbers.** Two of the three are operator-held, so users, projects and runs are unchanged — what changes is the *enforcement* obligation, not the load. The wall becomes a screen the buyer looks at rather than a property they take on trust, which is why the security floor below hardens rather than the capacity lines.

## Availability & recovery

- **Availability: 99.5%** measured over UK business hours (08:00–18:00 Mon–Fri), best-effort otherwise. **No SLA at pilot** — this is a target Infora holds itself to, not a contractual commitment; incidents acknowledged within one business day. It becomes a commitment the moment revisit trigger 2 fires.
- **RPO ≤ 1 hour.** The pilot carries a real firm's documents from day one, so recovery is **point-in-time (managed PITR / WAL archiving), not nightly dumps**. The append-only record tables and immutable Versions are only as durable as this line. The chosen substrate must deliver PITR as a managed capability rather than an operational practice — a nightly `pg_dump` does not meet this line and is not an acceptable interim.
- **RTO ≤ 8 business hours**, for both the database and the object store. **Restore is rehearsed once before the pilot starts**, against a real restore into a scratch environment, and the rehearsal is written up. An untested backup is not a backup.
- **Backups encrypted at rest, in the same residency as the primary** (see the security floor), with a retention window at least as long as the PITR window.

## Latency

Measured server-side at the API, under the pilot's ≤ 10 concurrent users, **with row-level security active** — RLS is in the pilot's steady state, so a number measured with it off is not the number.

- Interactive reads (library, plan, sandbox, review surfaces): **p95 < 500 ms**.
- Auth + session resolution: **p95 < 150 ms**.
- Model-invoking runs: **seconds-to-minutes is accepted**; the surface must show progress and never block navigation. (Streaming is a parked design item — the T-097 cancel residual on the tracker.)
- Ingestion (chunk + embed): **minutes, asynchronous; never blocks the accepting action**. The V1 bulk-load path is measured separately — a 500-document load is a one-off operator action, not an interactive one, and is allowed to take hours.

## Security floor (pointers, not restatements)

- The ethical wall per ADR-0018, with the **DB-level backstop (Postgres RLS) now blocking, not a nicety** — three organisations on one project is the wall live in front of a buyer. `version_chunks`, the grounding index, landed (T-247); **`containers` remains (T-297) and is in V1's Phase A floor**. Both must carry `FORCE ROW LEVEL SECURITY`, or a table owner bypasses the backstop in exactly the environment where it matters (ADR-0047 §4).
- CSRF posture per ADR-0043/0044 (Lax + content-type gate; the token upgrade is an infra-session item).
- Deployment tier per ADR-0037 — **`pilot`, carrying OFFICIAL**, added by ADR-0047 §12 because no provider offers a UK-region route to the product's model. `standard` and `sovereign` remain configurations, not pilot requirements. The `pilot` tier is valid **only** under a zero-data-retention agreement with Anthropic, and **expires at revisit trigger 2 below**.
- Certification targets (owner-ruled 2026-07-25): **ISO 27001, Cyber Essentials Plus, SOC 2 Type II**. None is a pilot *precondition*; they are named so provider and hosting choices do not foreclose them — provider certifications inheritable, UK residency available, audit-log export possible. Pacing ruled 2026-08-01: **Cyber Essentials now, Plus before go-live**; ISO 27001 and SOC 2 clocks start post-pilot.
- **Data residency is three-part, and is stated that way deliberately** (ADR-0047 §15). Customer documents, database and backups: **UK** (`eu-west-2`), at rest and in transit. Model inference: **US**, under zero retention and no training. Error-tracking telemetry: **EU**, carrying no document content, prompt or completion bodies. A pilot agreement must disclose the inference position rather than let a buyer infer UK-only from "UK data residency".
- **Personal data and sub-processors** are registered in [personal-data.md](personal-data.md) — what is held about a named person, why, and where it is deleted, plus the sub-processor list. **Operator access and deletion were ruled 2026-08-03 → [ADR-0050](../adr/0050-the-privacy-programme-operator-access-and-deletion.md)**, closing `Q-032` and `Q-033`: **no human holds a standing credential** to customer data (a non-human pipeline role for migrations, a time-bounded reason-stated break-glass role for people, CloudTrail as the out-of-band record), break-glass **disclosed on request** in the DPA, **no support impersonation in V1**, and deletion as **two acts** bounded by whose material it is. What remains open is the **controller/processor model (`Q-035`)**, which still blocks the DPA.
- **Production identity is deferred, with an edge** (owner-ruled 2026-08-01, ADR-0047 §14). Password authentication carries V1 — scrypt hashing, login rate limiting (T-217), revocable server-side sessions — and the seeded shared dev password must not exist in the pilot environment. **Entra lands before revisit trigger 2**, not vaguely "after the pilot".

## Operability

- Structured request logs with request IDs (T-219), retained ≥ 30 days.
- `/health` wired into an uptime check **before the first external login**.
- Error tracking before the pilot — **Sentry, EU region, PII scrubbing on** (ADR-0047 §15); console-only is accepted for dev, not for the pilot.
- **Backup restore rehearsed once into a scratch environment before the pilot starts, and written up** (ADR-0047 §8). An untested backup is not a backup.
- Every model call carries its egress facts into the Step audit (ADR-0037 §6) — the evidence a security review requires rather than accepts on trust.

## Revisit triggers — this envelope is re-cut when any of these fires

1. **A second *real* organisation joins any project.** *(The original trigger — "a second organisation joins" — fired on 2026-08-01 with V1's three-organisation ruling, and is discharged: RLS moved to blocking and the security floor hardened above. It is restated here against **real** firms, because the pilot's other two organisations are operator-held and the wall between two genuinely independent firms stays commercially unproven until this fires.)*
2. Any paid contract — availability and certification lines move from targets to commitments.
3. \> 50 users or > 5,000 documents — performance work stops being deferrable, and the V1 ingest rewrite stops being sufficient.
4. Any client naming a residency or classification requirement above OFFICIAL — ADR-0037's sovereign path activates.
