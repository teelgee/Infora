// T-274 — `extractor`: schema-conforming records, and the failures beside them.
//
// **STRUCTURED OUTPUT ONLY — no narrative.** The orchestrator sees rows and
// failures, never the model's account of how it got there (non-negotiable 6).
//
// **`failures` IS A FIRST-CLASS OUTPUT, and that is the whole ticket.**
// `strict` defaults true, and a row the model produced that does not conform is
// returned as a FAILURE carrying the partial row and the reason — never coerced
// into shape. A silently coerced commitment is worse than no record, because
// the entire value of a commitments register is that it is complete and
// checkable; a register with one quietly-mangled row is a register nobody can
// rely on, and it looks exactly like a good one. Failures also feed absence
// detection: the requested scope that produced nothing is reported rather than
// omitted.
//
// **Non-negotiable 1 applies to structured output exactly as to prose: every
// record carries source and locator.** No schema declares those columns — the
// validator refuses the names — because the extractor attaches them from the
// passage a row came from. A schema therefore cannot forget them and cannot
// forge them.
//
// **THIS IS NOT A NEW PATH TO THE STORE**, on `corpus_retrieval`'s terms. The
// extractor reaches the corpus only through the assembly gateway, which applies
// project, in-library, live-state, current-version, pinned-model and
// deliverable-visibility as SQL pre-filters. It therefore does not READ
// DOCUMENTS; it extracts from passages the gateway admitted, which is why
// `extraction_note` reports what of the requested scope was actually seen.
import type { Assemble, AssembledItem, WorkerDeclaration } from '@infora/contracts';
import { costOf } from '@infora/model';
import type { EgressFacts, ModelIdentity, ModelRates, Router } from '@infora/model';
import type { ExtractionField, ExtractionSchemaRegistry } from './extraction-schemas';

export const EXTRACTOR: WorkerDeclaration = {
  name: 'extractor',
  purpose:
    'Extract a named register — commitments, consultee responses, mitigation measures, ExA questions, deadlines or design parameters — from the project library, as rows with their sources.',
  tier: 'mid',
  inputSchema: {
    schema_name: 'which named register to extract (the shipped schema set)',
    scope: 'either { version_ids } — named documents — or { query } — a question',
    strict: 'refuse to coerce a non-conforming row; defaults true',
  },
  outputSchema: {
    records: 'rows conforming to the schema, each with its source and locator',
    failures: 'rows that did not conform, with the reason and the partial row',
    extraction_note: 'what scope was searched and what of it produced nothing',
  },
  tools: ['document store read'],
  reach: 'inherited',
  scopeNote: 'user ∩ project ∩ deliverable visibility — resolved inside the gateway call',
  leaf: true,
  writes: false,
  cacheable: true,
  externalEgress: false,
  requiresAuthorityShelf: false,
};

/** Named documents, or a question. Never both, and never neither. */
export type ExtractionScope = { versionIds: string[] } | { query: string };

export type ExtractorInput = {
  schemaName: string;
  scope: ExtractionScope;
  /** defaults TRUE — coercion is the failure this worker exists to refuse */
  strict?: boolean;
};

/** Where a row came from. Attached by this worker, never authored in a schema. */
export type RecordSource = {
  versionId: string;
  chunkId: string | null;
  locator: AssembledItem['locator'];
};

export type ExtractedRecord = {
  /** the schema's own columns, by field name */
  values: Record<string, string | number>;
  source: RecordSource;
};

/**
 * Why a row is not in the register.
 *
 * `partial_record` carries whatever the model did produce, because the
 * difference between "the model found nothing" and "the model found a
 * commitment with no date" is the difference between a gap in the corpus and a
 * gap in the document — and only one of those is anybody's to fix.
 */
export type ExtractionFailure = {
  reason: string;
  source: RecordSource | null;
  partialRecord: Record<string, unknown>;
};

export type ExtractorOutput = {
  records: ExtractedRecord[];
  failures: ExtractionFailure[];
  extractionNote: string;
  /** which schema, and which version of it, produced this */
  schema: { name: string; version: number };
  audit?: {
    model: ModelIdentity;
    usage: { tokensPrompt: number; tokensCompletion: number; cost: number | null };
    egress?: EgressFacts;
  };
};

export class UnknownExtractionSchema extends Error {
  constructor(name: string, available: string[]) {
    // names the available set rather than answering opaquely: the caller is our
    // own orchestrator, and "which ones are there" is the next question
    super(`no extraction schema named "${name}" — this deployment has: ${available.join(', ')}`);
    this.name = 'UnknownExtractionSchema';
  }
}

