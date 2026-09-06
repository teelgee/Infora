// T-439 acceptance at the DB layer (migration 0067), beside the T-008
// append-only suite and the T-329 notification suite it takes its shape from.
//
// *In plain terms: these tests prove the database itself refuses the things the
// design says must never happen — an accepted figure being rewritten, a
// rejection with no reason, a row that carries a submission state on a table
// that has no acceptance step, a run whose two records of "who did this"
// disagree, and a firm's template carrying a client's data out of the project.*
//
// EVERY ONE OF THESE IS ASSERTED AT THE DATABASE AND NOT ONLY AT THE ROUTE, and
// that is the point of the file: a route can be bypassed by the next route
// somebody writes, and drawer 9's guarantees are the ones an app's data is
// worth nothing without.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createDb } from './client.js';
import * as s from './schema/index.js';

const { db, pool } = createDb();

// drizzle wraps PG errors (DrizzleQueryError); the trigger/constraint text is
// on `.cause`
async function expectDbError(promise: Promise<unknown>, pattern: RegExp) {
  const error = await promise.then(
    () => {
      throw new Error('expected the statement to be rejected');
    },
    (e: unknown) => e as Error & { cause?: Error },
  );
  expect(`${error.message} ${error.cause?.message ?? ''}`).toMatch(pattern);
}

