# Foundation (component 1)

The foundation is the shared base every other component stands on: the model layer, the store substrate, the file store, and the typed contracts. It has no domain logic of its own — it is depended on by everything and depends on nothing — but it is named as a component so its pieces have a home and are not improvised at the keyboard.

**No longer a stub.** The infra/security decision session ran on **2026-08-01** and closed the questions this component carried: cloud provider, file/blob storage, hosting, deployment, key management, tenant isolation, residency and production identity are settled in **[ADR-0047](../adr/0047-pilot-deployment-substrate.md)**, decided against the pilot envelope in [operating-envelope.md](../operating-envelope.md). The store substrate was already fixed by ADR-0024 and is unchanged.

Four pieces:

- **Model layer.** A model-agnostic router plus provider adapters, so a model is selected per task and the platform is never tied to one vendor — the model is rented and swappable. The router is also the security enforcement point: every chat and embedding call passes through it, it dispatches only to a route conforming to the deployment's tier, and it fails closed (ADR-0037, extended by ADR-0047 §12). Domain-tuned embeddings, if ever pursued, only on de-identified or non-client data (ADR-0024, ADR-0026).
- **Store substrate.** Postgres with the pgvector extension, vectors co-located beside the relational access and metadata so the access pre-filter is real, not a leaky post-filter (ADR-0024). In the pilot deployment this is **RDS PostgreSQL 17 with managed point-in-time recovery**, connected to by an unprivileged application role so row-level security is not bypassed (ADR-0047 §4).
- **File store.** **S3**, private and customer-managed-key encrypted, sitting behind the `file_ref` pointer that ADR-0043 anticipated. Bytes are always streamed through the API, never handed out as a presigned URL — a bearer capability that outlived its entitlement check would break ADR-0024's revoke-in-the-same-transaction guarantee (ADR-0047 §3).
- **Typed contracts.** The shared types and API schema that are the single source of truth between every surface and the API; surfaces depend only on `contracts` (and `ui`).

## Task-class routing and the fallback chain

*Folded from the board's Wave 5 design reference 2026-08-28, when T-284 and
T-285 landed. The block is the design; this section is what was built against
it, and the code is the authority for anything the two disagree on.*

**Route on task class, not on perceived difficulty; the routing table is
configuration, not code.** Two axes in a fixed, non-negotiable order: `tier
policy filter (hard, fails closed) → task-class selection → dispatch`. The
first axis is ADR-0037's and is enforced before any task-based optimisation;
the second is `Router.chat(task, request)`'s task argument, which was accepted
and ignored until T-284. The order is kept by construction rather than by
convention — the filter (`conformingRoutes`) and the ranking (`routesForTask`)
are separate functions in separate files, and the ranking is given no policy,
no classification and no attributes with which to re-open the filter.

| Task class | Tier | Rationale |
| --- | --- | --- |
| `orchestrate` — classification, intent, workflow selection | frontier | judgment-heavy, user-visible, decides everything downstream — not the place to economise |
| `clarify` — question generation and recommendation | frontier | the recommendation is doing the teaching; a weak one damages trust more than a slow one |
| `plan` — step selection in model-chosen mode | frontier | same reasoning |
| `triage` — retrieval relevance filtering | small, fine-tuned where available | highest volume by far. **This is where gross margin lives** |
| `extract` — schema extraction | mid, structured output | high volume, low judgment, verifiable against the schema |
| `synthesise` / `synthesise_long` | frontier (large context for long) | user-visible prose under a Lens |
| `draft` — grounded document drafting | frontier | the existing chain's one thinking leaf |
| `verify` — claim verification | frontier, **different family from the producer** | independence; same-family verification is largely self-agreement |

**Three layers, so the judgement lives in one place each.** A caller names an
*activity*; `TASK_TIERS` (the table above, as code) says what class of model
that activity wants; a *deployment* declares which tiers each route serves.
The tier vocabulary is `WorkerModelTier` from `contracts` — the same three
values the worker register already assigns — because two names for one thing
eventually acquire two answers.

**The configuration is `MODEL_CHAT_ROUTES`**, documented in `.env.example`:
an ordered list of routes, each with its own credential, its own endpoint and
its own four egress attributes — never inherited from the deployment defaults,
since inheritance is how a second procurement quietly adopts the first one's
compliance claims. Unset means one route, which is what every deployment has
had; the two bounds `MODEL_FALLBACK_ATTEMPTS` and `MODEL_ATTEMPT_TIMEOUT_MS`
are the design's `defaults {fallback_attempts, timeout_ms}`. Immutable for the
process lifetime, being read at boot. **Fine-tuned models are pluggable but
optional: the system runs entirely on frontier models with a config change**,
so the absence of a fine-tune is never a blocker — with the corollary that
every eval case runs against the *configured* table and records which, because
a pass on a fine-tuned triage model is not evidence about the frontier-only
configuration.

**The fallback chain is the ranked conforming set, and that is the guarantee.**
A fallback is by construction another route that already conforms to the
deployment tier: **availability is never traded for conformance.** A route is
moved past only when it was *unavailable* — a provider outage, a rate limit, a
timeout; a route that *answered*, including a model that refused, ends the
call, because retrying a refusal on the next model is shopping for one that
complies. An exhausted chain fails the step with a stated reason naming every
endpoint and why, and the run continues around it. **Every attempt, including
the failures, reaches the audit trail with its own egress facts** — a route
that was tried egressed, and a record naming only the endpoint that eventually
answered has omitted an egress event; failed attempts are written as child Step
rows under the step that made the call.

*Not built here, and named so it is not mistaken for an omission:* the
verify-independence constraint (`different family from the producer`) is
**T-286 and → beyond V1**, riding the verifier that [v1.md](../../build/v1.md)
stubs. `verify` appears in the table with its tier and without that constraint,
which is correct — the constraint is a dispatch-time rule about a particular
run's producing family, not a property of the class.

## Sub-component register

**Governing ADRs.** 0024 (store substrate), 0037 (security tiers at the router), 0047 (the pilot deployment substrate: provider, hosting, file store, keys, network, deployment, tenant isolation, residency, identity).

1. **Model layer** — model-agnostic router + provider adapters; tier-conformant, fail-closed dispatch (ADR-0037); task-class routing and the fallback chain, above (T-284/T-285); embeddings pinned/versioned per index (ADR-0024). Package: `model`.
2. **Store substrate** — Postgres + pgvector, co-located with relational access data (ADR-0024); RDS in the pilot deployment. Package: `db`.
3. **File store** — S3 behind `file_ref`, API-mediated reads (ADR-0047 §3). Package: `db` (the pointer) with the storage adapter alongside it.
4. **Typed contracts** — shared types + API schema, the single source of truth. Package: `contracts`.

## The deployment

One AWS account in **London (`eu-west-2`)**: the SPA on S3 behind CloudFront, the API on ECS Fargate behind an ALB, RDS and the tasks in private subnets, secrets in Secrets Manager, and deployment via OIDC-federated GitHub Actions with migrations run as a separate task. Tenant isolation is **logical** — one database, three organisations, the wall enforced by the application (ADR-0018) and by RLS. Physical isolation, where a client demands it, is an ADR-0037 deployment boundary rather than per-tenant infrastructure. Infrastructure is Terraform in `infra/`, outside the pnpm workspace. Full rationale and the rejected alternatives are in ADR-0047.

## Repository mapping

`model`, `db` and `contracts` — depended on by every other package, depending on none. See the build layer's [repo-structure.md](../../build/repo-structure.md) and [data-model.md](../../build/data-model.md).
