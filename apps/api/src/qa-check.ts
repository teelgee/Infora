// T-336 — THE QA CHECKER AS A TOOL, over HTTP.
//
// *In plain terms: you pick a draft, pick which checks to run and how hard to
// look, and are shown a plan — which steps will run, roughly what they will
// cost, and exactly what the run will and will not cover. Only then does
// anything happen. Afterwards the same coverage sentence comes back with what
// actually happened in it, beside the findings.*
//
// **Two endpoints and ONE planner**, T-309's rule one tool along: a preflight
// computed separately from the act it previews is a preflight that will
// eventually lie. The plan the user saw and the plan the run executed cannot
// differ, because there is only one function.
//
// 🔒 **THE PLANNER IS CODE, AND THAT IS LOAD-BEARING** (ADR-0053 §4). If a
// model decided the run's shape, the same document would produce different
// plans on different days and the checker could not be a `declared` workflow at
// all — losing the one guarantee (same inputs, same steps, same order) a tool
// is sold on. `planQaCheck` reads the section split, the clause count and the
// chosen parameters, and nothing else.
//
// **A run covers ONE document** (ADR-0053 §1). The marked-up edit is a document
// surface and findings anchor into *a* draft; a set sweep produces a report,
// which ADR-0048 §1 deliberately made the checker not be.
//
// **The editor route is THIS route with its first step pre-filled.** There is
// one run shape and one place the scope is stated; the tool chip in the editor
// opens the same launcher with the document already bound.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import { qaCheckBody } from '@infora/contracts';
import type {
  ApiError,
  Id,
  QaCheckPlanResponse,
  QaCheckRunResponse,
  Run,
} from '@infora/contracts';
import {
  coverageAfterQaCheck,
  planQaCheck,
  splitIntoSections,
  tokensIn,
} from '@infora/capabilities';
import type { DraftFinding, QaCheckPlan, WorkerRegistry } from '@infora/capabilities';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { ModelRates } from '@infora/model';
import { TOKEN_LIMIT } from '@infora/knowledge';
import { bindWorkflow, WorkflowNotRunnable } from '@infora/workflows';
import type { WorkflowRegistry } from '@infora/workflows';
import { CapabilityRefused, createConversation, readRun, runChain } from '@infora/orchestration';
import { readStyleClauses } from '@infora/orchestration';
import type { CapabilityRegistry, ChainLeaves } from '@infora/orchestration';
import { writeFindings } from './findings';
import { projectScope } from './requester';
import type { AppEnv } from './requester';

export const QA_CHECK_WORKFLOW = 'qa-check';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const invalid = (c: Context, detail: string) =>
  c.json({ error: 'invalid', detail } satisfies ApiError, 400);

