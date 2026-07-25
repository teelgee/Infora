// T-190 — the deliverable's team is appointable from the plan, so a producer can
// set up promotion: appoint a lead author, propose a lead reviewer; the owner
// confirms in Review; then promotion launches the cycle. Before T-190 there was
// no UI (or client method) to appoint anyone, so promotion could never be set up.
import { test, expect } from '@playwright/test';
import { ApiSession, SEEDED } from './support/api';

test('a producer appoints the team and promotion unblocks once the owner confirms the reviewer', async () => {
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const rachel = await ApiSession.login(SEEDED.owner);
  const me = await eleanor.get<{ participants: Array<{ projectId: string; participantId: string }> }>('/me');
  const projectId = me.participants[0]!.projectId;
  const myPid = me.participants[0]!.participantId;
  const roster = await eleanor.get<{ items: Array<{ participantId: string; name: string }> }>(
    `/projects/${projectId}/participants`,
  );
  const rachelPid = roster.items.find((r) => r.name === 'Rachel Bowen')!.participantId;

  const stamp = String(Date.now()).slice(-6);
  const row = await eleanor.post<{ containerId: string }>(`/projects/${projectId}/plan`, {
    documentReference: `T190-${stamp}`,
    title: 'Promote-flow test',
  });
  const doc = await eleanor.post<{ id: string }>(`/projects/${projectId}/sandbox-documents`, { title: 'T190 draft' });
  await eleanor.patch(`/sandbox-documents/${doc.id}`, { content: 'ready' });
  await eleanor.post(`/sandbox-documents/${doc.id}/binding`, { containerId: row.containerId });

  // appoint self lead author, propose Rachel as lead reviewer (proposed, no access yet)
  await eleanor.post(`/containers/${row.containerId}/authors`, { participantId: myPid, isLead: true });
  const rev = await eleanor.post<{ id: string; confirmedAt: string | null }>(
    `/containers/${row.containerId}/reviewers`,
    { participantId: rachelPid, isLead: true },
  );
  expect(rev.confirmedAt).toBeNull();

  // promotion is blocked until the lead reviewer is confirmed
  const early = await eleanor.raw('post', `/sandbox-documents/${doc.id}/promotion`, {});
  expect(early.status()).toBe(409);

  // the owner confirms → promotion launches the cycle
  await rachel.post(`/reviewers/${rev.id}/confirmation`, {});
  const promoted = await eleanor.raw('post', `/sandbox-documents/${doc.id}/promotion`, {});
  expect(promoted.status()).toBe(201);

  await eleanor.dispose();
  await rachel.dispose();
});
