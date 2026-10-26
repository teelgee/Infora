// T-440 and T-441 — the app instance and its rows, end to end on the seeded
// three-organisation world (ADR-0056).
//
// **Three organisations, all legitimately on one project**, which is what makes
// the negatives worth anything: Trentmoor Energy owns the scheme, Calder & Hale
// builds the app, and Redgate Ecology is a second consultancy working the same
// project. Every negative is driven AS THE OTHER PARTY over HTTP — not inferred
// from a predicate, and not asserted about a response the test itself shaped.
//
// **What this file borrows from the seed and puts back.** Marcus Webb is the
// seed's documented "authenticates but holds no Participant" subject. The
// defunct case needs an owner who can be removed without breaking every other
// suite, so this spec enrols him, gives him the app, removes him again — which
// is the real event ADR-0056 §5 describes — and then reassigns the app and puts
// his account back the way it found it.
import { expect, test } from '@playwright/test';
import type {
  AppRecord,
  AppRowResponse,
  AppTableRecord,
  GetAppResponse,
  ListAppRowsResponse,
  ListAppsResponse,
  ListOrgUsersResponse,
  ListRosterResponse,
  MeResponse,
  RosterEntry,
} from '@infora/contracts';
import { ApiSession, SEEDED, addStandInScreen } from './support/api';

const stamp = Date.now();

