# Foundation (component 1)

The foundation is the shared base every other component stands on: the model layer, the store substrate, the file store, and the typed contracts. It has no domain logic of its own — it is depended on by everything and depends on nothing — but it is named as a component so its pieces have a home and are not improvised at the keyboard.

**No longer a stub.** The infra/security decision session ran on **2026-08-01** and closed the questions this component carried: cloud provider, file/blob storage, hosting, deployment, key management, tenant isolation, residency and production identity are settled in **[ADR-0047](../adr/0047-pilot-deployment-substrate.md)**, decided against the pilot envelope in [operating-envelope.md](../operating-envelope.md). The store substrate was already fixed by ADR-0024 and is unchanged.

Four pieces:

- **Model layer.** A model-agnostic router plus provider adapters, so a model is selected per task and the platform is never tied to one vendor — the model is rented and swappable. The router is also the security enforcement point: every chat and embedding call passes through it, it dispatches only to a route conforming to the deployment's tier, and it fails closed (ADR-0037, extended by ADR-0047 §12). Domain-tuned embeddings, if ever pursued, only on de-identified or non-client data (ADR-0024, ADR-0026).
- **Store substrate.** Postgres with the pgvector extension, vectors co-located beside the relational access and metadata so the access pre-filter is real, not a leaky post-filter (ADR-0024). In the pilot deployment this is **RDS PostgreSQL 17 with managed point-in-time recovery**, connected to by an unprivileged application role so row-level security is not bypassed (ADR-0047 §4).
- **File store.** **S3**, private and customer-managed-key encrypted, sitting behind the `file_ref` pointer that ADR-0043 anticipated. Bytes are always streamed through the API, never handed out as a presigned URL — a bearer capability that outlived its entitlement check would break ADR-0024's revoke-in-the-same-transaction guarantee (ADR-0047 §3).
- **Typed contracts.** The shared types and API schema that are the single source of truth between every surface and the API; surfaces depend only on `contracts` (and `ui`).

## Sub-component register

**Governing ADRs.** 0024 (store substrate), 0037 (security tiers at the router), 0047 (the pilot deployment substrate: provider, hosting, file store, keys, network, deployment, tenant isolation, residency, identity).

1. **Model layer** — model-agnostic router + provider adapters; tier-conformant, fail-closed dispatch (ADR-0037); embeddings pinned/versioned per index (ADR-0024). Package: `model`.
2. **Store substrate** — Postgres + pgvector, co-located with relational access data (ADR-0024); RDS in the pilot deployment. Package: `db`.
3. **File store** — S3 behind `file_ref`, API-mediated reads (ADR-0047 §3). Package: `db` (the pointer) with the storage adapter alongside it.
4. **Typed contracts** — shared types + API schema, the single source of truth. Package: `contracts`.

## The deployment

One AWS account in **London (`eu-west-2`)**: the SPA on S3 behind CloudFront, the API on ECS Fargate behind an ALB, RDS and the tasks in private subnets, secrets in Secrets Manager, and deployment via OIDC-federated GitHub Actions with migrations run as a separate task. Tenant isolation is **logical** — one database, three organisations, the wall enforced by the application (ADR-0018) and by RLS. Physical isolation, where a client demands it, is an ADR-0037 deployment boundary rather than per-tenant infrastructure. Infrastructure is Terraform in `infra/`, outside the pnpm workspace. Full rationale and the rejected alternatives are in ADR-0047.

## Repository mapping

`model`, `db` and `contracts` — depended on by every other package, depending on none. See the build layer's [repo-structure.md](../../build/repo-structure.md) and [data-model.md](../../build/data-model.md).
