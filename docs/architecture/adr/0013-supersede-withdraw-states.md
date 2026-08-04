# ADR-0013 - Supersede and withdraw are owner-set states; the library keeps them but stops grounding on them

**Status:** Accepted. Refined by ADR-0032 (2026-07-18): the state set gains **rejected** — a deliverable whose cycle was closed-rejected and never resubmitted stays in the library as a record, badged, with its DRR attached, and never grounds (it also never had an accepted version). Same currency-by-state, nothing-deleted principle as below.

**Context:** Promoting a new version structurally supersedes the prior one. Separately, an owner needs to mark a document superseded or withdrawn while keeping it in the library as a record. ADR-0011 auto-admits accepted deliverables to the trusted corpus, so withdrawal needs a defined effect on grounding.

**Decision:** Supersede and withdraw are lifecycle states an owner sets on a document; the document remains in the project library and fully auditable. Library membership and groundability are distinct: a withdrawn or superseded document stays in the library but is removed from the trusted corpus the AI grounds on, so it no longer informs answers or drafting. Structural supersession by a newer version is automatic; owner-set supersede and withdraw are deliberate actions.

**Consequences:** Nothing is deleted; currency is expressed by state, not removal. The library is a superset of the grounded corpus. Refines ADR-0011. Sign-off needs no separate mechanism: the lead reviewer's acceptance (ADR-0003) is the sign-off, recorded in the audit trail, and consultant-side authorship lives on the document's own cover sheet, not in system state.
