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
import { eq } from 'drizzle-orm';
import type { Assemble, CheckFamily, DocumentSection, Id } from '@infora/contracts';
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
 * T-407 — the composed outline out of a step input.
 *
 * **It arrives as a JSON string**, which is `familiesOf`'s shape one function
 * up and for the same reason: a workflow parameter's declared type is one of
 * string, number, boolean, id or id_list, none of which is a list of objects,
 * and widening that fixed set is an owner decision rather than a build one.
 *
 * Sections with no heading or no purpose are DROPPED rather than passed
 * through empty: an unnamed section cannot be written into, matched against, or
 * counted, and one that reached the prompt would produce a heading the document
 * has no way to carry. The API's own schema already refuses them at the door;
 * this is the second gate, on the path a workflow definition could also take.
 */
const namedPart = (item: unknown): item is { heading: string; purpose: string; brief?: unknown } =>
  typeof item === 'object' &&
  item !== null &&
  typeof (item as { heading?: unknown }).heading === 'string' &&
  typeof (item as { purpose?: unknown }).purpose === 'string' &&
  (item as { heading: string }).heading.trim() !== '' &&
  (item as { purpose: string }).purpose.trim() !== '';

/** The brief (T-408) rides only when it is real text — at either depth. */
const briefOf = (item: { brief?: unknown }): { brief?: string } =>
  typeof item.brief === 'string' && item.brief.trim() !== '' ? { brief: item.brief } : {};

const sectionsOf = (value: unknown): DocumentSection[] =>
  (Array.isArray(parsedJson(value)) ? (parsedJson(value) as unknown[]) : [])
    .filter(namedPart)
    .map((item) => {
      // T-412 — the sub-sections ride the same persisted string, and **only one
      // level of them is read back**. A payload nesting deeper is not an error
      // to throw on: it is data this build has no shape for, so it is dropped
      // here exactly as an unnamed section is, and the API's own schema is the
      // gate that refuses it at the door.
      const nested = (item as { subSections?: unknown }).subSections;
      const subSections = (Array.isArray(nested) ? nested : [])
        .filter(namedPart)
        .map((sub) => ({ heading: sub.heading, purpose: sub.purpose, ...briefOf(sub) }));
      return {
        heading: item.heading,
        purpose: item.purpose,
        // the author's corrected brief (T-408) rides only when it is real text:
        // absent means "the planner's description stands", and an empty string
        // arriving here must not overwrite the purpose fallback downstream
        ...briefOf(item),
        ...(subSections.length > 0 && { subSections }),
      };
    });

/** A step input that may be JSON text, or may already be the value. */
function parsedJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    // malformed is EMPTY rather than a crash: the caller's own schema is the
    // gate that refuses a bad outline, and a run that got here with one is a
    // run whose outline nobody can honour
    return [];
  }
}

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
          // T-469 — the run's declared scope governs every retrieval it makes
          ...(ctx.scope !== undefined && { scope: ctx.scope }),
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

  // T-407 — the GATE stays and the DEPENDENCY goes, and the difference is
  // worth naming. `document_builder` no longer needs the template registry: the
  // outline arrives composed, in the request. But the registry is still what a
  // deployment says when it says "I carry the document creator's domain
  // content" — the starting outlines an author begins from — and a deployment
  // that carries none should not be offering the tool.
  if (deps.templates !== undefined) {
    const documentBuilder = createDocumentBuilder({
      db: deps.db,
      router: deps.router,
      assemble: deps.assemble,
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
            // T-407 — the outline the author composed. Narrowed off `unknown`
            // like everything else here: a step input is data until something
            // checks it, and an outline that arrived malformed must not reach
            // the prompt as a shrug.
            sections: sectionsOf(inputs['sections']),
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
            // T-469 — the run's declared scope, off the context: the same one
            // written on the plan before retrieval. It replaces the version ids
            // the author used to bind, and goes through the gateway's pre-filter.
            ...(ctx.scope !== undefined && { scope: ctx.scope }),
            // T-471 — the author's working set, off the context (already
            // reach-checked at the API); background in the prompt, not a source
            ...(ctx.workingSet !== undefined && {
              workingSet: ctx.workingSet.map((doc) => ({ label: doc.label, excerpt: doc.excerpt })),
            }),
            destination: {
              sandboxId: text(inputs['destination_sandbox_id']) as Id,
              title: text(inputs['title'], 'Untitled'),
            },
          },
          // T-474 — the creator's citation trail needs the run and the step
          { runId: ctx.run.id as Id, stepId: ctx.stepId as Id },
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
            ...(ctx.scope !== undefined && { gatewayScope: ctx.scope }),
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
      //
      // T-399 — and the SAME door, one source along: a file uploaded straight
      // into this run arrives already parsed on the context, because its text
      // may not touch a persisted parameter (see `RunAttachment`). The two are
      // deliberately indistinguishable from here down — an attachment is an
      // attachment however it got here, and the check, the excerpt markers and
      // the coverage count treat them identically. The pinned ones come first
      // so a plan's `[A1]` marker keeps meaning the same thing across a
      // re-plan that adds an upload.
      const excerpts = [
        // T-471 — the pinned documents come off the CONTEXT, where the API put
        // them after checking each one's reach for this requester. They are no
        // longer read here by id: this used to select `sandbox_documents` by the
        // step input alone, so an id from a working area the requester was not in
        // (guessed, stale, or put there by an edited plan) was read straight
        // into the prompt. `attached_document_ids` stays a bound parameter for
        // the record; what the check is shown is only what was checked.
        ...(ctx.workingSet ?? []).map((doc) => ({
          attachedSourceId: doc.sandboxDocumentId,
          excerpt: `${doc.label}: ${doc.excerpt.slice(0, ATTACHED_EXCERPT_CHARS)}`,
        })),
        ...ctx.attachments.map((attachment) => ({
          attachedSourceId: attachment.attachedSourceId,
          excerpt: `${attachment.name}: ${attachment.excerpt.slice(0, ATTACHED_EXCERPT_CHARS)}`,
        })),
      ];
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
          // T-469 — the run's declared scope, off the context, through the
          // gateway's pre-filter (the `scope_version_ids` parameter is gone)
          ...(ctx.scope !== undefined && { scope: ctx.scope }),
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
