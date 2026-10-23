// T-046 — conversations, runs and work items live over HTTP; the full chain
// callable. Read scope per the 2026-07-12 ruling (supersedes 2026-07-06's
// project-record read): every Run is readable by its producing organisation
// only. The record is retained background data — the consultant carries the
// professional liability for the work product, and the client reviews the
// *document* through the review cycle, never the agent's internals.
// Everything else is the same not_found as nonexistence.
import { Hono } from 'hono';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import {
  createConversationBody,
  createRunBody,
  openRunInEditorBody,
  rerunPlanBody,
} from '@infora/contracts';
import type {
  ApiError,
  DestinationCheckResponse,
  GetHistoryResponse,
  PlanMode,
  GetRunPlanResponse,
  HistoryEntry,
  RerunPlanResponse,
  Id,
  ListLensesResponse,
  Run,
  WorkItem,
} from '@infora/contracts';
import { eq as dEq } from 'drizzle-orm';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { canAccessSandbox, checkPropagation } from '@infora/governance';
import type { Attenuation, EntitledSlice } from '@infora/governance';
import type { LensRegistry } from '@infora/lenses';
import { bindWorkflow, WorkflowNotRunnable } from '@infora/workflows';
import type { WorkflowRegistry } from '@infora/workflows';
import { classify } from '@infora/capabilities';
import type { Classifier, WorkerRegistry } from '@infora/capabilities';
import { runSourceAudience, sandboxAudience } from '@infora/knowledge';
import {
  canRerunPlan,
  CapabilityRefused,
  createConversation,
  PlanNotExecutable,
  readPlanForRun,
  readRun,
  readRunContext,
  RunHalted,
  runChain,
} from '@infora/orchestration';
import type { CapabilityRegistry, ChainLeaves, Revalidate, RunRow } from '@infora/orchestration';
import { projectScope, resolveSlice, resourceHomes, resourceScope } from './requester';
import type { AppEnv } from './requester';
import { resolveSession } from './sessions';
import { DEFAULT_SESSION_POLICY } from './sessions';
import type { SessionPolicy } from './sessions';
import { ensureDefaultSandbox, toSandboxDocument } from './sandbox';
import { refuseIfOff } from './ai-features';

const notFound = { error: 'not_found' } satisfies ApiError;
const invalid = (detail: string) => ({ error: 'invalid', detail }) satisfies ApiError;

/**
 * T-249's propagation decision, in one place — because T-295 needs it twice.
 *
 * The destination selector warns **before** the click and the write enforces
 * **at** the click, and the two must be the same judgement: T-373's rule from
 * the promotion window applies here exactly. Both labels are computed from the
 * access facts as they stand, never from a stored value that could have gone
 * stale behind a revoked share (T-249).
 */
async function propagationVerdict(db: Db, runId: string, sandboxId: string) {
  const source = await runSourceAudience(db, runId);
  const destination = await sandboxAudience(db, sandboxId);
  return checkPropagation(source, destination);
}

