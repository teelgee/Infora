// T-309 — THE DOCUMENT CREATOR'S DAG, over HTTP.
//
// *In plain terms: you pick a template, say what the document is for, choose
// the library documents it may draw on, and say where it goes. Before anything
// is generated you are shown a plan — which steps will run, what they will
// roughly cost, and what the result will and will not cover. Only then does
// anything happen.*
//
// **Two endpoints and one planner.** `/plan` computes and returns; `/runs`
// computes the SAME plan and then executes it. They call one function, for
// T-373's reason applied one surface along: **a preflight computed separately
// from the act it previews is a preflight that will eventually lie.** The plan
// the user saw and the plan the run executed cannot differ, because there is
// only one.
//
// 🔒 **THE PLAN IS CODE, AND THAT IS LOAD-BEARING** (ADR-0053 §4). If a model
// decided the run's shape, the same inputs would produce different plans on
// different days and the workflow could not be `declared` at all — losing the
// one guarantee (same inputs, same steps, same order) a tool is sold on.
//
// **What this endpoint does NOT do.** It resolves no scope of its own. The
// bound sources are version ids the requester named, and an id they cannot
// reach is not a way in: `document_builder` reads their text through the
// assembly gateway, which resolves access as SQL pre-filters in the query that
// fetches the passage — so an unreachable id returns nothing and is reported as
// unreachable, exactly as a reachable one that matched nothing is (T-274's
// rule). Validating the ids here would mean answering *"does this document
// exist"*, which is the question deny-as-404 exists to refuse.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import { documentCreationBody } from '@infora/contracts';
import type {
  ApiError,
  DocumentCreationPlanResponse,
  DocumentCreationRunResponse,
  Id,
  Run,
  ToolPlan,
} from '@infora/contracts';
import { coverageAfter, planDocumentCreation } from '@infora/capabilities';
import type { TemplateRegistry } from '@infora/capabilities';
import { canAccessSandbox } from '@infora/governance';
import type { EntitledSlice } from '@infora/governance';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { ModelRates } from '@infora/model';
import { TOKEN_LIMIT } from '@infora/knowledge';
import { bindWorkflow, WorkflowNotRunnable } from '@infora/workflows';
import type { WorkflowRegistry } from '@infora/workflows';
import {
  CapabilityRefused,
  UNSECTIONED,
  createConversation,
  readRun,
  runChain,
} from '@infora/orchestration';
import type { CapabilityRegistry, ChainLeaves } from '@infora/orchestration';
import type { WorkerRegistry } from '@infora/capabilities';
import { projectScope } from './requester';
import type { AppEnv } from './requester';

export const DOCUMENT_CREATION_WORKFLOW = 'document-creation';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const invalid = (c: Context, detail: string) =>
  c.json({ error: 'invalid', detail } satisfies ApiError, 400);

async function sandboxReachable(db: Db, slice: EntitledSlice, sandboxId: string): Promise<boolean> {
  const [sandbox] = await db.select().from(s.sandboxes).where(eq(s.sandboxes.id, sandboxId)).limit(1);
  if (!sandbox || sandbox.projectId !== slice.projectId) return false;
  const grants = await db
    .select()
    .from(s.sandboxScopeGrants)
    .where(
      and(eq(s.sandboxScopeGrants.sandboxId, sandboxId), isNull(s.sandboxScopeGrants.removedAt)),
    );
  return canAccessSandbox(
    slice,
    grants.map((g) => ({
      granteeType: g.granteeType,
      organisationId: g.organisationId,
      participantId: g.participantId,
      removedAt: g.removedAt,
    })),
  );
}

