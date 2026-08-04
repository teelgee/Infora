# ADR-0012 - Document management owns only the review cycle; other workflows and the launch bridge belong to the Engine

**Status:** Accepted. **Revised 2026-06-27:** "component 4 / the workflows component" re-pointed to the **Engine**, which runs all workflows (standard and custom) after the features/components reframe. The boundary decision is unchanged — only the name of where general workflows live.

**Context:** The architecture doc gestures at "AI orchestrates tasks off documents," which invites pulling workflow definition and launching into this component. The review cycle, however, is intrinsic to document management, while general workflows are a separate concern.

**Decision:** This component owns the review cycle workflow and no other. How workflows are defined, composed, and launched (including any chat-initiated or object-initiated launch from a document, DRR, or query) belongs to the **Engine**, the component that runs workflows. The objects this component owns (deliverable versions, DRRs, library documents) are typed inputs that workflows running in the Engine may consume, but the contract for that lives there, not here.

**Consequences:** The document-or-query-to-workflow bridge is deliberately out of scope for this component. The review cycle is the single workflow specified here (ADR-0005). Prevents this component from absorbing workflow concerns.