export function runRoutes(deps: {
  db: Db;
  leaves: ChainLeaves;
  lenses?: LensRegistry;
  defaultLensId?: string | null;
  sessionPolicy?: SessionPolicy;
  /**
   * T-265 — the declared workflows this deployment carries, resolved at
   * composition for the same reason the Lens registry is: production reads the
   * definitions once and freezes them, so a workflow cannot change underneath
   * a run already recording which version of it produced the answer.
   */
  workflows?: WorkflowRegistry;
  /**
   * T-266 — superseded `askWorkflowId` as the DEFAULT path: a turn is now
   * classified rather than assigned. Kept because a deployment may still pin
   * one workflow to Ask, which is what it did between T-265 and T-266.
   */
  askWorkflowId?: string;
  /** T-269 — the workers this deployment has built, assembled per request. */
  workers?: WorkerRegistry;
  /**
   * T-266 — the model classifier, injected. Absent means the deterministic
   * default, which is not a stub: with one declared workflow whose parameter
   * is the question itself, asking a frontier model to choose among one option
   * is spending money to be less reliable (ADR-0027).
   */
  classifier?: Classifier;
  /** T-269 — whether this organisation holds an authority shelf (ADR-0023). */
  authorityShelf?: (organisationId: Id) => Promise<boolean>;
  /**
   * T-292 — a retrieve leaf built on an assembler NARROWER than the
   * requester's own, for the Data sources chip's refinement.
   *
   * A factory rather than a parameter on the bound leaf, because that is where
   * T-248 put the guarantee: the narrowing is a construction argument to
   * `createAssembler`, `attenuate` is monotonic, and there is therefore no
   * route from the narrowed assembler back to the wider one. A refinement a
   * user set cannot be quietly widened by a later step. Absent means the
   * deployment offers no refinement, and the request field is then ignored
   * rather than silently honoured by a different path.
   */
  narrowedRetrieve?: (narrowing: Attenuation) => ChainLeaves['retrieve'];
  /**
   * T-396 — the closed registry of built capabilities the executor dispatches
   * over (ADR-0053 §7). Absent means this deployment executes none, and a plan
   * step naming one is refused rather than silently running the orchestrator's
   * own leaf.
   */
  capabilities?: CapabilityRegistry;
}) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  // T-283 — what the Lens picker may offer.
  //
  // NOT project-scoped and not access-resolved, deliberately: the Lens set is a
  // property of the deployment and is identical for every requester. A list
  // that differed by who asked would make a Lens a reach control, which is the
  // one thing it must never be. It still sits behind the session middleware —
  // an anonymous caller has no business enumerating a deployment's
  // configuration — and carries SUMMARIES only, because prohibitions and worked
  // exchanges are prompt material and do not leave the server.
  app.get('/lenses', (c) =>
    c.json({
      lenses: deps.lenses?.summaries() ?? [],
      // config, never code. A deployment that names none offers the shared
      // core — the state the product shipped in before Lenses existed.
      defaultLensId:
        deps.defaultLensId !== undefined && deps.defaultLensId !== null && deps.lenses?.has(deps.defaultLensId) === true
          ? deps.defaultLensId
          : null,
    } satisfies ListLensesResponse),
  );

  app.post('/projects/:projectId/conversations', project, async (c) => {
    const body = createConversationBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json(invalid('surface required'), 400);
    const slice = c.get('slice');

    if (body.data.workItemId !== undefined) {
      const home = await resourceHomes.workItem(deps.db, body.data.workItemId);
      if (home?.projectId !== slice.projectId) return c.json(notFound, 404); // principle 4
    }

    // a document-bound conversation is the multiplayer thread (ADR-0039); the
    // targeted document must be visible to the requester (org-private in the
    // skeleton) — another org's sandbox document "does not exist"
    if (body.data.sandboxDocumentId !== undefined) {
      const home = await resourceHomes.sandboxDocument(deps.db, body.data.sandboxDocumentId);
      if (home?.projectId !== slice.projectId || home.organisationId !== slice.organisationId) {
        return c.json(notFound, 404);
      }
    }

    const conversation = await createConversation(deps.db, {
      projectId: slice.projectId,
      surface: body.data.surface,
      workItemId: body.data.workItemId ?? null,
      sandboxDocumentId: body.data.sandboxDocumentId ?? null,
    });
    return c.json({ conversationId: conversation.id }, 201);
  });

  app.post(
    '/conversations/:conversationId/runs',
    resourceScope(deps, 'conversationId', resourceHomes.conversation),
    async (c) => {
      const body = createRunBody.safeParse(await c.req.json().catch(() => null));
      if (!body.success) return c.json(invalid('request text required'), 400);
      const slice = c.get('slice');
      // T-463 — the project's switch: a run on a document is drafting, a run
      // without one is Ask; either may be off on this project
      const [conv] = await deps.db
        .select({ sandboxDocumentId: s.conversations.sandboxDocumentId })
        .from(s.conversations)
        .where(eq(s.conversations.id, c.req.param('conversationId')))
        .limit(1);
      const drafting = body.data.sandboxDocumentId !== undefined || (conv?.sandboxDocumentId ?? null) !== null;
      const off = await refuseIfOff(c, deps.db, slice.projectId, drafting ? 'drafting' : 'ask');
      if (off) return off;

      if (body.data.sandboxDocumentId !== undefined) {
        const home = await resourceHomes.sandboxDocument(deps.db, body.data.sandboxDocumentId);
        if (home?.projectId !== slice.projectId || home.organisationId !== slice.organisationId) {
          return c.json(notFound, 404); // another org's sandbox "does not exist"
        }
      }

      // T-299 — resolve the Lens BEFORE the run opens. An id this deployment
      // does not carry is a 400 and never a quiet fall-back to a default: a
      // user who asked for the Communications register and silently got the
      // planning one gets an answer that reads plausibly and is wrong for
      // them, which is worse than being told the id is not available. In
      // production the registry holds no drafts, so a draft id lands here too.
      // A `400` rather than a `404`: the Lens set is not access-controlled —
      // every requester is offered the same one — so nothing leaks by saying
      // the id is unknown, and `not_found` would wrongly imply it might exist
      // for someone else.
      let lens = null;
      if (body.data.lensId !== undefined) {
        lens = deps.lenses?.get(body.data.lensId) ?? null;
        if (lens === null) return c.json(invalid(`unknown lens: ${body.data.lensId}`), 400);
      }

      // T-252 — the re-check the chain calls before each step. It is built
      // HERE, at the boundary that resolves permissions, and handed down as a
      // predicate: the chain does not resolve its own permissions (component
      // 2), and this seam can only ever refuse a step, never widen one.
      const user = c.get('user');
      const sessionId = c.get('sessionId');
      const revalidate: Revalidate = async () => {
        // the session first: it is the cheaper check and the one an account
        // action (T-251's revocation) moves
        const session = await resolveSession(
          deps.db,
          sessionId,
          deps.sessionPolicy ?? DEFAULT_SESSION_POLICY,
        );
        if (!session.live) return { ok: false, reason: 'session_ended' };
        // then the entitlement, re-derived from the access facts as they stand
        // — the colocated store's immediate-effect property (ADR-0024) is what
        // makes this meaningful: a revoked Participant is gone from the next
        // read, not from the next cache expiry
        const current = await resolveSlice(deps.db, user, slice.projectId);
        if (current === null) return { ok: false, reason: 'entitlement_lost' };
        return { ok: true };
      };

      // ── T-266: classify, then run what the classification chose ──────────
      //
      // The worker set is ASSEMBLED FOR THIS REQUESTER before the classifier
      // sees it (T-269), so the model is never told about a worker this user
      // is not entitled to — the assembled-not-filtered rule reaching the one
      // place it would be easiest to lose.
      const workers =
        deps.workers?.assemble({
          slice,
          tier: 'standard',
          authorityShelf: (await deps.authorityShelf?.(slice.organisationId)) ?? false,
        }) ?? [];

      let declared: Parameters<typeof runChain>[2]['workflow'] = null;
      let stages: Parameters<typeof runChain>[2]['stages'];
      let mode: PlanMode = 'declared';
      let assumptions: string[] = [];

      // A deployment that pinned one workflow (the T-265 shape) keeps it; one
      // carrying a registry classifies. Both end in the same three variables,
      // and a deployment with neither runs the coded chain unchanged.
      const pinned =
        deps.askWorkflowId === undefined ? undefined : deps.workflows?.get(deps.askWorkflowId);
      // T-309 — **a chat turn is never classified into a workflow that WRITES.**
      // The document creator is a tool the user launches deliberately, with a
      // destination chosen and a plan seen first; a question that silently
      // started writing a document into a sandbox would decide who can read the
      // result (T-295) on the user's behalf, off a classification they never
      // saw. So the candidate set is the read-only workflows, and the writing
      // ones are reached through their own launcher.
      //
      // T-336 — **and never into a workflow whose SHAPE a planner computes.**
      // A fan-out's width comes from a bound `id_list` that ordinary code works
      // out before the run (T-396's rule 6), and a chat turn runs no planner —
      // so a classifier that matched the checker would bind a width of zero and
      // report success over a run that did nothing, or fail on an unbound list
      // in front of somebody who only asked a question. The checker is a tool
      // its user launches deliberately, with the plan seen first; that is the
      // whole of ADR-0053 §4, and this is where it holds for the Ask path.
      const available = (deps.workflows?.list() ?? []).filter(
        (candidate) =>
          candidate.writes === 'none' && !candidate.steps.some((step) => step.fanOut !== undefined),
      );

      const outcome =
        pinned !== undefined
          ? ({ outcome: 'declared', workflowId: pinned.id, parameters: { question: body.data.request } } as const)
          : available.length === 0
            ? undefined
            : await classify({
                question: body.data.request,
                workflows: available,
                workers,
                ...(deps.classifier !== undefined && { classifier: deps.classifier }),
              });

      if (outcome?.outcome === 'out_of_scope') {
        // Say so, AND SAY WHY. A refusal a user cannot act on reads as a broken
        // system rather than a careful one — the same rule the label-propagation
        // refusal follows. Where an out-of-scope refusal belongs in the RUN
        // RECORD is unruled and is `Q-048`; nothing is written today, which is
        // the reversible choice.
        return c.json({ error: 'invalid', detail: outcome.reason } satisfies ApiError, 400);
      }

      if (outcome?.outcome === 'model_chosen') {
        mode = 'model_chosen';
        stages = outcome.stages;
      } else if (outcome !== undefined) {
        const workflow = deps.workflows!.get(outcome.workflowId)!;
        if (outcome.outcome === 'clarify') {
          // Wave 6's clarification dialogue is deferred beyond V1, so V1 does
          // what Wave 6 specifies for a user who SKIPS every question: proceed
          // on stated assumptions, named at the top of the answer rather than
          // in a footer. The plan carries them as evidence.
          assumptions = outcome.assumptions;
        }
        try {
          const bound = bindWorkflow(workflow, outcome.parameters);
          // T-396 — `writes` and the label-propagation declaration travel to
          // the executor, which is where validator rule 4 finally bites: a
          // capability that writes runs only inside a workflow that declared
          // both.
          declared = {
            id: bound.workflowId,
            version: bound.workflowVersion,
            writes: bound.writes,
            ...(bound.labelPropagation !== undefined && {
              labelPropagation: bound.labelPropagation,
            }),
          };
          stages = bound.stages;
        } catch (error) {
          if (!(error instanceof WorkflowNotRunnable)) throw error;
          // A declared workflow that cannot be bound is a 400 naming the
          // parameter, never a quiet fall-through to the coded chain: falling
          // through would answer the question under a plan the user did not
          // get, which is the labelling failure this slice exists to avoid.
          return c.json(invalid(error.message), 400);
        }
      }

      // T-292 — the Data sources refinement. **It can only remove.** The ids
      // are handed to `attenuate` and intersected INTO the grounded
      // pre-filter's own `and()` (T-248), so an id the requester cannot reach
      // is not a way in — it narrows the set exactly as a reachable one does.
      // No validation of the ids is needed or wanted for that reason: checking
      // them would mean answering "does this container exist", which is the
      // question deny-as-404 exists to refuse.
      const refinement = body.data.sourceContainerIds;
      const leaves =
        refinement === undefined || deps.narrowedRetrieve === undefined
          ? deps.leaves
          : { ...deps.leaves, retrieve: deps.narrowedRetrieve({ containerIds: refinement }) };

      let run: RunRow;
      try {
        ({ run } = await runChain(deps.db, leaves, {
          conversationId: c.req.param('conversationId'),
          request: body.data.request,
          environmentKey: slice.projectId,
          requesterParticipantId: slice.participantId,
          sandboxDocumentId: body.data.sandboxDocumentId ?? null,
          lens,
          revalidate,
          workflow: declared,
          ...(stages !== undefined && { stages }),
          // T-396 — the executor, and the set assembled for THIS requester.
          // The chain does not resolve its own permissions: it is handed the
          // names and can only refuse against them (component 2's rule, the
          // same seam T-252 uses for revalidation).
          ...(deps.capabilities !== undefined && { capabilities: deps.capabilities }),
          entitledCapabilities: workers.map((worker) => worker.name),
          mode,
          assumptions,
        }));
      } catch (error) {
        if (error instanceof CapabilityRefused) {
          // The entitlement refusal reads as nonexistence, exactly as every
          // other unreachable thing does (principle 4): telling a requester
          // that a capability exists but is not theirs is the "absent, never
          // disabled" rule failing at the last step. The other two reasons are
          // deployment/authoring defects and say what is wrong.
          return error.reason === 'not_entitled'
            ? c.json(notFound, 404)
            : c.json(invalid(error.message), 400);
        }
        if (!(error instanceof RunHalted)) throw error;
        // 401 for a session that ended, 404 for entitlement lost. The second is
        // deliberate and not a softening: once the requester cannot reach the
        // project, the project reads as nonexistent to them, and a distinct
        // status would tell someone just removed from a project that it is
        // still there (principle 4).
        return error.reason === 'session_ended'
          ? c.json({ error: 'unauthenticated' } satisfies ApiError, 401)
          : c.json(notFound, 404);
      }
      return c.json((await readRun(deps.db, run.id)) satisfies Run | null, 201);
    },
  );

  // T-249 — carrying an answer into the editor, with the label enforced
  // (finding F2, finding F2). This exists as a server-side path precisely
  // BECAUSE the old client flow — create a document, then PATCH the answer in —
  // told the server nothing about where the content came from. Provenance the
  // server cannot see is provenance it cannot enforce.
  app.post(
    '/runs/:runId/sandbox-document',
    resourceScope(deps, 'runId', resourceHomes.run),
    async (c) => {
      const body = openRunInEditorBody.safeParse(await c.req.json().catch(() => ({})));
      if (!body.success) return c.json(invalid('title, sandboxId, folderId, override'), 400);
      const slice = c.get('slice');
      const runId = c.req.param('runId');

      const [run] = await deps.db.select().from(s.runs).where(eq(s.runs.id, runId)).limit(1);
      if (!run || !(await runVisibleTo(deps.db, run, slice))) return c.json(notFound, 404);
      // your own answer, into your own document: a colleague reading the run
      // may not carry it anywhere, because the resulting document would be
      // attributed to them while resting on someone else's request
      if (run.requesterParticipantId !== slice.participantId) return c.json(notFound, 404);

      const sandboxId =
        body.data.sandboxId ??
        (await ensureDefaultSandbox(deps.db, slice.projectId, slice.organisationId, slice.participantId));
      const [sandbox] = await deps.db
        .select()
        .from(s.sandboxes)
        .where(eq(s.sandboxes.id, sandboxId))
        .limit(1);
      const grants = sandbox
        ? await deps.db
            .select()
            .from(s.sandboxScopeGrants)
            .where(
              and(
                eq(s.sandboxScopeGrants.sandboxId, sandbox.id),
                isNull(s.sandboxScopeGrants.removedAt),
              ),
            )
        : [];
      if (!sandbox || sandbox.projectId !== slice.projectId || !canAccessSandbox(slice, grants)) {
        return c.json(notFound, 404);
      }

      // the label, computed from the access facts as they stand — never a
      // stored value that could have gone stale behind a revoked share.
      // T-295: the SAME call the destination selector's preflight makes, for
      // T-373's reason one slice along — a preflight computed separately from
      // the act it previews is a preflight that will eventually lie.
      const verdict = await propagationVerdict(deps.db, runId, sandboxId);

      if (!verdict.allowed && body.data.override === undefined) {
        // named in full: a refusal a user cannot act on reads as a broken
        // system rather than a careful one
        return c.json(
          { error: 'forbidden', detail: verdict.reason } satisfies ApiError,
          403,
        );
      }

      const title =
        body.data.title ?? (run.request.length > 60 ? `${run.request.slice(0, 57)}…` : run.request);
      const document = await deps.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(s.sandboxDocuments)
          .values({
            projectId: slice.projectId,
            organisationId: slice.organisationId,
            sandboxId,
            folderId: body.data.folderId ?? null,
            title,
            content: run.response ?? '',
            createdByParticipantId: slice.participantId,
          })
          .returning();
        if (!verdict.allowed) {
          // the override and the write land together: an override recorded
          // separately could be lost while the widened content stood
          await tx.insert(s.labelOverrides).values({
            runId,
            destinationKind: 'sandbox_document',
            destinationId: row!.id,
            sourceLabel: verdict.source,
            destinationLabel: verdict.destination,
            reason: body.data.override!.reason,
            overriddenByParticipantId: slice.participantId,
          });
        }
        await tx.insert(s.sandboxDocumentVersions).values({
          sandboxDocumentId: row!.id,
          content: row!.content,
          createdByParticipantId: slice.participantId,
        });
        return row!;
      });

      return c.json(toSandboxDocument(document), 201);
    },
  );

  // T-295 — the destination selector's preflight. Same run scope as the write
  // it previews, and the same refusal shape: a colleague who may READ the run
  // may not carry it anywhere, so they may not preview carrying it either.
  app.get(
    '/runs/:runId/destination-check',
    resourceScope(deps, 'runId', resourceHomes.run),
    async (c) => {
      const slice = c.get('slice');
      const runId = c.req.param('runId');
      const sandboxId = c.req.query('sandboxId');
      if (sandboxId === undefined) return c.json(invalid('sandboxId required'), 400);

      const [run] = await deps.db.select().from(s.runs).where(eq(s.runs.id, runId)).limit(1);
      if (!run || !(await runVisibleTo(deps.db, run, slice))) return c.json(notFound, 404);
      if (run.requesterParticipantId !== slice.participantId) return c.json(notFound, 404);

      // the destination must admit the requester exactly as the write demands
      // — previewing a sandbox you cannot reach would answer a question about
      // a place that, to you, does not exist
      const [sandbox] = await deps.db
        .select()
        .from(s.sandboxes)
        .where(eq(s.sandboxes.id, sandboxId))
        .limit(1);
      const grants = sandbox
        ? await deps.db
            .select()
            .from(s.sandboxScopeGrants)
            .where(
              and(
                eq(s.sandboxScopeGrants.sandboxId, sandbox.id),
                isNull(s.sandboxScopeGrants.removedAt),
              ),
            )
        : [];
      if (!sandbox || sandbox.projectId !== slice.projectId || !canAccessSandbox(slice, grants)) {
        return c.json(notFound, 404);
      }

      const verdict = await propagationVerdict(deps.db, runId, sandboxId);
      return c.json({
        allowed: verdict.allowed,
        sourceLabel: verdict.source,
        destinationLabel: verdict.destination,
        ...(verdict.allowed ? {} : { reason: verdict.reason }),
      } satisfies DestinationCheckResponse);
    },
  );

  app.get('/runs/:runId', resourceScope(deps, 'runId', resourceHomes.run), async (c) => {
    const runId = c.req.param('runId');
    const [run] = await deps.db.select().from(s.runs).where(eq(s.runs.id, runId)).limit(1);
    if (!run || !(await runVisibleTo(deps.db, run, c.get('slice')))) return c.json(notFound, 404);
    return c.json(await readRun(deps.db, runId));
  });

  // T-253 — the assembled context this run saw, at passage grain
  // (finding F5). Producer-private on exactly the run's own scope: the
  // passages are the client's documents, and this read is the producer's
  // evidence of what its agent was shown, never a second route into the corpus.
  app.get('/runs/:runId/context', resourceScope(deps, 'runId', resourceHomes.run), async (c) => {
    const runId = c.req.param('runId');
    const [run] = await deps.db.select().from(s.runs).where(eq(s.runs.id, runId)).limit(1);
    if (!run || !(await runVisibleTo(deps.db, run, c.get('slice')))) return c.json(notFound, 404);
    return c.json(await readRunContext(deps.db, runId));
  });

  // T-261 — the plan a run performed. **The plan inherits the run's read scope
  // exactly**: same `resourceScope`, same `runVisibleTo`, same 404 as
  // nonexistence for another organisation. Nothing here is a second, softer
  // route into the run record — the plan IS the run's internals, and the
  // 2026-07-12 ruling keeps those producer-private, with the client reviewing
  // the *document* through the review cycle.
  app.get('/runs/:runId/plan', resourceScope(deps, 'runId', resourceHomes.run), async (c) => {
    const runId = c.req.param('runId');
    const slice = c.get('slice');
    const [run] = await deps.db.select().from(s.runs).where(eq(s.runs.id, runId)).limit(1);
    if (!run || !(await runVisibleTo(deps.db, run, slice))) return c.json(notFound, 404);

    const plan = await readPlanForRun(deps.db, runId);
    // A run with no plan is a 404 rather than a null body: every run the chain
    // drives writes one (T-260), so its absence means this is not a run whose
    // plan exists to be read — a sub-agent's child run, which executes inside a
    // step of its parent's plan and carries none of its own.
    if (!plan) return c.json(notFound, 404);

    return c.json({
      plan,
      // read ≠ re-run, and the difference is decided on the RECORD's requester
      // rather than the caller's claim: a colleague may read this and may not
      // re-run it as themselves, because a re-run is a new Run with a new
      // requester and the audit has to say whose question it was.
      canRerun: canRerunPlan(plan, slice.participantId),
    } satisfies GetRunPlanResponse);
  });

  // T-267 — edit the plan, then run it again.
  //
  // SUPERSESSION, NOT MUTATION: a new run with a new plan, and the old plan
  // marked `superseded` pointing at it. A plan is evidence, and "what did your
  // AI do" has to survive the user editing it afterwards.
  app.post('/runs/:runId/plan/rerun', resourceScope(deps, 'runId', resourceHomes.run), async (c) => {
    const runId = c.req.param('runId');
    const slice = c.get('slice');
    const [previous] = await deps.db.select().from(s.runs).where(eq(s.runs.id, runId)).limit(1);
    if (!previous || !(await runVisibleTo(deps.db, previous, slice))) return c.json(notFound, 404);

    const plan = await readPlanForRun(deps.db, runId);
    if (!plan) return c.json(notFound, 404);

    // Read and re-run are different rights on one record (T-261). A 403 rather
    // than a 404 because this caller can already READ the plan — telling them
    // it does not exist would be a lie they can check, and principle 4 exists
    // to hide what someone cannot see, not to confuse them about what they can.
    if (!canRerunPlan(plan, slice.participantId)) {
      return c.json(
        {
          error: 'forbidden',
          detail:
            're-running is a new Run with a new requester, so only the participant who asked the original question may re-run their own plan',
        } satisfies ApiError,
        403,
      );
    }

    const raw = (await c.req.json().catch(() => null)) as unknown;
    // Refused BY NAME rather than as an unknown field, exactly as the workflow
    // validator does: a step's scope derives from the run's EntitledSlice and
    // is not an editable field, so there is no correct spelling of it.
    const scopeField = namedScopeField(raw);
    if (scopeField !== null) {
      return c.json(
        invalid(
          `a plan step may not declare '${scopeField}'. Scope derives from the run's entitled slice and is not editable, so editing a plan cannot widen what it reaches — there is no correct spelling of this field`,
        ),
        400,
      );
    }

    const body = rerunPlanBody.safeParse(raw);
    if (!body.success) return c.json(invalid('steps: stage, worker?, inputs?'), 400);

    // The offered set is the ASSEMBLED set (T-269), so editing cannot reach a
    // worker the requester is not entitled to — the entitlement bound stated
    // as the only list a name may come from.
    const entitled =
      deps.workers?.assemble({
        slice,
        tier: 'standard',
        authorityShelf: (await deps.authorityShelf?.(slice.organisationId)) ?? false,
      }) ?? [];
    const names = entitled.map((worker) => worker.name);

    for (const [index, step] of body.data.steps.entries()) {
      if (step.stage === 'verify' && step.worker != null) {
        return c.json(
          invalid(
            `steps[${index}]: a verify step may not name a worker. The ground-check is code that runs outside the plan on every answer, and this step is its record`,
          ),
          400,
        );
      }
      if (step.worker != null && !names.includes(step.worker)) {
        // named, with what IS available — which is this requester's own set, so
        // nothing about anyone else's entitlement leaks by saying it
        return c.json(
          invalid(
            `steps[${index}]: '${step.worker}' is not a worker you can use. Available: ${names.join(', ') || '(none)'}`,
          ),
          400,
        );
      }
    }

    let rerun: RunRow;
    try {
      ({ run: rerun } = await runChain(deps.db, deps.leaves, {
        conversationId: previous.conversationId,
        request: previous.request,
        environmentKey: slice.projectId,
        requesterParticipantId: slice.participantId,
        lens: null,
        stages: body.data.steps.map((step) => ({
          stage: step.stage,
          worker: step.worker ?? null,
          inputs: step.inputs ?? {},
        })),
        // T-396 — an edited plan's steps execute the capabilities they name,
        // exactly as a declared workflow's do. The set is the same assembled
        // one the loop above validated against; a WRITING capability is refused
        // here whatever the edit says, because an edited plan comes from no
        // workflow and so declared no write (ADR-0053 §7, §12).
        ...(deps.capabilities !== undefined && { capabilities: deps.capabilities }),
        entitledCapabilities: names,
        // An edited plan is `model_chosen` EVEN IF IT STARTED DECLARED. A
        // declared workflow promises the same inputs produce the same steps in
        // the same order; a hand-edited copy makes no such promise whatever it
        // still resembles, so it may not carry the label. `workflow` stays null,
        // which the stored CHECK also requires.
        mode: 'model_chosen',
      }));
    } catch (error) {
      if (error instanceof CapabilityRefused && error.reason === 'not_entitled') {
        return c.json(notFound, 404);
      }
      if (error instanceof PlanNotExecutable) return c.json(invalid(error.message), 400);
      if (!(error instanceof RunHalted)) throw error;
      return error.reason === 'session_ended'
        ? c.json({ error: 'unauthenticated' } satisfies ApiError, 401)
        : c.json(notFound, 404);
    }

    const written = (await readPlanForRun(deps.db, rerun.id))!;
    // state and successor together: the stored CHECK requires each to imply
    // the other, so a plan can never be superseded by nothing or point at a
    // successor while claiming to be current
    await deps.db
      .update(s.plans)
      .set({ state: 'superseded', supersededByPlanId: written.id })
      .where(dEq(s.plans.id, plan.id));

    return c.json(
      {
        run: (await readRun(deps.db, rerun.id))!,
        plan: written,
        supersededPlanId: plan.id,
      } satisfies RerunPlanResponse,
      201,
    );
  });

  app.get(
    '/conversations/:conversationId',
    resourceScope(deps, 'conversationId', resourceHomes.conversation),
    async (c) => {
      const rows = await deps.db
        .select()
        .from(s.runs)
        .where(
          and(
            eq(s.runs.conversationId, c.req.param('conversationId')),
            isNull(s.runs.parentRunId), // sub-agent runs read via their childRunId
          ),
        )
        .orderBy(asc(s.runs.startedAt));
      return c.json({ runs: await visibleRuns(deps.db, rows, c.get('slice')) });
    },
  );

  // T-108 — the requester's own history on the project: their prompted
  // turns, newest first, Ask chats and document runs alike. Self-scoped by
  // construction (only runs the caller requested), so the producer-private
  // read (T-104) holds without a visibility walk. The document a turn
  // targeted is read off its suggestions (the run row carries no document;
  // a document run that produced none reads as a chat turn — tracker).
  app.get('/projects/:projectId/history', project, async (c) => {
    const slice = c.get('slice');
    const rows = await deps.db
      .select({
        run: s.runs,
        documentId: s.sandboxDocuments.id,
        documentTitle: s.sandboxDocuments.title,
      })
      .from(s.runs)
      .innerJoin(s.conversations, eq(s.runs.conversationId, s.conversations.id))
      .leftJoin(s.suggestions, eq(s.suggestions.runId, s.runs.id))
      .leftJoin(s.sandboxDocuments, eq(s.suggestions.sandboxDocumentId, s.sandboxDocuments.id))
      .where(
        and(
          eq(s.conversations.projectId, slice.projectId),
          eq(s.runs.requesterParticipantId, slice.participantId),
          isNull(s.runs.parentRunId),
        ),
      )
      .orderBy(desc(s.runs.startedAt));

    const items: HistoryEntry[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.run.id)) continue; // one entry per run — its suggestions share a document
      seen.add(row.run.id);
      items.push({
        runId: row.run.id,
        conversationId: row.run.conversationId,
        request: row.run.request,
        state: row.run.state,
        startedAt: row.run.startedAt.toISOString(),
        sandboxDocument:
          row.documentId !== null && row.documentTitle !== null
            ? { id: row.documentId, title: row.documentTitle }
            : null,
      });
    }
    return c.json({ items } satisfies GetHistoryResponse);
  });

  app.get('/projects/:projectId/work-items', project, async (c) => {
    const rows = await deps.db
      .select()
      .from(s.workItems)
      .where(eq(s.workItems.projectId, c.get('slice').projectId));
    return c.json({ items: rows.map(toWorkItem) });
  });

  app.get(
    '/work-items/:workItemId',
    resourceScope(deps, 'workItemId', resourceHomes.workItem),
    async (c) => {
      const workItemId = c.req.param('workItemId');
      const [item] = await deps.db
        .select()
        .from(s.workItems)
        .where(eq(s.workItems.id, workItemId))
        .limit(1);
      const rows = await deps.db
        .select({ run: s.runs })
        .from(s.runs)
        .innerJoin(s.conversations, eq(s.runs.conversationId, s.conversations.id))
        .where(and(eq(s.conversations.workItemId, workItemId), isNull(s.runs.parentRunId)))
        .orderBy(asc(s.runs.startedAt));
      return c.json({
        ...toWorkItem(item!),
        runs: await visibleRuns(deps.db, rows.map((r) => r.run), c.get('slice')),
      });
    },
  );

  return app;
}

