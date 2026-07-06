# Foundation (component 1)

The foundation is the shared base every other component stands on: the model layer, the store substrate, and the typed contracts. It has no domain logic of its own — it is depended on by everything and depends on nothing — but it is named as a component so its pieces have a home and are not improvised at the keyboard.

**This component is a provisional stub.** Some of it is decided (the store substrate is fixed by ADR-0024), but the wider infrastructure — cloud provider, file/blob storage, hosting, deployment, and the security model in depth — is **not yet defined** and needs a dedicated infra/security session. Treat the detail below as a placeholder to be firmed there and in the build layer (`docs/build/`).

Three pieces:

- **Model layer.** A model-agnostic router plus provider adapters, so a model is selected per task and the platform is never tied to one vendor — the model is rented and swappable. Domain-tuned embeddings, if ever pursued, only on de-identified or non-client data (ADR-0024, ADR-0026).
- **Store substrate.** Postgres with the pgvector extension, vectors co-located beside the relational access and metadata so the access pre-filter is real, not a leaky post-filter (ADR-0024). The long-term substrate, not a skeleton placeholder. Object/blob storage for the actual files (native + PDF renditions) is **not yet decided** — see the infra/security session.
- **Typed contracts.** The shared types and API schema that are the single source of truth between every surface and the API; surfaces depend only on `contracts` (and `ui`).

## Sub-component register (provisional)

**Governing ADRs.** 0024 (store substrate). Cloud, hosting, file storage, deployment and the in-depth security model are **open** — see the build layer and the infra/security session.

1. **Model layer** — model-agnostic router + provider adapters; embeddings pinned/versioned per index (ADR-0024). Package: `model`.
2. **Store substrate** — Postgres + pgvector, co-located with relational access data (ADR-0024); blob/object storage for files open. Package: `db`.
3. **Typed contracts** — shared types + API schema, the single source of truth. Package: `contracts`.

## Repository mapping

`model`, `db` and `contracts` — depended on by every other package, depending on none. See the build layer's [repo-structure.md](../build/repo-structure.md) and [data-model.md](../build/data-model.md) (the latter to be drawn before the first migration).
