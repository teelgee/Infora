# ADR-0052 - Per-reviewer completion is a round-scoped signal: a reviewer states their pass is done, withdrawable while the round is open, walled from the authoring side exactly like the open round's comments

**Status:** Accepted (owner-asked 2026-08-06, on the built status page: *"if I am a reviewer, this screen should also show whether a reviewer has completed their review."* The mechanics are Claude's, defended here). Refines **ADR-0005** (the round lifecycle) and rides **ADR-0014**'s visibility rule; builds with **T-353**. References **ADR-0033** (confirmed reviewers), **ADR-0050** (retention).

**Context:** *"Has each reviewer finished?"* has no answer in the model. Completion is not derivable from comments — a reviewer with nothing to say is *done*, not absent, and a reviewer who commented early may still be reading. The lead reviewer, deciding when to set the verdict and issue, is today coordinating that question over email. The review-cycle preflight discussion (Slice V1-S's weighing, 2026-08-02) already noted the review group's state as thin-but-real coordination residue; this is the first piece of it made storable.

**Decision:**

**1. A completion is a signal row, not a lifecycle state.** New table `review_completions`: round, participant, completed-at, one per pair. The round's state machine is untouched — the lead's issue stays the only thing that closes a round (ADR-0005), and no count of completions gates anything. The signal informs the lead's judgement; it never automates it.

**2. Marked by the reviewer, on an open round only.** A live **confirmed** reviewer marks their own completion; proposal confers nothing here as everywhere (ADR-0033). The act is legal only while the round is `open`, which freezes the set at issue for free — no trigger needed.

**3. Withdrawable while open.** A reviewer who resumes reading deletes their own signal. A changed mind during an open round is coordination, not history — the audit record of the round is its comments, codes and transmittals, not the flicker of a checkbox. Once the round issues, the set stands as it stood at issue.

**4. Walled like the open round's comments (ADR-0014).** Completion is reviewer-side state. While the round is open it is visible to the review group and the owner's read, and **withheld from the authoring side**; from issue onward it is plainly visible history. One rule, borrowed whole — the server applies it in the same place it already phases comments.

**Personal data:** a named Participant and a timestamp — review-cycle metadata, same class and retention as the acknowledgers row ([personal-data.md](../../build/personal-data.md), ADR-0050).

**Considered and not taken.** *Deriving completion from commenting activity* — wrong on both edges (silent-but-done, commented-but-reading). *A per-reviewer round state machine* — a second lifecycle to keep consistent with the first, bought for one boolean's worth of signal. *Blocking issue until all reviewers complete* — repeats the review-period-as-gate mistake ADR-0005 already rejected; the lead's judgement is the close, and a signal that gated would teach reviewers to game it.

**Cost:** one table, migration 0041 (hand-written per the standing rule, drawn in [data-model.md](../../build/data-model.md) drawer 5), two API acts, one field on the cycle read.