function toWorkItem(row: typeof s.workItems.$inferSelect): WorkItem {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    title: row.title,
    status: row.status,
    containerId: row.containerId,
    assigneeParticipantId: row.assigneeParticipantId,
  };
}

// The 2026-07-12 read-scope ruling (supersedes 2026-07-06): the record turns
// inward — a Run is readable by its producing organisation only, work-item
// bound or not. The producing organisation is the run's requester
// participant's organisation — derived from the record, never the caller.
async function runVisibleTo(db: Db, run: RunRow, slice: EntitledSlice): Promise<boolean> {
  const [producer] = await db
    .select({ organisationId: s.users.organisationId })
    .from(s.participants)
    .innerJoin(s.users, eq(s.participants.userId, s.users.id))
    .where(eq(s.participants.id, run.requesterParticipantId))
    .limit(1);
  return producer?.organisationId === slice.organisationId;
}

async function visibleRuns(db: Db, rows: RunRow[], slice: EntitledSlice): Promise<Run[]> {
  const runs: Run[] = [];
  for (const row of rows) {
    if (!(await runVisibleTo(db, row, slice))) continue;
    const run = await readRun(db, row.id as Id);
    if (run) runs.push(run);
  }
  return runs;
}

// T-267 — the scope fields an edit might reach for, refused by NAME. The
// generic "unknown field" message reads as an invitation to find the right
// spelling, and there is none: a step's scope derives from the run's entitled
// slice and is not expressible. Same list, same reason, as the workflow
// validator's rule 3.
const SCOPE_FIELDS = new Set([
  'scope',
  'corpus',
  'visibility',
  'organisation',
  'organisationId',
  'organisation_id',
  'project',
  'projectId',
  'project_id',
  'asOrganisation',
  'as_organisation',
  'entitledSlice',
  'entitled_slice',
  'participant',
  'participantId',
  'participant_id',
]);

function namedScopeField(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return null;
  const steps = (raw as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return null;
  for (const step of steps) {
    if (step === null || typeof step !== 'object') continue;
    for (const key of Object.keys(step as Record<string, unknown>)) {
      if (SCOPE_FIELDS.has(key)) return key;
    }
  }
  return null;
}
