// T-281 — the shared core, and the guard that keeps a Lens file from weakening
// it (docs/build/plan.md, Wave 4 design reference §1).
//
// Every Lens inherits these seven rules. A Lens file cannot override, weaken or
// opt out of any of them: `prohibitions` are ADDITIVE to the core, never
// subtractive. That is the sentence AUTHORING.md makes to a domain expert, and
// this file is what makes it true rather than aspirational.
//
// ── The honest limit of this guard, stated rather than discovered later ──────
// Detecting "this sentence attempts to negate that rule" is a semantic
// judgement, and a regex is not one. This matcher is therefore DELIBERATELY
// NARROW: it catches the shape a weakening prohibition actually takes — the
// suppression of a required disclosure ("never cite", "do not flag superseded",
// "no need to mark inferences") — and it does not pretend to catch a
// sufficiently indirect attempt. Two consequences, both accepted:
//
//   1. It can be evaded by someone determined to evade it. The backstop is that
//      Lens definitions are versioned domain content with an owner and a review
//      process, exactly like the workflow definitions; this guard is the thing
//      that catches the honest mistake, not the adversary.
//   2. It must not fire on a legitimate prohibition, because a false positive
//      lands on a domain expert who did nothing wrong and teaches them the
//      validator is noise. The five shipped definitions carry twenty-five real
//      prohibitions between them and `definitions.test.ts` asserts every one of
//      them loads clean — that test is the false-positive regression guard.
//
// Matching is bounded to a SENTENCE (`[^.]`), never the whole entry, because a
// prohibition routinely says "never X. Do Y instead", and the Y half names the
// very obligations these patterns look for — "Never silently reconcile
// conflicting figures across documents. Report both, with both locators" would
// match a whole-entry provenance pattern and is impeccable.

export type CoreRule = {
  id: string;
  /** What the rule requires, in the words a validation message will use. */
  summary: string;
  /** Sentence shapes that attempt to remove the obligation. */
  negation: RegExp[];
};

// The suppression openers: every weakening move is "stop doing the thing the
// core requires", and in English that is one of these.
const SUPPRESS = String.raw`(?:never|do not|don'?t|avoid|omit|skip|suppress|hide|no need to|need not|there is no need to)`;

