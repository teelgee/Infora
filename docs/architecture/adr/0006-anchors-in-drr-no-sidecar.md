# ADR-0006 - Comment anchors are structured fields on the DRR record; no annotation sidecar; XFDF only at the edges

**Status:** Accepted.

**Context:** PDF markup must be stored somewhere and bound to a version. ProjectWise stores markup in a separate XFDF sidecar file matched to the PDF by a hand-typed version string; if the strings do not match, markup loads empty with no warning, which orphans comments and fails silently. Infora's comments are already records in the DRR.

**Decision:** A comment's anchor is stored as structured fields on the DRR comment record: the version it belongs to, the page, the highlight coordinates or quad points (or the dropped point), and the selected text. The anchor is bound to the immutable version. No annotation sidecar file is a system of record; the DRR is the single store. XFDF is permitted only as an import or export format at the edges, if a desktop markup tool (Acrobat, Bluebeam) is supported later, and never as the store. Markup is a version-bound layer: highlights are rendered in the Infora viewer from the stored anchors and are never migrated onto a later version.

**Consequences:** One source of truth, the DRR, with nothing to match, orphan, or silently lose. Anchors are queryable, so AI triage and clustering can reason over location, which a sidecar blob cannot. Because versions are immutable (ADR-0002), stored coordinates stay valid permanently. On re-review, a comment stays pinned to its own version and is surfaced through its DRR row and the mandatory response link, with no stale highlight painted onto the new version. Builds on ADR-0002 (immutable versions) and ADR-0004 (PDF review).
