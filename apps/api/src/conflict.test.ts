// T-246 acceptance, against the live dev database (ADR-0046). The two audiences
// and the line between them: the declaring organisation's own admin sees the
// register in full; the project owner sees the attestation and NOTHING of the
// register — not a row, not a count, not a subject, not a date from it (§8).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  DeclareExclusionResponse,
  ListConflictAttestationsResponse,
  ListConflictExclusionsResponse,
} from '@infora/contracts';
import { CONFLICT_REFUSAL } from '@infora/governance';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { and, eq, isNull } from 'drizzle-orm';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t246';

let ownerOrg: string;
let consultancy: string;
let rivalOrg: string;
let promoterProject: string; // the consultancy acts for the promoter here
let objectorProject: string; // …and for an objector here
let unrelatedProject: string;
let consultancyAdminCookie: string;
let ownerAdminCookie: string;
let rivalAdminCookie: string;
let aliceId: string; // already on the promoter scheme
let bobId: string; // clean

async function makeUser(name: string, organisationId: string, admin = false) {
  const email = `${name}-${stamp}@test.local`;
  const [user] = await db
    .insert(s.users)
    .values({ name, email, organisationId, orgRole: admin ? 'admin' : 'member' })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  return { id: user!.id, email };
}

async function session(email: string): Promise<string> {
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

const get = (path: string, cookie: string) => app.request(path, { headers: { cookie } });
const send = (path: string, cookie: string, body: unknown, method = 'POST') =>
  app.request(path, {
    method,
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  const org = async (name: string) => {
    const [row] = await db.insert(s.organisations).values({ name: `${name} ${stamp}` }).returning();
    return row!.id;
  };
  ownerOrg = await org('t246 owner');
  consultancy = await org('t246 consultancy');
  rivalOrg = await org('t246 rival');

  const project = async (name: string) => {
    const [row] = await db
      .insert(s.projects)
      .values({ name: `t246 ${name} ${stamp}`, ownerOrganisationId: ownerOrg })
      .returning();
    return row!.id;
  };
  promoterProject = await project('promoter');
  objectorProject = await project('objector');
  unrelatedProject = await project('unrelated');

  for (const projectId of [promoterProject, objectorProject, unrelatedProject]) {
    await db.insert(s.memberships).values({ organisationId: ownerOrg, projectId, role: 'owner' });
    await db.insert(s.memberships).values({ organisationId: consultancy, projectId, role: 'member' });
    await db.insert(s.memberships).values({ organisationId: rivalOrg, projectId, role: 'member' });
  }

  const consultancyAdmin = await makeUser('t246-cadmin', consultancy, true);
  const ownerAdmin = await makeUser('t246-oadmin', ownerOrg, true);
  const rivalAdmin = await makeUser('t246-radmin', rivalOrg, true);
  const alice = await makeUser('t246-alice', consultancy);
  const bob = await makeUser('t246-bob', consultancy);
  aliceId = alice.id;
  bobId = bob.id;

  // the owner admin needs a Participant to pass projectScope
  await db.insert(s.participants).values({ userId: ownerAdmin.id, projectId: promoterProject });
  // Alice already works the promoter scheme — the retrospective case
  await db.insert(s.participants).values({ userId: aliceId, projectId: promoterProject });

  consultancyAdminCookie = await session(consultancyAdmin.email);
  ownerAdminCookie = await session(ownerAdmin.email);
  rivalAdminCookie = await session(rivalAdmin.email);
});

afterAll(async () => {
  await db.delete(s.conflictRefusals);
  await db.delete(s.conflictExclusions).where(eq(s.conflictExclusions.declaringOrganisationId, consultancy));
  await pool.end();
});

let exclusionId: string;

describe('the declaring organisation declares its own wall (§8)', () => {
  it('reports existing conflicting grants and revokes NOTHING (§4)', async () => {
    // Alice is already on the promoter scheme; the new exclusion covers her.
    const res = await send('/organisation/conflict-exclusions', consultancyAdminCookie, {
      projectAId: objectorProject,
      projectBId: promoterProject, // sent in the "wrong" order on purpose
      grain: 'organisation',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as DeclareExclusionResponse;
    exclusionId = body.exclusion.id;

    expect(body.retrospectiveConflicts).toHaveLength(0); // Alice holds only one side so far

    // …and her grant is untouched
    const [alice] = await db
      .select()
      .from(s.participants)
      .where(and(eq(s.participants.userId, aliceId), isNull(s.participants.removedAt)));
    expect(alice).toBeDefined();
  });

  it('stores the pair canonically, so the order it was sent in does not matter (§9)', async () => {
    const [row] = await db
      .select()
      .from(s.conflictExclusions)
      .where(eq(s.conflictExclusions.id, exclusionId));
    expect(row!.projectAId < row!.projectBId).toBe(true);
  });

  it('refuses a duplicate declaration of the same pair in either order', async () => {
    const res = await send('/organisation/conflict-exclusions', consultancyAdminCookie, {
      projectAId: promoterProject,
      projectBId: objectorProject,
      grain: 'organisation',
    });
    expect(res.status).toBe(409);
  });

  it('rejects grain/subject mismatches — the grains are not interchangeable', async () => {
    const withSubject = await send('/organisation/conflict-exclusions', consultancyAdminCookie, {
      projectAId: promoterProject,
      projectBId: unrelatedProject,
      grain: 'organisation',
      subjectUserId: aliceId,
    });
    expect(withSubject.status).toBe(400);
    const withoutSubject = await send('/organisation/conflict-exclusions', consultancyAdminCookie, {
      projectAId: promoterProject,
      projectBId: unrelatedProject,
      grain: 'individual',
    });
    expect(withoutSubject.status).toBe(400);
  });

  it("will not name another organisation's person as a subject", async () => {
    const rival = await makeUser('t246-rivaluser', rivalOrg);
    const res = await send('/organisation/conflict-exclusions', consultancyAdminCookie, {
      projectAId: promoterProject,
      projectBId: unrelatedProject,
      grain: 'individual',
      subjectUserId: rival.id,
    });
    expect(res.status).toBe(404); // principle 4 — "does not exist"
  });

  it('lists the register to its own admin, with the reason', async () => {
    const res = await get('/organisation/conflict-exclusions', consultancyAdminCookie);
    const body = (await res.json()) as ListConflictExclusionsResponse;
    expect(body.items.some((item) => item.id === exclusionId)).toBe(true);
    expect(body.items[0]!.declaredByName).toContain('t246-cadmin');
  });
});

describe('the register is org-private — the private floor holds (§8, ADR-0018)', () => {
  it("another organisation's admin cannot see it, and sees its OWN empty register", async () => {
    const res = await get('/organisation/conflict-exclusions', rivalAdminCookie);
    const body = (await res.json()) as ListConflictExclusionsResponse;
    expect(body.items).toHaveLength(0);
  });

  it("the PROJECT OWNER cannot see it either — the owner is not privileged here", async () => {
    const res = await get('/organisation/conflict-exclusions', ownerAdminCookie);
    const body = (await res.json()) as ListConflictExclusionsResponse;
    expect(body.items).toHaveLength(0);
  });

  it("another organisation cannot withdraw an exclusion it cannot see", async () => {
    const res = await send(`/conflict-exclusions/${exclusionId}/withdrawal`, rivalAdminCookie, {});
    expect(res.status).toBe(404); // not 403 — existence itself is not disclosed
  });
});

describe('the refusal (§9)', () => {
  it('refuses the grant with the fixed wording, and audits it', async () => {
    // Alice holds the promoter scheme; the org-grain exclusion bars the objector
    const res = await send(`/projects/${objectorProject}/participants`, consultancyAdminCookie, {
      userId: aliceId,
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; detail: string };
    expect(body.error).toBe('forbidden');
    expect(body.detail).toBe(CONFLICT_REFUSAL);

    const refusals = await db
      .select()
      .from(s.conflictRefusals)
      .where(eq(s.conflictRefusals.subjectUserId, aliceId));
    expect(refusals).toHaveLength(1);
    expect(refusals[0]!.exclusionId).toBe(exclusionId);
  });

  it('names nothing it protects — no project, organisation, person or id', async () => {
    const res = await send(`/projects/${objectorProject}/participants`, consultancyAdminCookie, {
      userId: aliceId,
    });
    const raw = JSON.stringify(await res.json());
    for (const secret of [promoterProject, objectorProject, consultancy, aliceId, exclusionId]) {
      expect(raw).not.toContain(secret);
    }
    expect(raw.toLowerCase()).not.toContain('promoter');
    expect(raw.toLowerCase()).not.toContain('objector');
  });

  it('does not refuse a person the exclusion does not reach', async () => {
    // Bob holds nothing, so no pair is completed
    const res = await send(`/projects/${objectorProject}/participants`, consultancyAdminCookie, {
      userId: bobId,
    });
    expect(res.status).toBe(201);
  });

  it('withdrawal is audited and stops refusing immediately (§5)', async () => {
    const withdrawn = await send(`/conflict-exclusions/${exclusionId}/withdrawal`, consultancyAdminCookie, {});
    expect(withdrawn.status).toBe(200);
    const [row] = await db
      .select()
      .from(s.conflictExclusions)
      .where(eq(s.conflictExclusions.id, exclusionId));
    expect(row!.withdrawnAt).not.toBeNull();
    expect(row!.withdrawnByUserId).not.toBeNull();

    const res = await send(`/projects/${objectorProject}/participants`, consultancyAdminCookie, {
      userId: aliceId,
    });
    expect(res.status).toBe(201);
  });

  it('the withdrawn row survives, so the past refusal stays attributable (§5)', async () => {
    const refusals = await db
      .select()
      .from(s.conflictRefusals)
      .where(eq(s.conflictRefusals.exclusionId, exclusionId));
    expect(refusals.length).toBeGreaterThan(0);
  });
});

describe('the retrospective report covers grants that already exist (§4)', () => {
  it('lists both-sides holders and revokes none of them', async () => {
    // Alice now holds promoter AND objector (the withdrawal above let her in)
    const res = await send('/organisation/conflict-exclusions', consultancyAdminCookie, {
      projectAId: promoterProject,
      projectBId: objectorProject,
      grain: 'individual',
      subjectUserId: aliceId,
      reason: 'promoter / objector',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as DeclareExclusionResponse;

    expect(body.retrospectiveConflicts.map((r) => r.userId)).toContain(aliceId);

    // reported, not revoked — an automatic revocation could remove a specialist
    // mid-examination, and a control that causes an unattributed outage gets
    // switched off rather than trusted
    const live = await db
      .select()
      .from(s.participants)
      .where(and(eq(s.participants.userId, aliceId), isNull(s.participants.removedAt)));
    expect(live).toHaveLength(2);
  });
});

describe('the attestation gives the owner assurance without the register (§8)', () => {
  it('the owner sets the requirement and sees who has attested', async () => {
    const set = await send(
      `/projects/${promoterProject}/conflict-attestation`,
      ownerAdminCookie,
      { required: true },
      'PATCH',
    );
    expect(set.status).toBe(200);

    await send(`/projects/${promoterProject}/conflict-attestation`, consultancyAdminCookie, {});

    const res = await get(`/projects/${promoterProject}/conflict-attestations`, ownerAdminCookie);
    const body = (await res.json()) as ListConflictAttestationsResponse;
    expect(body.required).toBe(true);
    const consultancyRow = body.items.find((i) => i.organisationId === consultancy);
    expect(consultancyRow?.attested).toBe(true);
    expect(consultancyRow?.attestedByName).toContain('t246-cadmin');
    const rivalRow = body.items.find((i) => i.organisationId === rivalOrg);
    expect(rivalRow?.attested).toBe(false);
  });

  it('the attestation payload leaks NO register data — the load-bearing assertion', async () => {
    const res = await get(`/projects/${promoterProject}/conflict-attestations`, ownerAdminCookie);
    const raw = JSON.stringify(await res.json());
    // no exclusion id, no subject, no reason, no count, no register date
    for (const secret of [exclusionId, aliceId, bobId, objectorProject, 'promoter / objector']) {
      expect(raw).not.toContain(secret);
    }
    // and structurally: the only keys present are the attestation's own
    const parsed = JSON.parse(raw) as ListConflictAttestationsResponse;
    for (const item of parsed.items) {
      expect(Object.keys(item).sort()).toEqual([
        'attested',
        'attestedAt',
        'attestedByName',
        'organisationId',
        'organisationName',
      ]);
    }
  });

  it('a non-owner cannot read the attestation view', async () => {
    const res = await get(`/projects/${promoterProject}/conflict-attestations`, consultancyAdminCookie);
    expect(res.status).toBe(404);
  });

  it('re-attesting supersedes rather than overwrites, so the history survives', async () => {
    await send(`/projects/${promoterProject}/conflict-attestation`, consultancyAdminCookie, {});
    const rows = await db
      .select()
      .from(s.conflictAttestations)
      .where(
        and(
          eq(s.conflictAttestations.projectId, promoterProject),
          eq(s.conflictAttestations.organisationId, consultancy),
        ),
      );
    expect(rows.length).toBe(2);
    expect(rows.filter((r) => r.supersededAt === null)).toHaveLength(1);
  });
});
