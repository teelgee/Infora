# The ontology landscape — how the wider world builds and uses a semantic layer, and what it costs to keep one alive

*External reference, researched 2026-09-04 for the ontology exploration
(the session record is in
[grill-history.md](../grill-sessions/grill-history.md)). **Context, not
authority**: nothing here is a decision, and nothing here may be cited by
an ADR — an ADR states its own reasoning. The two links the owner found
useful open the reading list and are kept verbatim. Every substantive
claim carries its source; where a source is a vendor describing its own
product, the text says so.*

**The question it serves.** Infora carries a *project ontology* (ADR-0045):
a classification vocabulary deliverables file under, and typed links
between deliverables. Today it is mostly stored and displayed, and one
link type has a live consequence. This document is the background reading
for asking where such a layer earns more, by looking at what the layer
*knows*, what *consumes* it, and what *breaks when it goes stale* in the
products that have made an ontology their spine.

---

## The two-minute read

An **ontology**, in every product studied, is a curated description of the
things a business deals with, the words for them, how they relate, and
increasingly what may be *done* to them. It sits between raw data and
whoever asks a question, human or AI. Six things stood out.

1. **The layer earns its keep only through what consumes it.** Databricks
   Genie reads it to answer plain-English questions over tables; Palantir's
   apps and agents run on nothing else; dbt's semantic layer compiles it
   into the one correct query. In each case the ontology was built *for* a
   consumer, and the consumer is what forced it to stay current. A
   vocabulary nobody reads is documentation.
2. **The strongest version makes the ontology the only door to the data.**
   Palantir's agents "do not access underlying database tables directly";
   they read objects and change them through governed *actions* that carry
   validation and audit, the same actions a human operator uses. Bounding
   the agent is a property of the layer, not of the prompt.
3. **A semantic layer changes the failure mode, and that is its real
   value.** dbt's 2026 benchmark: raw text-to-SQL scored 84 to 90 percent,
   the semantic layer 98 to 100. The line that matters: "With text-to-SQL,
   failure looks like a plausible but incorrect answer. With the Semantic
   Layer, failure looks like an error message." The layer lets the system
   *refuse* rather than guess.
4. **"Model the head, infer the tail."** Databricks' operating advice is to
   hand-curate the definitions that matter most (certified metrics, named
   owners, a glossary) and let the system infer the rest from existing
   queries and dashboards. Certification is a ranking signal: the agent is
   steered towards assets "your organization vouches for".
5. **Staleness is the named enemy, and every product answers it with
   owners and review cadence, not with technology.** Databricks: "Watch for
   drift across your assets"; Palantir: schema change should be "as
   controlled as access to a production database migration", with a named
   owner per object type; dbt: definitions in version control that the
   business approves. The reported failures are all definitional: two
   departments disagreeing about "active customer", an agent guessing a
   join because no relationship was declared.
6. **Knowledge graphs and relational semantic layers answer different
   questions, and most enterprises end up with both.** A semantic layer
   answers "what does this number mean, exactly"; a graph answers "how are
   these things connected". Infora's relational, colocated choice
   (ADR-0045) is the semantic-layer shape, with the edges table carrying
   the graph questions that matter here.

For Infora the pattern that repeats is: the ontology paid off when a
specific consumer, usually an AI answering questions or filling a
schema, was wired to it and its owner was named. Both are open here.

---

## 1. Databricks — Genie and the Unity Catalog semantic layer

