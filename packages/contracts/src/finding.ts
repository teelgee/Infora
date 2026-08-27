// T-328 — the finding schema (ADR-0048), minted AHEAD of the checker DAG
// (T-310) and the marked-up edit (T-311) because neither can be specified
// without it.
//
// ADR-0048 §1: the checker's output is a list of structured records, not a
// paragraph of prose. Prose is what a chat turn returns; a finding is what a
// reviewer can sort, filter, assign and clear. The whole of this file exists to
// make that difference a type rather than a convention.
//
// FOUR OBLIGATIONS OF THE RULING ARE CARRIED IN THE SHAPE, not in comments
// asking implementers to remember them:
//
//   §7  three inputs, three honest treatments — `evidence` is a union on the
//       input, so a rulebook finding CANNOT carry a Citation and an attached
//       one cannot either. The dishonest object does not typecheck.
//   §5  a quoted rule is quotable-but-uncited — `RulebookEvidence` has a
//       `clause` and a `quote` and no citation anywhere in it.
//   §3  the checker may propose a fix and may never apply one — a proposed
//       revision is a `Suggestion`, so it enters the accept/edit/reject path
//       that already exists, is already audited and already produces Signals.
//   §2  anchoring is not optional — `anchor` is required, and at T-271's
//       locator grain rather than a second anchor type invented here.
//
// What is deliberately NOT here: any organisation id. Findings inherit the
// producing-organisation-private posture of the run record (§6, and the
// 2026-07-12 ruling), and that posture is enforced by the sandbox document the
// finding hangs off — which already knows whose it is. Copying the field onto
// the finding would create a second answer to "whose is this", and a wall with
// two answers is a wall with one bug.

import type { Locator } from './assembly';
import type { Citation, Id, Suggestion } from './shared';

/**
 * Which of the checker's three inputs a finding arose from (ADR-0048 §7).
 *
 * This is not a label for the surface: it DECIDES the citation treatment, and
 * that is why it discriminates `FindingEvidence` rather than sitting beside it.
 * The corpus grounds and cites; an attached document never grounds and is never
 * cited (ADR-0022); the rulebook is quoted verbatim and never cited (§5).
 */
export type FindingInput = 'corpus' | 'attached' | 'rulebook';

/**
 * Severity — **decided by this ticket**, which ADR-0048 left open deliberately
 * as a naming question rather than a design fork.
 *
 * **Two levels, and the argument for two is that a third has no work to do.**
 * The reviewer's triage question is single: *must this change before the draft
 * goes out, or may I reasonably decline it?* A middle level answers neither and
 * becomes the drawer everything ambiguous is filed in — at which point the
 * ordering it was added to provide is gone.
 *
 * **Neither word is a verdict**, which is the constraint that ruled out the
 * obvious sets. `critical / major / minor` grades the *document*, and a finding
 * states a defect and never a verdict (§3, component 6 §6's first answer
 * invariant). So the vocabulary describes what the reviewer must do about the
 * finding, not how bad the draft is.
 *
 * **`required` is not `blocking`,** and the near-miss matters: ADR-0049 §7
 * blocks promotion on an **open** finding of any severity, exactly as it does
 * on an open comment thread. Calling one level "blocking" would imply the other
 * is not, which is precisely the confusion §7 exists to prevent — the surface
 * must never explain why one list stops you and the other does not.
 *
 * **One vocabulary for everyone.** Per-organisation configurability is refused
 * until somebody asks for it: a severity that means something different at each
 * firm cannot be reasoned about by a checker that runs at all of them, and the
 * cost of adding a level later is far lower than the cost of removing one.
 */
export type FindingSeverity =
  /** the draft is wrong, unsupported, or contradicts something it is bound by */
  | 'required'
  /** worth the reviewer's judgement, and declining it is a legitimate answer */
  | 'advisory';

/**
 * The corpus grounds, so the evidence is a Citation and resolves to a locator
 * inside the source document, exactly as any other grounded claim does.
 */
export type CorpusEvidence = {
  input: 'corpus';
  /** at least one — a corpus finding with nothing behind it is an assertion */
  citations: Citation[];
};

/**
 * A manually attached document never grounds and is never cited (ADR-0022), so
 * the evidence names the working-set entry and quotes it — and there is
 * deliberately no `Citation` in this shape to reach for. The excerpt is what
 * makes the finding intelligible; it is not a citation and must not render as
 * one.
 */
export type AttachedEvidence = {
  input: 'attached';
  /** the `AttachedSource` this arose from, not a version id */
  attachedSourceId: Id;
  excerpt: string;
};

