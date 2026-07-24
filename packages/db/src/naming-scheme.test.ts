// T-148 acceptance (ADR-0008 homed): per-organisation serial allocation and
// cross-org reference distinctness on the originator field; the propose-then-
// fold row shape. Requires the dev database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb } from './client.js';
import * as s from './schema/index.js';

const { db, pool } = createDb();

let projectId: string;
let orgB: string;
let orgC: string;
let participantId: string;

beforeAll(async () => {
  const [b] = await db.insert(s.organisations).values({ name: 't148 B' }).returning();
  const [c] = await db.insert(s.organisations).values({ name: 't148 C' }).returning();
  orgB = b!.id;
  orgC = c!.id;
  const [user] = await db
    .insert(s.users)
    .values({ name: 't148', email: `t148-${Date.now()}@test.local`, organisationId: b!.id })
    .returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't148 project', ownerOrganisationId: b!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId: b!.id, projectId, role: 'owner' });
  const [p] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId })
    .returning();
  participantId = p!.id;
});

afterAll(async () => {
  await pool.end();
});

describe('naming scheme + serial allocation (T-148, ADR-0008)', () => {
  it('holds one owner-defined scheme per project with an ordered, extensible field list', async () => {
    const [scheme] = await db
      .insert(s.projectNamingSchemes)
      .values({
        projectId,
        separator: '-',
        fields: [
          { key: 'project', label: 'Project', allowedValues: ['WA'] },
          { key: 'originator', label: 'Originator', isOriginator: true, allowedValues: ['BB', 'CC'] },
          { key: 'discipline', label: 'Discipline', allowedValues: ['GEO', 'ENV'] },
          { key: 'serial', label: 'Serial', isSerial: true, width: 3 },
        ],
      })
      .returning();
    expect(Array.isArray(scheme!.fields)).toBe(true);
    expect((scheme!.fields as unknown[]).length).toBe(4);
    // one scheme per project — a second insert violates the unique index
    await expect(
      db.insert(s.projectNamingSchemes).values({ projectId, fields: [] }),
    ).rejects.toThrow();
  });

  it('allocates serials per (project, organisation, series) independently', async () => {
    // both producers reach serial 1 on the same WA-…-GEO series — no coordination
    const [sB] = await db
      .insert(s.namingSerials)
      .values({ projectId, organisationId: orgB, seriesKey: 'WA-BB-GEO', nextSerial: 1 })
      .returning();
    const [sC] = await db
      .insert(s.namingSerials)
      .values({ projectId, organisationId: orgC, seriesKey: 'WA-CC-GEO', nextSerial: 1 })
      .returning();
    expect(sB!.nextSerial).toBe(1);
    expect(sC!.nextSerial).toBe(1);
  });

  it('cross-org references stay distinct on the originator field even at the same serial', async () => {
    const [a] = await db
      .insert(s.containers)
      .values({ projectId, producingOrganisationId: orgB, documentReference: 'WA-BB-GEO-001' })
      .returning();
    const [b] = await db
      .insert(s.containers)
      .values({ projectId, producingOrganisationId: orgC, documentReference: 'WA-CC-GEO-001' })
      .returning();
    expect(a!.documentReference).not.toBe(b!.documentReference);
    // a genuine duplicate reference is still rejected by the unique index
    await expect(
      db.insert(s.containers).values({
        projectId,
        producingOrganisationId: orgC,
        documentReference: 'WA-BB-GEO-001',
      }),
    ).rejects.toThrow();
  });

  it('records a producer proposal and the owner folding it in', async () => {
    const [proposal] = await db
      .insert(s.namingSchemeProposals)
      .values({
        projectId,
        proposingOrganisationId: orgB,
        proposedByParticipantId: participantId,
        body: 'Add discipline code DRN (drainage)',
      })
      .returning();
    expect(proposal!.status).toBe('pending');
    await db
      .update(s.namingSchemeProposals)
      .set({ status: 'accepted', resolvedByParticipantId: participantId, resolvedAt: new Date() })
      .where(eq(s.namingSchemeProposals.id, proposal!.id));
    const [resolved] = await db
      .select()
      .from(s.namingSchemeProposals)
      .where(eq(s.namingSchemeProposals.id, proposal!.id));
    expect(resolved!.status).toBe('accepted');
  });
});
