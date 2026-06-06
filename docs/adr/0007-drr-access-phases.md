# ADR-0007 - DRR access follows the review cycle: appointed review group while open, consultant team after issue; comments live and cross-organisation within the active group

**Status:** Accepted.

**Context:** During an open round, reviewers may come from several organisations and need to see each other's comments. The consultant must not see comments form live, only receive them at close, and once received, the consultant organisation needs several of its own people working the responses. So DRR visibility is phased, not a single fixed group.

**Decision:** Access to a deliverable's DRR follows the cycle. While a round is open, the DRR is visible only to the appointed review group, the named reviewers and the lead reviewer; within that group all comments are live and visible to everyone as they are made, across organisations, with no per-organisation privacy. The consultant has no live visibility. When the lead reviewer closes and issues the DRR, access extends to the consultant organisation, where multiple appointed users can see and work it to prepare responses. The lead reviewer moderates and sets the authoritative deliverable code in the open. Comments are bound to the version and append-only once a version is issued (ADR-0002).

**Consequences:** Cross-organisation openness is contained within the active group at each phase, so the ethical-wall exception stays narrow. The consultant receives a moderated comment set at close, never a live feed. DRR access is an access-model concern with two scopes per deliverable: review group while open, consultant team after issue. The interface must make clear which phase a DRR is in and who can see it. Builds on ADR-0002 and the access model.