export function documentCreationRoutes(deps: {
  db: Db;
  leaves: ChainLeaves;
  templates: TemplateRegistry;
  workflows?: WorkflowRegistry;
  capabilities?: CapabilityRegistry;
  workers?: WorkerRegistry;
  authorityShelf?: (organisationId: Id) => Promise<boolean>;
  modelRates?: ModelRates;
  /** the model id the drafting call would be routed to, for the estimate */
  draftModelId?: string;
}) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  /**
   * The one planner both endpoints call. Returns the plan, or the reason the
   * request cannot produce one at all — which is a different thing from the
   * plan's own `refusal` (that one is a real plan saying "do not press this").
   */
  const plan = async (
    c: Context<AppEnv>,
  ): Promise<{ ok: true; plan: ToolPlan; body: ReturnType<typeof documentCreationBody.parse> } | { ok: false; response: Response }> => {
    const parsed = documentCreationBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return {
        ok: false,
        response: invalid(c, 'templateId, brief, sourceVersionIds, destinationSandboxId, title'),
      };
    }
    const workflow = deps.workflows?.get(DOCUMENT_CREATION_WORKFLOW);
    if (workflow === undefined) {
      return { ok: false, response: notFound(c) }; // this deployment carries no creator
    }
    const template = deps.templates.get(parsed.data.templateId);
    if (template === undefined) {
      return {
        ok: false,
        response: invalid(
          c,
          `no document template "${parsed.data.templateId}" — this deployment has: ${deps.templates.ids().join(', ')}`,
        ),
      };
    }
    // the destination is checked here, before the plan is priced: writing
    // somewhere you cannot reach is not a plan with a refusal on it, it is a
    // request about a sandbox that, to this requester, does not exist
    if (!(await sandboxReachable(deps.db, c.get('slice'), parsed.data.destinationSandboxId))) {
      return { ok: false, response: notFound(c) };
    }

    return {
      ok: true,
      body: parsed.data,
      plan: planDocumentCreation({
        workflow,
        template,
        sourceCount: parsed.data.sourceVersionIds.length,
        draftModelId: deps.draftModelId ?? 'unpriced',
        ...(deps.modelRates !== undefined && { rates: deps.modelRates }),
        tokenLimit: TOKEN_LIMIT,
      }),
    };
  };

  app.post('/projects/:projectId/tools/document-creation/plan', project, async (c) => {
    const computed = await plan(c);
    if (!computed.ok) return computed.response;
    return c.json({ plan: computed.plan } satisfies DocumentCreationPlanResponse);
  });

  app.post('/projects/:projectId/tools/document-creation/runs', project, async (c) => {
    const computed = await plan(c);
    if (!computed.ok) return computed.response;
    // ADR-0053 §5 — the refusal is said in the plan, BEFORE any spend, and the
    // run endpoint honours it rather than treating it as advice. A caveat under
    // an empty document is read after the disappointment.
    if (computed.plan.refusal !== null) return invalid(c, computed.plan.refusal);

    const slice = c.get('slice');
    const workflow = deps.workflows!.get(DOCUMENT_CREATION_WORKFLOW)!;
    let bound;
    try {
      bound = bindWorkflow(workflow, {
        template_id: computed.body.templateId,
        brief: computed.body.brief,
        sources: computed.body.sourceVersionIds,
        destination_sandbox_id: computed.body.destinationSandboxId,
        title: computed.body.title,
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

    // the set assembled for THIS requester (T-269), which is what the executor
    // resolves the step's named capability through
    const workers =
      deps.workers?.assemble({
        slice,
        tier: 'standard',
        authorityShelf: (await deps.authorityShelf?.(slice.organisationId)) ?? false,
      }) ?? [];

    let run: Run | null;
    let output: Record<string, unknown>;
    try {
      const executed = await runChain(deps.db, deps.leaves, {
        conversationId: conversation.id as Id,
        request: computed.body.brief,
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
      output = (executed.outputs['build'] as Record<string, unknown>) ?? {};
    } catch (error) {
      if (error instanceof CapabilityRefused) {
        // the entitlement refusal reads as nonexistence, exactly as every other
        // unreachable thing does (principle 4)
        return error.reason === 'not_entitled' ? notFound(c) : invalid(c, error.message);
      }
      throw error;
    }

    const manifest = (output['manifest'] as Array<{ versionId: Id; usedFor: string }>) ?? [];
    // T-402 — the `unsectioned` bucket is NOT a section. The assembly writes the
    // template's own sections and nothing else, so counting the bucket reported
    // a section written into a document that had none. What the run wrote
    // outside the outline is stated separately, below.
    const sectionsWritten = new Set(
      manifest.map((entry) => entry.usedFor).filter((usedFor) => usedFor !== UNSECTIONED),
    ).size;
    const label = (output['label'] as {
      computedLabel: string;
      destinationLabel: string;
      refusal?: string;
    }) ?? { computedLabel: 'unknown', destinationLabel: 'unknown' };
    const withheld = (output['withheld'] as string[]) ?? [];
    const unreachableSources = (output['unreachableSources'] as Id[]) ?? [];

    return c.json(
      {
        run: run!,
        plan: computed.plan,
        // ADR-0053 §5's second statement, in the SAME SHAPE as the first: a
        // reader comparing the two sentences sees the difference at a glance,
        // which is what makes "4 bound sources" becoming "2 sources used" a
        // fact rather than something they have to go looking for.
        coverage: coverageAfter({
          sectionsWritten,
          sectionsPlanned: deps.templates.get(computed.body.templateId)!.sections.length,
          sourcesUsed: new Set(manifest.map((entry) => entry.versionId)).size,
          sourcesBound: computed.body.sourceVersionIds.length,
          unreachableSources: unreachableSources.length,
          withheld: withheld.length,
          outsideOutline: (output['outsideOutline'] as number | undefined) ?? 0,
        }),
        documentId: (output['documentId'] as Id | null) ?? null,
        manifest: manifest.map((entry) => ({ versionId: entry.versionId, usedFor: entry.usedFor })),
        label: {
          computed: label.computedLabel,
          destination: label.destinationLabel,
          refusal: label.refusal ?? null,
        },
        withheld,
        unreachableSources,
      } satisfies DocumentCreationRunResponse,
      201,
    );
  });

  return app;
}
