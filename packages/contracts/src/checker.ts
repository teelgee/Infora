// T-310 — THE CHECK FAMILIES AND THEIR GRAIN (ADR-0053 §2).
//
// *In plain terms: the QA checker does not do one thing. It does five, and they
// are different enough that they cannot be run the same way — one reads a
// section against the writing rules, one reads a section against the project
// record, one reads the whole document at once looking for it contradicting
// itself, and two are arithmetic that involves no AI at all. This file is that
// list, in the words a user picks from.*
//
// **The unit of work is a property of each check, not of the run**, and that is
// the finding that retired the design this ADR opened with. `Q-031` asked
// whether the sweep runs per section, per chunk, or with whole-document
// context, as though one answer served: a style check needs one section, a
// readability score is arithmetic over a section and then the document, and
// self-contradiction needs the whole thing at once. So `grain` is declared per
// family here rather than chosen per run there.
//
// 🔒 **`execution` IS FIXED AT DESIGN TIME AND IS NEVER A RUNTIME JUDGEMENT**
// (ADR-0027). Two of the five are code — readability is arithmetic, and
// completeness is a template comparison and a placeholder search — and a
// checker described as "N model calls" was describing half of itself. The
// executor reads this declaration; it never decides.
//
// This lives in `contracts` rather than beside the implementations because the
// **launcher renders it** (T-336) and a surface sees `contracts` and `ui`
// alone. A family the launcher could not name is a family nobody can switch
// off, and ADR-0053 §2 makes every one of them switchable.

/**
 * The five, in the order a plan runs them.
 *
 * ⚠ **ADR-0053 §2's prose says "six" and its own table lists five**, which is a
 * counting slip in the record rather than a missing family: the table, and
 * T-310's board entry, enumerate the same five and give each the same grain,
 * and §3 makes the **two style sources one call** — *"on conflict the project
 * style guide wins and firm know-how fills in where the project is silent"* is
 * a precedence a single reader has to apply, so splitting them into two
 * families would leave nothing able to resolve the conflict. Built as the table
 * specifies and recorded here rather than silently reconciled.
 */
export const CHECK_FAMILIES = [
  'style',
  'corpus_accuracy',
  'self_contradiction',
  'readability',
  'completeness',
] as const;
export type CheckFamily = (typeof CHECK_FAMILIES)[number];

/** What one call of this family holds — ADR-0053 §2's middle column. */
export type CheckGrain =
  /** one section of the draft, plus whatever that family reads it against */
  | 'section'
  /** the section summaries, once — self-contradiction's whole-document view */
  | 'summaries'
  /** the whole draft, in code */
  | 'document';

/** Whether a family spends anything. Fixed per capability at design time. */
export type CheckExecution = 'model' | 'code';

export type CheckFamilyDescriptor = {
  family: CheckFamily;
  /** what a consultant would call it */
  label: string;
  /** what it looks for, in the words the launcher shows */
  description: string;
  grain: CheckGrain;
  execution: CheckExecution;
};

export const CHECK_FAMILY_CATALOGUE: readonly CheckFamilyDescriptor[] = [
  {
    family: 'style',
    label: 'House style',
    description:
      'Reads each section against the project style guide and your firm’s own rules, and quotes the clause it is enforcing. Where the two disagree, the project’s guide wins and your firm’s fills the gaps.',
    grain: 'section',
    execution: 'model',
  },
  {
    family: 'corpus_accuracy',
    // T-415 (owner, 2026-09-01) — the on-screen name is **Accuracy**. The
    // longer *"Accuracy against the record"* was the family's whole job
    // written into its label, which left no room for the options that now
    // unfold under it — the scope it checks against, and how hard it looks —
    // to say the same thing better. The `description` below still names the
    // record, so nothing about what it does is lost.
    label: 'Accuracy',
    description:
      'Reads each section against what the project library actually says, and cites the passage behind every finding. Where the library is silent it says nothing rather than guessing.',
    grain: 'section',
    execution: 'model',
  },
  {
    family: 'self_contradiction',
    label: 'Internal consistency',
    description:
      'Compares what each section asserts against what the others do, so a figure that changes between chapters is caught. One pass over the whole draft.',
    grain: 'summaries',
    execution: 'model',
  },
  {
    family: 'readability',
    label: 'Readability',
    description:
      'Scores each section against the project’s reading-age target and flags the ones well outside it. Arithmetic, not AI — and never a pass or a fail.',
    grain: 'document',
    execution: 'code',
  },
  {
    family: 'completeness',
    label: 'Completeness',
    description:
      'Looks for sections the template expects and the draft does not have, and for placeholder text left behind. Arithmetic, not AI.',
    grain: 'document',
    execution: 'code',
  },
];

