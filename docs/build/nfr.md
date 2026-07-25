# Non-functional requirements — the pilot envelope

> **Status: 🟡 strawman drafted 2026-07-25** — scale ruled by the owner (single friendly firm); the numbers below are proposed, not agreed. To be grilled before, and carried into, the infra/security session. Every figure here is a *target for the first external pilot*, not the product's ceiling; the revisit triggers at the end say when this document must be re-cut.

The design artefacts define what Infora does; this one-pager states the operational envelope the pilot deployment must meet. It exists so the infra/security session decides against named numbers rather than instincts, and so a pilot agreement can point at something.

## Scale assumptions (owner-ruled 2026-07-25)

| Dimension | Pilot target |
|---|---|
| Organisations | 1 friendly firm + Infora as operator (the wall is still enforced as if multi-org — it is the product) |
| Users | ≤ 25 |
| Projects | 1–2 |
| Documents (sandbox + library) | low hundreds; ≤ 1,000 |
| Blob volume (natives + renditions) | ≤ 5 GB |
| Concurrent active users | ≤ 10 |
| Model-invoking runs | ≤ 200/day |

## Availability & recovery

- **Availability:** 99.5% measured over business hours (UK), best-effort otherwise. No formal SLA at pilot; incidents acknowledged within one business day.
- **RPO ≤ 1 hour** — the pilot carries a real firm's documents from day one, so point-in-time recovery (WAL archiving / managed PITR), not nightly dumps. The append-only record tables and immutable Versions are only as durable as this line.
- **RTO ≤ 8 business hours** — restore-from-backup rehearsed once before the pilot starts, not discovered during it.
- **Backups** encrypted at rest, same residency as the primary (see security floor).

## Latency

- Interactive reads (library, plan, sandbox, review surfaces): **p95 < 500 ms** server-side.
- Auth + session resolution: p95 < 150 ms.
- Model-invoking runs: seconds-to-minutes is accepted; the surface must show progress and never block navigation. (Streaming is a parked design item — the T-097 cancel residual on the tracker.)
- Ingestion (chunk + embed on library admission): minutes, asynchronous; never blocks the accepting action.

## Security floor (pointers, not restatements)

- The ethical wall per ADR-0018, with the **DB-level backstop (Postgres RLS) committed for the infra/security session's build slice** (owner-ruled 2026-07-25 — see the grill tracker's pre-infra-session rulings).
- CSRF posture per ADR-0043 (Lax + content-type gate; token upgrade named for the infra session).
- Deployment tier per ADR-0037 (`standard` carrying OFFICIAL for the pilot; `sovereign` stays a configuration, not a pilot requirement).
- Certification targets (owner-ruled 2026-07-25): **ISO 27001, Cyber Essentials Plus, SOC 2 Type II** — none is a pilot *precondition*; they are named so the infra session's provider/hosting choices don't foreclose them (provider certifications inheritable, UK residency available, audit-log export).
- Data residency: UK for the pilot's data at rest; model-egress attributes per ADR-0037 as configured.

## Operability

- Structured request logs with request IDs (T-219), retained ≥ 30 days.
- `/health` wired into an uptime check before the first external login.
- Error tracking (provider chosen at the infra session) before the pilot; console-only until then is accepted for dev.

## Revisit triggers — this envelope is re-cut when any of these fires

1. A second organisation joins any project (the wall goes live between real firms → re-grill scale, RLS becomes blocking if not yet landed).
2. Any paid contract (availability/SLA and certification lines move from targets to commitments).
3. \> 50 users or > 5,000 documents (performance work stops being deferrable).
4. Any client naming a residency or classification requirement above OFFICIAL (ADR-0037 sovereign path activates).
