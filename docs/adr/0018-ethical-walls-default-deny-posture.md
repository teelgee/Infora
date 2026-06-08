# ADR-0018 - Ethical walls are the standing posture, not an exception: organisations are isolated by default, two things are private even from the owner, and only the owner's sharing opens visibility

**Status:** Accepted. Refines ADR-0015 and ADR-0016.

**Context:** The glossary defined an ethical wall as "enforced isolation so members cannot see each other's private contributions," which is both vague and, after ADR-0007 and ADR-0014, wrong in detail, because an open review round shows comments across organisations. We also flipped the library to default-deny (ADR-0016). So the wall needs stating precisely: what is isolated, what is private even from the owner, and what overrides the isolation.

**Decision:** Isolation between organisations is the default, not a feature switched on. It has three parts.

A private floor, never shared, not even with the owner: an organisation's org context (precedents, custom workflows, private knowledge) and its private sandbox. These are the organisation's own, and no grant can expose them.

Default-deny project data: the library is default-deny per deliverable per organisation (ADR-0016); an organisation sees only its own deliverables and those the owner has shared with it. The deliverable plan and status, and shared sandboxes the organisation is in, are visible because they are shared, not because the wall is off.

The overrides, all deliberate and owner-driven: the owner shares a deliverable with an organisation; the owner adds an organisation to a shared sandbox; the owner appoints review access, and within an open review round comments are visible across the organisations in the review group (ADR-0014), the one place cross-organisation comment visibility is live. Nothing else crosses.

Because isolation is the default, competing organisations on one project need no special wall: they do not see each other's work unless the owner shares it.

**Consequences:** The wall is a standing guarantee rather than a configured state, which is the defensible posture for a multi-organisation platform. The owner is the single point that opens any cross-organisation visibility, so the audit of who-can-see-what reduces to the owner's sharing actions plus review appointments. The private floor sits outside even the owner's reach, which is what lets a consultant bring private IP to a project without risk. Supersedes the loose glossary line. Builds on ADR-0011, ADR-0014, ADR-0015 and ADR-0016.
