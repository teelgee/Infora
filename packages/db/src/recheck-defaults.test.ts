// T-473 — the re-check intervals (migration 0079), against the dev database.
// *In plain terms: every project has a number of months for each kind of
// reference document — a year for a standard, six months for legislation — and
// a fallback for anything else. New projects get them from the seed, existing
// ones from the migration's own data step; a project cannot have two of the
// same, nor a zero.*
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createDb } from './client.js';
import { seedProjectOntology } from './ontology-seed.js';
import * as s from './schema/index.js';

const { db, pool } = createDb();
let projectId: string;

/** the migration's own data steps, read off the file so the test cannot drift from it */
const migrationInserts = (): string => {
  const file = readFileSync(join(import.meta.dirname, '..', 'migrations', '0079_recheck-currency.sql'), 'utf8');
  const at = file.indexOf('INSERT INTO "recheck_defaults"');
  expect(at).toBeGreaterThan(-1);
  return file.slice(at).replaceAll('--> statement-breakpoint', '');
};

const intervals = async (): Promise<Record<string, number>> => {
  const rows = await db
    .select({ label: s.classificationTerms.label, months: s.recheckDefaults.intervalMonths })
    .from(s.recheckDefaults)
    .leftJoin(s.classificationTerms, eq(s.classificationTerms.id, s.recheckDefaults.termId))
    .where(eq(s.recheckDefaults.projectId, projectId));
  return Object.fromEntries(rows.map((r) => [r.label ?? '(fallback)', r.months]));
};

beforeAll(async () => {
  const stamp = Date.now();
  const [org] = await db.insert(s.organisations).values({ name: `t473 org ${stamp}` }).returning();
  const [project] = await db.insert(s.projects).values({ name: `t473 project ${stamp}`, ownerOrganisationId: org!.id }).returning();
  projectId = project!.id;
});

afterAll(async () => {
  await pool.end();
});

const EXPECTED = { Standard: 12, Guidance: 12, Legislation: 6, 'Consultee response': 24, '(fallback)': 12 };

describe('the re-check intervals (T-473)', () => {
  it('a new project gets them from the seed', async () => {
    await seedProjectOntology(db, projectId);
    expect(await intervals()).toEqual(EXPECTED);
  });

  it('an existing project gets them from the migration, once', async () => {
    await db.delete(s.recheckDefaults).where(eq(s.recheckDefaults.projectId, projectId));
    expect(await intervals()).toEqual({});
    await db.execute(sql.raw(migrationInserts()));
    expect(await intervals()).toEqual(EXPECTED);
    // running it again adds nothing
    await db.execute(sql.raw(migrationInserts()));
    expect(await intervals()).toEqual(EXPECTED);
  });

  it('refuses a second fallback, a second row for a type, and a non-positive interval', async () => {
    await expect(db.insert(s.recheckDefaults).values({ projectId, termId: null, intervalMonths: 3 })).rejects.toThrow();
    const [row] = await db.select().from(s.recheckDefaults).where(eq(s.recheckDefaults.projectId, projectId)).limit(10);
    const typed = (await db.select().from(s.recheckDefaults).where(eq(s.recheckDefaults.projectId, projectId))).find((r) => r.termId !== null)!;
    await expect(db.insert(s.recheckDefaults).values({ projectId, termId: typed.termId, intervalMonths: 3 })).rejects.toThrow();
    await expect(db.update(s.recheckDefaults).set({ intervalMonths: 0 }).where(eq(s.recheckDefaults.id, row!.id))).rejects.toThrow();
  });
});
