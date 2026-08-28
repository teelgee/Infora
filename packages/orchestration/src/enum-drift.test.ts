// T-263 — the three copies of the step and run vocabularies cannot drift.
//
// There are three, unavoidably: the contracts union every surface builds
// against, the drizzle `pgEnum` the schema declares, and the Postgres type the
// migration actually created. Two of them agreeing proves nothing about the
// third, and the failure mode is quiet — a step type present in the type and
// absent from the database is a `22P02` at the moment a worker first writes a
// row, in production, on an append-only table.
//
// This test lives in `orchestration` because it is the one package that sees
// both `@infora/contracts` and `@infora/db`: contracts depends on nothing and
// db depends on nothing, by the dependency matrix, so neither can check the
// other from inside itself.
import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { RUN_STATES, STEP_TYPES } from '@infora/contracts';
import { createDb, schema as s } from '@infora/db';

const { db, pool } = createDb();

afterAll(async () => {
  await pool.end();
});

/** The values Postgres actually holds for an enum type, in declaration order. */
async function databaseEnum(name: string): Promise<string[]> {
  const result = await db.execute<{ label: string }>(sql`
    select e.enumlabel as label
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = ${name}
     order by e.enumsortorder
  `);
  return result.rows.map((row) => row.label);
}

describe('the step and run vocabularies cannot drift (T-263)', () => {
  it('step_type: contracts, drizzle and the database hold the same set', async () => {
    const inDatabase = await databaseEnum('step_type');
    expect([...s.stepType.enumValues].sort()).toEqual([...STEP_TYPES].sort());
    expect(inDatabase.sort()).toEqual([...STEP_TYPES].sort());
  });

  it('run_state: contracts, drizzle and the database hold the same set', async () => {
    const inDatabase = await databaseEnum('run_state');
    expect([...s.runState.enumValues].sort()).toEqual([...RUN_STATES].sort());
    expect(inDatabase.sort()).toEqual([...RUN_STATES].sort());
  });

  it('carries the worker step types the Wave 3 table names', async () => {
    // named rather than counted: a count passes when one worker type is
    // swapped for another, which is the drift this is guarding against
    expect(STEP_TYPES).toEqual(
      expect.arrayContaining([
        'corpus_retrieval',
        'authority_lookup',
        'web_research',
        'extractor',
        'workflow_runner',
        'document_builder',
        'verifier',
      ]),
    );
  });

  it('a run may be `completed_with_failures`, and the database will store it', async () => {
    // the value exists in the type AND is writable — an enum value the
    // migration declared but the column cannot take would pass a set
    // comparison and fail at the first partial run (T-268)
    expect(RUN_STATES).toContain('completed_with_failures');
    const result = await db.execute<{ ok: string }>(
      sql`select 'completed_with_failures'::run_state::text as ok`,
    );
    expect(result.rows[0]?.ok).toBe('completed_with_failures');
  });
});
