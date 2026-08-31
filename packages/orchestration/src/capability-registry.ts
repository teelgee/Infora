// T-396 — the executor's registry: capability name → the thing that runs it.
//
// **THE EXECUTOR IS A DISPATCHER OVER A CLOSED SET** (ADR-0053 §7). Everything
// it can run is in the list below, each entry pairing a `WorkerDeclaration` the
// registry already held with an adapter that calls the built implementation.
// There is no entry that takes a name and improvises, and there is no shape in
// which a plan adds one — which is why the executor rule creates no generic
// worker and leaves non-negotiable 8 untouched.
//
// **The adapters do exactly two things**: read a step's declared `inputs` into
// the worker's own typed input, and turn the worker's own output into the Step
// row's audit. They add no policy. In particular they resolve NO identity: the
// requester comes off the run record (`ctx.run`), exactly as the retrieve leaf
// has always taken it, so a step cannot run as somebody else.
//
// This file is where **per-step cost attribution starts working**. A cost is
// recorded on a Step row; the row is opened by the executor; nothing opened one
// for a worker until now. Where a worker reports no usage the audit stays
// EMPTY rather than zero — an unpriced step must not read as a free one
// (T-254).
import { eq, inArray } from 'drizzle-orm';
import type { Assemble, CheckFamily, Id } from '@infora/contracts';
import {
  CHECK_FAMILIES,
  DEFAULT_CORPUS_DEPTH,
  DEFAULT_DOCUMENT_LANGUAGE,
  DEFAULT_DOCUMENT_PURPOSE,
  DEFAULT_DOCUMENT_TYPE,
  DOCUMENT_LANGUAGES,
  DOCUMENT_PURPOSES,
  DOCUMENT_TYPES,
  STEP_TYPES,
} from '@infora/contracts';
import {
  CORPUS_RETRIEVAL,
  DOCUMENT_BUILDER,
  EXTRACTOR,
  QA_CONTRADICTION_CHECK,
  QA_DOCUMENT_CHECK,
  QA_SECTION_CHECK,
  createCorpusRetrieval,
  createExtractor,
  parseGroupKey,
  parsePassKey,
} from '@infora/capabilities';
import type {
  ExtractionSchemaRegistry,
  SectionSummary,
  TemplateRegistry,
} from '@infora/capabilities';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { ModelRates, Router } from '@infora/model';
import type { Capability, CapabilityRegistry, LeafContext, SourceRef } from './chain';
import { createDocumentBuilder } from './document-builder';
import {
  createQaContradictionCheck,
  createQaDocumentCheck,
  createQaSectionCheck,
} from './qa-checker';
import type { StepAudit } from './run-writer';

export type CapabilityDeps = {
  db: Db;
  router: Router;
  /** the ONE gateway — a capability with a second path to the store is the one
   *  thing a worker may never have (ADR-0028 §4) */
  assemble: Assemble;
  /** absent means this deployment builds no `document_builder` */
  templates?: TemplateRegistry;
  /** absent means this deployment builds no `extractor` */
  schemas?: ExtractionSchemaRegistry;
  rates?: ModelRates;
};

/** The run's requester, read off the run record and never off the step. */
async function requesterOf(db: Db, participantId: Id) {
  const [participant] = await db
    .select()
    .from(s.participants)
    .where(eq(s.participants.id, participantId))
    .limit(1);
  const [user] = participant
    ? await db.select().from(s.users).where(eq(s.users.id, participant.userId)).limit(1)
    : [];
  return { organisationId: user?.organisationId ?? '', participantId };
}

const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

/**
 * T-406 — a step input narrowed to one of a declared set, or the default.
 *
 * Step inputs arrive as `unknown` and a bad one is not a crash, it is a
 * silently odd document: an unrecognised register would reach the prompt as
 * itself and the model would improvise a meaning for it. Falling back to the
 * declared default is the same discipline `text` above already takes.
 */
