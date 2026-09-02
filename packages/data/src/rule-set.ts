// T-423 — the rule set's store half (ADR-0054 decisions 2–5).
//
// *In plain terms: saving a reviewed list of writing rules, and reading one
// back. Saving is the moment anything binds anybody, so it is the only place in
// this file that writes a version — and it always writes a NEW one.*
//
// 🔒 **SAVING IS APPEND-ONLY AND THE STORE ENFORCES IT.** An amendment is a new
// version, on T-397's retire-never-edit precedent: the stored rule text is what
// past findings quoted. Two triggers in migration 0064 make that structural, so
// nothing here has to remember it — but the shape of these functions follows
// from it. There is no `updateRuleSet`, and there is no door to add one.
//
// 🔒 **THE CLAUSE POINTER IS VALIDATED AGAINST THE GUIDE, NOT TRUSTED.** An
// extracted rule's `clauseId` must belong to the guide the version hangs off,
// or a rule could quote another project's document. The CHECK in 0064 enforces
// *whether* a pointer is present; only this read can enforce *what it points
// at*, so it does, in the same query that writes the version.
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';

/** One rule as it is handed in to be saved — the wire's `ProposedRule`. */
export type RuleToSave = {
  kind: string;
  origin: string;
  statement: string;
  scope: string;
  exceptedContexts: string[];
  exceptedTerms: string[];
  register: string;
  enforcement: string;
  severity: string;
  payload: Record<string, unknown>;
  clauseId?: string | undefined;
};

/** One rule as it is read back, with the client's own wording resolved. */
export type StoredRule = RuleToSave & {
  id: string;
  ordinal: number;
  /** the clause's own address — `4.2`, or null where the guide numbers nothing */
  clause: string | null;
  /** 🔒 the clause VERBATIM, from our own copy. This is what a finding quotes */
  clauseWording: string | null;
};

export type StoredRuleSet = {
  id: string;
  styleGuideId: string;
  version: number;
  acceptedBy: { userId: string; name: string };
  acceptedAt: Date;
  draftingBrief: string;
  rules: StoredRule[];
};

export class UnknownClausePointer extends Error {
  constructor(clauseId: string) {
    super(`clause ${clauseId} does not belong to this style guide`);
    this.name = 'UnknownClausePointer';
  }
}

/**
 * Save a reviewed set of rules as the guide's **next** version.
 *
 * `version` is computed from what is stored rather than supplied, so two saves
 * racing produce two versions or one unique-index failure — never two rows
 * claiming to be version 3. The unique index is the arbiter; this read is the
 * fast path.
 */
