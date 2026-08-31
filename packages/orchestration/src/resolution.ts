// T-053 — resolution → Signal → apply (the loop's capture side, Drawer 4):
// exactly one append-only Signal per Suggestion in v1; accept applies the
// proposed content, edit applies the edited content, reject applies nothing.
// The Signal is captured and sunk nowhere — the moat's write loop is a later
// session, by design.
import { eq, sql } from 'drizzle-orm';
import type { Id, Resolution } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';

export type SandboxDocumentRow = typeof s.sandboxDocuments.$inferSelect;

export type ResolutionResult =
  | { outcome: 'resolved'; signalId: Id; document: SandboxDocumentRow | null }
  | { outcome: 'conflict' } // a second resolution — the Signal already stands
  /**
   * T-311 — the anchored apply found the text under the anchor had moved.
   *
   * **A drifted anchor degrades, never blocks** (the Suggestion pattern, T-112,
   * and the sandbox head is mutable by design). Nothing is written and no
   * Signal is recorded: writing the proposal over whatever now sits at those
   * offsets would put the AI's words somewhere nobody looked, which is worse
   * than the acceptance not landing.
   */
  | { outcome: 'drifted' };

/**
 * T-311 — **the anchored per-item apply this file has been predicting since
 * T-053**, whose own comment says it "arrives with the anchor model". A finding
 * anchors at real offsets into the draft (ADR-0048 §2), so accepting its fix
 * REPLACES that span rather than appending to the document — appending a
 * corrected sentence to the end of a chapter is not a correction.
 *
 * Absent, the behaviour is exactly the skeleton's unanchored append, unchanged.
 */
export type ResolutionAnchor = {
  start: number;
  end: number;
  /** what the text said when the finding was raised — the drift test */
  verbatim: string;
};

export async function resolveSuggestion(
  db: Db,
  args: {
    suggestionId: Id;
    resolution: Resolution;
    editedContent?: string;
    resolvedByParticipantId: Id;
    /** T-311 — replace this span instead of appending (see `ResolutionAnchor`) */
    anchor?: ResolutionAnchor;
  },
): Promise<ResolutionResult> {
  try {
    return await db.transaction(async (tx) => {
      const [suggestion] = await tx
        .select()
        .from(s.suggestions)
        .where(eq(s.suggestions.id, args.suggestionId))
        .limit(1);
      if (!suggestion) throw new Error(`suggestion ${args.suggestionId} not found`);

      // T-311 — the drift test runs BEFORE the Signal is written, because a
      // Signal is a record that a human resolved something and an acceptance
      // that could not be applied resolved nothing.
      if (args.anchor !== undefined && args.resolution !== 'rejected') {
        const [document] = await tx
          .select({ content: s.sandboxDocuments.content })
          .from(s.sandboxDocuments)
          .where(eq(s.sandboxDocuments.id, suggestion.sandboxDocumentId))
          .limit(1);
        const at = document?.content.slice(args.anchor.start, args.anchor.end);
        if (at !== args.anchor.verbatim) return { outcome: 'drifted' as const };
      }

      const [signal] = await tx
        .insert(s.signals)
        .values({
          suggestionId: suggestion.id,
          resolution: args.resolution,
          editedContent: args.resolution === 'edited' ? (args.editedContent ?? null) : null,
          resolvedByParticipantId: args.resolvedByParticipantId,
        })
        .returning();

      if (args.resolution === 'rejected') {
        return { outcome: 'resolved' as const, signalId: signal!.id, document: null };
      }

      // the skeleton's unanchored insert appends to the document head; T-311's
      // anchored apply REPLACES the span the finding pointed at, which is what
      // makes a marked-up edit an edit rather than a postscript
      const applied = args.resolution === 'edited' ? args.editedContent! : suggestion.content;
      const content =
        args.anchor === undefined
          ? sql`CASE WHEN ${s.sandboxDocuments.content} = '' THEN ${applied}
                       ELSE ${s.sandboxDocuments.content} || E'\n\n' || ${applied} END`
          : sql`overlay(${s.sandboxDocuments.content} placing ${applied}
                        from ${args.anchor.start + 1} for ${args.anchor.end - args.anchor.start})`;
      const [document] = await tx
        .update(s.sandboxDocuments)
        .set({
          content,
          updatedAt: sql`now()`, // DB time, like the insert default
        })
        .where(eq(s.sandboxDocuments.id, suggestion.sandboxDocumentId))
        .returning();

      return { outcome: 'resolved' as const, signalId: signal!.id, document: document ?? null };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { outcome: 'conflict' };
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } }).cause ?? error;
  return (cause as { code?: string }).code === '23505';
}
