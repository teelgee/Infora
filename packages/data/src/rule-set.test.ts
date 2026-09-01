// T-423 acceptance — the rule set's three invariants, at the store.
//
// *In plain terms: three things have to be true of this store or the rest of
// the design is a promise nobody keeps. A rule lifted out of the client's
// document must point back at the exact words it came from — and a rule
// somebody typed must NOT pretend to. A saved version must be impossible to
// change afterwards, because past findings quoted it. And a finding must be
// able to quote the client's own wording, byte for byte.*
//
// The first and second are enforced by migration 0064 — a CHECK and two
// triggers — so these tests go at the database rather than at a function that
// could be bypassed. That is deliberate: a rule kept by convention is a rule
// kept until somebody is in a hurry.
import { beforeAll, describe, expect, it } from 'vitest';
import { createDb, schema as s } from '@infora/db';
import { sql } from 'drizzle-orm';
import { loadStyleGuide } from './rulebook';
import { readCurrentRuleSet, saveRuleSet, UnknownClausePointer } from './rule-set';

const { db } = createDb();
const stamp = Date.now();

/** drizzle wraps PG errors (DrizzleQueryError); the trigger text is on `.cause` */
async function expectDbError(promise: Promise<unknown>, pattern: RegExp) {
  const error = await promise.then(
    () => {
      throw new Error('expected the statement to be rejected');
    },
    (e: unknown) => e as Error & { cause?: Error },
  );
  expect(`${error.message} ${error.cause?.message ?? ''}`).toMatch(pattern);
}

const GUIDE = [
  '4.2 Terminology',
  'Refer to the works as the scheme throughout; never as the project.',
  '',
  '9. Voice',
  'Write in the active voice wherever the meaning allows.',
].join('\n');

let styleGuideId: string;
let userId: string;
let clauseId: string;
let clauseWording: string;

