// T-424/T-425/T-426 — THE RULES WORKBENCH, over HTTP (ADR-0054 decisions 2–5).
//
// *In plain terms: you upload your writing standard — or start from nothing —
// and Infora reads it, pulls out the rules it contains, sorts them into kinds,
// and adds the ones your standard never wrote down for the kind of writing you
// picked. What comes back is a list for a person to correct. Nothing binds.*
//
// 🔒 **EXTRACTION STORES NOTHING, AND THAT IS THE DESIGN.** The proposed rules
// go back to the surface and come back with the save (T-425). ADR-0054 decision
// 2 puts the review step between extraction and saving **always**, and a stored
// draft set is exactly the thing somebody eventually starts checking against by
// accident. This route writes nothing at all.
//
// 🔒 **THE TIER IS T-397'S, UNCHANGED** — the owner organisation's super user,
// `404` to a member organisation and `403 super_user_required` to the owner's
// own non-elevated person. Producing the rules that will bind every firm on a
// scheme is the same act as loading the guide they come from (ADR-0033).
//
// 🔒 **THE SAVE IS THE MOMENT ANYTHING BINDS, AND IT ALWAYS WRITES A NEW
// VERSION** (T-425). Reading is every participant's, because a rule that binds
// you is a rule you may look up — T-397's asymmetry applied to the rules rather
// than to the document they came from.
//
// 🔒 **A PROPOSAL IS NOT PROJECT-WIDE READING** (T-426, decision 2). It is
// visible to its author, that person's own organisation, and the owner
// organisation — **never to another firm on the project**. A rival learning
// which rules a competitor is arguing about is the ethical-wall breach nobody
// thinks of as crossing the wall (ADR-0048 §6's precedent). The predicate is
// applied in the read's OWN WHERE, so another firm's proposal is **absent**
// rather than refused, and a decision route addressed to one reads as
// nonexistence.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type {
  ApiError,
  ExtractionReport,
  Id,
  ListRuleProposalsResponse,
  ProposedRule,
  RuleProposal,
  RuleSetVersion,
  StyleRule,
} from '@infora/contracts';
import { decideProposalBody, extractRulesBody, proposeRuleBody, saveRuleSetBody } from '@infora/contracts';
import {
  admitExtractedRules,
  compileDraftingBrief,
  composeRuleExtractionPrompt,
  fillGaps,
} from '@infora/capabilities';
import { readCurrentRuleSet, saveRuleSet, UnknownClausePointer } from '@infora/data';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { Router } from '@infora/model';
import { projectScope } from './requester';
import type { AppEnv } from './requester';
import { refuseIfOff } from './ai-features';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const invalid = (c: Context, detail: string) =>
  c.json({ error: 'invalid', detail } satisfies ApiError, 400);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