const oneOf = <T extends string>(allowed: readonly T[], value: unknown, fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/**
 * Version ids out of a step input that may be either a bare list or the
 * `corpus_retrieval` output the previous step handed over. Both are legitimate:
 * a workflow may name its sources outright, or take the ones a search found.
 */
function versionIdsOf(value: unknown): Id[] {
  if (Array.isArray(value)) return value.filter((id): id is Id => typeof id === 'string');
  if (value !== null && typeof value === 'object' && 'passages' in value) {
    const passages = (value as { passages?: unknown }).passages;
    if (!Array.isArray(passages)) return [];
    const seen = new Set<string>();
    for (const passage of passages) {
      const id = (passage as { versionId?: unknown }).versionId;
      if (typeof id === 'string') seen.add(id);
    }
    return [...seen] as Id[];
  }
  return [];
}


/**
 * The families a plan step named, filtered to the ones this deployment knows.
 *
 * Accepts a list or the comma-separated string a workflow parameter carries —
 * the definition format has no list-of-enum type, and a `string` parameter is
 * the honest shape for a fixed vocabulary rather than an `id_list` of things
 * that are not ids.
 */
function familiesOf(value: unknown): CheckFamily[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',').map((entry) => entry.trim())
      : null;
  if (raw === null) return [...CHECK_FAMILIES];
  return raw.filter((family): family is CheckFamily =>
    (CHECK_FAMILIES as readonly string[]).includes(family as string),
  );
}

/** A bound `id_list`, as strings. */
function idsOf(value: unknown): Id[] {
  return Array.isArray(value) ? value.filter((entry): entry is Id => typeof entry === 'string') : [];
}

/**
 * The excerpts a run pinned from the requester's own sandbox (ADR-0022).
 *
 * ⚠ **Read only where the requester's own organisation owns the document**,
 * which is the sandbox document's existing posture everywhere else in the
 * build. A pin is the user saying *"look at this too"*, not a route to material
 * they could not otherwise open.
 */
async function excerptsOf(db: Db, documentIds: readonly Id[]) {
  if (documentIds.length === 0) return [];
  const rows = await db
    .select({
      id: s.sandboxDocuments.id,
      title: s.sandboxDocuments.title,
      content: s.sandboxDocuments.content,
    })
    .from(s.sandboxDocuments)
    .where(inArray(s.sandboxDocuments.id, [...documentIds]));
  return rows.map((row) => ({
    attachedSourceId: row.id as Id,
    // the excerpt is what makes the finding intelligible; it is not a citation
    // and must not render as one
    excerpt: `${row.title}: ${row.content.slice(0, ATTACHED_EXCERPT_CHARS)}`,
  }));
}

/** How much of an attached document one section check is shown. */
const ATTACHED_EXCERPT_CHARS = 4000;

/** The section summaries the section checks handed over, as a previous step's output. */
function summariesOf(value: unknown): SectionSummary[] {
  const rows = Array.isArray(value)
    ? value
    : value !== null && typeof value === 'object' && Array.isArray((value as { summaries?: unknown }).summaries)
      ? ((value as { summaries: unknown[] }).summaries)
      : [];
  const summaries: SectionSummary[] = [];
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue;
    const entry = row as { section?: unknown; heading?: unknown; summary?: unknown };
    if (typeof entry.section !== 'number' || typeof entry.summary !== 'string') continue;
    summaries.push({
      section: entry.section,
      heading: typeof entry.heading === 'string' ? entry.heading : null,
      summary: entry.summary,
    });
  }
  return summaries;
}

