// T-043 — grounded generation: the chain's one thinking leaf (ADR-0027 §6).
// The prompt is assembled from the access-resolved working input, the model
// is called through the Router, and the draft comes back as sentences each
// carrying a claim→source marker for the deterministic verifier (the
// LLM-with-verifier pattern, ADR-0027 §2). The capability knows nothing of
// runs or steps — orchestration adapts it into the chain.
import type { AssembledInput, Id, Lens } from '@infora/contracts';
import { composeLensOverlay } from '@infora/lenses';
import type { EgressFacts, ModelIdentity, Router } from '@infora/model';

export type SourceRef = { versionId: Id } | { authorityRef: string };
export type DraftedClaim = { text: string; sourceRef?: SourceRef };

export type GroundedDraftResult = {
  claims: DraftedClaim[];
  model: ModelIdentity;
  usage: { tokensPrompt: number; tokensCompletion: number; cost: number };
  egress?: EgressFacts; // the router's egress facts for this call (ADR-0037 §6)
};

export type GroundedDraftOptions = {
  // provider rates per million tokens; deployment config (the infra/security
  // session), not baked here — cost is still recorded either way
  costPerPromptMTok?: number;
  costPerCompletionMTok?: number;
  maxTokens?: number;
  // 'document' (default) drafts grounded-only; 'chat' may add the model's own
  // knowledge, unmarked — the verifier labels it open-world rather than
  // withholding it (the labelled-channels ruling, 2026-07-09)
  mode?: 'document' | 'chat';
};

// T-299 — the core clauses are held as an ARRAY rather than a joined string,
// so composition can be checked by containment: `composeSystemPrompt` asserts
// every clause survives, and a test asserts a Lens cannot remove one. A
// pre-joined string could only be checked by substring on the whole blob,
// which is exactly the check that stops being meaningful when someone
// reformats it.
const SYSTEM_SHARED = [
  'Every sentence supported by a numbered source must end with its marker, e.g. [S1].',
  // ADR-0029 §5 precedence, stated to the agent rather than left to ordering:
  'Where project guidance and organisational know-how conflict, the project guidance governs.',
];

export const SYSTEM_DOCUMENT_CLAUSES = [
  'You draft sections of governed deliverables for infrastructure projects.',
  'Use ONLY the numbered sources provided; never draw on outside knowledge.',
  'If the sources do not support a claim the task needs, omit that claim entirely.',
  'Formal register; cite by fact, not by speculation; no cost or programme commitments.',
  ...SYSTEM_SHARED,
] as const;

export const SYSTEM_CHAT_CLAUSES = [
  'You answer questions about infrastructure projects, clearly and helpfully.',
  'Prefer the numbered sources provided and mark every sentence they support.',
  'You may add relevant knowledge of your own where it helps — leave those sentences unmarked;',
  'they will be labelled as uncited for the reader. Never invent a marker.',
  'Format for reading: short paragraphs, bold for key terms, lists where they help.',
  ...SYSTEM_SHARED,
] as const;

/**
 * The sentence that makes the core win, stated to the model rather than left
 * to ordering. It is the prompt-level twin of the validator's core-negation
 * rule (T-281): the validator stops a Lens file from *asking* to weaken the
 * core, and this stops a Lens that somehow did from *succeeding*.
 */
export const LENS_PRECEDENCE =
  'What follows describes how to WRITE the answer — its register, its ordering, its emphasis. ' +
  'It adds to the rules above and relaxes none of them. Where it appears to conflict with anything above, the rule above governs.';

/**
 * The system prompt: the shared core, then the precedence sentence, then the
 * Lens overlay. Core first and core last — the Lens is bracketed by the rules
 * it cannot touch.
 */
export function composeSystemPrompt(mode: 'document' | 'chat', lens?: Lens | null): string {
  const core = mode === 'chat' ? SYSTEM_CHAT_CLAUSES : SYSTEM_DOCUMENT_CLAUSES;
  const coreText = core.join(' ');
  if (lens === undefined || lens === null) return coreText;
  return [coreText, '', LENS_PRECEDENCE, '', composeLensOverlay(lens)].join('\n');
}

export async function groundedDraft(
  router: Router,
  input: { request: string; retrieved: AssembledInput; lens?: Lens | null },
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
    // T-299 — the Lens arrives as DATA on the input, not as a construction
    // argument: the draft leaf is built once at app composition, so a Lens
    // bound there could never be per-request.
    system: composeSystemPrompt(options.mode === 'chat' ? 'chat' : 'document', input.lens),
    messages: [{ role: 'user', content: prompt }],
    ...(options.maxTokens !== undefined && { maxTokens: options.maxTokens }),
  });

  return {
    claims: parseClaims(result.text, sourceByMarker),
    model: result.model,
    ...(result.egress !== undefined && { egress: result.egress }),
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
