// T-473 — reading a reference document's currency (ADR-0011's addendum of
// 2026-10-24, ruling 4).
//
// *In plain terms: given some documents, say for each reference document whether
// anybody has confirmed it is still the one to rely on, who, when, and whether
// the date for checking it again has passed. A deliverable has none — its
// currency is its acceptance.*
//
// One reader for every surface (the library, a version, a passage, a citation),
// so the library row and the citation cannot disagree about the same document.
// The state is decided here, **at the moment of the read**, from the stored
// due date: there is no clock and no job, and nothing stores "overdue".
import { eq, inArray } from 'drizzle-orm';
import { currencyOf } from '@infora/contracts';
import type { Currency } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';

/**
 * Currency for each container named; `null` for a deliverable (a container with
 * a work item). A container that does not exist is simply absent from the map.
 */
export async function readCurrencies(
  db: Db,
  containerIds: string[],
  now: Date = new Date(),
): Promise<Map<string, Currency | null>> {
  const out = new Map<string, Currency | null>();
  const ids = [...new Set(containerIds)];
  if (ids.length === 0) return out;
  const rows = await db
    .select({
      containerId: s.containers.id,
      workItemId: s.workItems.id,
      confirmedAt: s.containers.confirmedCurrentAt,
      recheckDue: s.containers.recheckDueAt,
      confirmedBy: s.users.name,
    })
    .from(s.containers)
    .leftJoin(s.workItems, eq(s.workItems.containerId, s.containers.id))
    .leftJoin(s.participants, eq(s.participants.id, s.containers.confirmedCurrentByParticipantId))
    .leftJoin(s.users, eq(s.users.id, s.participants.userId))
    .where(inArray(s.containers.id, ids));
  for (const row of rows) {
    out.set(
      row.containerId,
      row.workItemId !== null
        ? null
        : currencyOf({ confirmedBy: row.confirmedBy, confirmedAt: row.confirmedAt, recheckDue: row.recheckDue }, now),
    );
  }
  return out;
}