test('an app instance: built, opened, scoped, shared, orphaned and given away', async () => {
  const rachel = await ApiSession.login(SEEDED.owner); // Org A — Trentmoor Energy
  const eleanor = await ApiSession.login(SEEDED.consultant); // Org B — Calder & Hale
  const nadia = await ApiSession.login(SEEDED.secondConsultant); // Org C — Redgate Ecology

  const me = await eleanor.get<MeResponse>('/me');
  const projectId = me.participants.find(
    (p) => p.projectName === 'Wrenfield–Ashcombe 400kV Connection',
  )!.projectId;

  const roster = (await rachel.get<ListRosterResponse>(`/projects/${projectId}/participants`)).items;
  const live = (name: string): RosterEntry =>
    roster.find((entry) => entry.name === name && entry.removedAt === null)!;
  const trentmoorOrgId = live('Rachel Bowen').organisationId;
  const redgateOrgId = live('Nadia Okonjo').organisationId;

  // ── Only a person their own firm lets build may create one (§12) ──────────
  //
  // Owen Vance is a Calder & Hale participant the seed deliberately does NOT
  // give the right to, so this is a real negative inside a building firm rather
  // than a stranger being refused.
  const owen = await ApiSession.login('owen.vance@calderhale.example');
  const owenList = await owen.get<ListAppsResponse>(`/projects/${projectId}/apps`);
  expect(owenList.mayCreate).toBe(false);
  const owenTry = await owen.raw('post', `/projects/${projectId}/apps`, {
    name: 'not allowed',
    organisationIds: [],
    participantIds: [],
  });
  expect(owenTry.status()).toBe(404);

  const app = await eleanor.post<AppRecord>(`/projects/${projectId}/apps`, {
    name: `Sustainability returns ${stamp}`,
    description: 'Monthly environmental returns from each organisation on the scheme.',
    organisationIds: [trentmoorOrgId, redgateOrgId],
    participantIds: [],
  });
  expect(app.state).toBe('unpublished');

  const table = await eleanor.post<AppTableRecord>(`/apps/${app.id}/tables`, {
    name: 'Monthly returns',
    columns: [
      { key: 'month', label: 'Month', type: 'text', required: true },
      { key: 'landfill', label: 'Waste to landfill (tonnes)', type: 'number', required: true },
    ],
    kind: 'data',
    hasAcceptance: true,
  });
  expect(table.hasAcceptance).toBe(true);

  // ── Until it is opened, it is the builders' and nobody else's (ruling 2) ──
  const ids = async (session: ApiSession) =>
    (await session.get<ListAppsResponse>(`/projects/${projectId}/apps`)).items.map((item) => item.id);
  expect(await ids(eleanor)).toContain(app.id);
  expect(await ids(rachel)).not.toContain(app.id);
  expect(await ids(nadia)).not.toContain(app.id);
  expect((await rachel.raw('get', `/apps/${app.id}`)).status()).toBe(404);

  await addStandInScreen(eleanor, app.id); // T-487 — the gate wants a screen to open
  const opened = await eleanor.post<AppRecord>(`/apps/${app.id}/publish`, {});
  expect(opened.state).toBe('open');
  expect(opened.publishedByName).toBe('Eleanor Price');
  expect(opened.publishedAt).not.toBeNull();
  expect(await ids(rachel)).toContain(app.id);
  expect(await ids(nadia)).toContain(app.id);

  // the client gets the published copy and never the working one
  const asClient = await rachel.get<GetAppResponse>(`/apps/${app.id}`);
  expect(asClient.app.definition).toBeNull();
  expect(asClient.app.published).not.toBeNull();
  expect(asClient.app.mayBuild).toBe(false);

  // ── Sharing a table is the project owner's act and nobody else's (§6) ─────
  expect(
    (await eleanor.raw('post', `/app-tables/${table.id}/shares`, { organisationId: redgateOrgId })).status(),
  ).toBe(404);
  expect(
    (await nadia.raw('post', `/app-tables/${table.id}/shares`, { organisationId: redgateOrgId })).status(),
  ).toBe(404);
  const shared = await rachel.post<AppTableRecord>(`/app-tables/${table.id}/shares`, {
    organisationId: redgateOrgId,
  });
  expect(shared.shares.filter((s) => s.revokedAt === null)).toHaveLength(1);
  const revoked = await rachel.post<AppTableRecord>(
    `/app-tables/${table.id}/shares/${shared.shares[0]!.id}/revocation`,
    {},
  );
  expect(revoked.shares.filter((s) => s.revokedAt === null)).toHaveLength(0);

  // ── Scope: revoking closes the door immediately ──────────────────────────
  const scoped = await eleanor.get<GetAppResponse>(`/apps/${app.id}`);
  const redgateGrant = scoped.app.scope.find((g) => g.organisationId === redgateOrgId)!;
  await eleanor.post(`/apps/${app.id}/scope/${redgateGrant.id}/revocation`, {});
  expect((await nadia.raw('get', `/apps/${app.id}`)).status()).toBe(404);
  await eleanor.post(`/apps/${app.id}/scope`, { organisationId: redgateOrgId });
  expect((await nadia.raw('get', `/apps/${app.id}`)).status()).toBe(200);

  // ── An app whose owner is removed is DEFUNCT and cannot run (§5) ──────────
  //
  // Marcus is enrolled, given the right to build, given the app, and then
  // removed — the real sequence, not a fixture.
  const orgUsers = await eleanor.get<ListOrgUsersResponse>('/organisation/users');
  const marcus = orgUsers.items.find((u) => u.email === SEEDED.noParticipant)!;
  await eleanor.patch(`/organisation/users/${marcus.userId}/app-building`, { mayBuildApps: true });
  const marcusParticipant = await eleanor.post<RosterEntry>(
    `/projects/${projectId}/participants`,
    { userId: marcus.userId },
  );
  const handedOver = await eleanor.post<AppRecord>(`/apps/${app.id}/reassignment`, {
    participantId: marcusParticipant.participantId,
  });
  expect(handedOver.ownerName).toBe('Marcus Webb');

  // it runs while it has an owner, and the run records the PUBLISHED version
  const firstRun = await eleanor.raw('post', `/apps/${app.id}/runs`, { trigger: 'manual' });
  expect(firstRun.status()).toBe(201);
  const runBody = (await firstRun.json()) as { run: { definitionsVersion: number } };
  expect(runBody.run.definitionsVersion).toBe(opened.publishedVersion);

  await eleanor.raw('delete', `/projects/${projectId}/participants/${marcusParticipant.participantId}`);

  const orphaned = await rachel.get<GetAppResponse>(`/apps/${app.id}`);
  expect(orphaned.app.state).toBe('defunct');
  expect(orphaned.app.ownerName).toBeNull();
  const refused = await rachel.raw('post', `/apps/${app.id}/runs`, { trigger: 'manual' });
  expect(refused.status()).toBe(409);
  expect(await refused.text()).toContain('defunct');

  // reassigned, it works again — the ruling's own remedy, with no notification
  // anywhere in it
  const back = await rachel.post<AppRecord>(`/apps/${app.id}/reassignment`, {
    participantId: live('Eleanor Price').participantId,
  });
  expect(back.state).toBe('open');
  expect((await eleanor.raw('post', `/apps/${app.id}/runs`, { trigger: 'manual' })).status()).toBe(201);

  // put Marcus's account back as the seed describes it: no right to build, and
  // his Participant interval closed (which the removal above already did)
  await eleanor.patch(`/organisation/users/${marcus.userId}/app-building`, { mayBuildApps: false });

  await Promise.all([rachel.dispose(), eleanor.dispose(), nadia.dispose(), owen.dispose()]);
});

