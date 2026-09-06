# ADR-0057 - A **connection** to an outside system is a thing **owned by the organisation that owns that system**, set up once by a person who may already reach it, with its key **written once and never read back**, a **declared reach** an app borrows and cannot exceed, **outward calls denied except to that reach and audited every time**, and a **writing connection** as a separate kind that needs the **project owner's approval** before an app in their project may use it

*In plain terms:* the lands app shows a map, and the map layers live in ArcGIS
under somebody's enterprise account. To draw them, Infora has to reach out to
a system it does not run, using a key that opens that account. Today nothing
in Infora reaches outward to a customer's system at all. This record says who
may set up such a link, where the key is kept, what the link is allowed to
touch, and what happens when it sends data *out* rather than bringing it in.
The short version: the firm that owns the outside account sets up the
connection and lends it to apps; the key goes into a locked store nobody can
read back, not even the person who typed it; the connection lists exactly what
it may reach, and an app can use no more than that; and sending project data
outward needs the project owner's say-so.

**Status:** Accepted (owner-ruled 2026-09-06, the app-builder design session;
record in [grill-history.md](../../grill-sessions/grill-history.md), Session
AB). **Build deferred to deployment by the same ruling**: the locked store for
keys arrives with the pilot deployment (**[ADR-0047](0047-pilot-deployment-substrate.md)**
§7, T-316), and a connection built against a stand-in on one machine would be
the leak this record exists to prevent. Companion to
**[ADR-0056](0056-the-app-model.md)** (the app model). Applies
**[ADR-0037](0037-deployment-security-tiers-router-enforced.md)**'s discipline —
policy enforced at one choke point, declared attributes, fail closed, audited
per call — to traffic going *out*, where until now it governed only inference.
Anchored on Session X's ruling 5 (the builder connects only what they
themselves may reach) and the owner's domain fact recorded there (*"typically
whoever owns the esri account. some projects will leave this to a consultant …
others will have their own enterprise account"*). Component 7 (connectors)
gains its first ruled object.

**Context:** The research behind the exploration found that the single most
common app-builder leak is a saved connection reusable beyond the app it was
made for — a maker's database login silently lent to every user of every app
built on it, closed only when the platform scoped a shared connection to the
tables and actions one app declared. It also found the map platform's real
constraint is contractual: Esri's terms forbid one shared login showing private
layers to many people, permit one dedicated system account per integration for
scheduled pulls, and give a person's token a thirty-minute life that ends with
a password change. Every serious platform keeps the credential on its own
server, proxies every call, and makes stored secrets write-only. None of that
is novel; what Infora adds is the wall. A connection is owned by an
organisation, and the rows it brings in are that organisation's rows.

**Decision:**

**1. A connection is an organisation's own thing.** It is created by the
organisation that owns the outside system, held in that organisation's
workspace, and lent to app instances in any project the organisation is a
member of. Project-owned and firm-owned connections are the same object: the
owner organisation of a project creating one for its own ArcGIS account is
simply an organisation creating a connection.

**2. Only a person who may reach the system may connect it, and never with
their own login.** The creator must already hold access to what the
connection names (Session X ruling 5). The credential stored is a **dedicated
integration credential** — a system account set up for this integration,
scoped by the outside system's own means to what the connection declares —
never a person's password or session token — because an unattended run must
not die with a person's password, and because an integration's audit trail
must name the integration, not whoever lent it their login. For ArcGIS the
research pass read Esri's terms as permitting one system account per
integration; **that reading is context, re-verified against the current
agreement by the ticket that builds the first connection, and this rule
stands on the operational grounds either way** *(precision added in review,
2026-09-06)*. People who need the *live* layer sign into ArcGIS as
themselves, in their own browser, outside Infora's key.

**3. The key is written once and never read back.** A stored credential goes
into the deployment's secrets store, encrypted under the deployment's own
customer-managed keys (ADR-0047 §6–§7), and is **injected into a run by the
platform**. It never appears in an app's definition or generated code, never
reaches a browser, and cannot be displayed back to the person who typed it —
the write-only property every reference platform converged on. Rotating it is
writing a new one.

**4. A connection declares its reach, and an app borrows only that.** A
connection names what it may touch — the layers, tables or endpoints — and
whether it **reads** or **writes**. Lending it to an app grants the app that
reach and no more; an app's definition names the connection and the platform
enforces the declared reach below the app's code, so a second app lent the
same connection cannot widen it. Data a read connection brings in lands in an
app table **stamped with the connecting organisation**, under ADR-0056 §2 like
every other row — the ArcGIS pattern being a nightly, provenance-stamped
snapshot pulled under the integration account, keyed to the layer's stable
identifier, seen by everyone in the app's scope who may see that
organisation's rows.

**5. Outward calls are denied by default and audited every time.** Nothing
reaches out of the platform except through a connection, to the reach it
declares, from a run acting as a named person (ADR-0056 §5). Every outward
call is recorded with its destination, the connection used, the run and the
person it acted as — ADR-0037 §6's egress audit applied to the outbound path.
A connection naming a destination outside what the deployment tier permits
**fails closed**, exactly as a non-conforming model route does.

**6. A writing connection is a separate kind, and lending it into a project
needs the project owner's approval.** A read connection brings data in on the
connecting organisation's stamp and needs nobody's approval beyond its
owner's. A **write** connection sends project data to a system the platform
does not govern; data leaving the project is the owner's call in every other
rule the platform has, so **the project owner approves the loan, audited,
before an app in their project may use it**, and may revoke it at any time.

**7. A connection leaves with its organisation.** When the owning organisation
leaves a project, its connections' loans into that project end and its pulls
stop; rows already pulled follow ADR-0056 §7. When a connection is retired, its
loans end everywhere; nothing keeps running on a retired key.

**8. Stated plainly, because no control exists for it.** A firm may lend its
connection to an app in a *second* client's project, because the connection
is the firm's. Whether the layers behind it are the first client's data is
something no rule of Infora's can know; it is the same responsibility the
firm already carries when it points its own tools at a client's data, and
this record does not pretend otherwise.

**Consequences:** Three tables are drawn in [data-model.md](../../build/data-model.md)
drawer 9 — `connections`, `connection_loans` and the append-only
`connection_calls` — marked *built after deployment*. The secrets store gains a
per-connection entry referenced by pointer, never by value. Component 7's
register gains *connection* as its first ruled sub-component and the overview's
deferred *Connectors* feature points here. **Personal data:** a connection
names the person who created it and, for a writing loan, the owner's person who
approved it; both are audit attributions on the standing rule that an act
with nobody's name on it is not an audit record, and are registered in
[personal-data.md](../personal-data.md). Nothing about a named person is held
in the credential itself, by construction: it is a system account.

**Considered and not taken.** *A person's own ArcGIS login as the app's
credential* — it dies with their password and their departure, which alone
disqualifies it for anything that runs unattended; the research pass also
read Esri's terms as forbidding it for showing private layers to others
(context, not the ground of this rejection — reworded in review, 2026-09-06,
so the rejection stands on reasoning a reader can check). *One platform-wide
integration account* — the shared service account every incident traces to.
*Building connections locally against a file of keys* — the owner deferred it
to deployment on being told what it would mean. *Owner approval for read
connections too* — declined as friction with no wall benefit: a read lands on
the connecting organisation's own stamp.
