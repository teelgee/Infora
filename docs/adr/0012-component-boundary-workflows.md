# ADR-0012 - Document management owns only the review cycle; other workflows and the launch bridge belong to component 4

**Status:** Accepted.

**Context:** The architecture doc gestures at "AI orchestrates tasks off documents," which invites pulling workflow definition and launching into this component. The review cycle, however, is intrinsic to document management, while general workflows are a separate concern.

**Decision:** This component owns the review cycle workflow and no other. How workflows are defined, composed, and launched (including any chat-initiated or object-initiated launch from a document, DRR, or query) belongs to the workflows component. The objects this component owns (deliverable versions, DRRs, library documents) are typed inputs that workflows in component 4 may consume, but the contract for that lives there, not here.

**Consequences:** The document-or-query-to-workflow bridge is deliberately out of scope for this component. The review cycle is the single workflow specified here (ADR-0005). Prevents this component from absorbing workflow concerns.
