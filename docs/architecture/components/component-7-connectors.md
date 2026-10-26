# Connectors (component 7)

Connectors integrate external systems with Infora — bringing data in by reference, or handing an approved record out. Two families live here, both deferred relative to the wedge but recorded so their boundaries stay clear and they are not accidentally pulled forward:

- **Incumbent document management systems.** For the *integrate* record configuration, where Infora owns the sandbox, review and assurance but transmits the approved deliverable to a system the client already runs (ProjectWise and similar). This is the physical-handover side of transmittal, deferred until a specific target system is known (ADR-0001, ADR-0010).
- **Spatial and model data — GIS, CAD, BIM.** A different beast from written documents: accessed *by reference*, not generated and reviewed through the controlled-document lifecycle that document management (component 5) owns. Candidate targets are Bentley (iModels / ProjectWise), Esri and similar; the likely posture is read-only reference.

A **connector** is an integration to an external system. The component is **not yet grilled**. Open: which products come first, read-only reference versus deeper integration, how spatial data enters context and links to documents (the "add spatial location" idea), the integrate-config handover format, and confirming timing and priority relative to the wedge. Open questions are tracked in the grill doc.

**The first ruled object — the connection** *(2026-09-06 → [ADR-0057](../adr/0057-connections-and-stored-credentials.md))*. A **connection** is a link from Infora to an outside system — an ArcGIS enterprise account, a database — that an **app** ([ADR-0056](../adr/0056-the-app-model.md)) borrows. It is owned by the organisation that owns that system and set up once by a person who may already reach it, with a dedicated integration credential rather than anyone's login; its key is written once into the deployment's secrets store and never read back; it **declares its reach** (named layers, tables or endpoints; read or write) and an app can use no more; outward calls are denied except to that reach, audited every time, and fail closed outside the deployment tier's permitted reach; a **writing** connection is a separate kind whose loan into a project needs the project owner's audited approval. Data a read connection brings in lands in an app table stamped with the connecting organisation — the ArcGIS pattern being a nightly snapshot under the integration account, with people who need the live layer signing into ArcGIS as themselves. **Built after the pilot deployment**, which supplies the secrets store; drawn in [data-model.md](../../build/data-model.md) drawer 9. It is a narrower thing than the connectors above: it brings rows into an app, not documents into the record. *(Re-read against the build, 2026-10-26, T-447: nothing in this paragraph is built, as ruled — no secrets store exists, so no connection does. One neighbouring door is built and is not a connection: an app table can be fed from a spreadsheet the project already holds ([ADR-0059](../adr/0059-the-file-source.md)), reading a file the viewer could open with no credential and no outside call.)*

---

## Sub-component register

The structural breakdown of the connectors component into its build-able parts. Five artefacts divide the labour and this register is one of them: `CONTEXT.md` is the **language** (the glossary); the [overview](../infora-overview.md) is the **vision** and whole-system map; this component doc is the **structure** (the prose above and the register here); `docs/adr/` holds the **decisions** (why each fork went the way it did); and the [grill tracker](../../grill-sessions/grill-questions.md) is the **process log and open-questions backlog**. The register references the others rather than restating them.

The cut is by **domain capability**. The component is deferred and largely ungrilled, so the register names the parts at the level the deferral allows.

**Cross-cutting, true of every capability below.** External systems are integrated by reference or handover, not stored and versioned here; the controlled-document lifecycle belongs to document management (component 5). Access is resolved by the access model (component 2); every connector call writes to the audit trail under the governance envelope (component 3).

---

## 1. Incumbent-DMS connectors (integrate-config handover)

**Responsibility.** Transmit an approved deliverable from Infora to an incumbent document management system in the integrate record configuration; map metadata and renditions to the target's expectations.
**Governing ADRs.** 0001, 0010 (handover deferred until a target is known).
**Terms owned.** None uniquely; the connector case of Transmittal (document management, component 5).
**Depends on.** Document management (component 5) for the approved deliverable and transmittal event; the `data` package's connector framework; the access model (component 2).

## 2. Spatial / model connectors

**Responsibility.** Integrate to external spatial and model systems (Bentley iModels / ProjectWise, Esri, others) by reference; decide which products come first and how deep the integration goes.
**Governing ADRs.** **Open / deferred.**
**Terms owned.** Connector (shared with Foundation, component 1; here the spatial case).
**Depends on.** The `data` package's connector framework; the access model (component 2).

## 3. Spatial-to-context and spatial-to-document linking

**Responsibility.** Decide how spatial data enters context and is linked to documents (the "add spatial location" idea); keep it referenceable without entering the grounded corpus the way a written deliverable does.
**Governing ADRs.** **Open / deferred.**
**Terms owned.** None uniquely.
**Depends on.** Context (component 4); document management (component 5); confirmed timing relative to the wedge.

---

## Deferred or handed to other components

- **The whole component.** Deferred until the wedge is proven; timing and priority are themselves an open question.
- **The controlled-document lifecycle.** Owned by document management (component 5); this component references or hands over, it does not version.
- **Open questions** — products first, integration depth, context/document linking, the integrate-config handover format, timing — are tracked in the grill doc.

## Repository mapping

Connectors live in the `data` package alongside ingestion, surfaced through `contracts` to the apps when built. Nothing is built in the walking skeleton. See the build layer's repo-structure.
