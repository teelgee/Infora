// T-468 — one recorded passage, read back by id.
//
// A citation records the chunk it was written from (migration 0075); the source
// card reads that one row to show the reader what the AI actually read. It reads
// ONE ROW BY ID and never searches: a card that re-retrieved would show what a
// query finds today, which is not what the run read. The chunk must belong to
// the version named, so a chunk id from another document cannot be fished
// through a version the requester may see.
//
// Lives here for the same two reasons as `readChunkPassages`: `version_chunks`
// is fenced to this package by the source guard, and the read must declare its
// project scope or row-level security returns nothing.
import { eq } from 'drizzle-orm';
import type { Locator } from '@infora/contracts';
import { resolveLocator } from '@infora/data';
import { schema as s, withProjectScope } from '@infora/db';
import type { Db } from '@infora/db';
import { locatorColumns } from './locator-columns';

export type RecordedPassage = { chunkIndex: number; content: string; locator: Locator | null };

/**
 * The recorded chunk; null where it is no longer held (re-ingested since the
 * run); `'other_version'` where the id names a chunk of a DIFFERENT version —
 * the caller answers that as not found, because the chunk must belong to the
 * version named.
 */
export async function readChunkPassage(
  db: Db,
  projectId: string,
  versionId: string,
  chunkId: string,
): Promise<RecordedPassage | null | 'other_version'> {
  const [row] = await withProjectScope(db, projectId, (tx) =>
    tx
      .select({
        chunkVersionId: s.versionChunks.versionId,
        chunkIndex: s.versionChunks.chunkIndex,
        content: s.versionChunks.content,
        ...locatorColumns,
      })
      .from(s.versionChunks)
      .innerJoin(s.versions, eq(s.versionChunks.versionId, s.versions.id))
      .where(eq(s.versionChunks.id, chunkId))
      .limit(1),
  );
  if (!row) return null;
  if (row.chunkVersionId !== versionId) return 'other_version';
  return { chunkIndex: row.chunkIndex, content: row.content, locator: resolveLocator(row) };
}
