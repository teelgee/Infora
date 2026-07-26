# Grill — the document ontology: classification + first-class relationships

A design grill, not a build session. The question: introduce **ontology** as a
first-class concept in the DMS, so the library and sandboxes carry a legible model
of *how documents relate* — not just a flat list of coded containers. One branch at
a time; each resolved fork gets an ADR (Claude drafts, owner intervenes). Offer an
ADR only where the decision is hard to reverse and a real trade-off.

## The finding (why this is worth grilling)

Infora already has a **latent ontology** and doesn't use it:

- [CONTEXT.md:185](../../CONTEXT.md#L185) names "relationships to other documents" as
  *authoring metadata* — but the schema stores it as a shapeless `metadata` jsonb on
  the Container ([data-model.md:48](../build/data-model.md#L48)), with the per-project
  schema deferred since ADR-0008.
- The domain is already relational (Deliverable plan → Container → Version → Rendition,
  the review cycle, supersede/withdraw edges, disciplines, work packages) — the nouns
  and edges live in the ADRs. What's missing is (a) a **controlled classification
  vocabulary** documents classify *against*, and (b) **typed edges** between documents
  instead of a jsonb bag.

The prize (grounds the [moat principle](../../CLAUDE.md)): an agent that runs
*deterministic structural checks* RAG can't — collision detection across sandboxes,
coverage/lost-work gaps against the MIDP, supersede-impact analysis, auto-surfaced
precedents — and a retrieval path that **pre-filters 100k docs structurally before a
single embedding is compared** (extends the ADR-0022/0024 SQL-prefilter-in-one-query
pattern with semantic filters).

## What Claude owns (stated, not grilled — defended in the ADR)

Infra mechanics, not product forks:

- **No second store.** Classification vocab + typed relationship edges live in the
  colocated Postgres (ADR-0024), *not* a graph DB — keeps the access+state pre-filter
  in one query (ADR-0022). Relational edge tables, not Neo4j.
- **Append-only typed edges**, directional (`supersedes`, `references`, `responds-to`,
  `is-part-of`, `derived-from`), currency-by-state like everything else (ADR-0013).
- **Derive, don't duplicate** — the graph is projected from the record, never
  hand-maintained (the Documents-view discipline, [data-model.md:48](../build/data-model.md#L48)).
- Classification vocab **seeded by copy** at project creation, like the acceptance-code
  scheme (ADR-0003) — one project's edits never rewrite another's.

## The forks to grill (product / strategic — plain language)

**Fork 1 — the backbone. ✅ RULED (owner, 2026-07-26): Uniclass 2015 / ISO 19650
breakdown as the seeded default vocabulary.** Not Infora-native — the credibility of a
recognised standard is the point of putting classification on the record; it ends the
"says who?" argument behind every structural claim the agent makes, and coheres with
ADR-0041's 19650 versioning. (Original fork: adopt standard vs Infora-native vs defer.)

**Fork 2 — who owns it per project.** Owner-curated (like the naming scheme), vs
Infora-provided default only, vs per-org. *Recommendation: owner-owned, seeded from the
default, extendable the way the naming scheme is (producer proposes, owner folds in).*
This closes the deferred ADR-0008 metadata-schema question. Stress test: per-org vocab
would let each consultant classify in its own language behind the wall — but then the
owner's MIDP can't compare like with like across producers; does cross-producer
legibility have to win?

**Fork 3 — build-1 surface.** Ship the ontology as an **internal, agent-facing**
structure first (it silently powers the Fork-2 checks and retrieval pre-filter), vs a
user-facing classification/relationship UI now. *Recommendation: agent-facing first,
UI later.* Stress test: if users never see or correct the classification, do they trust
the agent's collision/coverage claims enough to act on them — or does the structure need
a visible surface to be believed?

**Rider on Fork 3 — who writes the edges.** Agent proposes edges on promotion, human
confirms, vs manual-only, vs agent auto-writes. *Recommendation: agent-proposes /
human-confirms* (KROMA-style matching reconciles cross-org naming behind the wall).
Same trust question as Fork 3 — fold together.

## ADR candidate

**"Document relationships and a project classification ontology, colocated and
derived."** Refines ADR-0008 (gives the deferred metadata schema a shape), sits
alongside ADR-0011/0021 (grounding) and ADR-0022/0024 (retrieval). Only write it once
Forks 1–3 land.

## Read first

- [component-5-document-management.md](../architecture/component-5-document-management.md)
  (§8 project library, §2 container/metadata), [data-model.md](../build/data-model.md)
  Drawer 2, [CONTEXT.md](../../CONTEXT.md) (Identity/Authoring metadata, ~L181–185).
- ADR-0008 (deferred metadata schema), ADR-0011/0021 (grounding corpus + channels),
  ADR-0022/0024 (retrieval pre-filter, colocated pgvector), ADR-0041 (ISO 19650).
- Research: hiflylabs "AI Ontologies in Practice" (ontology vs RAG, T-Box/A-Box,
  KROMA matching); Generis CARA (regulated DMS — version tree + compliance metadata, no
  exposed ontology).