export type ExtractorDeps = {
  assemble: Assemble;
  router: Router;
  schemas: ExtractionSchemaRegistry;
  rates?: ModelRates;
};

export function createExtractor(deps: ExtractorDeps) {
  return async (
    requester: { organisationId: string; participantId: string },
    environment: { projectId: string },
    input: ExtractorInput,
  ): Promise<ExtractorOutput> => {
    const schema = deps.schemas.get(input.schemaName);
    if (schema === undefined) {
      throw new UnknownExtractionSchema(input.schemaName, deps.schemas.names());
    }
    const strict = input.strict ?? true;

    // The gateway takes TEXT. A document scope therefore searches on the
    // schema's own retrieval vocabulary and is narrowed to the named versions
    // afterwards — the alternative is a second path to the store, which is the
    // one thing a worker may never have.
    const wanted = 'versionIds' in input.scope ? input.scope.versionIds : null;
    const queryText = 'versionIds' in input.scope ? schema.retrievalHint : input.scope.query;

    const assembled = await deps.assemble({
      request: { text: queryText, mode: 'targeted' },
      environment: { kind: 'project', projectId: environment.projectId },
      requester,
    });

    const passages = assembled.items
      // grounded only, and `source` present: a guiding item has no source at
      // all (T-308) and a register row must never rest on one
      .filter((item) => item.channel === 'grounded' && item.source !== undefined)
      .map((item) => ({
        versionId: 'versionId' in item.source! ? item.source.versionId : '',
        chunkId: item.chunkId ?? null,
        locator: item.locator,
        text: item.content,
      }))
      .filter((passage) => passage.versionId !== '')
      .filter((passage) => wanted === null || wanted.includes(passage.versionId));

    const failures: ExtractionFailure[] = [];

    // A named document that the gateway did not return is a FAILURE, not a
    // silence. It is either out of reach or nothing in it matched, and both are
    // things the caller asked about and must be told.
    if (wanted !== null) {
      const seen = new Set(passages.map((passage) => passage.versionId));
      for (const versionId of wanted) {
        if (seen.has(versionId)) continue;
        failures.push({
          reason: 'no passage of this document was reachable for the requested schema',
          source: { versionId, chunkId: null, locator: undefined },
          partialRecord: {},
        });
      }
    }

    if (passages.length === 0) {
      return {
        records: [],
        failures,
        extractionNote: note(schema.label, 0, wanted, failures.length),
        schema: { name: schema.name, version: schema.version },
      };
    }

    const sourceByMarker = new Map(passages.map((passage, at) => [`S${at + 1}`, passage]));
    const result = await deps.router.chat('extract', {
      system: systemPrompt(schema.label, schema.description, schema.fields),
      messages: [
        {
          role: 'user',
          content: passages
            .map((passage, at) => `[S${at + 1}] ${passage.text}`)
            .join('\n\n'),
        },
      ],
    });

    const { rows, parseFailure } = parseRows(result.text);
    if (parseFailure !== null) {
      failures.push({ reason: parseFailure, source: null, partialRecord: {} });
    }

    const records: ExtractedRecord[] = [];
    for (const row of rows) {
      const marker = typeof row['source'] === 'string' ? (row['source'] as string) : '';
      const passage = sourceByMarker.get(marker.replace(/[[\]]/g, ''));
      const { values, problem } = conform(schema.fields, row, strict);
      const source: RecordSource | null =
        passage === undefined
          ? null
          : { versionId: passage.versionId, chunkId: passage.chunkId, locator: passage.locator };

      // NON-NEGOTIABLE 1, enforced here and not left to the model: a row whose
      // marker does not resolve to a passage this run actually saw has no
      // source, and a record without a source is not a record.
      if (source === null) {
        failures.push({
          reason: `the row cites "${marker || 'nothing'}", which is not a passage this extraction saw`,
          source: null,
          partialRecord: row,
        });
        continue;
      }
      if (problem !== null) {
        failures.push({ reason: problem, source, partialRecord: row });
        continue;
      }
      records.push({ values, source });
    }

    return {
      records,
      failures,
      extractionNote: note(schema.label, passages.length, wanted, failures.length),
      schema: { name: schema.name, version: schema.version },
      audit: {
        model: result.model,
        usage: {
          tokensPrompt: result.usage.tokensPrompt,
          tokensCompletion: result.usage.tokensCompletion,
          cost: costOf(deps.rates, result.model, result.usage),
        },
        ...(result.egress !== undefined && { egress: result.egress }),
      },
    };
  };
}