const stamp = Date.now();
let organisationId: string;
let otherOrganisationId: string;
let projectId: string;
let participantId: string;
let otherParticipantId: string;
let appId: string;
/** a table WITH an acceptance step (the contractual case, ADR-0056 §2a) */
let acceptingTableId: string;
/** a table WITHOUT one (the firm's own register) */
let statelessTableId: string;
let conversationId: string;

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: `t439 org ${stamp}` }).returning();
  const [other] = await db
    .insert(s.organisations)
    .values({ name: `t439 other ${stamp}` })
    .returning();
  organisationId = org!.id;
  otherOrganisationId = other!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t439 project ${stamp}`, ownerOrganisationId: org!.id })
    .returning();
  projectId = project!.id;
  await db
    .insert(s.memberships)
    .values({ organisationId: org!.id, projectId: project!.id, role: 'owner' });
  const [user] = await db
    .insert(s.users)
    .values({ name: 't439-una', email: `t439-una-${stamp}@test.local`, organisationId: org!.id })
    .returning();
  const [second] = await db
    .insert(s.users)
    .values({ name: 't439-otto', email: `t439-otto-${stamp}@test.local`, organisationId: org!.id })
    .returning();
  const [p] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId: project!.id })
    .returning();
  const [q] = await db
    .insert(s.participants)
    .values({ userId: second!.id, projectId: project!.id })
    .returning();
  participantId = p!.id;
  otherParticipantId = q!.id;

  const [app] = await db
    .insert(s.apps)
    .values({
      projectId,
      name: `t439 app ${stamp}`,
      ownerParticipantId: participantId,
      createdByParticipantId: participantId,
      definitionUpdatedByParticipantId: participantId,
    })
    .returning();
  appId = app!.id;

  const [accepting] = await db
    .insert(s.appTables)
    .values({ appId, name: 'Monthly returns', hasAcceptance: true })
    .returning();
  const [stateless] = await db
    .insert(s.appTables)
    .values({ appId, name: 'Land register', hasAcceptance: false })
    .returning();
  acceptingTableId = accepting!.id;
  statelessTableId = stateless!.id;

  const [conversation] = await db
    .insert(s.conversations)
    .values({ projectId, surface: 'web' })
    .returning();
  conversationId = conversation!.id;
});

afterAll(async () => {
  await pool.end();
});

async function newRow(state: 'draft' | 'submitted' = 'draft'): Promise<string> {
  const [row] = await db
    .insert(s.appRows)
    .values({
      appTableId: acceptingTableId,
      values: { month: 'August 2026', landfill: 12.4 },
      organisationId,
      enteredByParticipantId: participantId,
      state,
    })
    .returning();
  return row!.id;
}

async function accept(rowId: string): Promise<void> {
  await db
    .update(s.appRows)
    .set({ state: 'accepted', decidedByParticipantId: otherParticipantId, decidedAt: new Date() })
    .where(eq(s.appRows.id, rowId));
}

describe('the published quartet moves together (ADR-0056 addendum, ruling 2)', () => {
  it('refuses an app published by nobody — three of four is not a publication', async () => {
    await expectDbError(
      db
        .update(s.apps)
        .set({ publishedDefinition: {}, publishedVersion: 1, publishedAt: new Date() })
        .where(eq(s.apps.id, appId)),
      /apps_published_quartet/,
    );
  });

  it('accepts all four together, which is what publishing actually is', async () => {
    await db
      .update(s.apps)
      .set({
        publishedDefinition: { schedule: 'manual' },
        publishedVersion: 1,
        publishedByParticipantId: participantId,
        publishedAt: new Date(),
      })
      .where(eq(s.apps.id, appId));
    const [row] = await db.select().from(s.apps).where(eq(s.apps.id, appId));
    expect(row!.publishedVersion).toBe(1);
  });
});

describe('a state exists exactly where an acceptance step does (ADR-0056 §2a)', () => {
  it('refuses a stateless row on a table that HAS an acceptance step', async () => {
    await expectDbError(
      db.insert(s.appRows).values({
        appTableId: acceptingTableId,
        values: {},
        organisationId,
        enteredByParticipantId: participantId,
      }),
      /must carry a state/,
    );
  });

  it('refuses a submission state on a table that has NO acceptance step', async () => {
    // the failure this stops: a submission flow nobody asked for, silently
    // holding rows back from the project owner
    await expectDbError(
      db.insert(s.appRows).values({
        appTableId: statelessTableId,
        values: {},
        organisationId,
        enteredByParticipantId: participantId,
        state: 'draft',
      }),
      /must carry no state/,
    );
  });

  it('takes a stateless row on a table with no acceptance step — it never changes hands', async () => {
    const [row] = await db
      .insert(s.appRows)
      .values({
        appTableId: statelessTableId,
        values: { plot: '17a' },
        organisationId,
        enteredByParticipantId: participantId,
      })
      .returning();
    expect(row!.state).toBeNull();
  });
});

describe('a rejection carries a reason, and only a rejection does (ruling 4)', () => {
  it('refuses a rejection with no reason — at the DATABASE, not only the route', async () => {
    const rowId = await newRow('submitted');
    await expectDbError(
      db
        .update(s.appRows)
        .set({ state: 'rejected', decidedByParticipantId: otherParticipantId, decidedAt: new Date() })
        .where(eq(s.appRows.id, rowId)),
      /app_rows_rejection_reason_iff_rejected/,
    );
  });

  it('takes a rejection with one, and the reason is on the row for the submitter to read', async () => {
    const rowId = await newRow('submitted');
    await db
      .update(s.appRows)
      .set({
        state: 'rejected',
        decidedByParticipantId: otherParticipantId,
        decidedAt: new Date(),
        rejectionReason: 'Landfill figure looks like a decimal slip. Please check and resubmit.',
      })
      .where(eq(s.appRows.id, rowId));
    const [row] = await db.select().from(s.appRows).where(eq(s.appRows.id, rowId));
    expect(row!.rejectionReason).toMatch(/decimal slip/);
  });

  it('refuses a reason on a row nobody rejected', async () => {
    await expectDbError(
      db.insert(s.appRows).values({
        appTableId: acceptingTableId,
        values: {},
        organisationId,
        enteredByParticipantId: participantId,
        state: 'draft',
        rejectionReason: 'nobody asked',
      }),
      /app_rows_rejection_reason_iff_rejected/,
    );
  });
});

describe('a decided row names its decider and its time, and nothing else does', () => {
  it('refuses an acceptance with no decider', async () => {
    const rowId = await newRow('submitted');
    await expectDbError(
      db.update(s.appRows).set({ state: 'accepted' }).where(eq(s.appRows.id, rowId)),
      /app_rows_decided_pair/,
    );
  });

  it('refuses a decider on a row nobody has decided', async () => {
    await expectDbError(
      db.insert(s.appRows).values({
        appTableId: acceptingTableId,
        values: {},
        organisationId,
        enteredByParticipantId: participantId,
        state: 'draft',
        decidedByParticipantId: otherParticipantId,
        decidedAt: new Date(),
      }),
      /app_rows_decided_pair/,
    );
  });
});

describe('an accepted row is never edited or deleted in place (ADR-0056 §2a)', () => {
  it('rejects an UPDATE to an accepted row — the ticket names this one by name', async () => {
    const rowId = await newRow('submitted');
    await accept(rowId);
    await expectDbError(
      db.update(s.appRows).set({ values: { landfill: 0.4 } }).where(eq(s.appRows.id, rowId)),
      /is accepted/,
    );
  });

  it('rejects a DELETE of an accepted row — it is the project owner’s record', async () => {
    const rowId = await newRow('submitted');
    await accept(rowId);
    await expectDbError(db.delete(s.appRows).where(eq(s.appRows.id, rowId)), /is accepted/);
  });

  it('rejects retiring an accepted row: retirement is for the entering organisation’s own material', async () => {
    const rowId = await newRow('submitted');
    await accept(rowId);
    await expectDbError(
      db
        .update(s.appRows)
        .set({ retiredAt: new Date(), retiredByParticipantId: participantId })
        .where(eq(s.appRows.id, rowId)),
      /is accepted/,
    );
  });

  it('permits the ONE transition a correction needs — accepted → superseded — and freezes the rest', async () => {
    const rowId = await newRow('submitted');
    await accept(rowId);
    await db.update(s.appRows).set({ state: 'superseded' }).where(eq(s.appRows.id, rowId));
    const [row] = await db.select().from(s.appRows).where(eq(s.appRows.id, rowId));
    expect(row!.state).toBe('superseded');
    // and the decider it was accepted by is still on the row
    expect(row!.decidedByParticipantId).toBe(otherParticipantId);
  });
});

describe('the grant tables are append-only intervals', () => {
  it('lets a scope grant be revoked, and refuses everything else about it moving', async () => {
    const [grant] = await db
      .insert(s.appScopeGrants)
      .values({
        appId,
        granteeType: 'organisation',
        organisationId,
        grantedByParticipantId: participantId,
      })
      .returning();
    await db
      .update(s.appScopeGrants)
      .set({ revokedAt: new Date(), revokedByParticipantId: participantId })
      .where(eq(s.appScopeGrants.id, grant!.id));
    await expectDbError(
      db
        .update(s.appScopeGrants)
        .set({ organisationId: otherOrganisationId })
        .where(eq(s.appScopeGrants.id, grant!.id)),
      /is an interval/,
    );
    await expectDbError(
      db.delete(s.appScopeGrants).where(eq(s.appScopeGrants.id, grant!.id)),
      /append-only interval/,
    );
  });

  it('refuses a grant naming both an organisation and a participant', async () => {
    await expectDbError(
      db.insert(s.appScopeGrants).values({
        appId,
        granteeType: 'organisation',
        organisationId,
        participantId,
        grantedByParticipantId: participantId,
      }),
      /app_scope_grants_one_grantee/,
    );
  });

  it('refuses reopening a revoked table share — revoking is never reversible in place', async () => {
    const [share] = await db
      .insert(s.appTableShares)
      .values({
        appTableId: acceptingTableId,
        organisationId: otherOrganisationId,
        grantedByParticipantId: participantId,
      })
      .returning();
    await db
      .update(s.appTableShares)
      .set({ revokedAt: new Date(), revokedByParticipantId: participantId })
      .where(eq(s.appTableShares.id, share!.id));
    await expectDbError(
      db
        .update(s.appTableShares)
        .set({ revokedAt: null, revokedByParticipantId: null })
        .where(eq(s.appTableShares.id, share!.id)),
      /already revoked/,
    );
  });
});

describe('an app run’s two actor stamps cannot disagree (the drawing’s CHECK)', () => {
  async function newRun(requesterParticipantId: string): Promise<string> {
    const [run] = await db
      .insert(s.runs)
      .values({
        conversationId,
        agentId: 'app-run',
        agentProvenance: 'infora',
        request: 'run the app',
        environmentKey: `project:${projectId}`,
        requesterParticipantId,
      })
      .returning();
    return run!.id;
  }

  it('refuses an app run acting as somebody the Drawer 3 run does not name', async () => {
    const runId = await newRun(participantId);
    await expectDbError(
      db.insert(s.appRuns).values({
        appId,
        runId,
        trigger: 'manual',
        asParticipantId: otherParticipantId,
        definitionsVersion: 1,
      }),
      /the two stamps must agree/,
    );
  });

  it('takes the run when they agree, and records the PUBLISHED version it acted against', async () => {
    const runId = await newRun(participantId);
    const [row] = await db
      .insert(s.appRuns)
      .values({
        appId,
        runId,
        trigger: 'manual',
        asParticipantId: participantId,
        definitionsVersion: 1,
      })
      .returning();
    expect(row!.definitionsVersion).toBe(1);
  });

  it('is append-only: a finished run is immutable and DELETE is refused', async () => {
    const runId = await newRun(participantId);
    const [row] = await db
      .insert(s.appRuns)
      .values({
        appId,
        runId,
        trigger: 'manual',
        asParticipantId: participantId,
        definitionsVersion: 1,
      })
      .returning();
    await db
      .update(s.appRuns)
      .set({ finishedAt: new Date(), outcome: 'completed' })
      .where(eq(s.appRuns.id, row!.id));
    await expectDbError(
      db.update(s.appRuns).set({ outcome: 'failed' }).where(eq(s.appRuns.id, row!.id)),
      /finished and immutable/,
    );
    await expectDbError(db.delete(s.appRuns).where(eq(s.appRuns.id, row!.id)), /append-only/);
  });
});

describe('an export row is provenance, and it is insert-only (ADR-0056 §8)', () => {
  it('has no producer column at all — the stamp names data and time, never an author', async () => {
    const columns = await db.execute<{ column_name: string }>(sql`
      select column_name from information_schema.columns where table_name = 'app_exports'
    `);
    const names = columns.rows.map((row) => row.column_name).sort();
    expect(names).toEqual([
      'app_id',
      'data_as_of',
      'exported_at',
      'exported_by_participant_id',
      'file_ref',
      'id',
      'rows_covered',
      'tables_covered',
    ]);
    // the negative stated as a negative: nothing here names a PRODUCER, which
    // is what an "agent drafted" marking would have been
    expect(names).not.toContain('produced_by');
  });

  it('refuses an UPDATE — the file has already left, so the record cannot be corrected', async () => {
    const [row] = await db
      .insert(s.appExports)
      .values({
        appId,
        exportedByParticipantId: participantId,
        fileRef: `file://t439-${stamp}.xlsx`,
        dataAsOf: new Date(),
      })
      .returning();
    await expectDbError(
      db.update(s.appExports).set({ rowsCovered: 99 }).where(eq(s.appExports.id, row!.id)),
      /append-only/,
    );
  });
});