// T-441 — the rows themselves, and the acceptance flow, across three real
// organisations. This is the half of T-440's "done when" that needed row
// routes to exist, and the whole of T-441's: Calder & Hale's rows are invisible
// to Redgate Ecology, visible to Trentmoor Energy from `submitted` onward, and
// visible to Redgate only while Trentmoor's share of that table is open.
test('rows across three organisations: entered, submitted, accepted, rejected and corrected', async () => {
  const rachel = await ApiSession.login(SEEDED.owner); // Trentmoor Energy — the client
  const eleanor = await ApiSession.login(SEEDED.consultant); // Calder & Hale — submits
  const nadia = await ApiSession.login(SEEDED.secondConsultant); // Redgate Ecology — the peer

  const me = await eleanor.get<MeResponse>('/me');
  const projectId = me.participants.find(
    (p) => p.projectName === 'Wrenfield–Ashcombe 400kV Connection',
  )!.projectId;
  const roster = (await rachel.get<ListRosterResponse>(`/projects/${projectId}/participants`)).items;
  const trentmoorOrgId = roster.find((r) => r.name === 'Rachel Bowen')!.organisationId;
  const redgateOrgId = roster.find((r) => r.name === 'Nadia Okonjo')!.organisationId;

  const app = await eleanor.post<AppRecord>(`/projects/${projectId}/apps`, {
    name: `Returns with rows ${stamp}`,
    organisationIds: [trentmoorOrgId, redgateOrgId],
    participantIds: [],
  });
  const table = await eleanor.post<AppTableRecord>(`/apps/${app.id}/tables`, {
    name: 'Monthly returns',
    columns: [
      { key: 'month', label: 'Month', type: 'text', required: true },
      { key: 'landfill', label: 'Waste to landfill (tonnes)', type: 'number', required: true },
    ],
    kind: 'data',
    hasAcceptance: true,
  });
  await addStandInScreen(eleanor, app.id); // T-487 — the gate wants a screen to open
  await eleanor.post(`/apps/${app.id}/publish`, {});

  const rowIds = async (session: ApiSession) =>
    (await session.get<ListAppRowsResponse>(`/app-tables/${table.id}/rows`)).items.map((r) => r.id);

  // ── A draft is read by its entering organisation ALONE (ruling 3) ─────────
  const draft = (
    await eleanor.post<AppRowResponse>(`/app-tables/${table.id}/rows`, {
      values: { month: 'August 2026', landfill: 12.4 },
      submit: false,
    })
  ).row;
  expect(draft.state).toBe('draft');
  expect(await rowIds(eleanor)).toContain(draft.id);
  // the CLIENT sees nothing — its dashboard says "no return yet", which is honest
  expect(await rowIds(rachel)).not.toContain(draft.id);
  // and so does the other consultancy on the same project
  expect(await rowIds(nadia)).not.toContain(draft.id);

  // ── Submitted, the owner reads it; the peer still does not ───────────────
  const submitted = (await eleanor.post<AppRowResponse>(`/app-rows/${draft.id}/submission`, {})).row;
  expect(submitted.state).toBe('submitted');
  expect(await rowIds(rachel)).toContain(draft.id);
  expect(await rowIds(nadia)).not.toContain(draft.id);

  // ── …and reads it only while the owner's share is open (§6) ──────────────
  const shared = await rachel.post<AppTableRecord>(`/app-tables/${table.id}/shares`, {
    organisationId: redgateOrgId,
  });
  expect(await rowIds(nadia)).toContain(draft.id);
  await rachel.post(`/app-tables/${table.id}/shares/${shared.shares[0]!.id}/revocation`, {});
  expect(await rowIds(nadia)).not.toContain(draft.id);

  // ── The acceptance act is the client's, and only the client's ────────────
  expect(
    (await eleanor.raw('post', `/app-rows/${draft.id}/decision`, { decision: 'accept' })).status(),
  ).toBe(404);
  expect(
    (await nadia.raw('post', `/app-rows/${draft.id}/decision`, { decision: 'accept' })).status(),
  ).toBe(404);

  // a rejection with no reason is refused — by the route, and by the database
  // behind it (asserted at the store in the unit suite)
  expect(
    (await rachel.raw('post', `/app-rows/${draft.id}/decision`, { decision: 'reject' })).status(),
  ).toBe(400);

  const rejected = (
    await rachel.post<AppRowResponse>(`/app-rows/${draft.id}/decision`, {
      decision: 'reject',
      reason: 'Landfill figure looks like a decimal slip against the recycled tonnage.',
    })
  ).row;
  expect(rejected.state).toBe('rejected');

  // the reason reaches the submitting organisation, on the row
  const asSubmitter = (
    await eleanor.get<ListAppRowsResponse>(`/app-tables/${table.id}/rows`)
  ).items.find((r) => r.id === draft.id)!;
  expect(asSubmitter.rejectionReason).toContain('decimal slip');
  expect(asSubmitter.decidedByName).toBe('Rachel Bowen');

  // ── A correction is a new row; the old one still shows ───────────────────
  const correction = (
    await eleanor.post<AppRowResponse>(`/app-rows/${draft.id}/correction`, {
      values: { month: 'August 2026', landfill: 14.6 },
      submit: true,
    })
  ).row;
  expect(correction.supersedesRowId).toBe(draft.id);
  const afterCorrection = (
    await eleanor.get<ListAppRowsResponse>(`/app-tables/${table.id}/rows`)
  ).items.find((r) => r.id === draft.id)!;
  expect(afterCorrection.supersededByRowId).toBe(correction.id);
  expect(afterCorrection.rejectionReason).toContain('decimal slip'); // still there

  // ── Acceptance is when the row becomes the client's record ───────────────
  const accepted = (
    await rachel.post<AppRowResponse>(`/app-rows/${correction.id}/decision`, { decision: 'accept' })
  ).row;
  expect(accepted.state).toBe('accepted');
  expect(accepted.decidedByName).toBe('Rachel Bowen');
  // and the submitting organisation can no longer touch it
  expect(
    (
      await eleanor.raw('patch', `/app-rows/${correction.id}`, {
        values: { month: 'August 2026', landfill: 0.6 },
      })
    ).status(),
  ).toBe(404);
  expect((await eleanor.raw('post', `/app-rows/${correction.id}/retirement`)).status()).toBe(404);

  await Promise.all([rachel.dispose(), eleanor.dispose(), nadia.dispose()]);
});
