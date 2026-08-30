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
import type { Assemble, Id } from '@infora/contracts';
import {
  CORPUS_RETRIEVAL,
  DOCUMENT_BUILDER,
  EXTRACTOR,
  createCorpusRetrieval,
  createExtractor,
} from '@infora/capabilities';
import type { ExtractionSchemaRegistry, TemplateRegistry } from '@infora/capabilities';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { ModelRates, Router } from '@infora/model';
import type { Capability, CapabilityRegistry, LeafContext, SourceRef } from './chain';
import { createDocumentBuilder } from './document-builder';
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

  return { get: (name) => built.get(name) };
}
