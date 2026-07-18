# Competitive Friction Map: Building an AI-Native DMS to Beat ProjectWise & AssetWise (ALIM)

*Founder strategy brief — synthesized from Bentley's official documentation and TYLin's real-world ProjectWise deployment site.*

---

## Sources reviewed

1. **ProjectWise Explorer Help (v13)** — Bentley official docs (all top-level sections + sub-topics).
   `docs.bentley.com/.../ProjectWise Explorer Help-v13`
2. **AssetWise Implementation Guide (v7)** — Bentley official docs (ALIM concepts, admin model, ProjectWise integration chapter).
   `docs.bentley.com/.../AssetWise Implementation Guide-v7`
3. **TYLin ProjectWise portal** — a live engineering firm's install/training/support site (real-world usage, © 2026).
   `pw.tylin.com` — Home, Software, Training (~30 how-tos + EN/ES videos), Support.

> **Why the TYLin site matters:** every article on it exists because something in ProjectWise is confusing, fragile, or manual enough that a firm had to document a workaround. It is effectively a map of where the incumbent hurts.

---

## Part 1 — Core concepts worth keeping (proven primitives)

These are sound ideas the incumbents got right. Adopt, don't reinvent.

| Concept | What it does | Keep because |
|---|---|---|
| File / metadata separation | A "document" is a DB metadata record; the file lives separately | Enables search, governance, placeholders, versioning |
| Project-scoped workspaces (Work Areas) | Container carrying its own rules, participants, searches, config | Context travels with the project, not just files |
| Versions as immutable snapshots | Read-only history; active version is editable; relationships preserved across versions | Integrity + auditability |
| References / logical sets + Dependency Viewer | Tracks and visualizes how documents link (CAD masters/refs) | Relationships are as valuable as documents |
| Component extraction | Pulls business objects (equipment, walls) out of files into an index | Early "content intelligence" — ripe for AI |
| Audit trails | Username + timestamp on actions | Compliance backbone (but has gaps — see below) |
| State-based workflows + rules engine | Documents move through states; rules can chain actions | Low-code automation seam — ideal for agents |
| Governed class/attribute model (ALIM) | Classes, templates, scopes, retention, calculated masks, snapshots | Strongest data-model idea across both products |
| Deep authoring-tool integration | MicroStation, AutoCAD, Civil 3D, Revit, Office | Meets engineers where they work |

---

## Part 2 — The Friction Map (pain point → AI-native solution)

**Impact:** how much user/buyer pain it removes. **Effort:** rough build cost. Both High / Med / Low.

### A. Data safety & lifecycle

| # | Pain point (source) | AI-native solution | Impact | Effort |
|---|---|---|---|---|
| A1 | **Deletion is permanent; recovery is an 11-field helpdesk ticket** requiring users to dig Storage Area / Folder ID out of the audit trail, verify with the last known user, then wait for a human to restore from backup (TYLin: Recovery) | Soft-delete + recycle bin + point-in-time restore + one-click self-service undo | High | Med |
| A2 | **Local "working directory" is a footgun** — repeated ALL-CAPS warnings never to touch it; corrupts sync; balloons on big projects; moving it is a manual purge-and-recache ritual (TYLin: Client Access, Free Space, Move Working Dir) | Cloud-native virtualized/streaming file layer — no user-visible local cache to corrupt | High | High |
| A3 | **Power/internet loss = manual check-in dance**, unsaved work lost (TYLin: Lose Power/Connection) | Continuous autosave + offline-tolerant sync with automatic conflict-safe reconciliation | Med | Med |
| A4 | **Audit trail has blind spots** — read-only "View" leaves no trace; must be manually configured to expose fields (TYLin: Basic Guide, Recovery) | Complete, immutable, always-on activity log incl. views; no configuration needed | Med | Low |

### B. Everyday usability

| # | Pain point (source) | AI-native solution | Impact | Effort |
|---|---|---|---|---|
| B1 | **"Select No Wizard" is a firm-wide reflex** in nearly every create/copy/version procedure — the product's own guided flow is pure friction | Zero-touch AI ingest: auto-classify, auto-name, auto-place, auto-version on drop | High | Med |
| B2 | **Basic ops need workarounds**: "Move To" greyed out for multi-select; no copy/paste; no overwrite (must delete-replace or bury in Advanced Properties) (TYLin: Move Multiple, Update from External) | Direct manipulation that just works: multi-move, drag, versioned overwrite as first-class actions | Med | Low |
| B3 | **UI is "just like Windows Explorer"** — power features (metadata, workflows, components) hidden behind a file-manager metaphor | Make the intelligent layer (semantic search, relationships, insights) the primary UI; folders optional | High | High |
| B4 | **"At a glance" info requires manually building custom Views** (pick/order columns per user) | AI surfaces the relevant attributes per context automatically | Med | Med |
| B5 | **Renditions can't make a multi-page PDF** — users told to buy Bluebeam instead (TYLin: Renditions) | Native, flexible rendition/publishing incl. combined sets | Low | Low |