export const CORE_RULES: readonly CoreRule[] = [
  {
    id: 'provenance',
    summary:
      'every claim carries a citation to document, version and either a locator or the verbatim passage',
    negation: [
      new RegExp(
        String.raw`\b${SUPPRESS}\b[^.]{0,60}\b(?:cite|cites|citing|citation|citations|provenance|locators?)\b`,
        'i',
      ),
      // A GRANT of permission to skip the citation, not a mention of one. The
      // bare form (/without a locator/) was tried and removed: it fired on
      // engineer.yaml's "a tolerance with no locator is not usable by this
      // reader", which REQUIRES the locator. A false positive here lands on a
      // domain expert who wrote a good prohibition.
      /\b(?:may|can|it is (?:fine|acceptable|ok) to)\b[^.]{0,40}\b(?:without (?:a )?(?:citation|source|locator)|without citing|with no citation)\b/i,
      /\b(?:no|without a)\s+citation\s+is\s+(?:needed|required|necessary)\b/i,
      /\bclaims?\s+(?:need|needs|do)\s+not\s+(?:need\s+)?(?:to\s+be\s+)?(?:be\s+)?(?:cited|sourced)\b/i,
    ],
  },
  {
    id: 'registers',
    summary:
      'Record, Inference, Authority and External are always distinguished — an inference is marked as one, with the record it rests on cited',
    negation: [
      new RegExp(
        String.raw`\b${SUPPRESS}\b[^.]{0,60}\b(?:distinguish|separate|mark|marking|label|labelling|labeling|flag|flagging)\b[^.]{0,40}\b(?:inference|inferences|inferred|register|registers|record from)\b`,
        'i',
      ),
      new RegExp(
        String.raw`\b${SUPPRESS}\b[^.]{0,40}\b(?:distinguish|separate)\b[^.]{0,40}\b(?:what the document says|what infora concludes|record and inference)\b`,
        'i',
      ),
      /\bpresent (?:an? )?inferences? as (?:a )?(?:fact|record|established)\b/i,
    ],
  },
  {
    id: 'no-opinion',
    summary:
      'the system never gives an unqualified professional opinion — it presents the test, the evidence before it, and the precedent',
    negation: [
      /\b(?:you may|it is acceptable to|it is fine to|feel free to|where asked,?\s*(?:give|offer|state|provide|express))\b[^.]{0,60}\b(?:professional opinion|legal opinion|unqualified opinion|opinion on whether|view on whether|state whether[^.]{0,20}compliant|legally sound)\b/i,
      new RegExp(
        String.raw`\b${SUPPRESS}\b[^.]{0,40}\b(?:qualify|qualifying|caveat|caveats)\b`,
        'i',
      ),
      /\balways answer definitively\b/i,
    ],
  },
  {
    id: 'staleness',
    summary:
      'an answer resting on a revised instrument says so and names the version it relied on',
    negation: [
      new RegExp(
        String.raw`\b${SUPPRESS}\b[^.]{0,60}\b(?:name|naming|state|stating|give|report|mention)\b[^.]{0,40}\b(?:version relied|in-force version|which version|the version it|instrument version)\b`,
        'i',
      ),
      new RegExp(
        String.raw`\b${SUPPRESS}\b[^.]{0,50}\b(?:flag|report|mention|note)\b[^.]{0,40}\b(?:out of date|out-of-date|revised|revision|no longer in force)\b`,
        'i',
      ),
    ],
  },
  {
    id: 'absence',
    summary:
      'what is missing is actively reported — the unaddressed chapter, the open commitment, the consultee who never responded',
    negation: [
      new RegExp(
        String.raw`\b${SUPPRESS}\b[^.]{0,60}\b(?:report|reporting|raise|surface|mention|note|flag|volunteer)\b[^.]{0,50}\b(?:missing|absent|absence|gaps?|unaddressed|what is not|unanswered)\b`,
        'i',
      ),
      /\banswer only what (?:is|was) asked\b[^.]{0,40}\b(?:gaps?|missing|absence)\b/i,
    ],
  },
  {
    id: 'uncertainty',
    summary:
      'uncertainty is honest — not every sentence hedged into mush, and never a weak inference dressed as a finding',
    negation: [
      new RegExp(
        String.raw`\b${SUPPRESS}\b[^.]{0,50}\b(?:express|state|acknowledge|admit|report|show)\b[^.]{0,40}\b(?:uncertainty|doubt|low confidence)\b`,
        'i',
      ),
      /\bpresent (?:a )?(?:weak|thin|uncertain) (?:inference|conclusion)s? as (?:a )?finding/i,
    ],
  },
  {
    id: 'version-discipline',
    summary:
      'a superseded document is never relied on without a flag at the point of use, not in a footnote',
    negation: [
      new RegExp(
        String.raw`\b${SUPPRESS}\b[^.]{0,60}\b(?:flag|flagging|mark|marking|mention|report|note|state)\b[^.]{0,40}\b(?:superseded|supersession)\b`,
        'i',
      ),
      /\bsuperseded[^.]{0,40}\b(?:need not|does not need to|do not need to)\b[^.]{0,20}\b(?:be flagged|be marked|be mentioned)\b/i,
    ],
  },
];

/**
 * The core rule a prohibition attempts to negate, or `undefined` if it adds to
 * the core rather than subtracting from it — which is what a prohibition is
 * supposed to do.
 */
export function negatedCoreRule(prohibition: string): CoreRule | undefined {
  for (const rule of CORE_RULES) {
    if (rule.negation.some((pattern) => pattern.test(prohibition))) return rule;
  }
  return undefined;
}
