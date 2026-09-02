// T-424 — THE RULES WORKBENCH, over HTTP (ADR-0054 decisions 2, 4 and 5).
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
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ApiError, ExtractionReport, ProposedRule } from '@infora/contracts';
import { DOCUMENT_LANGUAGES } from '@infora/contracts';
import {
  admitExtractedRules,
  composeRuleExtractionPrompt,
  fillGaps,
} from '@infora/capabilities';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { Router } from '@infora/model';
import { projectScope } from './requester';
import type { AppEnv } from './requester';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const invalid = (c: Context, detail: string) =>
  c.json({ error: 'invalid', detail } satisfies ApiError, 400);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

const register = z.enum([...DOCUMENT_LANGUAGES, 'all']);

/**
 * The three creation parameters, and deliberately no more (decision 2): the
 * name (which is the guide's own title, set when it is loaded), whether Infora
 * fills the gaps, and the default severity. `registers` is the fourth answer on
 * the screen and is not a parameter of the same kind — it says which registers
 * the set must cover, which is what gap-filling is computed against.
 *
 * *Considered and left out: which document types a set applies to, and spelling
 * variety — the first is a second axis nobody has asked for, the second is a
 * pattern rule.*
 */
export const extractionBody = z.object({
  registers: z.array(register).min(1),
  fillGaps: z.boolean(),
  defaultSeverity: z.enum(['required', 'advisory']),
});

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
      const guide = await guideOf(c);
      if (guide === null) return notFound(c);
      const parsed = extractionBody.safeParse(await c.req.json().catch(() => null));
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

  return app;
}
