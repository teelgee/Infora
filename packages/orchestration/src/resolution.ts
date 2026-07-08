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
  | { outcome: 'conflict' }; // a second resolution — the Signal already stands

export async function resolveSuggestion(
  db: Db,
  args: {
    suggestionId: Id;
    resolution: Resolution;
    editedContent?: string;
    resolvedByParticipantId: Id;
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

      // the skeleton's unanchored insert appends to the document head; the
      // anchored per-item apply arrives with the anchor model
      const applied = args.resolution === 'edited' ? args.editedContent! : suggestion.content;
      const [document] = await tx
        .update(s.sandboxDocuments)
        .set({
          content: sql`CASE WHEN ${s.sandboxDocuments.content} = '' THEN ${applied}
                       ELSE ${s.sandboxDocuments.content} || E'\n\n' || ${applied} END`,
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
