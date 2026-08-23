// T-190 — the deliverable's team is appointable from the plan, so a producer can
// set up promotion: appoint a lead author, propose a lead reviewer, and promote.
// Before T-190 there was no UI (or client method) to appoint anyone, so
// promotion could never be set up.
//
// T-377 moved the gate this spec used to prove: promotion needs a NAMED lead —
// proposed is enough (ADR-0033 §1: a replaced lead "stalls that round", so the
// submission must exist to stall) — and the confirmed-and-accepted gates sit on
// the acknowledgement (ADR-0051). This run proves the supersession from the
// same fixture: no lead refuses, a bare proposal promotes, and the round then
// waits.
import { test, expect } from '@playwright/test';
import { ApiSession, SEEDED } from './support/api';

test('a producer appoints the team and promotion proceeds on a proposed lead — the round waits on the appointment, not the promotion', async () => {
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
  const doc = await eleanor.post<{ id: string; sandboxId: string }>(`/projects/${projectId}/sandbox-documents`, { title: 'T190 draft' });
  // this spec exercises the appointment gates, not internal QA — the super
  // user turns the T-355 gate off deliberately
  await eleanor.patch(`/sandboxes/${doc.sandboxId}/settings`, { promotionRequiresQa: false });
  await eleanor.patch(`/sandbox-documents/${doc.id}`, { content: 'ready' });
  await eleanor.post(`/sandbox-documents/${doc.id}/binding`, { containerId: row.containerId });

  // appoint self lead author; with NO lead reviewer named, promotion refuses
  await eleanor.post(`/containers/${row.containerId}/authors`, { participantId: myPid, isLead: true });
  const unstaffed = await eleanor.raw('post', `/sandbox-documents/${doc.id}/promotion`, {});
  expect(unstaffed.status()).toBe(409);

  // propose Rachel as lead reviewer — proposed, no access yet…
  const rev = await eleanor.post<{ id: string; confirmedAt: string | null }>(
    `/containers/${row.containerId}/reviewers`,
    { participantId: rachelPid, isLead: true },
  );
  expect(rev.confirmedAt).toBeNull();

  // …and promotion PROCEEDS on the bare proposal (T-377): the submission
  // exists and stalls, which is what lets the deliverable status show why
  const promoted = await eleanor.raw('post', `/sandbox-documents/${doc.id}/promotion`, {});
  expect(promoted.status()).toBe(201);
  const { roundId } = (await promoted.json()) as { roundId: string };

  // what waits is the ROUND: nobody may acknowledge until the owner confirms
  // and Rachel accepts — the super user included (ADR-0051 addendum)
  const earlyAck = await rachel.raw('post', `/rounds/${roundId}/acknowledge`, {});
  expect(earlyAck.status()).toBe(409);
  await rachel.post(`/reviewers/${rev.id}/confirmation`, {});
  await rachel.post(`/reviewers/${rev.id}/acceptance`, {});
  const ack = await rachel.raw('post', `/rounds/${roundId}/acknowledge`, {});
  expect(ack.status()).toBe(200);

  await eleanor.dispose();
  await rachel.dispose();
});
