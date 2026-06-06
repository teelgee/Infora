# ADR-0003 - Acceptance coding: two levels, configurable per project, lead reviewer authoritative

**Status:** Accepted.

**Context:** A deliverable is reviewed by several reviewers and accepted or rejected by the client against a specific version. Verdicts are expressed as codes, and different projects use different classification schemes. A verdict is needed both on each comment and on the whole deliverable, and someone must own the deliverable verdict.

**Decision:** Acceptance codes live at two levels. Reviewers set a code on each comment; the lead reviewer sets one authoritative code for the deliverable. The system suggests the deliverable code from the comment codes, and the lead reviewer confirms or overrides it. The classification scheme is configurable per project: Infora ships a default scheme and a project may replace it. Whether a code blocks acceptance is a property of that code in the project's scheme, not hard-wired.

**Consequences:** "Acceptance code" is the single canonical term for a review verdict, replacing the loose "decision" on Comment. Readiness logic is driven by the project's scheme. The DRR must attribute every comment, response and code to a specific version. Builds on ADR-0002; client acceptance of a version closes the work item, per the work-item lifecycle.
