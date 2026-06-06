# ADR-0009 - One live DRR; transmittals freeze internal snapshots; no issued document

**Status:** Accepted.

**Context:** A transmittal in the old world carries a separate review-notice file, which makes the review record look like a document to be issued and versioned. Materialising that file would rebuild the static Excel notice and fragment the live web view that is the DRR's advantage. But the comments and responses do still need to be frozen as a formal record at each handover.

**Decision:** There is one artifact, the DRR, and it is live; users only ever interact with the live DRR. Nothing is issued as a separate document, and the term DRN is dropped. At each transmittal, when the lead reviewer sends comments to the consultant and when the consultant sends responses back, the system freezes a snapshot of the comments and responses as they stood and stores it as the formal record, retrievable if needed but never a surface users open or work in. Freezing is an internal event, not a file handover.

**Consequences:** The freezing requirement is met by system-held snapshots, version by version and direction by direction, with no document ever materialised. The interface never fragments into files. There is no paired container, no separate reference, and no independent version sequence for a review notice, because there is no second artifact. Reaffirms "the DRR is the record" and supersedes the idea of an issued DRN. Builds on ADR-0002 (immutable snapshots) and ADR-0003.