export function ruleSetRoutes(deps: { db: Db; router: Router }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  /** T-397's gate, verbatim — the same act, on the same object. */
  const mayCurate = (c: Context<AppEnv>): Response | null => {
    const slice = c.get('slice');
    if (slice.membershipRole !== 'owner') return notFound(c);
    if (!slice.elevated) {
      return c.json({ error: 'forbidden', detail: 'super_user_required' } satisfies ApiError, 403);
    }
    return null;
  };

  /** The guide, checked against THIS project. Another project's reads as absent. */
  const guideOf = async (c: Context<AppEnv>): Promise<{ id: string } | null> => {
    const styleGuideId = c.req.param('styleGuideId') ?? '';
    if (!isUuid(styleGuideId)) return null;
    const [guide] = await deps.db
      .select({ id: s.projectStyleGuides.id })
      .from(s.projectStyleGuides)
      .where(
        and(
          eq(s.projectStyleGuides.id, styleGuideId),
          eq(s.projectStyleGuides.projectId, c.get('slice').projectId),
        ),
      )
      .limit(1);
    return guide ?? null;
  };

  // ── T-424 — extraction: the standard becomes proposed rules ───────────────
  //
  // **Nothing is stored and nothing binds.** The response is a list for a
  // person to correct (T-425), which is the review step decision 2 puts between
  // extraction and saving *always*.
  app.post(
    '/projects/:projectId/style-guides/:styleGuideId/rule-sets/extraction',
    project,
    async (c) => {
      const refused = mayCurate(c);
      if (refused !== null) return refused;
      // T-463 — the project's switch
      const off = await refuseIfOff(c, deps.db, c.get('slice').projectId, 'rule_extraction');
      if (off) return off;
      const guide = await guideOf(c);
      if (guide === null) return notFound(c);
      const parsed = extractRulesBody.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) {
        return invalid(c, 'registers (at least one), fillGaps and defaultSeverity are required');
      }
      const { registers, defaultSeverity } = parsed.data;

      const clauses = await deps.db
        .select({
          id: s.projectStyleGuideClauses.id,
          clause: s.projectStyleGuideClauses.clause,
          heading: s.projectStyleGuideClauses.heading,
          content: s.projectStyleGuideClauses.content,
        })
        .from(s.projectStyleGuideClauses)
        .where(eq(s.projectStyleGuideClauses.styleGuideId, guide.id))
        .orderBy(asc(s.projectStyleGuideClauses.ordinal));

      let extracted: ProposedRule[] = [];
      let covered: Parameters<typeof fillGaps>[1] = [];
      if (clauses.length > 0) {
        // `triage` is the ROUTING CLASS, not a worker: this restructures a
        // document into rows and never judges a draft. The task vocabulary is
        // the Wave 5 table and is not widened for a new caller.
        const result = await deps.router.chat('triage', {
          system: composeRuleExtractionPrompt(clauses, registers),
          messages: [{ role: 'user', content: 'Extract the rules from the guide above.' }],
        });
        const admitted = admitExtractedRules(clauses, registers, defaultSeverity, result.text);
        extracted = admitted.rules;
        covered = admitted.covered;
      }

      const proposed = parsed.data.fillGaps
        ? fillGaps(registers, covered, defaultSeverity)
        : [];
      const rules = [...extracted, ...proposed];

      // 🔒 **Said at upload, not left to produce an empty set that looks
      // configured.** An empty rule set is indistinguishable on screen from a
      // standard that genuinely says nothing, and the person holding the file
      // is the only one who can do anything about it.
      const nothingExtracted =
        rules.length > 0
          ? null
          : clauses.length === 0
            ? 'Nothing could be read out of this document as a rule — it has no clauses. Start from Infora’s baseline instead, or upload a standard with numbered or headed sections.'
            : 'Nothing in this document reads as an enforceable writing rule. Start from Infora’s baseline instead, or type the rules you want.';

      const report: ExtractionReport = {
        clausesRead: clauses.length,
        proposed: rules.length,
        // the honest number: how many rules can ever quote the client's guide
        withWording: extracted.length,
        gapFilled: proposed.length,
        nothingExtracted,
      };
      return c.json({ rules, report });
    },
  );

  // ── T-425 — the save, which is the moment anything binds ──────────────────
  //
  // **The owner organisation's super user saves, and that is what makes it
  // bind.** ⚖ Bulk acceptance is permitted, deliberately and against the
  // session's own stress test — *"it is down to the client or the user to
  // behave properly. We don't need to plan for that"* (owner, 2026-09-01). It
  // does **not** reopen ADR-0048 §3 or ADR-0053 §6: those govern a reviewer
  // accepting proposed changes into a **work product**, where accepting prose
  // unread is the failure. Here the artefact being accepted is the client's own
  // configuration of their own standard, and the person accepting it is its
  // author's own organisation. So there is no per-rule acceptance flag on the
  // wire and there must never be one — the list that arrives is the set.
  app.post('/projects/:projectId/style-guides/:styleGuideId/rule-sets', project, async (c) => {
    const refused = mayCurate(c);
    if (refused !== null) return refused;
    const guide = await guideOf(c);
    if (guide === null) return notFound(c);
    const parsed = saveRuleSetBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return invalid(c, 'rules is required, each with a kind, an origin, a statement and a scope');
    }

    try {
      await saveRuleSet(deps.db, {
        styleGuideId: guide.id,
        // contracts principle 3: the accepting person comes off the resolved
        // session and never off the body — a field here would be a way to write
        // somebody else's name onto the record that makes a rule binding
        acceptedByUserId: c.get('user').id,
        // 🔒 T-429 (ADR-0054 decision 6) — THE BRIEF IS COMPILED HERE, ONCE,
        // AT SAVE, and never rebuilt per draft. Same rules in, same brief out,
        // so a drafting run keeps a declared workflow's kind of guarantee; and
        // it costs nothing to show the owner's super user afterwards, because
        // it was compiled at save time regardless.
        draftingBrief: compileDraftingBrief(parsed.data.rules),
        rules: parsed.data.rules.map((rule) => ({
          ...rule,
          ...(rule.clauseId !== undefined && { clauseId: rule.clauseId }),
        })),
      });
    } catch (error) {
      if (error instanceof UnknownClausePointer) {
        return invalid(c, 'a rule points at a clause that is not part of this style guide');
      }
      throw error;
    }
    return c.json({ set: await readSet(deps.db, guide.id) }, 201);
  });

  /**
   * The current set. **Every participant reads it** — a rule that binds you is a
   * rule you may look up, which is T-397's asymmetry one object along. `null`
   * where the guide has no accepted set at all, which is a different thing from
   * an empty one and is why it is not folded into "no rules".
   */
  app.get(
    '/projects/:projectId/style-guides/:styleGuideId/rule-sets/current',
    project,
    async (c) => {
      const guide = await guideOf(c);
      if (guide === null) return notFound(c);
      return c.json({ set: await readSet(deps.db, guide.id) });
    },
  );

  // ── T-426 — anyone proposes; the owner's super user decides ───────────────
  //
  // **Anyone on the project may propose** (decision 2): a rule that binds you is
  // one you may argue with, and the person who finds a rule wrong is usually not
  // the person who can change it.
  app.post(
    '/projects/:projectId/style-guides/:styleGuideId/rule-sets/proposals',
    project,
    async (c) => {
      const guide = await guideOf(c);
      if (guide === null) return notFound(c);
      const parsed = proposeRuleBody.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return invalid(c, 'rule is required, with a kind, a statement and a scope');

      // a proposal amends an ACCEPTED set. With none, there is nothing to
      // amend — and inventing a version to hang it off would make a proposal
      // into a rule set nobody accepted.
      const current = await readCurrentRuleSet(deps.db, guide.id);
      if (current === null) {
        return invalid(c, 'this style guide has no accepted rules yet — there is nothing to amend');
      }
      // 🔒 A proposal is always TYPED, whatever the body says. It has no clause
      // behind it because nobody extracted it from the guide, and the store's
      // own CHECK would refuse a pointer here anyway. This is the same rule the
      // extraction keeps from the other end.
      const rule = parsed.data.rule;
      const supersedes =
        parsed.data.supersedesRuleId !== undefined &&
        current.rules.some((each) => each.id === parsed.data.supersedesRuleId)
          ? parsed.data.supersedesRuleId
          : null;
      const [row] = await deps.db
        .insert(s.projectStyleGuideRules)
        .values({
          ruleSetVersionId: current.id,
          // proposals sit outside the set's own ordering, which is why the
          // ordinal's unique index is partial
          ordinal: 0,
          kind: rule.kind,
          origin: 'typed',
          clauseId: null,
          statement: rule.statement,
          scope: rule.scope,
          exceptedContexts: rule.exceptedContexts,
          exceptedTerms: rule.exceptedTerms,
          register: rule.register,
          enforcement: rule.enforcement,
          severity: rule.severity,
          payload: rule.payload,
          proposalState: 'pending',
          ...(supersedes !== null && { supersedesRuleId: supersedes }),
          // contracts principle 3 — the proposer comes off the resolved session
          proposedByUserId: c.get('user').id,
          proposedAt: new Date(),
        })
        .returning({ id: s.projectStyleGuideRules.id });
      const listed = await readProposals(deps.db, guide.id, c);
      return c.json(listed.items.find((item) => item.id === row!.id)!, 201);
    },
  );

  app.get(
    '/projects/:projectId/style-guides/:styleGuideId/rule-sets/proposals',
    project,
    async (c) => {
      const guide = await guideOf(c);
      if (guide === null) return notFound(c);
      return c.json(await readProposals(deps.db, guide.id, c));
    },
  );

  /**
   * The decision. **Accepting produces a NEW version**; declining records no
   * reason, on the finding-dismissal precedent (ADR-0053 §6: dismissing changes
   * no work product, and declining is one professional judgement rather than a
   * skipped one).
   */
  app.post(
    '/projects/:projectId/style-guides/:styleGuideId/rule-sets/proposals/:proposalId/decision',
    project,
    async (c) => {
      const refused = mayCurate(c);
      if (refused !== null) return refused;
      const guide = await guideOf(c);
      if (guide === null) return notFound(c);
      const proposalId = c.req.param('proposalId') ?? '';
      if (!isUuid(proposalId)) return notFound(c);
      const parsed = decideProposalBody.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return invalid(c, 'decision must be accept or decline');

      // the ceiling is this guide's own proposals, checked in the read rather
      // than trusted from the path
      const visible = await readProposals(deps.db, guide.id, c);
      const proposal = visible.items.find((item) => item.id === proposalId);
      if (proposal === undefined || proposal.state !== 'pending') return notFound(c);

      if (parsed.data.decision === 'accept') {
        const current = await readCurrentRuleSet(deps.db, guide.id);
        if (current === null) return notFound(c);
        // the new version is the set as it stands with the proposal folded in:
        // replacing the rule it supersedes, or added at the end. Nothing is
        // edited in place — that is what "an amendment is a new version" means.
        const rules = current.rules.map((each) =>
          each.id === proposal.supersedesRuleId
            ? ruleToSave(proposal.rule)
            : {
                kind: each.kind,
                origin: each.origin,
                statement: each.statement,
                scope: each.scope,
                exceptedContexts: each.exceptedContexts,
                exceptedTerms: each.exceptedTerms,
                register: each.register,
                enforcement: each.enforcement,
                severity: each.severity,
                payload: each.payload,
                ...(each.clauseId !== undefined && { clauseId: each.clauseId }),
              },
        );
        if (proposal.supersedesRuleId === undefined) rules.push(ruleToSave(proposal.rule));
        await saveRuleSet(deps.db, {
          styleGuideId: guide.id,
          acceptedByUserId: c.get('user').id,
          // the accepted proposal changes the set, so the brief is recompiled
          // from the set as it now stands — a brief that described the previous
          // version would be a promise about what the model is told that the
          // model no longer gets
          draftingBrief: compileDraftingBrief(rules),
          rules,
        });
      }

      // the ONE mutation this store permits, and the trigger in 0064 allows it
      // only from `pending` and only over these two columns
      await deps.db
        .update(s.projectStyleGuideRules)
        .set({
          proposalState: parsed.data.decision === 'accept' ? 'accepted' : 'declined',
          decidedByUserId: c.get('user').id,
          decidedAt: new Date(),
        })
        .where(eq(s.projectStyleGuideRules.id, proposalId));

      const after = await readProposals(deps.db, guide.id, c);
      return c.json(after.items.find((item) => item.id === proposalId)!);
    },
  );

  return app;
}

