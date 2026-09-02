// T-435 — THE SEEDED RULE SET IS THE SHAPE THE REAL ACCEPTANCE PATH WRITES.
//
// *In plain terms: the demonstration project ships with one accepted set of
// writing rules. This proves those rows are exactly what the product would have
// stored if a person had accepted them on the screen — so nobody is testing, or
// photographing, a shape no real save could produce.*
//
// 🔒 **WHY THE SEED CANNOT SIMPLY CALL THE SAVE.** `saveRuleSet` lives in
// `@infora/data`, and `@infora/data` depends on `@infora/db` — the package the
// seed is in. The dependency matrix (`scripts/dep-rules.mjs`) keeps `@infora/db`
// depending on nothing, so importing the save into the seed would be both a
// cycle and a deliberate widening of that line. This test is the answer
// instead: it takes the SAME rules the seed writes, puts them through the real
// `saveRuleSet` and the real `compileDraftingBrief`, and compares the two
// stored results column for column. The seed drifting into a shape the product
// never produces fails here.
//
// It runs in `apps/api` because that is the only package that can see both
// halves: `@infora/db` (the seed's rules) and `@infora/capabilities` (the brief
// compiler) at once.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { compileDraftingBrief } from '@infora/capabilities';
import { saveRuleSet } from '@infora/data';
import {
  createDb,
  schema as s,
  seedProjectStyleGuideRuleSet,
  WRENFIELD_DRAFTING_BRIEF,
  WRENFIELD_RULE_SET,
} from '@infora/db';

const { db, pool } = createDb();
const stamp = Date.now();

/** The columns that carry the rule — everything but the row's own identity. */
const rulesOf = (ruleSetVersionId: string) =>
  db
    .select({
      ordinal: s.projectStyleGuideRules.ordinal,
      kind: s.projectStyleGuideRules.kind,
      origin: s.projectStyleGuideRules.origin,
      clauseId: s.projectStyleGuideRules.clauseId,
      statement: s.projectStyleGuideRules.statement,
      scope: s.projectStyleGuideRules.scope,
      exceptedContexts: s.projectStyleGuideRules.exceptedContexts,
      exceptedTerms: s.projectStyleGuideRules.exceptedTerms,
      register: s.projectStyleGuideRules.register,
      enforcement: s.projectStyleGuideRules.enforcement,
      severity: s.projectStyleGuideRules.severity,
      payload: s.projectStyleGuideRules.payload,
      proposalState: s.projectStyleGuideRules.proposalState,
    })
    .from(s.projectStyleGuideRules)
    .where(eq(s.projectStyleGuideRules.ruleSetVersionId, ruleSetVersionId))
    .orderBy(asc(s.projectStyleGuideRules.ordinal));

/** One project style guide carrying the seed's three clauses, by their address. */
async function guide(projectId: string, loadedByUserId: string): Promise<string> {
  const [record] = await db
    .insert(s.projectStyleGuides)
    .values({ projectId, title: `Guide ${stamp}`, sourceFormat: 'docx', loadedByUserId })
    .returning();
  await db.insert(s.projectStyleGuideClauses).values(
    ['§2.1', '§2.4', '§3.2'].map((clause, at) => ({
      styleGuideId: record!.id,
      ordinal: at + 1,
      clause,
      heading: null,
      content: `The clause at ${clause}.`,
      spanStart: at * 100,
      spanEnd: at * 100 + 20,
    })),
  );
  return record!.id;
}

let seeded: string;
let saved: string;

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: `Org ${stamp}` }).returning();
  const [user] = await db
    .insert(s.users)
    .values({ name: 'Rule Setter', email: `rules-${stamp}@test.local`, organisationId: org!.id })
    .returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: `Rules ${stamp}`, ownerOrganisationId: org!.id })
    .returning();

  const seededGuide = await guide(project!.id, user!.id);
  seeded = (
    await seedProjectStyleGuideRuleSet(db, {
      styleGuideId: seededGuide,
      acceptedByUserId: user!.id,
    })
  ).ruleSetVersionId;

  // the same rules, through the route's own save. The clause pointer is
  // resolved the way the review screen resolves it — from the guide's clauses.
  const savedGuide = await guide(project!.id, user!.id);
  const clauses = await db
    .select({ id: s.projectStyleGuideClauses.id, clause: s.projectStyleGuideClauses.clause })
    .from(s.projectStyleGuideClauses)
    .where(eq(s.projectStyleGuideClauses.styleGuideId, savedGuide));
  const clauseId = new Map(clauses.map((row) => [row.clause, row.id]));
  saved = (
    await saveRuleSet(db, {
      styleGuideId: savedGuide,
      acceptedByUserId: user!.id,
      draftingBrief: compileDraftingBrief(WRENFIELD_RULE_SET),
      rules: WRENFIELD_RULE_SET.map((rule) => ({
        kind: rule.kind,
        origin: rule.origin,
        statement: rule.statement,
        scope: rule.scope,
        exceptedContexts: rule.exceptedContexts,
        exceptedTerms: rule.exceptedTerms,
        register: rule.register,
        enforcement: rule.enforcement,
        severity: rule.severity,
        payload: rule.payload,
        ...(rule.clause !== null && { clauseId: clauseId.get(rule.clause) }),
      })),
    })
  ).ruleSetVersionId;
});

afterAll(async () => {
  await pool.end();
});

describe('T-435 — the seeded rule set matches the real acceptance path', () => {
  it('stores the same columns the save stores, rule for rule', async () => {
    const fromSeed = await rulesOf(seeded);
    const fromSave = await rulesOf(saved);
    expect(fromSeed).toHaveLength(WRENFIELD_RULE_SET.length);
    // the clause POINTER is a different guide's id in each set, so it is
    // compared as "present or absent" — which is the CHECK's own rule
    expect(fromSeed.map((rule) => ({ ...rule, clauseId: rule.clauseId !== null }))).toEqual(
      fromSave.map((rule) => ({ ...rule, clauseId: rule.clauseId !== null })),
    );
  });

  it('carries the brief the compiler produces, byte for byte', async () => {
    const [version] = await db
      .select({ draftingBrief: s.projectStyleGuideRuleSets.draftingBrief })
      .from(s.projectStyleGuideRuleSets)
      .where(eq(s.projectStyleGuideRuleSets.id, seeded));
    expect(version!.draftingBrief).toBe(compileDraftingBrief(WRENFIELD_RULE_SET));
    expect(WRENFIELD_DRAFTING_BRIEF).toBe(compileDraftingBrief(WRENFIELD_RULE_SET));
  });

  it('points an extracted rule at a clause and an Infora-proposed one at none', async () => {
    const rules = await rulesOf(seeded);
    for (const rule of rules) {
      // 🔒 migration 0064's CHECK, stated as the property it exists for: a
      // finding may quote the client's own words exactly when the rule came
      // from them
      expect(rule.clauseId !== null).toBe(rule.origin === 'extracted');
      // and none of them is a proposal: the seeded set is what BINDS
      expect(rule.proposalState).toBeNull();
    }
  });
});
