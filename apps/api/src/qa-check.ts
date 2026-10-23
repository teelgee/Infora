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
import { createHash, randomUUID } from 'node:crypto';
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
import { readRulesForCheck, readStyleClauses } from '@infora/orchestration';
import type { CapabilityRegistry, ChainLeaves, RunAttachment } from '@infora/orchestration';
import { extractText } from './extract';
import type { ExtractableFormat } from './extract';
import { currentRuleSetVersionIds } from '@infora/data';
import type { AcceptedRule } from '@infora/capabilities';
import { writeFindings } from './findings';
import { projectScope, resourceHomes } from './requester';
import type { AppEnv } from './requester';
import { refuseIfOff } from './ai-features';

export const QA_CHECK_WORKFLOW = 'qa-check';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const invalid = (c: Context, detail: string) =>
  c.json({ error: 'invalid', detail } satisfies ApiError, 400);

// ── T-399 — A FILE HANDED STRAIGHT TO A CHECK ───────────────────────────────
//
// *In plain terms: you can now give the checker a file directly, instead of
// having to file it in your working area first.*
//
// **The same extractor the style guide and the corpus use** (T-397, T-303), for
// the reason that loader already gives: two parsers would be two answers to
// what a document says. An unreadable file is refused in the same vocabulary,
// while the person is still holding it.
//
// 🔒 **THE FILE IS TRANSIENT AND THE MECHANISM HAS TO PROVE IT.** T-337's rule
// is parsed in-request, deliberately stored nowhere, never quietly corpus. So:
// the bytes are read from the request, the text goes into memory, and NOTHING
// writes either one. It does not become a sandbox document, a version, a chunk
// or a style guide, and — the trap this ticket walked into once — it does not
// ride a workflow parameter either, because bound parameters are persisted to
// `plan_steps.inputs`. What persists is the FINGERPRINT below.
const uploadFormats: Record<string, ExtractableFormat> = {
  docx: 'docx',
  xlsx: 'xlsx',
  pptx: 'pptx',
  pdf: 'pdf',
};

// generous for a real chapter, and a bound rather than a budget: the whole
// request is parsed in memory (that is the transiency promise), so the bound
// is on what one request may make the server hold
const MAX_UPLOAD_FILES = 5;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * What the RECORD keeps about an upload: enough to say exactly which file the
 * run was shown, and not a word of what it said.
 *
 * The hash is the honest half. A name and a size identify a file loosely; a
 * content hash makes the claim checkable — someone holding the same file can
 * confirm it is the one the run read, which is what an audit of an unstored
 * input can offer instead of the input itself.
 */
type UploadFingerprint = { attachedSourceId: string; name: string; bytes: number; sha256: string };

/**
 * Read the uploaded files off a multipart request, parse each one, and split
 * the result into the half that persists and the half that never does.
 *
 * Returns the refusal string instead where a file cannot be read — refused
 * BEFORE any spend and before the plan is computed, like every other thing this
 * tool declines to guess at.
 */
async function readUploads(
  c: Context<AppEnv>,
): Promise<
  { ok: true; attachments: RunAttachment[]; fingerprints: UploadFingerprint[] } | { ok: false; detail: string }
