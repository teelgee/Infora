// T-435 — THE DEMONSTRATION PROJECT'S ACCEPTED RULE SET (ADR-0054).
//
// *In plain terms: the Wrenfield project's writing standard arrives in the
// seeded world already turned into rules somebody accepted — so the checker,
// the drafting tool and the walkthrough's photographs all show the product
// doing its real job instead of the world as it stood before the rules work.*
//
// Slice Knowledge built the workbench that turns a style guide into rules and
// the acceptance that makes them bind, and then seeded none: every browser test
// and every screenshot went on showing style guides read as PROSE, which is the
// path ADR-0054 replaced. This is the one accepted set that fixes that.
//
// 🔒 **THE SHAPE HERE IS THE SHAPE `saveRuleSet` WRITES, AND A TEST HOLDS THE
// TWO TOGETHER.** The seed cannot call `saveRuleSet` itself: that function
// lives in `@infora/data`, `@infora/data` depends on `@infora/db`, and the
// dependency matrix (`scripts/dep-rules.mjs`) keeps `@infora/db` depending on
// nothing — importing it here would be a cycle and a deliberate widening of the
// one line in that matrix that says db is depended on and never depends back.
// So the rows are written here with the same columns, and
// `apps/api/src/seed-rule-set.test.ts` saves THESE SAME RULES through the real
// `saveRuleSet` and the real `compileDraftingBrief` and asserts the stored
// result matches column for column. If the acceptance path ever changes shape,
// that test fails rather than the seed quietly drifting into a shape no product
// code would ever produce.
//
// 🔒 **A NAMED PERSON RIDES THIS ROW** — `accepted_by_user_id`, registered in
// docs/architecture/personal-data.md at ADR-0054's ruling. The seed writes the
// owner organisation's super user, because accepting the standard that binds
// every firm on a scheme is the owner's act (T-397's tier).
import { desc, eq } from 'drizzle-orm';
import type { Db } from './client.js';
import {
  projectStyleGuideClauses,
  projectStyleGuideRuleSets,
  projectStyleGuideRules,
} from './schema/drawer7-context.js';

/**
 * One rule, as the review screen would hand it to the save.
 *
 * `clause` is the guide's OWN address — `§2.1` — and not an id, because the
 * seed writes the clauses in the same run and resolves the pointer from them.
 * `null` is an Infora-proposed rule, which points at no clause by construction.
 */
export interface SeedRule {
  clause: string | null;
  kind: 'term' | 'pattern' | 'structure' | 'measured' | 'judgement';
  origin: 'extracted' | 'typed' | 'infora_proposed';
  statement: string;
  scope: string;
  exceptedContexts: string[];
  exceptedTerms: string[];
  register: string;
  enforcement: 'raises_findings' | 'steers_only';
  severity: 'required' | 'advisory';
  payload: Record<string, unknown>;
}

/**
 * The Wrenfield style guide's three clauses, restructured into rules — the
 * output a real extract-review-accept pass over that guide produces.
 *
 * Four are **extracted**, each pointing at the clause it came from, so a finding
 * they raise quotes the owner's own words. The fifth is **Infora's own
 * baseline** filling a gap the guide is silent on (ADR-0054 decision 5), and it
 * can never claim the client's guide said it.
 *
 * The five deliberately span the kinds that make decision 4's cost claim
 * visible on a screen: a **term** rule and a **pattern** rule that the code pass
 * settles for nothing, and **judgement** rules that are the only part of a style
 * guide still costing a model call.
 */
export const WRENFIELD_RULE_SET: readonly SeedRule[] = [
  {
    // §2.1, the mechanical half: a wording, and the wordings it replaces. This
    // is the rule the checker settles in CODE — free, exact, every time.
    clause: '§2.1',
    kind: 'term',
    origin: 'extracted',
    statement: 'Refer to the works as “the scheme”.',
    scope: 'sentence',
    exceptedContexts: ['quotations', 'references'],
    exceptedTerms: [],
    register: 'all',
    enforcement: 'raises_findings',
    severity: 'advisory',
    payload: {
      preferred: 'the scheme',
      replaces: ['the routewide works', 'the works'],
      definition: 'The project’s own name for the works it authorises.',
    },
  },
  {
    // §2.1's second obligation, SPLIT OUT — one clause saying two things
    // becomes two rules (decision 6). Case matters here and nowhere else.
    clause: '§2.1',
    kind: 'pattern',
    origin: 'extracted',
    statement: 'Do not capitalise “the scheme” as a proper noun.',
    scope: 'sentence',
    exceptedContexts: ['quotations', 'references'],
    exceptedTerms: [],
    register: 'all',
    enforcement: 'raises_findings',
    severity: 'advisory',
    payload: { expression: '\\bthe Scheme\\b', caseSensitive: true },
  },
  {
    // §2.4 — a computer cannot settle whether a figure carries its source, so
    // this is the expensive kind and reaches the model as [J1].
    clause: '§2.4',
    kind: 'judgement',
    origin: 'extracted',
    statement: 'State every quantitative result with its unit and its source.',
    scope: 'sentence',
    exceptedContexts: ['quotations', 'references'],
    exceptedTerms: [],
    register: 'all',
    enforcement: 'raises_findings',
    severity: 'required',
    payload: {
      passExample:
        'PAH concentrations reached 42 mg/kg at trial pit TP12 (WA-GEO-GIR-004).',
      failExample: 'PAH concentrations at the trial pits were high.',
    },
  },
  {
    clause: '§3.2',
    kind: 'judgement',
    origin: 'extracted',
    statement: 'Write a commitment as a single sentence naming who does what, and by when.',
    scope: 'sentence',
    exceptedContexts: ['quotations'],
    exceptedTerms: [],
    register: 'all',
    enforcement: 'raises_findings',
    severity: 'advisory',
    payload: {
      passExample:
        'Calder & Hale will issue the remediation options appraisal before the Stage 3 gateway.',
      failExample:
        'An options appraisal will be scoped, and the programme will be revisited in due course.',
    },
  },
  {
    // THE GAP FILL, and marked as Infora's own. The guide says nothing about
    // voice; this is Infora's baseline rule, accepted by the owner, and its
    // evidence can never quote the client's document (`evidenceFor`).
    clause: null,
    kind: 'judgement',
    origin: 'infora_proposed',
    statement: 'Write in the active voice where the meaning allows it.',
    scope: 'sentence',
    exceptedContexts: ['quotations', 'references'],
    exceptedTerms: [],
    register: 'all',
    enforcement: 'raises_findings',
    severity: 'advisory',
    payload: {
      passExample: 'The contractor installed the barrier.',
      failExample: 'The barrier was installed by the contractor.',
    },
  },
];

