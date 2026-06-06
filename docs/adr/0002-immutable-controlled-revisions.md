# ADR-0002 - Controlled revisions are immutable snapshots; one in flight per document

**Status:** Accepted.

**Context:** A sandbox working copy and the controlled document are different entities. Teams keep drafting while a revision is under review. The current world issues controlled revisions (v1, v2...) each with a DRN round-trip, and never runs two controlled revisions of one document in parallel.

**Decision:** Promotion snapshots the sandbox head into an immutable candidate controlled revision; metadata, naming and document coding are captured at the promotion gate. The sandbox head stays live and becomes the draft of the next revision. A rejected revision never reverts; its feedback routes back as records bound to that revision, and the team consciously reconciles it into the live sandbox head before promoting the next revision. Only one controlled revision may be in flight per document at a time for v1.

**Consequences:** No merge of competing controlled revisions and no record branching in v1. Comment-to-record records bind to a specific controlled revision, not to the document loosely, so they outlive the revision they were raised against. The interface must distinguish published, in-flight and working-head states. Parallel in-flight revisions (for example an errata fix during a major rewrite) are knowingly deferred.
