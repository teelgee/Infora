# ADR-0001 - Two record configurations from one engine

**Status:** Accepted.

**Context:** Component 3 must serve projects and owners with no incumbent lifecycle and owners with an entrenched ProjectWise / AssetWise or other document management system stack (Network Rail). "Always the record" wins the first and loses the second; "always integrate" forfeits the margin and lock-in.

**Decision:** One engine, two configurations, chosen per project. Record configuration: Infora holds the published controlled record end to end. Integrate configuration: Infora owns sandbox, review and assurance, then transmits the approved deliverable to the incumbent. The configuration is a project setting, not a product fork.

**Consequences:** Transmittal-out is first-class. The data model splits controlled-record machinery from record authority. Integrate and record configurations share one controlled pipeline up to transmittal and diverge only at a pluggable publication target (self versus connector); integrate configuration forfeits only post-publication custody. Supersedes the earlier "Infora is always the controlled record" candidate ADR.
