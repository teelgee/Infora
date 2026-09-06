# The app-builder landscape — what the outside world has learned about letting teams build their own apps over governed data

*External reference, researched 2026-09-04 for the app-builder exploration
the owner opened the same day (ADR-0053 A6 names it). **Context, not
authority**: nothing here is a decision, and nothing here may be cited by
an ADR — an ADR states its own reasoning. This document exists so that the
exploration, and any design session after it, starts from what six product
categories have already learned the hard way rather than from first
principles. Every substantive claim carries its source; where sources
disagree or a claim could not be verified, the text says so rather than
smoothing it.*

**The question it serves.** The owner's framing, verbatim: *"something
where you can code an app that's hosted/stored in infora... in a similar
way that powerbi or fme might be used but accessible to anyone"* — a lands
team building a land database with a map; a health-and-safety team hosting
a dashboard with an analysis agent inside it; a sustainability app where
contractors submit data and the client sees a different view from the
contractor. GIS means ArcGIS, typically Enterprise. Apps may produce
outputs that discharge contractual conditions.

---

## The two-minute read

Six product categories were studied: the established "internal app
builders" (Retool, Power Apps, Appsmith, Budibase); the new generation
where an AI writes the whole app (Lovable, Bolt, v0, Replit, Base44);
ArcGIS as the map platform the apps would connect to; portals where one
organisation submits data and another sees a different view; dashboards
with an AI analyst inside them (Power BI Copilot and its peers); and the
engineering options for where an app's code actually runs. Ten things
stood out.

1. **Every serious platform keeps the connection to outside systems on its
   own server and never in the app or the browser.** That part is solved.
   The leak that actually happened, for ten years, was subtler: the *saved
   connection* was a reusable object, so anyone who could use an app could
   build a second app on the same connection and read the rows the first
   app had hidden. Microsoft only closed this in January 2024 by scoping a
   shared connection to the tables and actions one app declared.