export async function saveRuleSet(
  db: Db,
  input: {
    styleGuideId: string;
    acceptedByUserId: string;
    draftingBrief: string;
    rules: readonly RuleToSave[];
  },
): Promise<{ ruleSetVersionId: string; version: number; rules: number }> {
  await assertClausesBelong(db, input.styleGuideId, input.rules);

  const [latest] = await db
    .select({ version: s.projectStyleGuideRuleSets.version })
    .from(s.projectStyleGuideRuleSets)
    .where(eq(s.projectStyleGuideRuleSets.styleGuideId, input.styleGuideId))
    .orderBy(desc(s.projectStyleGuideRuleSets.version))
    .limit(1);
  const version = (latest?.version ?? 0) + 1;

  const [saved] = await db
    .insert(s.projectStyleGuideRuleSets)
    .values({
      styleGuideId: input.styleGuideId,
      version,
      acceptedByUserId: input.acceptedByUserId,
      draftingBrief: input.draftingBrief,
    })
    .returning({ id: s.projectStyleGuideRuleSets.id });

  if (input.rules.length > 0) {
    await db.insert(s.projectStyleGuideRules).values(
      input.rules.map((rule, at) => ({
        ruleSetVersionId: saved!.id,
        ordinal: at + 1,
        kind: rule.kind,
        origin: rule.origin,
        clauseId: rule.origin === 'extracted' ? (rule.clauseId ?? null) : null,
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
  }
  return { ruleSetVersionId: saved!.id, version, rules: input.rules.length };
}

/**
 * The guide's **current** rule set — its highest version — with every rule and
 * every extracted rule's client wording resolved.
 *
 * `null` where the guide has no accepted set at all, which is a different thing
 * from an empty one and is why it is not folded into "no rules".
 */
export async function readCurrentRuleSet(
  db: Db,
  styleGuideId: string,
): Promise<StoredRuleSet | null> {
  const [version] = await db
    .select({
      id: s.projectStyleGuideRuleSets.id,
      styleGuideId: s.projectStyleGuideRuleSets.styleGuideId,
      version: s.projectStyleGuideRuleSets.version,
      acceptedAt: s.projectStyleGuideRuleSets.acceptedAt,
      draftingBrief: s.projectStyleGuideRuleSets.draftingBrief,
      userId: s.users.id,
      name: s.users.name,
    })
    .from(s.projectStyleGuideRuleSets)
    .innerJoin(s.users, eq(s.users.id, s.projectStyleGuideRuleSets.acceptedByUserId))
    .where(eq(s.projectStyleGuideRuleSets.styleGuideId, styleGuideId))
    .orderBy(desc(s.projectStyleGuideRuleSets.version))
    .limit(1);
  if (version === undefined) return null;
  return {
    id: version.id,
    styleGuideId: version.styleGuideId,
    version: version.version,
    acceptedBy: { userId: version.userId, name: version.name },
    acceptedAt: version.acceptedAt,
    draftingBrief: version.draftingBrief,
    rules: await readRules(db, version.id),
  };
}

/**
 * The rules of one saved version, in reading order, **with the client's own
 * wording joined in from the clause store**.
 *
 * 🔒 The wording comes from `project_style_guide_clauses` and never from the
 * rule row. That is the whole reason the clause store survived this design: a
 * finding quoting a rule quotes what the guide really says, byte for byte, not
 * Infora's restructuring of it (ADR-0048 §5, ADR-0054 decision 3).
 */
export async function readRules(db: Db, ruleSetVersionId: string): Promise<StoredRule[]> {
  const rows = await db
    .select({
      id: s.projectStyleGuideRules.id,
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
      clause: s.projectStyleGuideClauses.clause,
      clauseWording: s.projectStyleGuideClauses.content,
    })
    .from(s.projectStyleGuideRules)
    .leftJoin(
      s.projectStyleGuideClauses,
      eq(s.projectStyleGuideClauses.id, s.projectStyleGuideRules.clauseId),
    )
    .where(
      and(
        eq(s.projectStyleGuideRules.ruleSetVersionId, ruleSetVersionId),
        // a proposal is not part of the set until somebody accepts it
        isNull(s.projectStyleGuideRules.proposalState),
      ),
    )
    .orderBy(asc(s.projectStyleGuideRules.ordinal));

  return rows.map((row) => ({
    id: row.id,
    ordinal: row.ordinal,
    kind: row.kind,
    origin: row.origin,
    ...(row.clauseId !== null && { clauseId: row.clauseId }),
    statement: row.statement,
    scope: row.scope,
    exceptedContexts: row.exceptedContexts,
    exceptedTerms: row.exceptedTerms,
    register: row.register,
    enforcement: row.enforcement,
    severity: row.severity,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    clause: row.clause,
    clauseWording: row.clauseWording,
  }));
}

/**
 * Every extracted rule's pointer must land inside the guide it is being saved
 * against. Refused, never repaired: a pointer to another project's clause is
 * how a finding would quote a document its reader may not hold.
 */
async function assertClausesBelong(
  db: Db,
  styleGuideId: string,
  rules: readonly RuleToSave[],
): Promise<void> {
  const wanted = [
    ...new Set(
      rules
        .filter((rule) => rule.origin === 'extracted')
        .map((rule) => rule.clauseId)
        .filter((id): id is string => id !== undefined),
    ),
  ];
  if (wanted.length === 0) return;
  const found = await db
    .select({ id: s.projectStyleGuideClauses.id })
    .from(s.projectStyleGuideClauses)
    .where(
      and(
        eq(s.projectStyleGuideClauses.styleGuideId, styleGuideId),
        inArray(s.projectStyleGuideClauses.id, wanted),
      ),
    );
  const ours = new Set(found.map((row) => row.id));
  for (const id of wanted) if (!ours.has(id)) throw new UnknownClausePointer(id);
}

/**
 * T-427 (ADR-0054 decision 7) — **which versions of the accepted writing rules
 * a run ran against**, as the run's own record will carry them.
 *
 * *In plain terms: a check and a draft each store which version of the writing
 * rules they used. Stored, not shown.*
 *
 * One id per live style guide that has an accepted set, in the guides' own
 * loading order, so the value is stable for the same inputs — which is what
 * lets a declared workflow keep its promise. **Retired guides are excluded**,
 * because they are not what the run read; and a guide with no accepted set
 * contributes nothing, because there is no version to name.
 *
 * `styleGuideIds` narrows it to the guides the author SELECTED, which is the
 * drafting case; omitting it is the checker's, which reads every live guide
 * because a rule that binds you binds you whether you remembered it or not
 * (`guidingStyleGuide`'s own rule, one read along).
 */
export async function currentRuleSetVersionIds(
  db: Db,
  projectId: string,
  styleGuideIds?: readonly string[],
): Promise<string[]> {
  if (styleGuideIds !== undefined && styleGuideIds.length === 0) return [];
  const guides = await db
    .select({ id: s.projectStyleGuides.id })
    .from(s.projectStyleGuides)
    .where(
      and(
        eq(s.projectStyleGuides.projectId, projectId),
        isNull(s.projectStyleGuides.retiredAt),
        // the project key stays the ceiling: a selected id belonging to another
        // project matches nothing rather than reaching across
        ...(styleGuideIds === undefined
          ? []
          : [inArray(s.projectStyleGuides.id, [...styleGuideIds])]),
      ),
    )
    .orderBy(asc(s.projectStyleGuides.loadedAt));

  const ids: string[] = [];
  for (const guide of guides) {
    const [version] = await db
      .select({ id: s.projectStyleGuideRuleSets.id })
      .from(s.projectStyleGuideRuleSets)
      .where(eq(s.projectStyleGuideRuleSets.styleGuideId, guide.id))
      .orderBy(desc(s.projectStyleGuideRuleSets.version))
      .limit(1);
    if (version !== undefined) ids.push(version.id);
  }
  return ids;
}
