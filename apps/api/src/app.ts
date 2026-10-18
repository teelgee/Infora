import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ApiError } from '@infora/contracts';
import { createAssembler } from '@infora/knowledge';
import type { Attenuation } from '@infora/governance';
import { loadDocumentTemplates, loadExtractionSchemas } from '@infora/capabilities';
import {
  createCapabilityRegistry,
  createCiteLeaf,
  createDraftLeaf,
  createGroundCheckLeaf,
  createRetrieveLeaf,
} from '@infora/orchestration';
import { administrationRoutes } from './administration';
import { authRoutes } from './auth';
import { commentRoutes } from './comments';
import { findingRoutes } from './findings';
import { conflictRoutes } from './conflict';
import { costRoutes } from './costs';
import { csrfGuard } from './csrf';
import { libraryRoutes } from './library';
import { cycleRoutes } from './cycle';
import { acceptanceCodeRoutes } from './acceptance-codes';
import { namingRoutes } from './naming';
import { healthRoutes, requestObservability } from './observability';
import { containerRoutes, planRoutes } from './plan';
import { ontologyRoutes } from './ontology';
import { clientIp, rateLimit } from './rate-limit';
import { sessionMiddleware } from './requester';
import { DEFAULT_SESSION_POLICY } from './sessions';
import type { AppDeps, AppEnv } from './requester';
import { renditionRoutes } from './renditions';
import { runRoutes } from './runs';
import { attachedSourceRoutes } from './attached';
import { sandboxRoutes } from './sandbox';
import { sandboxRoutes2 } from './sandboxes';
import { suggestionRoutes } from './suggestions';
import { agentActRoutes } from './agent-acts';
import { appRoutes } from './apps';
import { appRowRoutes } from './app-rows';
import { appExportRoutes } from './app-exports';
import { appRunRoutes } from './app-runs';
import { playbookRoutes } from './playbooks';
import { notificationRoutes } from './notifications';
import { transmittalRoutes } from './transmittal';
import { externalIssueRoutes } from './external-issue';
import { rulebookRoutes } from './rulebook';
import { documentCreationRoutes } from './document-creation';
import { qaCheckRoutes } from './qa-check';
import { ruleSetRoutes } from './rule-set';
import { styleGuideRoutes } from './style-guide';
import { toolRoutes } from './tools';
import { uploadRoutes } from './upload';
import { wopiRoutes } from './wopi';

export type { AppDeps } from './requester';

// T-009 registered every contracts.md §3 endpoint (as 501 scaffolding where
// the milestone hadn't landed); T-023 puts requester resolution in front of
// each. T-086 replaced the last placeholder — every route is live.
// The local web origins: vite dev (:5173) and the e2e harness (:5273). In
// both, the browser talks to the API through the vite proxy — same-origin —
// so even the default allowlist is belt-and-braces, and anything else needs
// an explicit ALLOWED_ORIGINS.
const devOrigins = ['http://localhost:5173', 'http://localhost:5273'];