/**
 * How hard the corpus check looks (ADR-0053 §2).
 *
 * `quick` searches the library once per section, which catches a section whose
 * main topic the record contradicts. `full` extracts the section's checkable
 * assertions and searches for **each one**, which is what catches a buried
 * figure rather than only the section's subject.
 *
 * **Full is the default**, and the argument is about which way a wrong default
 * fails: a too-cheap one fails **invisibly** — findings that never appear — and
 * a too-expensive one fails **visibly**, in that it took longer and cost more.
 * A system should prefer the failure its user can see.
 */
export type CorpusDepth = 'quick' | 'full';
export const DEFAULT_CORPUS_DEPTH: CorpusDepth = 'full';

/**
 * The project's readability target, as a US-grade reading level.
 *
 * 🔒 **A target, never a threshold, and the difference is ADR-0048 §3.**
 * Flesch–Kincaid scores technical infrastructure prose badly by construction —
 * "groundwater vulnerability" is four syllables of ordinary domain vocabulary —
 * so a pass/fail on it would be a verdict the system is not entitled to give.
 * Every readability finding is `advisory` and states the score, the target and
 * the document's own median beside it, so a reader can see whether a section is
 * an outlier or whether the whole draft simply reads that way.
 */
export const DEFAULT_READABILITY_TARGET = 14;

// ── T-336 — THE LAUNCHER'S TWO PRESETS ──────────────────────────────────────
//
// *In plain terms: one switch with two positions, which sets everything at
// once. "Full check" reads every section against every rule and looks the
// project record up statement by statement. "Quick check" does less of the last
// part. You can still change any individual setting after picking one.*
//
// *(T-421, 2026-09-01: the launcher used to draw these as two buttons. The
// values below did not change — only the drawing, to one segmented control,
// because the two are mutually exclusive and a pair of buttons reads as two
// separate actions.)*
//
// **They set the families and the depth TOGETHER**, which is why they are one
// object rather than two switches: the honest choice a user is making is *how
// hard should this look*, and a preset that set the depth but left the families
// alone would answer half of it.
//
// 🔒 **FULL IS THE DEFAULT** (ADR-0053 §2), and the argument is about which way
// a wrong default fails. A too-cheap default fails **invisibly** — findings that
// never appear, under a clean result — and a too-expensive one fails **visibly**:
// it took longer and it cost more. A system should prefer the failure its user
// can see.
export type CheckPreset = {
  id: 'full' | 'quick';
  label: string;
  description: string;
  families: readonly CheckFamily[];
  depth: CorpusDepth;
};

export const CHECK_PRESETS: readonly CheckPreset[] = [
  {
    id: 'full',
    label: 'Full check',
    description:
      'Every check, and the project record looked up for each checkable statement rather than once per section. Slower and more expensive — and it is what catches a wrong figure buried in a paragraph about something else.',
    families: CHECK_FAMILIES,
    depth: 'full',
  },
  {
    id: 'quick',
    label: 'Quick check',
    description:
      'Every check, but the project record is searched once per section rather than statement by statement. Faster, and it will miss a figure the section is not mainly about.',
    families: CHECK_FAMILIES,
    depth: 'quick',
  },
];

/** The preset a launcher opens on. Never `quick`; see the lock above. */
export const DEFAULT_CHECK_PRESET = 'full';

/**
 * How a run reaches the project record (ADR-0053 §3), and **the two are named
 * differently on screen because they are two guarantees.**
 *
 * `library` — the default is the **whole access-resolved library**, narrowable
 * to named documents by a picker. Findings from it **cite normally**, resolve
 * to a locator and carry currency.
 *
 * `attached` — a document the user uploads or pins from their own sandbox
 * (ADR-0022's working set). It **never grounds and is never cited**; the
 * evidence is an excerpt.
 *
 * ⚠ Attaching a *library* document silently yields the strictly worse result —
 * no citation, no locator, no currency — so the copy has to say which you get.
 * A user choosing "select a document to check against" would otherwise have no
 * way to know they took the weak path.
 */
export type CheckAgainst = 'library' | 'attached';
