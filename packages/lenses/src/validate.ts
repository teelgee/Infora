// T-281 — the Lens validator.
//
// VALIDATION FAILURES ARE BUILD FAILURES, NOT DEGRADATIONS. A Lens that does
// not load is not quietly dropped and not silently replaced by a default: the
// process refuses to start. A Lens the user did not get is worse than a
// refusal, because the answer still arrives and reads plausibly.
//
// The acceptance criterion this file is really written against is the QUALITY
// OF ITS MESSAGES. This layer is owned by planning and environmental
// specialists, not engineers, and error-message quality is exactly where an
// "engineers only" system quietly reasserts itself. Every message therefore
// names the FILE, the FIELD and the RULE, in the field's YAML spelling
// (`default_depth`, not `defaultDepth`) because that is what the author is
// looking at — and never a schema-library stack trace.
import type {
  Lens,
  LensAcronyms,
  LensCitationDisplay,
  LensDepth,
  LensJargon,
  LensOutput,
  LensStatus,
} from '@infora/contracts';
import { negatedCoreRule } from './core';

/** ids that existed and were withdrawn: never reused, so history stays legible. */
export const RETIRED_LENS_IDS: ReadonlySet<string> = new Set([]);

const JARGON: readonly LensJargon[] = ['peer', 'explained', 'avoided'];
const ACRONYMS: readonly LensAcronyms[] = ['unexpanded', 'first-use-expanded', 'avoided'];
const DEPTH: readonly LensDepth[] = ['high', 'medium', 'low'];
const OUTPUT: readonly LensOutput[] = ['prose', 'table', 'bullet-brief', 'draft-text', 'qa-pairs'];
const CITATION: readonly LensCitationDisplay[] = ['inline', 'footnote', 'appendix'];
const STATUS: readonly LensStatus[] = ['active', 'draft'];

// The YAML field names, and the camelCase key each becomes. The list is also
// the unknown-field check: a field not here is a typo or an invention, and
// both should stop the build rather than be silently ignored — a silently
// ignored `prohibitons:` is a prohibition that does not apply.
const FIELDS = {
  id: 'id',
  label: 'label',
  description: 'description',
  status: 'status',
  version: 'version',
  register: 'register',
  default_depth: 'defaultDepth',
  answer_shape: 'answerShape',
  default_output: 'defaultOutput',
  citation_display: 'citationDisplay',
  clarifying_bias: 'clarifyingBias',
  escalation_language: 'escalationLanguage',
  preferred_workers: 'preferredWorkers',
  prohibitions: 'prohibitions',
  example_exchanges: 'exampleExchanges',
} as const;

const REGISTER_FIELDS = { jargon: 'jargon', acronyms: 'acronyms', reading_level: 'readingLevel' } as const;
const EXCHANGE_FIELDS = { question: 'question', answer_sketch: 'answerSketch', why: 'why' } as const;

/** Required of every Lens, whatever its status. */
const ALWAYS_REQUIRED = [
  'id',
  'label',
  'description',
  'status',
  'version',
  'register',
  'default_depth',
  'answer_shape',
  'default_output',
  'citation_display',
  'clarifying_bias',
] as const;

/**
 * Required only once a Lens goes live. A draft exists to be worked on, and
 * demanding a finished file before it can be tried would make the draft status
 * pointless — but every one of these must be there before a real user meets it.
 * `commercial.yaml` is the worked example: promoting it as it stands fails with
 * all three of these messages, which is seed eval case BEH-05.
 */
const ACTIVE_REQUIRED = ['escalation_language', 'prohibitions'] as const;

/** An active Lens's worked exchanges become its behaviour eval cases (T-282). */
const MIN_ACTIVE_EXCHANGES = 2;

export type LensValidation =
  | { ok: true; lens: Lens }
  | { ok: false; errors: string[] };

/**
 * Validate one parsed Lens file. `file` is the basename, and it leads every
 * message — a validator that reports "field is required" without saying which
 * of five files it means is a validator the author has to bisect by hand.
 *
 * All errors are collected, never just the first: an author fixing one field at
 * a time through five build failures learns to resent the layer they own.
 */