const baseRule = {
  kind: 'term',
  origin: 'typed',
  statement: 'Use “scheme”, not “project”.',
  scope: 'sentence',
  exceptedContexts: ['quotations'],
  exceptedTerms: ['the Project Board'],
  register: 'all',
  enforcement: 'raises_findings',
  severity: 'required',
  payload: { preferred: 'scheme', replaces: ['project'] },
};

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: `t423 org ${stamp}` }).returning();
  const [user] = await db
    .insert(s.users)
    .values({ name: 't423 curator', email: `t423-${stamp}@test.local`, organisationId: org!.id })
    .returning();
  userId = user!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t423 project ${stamp}`, ownerOrganisationId: org!.id })
    .returning();
  const loaded = await loadStyleGuide(db, {
    projectId: project!.id,
    title: `t423 guide ${stamp}`,
    sourceFormat: 'docx',
    loadedByUserId: userId,
    text: GUIDE,
  });
  styleGuideId = loaded.styleGuideId;
  const clauses = await db
    .select({ id: s.projectStyleGuideClauses.id, content: s.projectStyleGuideClauses.content })
    .from(s.projectStyleGuideClauses)
    .where(sql`${s.projectStyleGuideClauses.styleGuideId} = ${styleGuideId}`);
  clauseId = clauses[0]!.id;
  clauseWording = clauses[0]!.content;
});

describe('T-423 — the pointer is non-null EXACTLY when the origin is extracted', () => {
  it('accepts an extracted rule that points at a clause of its own guide', async () => {
    const saved = await saveRuleSet(db, {
      styleGuideId,
      acceptedByUserId: userId,
      draftingBrief: '',
      rules: [{ ...baseRule, origin: 'extracted', clauseId }],
    });
    expect(saved.version).toBe(1);
    expect(saved.rules).toBe(1);
  });

  it('refuses an extracted rule with no pointer — the CHECK, not a convention', async () => {
    const [version] = await db
      .insert(s.projectStyleGuideRuleSets)
      .values({ styleGuideId, version: 900, acceptedByUserId: userId })
      .returning({ id: s.projectStyleGuideRuleSets.id });
    await expectDbError(
      db.insert(s.projectStyleGuideRules).values({
        ruleSetVersionId: version!.id,
        ordinal: 1,
        ...baseRule,
        origin: 'extracted',
        clauseId: null,
      }),
      /clause_pointer/,
    );
  });

  it('refuses a TYPED rule that carries one — an invented quotation is worse than none', async () => {
    const [version] = await db
      .insert(s.projectStyleGuideRuleSets)
      .values({ styleGuideId, version: 901, acceptedByUserId: userId })
      .returning({ id: s.projectStyleGuideRuleSets.id });
    await expectDbError(
      db.insert(s.projectStyleGuideRules).values({
        ruleSetVersionId: version!.id,
        ordinal: 1,
        ...baseRule,
        origin: 'typed',
        clauseId,
      }),
      /clause_pointer/,
    );
  });

  it('refuses a pointer into a DIFFERENT guide’s clauses', async () => {
    const [org] = await db.insert(s.organisations).values({ name: `t423 other ${stamp}` }).returning();
    const [project] = await db
      .insert(s.projects)
      .values({ name: `t423 other project ${stamp}`, ownerOrganisationId: org!.id })
      .returning();
    const other = await loadStyleGuide(db, {
      projectId: project!.id,
      title: `t423 other guide ${stamp}`,
      sourceFormat: 'docx',
      loadedByUserId: userId,
      text: GUIDE,
    });
    const [foreign] = await db
      .select({ id: s.projectStyleGuideClauses.id })
      .from(s.projectStyleGuideClauses)
      .where(sql`${s.projectStyleGuideClauses.styleGuideId} = ${other.styleGuideId}`);
    await expect(
      saveRuleSet(db, {
        styleGuideId,
        acceptedByUserId: userId,
        draftingBrief: '',
        rules: [{ ...baseRule, origin: 'extracted', clauseId: foreign!.id }],
      }),
    ).rejects.toBeInstanceOf(UnknownClausePointer);
  });
});

describe('T-423 — a version is immutable once saved, and an amendment is a new one', () => {
  it('saves an amendment as the next version, leaving the first standing', async () => {
    const first = await readCurrentRuleSet(db, styleGuideId);
    const next = await saveRuleSet(db, {
      styleGuideId,
      acceptedByUserId: userId,
      draftingBrief: 'Prefer the active voice.',
      rules: [{ ...baseRule, origin: 'extracted', clauseId }, baseRule],
    });
    expect(next.version).toBeGreaterThan(first!.version);
    const current = await readCurrentRuleSet(db, styleGuideId);
    expect(current!.version).toBe(next.version);
    expect(current!.rules).toHaveLength(2);
  });

  it('refuses an UPDATE of a saved version, at the database', async () => {
    const current = await readCurrentRuleSet(db, styleGuideId);
    await expectDbError(
      db.execute(
        sql`update project_style_guide_rule_sets set drafting_brief = 'rewritten' where id = ${current!.id}`,
      ),
      /append-only/,
    );
  });

  it('refuses a DELETE of a saved version', async () => {
    const current = await readCurrentRuleSet(db, styleGuideId);
    await expectDbError(
      db.execute(sql`delete from project_style_guide_rule_sets where id = ${current!.id}`),
      /append-only/,
    );
  });

  it('refuses an edit of a saved RULE — the text past findings quoted cannot move', async () => {
    const current = await readCurrentRuleSet(db, styleGuideId);
    await expectDbError(
      db.execute(
        sql`update project_style_guide_rules set statement = 'something else' where id = ${current!.rules[0]!.id}`,
      ),
      /immutable/,
    );
  });
});

describe('T-423 — a finding quotes the CLIENT’S wording, byte for byte', () => {
  it('resolves an extracted rule’s wording out of the clause store, unchanged', async () => {
    const current = await readCurrentRuleSet(db, styleGuideId);
    const extracted = current!.rules.find((rule) => rule.origin === 'extracted')!;
    // 🔒 the assertion the whole clause store survived for: the wording is the
    // guide's own text, not the rule's `statement`, which is Infora's
    // restructuring of it
    expect(extracted.clauseWording).toBe(clauseWording);
    expect(extracted.clauseWording).not.toBe(extracted.statement);
    expect(extracted.clause).toBe('4.2');
  });

  it('gives a typed rule no wording at all, rather than a plausible blank', async () => {
    const current = await readCurrentRuleSet(db, styleGuideId);
    const typed = current!.rules.find((rule) => rule.origin === 'typed')!;
    expect(typed.clauseWording).toBeNull();
    expect(typed.clauseId).toBeUndefined();
  });
});