/**
 * One saved version, on the wire.
 *
 * 🔒 `clauseWording` is joined in from `project_style_guide_clauses` — the
 * client's own words, from our own copy — and is present exactly where the rule
 * is `extracted`. A typed or Infora-proposed rule comes back with none, and the
 * surface renders that absence rather than faking one (ADR-0054 decision 3).
 */
async function readSet(db: Db, styleGuideId: string): Promise<RuleSetVersion | null> {
  const set = await readCurrentRuleSet(db, styleGuideId);
  if (set === null) return null;
  return {
    id: set.id as Id,
    styleGuideId: set.styleGuideId as Id,
    version: set.version,
    acceptedBy: { userId: set.acceptedBy.userId as Id, name: set.acceptedBy.name },
    acceptedAt: set.acceptedAt.toISOString(),
    draftingBrief: set.draftingBrief,
    rules: set.rules.map((rule) => {
      const wire = {
        id: rule.id as Id,
        ordinal: rule.ordinal,
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
        ...(rule.clauseId !== undefined && { clauseId: rule.clauseId as Id }),
        ...(rule.clauseWording !== null && {
          clause: rule.clause,
          clauseWording: rule.clauseWording,
        }),
      };
      return wire as StyleRule;
    }),
  };
}

/**
 * The proposals this requester may see — **the wall, in the read's own WHERE**.
 *
 * Visible to the author, the author's own organisation, and the owner
 * organisation. Authorship implies the first, so the predicate is two clauses:
 * the proposer's organisation is the requester's, or the requester's
 * organisation owns the project (`membershipRole === 'owner'`, resolved on the
 * slice). Another firm's proposal is **absent** — never greyed, never counted,
 * and a decision route addressed to one reads as nonexistence.
 */
