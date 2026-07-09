// T-043 — grounded generation: the chain's one thinking leaf (ADR-0027 §6).
// The prompt is assembled from the access-resolved working input, the model
// is called through the Router, and the draft comes back as sentences each
// carrying a claim→source marker for the deterministic verifier (the
// LLM-with-verifier pattern, ADR-0027 §2). The capability knows nothing of
// runs or steps — orchestration adapts it into the chain.
import type { AssembledInput, Id } from '@infora/contracts';
import type { ModelIdentity, Router } from '@infora/model';

export type SourceRef = { versionId: Id } | { authorityRef: string };
export type DraftedClaim = { text: string; sourceRef?: SourceRef };

export type GroundedDraftResult = {
  claims: DraftedClaim[];
  model: ModelIdentity;
  usage: { tokensPrompt: number; tokensCompletion: number; cost: number };
};

export type GroundedDraftOptions = {
  // provider rates per million tokens; deployment config (the infra/security
  // session), not baked here — cost is still recorded either way
  costPerPromptMTok?: number;
  costPerCompletionMTok?: number;
  maxTokens?: number;
};

const SYSTEM = [
  'You draft sections of governed deliverables for infrastructure projects.',
  'Use ONLY the numbered sources provided; never draw on outside knowledge.',
  'Every sentence must end with the marker of the source that supports it, e.g. [S1].',
  'If the sources do not support a claim the task needs, omit that claim entirely.',
  'Formal register; cite by fact, not by speculation; no cost or programme commitments.',
  // ADR-0029 §5 precedence, stated to the agent rather than left to ordering:
  'Where project guidance and organisational know-how conflict, the project guidance governs.',
].join(' ');

export async function groundedDraft(
  router: Router,
  input: { request: string; retrieved: AssembledInput },
  options: GroundedDraftOptions = {},
): Promise<GroundedDraftResult> {
  const grounded = input.retrieved.items.filter((item) => item.channel === 'grounded');
  const sourceByMarker = new Map(grounded.map((item, at) => [`S${at + 1}`, item.source]));

  const sourceBlock = grounded
    .map((item, at) => `[S${at + 1}] ${item.content}`)
    .join('\n\n');
  const steer = input.retrieved.items
    .filter((item) => item.channel !== 'grounded')
    .map((item) => `(${item.channel}) ${item.content}`)
    .join('\n');

  const prompt = [
    'Sources:',
    sourceBlock === '' ? '(none provided)' : sourceBlock,
    steer === '' ? '' : `\nSteering material (never cite):\n${steer}`,
    `\nTask: ${input.request}`,
  ].join('\n');

  const result = await router.chat('draft', {
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
    ...(options.maxTokens !== undefined && { maxTokens: options.maxTokens }),
  });

  return {
    claims: parseClaims(result.text, sourceByMarker),
    model: result.model,
    usage: {
      tokensPrompt: result.usage.tokensPrompt,
      tokensCompletion: result.usage.tokensCompletion,
      cost:
        (result.usage.tokensPrompt * (options.costPerPromptMTok ?? 0) +
          result.usage.tokensCompletion * (options.costPerCompletionMTok ?? 0)) /
        1_000_000,
    },
  };
}

// Split the draft into claims on their [S#] markers; text left without a
// marker becomes an unsourced claim for the verifier to withhold — parsing
// is generous, the verifier is strict.
export function parseClaims(
  text: string,
  sourceByMarker: Map<string, SourceRef>,
): DraftedClaim[] {
  const claims: DraftedClaim[] = [];
  const marked = /([^[]*?)\s*\[(S\d+)\](?:\s*\[S\d+\])*/g; // first marker wins in v1

  let consumed = 0;
  for (const match of text.matchAll(marked)) {
    // the previous sentence often closes after its marker — "claim [S1]." —
    // so leading punctuation here is layout, not part of this claim
    const claimText = match[1]!.replace(/^[\s.,;:!?)\]]+/, '').trim();
    if (!isNoise(claimText)) {
      claims.push({ text: ensureTerminal(claimText), sourceRef: sourceByMarker.get(match[2]!) });
    }
    consumed = match.index + match[0].length;
  }
  const tail = text.slice(consumed).trim();
  if (!isNoise(tail)) claims.push({ text: ensureTerminal(tail) });
  return claims;
}

// A claim whose sentence closed after its marker lost its full stop to the
// leading-punctuation strip above — restore one, so the cite leaf's rejoined
// content keeps its sentence boundaries (T-087).
function ensureTerminal(text: string): string {
  return /[.!?:;…]["'”’)\]]*$/.test(text) ? text : `${text}.`;
}

function isNoise(text: string): boolean {
  return /^[\s.,;:!?)\]]*$/.test(text);
}
