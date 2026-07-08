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
import type { ChainLeaves, GroundCheckOutput } from './chain';

export function createCiteLeaf(): ChainLeaves['cite'] {
  return async (ctx, input) => {
    const { surviving, withheld } = input.checked;
    if (surviving.length === 0) return { output: { suggestionIds: [], answer: null } };

    // the draft text and each claim's span within it — resolved
    // deterministically because content is the surviving claims joined
    const content = surviving.map((claim) => claim.text).join(' ');
    const spans = claimSpans(surviving);

    if (input.sandboxDocumentId === null) {
      await ctx.db.insert(s.citations).values(
        surviving.map((claim, at) => ({
          stepId: ctx.stepId,
          ...sourceColumns(claim.sourceRef),
          claimSpan: spans[at],
        })),
      );
      return { output: { suggestionIds: [], answer: content } };
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
        surviving.map((claim, at) => ({
          suggestionId: suggestion!.id,
          ...sourceColumns(claim.sourceRef),
          claimSpan: spans[at],
        })),
      );
      return suggestion!.id as Id;
    });

    return { output: { suggestionIds: [suggestionId], answer: content } };
  };
}

function sourceColumns(ref: { versionId: Id } | { authorityRef: string }) {
  return 'versionId' in ref
    ? { versionId: ref.versionId, authorityRef: null }
    : { versionId: null, authorityRef: ref.authorityRef };
}

function claimSpans(claims: GroundCheckOutput['surviving']): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  let at = 0;
  for (const claim of claims) {
    spans.push({ start: at, end: at + claim.text.length });
    at += claim.text.length + 1; // the joining space
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