/**
 * The rulebook: **quotable but never cited** (ADR-0048 §5), and the shape that
 * makes the ruling implementable at the surface.
 *
 * `clause` is the load-bearing field and the reason T-308's loader must
 * preserve structure. A finding reads *"your Drafting Manual §4.2 says …"* — so
 * the rulebook has to be chunked such that **§4.2** is recoverable, not merely
 * "page 11". A rulebook chunked for steer alone would satisfy the guiding
 * channel and make this field unfillable, and the ruling would survive in the
 * model and die on the screen.
 *
 * `quote` is verbatim from the rulebook. It asserts nothing about the scheme —
 * it is an instruction to the author — which is exactly why quoting it does not
 * breach the guiding channel's bar on citing material as project fact.
 *
 * ⚠ **Org-private (§6).** A finding quoting Org B's manual must never appear on
 * a surface Org A reads. Leaking a competitor's drafting standards through a
 * review comment is an ethical-wall breach delivered by a feature nobody thinks
 * of as crossing the wall.
 */
export type RulebookEvidence = {
  input: 'rulebook';
  /** the clause as the rulebook itself numbers it, e.g. `§4.2` */
  clause: string;
  /** the rule, verbatim. Never a Citation, and must not render as a source chip */
  quote: string;
  /** the rulebook document this clause came from, for the org-privacy check */
  rulebookRef: string;
};

export type FindingEvidence = CorpusEvidence | AttachedEvidence | RulebookEvidence;

/**
 * Open or closed, and the vocabulary is **the sandbox comment's, deliberately**
 * (`SandboxComment.status`).
 *
 * ADR-0049 §7 blocks promotion on open findings and open threads *identically*,
 * so that the surface never has to explain why one list stops you and the other
 * does not. Two different words for the same state is how that explanation
 * starts being needed. The count promotion must run is therefore one shape over
 * both.
 */
export type FindingStatus = 'open' | 'closed';

/**
 * One finding: a defect in the draft, anchored, evidenced, and clearable.
 */
export type Finding = {
  id: Id;
  /** the run that produced it (ADR-0028) — a finding is always attributable */
  runId: Id;
  /**
   * the draft it is against. Also the org-privacy anchor (§6) and the grain
   * ADR-0049 §7's promotion count is taken at.
   */
  sandboxDocumentId: Id;
  /**
   * ADR-0048 §2 — REQUIRED. A finding that does not point into the text is a
   * report and not a tool, and the reviewer is left to locate the problem
   * themselves. It uses T-271's `Locator` rather than a second anchor type,
   * because the ADR says "the same locator grain the citation work
   * establishes" and because `Suggestion.anchor`'s advisory `{ quote }` is a
   * weaker thing built before offsets existed.
   *
   * The span is into the draft's own content; `page` is absent, a sandbox
   * document having no pagination to derive one from.
   */
  anchor: Locator;
  /**
   * What is wrong, stated as a **defect and never a verdict** (§3): *"this
   * paragraph asserts a 12% figure with no source in the library"*, never
   * *"this chapter is non-compliant"*. The system does not give an unqualified
   * professional opinion, and a checker is where that boundary is easiest to
   * cross by accident.
   */
  defect: string;
  severity: FindingSeverity;
  evidence: FindingEvidence;
  /**
   * ADR-0048 §3, the load-bearing constraint: a proposed fix is a
   * **`Suggestion`**, not free text. It therefore enters the accept/edit/reject
   * path the drafting side already uses, which is already audited, already
   * reversible and already produces Signals — so the checker acquires **no
   * write path the drafting side lacks**, and every change to a deliverable
   * stays a human act.
   *
   * Absent is the normal case: most findings are for a person to fix.
   *
   * ⚠ The surface obligation that travels with this field: collapsed by
   * default, and **never applied in bulk** (§3, and §3's per-mark rule restated
   * by T-311). Findings arriving with fixes attached and an "accept all" beside
   * them is how reviewers stop reading findings and start accepting patches,
   * while the human check the liability model depends on appears to be
   * performed.
   */
  proposedRevision?: Suggestion;
  status: FindingStatus;
  closedBy: { participantId: Id; name: string } | null;
  closedAt: string | null;
  createdAt: string;
};

export type ListFindingsResponse = { items: Finding[] };

/**
 * The count ADR-0048's consequences hand back to this schema: *"promotion must
 * be able to **count** open findings"* — a query obligation, not a display
 * concern (T-332).
 *
 * `open` is what gates. `bySeverity` is beside it and gates nothing: it is what
 * lets the block say *how much* is outstanding without implying that the
 * advisory ones are optional to clear.
 */
export type OpenFindingCount = {
  open: number;
  bySeverity: Record<FindingSeverity, number>;
};