export function qaCheckRoutes(deps: {
  db: Db;
  leaves: ChainLeaves;
  workflows?: WorkflowRegistry;
  capabilities?: CapabilityRegistry;
  workers?: WorkerRegistry;
  authorityShelf?: (organisationId: Id) => Promise<boolean>;
  modelRates?: ModelRates;
  /** the model the check calls would be routed to, for the estimate */
  checkModelId?: string;
}) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  /**
   * The one planner both endpoints call. Returns the plan and everything the
   * run needs to bind, or the reason the request cannot produce a plan at all
   * — which is a different thing from the plan's own `refusal` (that one is a
   * real plan saying *do not press this*).
   */
  const plan = async (
    c: Context<AppEnv>,
  ): Promise<
    | {
        ok: true;
        computed: QaCheckPlan;
        body: ReturnType<typeof qaCheckBody.parse>;
        sectionCount: number;
        clauseCount: number;
      }
    | { ok: false; response: Response }
  > => {
    const parsed = qaCheckBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return { ok: false, response: invalid(c, 'sandboxDocumentId, families and depth are required') };
    }
    const workflow = deps.workflows?.get(QA_CHECK_WORKFLOW);
    if (workflow === undefined) return { ok: false, response: notFound(c) };

    const slice = c.get('slice');
    // the draft, at the posture every other sandbox-document route holds: the
    // producing organisation's own working area (see `resourceHomes`)
    const [document] = await deps.db
      .select({
        id: s.sandboxDocuments.id,
        content: s.sandboxDocuments.content,
        projectId: s.sandboxDocuments.projectId,
        organisationId: s.sandboxDocuments.organisationId,
      })
      .from(s.sandboxDocuments)
      .where(
        and(
          eq(s.sandboxDocuments.id, parsed.data.sandboxDocumentId),
          isNull(s.sandboxDocuments.deletedAt),
        ),
      )
      .limit(1);
    if (
      document === undefined ||
      document.projectId !== slice.projectId ||
      document.organisationId !== slice.organisationId
    ) {
      return { ok: false, response: notFound(c) };
    }

    const sections = splitIntoSections(document.content);
    if (sections.length === 0) {
      return { ok: false, response: invalid(c, 'this draft is empty — there is nothing to check') };
    }

    // BOTH style sources, together, because the precedence between them is
    // applied by one reader (ADR-0029, ADR-0053 §3) — and the count is what the
    // coverage statement reports as "80 of 80 clauses"
    const clauses = parsed.data.families.includes('style')
      ? await readStyleClauses(deps.db, slice.projectId as Id, slice.organisationId as Id)
      : [];

    return {
      ok: true,
      body: parsed.data,
      sectionCount: sections.length,
      clauseCount: clauses.length,
      computed: planQaCheck({
        workflow,
        sections,
        families: parsed.data.families,
        depth: parsed.data.depth,
        styleClauses: {
          count: clauses.length,
          tokens: clauses.reduce((sum, clause) => sum + tokensIn(clause.text), 0),
        },
        scopedDocuments: parsed.data.scopeVersionIds.length,
        attachedDocuments: parsed.data.attachedDocumentIds.length,
        checkModelId: deps.checkModelId ?? 'unpriced',
        ...(deps.modelRates !== undefined && { rates: deps.modelRates }),
        tokenLimit: TOKEN_LIMIT,
      }),
    };
  };

  app.post('/projects/:projectId/tools/qa-check/plan', project, async (c) => {
    const computed = await plan(c);
    if (!computed.ok) return computed.response;
    return c.json({ plan: computed.computed.plan } satisfies QaCheckPlanResponse);
  });

  app.post('/projects/:projectId/tools/qa-check/runs', project, async (c) => {
    const computed = await plan(c);
    if (!computed.ok) return computed.response;
    const { plan: toolPlan, passes, groups, measures } = computed.computed;
    // ADR-0053 §5 — the refusal is said in the plan, BEFORE any spend, and the
    // run endpoint honours it rather than treating it as advice
    if (toolPlan.refusal !== null) return invalid(c, toolPlan.refusal);

    const slice = c.get('slice');
    const workflow = deps.workflows!.get(QA_CHECK_WORKFLOW)!;
    let bound;
    try {
      bound = bindWorkflow(workflow, {
        sandbox_document_id: computed.body.sandboxDocumentId,
        // 🔒 the fan-out widths, computed in CODE by the planner above. The
        // validator has already refused a `fan_out` reading a step's output,
        // so this is the only door a width comes through.
        passes,
        groups,
        measures,
        families: computed.body.families.join(','),
        depth: computed.body.depth,
        scope_version_ids: computed.body.scopeVersionIds,
        attached_document_ids: computed.body.attachedDocumentIds,
        template_id: computed.body.templateId ?? '',
        readability_target: 14,
      });
    } catch (error) {
      if (!(error instanceof WorkflowNotRunnable)) throw error;
      return invalid(c, error.message);
    }

    // A tool run is a run, so it gets a Conversation like any other — the
    // Run/Step tree has one shape (ADR-0028 §1) and a second one for tools
    // would be a second audit story.
    const conversation = await createConversation(deps.db, {
      projectId: slice.projectId,
      surface: 'web',
    });
    const workers =
      deps.workers?.assemble({
        slice,
        tier: 'standard',
        authorityShelf: (await deps.authorityShelf?.(slice.organisationId)) ?? false,
      }) ?? [];

    let run: Run | null;
    let outputs: Record<string, unknown>;
    try {
      const executed = await runChain(deps.db, deps.leaves, {
        conversationId: conversation.id as Id,
        request: `Check ${computed.body.sandboxDocumentId} — ${computed.body.families.join(', ')}, ${computed.body.depth}`,
        environmentKey: slice.projectId,
        requesterParticipantId: slice.participantId,
        workflow: {
          id: bound.workflowId,
          version: bound.workflowVersion,
          writes: bound.writes,
          ...(bound.labelPropagation !== undefined && { labelPropagation: bound.labelPropagation }),
        },
        stages: bound.stages,
        ...(deps.capabilities !== undefined && { capabilities: deps.capabilities }),
        entitledCapabilities: workers.map((worker) => worker.name),
        mode: 'declared',
      });
      run = await readRun(deps.db, executed.run.id);
      outputs = executed.outputs;
    } catch (error) {
      if (error instanceof CapabilityRefused) {
        // the entitlement refusal reads as nonexistence, exactly as every other
        // unreachable thing does (principle 4)
        return error.reason === 'not_entitled' ? notFound(c) : invalid(c, error.message);
      }
      throw error;
    }

    const gathered = gather(outputs);
    // ADR-0048 §3 — the findings are written, and a proposed fix becomes a
    // Suggestion at the store, where `classifyFix` decides whether it may ever
    // ride an accept-all. The checker acquires no write path of its own.
    const findings = await writeFindings(deps.db, {
      runId: run!.id as Id,
      sandboxDocumentId: computed.body.sandboxDocumentId,
      findings: gathered.findings,
    });

    return c.json(
      {
        run: run!,
        plan: toolPlan,
        // ADR-0053 §5's second statement, in the SAME SHAPE as the first
        coverage: coverageAfterQaCheck({
          sectionsRead: gathered.sectionsRead,
          sectionsPlanned: computed.sectionCount,
          checksRun: computed.body.families.length,
          clausesRead: gathered.clausesRead,
          clausesTotal: computed.clauseCount,
          clausePasses: gathered.clausePasses,
          passagesRead: gathered.passagesRead,
          sectionsWithNoPassages: gathered.sectionsWithNoPassages,
          attachedRead: gathered.attachedRead,
          discarded: gathered.discarded,
          contradictionGroups: Math.max(1, groups.length),
        }),
        findings,
      } satisfies QaCheckRunResponse,
      201,
    );
  });

  return app;
}