/**
 * The drafting brief, compiled from the judgement rules above.
 *
 * ⚠ **Not hand-written prose — the exact bytes `compileDraftingBrief` produces
 * for `WRENFIELD_RULE_SET`**, which is what the guarantee *same rules in, same
 * brief out* means once the set is stored. `apps/api/src/seed-rule-set.test.ts`
 * recompiles it from the real function and fails if these two ever part.
 */
export const WRENFIELD_DRAFTING_BRIEF = [
  'How this project wants its documents written:',
  '',
  '• State every quantitative result with its unit and its source.',
  '    not: PAH concentrations at the trial pits were high.',
  '    but: PAH concentrations reached 42 mg/kg at trial pit TP12 (WA-GEO-GIR-004).',
  '• Write a commitment as a single sentence naming who does what, and by when.',
  '    not: An options appraisal will be scoped, and the programme will be revisited in due course.',
  '    but: Calder & Hale will issue the remediation options appraisal before the Stage 3 gateway.',
  '• Write in the active voice where the meaning allows it.',
  '    not: The barrier was installed by the contractor.',
  '    but: The contractor installed the barrier.',
].join('\n');

/**
 * Write one accepted rule set as the guide's next version.
 *
 * The version number is read from what is stored rather than assumed, exactly
 * as `saveRuleSet` reads it, so seeding twice would produce version 2 rather
 * than a unique-index failure — the seed TRUNCATEs first, so in practice this
 * is always version 1.
 */
export async function seedProjectStyleGuideRuleSet(
  db: Db,
  input: {
    styleGuideId: string;
    acceptedByUserId: string;
    rules?: readonly SeedRule[];
    draftingBrief?: string;
  },
): Promise<{ ruleSetVersionId: string; version: number; rules: number }> {
  const rules = input.rules ?? WRENFIELD_RULE_SET;
  const clauses = await db
    .select({ id: projectStyleGuideClauses.id, clause: projectStyleGuideClauses.clause })
    .from(projectStyleGuideClauses)
    .where(eq(projectStyleGuideClauses.styleGuideId, input.styleGuideId));
  const clauseId = new Map(clauses.map((row) => [row.clause, row.id]));

  const [latest] = await db
    .select({ version: projectStyleGuideRuleSets.version })
    .from(projectStyleGuideRuleSets)
    .where(eq(projectStyleGuideRuleSets.styleGuideId, input.styleGuideId))
    .orderBy(desc(projectStyleGuideRuleSets.version))
    .limit(1);
  const version = (latest?.version ?? 0) + 1;

  const [saved] = await db
    .insert(projectStyleGuideRuleSets)
    .values({
      styleGuideId: input.styleGuideId,
      version,
      acceptedByUserId: input.acceptedByUserId,
      draftingBrief: input.draftingBrief ?? WRENFIELD_DRAFTING_BRIEF,
    })
    .returning({ id: projectStyleGuideRuleSets.id });

  await db.insert(projectStyleGuideRules).values(
    rules.map((rule, at) => ({
      ruleSetVersionId: saved!.id,
      ordinal: at + 1,
      kind: rule.kind,
      origin: rule.origin,
      // 🔒 the pointer is resolved from OUR copy of the guide, and is non-null
      // exactly when the origin is `extracted` — the CHECK in migration 0064
      clauseId: rule.origin === 'extracted' ? (clauseId.get(rule.clause) ?? null) : null,
      statement: rule.statement,
      scope: rule.scope,
      exceptedContexts: rule.exceptedContexts,
      exceptedTerms: rule.exceptedTerms,
      register: rule.register,
      enforcement: rule.enforcement,
      severity: rule.severity,
      payload: rule.payload,
    })),
  );
  return { ruleSetVersionId: saved!.id, version, rules: rules.length };
}