### C. Collaboration & sharing

| # | Pain point (source) | AI-native solution | Impact | Effort |
|---|---|---|---|---|
| C1 | **Desktop ↔ web are two worlds** — you cannot share a link from Explorer to a Web/365 user; must reopen the web app to mint a link (TYLin: Document Links) | One unified product; every object has one stable, shareable identity across all surfaces | High | High |
| C2 | **Fragile links by default** — URL links break on move/rename; GUID-based URN links survive but are an off-by-default user setting (TYLin: Document Links) | Identity-stable links always (GUID-based), invisible to the user | Med | Low |
| C3 | **External collaborators gatekept** — account creation routed through PM/admin every time | Self-service, permission-scoped external invites (admin sets policy, not each account) | Med | Med |

### D. Administration & infrastructure

| # | Pain point (source) | AI-native solution | Impact | Effort |
|---|---|---|---|---|
| D1 | **Everything routes through admin/helpdesk** — rendition profiles, scheduled prints, licensing keys, recovery, folder templates | Automate/self-serve; AI recommends config instead of requiring an admin | High | Med |
| D2 | **Rigid "Template Project" folder cloning** for consistency | AI auto-organizes by understanding content; structure adapts per project | Med | High |
| D3 | **Manual attribute mapping** between ProjectWise & AssetWise on sync (ALIM integration chapter) | Auto-map + auto-tag on ingest with LLM/extraction | High | Med |
| D4 | **Two heavyweight systems + bespoke connector** to move project docs (ProjectWise) into asset records (AssetWise) — Sync Service, Queue Engine, Storage Service, 3 install topologies | Single lifecycle-aware store: "project doc" and "asset record" are states of one object — connector disappears | High | High |
| D5 | **Legacy desktop plumbing** — single TCP port 5800, socket analyzer for firewall debugging, per-year CAD/Office integration modules, add-in re-enable procedures (TYLin: Firewall, Office Integration, Software) | Browser-first, resilient, standard HTTPS; no port/firewall/module matrix | Med | High |

### E. Content intelligence (the core AI wedge)

| # | Pain point (source) | AI-native solution | Impact | Effort |
|---|---|---|---|---|
| E1 | **Component/object extraction needs pre-configured processor jobs** (both products) | Automatic, continuously-improving structured extraction (equipment, quantities, clauses, refs) | High | High |
| E2 | **Full-text search is second-class** — a limited Quick Search mode; no wildcards; sits beside (not above) property search | Semantic + retrieval-augmented answers with citations back to the source object | High | Med |
| E3 | **Metadata tagging is manual** — the whole model depends on humans tagging + admins mapping | Auto-classify/tag/map at ingest; humans confirm exceptions only | High | Med |
| E4 | **Relationships found via manual "Scan for References"** | Auto-discover the document graph semantically (incl. across formats & text↔drawing) | Med | High |
| E5 | **Workflow rules are deterministic** ("on Revise, do X then Y") | Agentic workflows: route, QA against standards, flag missing docs, draft state-change summaries — with human approval gate | High | High |
| E6 | **Governance is manual** — retention (calculated masks), Final/read-only, records mgmt all set by hand (ALIM) | AI recommends retention classes, flags PII/sensitive content, enforces policy automatically | Med | Med |

---

## Part 3 — Strategic priorities (where to start)

**Quick wins (high impact, low/med effort) — build first:**
- A1 safe deletion + self-service recovery
- A4 complete always-on audit
- B1 zero-touch AI ingest (kills the "No Wizard" ritual)
- B2 basic operations that just work
- C2 stable identity-based links by default
- E2 semantic search as the front door
- E3 auto-tagging on ingest

**Category-defining bets (high impact, high effort) — the moat:**
- C1 / D4 one unified lifecycle store (collapse ProjectWise + AssetWise + the connector)
- B3 intelligent layer as the primary UI
- E1 / E5 automatic extraction + agentic workflows

**Guiding principle:** ProjectWise's *concepts* are sound; its *operational fragility and manual overhead* are the wound. Win by making today's helpdesk tickets and how-to articles into things the system simply does — safe data lifecycle, invisible file handling, AI-driven ingest/organization, stable relationships, and a resilient cloud-native core.

---

*Prepared from public vendor documentation and a customer's public deployment portal. Content is paraphrased and analytical, not reproduced from source material.*