describe('a playbook carries structure and never rows (ADR-0056 §10)', () => {
  it('takes a table DEFINITION — name, columns, kind — which is what "structure" means', async () => {
    const [row] = await db
      .insert(s.playbooks)
      .values({
        organisationId,
        name: `t439 returns playbook ${stamp}`,
        savedByParticipantId: participantId,
        tableDeclarations: [
          { name: 'Monthly returns', kind: 'data', columns: [{ key: 'landfill', type: 'number' }] },
        ],
      })
      .returning();
    expect(row!.version).toBe(1);
  });

  it('refuses a `rows` key anywhere in the declarations — of any origin', async () => {
    await expectDbError(
      db.insert(s.playbooks).values({
        organisationId,
        name: `t439 leaky playbook ${stamp}`,
        savedByParticipantId: participantId,
        tableDeclarations: [{ name: 'Emission factors', rows: [{ factor: 0.21 }] }],
      }),
      /never rows/,
    );
  });

  it('refuses one nested deep inside the definition too', async () => {
    await expectDbError(
      db.insert(s.playbooks).values({
        organisationId,
        name: `t439 deep playbook ${stamp}`,
        savedByParticipantId: participantId,
        definition: { interfaces: [{ id: 'a', preview: { rows: [{ month: 'August' }] } }] },
      }),
      /never rows/,
    );
  });
});

describe('an app closes by interval, never by deletion (ADR-0056 §7)', () => {
  it('refuses a closing with nobody’s name on it', async () => {
    const [app] = await db
      .insert(s.apps)
      .values({
        projectId,
        name: `t439 closing app ${stamp}`,
        ownerParticipantId: participantId,
        createdByParticipantId: participantId,
        definitionUpdatedByParticipantId: participantId,
      })
      .returning();
    await expectDbError(
      db.update(s.apps).set({ closedAt: new Date() }).where(eq(s.apps.id, app!.id)),
      /apps_closed_pair/,
    );
    await db
      .update(s.apps)
      .set({ closedAt: new Date(), closedByParticipantId: participantId })
      .where(eq(s.apps.id, app!.id));
    const [row] = await db.select().from(s.apps).where(eq(s.apps.id, app!.id));
    expect(row!.closedByParticipantId).toBe(participantId);
  });
});
