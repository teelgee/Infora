# ADR-0010 - Transmittal is an event record in record configuration; physical handover deferred to integrate

**Status:** Accepted.

**Context:** The old-world transmittal packages files between systems. Inside Infora, with a shared live DRR and the record held on-platform, no file needs to move for on-platform parties. But the transmittal's audit facts (who issued what, when, for what purpose, by when) are still load-bearing.

**Decision:** In record configuration a transmittal is an event record, not a package. It marks a deliverable version moving into its container and being issued for review to the client, and carries the audit facts: sender, recipients, version, purpose code, issue and due dates. It moves no file; it changes DRR access phase (ADR-0007), freezes the snapshot (ADR-0009), and notifies recipients. In integrate configuration a file does move to the incumbent, but its format and mechanics depend on the target system and are deferred (the first-class transmittal-out of ADR-0001 stands as the commitment).

**Consequences:** On-platform transmittal is a lightweight, auditable event rather than a file ceremony. The physical-package path is scoped out until a specific integration target is known. Builds on ADR-0001, ADR-0007 and ADR-0009.
