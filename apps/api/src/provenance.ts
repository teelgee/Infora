// T-475 — WHO WROTE EACH PASSAGE, computed when asked (ADR-0048's amendment of
// 2026-10-24; CONTEXT.md **Gap marker** for the sibling idea).
//
// *In plain terms: hover a paragraph and the editor says whether the agent
// drafted it and who accepted it, or whether a person wrote it by hand. The
// answer is worked out each time from the record of accepted suggestions and
// the document's saved history — nothing is stored per paragraph.*
//
// **The limit, stated rather than hidden.** The record keeps no link from a
// span of the document to the suggestion it came from, so this finds a
// paragraph's author by EXACT match: a paragraph counts as agent-drafted when an
// accepted (or edited-then-accepted) suggestion contained a paragraph with
// exactly this text. A paragraph a person changed after accepting it no longer
// matches and is — honestly — reported as written by hand, which is what it now
// is. It never guesses on a near match.
//
// **No new personal data.** Names come from places the product already shows:
// the acceptor from the signal's resolver, the hand-saver from the document
// history's creator (both registered in docs/architecture/personal-data.md).
import { and, asc, eq, inArray } from 'drizzle-orm';
import { paragraphsOf } from '@infora/contracts';
import type { Id, PassageProvenance } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';

type Authored = {
  runId: Id;
  draftedAt: string | null;
  acceptedByName: string | null;
  acceptedAt: string;
  edited: boolean;
};

/**
 * Provenance for each paragraph of `content` (the document's current text unless
 * the caller passes the text that will actually be issued, e.g. a QA-frozen one).
 */
export async function readProvenance(
  db: Db,
  sandboxDocumentId: string,
  content?: string,
): Promise<PassageProvenance[]> {
  const [doc] = await db
    .select({
      content: s.sandboxDocuments.content,
      createdBy: s.sandboxDocuments.createdByParticipantId,
      updatedAt: s.sandboxDocuments.updatedAt,
    })
    .from(s.sandboxDocuments)
    .where(eq(s.sandboxDocuments.id, sandboxDocumentId))
    .limit(1);
  if (!doc) return [];
  const text = content ?? doc.content;
  const paragraphs = paragraphsOf(text);
  if (paragraphs.length === 0) return [];

  // the accepted / edited suggestions of this document, oldest first so a later
  // acceptance of the same paragraph wins
  const resolved = await db
    .select({
      content: s.suggestions.content,
      editedContent: s.signals.editedContent,
      resolution: s.signals.resolution,
      resolvedAt: s.signals.resolvedAt,
      resolvedBy: s.signals.resolvedByParticipantId,
      runId: s.suggestions.runId,
      draftedAt: s.runs.startedAt,
    })
    .from(s.signals)
    .innerJoin(s.suggestions, eq(s.signals.suggestionId, s.suggestions.id))
    .innerJoin(s.runs, eq(s.suggestions.runId, s.runs.id))
    .where(
      and(
        eq(s.suggestions.sandboxDocumentId, sandboxDocumentId),
        inArray(s.signals.resolution, ['accepted', 'edited']),
      ),
    )
    .orderBy(asc(s.signals.resolvedAt));

  const versions = await db
    .select({
      content: s.sandboxDocumentVersions.content,
      by: s.sandboxDocumentVersions.createdByParticipantId,
      at: s.sandboxDocumentVersions.createdAt,
    })
    .from(s.sandboxDocumentVersions)
    .where(eq(s.sandboxDocumentVersions.sandboxDocumentId, sandboxDocumentId))
    .orderBy(asc(s.sandboxDocumentVersions.createdAt), asc(s.sandboxDocumentVersions.id));

  const people = [
    ...new Set([doc.createdBy, ...resolved.map((r) => r.resolvedBy), ...versions.map((v) => v.by)]),
  ];
  const nameRows =
    people.length === 0
      ? []
      : await db
          .select({ id: s.participants.id, name: s.users.name })
          .from(s.participants)
          .innerJoin(s.users, eq(s.participants.userId, s.users.id))
          .where(inArray(s.participants.id, people));
  const nameOf = new Map(nameRows.map((r) => [r.id as string, r.name]));

  const authored = new Map<string, Authored>();
  for (const row of resolved) {
    const applied = row.resolution === 'edited' ? (row.editedContent ?? row.content) : row.content;
    for (const paragraph of paragraphsOf(applied)) {
      authored.set(paragraph.text, {
        runId: row.runId as Id,
        draftedAt: row.draftedAt.toISOString(),
        acceptedByName: nameOf.get(row.resolvedBy) ?? null,
        acceptedAt: row.resolvedAt.toISOString(),
        edited: row.resolution === 'edited',
      });
    }
  }

  return paragraphs.map((paragraph) => {
    const agent = authored.get(paragraph.text);
    if (agent !== undefined) {
      return {
        start: paragraph.start,
        end: paragraph.end,
        origin: 'agent' as const,
        runId: agent.runId,
        draftedAt: agent.draftedAt,
        acceptedByName: agent.acceptedByName,
        acceptedAt: agent.acceptedAt,
        edited: agent.edited,
        savedByName: null,
        savedAt: null,
      };
    }
    // by hand: whoever saved the document into the form in which this exact
    // paragraph first stood (walking back through the saved history while the
    // paragraph is still there), else the document's author
    let by: string = doc.createdBy;
    let at: Date = doc.updatedAt;
    for (let i = versions.length - 1; i >= 0; i -= 1) {
      const version = versions[i]!;
      if (!paragraphsOf(version.content).some((p) => p.text === paragraph.text)) break;
      by = version.by;
      at = version.at;
    }
    return {
      start: paragraph.start,
      end: paragraph.end,
      origin: 'hand' as const,
      runId: null,
      draftedAt: null,
      acceptedByName: null,
      acceptedAt: null,
      edited: false,
      savedByName: nameOf.get(by) ?? null,
      savedAt: at.toISOString(),
    };
  });
}