*The owner's first link:
[Operationalizing Genie Ontology in Your Data Stack](https://www.databricks.com/blog/operationalizing-genie-ontology-your-data-stack)
(Databricks blog, 2026). Vendor material describing its own product.*

**What it knows.** Two layers. A *human-modelled* layer in Unity Catalog:
metric views (a measure defined once, groupable by any dimension, with
"synonyms, display names, and formatting rules to improve agent
accuracy"), *pages* that "define business concepts for people and Genie
One to reference as an authoritative source", domains that group assets
by business purpose, primary and foreign keys, and certification or
deprecation marks ([Unity Catalog
semantics](https://docs.databricks.com/aws/en/uc-semantics/); [metric
views](https://docs.databricks.com/aws/en/metric-views/)). And an
*inferred* layer the product learns from existing dashboards, saved
queries, notebooks and Genie instructions. The blog's phrase for the split
is "model the head and let Genie infer the tail".

**What consumes it.** Genie, the natural-language question answerer.
"Genie ranks that context by authority and relevance, applies permissions,
and delivers the most useful context to Genie at answer time." Answers
cite which ontology sources contributed. The same question can return
different answers to different people because permissions apply before
the model sees anything. Documents joined tables in 2026: Genie reads PDFs
and Word files with citations under the asker's permissions ([Genie
Agents](https://docs.databricks.com/aws/en/genie-agents/volumes)).

**Who curates it, and how it stays current.** The blog's operating model
is layered accountability: business teams define ground truth and
acceptance criteria; domain stewards own pages and metric views;
administrators own access and tags; data teams resolve entities. Review
cycles per domain. "Close the feedback loop at the right layer" — a wrong
definition is fixed on the page, a wrong number on the metric view, a
wrong source in the metadata. "Evaluation is not a one-time gate before
launch; it is an ongoing habit across every asset that feeds an answer."
Certification "steers Genie One toward the assets your organization
vouches for" ([certify or
deprecate](https://docs.databricks.com/aws/en/data-governance/unity-catalog/certify-deprecate-data)).

**What breaks when it is stale or missing.** From the blog: inconsistent
entity definitions make agents pick the wrong source; ambiguous metrics
make them "choose the wrong definition"; missing relationships force them
to "guess how tables connect, and if they have to guess, they will
sometimes guess wrong"; outdated pages steer users to deprecated content;
and "no amount of good metadata or semantic modeling can compensate for a
broken physical foundation." A third-party preparation guide adds the
hazard in the inferred layer: the ranking that resolves conflicting
definitions is "a popularity contest with a forced tiebreaker", so if the
underlying definitions are fragmented "the graph you generate from it
won't be helpful, and potentially can even be harmful"
([hiflylabs](https://hiflylabs.com/blog/2026/7/29/how-to-prepare-for-databricks-genie-ontology)).
The same guide's ownership rule is the crispest in the reading: "The
business decides what a 'customer' is, engineering enforces it in the
model."

---

## 2. Code On Time — the "living" micro-ontology

*The owner's second link:
[Living Ontology](https://codeontime.com/products/micro-ontology-factory/living-ontology)
(Code On Time product page). Vendor material.*

**What it knows.** The page's claim is that the application *is* the
ontology: "The Database Web App you build with App Studio doesn't just
'have' an API; it **is** the Micro-Ontology." Entities and fields as
defined in the app's screens; business rules and validators ("If Discount
> 15%, Status = 'Awaiting VP Approval'"); role-based access and the limits
on what an AI helper may do; and the vocabulary of available operations,
exposed through a self-describing API (HATEOAS, an API whose responses
list the actions currently allowed).

**What consumes it.** People, through the generated screens, and AI
"co-workers", through the API, which the page calls "a perfect,
machine-readable reflection of the Visible UI". The point is that a human
and an agent read the same rules from the same place.

**How it stays current.** By construction: change a rule in the app
builder and "instantly, the new 'Law' is active across the enterprise",
for the screen and for the agent at once. There is no separate document
to drift.

**What breaks when stale.** The page's own answer is that an ontology kept
apart from the app drifts, so human permissions, agent capabilities and
enforced policy disagree, "enabling rogue behavior, budget overruns, or
compliance violations". This is a small vendor with a strong claim, but
the shape of the idea (derive the vocabulary from the thing that runs,
never maintain it beside it) is the same discipline ADR-0045 chose when it
ruled the ontology "derived, not hand-maintained".

---

## 3. Palantir Foundry — the ontology as the operating layer

*Sources: Palantir's own
[overview](https://www.palantir.com/docs/foundry/ontology/overview); a
consultancy explainer
([BD Emerson](https://www.bdemerson.com/article/palantir-ontology-explained));
and a five-layer account of how AIP agents use it
([zerofuturetech](https://zerofuturetech.substack.com/p/palantir-aip-agent-ontology-interaction)).
The last two are third-party readings, not Palantir's words.*

**What it knows.** Three primitives. *Object types*: the operational nouns
(a shipment, an asset, a control), each with typed properties, a primary
key and backing datasets. *Link types*: how objects relate, traversable
at run time. *Action types*: the governed operations that change an
object, each with typed parameters, "submission criteria that validate
before writing", and declared effects. Palantir calls the first two the
semantic elements and actions the kinetic ones: "an operational layer for
the organization". Functions carry business logic; interfaces let similar
object types be treated alike.

**What consumes it.** Everything above it. The analytical and operational
apps (Workshop, Quiver, Object Explorer) and the AI layer, AIP. The
five-layer reading of an AIP agent: (1) *context* the system injects on
every message, from fixed object sets or semantic search; (2) *query*, the
agent exploring objects, properties and links itself; (3) *logic*,
functions it may call; (4) *action*, governed writes with validation and
optional user confirmation; (5) *governance* across all of it, so the
"same agent, different roles" gets different capabilities. The bounding
principle: "Agents do not access underlying database tables directly."
Actions are "the only route by which that change can be made", so
validation and audit are unavoidable. External agents reach the same
layer through an MCP endpoint governed by the same permissions.

**Who curates it, and how it stays current.** An Ontology Manager whose
schema changes should be "as controlled as access to a production
database migration"; a named owner per object type; review before an
action is released; a retirement path for unused properties. Without that
discipline "ontologies accumulate optional fields, duplicate types, and
workaround actions".

**What breaks when stale.** Two named hazards. Latency: "An object type
fed by a nightly pipeline is a nightly object type, no matter how live the
application above it looks." Identity: if the same real thing arrives
under different keys from different systems, resolution must happen
before the object type is defined; "choosing the wrong [primary key] is
the most common reason an ontology gets rebuilt." The common failure
patterns listed: modelling source systems instead of business processes,
designing enterprise-wide instead of per workflow, loading every property
speculatively, and shipping objects without actions.

---

## 4. dbt — the semantic layer and metrics stores

*Sources: dbt's
[MetricFlow documentation](https://docs.getdbt.com/docs/build/about-metricflow)
and its
[2026 benchmark](https://docs.getdbt.com/blog/semantic-layer-vs-text-to-sql-2026).
Vendor material, with a stated method.*

**What it knows.** *Semantic models* over tables, each carrying
*entities* ("the join keys... think of these as the traversal paths, or
edges between semantic models"), *dimensions* (how a metric may be
sliced) and *measures*. *Metrics* are defined once on top (simple,
ratio, cumulative, derived, conversion). The whole is a *semantic graph*
from which the engine "figure[s] out the best path between tables".

**What consumes it.** BI tools and APIs, and now AI. The division of
labour is the point: "The LLM's job is then reduced to decomposing a
natural language question into the correct combination of metrics and
dimensions", and the engine generates the query deterministically, so "if
it picks the right metric and dimensions, the query is guaranteed to be
correct."

**The evidence.** On eleven questions over one modelled dataset,
text-to-SQL scored 90.0 percent (one model) and 84.1 (another); the
semantic layer 98.2 and 100. The failure-mode sentence is quoted in the
two-minute read; the companion: "the Semantic Layer tells you it can't
answer. It never returns invalid data. Text-to-SQL will cheerfully give
you a wrong number."

**How it stays current.** Definitions are files in version control, so
"everyone on the data and business teams can see and approve them as the
true and only source"; a validation step checks the configuration.
Staleness here is a code-review problem, which is the cheapest kind.

---

## 5. Knowledge graphs versus relational semantic layers

*Sources: two comparison guides from vendors in the space
([Galaxy](https://www.getgalaxy.io/articles/rag-vs-knowledge-graph-vs-semantic-layer-enterprise-ai);
[Promethium](https://promethium.ai/guides/enterprise-knowledge-graph-vs-semantic-layer-ai/)).
Both sell a hybrid, so read the "you need both" conclusion accordingly.*

**The distinction.** A semantic layer "standardizes what data means and
compiles to governed SQL"; a knowledge graph "models how entities relate
and supports multi-hop reasoning". One answers "what does this metric
equal", the other "how are these things connected, and what does that
reveal".

**When each wins.** Semantic layers: deterministic accuracy inside the
modelled domain, governance preserved, no data moved, broad tool
compatibility. Knowledge graphs: relationship navigation, explainable
chains, temporal context (edges carry timestamps). The costs named:
graphs take "months of manual ontology work", "often duplicate data",
degrade in quality at scale, and multi-hop queries reportedly slow "from
200ms to 5+ seconds in production"; semantic layers "cannot explain *why*
definitions exist or when they changed" and miss ownership, exceptions
and quality.

**Evidence figures, with their provenance.** Galaxy cites RAG at "60%
without structured entity context" and graph-backed retrieval at "90%+";
Promethium cites a 522-query study where agents with unified context were
"38% higher accuracy" than those with semantic definitions alone. Neither
figure could be traced to an independent paper from the pages read;
treat both as vendor claims.

**Reading it against Infora.** ADR-0045 chose relational tables in the
same Postgres as the wall's pre-filter, not a graph store, so that access
and classification are one query. That is the semantic-layer shape. The
edges table is the graph half, kept small: five link types, one hop at a
time, and the questions it exists for (what supersedes what, what
references what) are one- or two-hop questions. The comparison literature
suggests that is the right cut for a corpus where the wall is the
product, and that the graph questions worth asking here are structural
checks rather than open-ended traversal.

---

## 6. Ontologies steering AI agents

*Sources: a practitioner essay
([Ken Huang, "Why Ontology Matters for Agentic AI in 2026"](https://kenhuangus.substack.com/p/why-ontology-matters-for-agentic));
two papers
([ontology-to-tools compilation, arXiv 2602.03439](https://arxiv.org/abs/2602.03439);
[Agent-as-a-Graph, arXiv 2511.18194](https://arxiv.org/pdf/2511.18194));
and the schema-guided extraction literature
([ODKE+, arXiv 2509.04696](https://arxiv.org/html/2509.04696v1);
[PARSE, arXiv 2510.08623](https://arxiv.org/pdf/2510.08623)).*

Four distinct jobs an ontology does for an agent, each with a different
consumer.

**Tool selection and routing.** Where an agent has many tools or
sub-agents, a typed graph of what each one knows and touches is used to
retrieve the right ones for a question (Agent-as-a-Graph). The essay's
broader claim: the ontology acts as a "context compiler", pulling "only
the neighborhood of typed objects and relationships relevant to a goal"
into the model's window, "replacing unbounded text context with bounded,
structured reference sets".

**Query generation.** The dbt result above is the cleanest instance: the
model chooses *names* from the vocabulary and code builds the query.
Palantir's object query tool is the same idea over objects and links.

**Constraining action.** The essay's formulation: make invalid operations
"unrepresentable", for example "Agent can call Refund on Order objects
where Order.status=Delivered and Order.amount<1000 and there exists
Approval(role=Supervisor)". The ontology-to-tools paper does this
literally: "Ontological specifications are compiled into executable tool
interfaces that LLM-based agents must use... enforcing semantic
constraints during generation rather than through post-hoc validation."

**Extraction schemas.** Ontology-guided extraction (ODKE+) generates a
prompt template per entity type from the ontology, "to guide LLM outputs
toward semantically valid and schema-aligned facts"; PARSE optimises the
schema itself for reliable extraction. The pattern: the ontology *is* the
table the extractor fills, so an extracted row lands typed rather than as
prose to be re-parsed.

**Named failure modes** (the essay's list, which maps onto the vendor
material above): schema gaps, where the ontology cannot express a
constraint the agent needs; coordination drift, where "teams reinvent
labels, causing agents to disagree about what an 'account' or 'incident'
means"; mismatched execution, "updating the wrong record or performing
correct operations on incorrect objects"; and policy invisibility, because
"models don't reliably retain complex business constraints across
reasoning steps". Its conclusion: ontology is becoming "the main way to
make agents governable", not merely a way to make them smarter.

---

## 7. The domain's own vocabulary — Uniclass 2015 and ISO 19650

*Sources: [NBS on ISO 19650](https://www.thenbs.com/knowledge/iso-19650-qa-with-paul-shillcock);
[Designing Buildings on Uniclass 2015](https://www.designingbuildings.co.uk/wiki/Uniclass_2015);
[a practitioner note on classification as container metadata](https://www.linkedin.com/pulse/bs-en-iso-19650-2-requirement-uniclass-metadata-assignment-john-ford);
and the repo's own [iso-19650.md](iso-19650.md) digest.*

The infrastructure world already has the ontology that the data-platform
vendors are trying to invent for their customers. ISO 19650 says each
information container should carry metadata including a *classification*
"in accordance with an agreed classification convention such as ISO
12006-2 or Uniclass 2015", alongside revision and status, and recommends
one classification convention for the whole project. Uniclass 2015 is the
UK's voluntary scheme, authored by NBS, with tables for complexes,
entities, spaces, elements, systems (the "Ss" table Infora seeds from),
products and more, roughly five thousand codes. Classification "as an
attribute allows for the ability to search, sort and filter containers by
classification", and it has become "vital to 'search and retrieve'" in
document databases. Since ISO 19650 the classification metadata is no
longer limited to the two-character discipline code of BS 1192.

Two things follow for the reading. First, ADR-0045's reason for grounding
in a recognised standard (a chartered engineer will trust a Uniclass code
on day one where they would not trust an invented taxonomy) is the
industry's own position, not Infora's alone. Second, the standard names
the *consumer*: search, sort and filter. That is a retrieval scope by
another name, which is the lever Infora built and left unwired.

---

## 8. Reading across — one table

| Product | The ontology knows | What consumes it | What breaks when it is stale |
|---|---|---|---|
| Databricks Genie | Certified metrics, business definitions, synonyms, keys, domains, plus inferred context from usage | A natural-language question answerer; citations name the sources | Wrong definition chosen, joins guessed, users steered to deprecated assets; fixed by owners and review cadence |
| Code On Time | The app's own entities, rules, permissions and allowed actions | The generated screens and an AI co-worker, from one description | Human and agent rules diverge; avoided by deriving, never maintaining beside |
| Palantir Foundry | Objects, properties, links, governed actions and functions | Every app and every agent; the only door to the data | Nightly objects behind live-looking screens; identity clashes; field sprawl; controlled like a database migration |
| dbt semantic layer | Entities, dimensions, measures, metrics, the join graph | BI tools and AI, which choose names while code builds the query | Definitions in version control; the engine refuses rather than guesses |
| Uniclass / ISO 19650 | A standard classification per container beside revision and status | Search, sort and filter across the CDE | A project that agrees no convention cannot compare like with like |

---

## 9. How to read this beside Infora's layer

Pointers only; the exploration record and any design session draw the
conclusions.

- Infora's ontology has the *knows* column half filled (a standard-based
  vocabulary, five link types) and the *consumes* column nearly empty: one
  link type changes record state, and the retrieval scope is built but
  uncalled pending `Q-028`. Every product above became valuable through
  its consumer.
- The naming scheme (ADR-0008) is the vocabulary Infora's users already
  curate, import from spreadsheets and read on every screen. The
  literature's "coordination drift" warning is about two vocabularies for
  one concept; Infora currently carries discipline in both.
- "Model the head, infer the tail" and "agent-proposed, human-confirmed"
  are the same operating idea. The confirmation surface exists; the
  proposal half is the deferred slice.
- The dbt refusal property is the answer the open question `Q-028` is
  looking for: a scope the model *names* from a vocabulary, applied by
  code, recorded on the run, with a coverage note saying what was
  excluded, fails loudly instead of plausibly.
- The app-builder exploration's own reference (its landscape document
  in this folder, §5 on embedded analytical agents, on that exploration's
  branch until it lands) reached the same place from the other side: every embedded analytical agent grounds
  in a semantic layer and runs as the asking user. A shared project
  vocabulary is the touching point between the two explorations, not a
  merge of them.
