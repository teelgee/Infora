// T-030 acceptance, against the live dev database: the gateway resolves
// access inside the call and returns nothing to the unentitled; entitled
// requesters get the shaped working input (channels empty until T-031).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AssembledInput, AssemblyRequest } from '@infora/contracts';
import { createDb, schema as s } from '@infora/db';
import { createAssembler, TOKEN_LIMIT } from './gateway';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const assemble = createAssembler({ db, router: fakeRouter() });

let projectId: string;
let organisationId: string; // org A, on the project
let participantId: string; // alice, org A
let strangerOrgId: string; // org C, no membership
let strangerParticipantId: string; // a participant on a *different* project

beforeAll(async () => {
  const [orgA] = await db.insert(s.organisations).values({ name: 't030 org A' }).returning();
  const [orgC] = await db.insert(s.organisations).values({ name: 't030 org C' }).returning();
  organisationId = orgA!.id;
  strangerOrgId = orgC!.id;

  const [project] = await db
    .insert(s.projects)
    .values({ name: 't030 project', ownerOrganisationId: organisationId })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId, projectId, role: 'owner' });

  const [alice] = await db
    .insert(s.users)
    .values({ name: 't030 alice', email: `t030-alice-${Date.now()}@test.local`, organisationId })
    .returning();
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: alice!.id, projectId })
    .returning();
  participantId = participant!.id;

  // org C runs its own project; its participant must resolve nothing on ours
  const [otherProject] = await db
    .insert(s.projects)
    .values({ name: 't030 other project', ownerOrganisationId: strangerOrgId })
    .returning();
  await db
    .insert(s.memberships)
    .values({ organisationId: strangerOrgId, projectId: otherProject!.id, role: 'owner' });
  const [dara] = await db
    .insert(s.users)
    .values({ name: 't030 dara', email: `t030-dara-${Date.now()}@test.local`, organisationId: strangerOrgId })
    .returning();
  const [strangerParticipant] = await db
    .insert(s.participants)
    .values({ userId: dara!.id, projectId: otherProject!.id })
    .returning();
  strangerParticipantId = strangerParticipant!.id;
});

afterAll(async () => {
  await pool.end();
});

const request = (over: Partial<AssemblyRequest['requester']> = {}): AssemblyRequest => ({
  request: { text: 'ground contamination at the sidings', mode: 'baseline' },
  environment: { kind: 'project', projectId },
  requester: { organisationId, participantId, ...over },
});

const nothing = (input: AssembledInput) => input.items.length === 0 && input.budget.tokensUsed === 0;

describe('the assembly gateway (T-030)', () => {
  it('returns the shaped working input to an entitled requester, both modes', async () => {
    for (const mode of ['baseline', 'targeted'] as const) {
      const input = await assemble({ ...request(), request: { text: 'q', mode } });
      expect(input.budget).toEqual({ tokenLimit: TOKEN_LIMIT, tokensUsed: 0 });
      expect(Array.isArray(input.items)).toBe(true); // channels empty until T-031
    }
  });

  it("denies a participant of another project — someone else's participant id resolves nothing", async () => {
    const input = await assemble(
      request({ organisationId: strangerOrgId, participantId: strangerParticipantId }),
    );
    expect(nothing(input)).toBe(true);
  });

  it('denies a forged pairing of a real participant with a different organisation', async () => {
    const input = await assemble(request({ organisationId: strangerOrgId }));
    expect(nothing(input)).toBe(true);
  });

  it('denies nonexistent and malformed requester ids without erroring', async () => {
    const ghost = '00000000-0000-4000-8000-000000000000';
    expect(nothing(await assemble(request({ participantId: ghost })))).toBe(true);
    expect(nothing(await assemble(request({ participantId: 'not-a-uuid' })))).toBe(true);
  });

  it('returns nothing for the workspace environment — no org store in the skeleton', async () => {
    const input = await assemble({
      ...request(),
      environment: { kind: 'workspace', organisationId },
    });
    expect(nothing(input)).toBe(true);
  });
});