> {
  const type = c.req.header('content-type') ?? '';
  if (!type.toLowerCase().includes('multipart/form-data')) {
    return { ok: true, attachments: [], fingerprints: [] };
  }
  const body = await c.req.parseBody({ all: true }).catch(() => null);
  if (body === null) return { ok: false, detail: 'this upload could not be read' };
  const entry = body['file'];
  const files = (Array.isArray(entry) ? entry : [entry]).filter(
    (candidate): candidate is File => candidate instanceof File,
  );
  // bounded BEFORE anything is buffered (review, 2026-08-31): this route is
  // open to any project participant and never throttled — the plan
  // legitimately recomputes on every changed answer — so an unbounded
  // in-memory parse here was the one place a member could spend the server's
  // memory freely. The caps are generous for real chapters and refused in
  // words a person can act on.
  if (files.length > MAX_UPLOAD_FILES) {
    return { ok: false, detail: `too many files attached — ${MAX_UPLOAD_FILES} at most per check` };
  }

  const attachments: RunAttachment[] = [];
  const fingerprints: UploadFingerprint[] = [];
  for (const file of files) {
    const format = uploadFormats[file.name.split('.').at(-1)?.toLowerCase() ?? ''];
    if (!format) return { ok: false, detail: 'unsupported_format' };
    if (file.size > MAX_UPLOAD_BYTES) {
      return {
        ok: false,
        detail: `"${file.name}" is too large to check — ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB at most per file`,
      };
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const extracted = extractText(format, bytes);
    if (!extracted.ok) return { ok: false, detail: extracted.reason };
    // minted per run: a HANDLE, not a stored document's id. The fingerprint
    // bound beside it is what says which file the handle meant.
    const attachedSourceId = randomUUID();
    attachments.push({ attachedSourceId, name: file.name, excerpt: extracted.text });
    fingerprints.push({
      attachedSourceId,
      name: file.name,
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  return { ok: true, attachments, fingerprints };
}

/**
 * The launcher posts JSON today and multipart the moment a file is attached, so
 * the body is read from whichever arrived. One schema either way — the file is
 * the only thing multipart adds, and a second body shape would be a second
 * answer to what a check request is.
 */
async function readBody(c: Context<AppEnv>): Promise<unknown> {
  const type = c.req.header('content-type') ?? '';
  if (!type.toLowerCase().includes('multipart/form-data')) {
    return c.req.json().catch(() => null);
  }
  const body = await c.req.parseBody({ all: true }).catch(() => null);
  const field = body?.['body'];
  if (typeof field !== 'string') return null;
  try {
    return JSON.parse(field);
  } catch {
    return null;
  }
}

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
        /** T-399 — parsed here, held in memory, never written anywhere */
        attachments: RunAttachment[];
        fingerprints: UploadFingerprint[];
        /** T-427 — stored on the run, shown nowhere */
        ruleSetVersions: string[];
        /** T-428 — what the coverage sentence says about RULES, before and after */
        ruleCounts: { applied: number; total: number; byRegister: Record<string, number> };
      }
    | { ok: false; response: Response }
  > => {
    const parsed = qaCheckBody.safeParse(await readBody(c));
    if (!parsed.success) {
      return { ok: false, response: invalid(c, 'sandboxDocumentId, families and depth are required') };
    }
    // T-399 — an unreadable upload is refused BEFORE the plan is computed and
    // long before anything is spent, the same place every other refusal this
    // tool makes happens.
    const uploads = await readUploads(c);
    if (!uploads.ok) return { ok: false, response: invalid(c, uploads.detail) };
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

    // T-428 — the accepted rules first, because a guide that has been
    // restructured into rules is read as rules and not as prose, and the plan
    // has to count what the run will actually apply.
    const rules = parsed.data.families.includes('style')
      ? await readRulesForCheck(deps.db, slice.projectId as Id)
      : [];
    // BOTH style sources, together, because the precedence between them is
    // applied by one reader (ADR-0029, ADR-0053 §3) — and the count is what the
    // coverage statement reports as "80 of 80 clauses"
    const clauses = parsed.data.families.includes('style')
      ? await readStyleClauses(
          deps.db,
          slice.projectId as Id,
          slice.organisationId as Id,
          [...new Set(rules.map((rule) => rule.styleGuideId))],
        )
      : [];

    // T-427 — the accepted rule-set version of every live style guide this run
    // reads. Resolved in the SAME planning function the run binds from, so the
    // plan the user saw and the run the record describes cannot name different
    // rules — T-309's one-planner rule, applied to one more fact.
    const ruleSetVersions = await currentRuleSetVersionIds(deps.db, slice.projectId);

    return {
      ok: true,
      body: parsed.data,
      sectionCount: sections.length,
      clauseCount: clauses.length,
      ruleCounts: countRules(rules),
      ruleSetVersions,
      attachments: uploads.attachments,
      fingerprints: uploads.fingerprints,
      computed: planQaCheck({
        workflow,
        sections,
        families: parsed.data.families,
        depth: parsed.data.depth,
        styleClauses: {
          count: clauses.length,
          tokens: clauses.reduce((sum, clause) => sum + tokensIn(clause.text), 0),
        },
        styleRules: countRules(rules),
        scopedDocuments: parsed.data.scopeVersionIds.length,
        attachedDocuments: parsed.data.attachedDocumentIds.length,
        // named, not counted: an upload is stored nowhere, so its name is the
        // only handle the plan and the record will ever have for it
        attachedUploads: uploads.attachments.map((attachment) => attachment.name),
        checkModelId: deps.checkModelId ?? 'unpriced',
        ...(deps.modelRates !== undefined && { rates: deps.modelRates }),
        tokenLimit: TOKEN_LIMIT,
      }),
    };
  };

  app.post('/projects/:projectId/tools/qa-check/plan', project, async (c) => {
    // T-463 — the project's switch, before any plan or spend
    const off = await refuseIfOff(c, deps.db, c.get('slice').projectId, 'qa_checker');
    if (off) return off;
    const computed = await plan(c);
    if (!computed.ok) return computed.response;
    return c.json({ plan: computed.computed.plan } satisfies QaCheckPlanResponse);
  });

  app.post('/projects/:projectId/tools/qa-check/runs', project, async (c) => {
    const off = await refuseIfOff(c, deps.db, c.get('slice').projectId, 'qa_checker');
    if (off) return off;
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
        // 🔒 THE FINGERPRINT, NEVER THE TEXT. This is a bound parameter, so it
        // lands in `plan_steps.inputs` and stays in the record — which is
        // exactly why the file's words are not in it (see the workflow's own
        // note on this parameter, and `RunAttachment`).
        attached_uploads:
          computed.fingerprints.length > 0 ? JSON.stringify(computed.fingerprints) : '',
        template_id: computed.body.templateId ?? '',
        readability_target: 14,
        // 🔒 T-427 (ADR-0054 decision 7) — WHICH VERSION OF THE WRITING RULES
        // this run ran against, stamped ONCE on the run and never on a finding.
        // It is a bound parameter, so it lands in the run's own plan record and
        // is read by nothing: `qa_document_check`'s adapter maps only the
        // inputs it declares. **No surface renders it** — `ToolPlan` carries no
        // step inputs, so this is off every screen by construction rather than
        // by a rule somebody has to remember. The owner ruled explicitly
        // against a screen repeating "checked against style guide v3" down a
        // list of findings.
        rule_set_versions: computed.ruleSetVersions.join(','),
      });
    } catch (error) {
      if (!(error instanceof WorkflowNotRunnable)) throw error;
      return invalid(c, error.message);
    }

    // A tool run is a run, so it gets a Conversation like any other — the
    // Run/Step tree has one shape (ADR-0028 §1) and a second one for tools
    // would be a second audit story.
    //
    // T-418 — **the caller may have opened it already**, so that it can watch
    // this run's own Step rows tick off while this request is still in flight.
    // That moves *when* the row is created and not *what* is created: a caller
    // that passes none gets exactly the behaviour above. **The id is checked
    // against this requester's own project first**, so it is not a way to hang
    // a run off somebody else's thread — a conversation elsewhere reads as
    // nonexistence, principle 4, rather than as a refusal that confirms it.
    let conversationId = computed.body.conversationId;
    if (conversationId !== undefined) {
      const home = await resourceHomes.conversation(deps.db, conversationId);
      if (home?.projectId !== slice.projectId) return notFound(c);
    } else {
      conversationId = (
        await createConversation(deps.db, { projectId: slice.projectId, surface: 'web' })
      ).id as Id;
    }
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
        conversationId,
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
        // T-399 — the TEXT, in memory only, for the life of this walk. It
        // reaches the section check through the same door the sandbox-pinned
        // excerpts use, one step earlier.
        ...(computed.attachments.length > 0 && { attachments: computed.attachments }),
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
          rulesApplied: gathered.rulesApplied,
          rulesTotal: computed.ruleCounts.total,
          passagesRead: gathered.passagesRead,
          sectionsWithNoPassages: gathered.sectionsWithNoPassages,
          attachedRead: gathered.attachedRead,
          // the same shape as the plan's sentence (ADR-0053 §5)
          ...(computed.attachments.length > 0 && {
            attachedUploads: computed.attachments.map((attachment) => attachment.name),
          }),
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
  let rulesApplied = 0;
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
      const applied = numberOf(coverage['rulesApplied']);
      if (applied > rulesApplied) rulesApplied = applied;
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
    rulesApplied,
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

/**
 * T-428 — the rule half of the coverage sentence, computed once and used twice.
 *
 * 🔒 **`applied` excludes `steers_only` rules.** They improve drafting and raise
 * nothing, so counting them would inflate the sentence with rules that cannot
 * produce a finding — an overstatement, which ADR-0053 §5 treats as the same
 * class of error as an understatement: either way the sentence stops describing
 * the run.
 */
function countRules(rules: readonly AcceptedRule[]) {
  const byRegister: Record<string, number> = {};
  let applied = 0;
  for (const rule of rules) {
    if (rule.enforcement !== 'raises_findings') continue;
    applied += 1;
    byRegister[rule.register] = (byRegister[rule.register] ?? 0) + 1;
  }
  return { applied, total: rules.length, byRegister };
}