export function createCapabilityRegistry(deps: CapabilityDeps): CapabilityRegistry {
  const built = new Map<string, Capability>();

  const corpusRetrieval = createCorpusRetrieval({ assemble: deps.assemble });
  built.set(CORPUS_RETRIEVAL.name, {
    declaration: CORPUS_RETRIEVAL,
    run: async (ctx: LeafContext, inputs) => {
      const output = await corpusRetrieval(
        await requesterOf(ctx.db, ctx.run.requesterParticipantId),
        { projectId: ctx.run.environmentKey },
        {
          query: text(inputs['query']),
          ...(typeof inputs['max_passages'] === 'number' && {
            maxPassages: inputs['max_passages'],
          }),
          ...(inputs['include_superseded'] === true && { includeSuperseded: true }),
        },
      );
      // every step records the access-resolved source set it saw (ADR-0028 §7)
      const sourceSet: SourceRef[] = output.passages.map((passage) => ({
        versionId: passage.versionId as Id,
        ...(passage.chunkId !== null && { chunkId: passage.chunkId as Id }),
      }));
      return { output, audit: { sourceSet } };
    },
  });

  if (deps.templates !== undefined) {
    const templates = deps.templates;
    const documentBuilder = createDocumentBuilder({
      db: deps.db,
      router: deps.router,
      assemble: deps.assemble,
      templates,
      // T-396 — the rate table, so the drafting call's cost reaches the Step
      // row the executor opens. Absent records `cost: null` (unpriced), never 0
      ...(deps.rates !== undefined && { rates: deps.rates }),
    });
    built.set(DOCUMENT_BUILDER.name, {
      declaration: DOCUMENT_BUILDER,
      run: async (ctx: LeafContext, inputs) => {
        const output = await documentBuilder(
          await requesterOf(ctx.db, ctx.run.requesterParticipantId),
          { projectId: ctx.run.environmentKey },
          {
            templateId: text(inputs['template_id']),
            brief: text(inputs['brief']),
            // T-406 — the launcher's four answers. **Validated here rather than
            // trusted**: a step input is a string until something says
            // otherwise, and a `purpose` the catalogue has never heard of must
            // fall back to a real default rather than reaching the prompt as
            // itself. The API's zod schema already rejects a bad value at the
            // door; this is the second gate, on the path a workflow definition
            // or a future caller could also take.
            purpose: oneOf(DOCUMENT_PURPOSES, inputs['purpose'], DEFAULT_DOCUMENT_PURPOSE),
            language: oneOf(DOCUMENT_LANGUAGES, inputs['language'], DEFAULT_DOCUMENT_LANGUAGE),
            documentType: oneOf(DOCUMENT_TYPES, inputs['document_type'], DEFAULT_DOCUMENT_TYPE),
            styleGuideIds: versionIdsOf(inputs['style_guide_ids']),
            sources: { versionIds: versionIdsOf(inputs['sources']) },
            destination: {
              sandboxId: text(inputs['destination_sandbox_id']) as Id,
              title: text(inputs['title'], 'Untitled'),
            },
          },
        );
        const audit: StepAudit = {
          sourceSet: output.manifest.map((entry) => ({ versionId: entry.versionId })),
          ...(output.usage !== undefined && { usage: output.usage }),
          ...(output.model !== undefined && { model: output.model }),
        };
        return { output, audit };
      },
    });
  }

  if (deps.schemas !== undefined) {
    const extractor = createExtractor({
      assemble: deps.assemble,
      router: deps.router,
      schemas: deps.schemas,
      ...(deps.rates !== undefined && { rates: deps.rates }),
    });
    built.set(EXTRACTOR.name, {
      declaration: EXTRACTOR,
      run: async (ctx: LeafContext, inputs) => {
        const versionIds = versionIdsOf(inputs['sources']);
        const output = await extractor(
          await requesterOf(ctx.db, ctx.run.requesterParticipantId),
          { projectId: ctx.run.environmentKey },
          {
            schemaName: text(inputs['schema']),
            scope: versionIds.length > 0 ? { versionIds } : { query: text(inputs['query']) },
            ...(inputs['strict'] === false && { strict: false }),
          },
        );
        const audit: StepAudit = {
          sourceSet: output.records.map((record) => ({
            versionId: record.source.versionId as Id,
            ...(record.source.chunkId !== null && { chunkId: record.source.chunkId as Id }),
          })),
          ...(output.audit !== undefined && {
            model: output.audit.model,
            usage: output.audit.usage,
            ...(output.audit.egress !== undefined && { egress: output.audit.egress }),
          }),
        };
        return { output, audit };
      },
    });
  }

  // ── T-310 — THE CHECKER'S THREE ───────────────────────────────────────────
  //
  // Registered unconditionally where the other three are conditional, and the
  // asymmetry is real rather than an oversight: `document_builder` and
  // `extractor` need domain content a deployment may not carry (templates,
  // extraction schemas), and a deployment without it builds no such worker. The
  // checker's families need no content at all — a project with no style guide
  // and no rulebook loaded still gets a corpus check, a contradiction check and
  // the two arithmetic families, and its coverage statement says which sources
  // it had. Making the whole capability absent for want of a style guide would
  // turn a stated coverage gap into a missing tool.
  built.set(QA_SECTION_CHECK.name, {
    declaration: QA_SECTION_CHECK,
    run: async (ctx: LeafContext, inputs) => {
      const sectionCheck = createQaSectionCheck({
        db: ctx.db,
        router: deps.router,
        assemble: deps.assemble,
        ...(deps.rates !== undefined && { rates: deps.rates }),
      });
      const pass = parsePassKey(text(inputs['pass']));
      // ADR-0022's working set, read from the requester's OWN sandbox
      // documents: never grounds, never cited, evidence is an excerpt.
      const excerpts = await excerptsOf(ctx.db, idsOf(inputs['attached_document_ids']));
      const output = await sectionCheck(
        await requesterOf(ctx.db, ctx.run.requesterParticipantId),
        { projectId: ctx.run.environmentKey },
        {
          sandboxDocumentId: text(inputs['sandbox_document_id']) as Id,
          // 🔒 the unit of work comes off the PASS KEY the planner computed in
          // code, never off anything a model produced. An unreadable key is
          // section 1 rather than a guess at a wider one — the fail-safe
          // direction, since a wrong section reads the wrong text and reports
          // findings against it.
          section: pass?.section ?? 1,
          families: familiesOf(inputs['families']),
          depth: inputs['depth'] === 'quick' ? 'quick' : DEFAULT_CORPUS_DEPTH,
          ...(pass !== null && pass.of > 1 && { clausePass: { index: pass.index, of: pass.of } }),
          ...(idsOf(inputs['scope_version_ids']).length > 0 && {
            scopeVersionIds: idsOf(inputs['scope_version_ids']),
          }),
          ...(excerpts.length > 0 && { excerpts }),
        },
      );
      // every step records the access-resolved source set it saw (ADR-0028 §7).
      // A finding's citation and the Step row's source set are then the same
      // passages, which is what makes the audit answer "what did it see".
      const sourceSet: SourceRef[] = [];
      for (const finding of output.findings) {
        if (finding.evidence.input !== 'corpus') continue;
        for (const citation of finding.evidence.citations) {
          if ('versionId' in citation.source) sourceSet.push({ versionId: citation.source.versionId });
        }
      }
      return {
        output,
        audit: {
          sourceSet,
          // absent, never zero, where no call was made (T-254)
          ...(output.audit !== undefined && {
            model: output.audit.model,
            usage: output.audit.usage,
          }),
        },
      };
    },
  });

  built.set(QA_CONTRADICTION_CHECK.name, {
    declaration: QA_CONTRADICTION_CHECK,
    run: async (ctx: LeafContext, inputs) => {
      const contradictionCheck = createQaContradictionCheck({
        db: ctx.db,
        router: deps.router,
        ...(deps.rates !== undefined && { rates: deps.rates }),
      });
      const group = parseGroupKey(text(inputs['group']));
      const output = await contradictionCheck({
        sandboxDocumentId: text(inputs['sandbox_document_id']) as Id,
        summaries: summariesOf(inputs['summaries']),
        ...(group !== null && group.of > 1 && { group }),
      });
      return {
        output,
        audit: {
          // nothing is retrieved: the input is the draft's own summaries, so
          // the source set is genuinely empty rather than unrecorded
          sourceSet: [],
          ...(output.audit !== undefined && {
            model: output.audit.model,
            usage: output.audit.usage,
          }),
        },
      };
    },
  });

  built.set(QA_DOCUMENT_CHECK.name, {
    declaration: QA_DOCUMENT_CHECK,
    run: async (ctx: LeafContext, inputs) => {
      // 🔒 no router is passed, and none is available to pass: the CODE
      // declaration is structural here rather than a promise in a comment.
      const documentCheck = createQaDocumentCheck({
        db: ctx.db,
        ...(deps.templates !== undefined && { templates: deps.templates }),
      });
      const output = await documentCheck({
        sandboxDocumentId: text(inputs['sandbox_document_id']) as Id,
        families: familiesOf(inputs['families']),
        ...(typeof inputs['template_id'] === 'string' &&
          inputs['template_id'] !== '' && { templateId: inputs['template_id'] }),
        ...(typeof inputs['readability_target'] === 'number' && {
          readabilityTarget: inputs['readability_target'],
        }),
      });
      // no model, no usage, no cost — and the audit says so by carrying none.
      // A zero here would read as a call that cost nothing (T-254).
      return { output, audit: { sourceSet: [] } };
    },
  });

  // A capability's name becomes the Step row's type when the executor runs it
  // (chain.ts writes `planned.worker as StepType`), and `step_type` is a
  // database enum. A name outside that vocabulary would fail at INSERT, mid-run
  // — so it fails HERE instead, at composition, where the error names the fix
  // (added in review, 2026-08-31).
  for (const name of built.keys()) {
    if (!(STEP_TYPES as readonly string[]).includes(name)) {
      throw new Error(
        `capability '${name}' is not in the step_type vocabulary (packages/contracts STEP_TYPES, ` +
          `migration 0055) — add the enum value in a drawn migration before registering the capability`,
      );
    }
  }
  return { get: (name) => built.get(name) };
}
