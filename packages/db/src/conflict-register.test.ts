// T-245 acceptance: the conflict register's guarantees are enforced by the
// DATABASE, not by the code that writes to it (ADR-0046). Symmetry, the two
// grains' keys, and the grain/subject pairing all have to survive a caller who
// gets it wrong. Requires the dev database (docker compose up -d && pnpm migrate).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { createDb } from './client.js';
import * as s from './schema/index.js';

const { db, pool } = createDb();

async function expectDbError(promise: Promise<unknown>, pattern: RegExp) {
  const error = await promise.then(
    () => {
      throw new Error('expected the statement to be rejected');
    },
    (e: unknown) => e as Error & { cause?: Error },
  );
  expect(`${error.message} ${error.cause?.message ?? ''}`).toMatch(pattern);
}

/** The canonical storage order (ADR-0046 §9) — the CHECK enforces it. */
const canonical = (one: string, two: string) => (one < two ? [one, two] : [two, one]) as [string, string];

let orgId: string;
let adminId: string;
let aliceId: string;
let bobId: string;
let promoterId: string;
let objectorId: string;
let pair: [string, string];

beforeAll(async () => {
  const stamp = Date.now();
  const [org] = await db.insert(s.organisations).values({ name: `t245 org ${stamp}` }).returning();
  orgId = org!.id;

  const user = async (name: string) => {
    const [row] = await db
      .insert(s.users)
      .values({ name, email: `t245-${name}-${stamp}@test.local`, organisationId: orgId })
      .returning();
    return row!.id;
  };
  adminId = await user('admin');
  aliceId = await user('alice');
  bobId = await user('bob');

  const project = async (name: string) => {
    const [row] = await db
      .insert(s.projects)
      .values({ name: `t245 ${name} ${stamp}`, ownerOrganisationId: orgId })
      .returning();
    return row!.id;
  };
  promoterId = await project('promoter');
  objectorId = await project('objector');
  pair = canonical(promoterId, objectorId);
});

afterAll(async () => {
  await db.delete(s.conflictExclusions).where(eq(s.conflictExclusions.declaringOrganisationId, orgId));
  await pool.end();
});

const base = () => ({
  declaringOrganisationId: orgId,
  declaredByUserId: adminId,
  projectAId: pair[0],
  projectBId: pair[1],
});

describe('conflict_exclusions — constraints (T-245, ADR-0046)', () => {
  it('stores an individual-grain exclusion with its declaring admin and interval', async () => {
    const [row] = await db
      .insert(s.conflictExclusions)
      .values({ ...base(), grain: 'individual', subjectUserId: aliceId, reason: 'acting both sides' })
      .returning();
    expect(row!.declaredByUserId).toBe(adminId);
    expect(row!.declaredAt).toBeInstanceOf(Date);
    expect(row!.withdrawnAt).toBeNull();
  });

  it('rejects a non-canonical pair — symmetry is enforced, not merely intended (§9)', async () => {
    await expectDbError(
      db
        .insert(s.conflictExclusions)
        .values({ ...base(), projectAId: pair[1], projectBId: pair[0], grain: 'individual', subjectUserId: bobId }),
      /canonical_pair/i,
    );
  });

  it('rejects a pair naming the same project twice', async () => {
    await expectDbError(
      db
        .insert(s.conflictExclusions)
        .values({ ...base(), projectAId: promoterId, projectBId: promoterId, grain: 'individual', subjectUserId: bobId }),
      /canonical_pair|distinct_projects/i,
    );
  });

  it('rejects individual grain with no subject — it would otherwise bind nobody silently', async () => {
    await expectDbError(
      db.insert(s.conflictExclusions).values({ ...base(), grain: 'individual', subjectUserId: null }),
      /grain_subject/i,
    );
  });

  it('rejects organisation grain naming a subject — the grains are not interchangeable', async () => {
    await expectDbError(
      db.insert(s.conflictExclusions).values({ ...base(), grain: 'organisation', subjectUserId: aliceId }),
      /grain_subject/i,
    );
  });

  it('rejects a duplicate live individual exclusion for the same person and pair', async () => {
    await expectDbError(
      db.insert(s.conflictExclusions).values({ ...base(), grain: 'individual', subjectUserId: aliceId }),
      /individual_live_unique/i,
    );
  });

  it('allows the same pair for a DIFFERENT person — individual grain is per person (§7)', async () => {
    const [row] = await db
      .insert(s.conflictExclusions)
      .values({ ...base(), grain: 'individual', subjectUserId: bobId })
      .returning();
    expect(row!.subjectUserId).toBe(bobId);
  });

  it('allows an organisation-grain exclusion alongside the individual ones (the ceiling)', async () => {
    const [row] = await db
      .insert(s.conflictExclusions)
      .values({ ...base(), grain: 'organisation', subjectUserId: null })
      .returning();
    expect(row!.grain).toBe('organisation');
  });

  it('rejects a duplicate live organisation exclusion — the null subject still collides', async () => {
    // this is the case a single index over a nullable column would have missed:
    // Postgres treats two null subjects as distinct without NULLS NOT DISTINCT
    await expectDbError(
      db.insert(s.conflictExclusions).values({ ...base(), grain: 'organisation', subjectUserId: null }),
      /organisation_live_unique/i,
    );
  });

  it('withdrawal closes the interval, keeps the row, and frees the key for re-declaration (§5)', async () => {
    const live = and(
      eq(s.conflictExclusions.declaringOrganisationId, orgId),
      eq(s.conflictExclusions.grain, 'organisation'),
      isNull(s.conflictExclusions.withdrawnAt),
    );
    const [withdrawn] = await db
      .update(s.conflictExclusions)
      .set({ withdrawnAt: new Date(), withdrawnByUserId: adminId })
      .where(live)
      .returning();
    expect(withdrawn!.withdrawnAt).not.toBeNull();

    // the row survives, so a past refusal stays attributable to it
    const [kept] = await db
      .select()
      .from(s.conflictExclusions)
      .where(eq(s.conflictExclusions.id, withdrawn!.id));
    expect(kept!.declaredByUserId).toBe(adminId);

    // and the live key is free again — re-declaration is a new interval
    const [redeclared] = await db
      .insert(s.conflictExclusions)
      .values({ ...base(), grain: 'organisation', subjectUserId: null })
      .returning();
    expect(redeclared!.id).not.toBe(withdrawn!.id);
  });
});