export function buildApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  // T-219: outermost — every response gets an X-Request-Id, every request
  // one JSON log line (method, path, status, duration, requestId)
  app.use('*', requestObservability());

  // T-216: CORS from an explicit allowlist — an unlisted Origin gets no
  // CORS headers at all (hono's cors would still emit allow-credentials, so
  // it only runs for allowlisted origins) — plus baseline security headers.
  const allowedOrigins = deps.allowedOrigins ?? devOrigins;
  const corsMiddleware = cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
    credentials: true, // the session cookie is the credential
  });
  app.use('*', async (c, next) => {
    const origin = c.req.header('origin');
    if (origin !== undefined && allowedOrigins.includes(origin)) return corsMiddleware(c, next);
    // a preflight from an unlisted origin is answered, but bare — no allows
    if (c.req.method === 'OPTIONS') return c.body(null, 204);
    await next();
  });
  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'no-referrer');
  });

  // T-218: the CSRF content-type gate + the upload Origin check (ADR-0044)
  app.use('*', csrfGuard({ allowedOrigins }));

  // T-217: login guesses are throttled per IP before any credential check
  app.use(
    '/auth/session',
    rateLimit({
      limit: deps.rateLimits?.loginPerMinute ?? 10,
      windowMs: 60_000,
      methods: ['POST'],
      key: clientIp,
    }),
  );

  // T-023: identity resolved from the session on every request but login
  app.use('*', sessionMiddleware(deps));

  // T-217: run creation invokes paid model calls — throttled per user (the
  // session middleware has resolved the requester by here)
  app.use(
    '/conversations/:conversationId/runs',
    rateLimit({
      limit: deps.rateLimits?.runsPerMinute ?? 30,
      windowMs: 60_000,
      methods: ['POST'],
      key: (c) => c.get('user')?.id,
    }),
  );
  // T-364's structure proposal invokes the same paid model call under the same
  // economics, so it carries the same throttle — an embedded assistive agent is
  // not a cheaper kind of run just because it has no Run record
  app.use(
    '/sandboxes/:sandboxId/folder-structure/proposal',
    rateLimit({
      limit: deps.rateLimits?.runsPerMinute ?? 30,
      windowMs: 60_000,
      methods: ['POST'],
      key: (c) => c.get('user')?.id,
    }),
  );

  // Liveness probe (T-219) — sessionless, DB-pinging
  app.route('/', healthRoutes(deps));

  // Auth & session (M1, M6) — T-021; revocable server-side sessions, T-251
  app.route(
    '/',
    authRoutes({
      db: deps.db,
      sessionSecret: deps.sessionSecret,
      sessionPolicy: deps.sessionPolicy ?? DEFAULT_SESSION_POLICY,
    }),
  );

  // Conversations, runs & work items (M3, M5, M6) — T-046. The chain's
  // leaves are bound once here: retrieval reaches stores only through the
  // assembly gateway (T-030), draft through the Router.
  const assemble = createAssembler({ db: deps.db, router: deps.router });
  // T-292 — the Data sources chip's refinement needs an assembler NARROWER
  // than the requester's own, and `attenuate` is monotonic, so the narrowed one
  // has to be built per request rather than reached for from the bound leaf.
  // It is a factory rather than a mutable field for the reason T-248 put the
  // narrowing in the constructor: there is no route back to the wider
  // assembler, so a later step cannot undo the user's refinement.
  const narrowedRetrieve = (narrowing: Attenuation) =>
    createRetrieveLeaf(
      { assemble: createAssembler({ db: deps.db, router: deps.router }, narrowing) },
      { ...(deps.modelRates !== undefined && { rates: deps.modelRates }) },
    );
  // T-396 — THE EXECUTOR'S REGISTRY, bound once at composition beside the
  // leaves and for the same reason: what a deployment can run must not change
  // underneath a run already recording that it ran it. Templates and extraction
  // schemas are read here, at boot, so a definition naming a template that does
  // not exist fails in front of whoever changed it (the workflow loader's own
  // rule, one layer along).
  const templates = loadDocumentTemplates();
  const capabilities = createCapabilityRegistry({
    db: deps.db,
    router: deps.router,
    assemble,
    templates,
    schemas: loadExtractionSchemas(),
    ...(deps.modelRates !== undefined && { rates: deps.modelRates }),
  });
  // T-309 — the leaves the chain binds, hoisted so the document creator's own
  // route uses the SAME ones the Ask path does. Two bindings would be two
  // answers to "what does a step of this deployment run".
  const leaves = {
    retrieve: createRetrieveLeaf(
      { assemble },
      { ...(deps.modelRates !== undefined && { rates: deps.modelRates }) },
    ),
    draft: createDraftLeaf(deps.router, {
      ...(deps.modelRates !== undefined && { rates: deps.modelRates }),
    }),
    groundCheck: createGroundCheckLeaf(),
    cite: createCiteLeaf(),
  };

  app.route(
    '/',
    runRoutes({
      db: deps.db,
      narrowedRetrieve,
      capabilities,
      // T-313 — the retrieve step records what embedding the query cost, so it
      // needs the same rate table the draft leaf has; T-254 binds that table
      // HERE, at composition, keyed by model id, so the price follows whichever
      // model the router actually chose.
      leaves,
      // T-299 — the registry is resolved at composition, not per request:
      // production reads the definitions once and freezes them, so a Lens
      // cannot change underneath a run already recording which produced it.
      ...(deps.lenses !== undefined && { lenses: deps.lenses }),
      ...(deps.defaultLensId !== undefined && { defaultLensId: deps.defaultLensId }),
      // T-265 — the declared workflows, resolved at composition for the same
      // reason the Lens registry is: a workflow must not change underneath a
      // run already recording which version of it produced the answer.
      ...(deps.workflows !== undefined && { workflows: deps.workflows }),
      ...(deps.askWorkflowId !== undefined && { askWorkflowId: deps.askWorkflowId }),
      // T-266 — the worker registry, so the set the classifier sees is the one
      // ASSEMBLED for this requester rather than everything the deployment
      // built. The model is never told about a worker this user cannot use.
      ...(deps.workers !== undefined && { workers: deps.workers }),
      ...(deps.classifier !== undefined && { classifier: deps.classifier }),
      // T-252 — the same policy the middleware admitted the request under, so
      // the mid-run re-check and the front-door check cannot disagree
      sessionPolicy: deps.sessionPolicy ?? DEFAULT_SESSION_POLICY,
    }),
  );

  // Sandbox documents (M4) — organisation-private inside the project
  // (ADR-0018): create/list/open (T-051), suggestions read + manual PATCH (T-082)
  app.route('/', sandboxRoutes(deps));

  // Sandboxes, participant scope, folders, bind (Slice A2, ADR-0036/0038) — T-153.
  // Carries the router for T-364's structure-proposal agent (propose only).
  app.route('/', sandboxRoutes2({ db: deps.db, router: deps.router }));

  // Attached-source working set on a conversation (Slice A2, ADR-0022) — T-154
  app.route('/', attachedSourceRoutes(deps));

  // Sandbox comments (T-112) — working-draft threads, scope riding the document's
  app.route('/', commentRoutes(deps));
  // T-311 — the marked-up edit: the checker's findings, and the reviewer's
  // triage of them one mark at a time or a mechanical group at a time.
  app.route('/', findingRoutes(deps));

  // Access administration + the roster (Slice A, ADR-0033) — T-117
  app.route('/', administrationRoutes(deps));

  // T-246 — the conflict register (ADR-0046): the declaring organisation's own
  // register, and the owner's attestation view which carries none of it.
  app.route('/', conflictRoutes(deps));

  // The deliverable plan: TIDP rows, MIDP consolidation, appointments
  // (Slice A, ADR-0008/0017/0033) — T-118/T-119
  app.route('/', planRoutes(deps));
  app.route('/', containerRoutes(deps));

  // T-241 — the project ontology (classification vocabulary + relationship
  // edges, ADR-0045). Reads share the deliverable-visibility pre-filter.
  app.route('/', ontologyRoutes(deps));

  // Naming scheme + code-builder (Slice A2, ADR-0008 homed) — T-152
  app.route('/', namingRoutes(deps));

  // Promotion + the review cycle (Slice A, ADR-0002/0005–0014/0032) — T-120+
  app.route('/', cycleRoutes({ db: deps.db, router: deps.router }));
  // T-390 — the acceptance-code scheme's read and, for the first time, its write
  app.route('/', acceptanceCodeRoutes(deps));

  // Renditions: the record's stored exports (Slice A, ADR-0004/0034) — T-121
  app.route('/', renditionRoutes(deps));

  // Upload + open-in-editor conversion (Slice A, ADR-0034) — T-122
  // T-308 — the firm's rulebook in org context (ADR-0048 §4)
  app.route('/', rulebookRoutes(deps));
  // T-397 — the PROJECT style guide, project-scoped where the rulebook is
  // organisation-scoped: context is classified by ownership (ADR-0021).
  app.route('/', styleGuideRoutes(deps));
  // T-424 (ADR-0054) — the rules workbench: an uploaded standard becomes
  // proposed rules. It carries the router because extraction is a model call
  // that PROPOSES and stores nothing.
  app.route('/', ruleSetRoutes({ db: deps.db, router: deps.router }));

  // T-334 — the Tools section's own list, assembled per requester.
  app.route(
    '/',
    toolRoutes({
      db: deps.db,
      ...(deps.workflows !== undefined && { workflows: deps.workflows }),
      ...(deps.workers !== undefined && { workers: deps.workers }),
    }),
  );

  // T-309 — the document creator: the plan before the click, then the run.
  app.route(
    '/',
    documentCreationRoutes({
      db: deps.db,
      leaves,
      templates,
      capabilities,
      // T-409 — the agent pane's one call
      router: deps.router,
      ...(deps.workflows !== undefined && { workflows: deps.workflows }),
      ...(deps.workers !== undefined && { workers: deps.workers }),
      ...(deps.modelRates !== undefined && { modelRates: deps.modelRates }),
      ...(deps.draftModelId !== undefined && { draftModelId: deps.draftModelId }),
    }),
  );
  // T-336 — the QA checker as a tool. The SAME leaves and the SAME capability
  // registry the creator and the Ask path use: two bindings would be two
  // answers to "what does a step of this deployment run".
  app.route(
    '/',
    qaCheckRoutes({
      db: deps.db,
      leaves,
      capabilities,
      ...(deps.workflows !== undefined && { workflows: deps.workflows }),
      ...(deps.workers !== undefined && { workers: deps.workers }),
      ...(deps.modelRates !== undefined && { modelRates: deps.modelRates }),
      ...(deps.draftModelId !== undefined && { checkModelId: deps.draftModelId }),
    }),
  );
  app.route('/', uploadRoutes(deps));

  // Suggestion resolution — the Signal (M4) — T-053
  app.route('/', suggestionRoutes(deps));

  // T-254 — cost attribution: the organisation's own spend, per user
  app.route('/', costRoutes(deps));

  // Library (M2 read path) — T-086
  app.route('/', libraryRoutes(deps));

  // Non-review transmittal, the acknowledgement gate, intra-org narrowing +
  // the standing routing rule (ADR-0035) — T-137
  app.route('/', transmittalRoutes(deps));

  // T-431/T-432 — external issue (ADR-0055): the third transmittal kind, its
  // recipient record, and the recipient's own sessionless read. That read is
  // the reason this route sits here rather than inside transmittalRoutes: it
  // resolves a TOKEN and not a requester, and the session middleware exempts
  // its prefix by name (requester.ts) so the exemption is one visible line
  // rather than a property of a route somewhere in a file.
  app.route('/', externalIssueRoutes(deps));

  // T-453 — the WOPI host (ADR-0043): an editing engine opens an uploaded
  // Office file from Infora's own store and saves it back. Sessionless like the
  // external read, and for the same reason exempted by name in requester.ts —
  // but unlike it, every call re-resolves a PERSON's entitlement.
  app.route('/', wopiRoutes(deps));

  // T-329 — the notification record and its read/mark-read API (ADR-0049).
  // Visibility follows the subject, re-resolved on every read.
  app.route('/', notificationRoutes(deps));

  // T-370 — the agent-act substrate (ADR-0027's S10 amendment): first-class
  // actor identity for an agent run, and the receipt-with-undo. No caller yet —
  // nothing adopts the direct-execution lane until this exists, which is the
  // amendment's own sequencing.
  app.route('/', agentActRoutes(deps));

  // T-440/T-441 — the app builder's substrate (ADR-0056): the app instance, its
  // participant scope, the owner's table share, reassign-or-close, and the rows
  // people type in with their acceptance flow. The row predicate itself lives
  // in @infora/governance and is called from there — never restated here.
  app.route('/', appRoutes(deps));
  app.route('/', appRowRoutes(deps));
  // T-444 — the export: a spreadsheet of what this person may read, or one
  // insight as Word, with a provenance stamp that says what data and when and
  // nothing about who produced it (ADR-0056 §8).
  app.route('/', appExportRoutes(deps));
  app.route('/', appRunRoutes(deps));
  // T-445 — playbooks: a firm keeps an app as a template on its own workspace
  // shelf with every row stripped out, and deploys a copy of it into the next
  // project as an ordinary new instance (ADR-0056 §10).
  app.route('/', playbookRoutes(deps));

  // Principle 4: nonexistence and denial read identically — the §4 envelope,
  // and no 405 that would distinguish a live path from a dead one.
  app.notFound((c) => c.json({ error: 'not_found' } satisfies ApiError, 404));

  return app;
}