export function validateLens(file: string, data: unknown): LensValidation {
  const errors: string[] = [];
  const at = (message: string) => errors.push(`${file}: ${message}`);

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return {
      ok: false,
      errors: [`${file}: the file must be a mapping of fields — see AUTHORING.md for the shape.`],
    };
  }
  const raw = data as Record<string, unknown>;

  for (const key of Object.keys(raw)) {
    if (key in FIELDS) continue;
    at(
      `unknown field \`${key}\`. A Lens carries: ${Object.keys(FIELDS).join(', ')}. ` +
        `Check the spelling, or see AUTHORING.md.`,
    );
  }

  const status = raw['status'];
  const isActive = status === 'active';

  for (const field of ALWAYS_REQUIRED) {
    if (raw[field] === undefined) at(`\`${field}\` is required`);
  }
  if (isActive) {
    for (const field of ACTIVE_REQUIRED) {
      if (raw[field] === undefined || (Array.isArray(raw[field]) && raw[field].length === 0)) {
        at(`\`${field}\` is required for an active Lens`);
      }
    }
  }

  const id = str(raw['id']);
  if (raw['id'] !== undefined) {
    if (id === undefined) {
      at('`id` must be text');
    } else {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
        at(
          `\`id\` must be lower-case words joined by hyphens (found "${id}") — ` +
            `it names the file and is recorded against every answer it produced.`,
        );
      }
      if (RETIRED_LENS_IDS.has(id)) {
        at(`\`id\` "${id}" is retired and cannot be reused. Choose a new id.`);
      }
      const expected = `${id}.yaml`;
      if (id !== '' && file !== expected && /^[a-z0-9-]+$/.test(id)) {
        at(`\`id\` is "${id}", so the file should be named \`${expected}\` — a Lens file is named after its id.`);
      }
    }
  }

  text(raw, 'label', at);
  text(raw, 'description', at);
  enumeration(raw, 'status', STATUS, at);

  const version = raw['version'];
  if (version !== undefined && (typeof version !== 'number' || !Number.isInteger(version) || version < 0)) {
    at(`\`version\` must be a whole number, 0 or more (found ${JSON.stringify(version)}) — increase it by one whenever the file changes.`);
  }

  const register = raw['register'];
  if (register !== undefined) {
    if (register === null || typeof register !== 'object' || Array.isArray(register)) {
      at('`register` must carry `jargon`, `acronyms` and `reading_level`');
    } else {
      const r = register as Record<string, unknown>;
      for (const key of Object.keys(r)) {
        if (key in REGISTER_FIELDS) continue;
        at(`unknown field \`register.${key}\`. \`register\` carries: ${Object.keys(REGISTER_FIELDS).join(', ')}.`);
      }
      for (const field of ['jargon', 'acronyms', 'reading_level'] as const) {
        if (r[field] === undefined) at(`\`register.${field}\` is required`);
      }
      enumeration(r, 'jargon', JARGON, at, 'register.');
      enumeration(r, 'acronyms', ACRONYMS, at, 'register.');
      text(r, 'reading_level', at, 'register.');
    }
  }

  enumeration(raw, 'default_depth', DEPTH, at);
  enumeration(raw, 'default_output', OUTPUT, at);
  enumeration(raw, 'citation_display', CITATION, at);

  const answerShape = lines(raw, 'answer_shape', at);
  const clarifyingBias = lines(raw, 'clarifying_bias', at);
  const escalation = lines(raw, 'escalation_language', at);
  const workers = lines(raw, 'preferred_workers', at);
  const prohibitions = lines(raw, 'prohibitions', at);

  if (raw['answer_shape'] !== undefined && answerShape !== undefined && answerShape.length === 0) {
    at('`answer_shape` cannot be empty — the first entry is what every answer leads with.');
  }

  // The field that does the most work, and the one rule a Lens may not break:
  // a prohibition adds to the shared core and never subtracts from it.
  for (const [index, entry] of (prohibitions ?? []).entries()) {
    const negated = negatedCoreRule(entry);
    if (negated === undefined) continue;
    at(
      `\`prohibitions\` entry ${index + 1} tries to switch off a shared rule that every Lens ` +
        `keeps — ${negated.id}: ${negated.summary}. A prohibition adds to those rules, it ` +
        `cannot remove one. Entry: "${truncate(entry)}"`,
    );
  }

  // `preferred_workers` naming a worker outside the registry is DEFERRED, and
  // deliberately so: there is no registry until T-269, and all four active
  // Lenses already name workers that do not exist yet (`authority_lookup`,
  // `extractor`, `verifier`). Validating against an empty registry would fail
  // every shipped file. The field loads as unvalidated strings until T-269
  // gives it something true to check against.
  void workers;

  const exchanges = exchangeList(raw, at);
  // Counted as DECLARED, not as successfully parsed: an author who wrote two
  // exchanges and left the `why` off one should be told about the `why`, not
  // also told to write two exchanges they can plainly see they have written.
  const declared = Array.isArray(raw['example_exchanges'])
    ? raw['example_exchanges'].length
    : (exchanges?.length ?? 0);
  if (isActive && declared < MIN_ACTIVE_EXCHANGES) {
    at(`an active Lens needs at least ${MIN_ACTIVE_EXCHANGES} \`example_exchanges\` (found ${declared})`);
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    lens: {
      id: id!,
      label: str(raw['label'])!,
      description: str(raw['description'])!,
      status: raw['status'] as LensStatus,
      version: raw['version'] as number,
      register: {
        jargon: (register as Record<string, unknown>)['jargon'] as LensJargon,
        acronyms: (register as Record<string, unknown>)['acronyms'] as LensAcronyms,
        readingLevel: str((register as Record<string, unknown>)['reading_level'])!,
      },
      defaultDepth: raw['default_depth'] as LensDepth,
      answerShape: answerShape!,
      defaultOutput: raw['default_output'] as LensOutput,
      citationDisplay: raw['citation_display'] as LensCitationDisplay,
      clarifyingBias: clarifyingBias!,
      escalationLanguage: escalation ?? [],
      preferredWorkers: workers ?? [],
      prohibitions: prohibitions ?? [],
      exampleExchanges: exchanges ?? [],
    },
  };
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined;
}