/**
 * What was searched and what of it produced nothing.
 *
 * Absence is the thing a register is for, so this states the shape of the
 * search rather than summarising the result — a note that said "6 commitments
 * found" would answer a question nobody needs to ask of a list they can count.
 */
function note(
  label: string,
  passages: number,
  wanted: string[] | null,
  failures: number,
): string {
  const scope =
    wanted === null
      ? 'the reachable project library'
      : `${wanted.length} named document${wanted.length === 1 ? '' : 's'}`;
  const seen = `${passages} passage${passages === 1 ? '' : 's'} of ${scope} were admitted and read`;
  const unconformed =
    failures === 0
      ? 'nothing was rejected'
      : `${failures} row${failures === 1 ? '' : 's'} did not conform and ${failures === 1 ? 'is' : 'are'} reported as failures rather than corrected`;
  return `${label}: ${seen}; ${unconformed}.`;
}

const systemPrompt = (label: string, description: string, fields: ExtractionField[]) =>
  [
    `You extract a "${label}" register. ${description}`,
    '',
    'Each numbered passage is marked [S1], [S2] and so on.',
    'Return ONLY a JSON array. No prose, no explanation, no code fence.',
    'Each element is an object with these keys:',
    ...fields.map(
      (field) =>
        `  "${field.name}" (${field.type}${field.required ? ', required' : ', optional'}) — ${field.description}`,
    ),
    '  "source" (required) — the marker of the passage this row came from, e.g. "S2".',
    '',
    'Take values from the passages. Where a passage does not state an optional value, omit the key rather than inventing one; where it does not state a required value, still return the row without it — a row reported as incomplete is useful and a row completed by guesswork is not.',
    'Return an empty array if the passages contain nothing of this kind.',
  ].join('\n');

/** Parse the model's answer, tolerating a code fence and nothing else. */
function parseRows(text: string): {
  rows: Array<Record<string, unknown>>;
  parseFailure: string | null;
} {
  const body = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // NOT a silent empty result: an unparseable answer is a failure the caller
    // is told about, because an empty register and an unreadable one look
    // identical to anyone downstream and mean opposite things.
    return { rows: [], parseFailure: 'the extraction did not return readable structured output' };
  }
  if (!Array.isArray(parsed)) {
    return { rows: [], parseFailure: 'the extraction returned something other than a list of rows' };
  }
  return {
    rows: parsed.filter(
      (row): row is Record<string, unknown> =>
        row !== null && typeof row === 'object' && !Array.isArray(row),
    ),
    parseFailure: null,
  };
}

/**
 * Hold a row to the schema. Returns the conforming values, or the first problem
 * in words — never a coerced value.
 *
 * `strict: false` is the only place coercion is permitted, and it is narrow:
 * a numeric string becomes a number. It never invents a missing required value
 * and never drops one it cannot read, because both of those produce a row that
 * conforms and lies.
 */
function conform(
  fields: ExtractionField[],
  row: Record<string, unknown>,
  strict: boolean,
): { values: Record<string, string | number>; problem: string | null } {
  const values: Record<string, string | number> = {};
  for (const field of fields) {
    const raw = row[field.name];
    if (raw === undefined || raw === null || raw === '') {
      if (field.required) {
        return { values, problem: `"${field.name}" is required and the row does not give it` };
      }
      continue;
    }
    if (field.type === 'number') {
      const value =
        typeof raw === 'number' ? raw : strict ? Number.NaN : Number(String(raw).replace(/,/g, ''));
      if (!Number.isFinite(value)) {
        return {
          values,
          problem: `"${field.name}" must be a number and the row gives ${JSON.stringify(raw)}`,
        };
      }
      values[field.name] = value;
      continue;
    }
    if (typeof raw !== 'string') {
      return {
        values,
        problem: `"${field.name}" must be text and the row gives ${JSON.stringify(raw)}`,
      };
    }
    if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
      // a date this register could not read is reported, never normalised by
      // guessing: "03/04/2026" is two different days depending on who wrote it
      return {
        values,
        problem: `"${field.name}" must be a date as YYYY-MM-DD and the row gives "${raw}"`,
      };
    }
    values[field.name] = raw.trim();
  }
  return { values, problem: null };
}
