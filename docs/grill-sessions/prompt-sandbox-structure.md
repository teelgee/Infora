# Build prompt — the sandbox: real folder structure, super-user configuration, freeze, and versioning

Paste to the repo build agent (Claude Code, read/write on the Infora repo). This
session addresses owner-identified issues with the sandbox surface (Slice A2/A2.1,
ADR-0036). Some are straight builds; two need a short design decision first — make
it, record it, then build. Work ticket-by-ticket, each a verified commit
(typecheck + tests + e2e green), the way Slice A2 landed. Two items (super-user
settings; the freeze + version conventions) are ADR candidates — offer an ADR only
if the decision is hard to reverse, surprising, and a real trade-off.

---

## Read first

- CONTEXT.md (Sandbox, Freeze, Ambient version history, Promote, Working document,
  Version reference, Rendition).
- ADR-0036 (sandbox participant-scope + folders), ADR-0032 (review cycle,
  freeze/check-out, the P-rev/C-rev convention), ADR-0034 (canonical format,
  renditions).
- The build: the sandbox drawer surface `apps/web/src/screens/sandbox.tsx`
  (T-157/158); the folders + move API in `apps/api/src/sandboxes.ts` and the schema
  `packages/db/src/schema/drawer2-documents.ts` (`sandbox_folders.parent_folder_id`,
  `sandbox_documents.folder_id`, `sandbox_document_versions`); the freeze/promote
  endpoints in `apps/api/src/cycle.ts` and `sandbox_documents.head_locked`.
- The classes-of-user model (T-176 — `userClass`, `canEditPlan`, in
  `packages/governance/src/access.ts`) and the elevated tier (T-174,
  `participants.elevated`) — the super-user work builds on these.
- The Slice A2 / A2.1 / A2.2 / A2.3 blocks in `docs/build/plan.md`, and
  `docs/design/design-rules.md` (no window.prompt, no emoji-icons, real Lucide
  icons, elevation-4 modals/drawers, the Modal/Drawer/Combobox/Field primitives).

## The issues, in order

1. **Folders and documents render flat — they must nest (SharePoint-shaped).** A UI
   rebuild: an expand/collapse folder tree with documents nested under their folder,
   a current-folder view/breadcrumb, and drag-and-drop move (the move endpoints
   already exist). Keep the per-document actions on each row within its folder.

2. **"Create folder structure" — a super-user builds a whole tree at once.** A
   free-form nested-folder builder is the MVP; reusable folder templates are a
   possible richer version — build the builder first, flag templates as follow-up.
   Gate creation on the class model.

3. **The sandbox must be configurable — a super-user settings interface.** A
   super-user turns on/off whether ordinary users may create folders. Decide
   per-sandbox vs per-project and who owns it, reconciled with T-176's
   owner-super/guest-super split and T-133's super-user tier. Likely ADR.

4. **Freeze is broken — build it properly.** Freeze must actually check out the
   document — lock the head so it can't be edited (the content path refuses while
   locked; the editor goes read-only) — with an audited release/unlock path.
   Reconcile the standalone freeze lock and the review-round lock. Refines ADR-0032.

5. **Versioning — a real version scheme (ISO 19650).** Working versions run
   v0.1, 0.2, 0.3…; on promotion a version becomes a P or C revision (P =
   preliminary, C = contractual). Assign and display these on the ambient history,
   the frozen Version, and the promoted container. Refines ADR-0032/0034; likely ADR.

## Owner rulings (2026-07-25, at the start of the session)

- **Versioning (issue 5):** v0.x whilst in the sandbox; **only on promotion** does a
  version become P/C. **P01** is the first version subject to a formal review cycle
  or promoted without review; **C0x** on client acceptance (contractual).
- **Settings (issue 3):** **per-sandbox** `allow_member_folder_create`, owned by the
  sandbox's **owning-org super-user** (guest-super for its own sandboxes; owner-super
  override).
- **Freeze (issue 4):** standalone Freeze **locks the head** (manual check-out), no
  round required; the content path refuses while locked; audited release by
  lead/elevated; internal-cycle initiation still auto-freezes+locks (same
  `head_locked` mechanism). **Any doc type** (docx/pptx/xlsx/uploaded) — the lock is
  on the document and refuses every mutation path, not just the text editor.

## Likely tickets / ADR candidates

- Sandbox folder-tree UI (build; issue 1) — **T-179**.
- Freeze / check-out lock (investigate → fix; issue 4) — ADR-0032 addendum candidate.
- Super-user project settings (design → ADR? → build; issue 3) — ADR candidate.
- Create-folder-structure (build; issue 2) — templates flagged as a follow-up.
- Sandbox version numbering + ISO 19650 P/C scheme (design → ADR → build; issue 5).

One ticket per verified commit; "no window.prompt, no emoji-icons" as standing
acceptance tests.
