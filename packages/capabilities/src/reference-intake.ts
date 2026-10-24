// T-472 — THE INTAKE PROPOSAL: a title and a classification for one uploaded
// reference document (ADR-0011's addendum of 2026-10-24; ADR-0045's dated note).
//
// *In plain terms: when the owner drops a standard or a piece of guidance on the
// library, Infora reads the first page or two and suggests what it is called and
// where it belongs — which kind of document, which discipline — and how sure it
// is, in a word. It only suggests. A person confirms before anything is kept.*
//
// The pattern is `rule-extraction.ts`'s: a PURE compose, a PURE validator, and
// nothing stored here. The API makes the model call and writes the run.
//
// 🔒 **A TERM THE SCHEME DOES NOT HAVE IS DROPPED, NEVER INVENTED.** The model
// is shown the project's own vocabulary and answers by facet key and term code;
// the ids are then taken from the scheme we loaded. A term outside it is
// discarded and counted — a made-up "Hydrology" must not become a classification
// by being said confidently. This is the admission rule of the checker and of
// rule extraction, one capability along.
//
// 🔒 **CONFIDENCE IS A WORD.** confident · likely · unsure. A number would look
// like a measurement, and a model's self-report is not one. Anything else the
// model writes becomes "unsure" — the cautious reading — never a guess upward.
import { INTAKE_CONFIDENCES } from '@infora/contracts';
import type { IntakeClassification, IntakeConfidence } from '@infora/contracts';

/** The project's scheme as the proposer is shown it: live terms only. */
export type IntakeFacet = {
  id: string;
  key: string;
  name: string;
  terms: Array<{ id: string; code: string; label: string }>;
};

/** How much of the file the model reads. A title and a type are on the first pages. */
export const INTAKE_READ_CHARS = 3000;

/** The marker the e2e substrate's fake model listens for, and the prompt's own first line. */
export const INTAKE_SYSTEM =
  'You are proposing a title and a classification for one uploaded reference document in an infrastructure project library. A person will check your proposal before anything is kept.';

export function composeIntakePrompt(
  filename: string,
  firstChars: string,
  facets: readonly IntakeFacet[],
): { system: string; prompt: string } {
  const vocabulary = facets
    .filter((facet) => facet.terms.length > 0)
    .map(
      (facet) =>
        `${facet.key} — ${facet.name}:\n${facet.terms.map((term) => `  ${term.code} = ${term.label}`).join('\n')}`,
    )
    .join('\n');
  const system = [
    INTAKE_SYSTEM,
    '',
    'Answer with ONE JSON object and nothing else:',
    '{ "title": "...", "classifications": [ { "facet": "<facet key>", "term": "<term code>", "confidence": "confident" | "likely" | "unsure" } ] }',
    '',
    'Rules:',
    '- The title is the document\'s own printed title, tidied — not the file name, not a summary. If you cannot tell, use the file name without its extension.',
    '- Give at most one term per facet, and ONLY a term listed below, by its code. If no listed term fits a facet, leave that facet out. Never invent a term.',
    '- Confidence is one of three words: confident (the text says so plainly), likely (the text points to it), unsure (a guess from little). Never a number.',
    '- You have read only the opening of the document. Do not claim more.',
  ].join('\n');
  const prompt = [
    `File name: ${filename}`,
    '',
    'The scheme you may classify against:',
    vocabulary === '' ? '(this project has no terms — return an empty list)' : vocabulary,
    '',
    'The opening of the document:',
    '"""',
    firstChars.slice(0, INTAKE_READ_CHARS),
    '"""',
  ].join('\n');
  return { system, prompt };
}

export type AdmittedProposal = {
  /** null when the model gave no usable title — the caller falls back to the file name */
  title: string | null;
  classifications: IntakeClassification[];
  /** terms or facets the scheme does not have, discarded */
  dropped: number;
};

function parseObject(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced?.[1] ?? raw).trim();
  const opened = body.indexOf('{');
  const closed = body.lastIndexOf('}');
  if (opened === -1 || closed <= opened) return null;
  try {
    const parsed: unknown = JSON.parse(body.slice(opened, closed + 1));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const words = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * Admit what the model said against the scheme we hold. Never throws: an
 * unparseable answer is an empty proposal, which the person fills by hand.
 */
export function admitIntakeProposal(raw: string, facets: readonly IntakeFacet[]): AdmittedProposal {
  const parsed = parseObject(raw);
  if (parsed === null) return { title: null, classifications: [], dropped: 0 };
  const title = words(parsed['title']).replace(/\s+/g, ' ').slice(0, 300);
  const out: IntakeClassification[] = [];
  const seenFacets = new Set<string>();
  let dropped = 0;
  const entries = Array.isArray(parsed['classifications']) ? parsed['classifications'] : [];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) {
      dropped += 1;
      continue;
    }
    const record = entry as Record<string, unknown>;
    const facet = facets.find((f) => f.key === words(record['facet']));
    const wanted = words(record['term']).toLowerCase();
    const term = facet?.terms.find((t) => t.code.toLowerCase() === wanted || t.label.toLowerCase() === wanted);
    if (facet === undefined || term === undefined || wanted === '') {
      dropped += 1;
      continue;
    }
    // one term per facet: the first the model gave stands
    if (seenFacets.has(facet.id)) continue;
    seenFacets.add(facet.id);
    const said = words(record['confidence']).toLowerCase();
    const confidence: IntakeConfidence = (INTAKE_CONFIDENCES as readonly string[]).includes(said)
      ? (said as IntakeConfidence)
      : 'unsure';
    out.push({ facetId: facet.id, termId: term.id, confidence });
  }
  return { title: title === '' ? null : title, classifications: out, dropped };
}