async function readProposals(
  db: Db,
  styleGuideId: string,
  c: Context<AppEnv>,
): Promise<ListRuleProposalsResponse> {
  const slice = c.get('slice');
  const owner = slice.membershipRole === 'owner';
  const proposer = alias(s.users, 'proposer');
  const decider = alias(s.users, 'decider');

  const rows = await db
    .select({
      id: s.projectStyleGuideRules.id,
      state: s.projectStyleGuideRules.proposalState,
      kind: s.projectStyleGuideRules.kind,
      statement: s.projectStyleGuideRules.statement,
      scope: s.projectStyleGuideRules.scope,
      exceptedContexts: s.projectStyleGuideRules.exceptedContexts,
      exceptedTerms: s.projectStyleGuideRules.exceptedTerms,
      register: s.projectStyleGuideRules.register,
      enforcement: s.projectStyleGuideRules.enforcement,
      severity: s.projectStyleGuideRules.severity,
      payload: s.projectStyleGuideRules.payload,
      supersedesRuleId: s.projectStyleGuideRules.supersedesRuleId,
      proposedAt: s.projectStyleGuideRules.proposedAt,
      proposerId: proposer.id,
      proposerName: proposer.name,
      deciderId: decider.id,
      deciderName: decider.name,
      decidedAt: s.projectStyleGuideRules.decidedAt,
    })
    .from(s.projectStyleGuideRules)
    .innerJoin(
      s.projectStyleGuideRuleSets,
      eq(s.projectStyleGuideRuleSets.id, s.projectStyleGuideRules.ruleSetVersionId),
    )
    .innerJoin(proposer, eq(proposer.id, s.projectStyleGuideRules.proposedByUserId))
    .leftJoin(decider, eq(decider.id, s.projectStyleGuideRules.decidedByUserId))
    .where(
      and(
        eq(s.projectStyleGuideRuleSets.styleGuideId, styleGuideId),
        isNotNull(s.projectStyleGuideRules.proposalState),
        // 🔒 THE WALL, and it is one predicate with two readings. The OWNER
        // organisation sees every proposal on its own project, because it is
        // the party that decides them and cannot decide what it cannot read.
        // Everyone else sees their OWN organisation's proposals and nothing
        // else — which covers the author, since authorship implies membership.
        // A rival firm's proposal is therefore absent from this query's result,
        // not filtered out of it afterwards.
        ...(owner ? [] : [eq(proposer.organisationId, slice.organisationId)]),
      ),
    )
    .orderBy(desc(s.projectStyleGuideRules.proposedAt));

  const items: RuleProposal[] = rows.map((row) => ({
    id: row.id as Id,
    state: row.state as RuleProposal['state'],
    rule: {
      kind: row.kind,
      origin: 'typed',
      statement: row.statement,
      scope: row.scope,
      exceptedContexts: row.exceptedContexts,
      exceptedTerms: row.exceptedTerms,
      register: row.register,
      enforcement: row.enforcement,
      severity: row.severity,
      payload: row.payload,
    } as RuleProposal['rule'],
    ...(row.supersedesRuleId !== null && { supersedesRuleId: row.supersedesRuleId as Id }),
    proposedBy: { userId: row.proposerId as Id, name: row.proposerName },
    proposedAt: row.proposedAt!.toISOString(),
    decidedBy:
      row.deciderId === null ? null : { userId: row.deciderId as Id, name: row.deciderName! },
    decidedAt: row.decidedAt?.toISOString() ?? null,
  }));

  // assembled, not filtered, at a button: absent for anyone who may not decide
  return { items, ...(owner && c.get('slice').elevated && { mayDecide: true as const }) };
}

/** One proposal's rule, in the shape the save takes. A proposal is always typed. */
function ruleToSave(rule: RuleProposal['rule']) {
  return {
    kind: rule.kind,
    origin: 'typed',
    statement: rule.statement,
    scope: rule.scope,
    exceptedContexts: rule.exceptedContexts,
    exceptedTerms: rule.exceptedTerms,
    register: rule.register,
    enforcement: rule.enforcement,
    severity: rule.severity,
    payload: rule.payload as Record<string, unknown>,
  };
}