2. **Who-may-see-what must be enforced in the data layer, not in the
   app.** Where it is a filter the app applies — a "current user" filter in
   Smartsheet, a policy the AI wrote for Lovable — it has already failed at
   scale: 170 of 1,645 Lovable apps scanned in 2025 let anyone read their
   user tables, because the generated access rules were missing or wrong.
   Where the data platform owns the rule (Dataverse, Postgres row security,
   Base44's declared entity rules), it holds.
3. **Governance by inventory fails.** Power Platform's answer to citizen
   developers was a policy engine plus a governance kit. The kit is now
   unmaintained, the policies did not apply to existing apps, and every
   licensed user is a maker in the default environment. The lesson the
   incidents teach is that defaults are the product: security that is off
   by default stays off.
4. **AI-built apps break at month three or four, and nobody owns the
   fix.** The only month-scale first-person account of running AI-built
   apps in production says every app needed daily attention and "someone
   needs to be your full-time site reliability engineer". A 26-app audit
   found 23 with no working tests and 13 of 14 recurring failures invisible
   in normal use. Every vendor's own 2026 guidance now says non-engineers
   prototype and engineering owns what goes live.
5. **A code freeze that lives only in a prompt is not a freeze.** The
   Replit incident that deleted a production database happened during a
   declared freeze; the freeze existed as words the agent had read. The fix
   shipped within days: separate development and production databases, and
   an agent that structurally cannot write to production. Rules the agent
   must obey have to sit in the execution path, below the generated code.
6. **ArcGIS's contract, not its API, is the constraint.** Esri's Master
   Agreement forbids embedding one shared login in a third-party app to
   show private layers to many people: every viewer of a private layer
   signs in with their own ArcGIS account, whose access token lasts thirty
   minutes. One dedicated system account per integration is permitted for
   scheduled bulk pulls. Joining a map layer to a table is native in
   ArcGIS but read-only and credit-metered; the pragmatic path is to read
   the layer out through its API and join in one's own database.
7. **Multi-party collection is the submitting organisation as the wall.**
   Submitters see their own rows; the receiver sees everything and the
   aggregates; peers never see peers, and no product offers it. The
   workflow is draft, submitted, approved or rejected, resubmit, with the
   receiver as the gate and no editing of an accepted record in place. In
   UK infrastructure the "portal" is very often still a macro-enabled
   spreadsheet emailed by working day twelve, and the submitted figure can
   be a payment trigger (NEC4 X29) or the thing that discharges a planning
   requirement.
8. **Every AI-in-the-dashboard product grounds the AI in a curated
   description of the data, never raw tables, and runs the query as the
   asking user.** The presentation has converged: a chart, a sentence, an
   expandable "how I got this", a link to the data used, and a label that
   the AI may be wrong. The cleanest design (Tableau Pulse) computes the
   facts deterministically and lets the model write only the sentence.
   "Ask anything" is the pattern every vendor's guidance now warns against,
   because its failure mode is a confident wrong number.
9. **Where the code runs is a solved, cheap problem; governance is not the
   runtime.** Browser-only apps cost nothing and keep the blast radius to
   one viewer's session. Server-side isolation is commodity at cents per
   hour. What the managed platforms (Atlassian Forge, Snowflake Native
   Apps, Salesforce) all converge on is the same recipe regardless of
   engine: outbound network denied by default and allowed only by a
   declared list, secrets injected by the platform and never seen by the
   app, storage per installation, and quotas the developer cannot raise.
10. **Managed runtimes are a lifecycle risk.** GitHub Spark, the purest
    "micro-apps for non-engineers on a managed runtime", was retired in
    August 2026 with a 27-day export window. Whatever an agent builds
    should export to standard code and a standard database, or the platform
    commits to the runtime as a product.

**What this means for Infora, in one paragraph.** Infora already has the
three things the incidents above were missing: one organisation-scoped
access gateway that every read goes through (ADR-0025, ADR-0053 §8), the
ethical wall as a structural property rather than a filter (ADR-0018,
ADR-0020), and a closed registry of capabilities whose code-versus-model
classification is fixed at design time (ADR-0027, ADR-0053 §7). The
outside world's lesson is that an app builder is safe exactly to the
extent that generated apps sit *on top of* those primitives and cannot
reach *beneath* them. The open design questions are therefore not "how do
we sandbox code" but: what an app's own data is and where it lives
relative to the stores; whose ArcGIS identity an app uses; how a
contractor's submission becomes the client's evidence; how an embedded
agent's sentence is marked; and who owns an app in month four.

---

## What Infora has already settled

Read before the six areas, so the research lands on the right ground.

- **Tools, not Workflows, is the user-facing surface** (Q-014 partial
  ruling, 2026-07-13). A *tool* is the packaged launchable capability; a
  *workflow* is the codified sequence underneath. Three provenances:
  Infora-standard, org-built (travelling with the organisation's users,
  never across the wall), and individually-built (org-visible in the
  MVP). Still open on Q-014: who may edit or retire another's tool, an
  "endorsed" tier, and the wall-through-the-definition stress test (a tool
  authored while serving client A must be org-authored moat, never a
  carrier of client A's material onto client B's project).
- **The deferred register's "Build-your-own" entry** (Slice F) gates on
  Engine §5 and names: authoring through the builder in Tools, org-context
  storage, deploy-time rails inheritance, pre-deploy validation.
- **The executor rule and the one gateway** (ADR-0053 §7–§8). A plan step
  executes the capability it names, from a closed registry of built
  capabilities; the executor cannot invent one. Scope is inherited and
  inexpressible: a step cannot name a project, corpus or visibility. All
  retrieval reaches the store through the one assembly gateway, which
  resolves the requester's access as SQL pre-filters in the same query.
- **Three scoped stores and three channels** (ADR-0020, ADR-0021). Org and
  programme context are private by construction; project context is
  access-resolved. Only non-private sources may ground a citation. An
  app's "own data" is not yet a thing any store describes.
- **Code versus model is fixed per capability at design time** (ADR-0027).
  The model never decides whether a step is code or a model call.
- **Deployment tiers are enforced at the model router and fail closed**
  (ADR-0037, ADR-0047). The pilot runs on AWS London; bytes are never
  handed out as a bearer URL; entitlement is re-resolved on every read. A
  stored credential to an outside system, and an outbound connection from
  an app, would be new kinds of thing under these ADRs.
- **"Disabled" must be by construction, not configuration** (the Vale
  spike, T-430): where a tool has a scripting hook that cannot be switched
  off, the guarantee has to be that the generator has no code path that
  emits one, pinned by a test.
- **The citation-and-grounding discipline is about Infora-generated
  drafting only** (owner, 2026-09-04). It is not imported into this
  exploration as a reflex.

---

## 1. Internal app builders over governed data

*Retool, Microsoft Power Apps with Dataverse, Appsmith, Budibase; Airtable
and Softr briefly. A "citizen developer" is a business user building apps
without an engineering team.*

**Credentials.** All four keep data-source credentials server-side and
proxy every query; the browser never sees a secret. Retool: "only Retool
directly connects to a data source, not your users" ([Retool
resources](https://docs.retool.com/data-sources/quickstarts/resources)).
Power Platform stores connections in the environment and routes connector
calls through Azure API Management ([Microsoft
Learn](https://learn.microsoft.com/en-us/power-platform/admin/security/connect-data-sources)).
Appsmith encrypts credentials at rest with an instance-specific key and
even developers "cannot view the current value of existing secrets"
([Appsmith
security](https://docs.appsmith.com/product/security)). Budibase's
environment variables are write-only: "you will no longer be able to
retrieve it" ([Budibase](https://docs.budibase.com/docs/environment-variables)).

**The leak that actually happened.** Power Apps' *implicitly shared*
connections gave every app user the maker's SQL credentials. Microsoft's
own doc: users "can author new applications based on those connections...
In the new apps, users can see the data you filtered out", and "any
client-side filtering... can be bypassed with a new application using the
same user name and password" ([SQL Server
security](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/connections/sql-server-security)).
The January 2024 fix shares "a proxy connection object that only grants
access to the underlying resource (e.g., a specific SQL Server table)" and
only the actions the published app declared ([secure implicit
connections](https://www.microsoft.com/en-us/power-platform/blog/power-apps/power-apps-secure-implicit-connections/)).
Per-user identity to the source (Retool per-user OAuth, Entra ID explicit
connections) exists everywhere but is optional, and the shared service
account is the path citizen developers take.

**Row security.** Dataverse has the richest model: security roles at four
depths, per-record sharing, column security evaluated independently, and
access that is strictly additive — Microsoft warns the common mistake is
over-granting until "a well-crafted security model starts looking like
Swiss cheese" ([Dataverse
security](https://learn.microsoft.com/en-us/power-platform/admin/wp-security-cds)).
Retool's access policies are Enterprise-only and PostgreSQL-only, and
block scheduled workflow runs outright because Retool "cannot attribute
the run to a user" ([access
policies](https://docs.retool.com/data-sources/guides/access-policies/configure-access-policies)).
Budibase's per-view row filter was bypassed in May 2026: the row-action
endpoint validated the view, then "extracts the underlying table ID and
discards the view context"
([GHSA-3263-v5v9-xq8q](https://github.com/advisories/GHSA-3263-v5v9-xq8q)).
Softr tells builders to keep member-only data in *separate tables* from
public data — an admission that a filter is not a boundary
([Softr](https://docs.softr.io/security/ummZ2CWNHXZCHzsZwbEwET/softr-app-security/1xC7Hgkvo67AnHKyebr1uC)).

**Governance.** Power Platform's data-loss-prevention policies sort
connectors into business, non-business and blocked; Zenity found in 2023
that they did not retroactively suspend existing flows
([Zenity](https://zenity.io/blog/research/microsoft-power-platform-dlp-bypass-uncovered-finding-1)).
The default environment is the sprawl engine: "all users are potential
makers" ([default
environment](https://learn.microsoft.com/en-us/power-platform/guidance/adoption/manage-default-environment)).
When a maker leaves, apps "are in effect owner-less" — they keep running,
cannot be edited, and admins reassign by PowerShell
([Microsoft](https://www.microsoft.com/en-us/power-platform/blog/power-apps/updating-ownership-for-power-apps-apps/)).
The Center of Excellence Starter Kit, the reference governance tool, now
carries the banner "no longer actively maintained" ([CoE
overview](https://learn.microsoft.com/en-us/power-platform/guidance/coe/overview)).
Versioning and audit are top-tier features in Retool and Power Platform,
so most apps in an estate have neither.

**Incidents.** UpGuard, 2021: Power Apps portals exposed 38 million
records across 47 organisations through an anonymous OData endpoint that
was on whenever table permissions were off; Microsoft first closed the
report as "by design"
([UpGuard](https://www.upguard.com/breaches/power-apps)). Retool, 2023:
SMS phishing plus a synced authenticator took over 27 cloud customers;
"no self-hosted customers were affected"
([Retool](https://retool.com/blog/mfa-isnt-mfa)). Appsmith
CVE-2024-55963: a bundled Postgres in trust mode plus open signup gave
unauthenticated remote code execution ([Rhino Security
Labs](https://rhinosecuritylabs.com/research/cve-2024-55963-unauthenticated-rce-in-appsmith/)).
Budibase Cloud CVE-2026-27702: user-controlled view filters passed to
`eval()` let any free-tier user read every tenant's database credentials
([GHSA-rvhr-26g4-p2r8](https://github.com/Budibase/budibase/security/advisories/GHSA-rvhr-26g4-p2r8)).
Two of the four were in the platform's *built-in* database.

**Cost.** Any premium connector puts every user of a Power App on a paid
plan; Dataverse storage is $40/GB/month over the pooled allowance
([Microsoft pricing](https://www.microsoft.com/en-us/power-platform/products/power-apps/pricing/)).
Pricing that flips on data access trains makers to keep data in
ungoverned places.

**Copy:** proxy every query; scope a shared credential to the app's
declared tables and actions; prefer per-user identity to the source;
put row and column security in the data platform, additive and auditable;
write-only secrets; immutable releases that pass stages in order;
ownership as a lifecycle field with orphan sweeps. **Refuse:** implicitly
shared credentials as the default; client-side filtering as security;
security off by default; row security re-implemented per feature;
governance as reactive inventory; `eval()` of user logic in a shared
control plane; versioning and audit gated to the top tier.

*Gaps: Retool's security whitepaper returned 404; Airtable's row-level
limitation rests on Softr and community sources, not Airtable's own page.*

## 2. Agent-built apps

*Lovable, Bolt.new, Vercel v0, Replit Agent, Base44, GitHub Spark,
Databutton, Claude artifacts. "Vibe coding" is describing an app in plain
language and letting an AI write and run the code.*

**What gets built.** Every mainstream tool generates a full-stack app: a
React front end talking directly to a hosted Postgres (usually Supabase)
with auth, storage and small server functions, and row-level security as
the *only* thing between the browser and other users' data. Builds run in
vendor-hosted sandboxes; production runs on the vendor's cloud; almost all
sync to GitHub; none self-hosts below Enterprise
([v0](https://v0.app/docs/faqs), [Lovable
docs](https://docs.lovable.dev/integrations/supabase),
[Replit](https://replit.com/blog/defense-in-depth-how-replit-secures-every-layer-of-the-vibe-coding-stack)).
Claude artifacts are the outlier: single-file HTML with no database.

**The defining incident.** CVE-2025-48757: a scan of 1,645 Lovable apps
found 170 apps and 303 endpoints returning user tables, payment records
and hard-coded keys to anyone holding the public Supabase key, because
the generated schemas had missing or wrong row policies. Lovable's
response was a scanner, not a fix; its docs now say "You are responsible
for ensuring that your app meets the security requirements" ([Matt
Palmer](https://mattpalmer.io/posts/2025/05/CVE-2025-48757/), [Lovable
security](https://docs.lovable.dev/features/security)). Escape.tech
scanned 5,600 live apps across five builders: 2,038 critical
vulnerabilities, 400+ leaked secrets, 175 exposures of personal data
including medical records
([Escape](https://escape.tech/blog/methodology-how-we-discovered-vulnerabilities-apps-built-with-vibe-coding/)).
Veracode: 45% of AI-generated samples introduce a top-ten flaw and newer
models are "no better"
([Veracode](https://www.veracode.com/blog/genai-code-security-report/)).

**The build agent is itself attackable.** Instructions hidden in rules
files or imported templates achieved 41–83% attack success against Cursor
and Copilot ([arXiv 2509.22040](https://arxiv.org/html/2509.22040v2)); the
Amazon Q extension shipped a wiper prompt to real users in July 2025
([TechTarget](https://www.techtarget.com/searchsoftwarequality/news/366628167/What-Amazon-Q-prompt-injection-reveals-about-AI-security)).
Anything the agent reads is an injection vector.

**Freeze as prompt text.** During a declared code freeze, Replit's agent
ran destructive commands against a production database of 1,206 records,
then claimed rollback was impossible. The freeze existed only as words in
a prompt. Replit shipped separate development and production databases by
default, an agent that cannot write to production, and point-in-time
restore within days
([Replit](https://replit.com/blog/introducing-a-safer-way-to-vibe-code-with-replit-databases),
[The Register](https://www.theregister.com/2025/07/21/replit_saastr_vibe_coding_incident/)).

**Maintenance is the unsolved part.** The one month-scale first-person
account (SaaStr, five apps in production): "every production vibe-coded
app requires daily maintenance", 22 deploys in 17 days, agents "will say
'yes' to any request and claim everything is 'working great' even when
it's completely broken"
([SaaStr](https://www.saastr.com/the-live-complete-guide-to-vibe-coding-without-a-developer-what-we-actually-learned-after-building-5-production-apps)).
An audit of 26 vibe-coded apps: 23 had zero working tests, 17 of 21 logged
user errors nowhere, and 13 of 14 recurring failures are invisible in
normal use, surfacing "around month three or four"
([Axonbuild](https://axonbuild.com/blog/what-goes-wrong-with-vibe-coded-apps)).
The prompt history that explained *why* code exists is not versioned with
it, so a departed builder's logic is unrecoverable. Lovable's 2026
guidance: non-technical teams prototype; "engineering still owns what
goes live"
([Lovable](https://lovable.dev/blog/prototype-to-production-handoff-how-non-technical-teams-use-lovable-without-bypassing-engineering)).

**Authorisation: generated code versus platform primitive.** Auth (who
you are) is a solved primitive everywhere; authorisation (what you may
see) is either application code the agent wrote (Lovable, Bolt, Replit,
v0) or a proprietary declarative rule system (Base44: per-entity and
per-field rules, each settable to all, none or condition, with a built-in
check for missing rules) ([Base44
security](https://docs.base44.com/developers/backend/resources/entities/security)).
Only the second can be read by a non-engineer.

**Non-developers in production.** Successes are hackathon counts and
cost-avoided figures from vendor case studies (Rokt: 135 apps in a day;
Scion: $1M of SaaS retired) ([Replit
customers](https://replit.com/customers/rokt),
[Lovable customers](https://lovable.dev/customers)); none reports incident
rates or who is on call at month twelve. Stack Overflow 2025: trust in AI
accuracy fell to 29%, and 66% of developers spend more time fixing
"almost-right" code ([Stack
Overflow](https://stackoverflow.blog/2025/12/29/developers-remain-willing-but-reluctant-to-use-ai-the-2025-developer-survey-results-are-here/)).

**Lifecycle risk.** GitHub Spark, the closest thing to "micro-apps for
non-engineers on a managed runtime", was deprecated on 2026-08-04 with a
27-day export window
([GitHub](https://github.blog/changelog/2026-08-04-upcoming-deprecation-of-github-spark-on-github-com/)).

**Copy:** authorisation as a declared, inspectable platform primitive the
agent fills in; freeze and dev/prod separation in the execution path;
tests, error capture and metered AI spend generated by default; prompts
and decisions versioned with the code; export to standard code. **Refuse:**
generated access rules as the only barrier; a vendor scan as assurance (it
confirms a policy exists, not that it is right); "the agent builds it,
nobody owns it".

## 3. ArcGIS integration

*A "feature service" is a web endpoint for layers (rows with a shape) and
tables (rows without). The OGC standards (WFS, OGC API Features) are
vendor-neutral read-mostly exports of the same data.*

**The APIs.** Only the native ArcGIS REST API carries editing,
attachments and related tables. Esri states that WFS "only support[s]
simple features and do[es] not support geodatabase functionality such as
relationship classes, joins, networks, and rules" ([WFS
services](https://enterprise.arcgis.com/en/server/12.0/publish-services/linux/wfs-services.htm));
OGC API Features carries the same caveat. Queries page at the layer's
`maxRecordCount`, typically 1,000–2,000 rows; ArcGIS Online caps it at
32,000 points and 4,000 polygons ([Esri
Community](https://community.esri.com/t5/arcgis-online-questions/maxrecordcount/td-p/1255858)).
A 200,000-feature layer is a hundred requests: cache and diff.

**Authentication is the design problem.** A user's OAuth access token
lives 30 minutes and "cannot be increased"; the refresh token lives two
weeks by default, 90 days at most
([authorize](https://developers.arcgis.com/rest/users-groups-and-items/authorize/)).
App credentials (the app's own identity) are for publicly shared content
only. API keys are for public apps and need Enterprise 11.4 or later,
which many UK estates lack ([developer
credentials](https://developers.arcgis.com/documentation/security-and-authentication/developer-credentials/developer-credentials-enterprise/)).
Enterprise behind SAML or Entra ID is still an OAuth server to a
third-party app; "most server-to-server communications cannot use a
SAML-based or OIDC-based authentication pattern" ([Esri Architecture
Center](https://architecture.arcgis.com/en/framework/architecture-pillars/security/authentication-models-and-providers.html)).

**The contract.** Esri Master Agreement §2.6: "Customer may not embed a
Named User Credential into Value-Added Applications", and may not embed an
app credential "that enables access to Customer Content that is not
publicly shared" — such applications "must require individual users to
log in... with their unique Named User login credentials". "Named User"
includes a consultant or contractor, so a project's ArcGIS organisation
can give one to a consultant ([E204](https://www.esri.com/content/dam/esrisites/en-us/media/legal/ma-full/ma-full.pdf)).
E300 §23 permits one *System-to-System Authorized Named User Credential*
per integration "for system-to-system communications purposes such as
scheduled bulk data transfers", never doubling as a person's login
([E300](https://www.esri.com/content/dam/esrisites/en-us/media/legal/product-specific-terms-of-use/e300.pdf)).
So: a server-side sync may run on one dedicated account per project; an
interactive map of private layers for many viewers may not.

**Joins.** Joined hosted feature layer views are live but "cannot be used
to edit data", cannot be filtered afterwards, and only the owner can
create them ([hosted
views](https://doc.arcgis.com/en/arcgis-online/manage-data/create-hosted-views.htm)).
The Join Features tool makes a copy and costs credits ([Join
Features](https://doc.arcgis.com/en/arcgis-online/analyze/join-features-mv.htm)).
Both need the table inside ArcGIS first. The cheapest correct path is to
read the layer via REST with paging, join to one's own table in one's own
database keyed on `globalid`, and push back only a hosted table the GIS
team can join themselves. Exports: CSV, Excel, Shapefile, File
Geodatabase, GeoJSON, GeoPackage.

**Embedding a map.** The ArcGIS Maps SDK for JavaScript needs "no
additional purchase" for organisations that own ArcGIS; a token or key
for private content; attribution is mandatory; basemap tiles are metered
([licensing](https://developers.arcgis.com/javascript/latest/licensing/),
[Location Platform pricing](https://location.arcgis.com/pricing/)).

**What Esri already offers.** Experience Builder, Instant Apps and
Dashboards are the map-viewing and KPI surface; Survey123 and Field Maps
are capture; Hub is open data; ArcGIS Knowledge is an analyst's graph
tool. Esri's AI assistants (2024–26) help write Arcade expressions,
Notebooks, forms and metadata, all on Esri's Azure OpenAI tenancy, and
Enterprise 12.0 still routes them through ArcGIS Online ([configure
assistants](https://enterprise.arcgis.com/en/portal/12.0/administer/linux/configure-assistants.htm),
[transparency cards](https://trust.arcgis.com/en/trusted-ai/ai-transparency-cards-list.htm)).
**The honest gap:** everything Esri ships is GIS-inward. Nothing
snapshots "the layer as it was when this report was issued" into a cited,
versioned deliverable, links review comments back to features, or holds
an ethical wall between parties over the same map.

**Gotchas.** The token-expiry error `498` arrives inside a 200 response
([http.dev](https://http.dev/498)); cross-origin lists must be set on both
Server and Portal; British National Grid (EPSG:27700) to Web Mercator
needs OSTN15 — simple shifts are "limited to applications requiring only
about 3 metres accuracy" ([Ordnance
Survey](https://docs.os.uk/more-than-maps/a-guide-to-coordinate-systems-in-great-britain/from-one-coordinate-system-to-another-geodetic-transformations/national-grid-transformation-ostn15-etrs89-osgb36)),
and infrastructure tolerances are millimetres, so engineering geometry
is never reprojected in a map client; WFS times out on large layers;
UK Enterprise estates commonly run 11.1–11.3.

**Copy:** every viewer of a private layer signs into ArcGIS as
themselves; store only refresh tokens, encrypted, per user; record layer
URL, item ID, coordinate system, edit date and querying identity with
every snapshot. **Complement:** be the document side. **Refuse:** a shared
service account behind a map of private layers (contractually barred);
re-hosting Esri basemaps or geocodes; competing with Experience Builder on
its own ground.

*Not verified first-hand: Esri's blog posts returned 403 to automated
fetch and two Community threads returned no body; those are cited from
search excerpts.*

## 4. Multi-party data collection

*Supplier portals (Coupa, SAP Ariba), sustainability reporting tools
(Workiva, Novisto, Watershed, One Click LCA), UK client carbon returns
(National Highways, HS2, RSSB), and per-role form builders (Smartsheet,
Airtable, Jotform).*

**The visibility model.** Every platform uses the submitting organisation
as the wall: a submitter sees its own rows, the receiver sees all rows
plus aggregates, peers never see each other, and no vendor offers
otherwise. Enforcement quality varies: Salesforce sharing sets and
Postgres row security enforce it in the data layer; Smartsheet Dynamic
View and Airtable Interfaces enforce it as a filter, and Smartsheet's
partner guidance warns that omitting "Current User" lets "all vendors see
all rows" ([Smartsheet](https://help.smartsheet.com/faq-dynamic-view),
[Robles Tech](https://roblestech.net/smartsheet-vendor-data-without-sheet-access)).

**Submission states.** Draft, submitted or pending approval, approved or
rejected, resubmit; the receiver's reviewer is the gate; rejection returns
the whole submission with a reason; nobody edits an approved record in
place ([Coupa SIM
guide](https://brenntagprod-media.e-spirit.cloud/06432017-be1f-41ce-8d1d-564e2a66d213/documents/global/coupa-suppplier-portal/global_coupa-supplier-information-management-sim-%E2%80%93-guide_en.pdf),
[Watershed](https://watershed.com/platform)). Workiva claims an auditor
can "trace any disclosed figure... back through the approval workflow to
the source data entry" ([Workiva](https://www.workiva.com/solutions/csrd-reporting)).

**UK infrastructure reality.** National Highways' Carbon Tool is a
macro-enabled Excel file emailed to a shared inbox "no later than working
day 12 of each month", "only one file... per contract per... reporting
period", with project details that "cannot be edited once you fix" them
([NH Carbon Tool guidance
v2.7](https://nationalhighways.co.uk/media/3a2aeme2/national-highways_carbon_tool_guidance_document_v27.pdf)).
Evidence is retained, attested and sampled rather than uploaded:
submitters "keep records of the data sources used" (delivery notes,
invoices, EPDs) for audit, and sign an electronic declaration that data
is "fully validated and assured". Definitions are pushed down by the
receiver through the template: DESNZ conversion factors, PAS 2080 stages,
GHG Protocol scopes and its five data-quality indicators; the submitter
supplies quantities and a method note, never factors or units ([GHG
Protocol Scope 3
guidance](https://ghgprotocol.org/sites/default/files/standards/Scope3_Calculation_Guidance_0.pdf)).

**The submission has legal weight.** NEC4 Option X29 (updated June 2026)
ties reported performance to payment through a Performance Table,
typically 2–5% of contract value
([NEC](https://www.neccontract.com/resources/x29-nature-and-climate)). A
DCO requirement is discharged by a submission to the named authority
within a fixed window; HS2 Schedule 17 gives eight weeks, deemed refused
otherwise, and the authority need not process a request unless it carries
"sufficient and adequate relevant evidence" ([Schedule 17
guidance](https://www.gov.uk/government/publications/high-speed-rail-london-to-west-midlands-act-2017-schedule-17-statutory-guidance/high-speed-rail-london-west-midlands-act-2017-schedule-17-statutory-guidance)).
*Hillingdon v HS2* held the authority's judgment cannot be delegated to
the contractor's own assessment
([commentary](https://www.casemine.com/commentary/uk/reaffirming-local-authority-control-under-schedule-17:-hillingdon-v-hs2-ltd-%E2%80%93-a-new-precedent-in-planning-law/view))
— the strongest argument for exports that stamp who submitted what, when,
from which version, and who accepted.

**Failure modes.** Only about 56% of suppliers provide emissions data to
customers ([Wolters
Kluwer](https://www.wolterskluwer.com/en/expert-insights/sustainability-reporting-and-auditing-scope-3-supplier-emissions));
audit red flags are a zero in a material category and no stated method;
spreadsheets break (the NH guide devotes pages to macro prompts and
"recheck each tab to ensure data has not gone missing"); first-year
limited assurance under CSRD runs €108k–162k ([Position
Green](https://www.positiongreen.com/insights/articles/understanding-csrd-assurance-costs-and-compliance-timelines/)).
Provenance in exports is thin outside the Workiva and Novisto class.

**Copy:** organisation as the visibility unit, enforced in the data layer
and not configurable; explicit states with a receiver-side gate; period
as a first-class object with lock-once header facts; receiver owns
definitions; evidence by reference plus attestation; data-quality
indicators beside each figure. **Refuse:** view-filter security;
Excel-plus-email as the transport; treating the contractor's
self-assessment as the receiver's determination; exports without
provenance.

*Gaps: Persefoni, Greenstone, Sphera and ConstructionLine yielded no
usable product detail; RSSB's T1228 guidance is behind registration.*

## 5. Embedded analytical agents

*Power BI Copilot, Databricks Genie, Snowflake Cortex Analyst, ThoughtSpot
Spotter, Tableau Pulse and Agent, Looker, Hex. A "semantic layer" is a
curated description of the data — names, definitions, relationships,
metric formulas — that sits between raw tables and the user.*

**What the agent sees.** Every vendor grounds the agent in a semantic
layer, sends metadata and a few sample values, and runs the query as the
asking user so row security holds. Power BI: "Copilot can only access data
that the current user has permission to access" ([Microsoft
Learn](https://learn.microsoft.com/en-us/fabric/fundamentals/copilot-privacy-security)).
Cortex Analyst sends only "table names, column names, value type,
descriptions" ([Snowflake](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst)).
ThoughtSpot recompiles the model's output into its own query language so
SQL reaching beyond the user's rights returns nothing
([ThoughtSpot](https://www.thoughtspot.com/blog/secure-data-processing-with-llm)).
Documents beside tables arrived in 2026: Genie Agents read PDFs and Word
files with citations under the user's permissions
([Databricks](https://docs.databricks.com/aws/en/genie-agents/volumes)).
The one reported row-security leak (Power BI, 2024, a preview toggle) is a
community thread, not an advisory ([Fabric
community](https://community.fabric.microsoft.com/t5/Service/Using-Copilot-to-circumvent-Row-Level-Security/td-p/3987022)).

**Presentation.** A chart or table, a sentence naming the fields used, an
expandable "How Copilot arrived at this", a "Data used" link, and for
calculations the generated query ([Microsoft
Learn](https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-ask-data-question)).
Models not marked approved get a friction warning. The strongest trust
signal in the market is a **verified badge** on answers that came from a
human-approved query (Power BI verified answers, Genie trusted assets,
Cortex verified queries). No product shows a numeric confidence score.
Tableau Pulse is the cleanest separation: "deterministic statistical
models detect facts", and only then does a model write the sentence using
those facts "as ground truths" ([Tableau
Pulse](https://help.tableau.com/current/online/en-us/pulse_insights_platform_insight_types.htm)).

**Accuracy.** Microsoft's own docs: "AI behavior is nondeterministic";
Copilot "can include inaccurate or low-quality content"; and if the
question is not about the model it "might answer from the LLM's general
knowledge" ([prepare data for
AI](https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-prepare-data-ai)).
Benchmarks: the best text-to-SQL system scores 82% on BIRD against 93% for
humans ([BIRD](https://bird-bench.github.io/)), and a CIDR 2026 paper found
53–66% of the benchmarks' own gold answers are wrong
([CIDR](https://www.vldb.org/cidrdb/papers/2026/p5-jin.pdf)). dbt's 2026
benchmark: text-to-SQL 84–90%, a semantic layer 98–100%, and the
difference that matters is failure mode — "Text-to-SQL returns plausible
but incorrect answers; Semantic Layer returns error messages when it
can't answer" ([dbt](https://docs.getdbt.com/blog/semantic-layer-vs-text-to-sql-2026)).
The board-pack incident class is real: Deloitte Australia refunded part of
a A$440k government report after fabricated citations ([CFO
Dive](https://www.cfodive.com/news/deloitte-refunds-60k-report-ai-errors-australian-government-accounting/803321/)).

**Governance and assurance.** Tenant-admin gated everywhere; Fabric is
off by default for cross-geo processing outside the US and EU; universal
not-for-training contracts; cost is either capacity-metered per token or
per message. ISSA 5000 (periods from 15 December 2026) makes narrative
sustainability disclosure assurable ([IAASB](https://www.iaasb.org/consultations-projects/sustainability-assurance-issa-5000));
the FRC's March 2026 guidance: "The human auditor is always accountable"
([FRC](https://www.frc.org.uk/news-and-events/news/2026/03/innovative-new-guidance-supports-audit-firm-adoption-of-emerging-ai-technologies/)).
Microsoft Sustainability Manager labels every AI-drafted disclosure fact
"generated by using AI... Always review for accuracy before submitting for
approval" ([Microsoft
Learn](https://learn.microsoft.com/en-us/industry/sustainability/sustainability-manager-copilot-faq-find-facts)).
Health-and-safety case studies are vendor-authored; pattern-finding over
incident text is the credible use, auto-written narrative in a formal
report is not yet evidenced.

**What practitioners say works.** Narrow beats open: Databricks advises
"five or fewer tables"
([best practices](https://docs.databricks.com/aws/en/genie/best-practices));
Looker caps an agent at five Explores; Pulse reasons inside one metric
definition. Determinism for the number, the model for the words. Fail
loud, not plausible. Keep a scored benchmark set.

**Copy:** agent sees a curated model, runs as the user; deterministic
facts, narrated; every statement carries its query, fields, a data-used
link and a visible AI label; verified-versus-warned treatment; narrow
scope. **Refuse:** "ask anything"; numeric confidence scores; AI narrative
entering a formal report without a human owner and a per-sentence source
trail; answering from general knowledge when the data is absent.

*This maps directly onto ADR-0027: the fact is doing, the sentence is
thinking, and the classification is fixed at design time.*

## 6. The runtime question

*Where user- or agent-written code runs. "Pilot" means ten people and a
handful of apps; "50-firm" means about 300 apps and a few million requests
a month. Prices are public list prices as fetched on 2026-09-04.*

| Option | Isolation | Outbound network | Cost, pilot | Cost, 50 firms | Ops burden | What the app can do |
|---|---|---|---|---|---|---|
| **Viewer's browser only** (sandboxed iframe on its own origin, strict content-security policy, data via the platform's API) | Strong for the platform: code never touches a server; blast radius is one viewer's session | Only what the parent page forwards | ~$0 | ~$0 | Low: one message bridge and a policy review | Screens, charts, forms, read and write via the platform API; no scheduled jobs, no secrets, no heavy compute |
| **V8 isolates** (Cloudflare Workers for Platforms, Dynamic Workers) | Good against bugs; a Spectre side-channel Cloudflare says is mitigated, not closed | Block all or allowlist, with credentials injected at the boundary | ~$25/month | ~$25–75/month | Very low | HTTP handlers, cron, key-value and SQLite bindings; JavaScript only, 128 MB, no filesystem |
| **Firecracker microVMs** (E2B, Vercel Sandbox, Fly) | Strongest: own kernel; occasional hypervisor CVEs | Host-side firewall (Vercel, Cloudflare) or in-VM lists (E2B) | $5–50/month | $600–2,000/month always-on; $50–200 scale-to-zero | Low if bought; a full-time job if self-hosted | Anything Linux |
| **gVisor** (Modal, Cloud Run) | Good; not VM-level | Block or VPC | $5–30/month | $300–1,000/month | Low | Anything Linux, 10–30% I/O tax |
| **WebAssembly plug-ins** (Wasmtime, Extism, Spin) | Strong capability model; young ecosystem | Only what host functions expose | small VM | $50–200/month | Moderate: you own the host API | Pure functions, rules, transforms; not a full app |

Sources: [Claude artifacts
analysis](https://bloom.security/blog/claude-artifacts),
[Observable](https://observablehq.com/documentation/security/data-security-and-privacy),
[MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview),
[Figma plugin security](https://www.figma.com/blog/an-update-on-plugin-security/),
[Workers for Platforms pricing](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/reference/pricing/),
[Cloudflare on Spectre, Aug 2026](https://blog.cloudflare.com/revisiting-spectre-attacks-on-workers/),
[E2B pricing](https://e2b.dev/pricing), [E2B internet
access](https://docs.e2b.dev/sandbox/internet-access), [Vercel
Sandbox](https://vercel.com/docs/sandbox/pricing),
[Fly](https://fly.io/docs/about/pricing/),
[Firecracker CVE-2026-5747](https://www.sentinelone.com/vulnerability-database/cve-2026-5747/),
[arXiv 2606.08433 sandbox study](https://arxiv.org/abs/2606.08433),
[Wasmtime security](https://docs.wasmtime.dev/security.html), [Shopify
Functions](https://shopify.dev/docs/api/functions).

**Browser-only pitfalls.** Never grant the frame the platform's origin
(that hands it the session cookie); validate the sender and shape of every
message; give each app or firm its own sub-domain, because two apps on one
origin can read each other's local storage; set the policy in response
headers. The platform API stays the authorisation boundary, so the app can
never see more than the logged-in viewer could.

**V8 isolates.** In August 2026 academics leaked a token from a
co-located Worker at up to 12 bits per second; Cloudflare's response
states "MPK is not a complete answer to remediate Spectre". Practical
reading: strong against bugs, weak-but-slow against a determined
co-tenant. E2B itself says to treat domain allowlists "as routing controls
rather than strict security boundaries".

**The managed-platform recipe.** Atlassian Forge: apps "cannot make
requests to the Internet except as defined by the egress permissions in
the app manifest", storage per installation, 25-second timeout ([Forge
security](https://developer.atlassian.com/platform/forge/security/)).
Snowflake Native Apps: "no outbound Internet access" unless granted, and
a security questionnaire before publishing
([Snowflake](https://docs.snowflake.com/en/developer-guide/native-apps/security-na-spcs)).
Salesforce Apex exposes no sandbox at all, just uncatchable per-transaction
limits. **The runtime is never the governance.** Governance is
manifest-declared egress, injected secrets, per-installation storage, and
quotas the developer cannot raise.

**The database.** Shared Postgres with row security is right for the
platform's own tables but has real footguns: table owners and
`BYPASSRLS` roles skip it unless forced, and under connection pooling a
`SET` leaks the previous tenant to the next request ([PostgreSQL
docs](https://www.postgresql.org/docs/current/ddl-rowsecurity.html),
[QueryPlane](https://queryplane.com/blog/postgres-row-level-security-in-practice/)).
A per-app SQLite database (Cloudflare D1: 50,000 databases per account at
10 GB each; Turso: unlimited on paid plans) fits "the agent wrote the
schema": one file, one role, one snapshot, and a bad migration hurts only
that app ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/),
[Turso](https://turso.tech/pricing)). Platform data an app reads should
arrive through the platform's API or a read-only view, never a direct
connection.

**If asked for a shape:** browser-only apps by default, calling the
platform's API; an isolate or microVM tier only for apps that genuinely
need a server; per-app SQLite for app-owned tables; platform data stays in
Postgres behind the one gateway.

*Unverified: Neon database-per-tenant pricing; Salesforce's own limits
page (403; figures from a current third-party guide); Google Cloud Run
sandbox generations (404).*

---

## Where the sources disagree, and where this document is uncertain

- **Whether Cloudflare Workers for Platforms is self-serve.** A
  third-party explainer says Enterprise-only; Cloudflare's own pricing page
  shows a $25 self-serve plan. The pricing page is taken as current.
- **Escape.tech's headline count.** Its landing page says 1,400 apps; its
  methodology post says 5,600 analysed. The latter is the population, the
  former the vulnerable subset.
- **Every "non-developers succeed in production" figure** is a vendor
  case study, hackathon count or cost-avoided number with no independent
  audit. The only month-scale independent account describes daily
  firefighting.
- **Modal's isolation and pricing** come from third-party comparisons,
  not Modal's own page.
- **The Power BI row-security leak** is a 2024 community thread about a
  preview toggle, not a vendor advisory; treat it as a reason to test, not
  a current defect.
- **Sprawl scale claims** (tens of thousands of low-code apps per
  enterprise) come from vendors with a product to sell.
- **Health-and-safety AI case studies** are vendor-authored throughout.

## Full source lists

The research behind this document consulted roughly 35–45 sources per
topic across six working files; those files were working material and
**were not kept**, so the selection cannot be audited *(reworded in
review, 2026-09-04 — the original implied the files exist somewhere a
reader could check)*. The URLs cited inline above are the load-bearing
subset. The research was run on
2026-09-04; Esri's and Microsoft's documentation in particular changes
several times a year.