function truncate(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length <= 80 ? flat : `${flat.slice(0, 77)}…`;
}

function text(
  source: Record<string, unknown>,
  field: string,
  at: (message: string) => void,
  prefix = '',
): void {
  const value = source[field];
  if (value === undefined) return;
  if (typeof value !== 'string' || value.trim() === '') {
    at(`\`${prefix}${field}\` must be text, and cannot be empty`);
  }
}

function enumeration<T extends string>(
  source: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
  at: (message: string) => void,
  prefix = '',
): void {
  const value = source[field];
  if (value === undefined) return;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    at(
      `\`${prefix}${field}\` must be one of: ${allowed.join(', ')} (found ${JSON.stringify(value)})`,
    );
  }
}

function lines(
  source: Record<string, unknown>,
  field: string,
  at: (message: string) => void,
): string[] | undefined {
  const value = source[field];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    at(`\`${field}\` must be a list — one entry per line, each starting with "- "`);
    return undefined;
  }
  const out: string[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== 'string' || entry.trim() === '') {
      at(`\`${field}\` entry ${index + 1} must be text, and cannot be empty`);
      continue;
    }
    out.push(entry.replace(/\s+/g, ' ').trim());
  }
  return out;
}

function exchangeList(
  source: Record<string, unknown>,
  at: (message: string) => void,
): Lens['exampleExchanges'] | undefined {
  const value = source['example_exchanges'];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    at('`example_exchanges` must be a list of worked question-and-answer pairs');
    return undefined;
  }
  const out: Lens['exampleExchanges'] = [];
  for (const [index, entry] of value.entries()) {
    const label = `example_exchanges entry ${index + 1}`;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      at(`\`${label}\` must carry \`question\`, \`answer_sketch\` and \`why\``);
      continue;
    }
    const e = entry as Record<string, unknown>;
    for (const key of Object.keys(e)) {
      if (key in EXCHANGE_FIELDS) continue;
      at(`unknown field \`${key}\` in ${label}. An exchange carries: ${Object.keys(EXCHANGE_FIELDS).join(', ')}.`);
    }
    let complete = true;
    for (const field of ['question', 'answer_sketch', 'why'] as const) {
      const text_ = str(e[field]);
      if (text_ === undefined || text_ === '') {
        at(`\`${field}\` is required in ${label}`);
        complete = false;
      }
    }
    if (!complete) continue;
    out.push({
      question: str(e['question'])!,
      answerSketch: str(e['answer_sketch'])!,
      why: str(e['why'])!,
    });
  }
  return out;
}