/**
 * What the steps produced, added up.
 *
 * 🔒 **The absences are counted as carefully as the findings**, because the
 * coverage statement is the only thing distinguishing a clean result from an
 * unexamined one. A section the library said nothing about, and a suggested
 * finding the admission rules discarded, are both facts the findings list
 * cannot show — and both are the difference between *"nothing is wrong"* and
 * *"we did not look"*.
 */
function gather(outputs: Record<string, unknown>) {
  const findings: DraftFinding[] = [];
  let sectionsRead = 0;
  let clausesRead = 0;
  let passagesRead = 0;
  let sectionsWithNoPassages = 0;
  let attachedRead = 0;
  let discarded = 0;
  const sectionsSeen = new Set<number>();

  for (const [key, value] of Object.entries(outputs)) {
    if (value === null || typeof value !== 'object') continue;
    const output = value as {
      findings?: unknown;
      section?: unknown;
      coverage?: Record<string, unknown>;
    };
    if (Array.isArray(output.findings)) findings.push(...(output.findings as DraftFinding[]));
    const coverage = output.coverage;
    if (coverage === undefined) continue;

    if (key.startsWith('check')) {
      if (typeof output.section === 'number') sectionsSeen.add(output.section);
      const read = numberOf(coverage['clausesRead']);
      if (read > clausesRead) clausesRead = read;
      const passages = numberOf(coverage['passagesRead']);
      passagesRead += passages;
      if (passages === 0) sectionsWithNoPassages += 1;
      attachedRead += numberOf(coverage['excerptsRead']);
      const drops = coverage['discarded'] as Record<string, unknown> | undefined;
      if (drops !== undefined) {
        discarded +=
          numberOf(drops['unanchored']) + numberOf(drops['unknownRule']) + numberOf(drops['unknownSource']);
      }
    }
    if (key.startsWith('compare')) discarded += numberOf(coverage['discarded']);
    // `measure` fans out, so its key is `measure#0` — matching on the exact id
    // silently left the section count at zero and the run reported reading one
    // section of six. Found in the walkthrough capture, where the sentence is
    // the whole beat.
    if (key.startsWith('measure')) {
      sectionsRead = Math.max(sectionsRead, numberOf(coverage['sections']));
    }
  }

  // the clause passes actually taken, read back off the plan's own fan-out:
  // one unit run twice is two passes over the same clauses
  const perSection = new Map<number, number>();
  for (const key of Object.keys(outputs)) {
    if (!key.startsWith('check')) continue;
    const output = outputs[key] as { section?: unknown };
    const section = typeof output.section === 'number' ? output.section : 0;
    perSection.set(section, (perSection.get(section) ?? 0) + 1);
  }
  const clausePasses = Math.max(1, ...perSection.values());

  return {
    findings,
    // 🔒 SECTION 0 IS THE WHOLE DRAFT (the short shape), so a run that read it
    // read every section — reporting "1 of 6 sections read" would understate
    // the coverage, and understating it is the same class of error as
    // overstating it: the sentence stops describing the run.
    sectionsRead: sectionsSeen.has(0)
      ? sectionsRead
      : Math.max(sectionsRead > 0 ? sectionsSeen.size : 0, sectionsSeen.size),
    clausesRead,
    clausePasses,
    passagesRead,
    sectionsWithNoPassages,
    attachedRead,
    discarded,
  };
}

const numberOf = (value: unknown): number => (typeof value === 'number' ? value : 0);
