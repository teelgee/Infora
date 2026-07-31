// T-045 — cite resolution + the Suggestion write (doing leaf). Citations
// attach to grounded sources only — by construction: the input is the
// verifier's surviving claims, each already resolved to an admitted source.
// A document-targeted run writes one unanchored insert Suggestion (the
// skeleton's granularity; the per-item/anchor model waits in the schema,
// ruled 2026-07-06) with its citations; an untargeted chat run attaches the
// citations to the cite step instead, so the answer is citable either way.
import { eq } from 'drizzle-orm';
import type { Id } from '@infora/contracts';
import { schema as s } from '@infora/db';
import { checkPropagation } from '@infora/governance';
import { runSourceAudience, sandboxDocumentAudience } from '@infora/knowledge';
import type { ChainLeaves, GroundCheckOutput } from './chain';

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
    const content = surviving.map((claim) => claim.text).join(CLAIM_SEPARATOR);
    const spans = claimSpans(surviving);
    const cited = surviving
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
    // (docs/ask/09 R2, finding F2). The destination is a sandbox with its own
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

type SourceRefValue = { versionId: Id } | { authorityRef: string };

function sourceColumns(ref: SourceRefValue) {
  return 'versionId' in ref
    ? { versionId: ref.versionId, authorityRef: null }
    : { versionId: null, authorityRef: ref.authorityRef };
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
