// T-045 — cite resolution + the Suggestion write (doing leaf). Citations
// attach to grounded sources only — by construction: the input is the
// verifier's surviving claims, each already resolved to an admitted source.
// A document-targeted run writes one unanchored insert Suggestion (the
// skeleton's granularity; the per-item/anchor model waits in the schema,
// ruled 2026-07-06) with its citations; an untargeted chat run attaches the
// citations to the cite step instead, so the answer is citable either way.
import { eq } from 'drizzle-orm';
import type { AssembledInput, Id } from '@infora/contracts';
import { schema as s } from '@infora/db';
import { checkPropagation } from '@infora/governance';
import { runSourceAudience, sandboxDocumentAudience } from '@infora/knowledge';
import type { ChainLeaves, GroundCheckOutput, SourceRef } from './chain';

export function createCiteLeaf(): ChainLeaves['cite'] {
  return async (ctx, input) => {
    const { surviving, withheld } = input.checked;
    if (surviving.length === 0) return { output: { suggestionIds: [], answer: null } };

    // the draft text and each claim's span within it — resolved
    // deterministically because content is the surviving claims joined; the
    // paragraph join keeps the prose readable as a chat answer and a document
    // block alike (T-088, 2026-07-09). A labelled open-world claim (chat
    // only, T-089) joins the answer but earns no citation — citations attach
    // to grounded sources only, by construction.
    // T-273 — MANDATORY FLAGGING AT THE POINT OF USE, and it is code rather
    // than a prompt instruction, which is the only way "mandatory" is true.
    // Superseded material is excluded by default and admitted only on a
    // deliberate opt-in; where it IS admitted, the sentence resting on it says
    // so in the prose. A footer or a manifest entry is read after the sentence
    // has already been believed — this is the flag that is easy to render in a
    // footer and easy to forget where it matters.
    const flagged = surviving.map((claim) => ({
      ...claim,
      text: markSuperseded(claim, input.retrieved),
    }));
    const content = flagged.map((claim) => claim.text).join(CLAIM_SEPARATOR);
    const spans = claimSpans(flagged);
    const cited = flagged
      .map((claim, at) => ({ sourceRef: claim.sourceRef, claimSpan: spans[at] }))
      .filter((claim): claim is { sourceRef: SourceRefValue; claimSpan: { start: number; end: number } } =>
        claim.sourceRef !== undefined,
      );

    if (input.sandboxDocumentId === null) {
      if (cited.length > 0) {
        await ctx.db.insert(s.citations).values(
          cited.map((claim) => ({
            stepId: ctx.stepId,
            ...sourceColumns(claim.sourceRef),
            claimSpan: claim.claimSpan,
          })),
        );
      }
      return { output: { suggestionIds: [], answer: content } };
    }

    // T-249 — LABEL PROPAGATION, at the point content crosses into a document
    // (finding F2, finding F2). The destination is a sandbox with its own
    // scope grants; the answer rests on the sources this run admitted. A
    // destination broader than those sources is refused, and the refusal is
    // recorded on the step's rail outcomes naming BOTH labels — the same
    // carrier the grounding rail already uses, so it reaches the surface the
    // same way and is part of the audit record.
    //
    // The answer itself is still returned. Withholding the answer as well
    // would punish the user for the system's own scoping, and the answer is
    // material they may already read — it is the WRITE that would widen it.
    const source = await runSourceAudience(ctx.db, ctx.run.id);
    const destination = await sandboxDocumentAudience(ctx.db, input.sandboxDocumentId);
    const verdict = checkPropagation(source, destination);
    if (!verdict.allowed) {
      return {
        output: { suggestionIds: [], answer: content },
        audit: {
          railOutcomes: [
            {
              rail: 'label_propagation',
              outcome: 'withheld',
              detail: `Not written to the document: ${verdict.reason}.`,
            },
          ],
        },
      };
    }

    const [conversation] = await ctx.db
      .select({ workItemId: s.conversations.workItemId })
      .from(s.conversations)
      .where(eq(s.conversations.id, ctx.run.conversationId))
      .limit(1);

    const suggestionId = await ctx.db.transaction(async (tx) => {
      const [suggestion] = await tx
        .insert(s.suggestions)
        .values({
          runId: ctx.run.id,
          workItemId: conversation?.workItemId ?? null,
          sandboxDocumentId: input.sandboxDocumentId!,
          kind: 'insert',
          anchor: null, // unanchored in the skeleton
          content,
          rationale: rationaleFor(surviving.length, withheld.length),
        })
        .returning();
      await tx.insert(s.citations).values(
        cited.map((claim) => ({
          suggestionId: suggestion!.id,
          ...sourceColumns(claim.sourceRef),
          claimSpan: claim.claimSpan,
        })),
      );
      return suggestion!.id as Id;
    });

    return { output: { suggestionIds: [suggestionId], answer: content } };
  };
}

/**
 * The flag, in the vocabulary the Document Status slice already uses on screen
 * (T-388's badge, T-391's attached-source marker): the word is **superseded**,
 * because a reader who has seen the badge and the marker must not have to learn
 * a third name for one state.
 *
 * Appended to the claim rather than prefixed, so the sentence still reads as a
 * sentence — and appended INSIDE the claim text, so it travels with the claim
 * into the Suggestion, into the document, and into the citation's own span. A
 * flag added at render time would be lost the moment the answer was written
 * anywhere.
 */
const SUPERSEDED_FLAG = ' (from a superseded document)';

function markSuperseded(
  claim: { text: string; sourceRef?: SourceRefValue },
  retrieved: AssembledInput,
): string {
  if (claim.sourceRef === undefined || !('versionId' in claim.sourceRef)) return claim.text;
  const versionId = claim.sourceRef.versionId;
  const source = retrieved.items.find(
    (item) => item.source !== undefined && 'versionId' in item.source && item.source.versionId === versionId,
  );
  if (source?.descriptor?.superseded !== true) return claim.text;
  if (claim.text.includes(SUPERSEDED_FLAG)) return claim.text; // idempotent
  // before the terminal punctuation, so the mark reads as part of the sentence
  const terminal = /([.!?:;…]["'”’)\]]*)$/.exec(claim.text);
  return terminal === null
    ? `${claim.text}${SUPERSEDED_FLAG}`
    : `${claim.text.slice(0, terminal.index)}${SUPERSEDED_FLAG}${terminal[1]}`;
}

type SourceRefValue = SourceRef;

function sourceColumns(ref: SourceRefValue) {
  // T-468 — keep the passage the claim rested on; it was being dropped here
  return 'versionId' in ref
    ? { versionId: ref.versionId, authorityRef: null, chunkId: ref.chunkId ?? null }
    : { versionId: null, authorityRef: ref.authorityRef, chunkId: null };
}

const CLAIM_SEPARATOR = '\n\n';

function claimSpans(claims: GroundCheckOutput['surviving']): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  let at = 0;
  for (const claim of claims) {
    spans.push({ start: at, end: at + claim.text.length });
    at += claim.text.length + CLAIM_SEPARATOR.length;
  }
  return spans;
}

function rationaleFor(survivingCount: number, withheldCount: number): string {
  const withheldNote =
    withheldCount === 0
      ? 'nothing was withheld'
      : `${withheldCount} unsupported claim${withheldCount === 1 ? ' was' : 's were'} withheld`;
  return `Grounded draft: ${survivingCount} cited claim${survivingCount === 1 ? '' : 's'} from project sources; ${withheldNote}.`;
}
