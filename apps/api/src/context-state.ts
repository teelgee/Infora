// T-388 — CONTEXT STATE: whether a deliverable is within the AI's reach, and if
// not, why (ADR-0013 §6).
//
// **Derived here, never stored, and never set.** A switch that could set this
// independently of its inputs would give the platform two state machines that
// could disagree — and the drift would be invisible, because every citation
// would still resolve. So this file has no writer and offers none: it reads the
// three conditions and states their answer.
//
// The three conditions are one per ADR (the ADR-0011 rider names them together):
//   1. in the project library — ADR-0011, membership, still necessary
//   2. record state `live` — ADR-0013, and `superseded`/`withdrawn`/`rejected`
//      never ground WHATEVER code got the deliverable there
//   3. the admitting acceptance code grounds — ADR-0003 as amended
//
// The same three conditions are the SQL pre-filter retrieval runs
// (packages/knowledge/src/retrieval.ts). The two must agree, and they agree by
// being the same three facts rather than by a shared cache: this one is a
// sentence for a person, that one is a `WHERE` clause, and neither is the other's
// source of truth.
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { ContextState } from '@infora/contracts';

export type AdmittingCode = { code: string; description: string; grounds: boolean };

/**
 * The acceptance code that ADMITTED each container to the library — the code of
 * its most recent accepting round — for a set of containers in one query.
 *
 * A container absent from the result has no accepting round at all. That is
 * owner-added reference material (T-304: no work item, no cycle, no code), whose
 * admission decision is the owner's own curation — ADR-0011 has always treated
 * that as the trust decision, so it grounds.
 */
export async function admittingCodes(
  db: Db,
  containerIds: string[],
): Promise<Map<string, AdmittingCode>> {
  if (containerIds.length === 0) return new Map();
  const rows = await db
    .select({
      containerId: s.reviewCycles.containerId,
      launchedAt: s.reviewCycles.launchedAt,
      number: s.rounds.number,
      code: s.acceptanceCodes.code,
      description: s.acceptanceCodes.description,
      grounds: s.acceptanceCodes.grounds,
    })
    .from(s.rounds)
    .innerJoin(s.reviewCycles, eq(s.rounds.cycleId, s.reviewCycles.id))
    .innerJoin(s.acceptanceCodes, eq(s.rounds.deliverableCodeId, s.acceptanceCodes.id))
    .where(
      and(
        inArray(s.reviewCycles.containerId, containerIds),
        isNotNull(s.rounds.deliverableCodeId),
        eq(s.acceptanceCodes.isAccepting, true),
      ),
    );
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const standing = latest.get(row.containerId);
    if (
      standing === undefined ||
      row.launchedAt > standing.launchedAt ||
      (row.launchedAt.getTime() === standing.launchedAt.getTime() && row.number > standing.number)
    ) {
      latest.set(row.containerId, row);
    }
  }
  return new Map(
    [...latest].map(([id, row]) => [
      id,
      { code: row.code, description: row.description, grounds: row.grounds },
    ]),
  );
}

/**
 * The badge's own sentence. `reason` is what follows the em dash in *"not used
 * for AI answers — withdrawn"*, and is null exactly when the deliverable does
 * ground.
 *
 * For a non-grounding code the reason is **the code's own description**, because
 * the project wrote it: the 2021 National Annex makes Published codes
 * stage-agnostic and requires each `An` code's meaning to be set in the
 * project's information standard, so the only honest short phrase for "why is
 * this out of reach" is the one that project chose.
 */
export function contextStateOf(
  container: { inLibrary: boolean; state: 'live' | 'superseded' | 'withdrawn' | 'rejected' },
  admittedBy: AdmittingCode | undefined,
): ContextState {
  if (!container.inLibrary) return { grounds: false, reason: 'not in the project library' };
  if (container.state !== 'live') return { grounds: false, reason: container.state };
  if (admittedBy && !admittedBy.grounds) return { grounds: false, reason: admittedBy.description };
  return { grounds: true, reason: null };
}
