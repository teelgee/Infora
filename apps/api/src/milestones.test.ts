// T-481 — milestones on the plan row, and the coverage view (ADR-0008 addendum
// of 2026-10-24). The producer's plan editors set a row's milestones; the owner
// reads them and cannot; met and overdue are worked out when read; the coverage
// view counts the plan read's rows and keeps the producer's internal QA stages
// behind the wall; an overdue milestone reaches the right work queues; and the
// spreadsheet shapes carry the Milestones column round trip.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { GetPlanCoverageResponse, GetWorkQueueResponse, PlanImportError, PlanImportResult, PlanRow } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';
import { buildXlsx, parseXlsx } from './xlsx';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t481';
const CODES = ['S0', 'S1', 'S2', 'S3', 'A1'];
const PAST = '2020-01-31';
const FUTURE = '2099-01-31';

let projectId: string;
let prodOrgId: string;
let thirdOrgId: string;
let ownerCookie: string;
let superCookie: string;
let leadCookie: string;
let memberCookie: string;
let otherOrgCookie: string;
let prodParticipantId: string;
let sandboxId: string;

type Who = { cookie: string; participantId: string };
async function makeUser(name: string, organisationId: string, pid: string, elevated = false): Promise<Who & { email: string }> {
  const [user] = await db.insert(s.users).values({ name, email: `${name}-${stamp}@test.local`, organisationId }).returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db.insert(s.participants).values({ userId: user!.id, projectId: pid, elevated }).returning();
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user!.email, password }),
  });
  return { email: user!.email, cookie: res.headers.get('set-cookie')!.split(';')[0]!, participantId: participant!.id };
}
const asJson = (cookie: string) => ({ cookie, 'content-type': 'application/json' });
const put = (cookie: string, path: string, body: unknown) =>
  app.request(path, { method: 'PUT', headers: asJson(cookie), body: JSON.stringify(body) });
const post = (cookie: string, path: string, body: unknown) =>
  app.request(path, { method: 'POST', headers: asJson(cookie), body: JSON.stringify(body) });
const patch = (cookie: string, path: string, body: unknown) =>
  app.request(path, { method: 'PATCH', headers: asJson(cookie), body: JSON.stringify(body) });
const get = (cookie: string, path: string) => app.request(path, { headers: { cookie } });

async function newRow(title: string, metadata: Record<string, string> = {}): Promise<PlanRow> {
  const res = await post(superCookie, `/projects/${projectId}/plan`, {
    documentReference: `T481-${title}-${stamp}`,
    title,
    metadata,
  });
  expect(res.status).toBe(201);
  return (await res.json()) as PlanRow;
}
const planRow = async (cookie: string, id: string) =>
  ((await (await get(cookie, `/projects/${projectId}/plan`)).json()) as { items: PlanRow[] }).items.find((r) => r.containerId === id);
const coverage = async (cookie: string) =>
  (await (await get(cookie, `/projects/${projectId}/plan/coverage`)).json()) as GetPlanCoverageResponse;
const queue = async (cookie: string) =>
  (await (await get(cookie, `/projects/${projectId}/work-queue`)).json()) as GetWorkQueueResponse;

beforeAll(async () => {
  const [oA] = await db.insert(s.organisations).values({ name: `t481 owner ${stamp}` }).returning();
  const [oB] = await db.insert(s.organisations).values({ name: `t481 producer ${stamp}` }).returning();
  const [oC] = await db.insert(s.organisations).values({ name: `t481 third ${stamp}` }).returning();
  prodOrgId = oB!.id;
  thirdOrgId = oC!.id;
  const [project] = await db.insert(s.projects).values({ name: `t481 ${stamp}`, ownerOrganisationId: oA!.id }).returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: oA!.id, projectId, role: 'owner' },
    { organisationId: oB!.id, projectId, role: 'member' },
    { organisationId: oC!.id, projectId, role: 'member' },
  ]);
  const owner = await makeUser('t481-oona', oA!.id, projectId, true);
  ownerCookie = owner.cookie;
  const sup = await makeUser('t481-sana', oB!.id, projectId, true);
  superCookie = sup.cookie;
  prodParticipantId = sup.participantId;
  const lead = await makeUser('t481-lena', oB!.id, projectId);
  leadCookie = lead.cookie;
  memberCookie = (await makeUser('t481-mona', oB!.id, projectId)).cookie;
  otherOrgCookie = (await makeUser('t481-tara', oC!.id, projectId, true)).cookie;
  // a status-code list in the order a document progresses
  await put(ownerCookie, `/projects/${projectId}/naming-scheme`, {
    separator: '-',
    fields: [
      { key: 'project', label: 'Project', inCode: true },
      { key: 'serial', label: 'Serial', inCode: true, isSerial: true, width: 3 },
      { key: 'suitability', label: 'Status code', type: 'select', inCode: false, allowedValues: CODES },
    ],
  });
  const [sb] = await db
    .insert(s.sandboxes)
    .values({ projectId, name: 't481 sandbox', scope: 'single_org', owningOrganisationId: oB!.id, createdByParticipantId: prodParticipantId })
    .returning();
  sandboxId = sb!.id;
  // keep the lead author handy: they edit one row's metadata, never another's
  leadParticipant = lead.participantId;
});
let leadParticipant: string;

afterAll(async () => {
  await pool.end();
});

describe('setting a row’s milestones', () => {
  it('the producer’s super user sets, moves and removes them; the set is replaced as a whole and an unchanged one keeps its setter', async () => {
    const row = await newRow('set');
    const url = `/containers/${row.containerId}/milestones`;
    const first = await put(superCookie, url, {
      milestones: [
        { statusCode: 'S3', targetDate: FUTURE },
        { statusCode: 'A1', targetDate: '2099-06-30' },
      ],
    });
    expect(first.status).toBe(200);
    const body = (await first.json()) as PlanRow;
    expect(body.milestones.map((m) => `${m.statusCode} ${m.targetDate}`)).toEqual([`S3 ${FUTURE}`, 'A1 2099-06-30']);
    const [a1Before] = await db.select().from(s.planMilestones).where(eq(s.planMilestones.containerId, row.containerId));
    expect(a1Before?.setByParticipantId).toBe(prodParticipantId);

    // move A1, drop S3, add S1 — the lead author sets them, so the setter becomes the lead
    const second = await put(leadCookie, url, { milestones: [{ statusCode: 'A1', targetDate: '2099-07-31' }] });
    expect(second.status).toBe(403); // the lead is not yet this row's lead author
    await post(superCookie, `/containers/${row.containerId}/authors`, { participantId: leadParticipant, isLead: true });
    const moved = await put(leadCookie, url, {
      milestones: [
        { statusCode: 'A1', targetDate: '2099-07-31' },
        { statusCode: 'S1', targetDate: '2098-01-01' },
      ],
    });
    expect(moved.status).toBe(200);
    const stored = await db.select().from(s.planMilestones).where(eq(s.planMilestones.containerId, row.containerId));
    expect(stored.map((m) => `${m.statusCode} ${m.targetDate}`).sort()).toEqual(['A1 2099-07-31', 'S1 2098-01-01']);
    expect(stored.every((m) => m.setByParticipantId === leadParticipant)).toBe(true);

    const cleared = await put(superCookie, url, { milestones: [] });
    expect(((await cleared.json()) as PlanRow).milestones).toEqual([]);
    expect(await db.select().from(s.planMilestones).where(eq(s.planMilestones.containerId, row.containerId))).toEqual([]);
  });

  it('is refused to the owner (absence), to a producer member who cannot edit (403), and to a third organisation (absence)', async () => {
    const row = await newRow('refused');
    const url = `/containers/${row.containerId}/milestones`;
    const body = { milestones: [{ statusCode: 'S1', targetDate: FUTURE }] };
    expect((await put(ownerCookie, url, body)).status).toBe(404);
    expect((await put(otherOrgCookie, url, body)).status).toBe(404);
    const member = await put(memberCookie, url, body);
    expect(member.status).toBe(403);
    expect(((await member.json()) as { detail?: string }).detail).toBe('row_edit_not_permitted');
    expect(await db.select().from(s.planMilestones).where(eq(s.planMilestones.containerId, row.containerId))).toEqual([]);
  });

  it('refuses a code outside the project’s list, a repeated code and a date that is not a day; and a row with no work item', async () => {
    const row = await newRow('invalid');
    const url = `/containers/${row.containerId}/milestones`;
    const unknown = await put(superCookie, url, { milestones: [{ statusCode: 'S9', targetDate: FUTURE }] });
    expect(unknown.status).toBe(400);
    expect(((await unknown.json()) as { detail?: string }).detail).toBe('unknown_status_code: S9');
    const twice = await put(superCookie, url, {
      milestones: [
        { statusCode: 'S1', targetDate: FUTURE },
        { statusCode: 'S1', targetDate: '2099-02-02' },
      ],
    });
    expect(((await twice.json()) as { detail?: string }).detail).toBe('duplicate_status_code: S1');
    expect((await put(superCookie, url, { milestones: [{ statusCode: 'S1', targetDate: '31/01/2099' }] })).status).toBe(400);
    expect((await put(superCookie, url, { milestones: [{ statusCode: 'S1', targetDate: '2099-02-30' }] })).status).toBe(400);
    // reference material has no work item: nothing to plan
    const [reference] = await db
      .insert(s.containers)
      .values({ projectId, producingOrganisationId: prodOrgId, documentReference: `T481-REF-${stamp}`, title: 'A standard', inLibrary: true })
      .returning();
    const noItem = await put(superCookie, `/containers/${reference!.id}/milestones`, { milestones: [{ statusCode: 'S1', targetDate: FUTURE }] });
    expect(noItem.status).toBe(400);
    expect(((await noItem.json()) as { detail?: string }).detail).toBe('milestones_need_a_deliverable');
    expect((await put(superCookie, `/containers/${row.containerId}/milestones`, { nope: true })).status).toBe(400);
  });
});

describe('met and overdue, worked out when read', () => {
  it('a row at the code, or past it in the list, has met the milestone; a code outside the list meets nothing', async () => {
    const row = await newRow('met', { suitability: 'S1' });
    await put(superCookie, `/containers/${row.containerId}/milestones`, {
      milestones: [
        { statusCode: 'S3', targetDate: PAST },
        { statusCode: 'S1', targetDate: PAST },
        { statusCode: 'A1', targetDate: FUTURE },
      ],
    });
    const at = (await planRow(ownerCookie, row.containerId))!.milestones;
    const by = (code: string) => at.find((m) => m.statusCode === code)!;
    expect(by('S3')).toMatchObject({ met: false, overdue: true }); // at S1, due in 2020
    expect(by('S1')).toMatchObject({ met: true, overdue: false }); // at the code
    expect(by('A1')).toMatchObject({ met: false, overdue: false }); // not due yet
    // the row moves past S3: the stored dates did not change, the answer did
    await patch(superCookie, `/containers/${row.containerId}`, { metadata: { suitability: 'A1' } });
    const later = (await planRow(ownerCookie, row.containerId))!.milestones;
    expect(later.every((m) => m.met && !m.overdue)).toBe(true);
    // a status code the project's list does not hold meets nothing
    await patch(superCookie, `/containers/${row.containerId}`, { metadata: { suitability: 'ZZ' } });
    expect((await planRow(ownerCookie, row.containerId))!.milestones.filter((m) => m.met)).toEqual([]);
  });
});

describe('accepted rows, and rows that are no longer planned work', () => {
  it('an accepted row has met every milestone, whatever its status code says: not overdue, not counted, not in the queue', async () => {
    const row = await newRow('accepted', { suitability: 'S1' });
    await put(superCookie, `/containers/${row.containerId}/milestones`, { milestones: [{ statusCode: 'A1', targetDate: PAST }] });
    const label = `T481-accepted-${stamp}`;
    const late = async () => (await queue(ownerCookie)).items.filter((i) => i.kind === 'overdue_milestone' && i.label.includes(label));
    expect((await planRow(ownerCookie, row.containerId))!.milestones[0]).toMatchObject({ met: false, overdue: true });
    expect(await late()).toHaveLength(1);
    // the review cycle accepts it; the status-code field is still S1
    await db.insert(s.versions).values({ containerId: row.containerId, versionReference: 'C01', content: 'accepted' });
    await db.insert(s.reviewCycles).values({ containerId: row.containerId, state: 'accepted' });
    expect((await planRow(ownerCookie, row.containerId))!.milestones[0]).toMatchObject({ met: true, overdue: false });
    expect(await late()).toHaveLength(0);
    expect((await coverage(ownerCookie)).rows.find((r) => r.containerId === row.containerId)).toMatchObject({ stage: 'accepted', overdueMilestones: 0 });
    // the work item saying so is enough too (a row loaded already accepted has no cycle)
    const loaded = await newRow('accepted-by-item');
    await put(superCookie, `/containers/${loaded.containerId}/milestones`, { milestones: [{ statusCode: 'A1', targetDate: PAST }] });
    await db.update(s.workItems).set({ status: 'accepted' }).where(eq(s.workItems.containerId, loaded.containerId));
    expect((await planRow(ownerCookie, loaded.containerId))!.milestones[0]).toMatchObject({ met: true, overdue: false });
  });

  it('a withdrawn row refuses a milestone change with 409 row_not_live', async () => {
    const row = await newRow('notlive');
    await post(superCookie, `/containers/${row.containerId}/withdrawal`, { reason: 'not needed' });
    const res = await put(superCookie, `/containers/${row.containerId}/milestones`, { milestones: [{ statusCode: 'S1', targetDate: FUTURE }] });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { detail?: string }).detail).toBe('row_not_live');
    expect(await db.select().from(s.planMilestones).where(eq(s.planMilestones.containerId, row.containerId))).toEqual([]);
  });
});

describe('the coverage view', () => {
  it('places every row at its furthest stage, and the producer’s internal stages fold into "draft bound" for everyone else', async () => {
    const planned = await newRow('cv-planned');
    const bound = await newRow('cv-bound');
    const frozen = await newRow('cv-frozen');
    const qa = await newRow('cv-qa');
    const promoted = await newRow('cv-promoted');
    const review = await newRow('cv-review');
    const accepted = await newRow('cv-accepted');

    const draftFor = async (containerId: string) => {
      const [d] = await db
        .insert(s.sandboxDocuments)
        .values({ projectId, organisationId: prodOrgId, sandboxId, title: `draft ${containerId}`, createdByParticipantId: prodParticipantId, containerId })
        .returning();
      return d!;
    };
    const freeze = async (documentId: string) => {
      const [series] = await db
        .insert(s.containers)
        .values({ projectId, scope: 'sandbox', producingOrganisationId: prodOrgId, sandboxDocumentId: documentId })
        .returning();
      await db.insert(s.versions).values({ containerId: series!.id, versionReference: 'P01', content: 'frozen' });
      return series!;
    };
    await draftFor(bound.containerId);
    await freeze((await draftFor(frozen.containerId)).id);
    const qaSeries = await freeze((await draftFor(qa.containerId)).id);
    await db.insert(s.reviewCycles).values({ containerId: qaSeries.id, state: 'accepted' });
    await db.insert(s.versions).values({ containerId: promoted.containerId, versionReference: 'P01', content: 'promoted' });
    await db.insert(s.versions).values({ containerId: review.containerId, versionReference: 'P01', content: 'in review' });
    await db.insert(s.reviewCycles).values({ containerId: review.containerId, state: 'active' });
    await db.insert(s.versions).values({ containerId: accepted.containerId, versionReference: 'C01', content: 'accepted' });
    await db.insert(s.reviewCycles).values({ containerId: accepted.containerId, state: 'accepted' });

    const stageOf = (cov: GetPlanCoverageResponse, id: string) => cov.rows.find((r) => r.containerId === id)?.stage;
    const mine = await coverage(superCookie);
    expect(stageOf(mine, planned.containerId)).toBe('planned');
    expect(stageOf(mine, bound.containerId)).toBe('bound');
    expect(stageOf(mine, frozen.containerId)).toBe('frozen');
    expect(stageOf(mine, qa.containerId)).toBe('qa_accepted');
    expect(stageOf(mine, promoted.containerId)).toBe('promoted');
    expect(stageOf(mine, review.containerId)).toBe('in_review');
    expect(stageOf(mine, accepted.containerId)).toBe('accepted');

    // THE WALL: the owner reads the same rows, and the producer's private freeze reads "bound"
    const theirs = await coverage(ownerCookie);
    expect(stageOf(theirs, frozen.containerId)).toBe('bound');
    expect(stageOf(theirs, qa.containerId)).toBe('bound');
    expect(stageOf(theirs, promoted.containerId)).toBe('promoted');
    expect(theirs.counts.frozen).toBe(0);
    expect(theirs.counts.qa_accepted).toBe(0);
    expect(theirs.counts.bound).toBe(mine.counts.bound + mine.counts.frozen + mine.counts.qa_accepted);
    expect(theirs.total).toBe(mine.total);
    // the counts add up to the rows
    expect(Object.values(theirs.counts).reduce((a, b) => a + b, 0)).toBe(theirs.total);

    // the plan read narrows by the same stage, on the server, as the reader sees it
    const narrowed = (await (await get(ownerCookie, `/projects/${projectId}/plan?stage=bound`)).json()) as { items: PlanRow[] };
    expect(narrowed.items.map((r) => r.containerId).sort()).toEqual([bound.containerId, frozen.containerId, qa.containerId].sort());
    // the owner asking for the producer's frozen stage gets nothing: it does not exist for them
    const ownerFrozen = (await (await get(ownerCookie, `/projects/${projectId}/plan?stage=frozen`)).json()) as { items: PlanRow[] };
    expect(ownerFrozen.items).toEqual([]);
    const own = (await (await get(superCookie, `/projects/${projectId}/plan?stage=frozen`)).json()) as { items: PlanRow[] };
    expect(own.items.map((r) => r.containerId)).toEqual([frozen.containerId]);

    // a third organisation with no rows reads an empty view, not the producer's
    const none = await coverage(otherOrgCookie);
    expect(none.total).toBe(0);
  });

  it('counts overdue milestones, flags the rows, and narrows the plan read to them; a withdrawn row is not counted', async () => {
    const late = await newRow('cv-late');
    const fine = await newRow('cv-fine');
    const gone = await newRow('cv-gone');
    await put(superCookie, `/containers/${late.containerId}/milestones`, { milestones: [{ statusCode: 'S3', targetDate: PAST }, { statusCode: 'A1', targetDate: PAST }] });
    await put(superCookie, `/containers/${fine.containerId}/milestones`, { milestones: [{ statusCode: 'S3', targetDate: FUTURE }] });
    await put(superCookie, `/containers/${gone.containerId}/milestones`, { milestones: [{ statusCode: 'S3', targetDate: PAST }] });
    const before = await coverage(ownerCookie);
    expect(before.rows.find((r) => r.containerId === late.containerId)?.overdueMilestones).toBe(2);
    expect(before.rows.find((r) => r.containerId === fine.containerId)?.overdueMilestones).toBe(0);
    await post(superCookie, `/containers/${gone.containerId}/withdrawal`, { reason: 'not needed' });
    const after = await coverage(ownerCookie);
    expect(after.total).toBe(before.total - 1);
    expect(after.overdueMilestones).toBe(before.overdueMilestones - 1);
    const flagged = (await (await get(ownerCookie, `/projects/${projectId}/plan?overdue=true&q=T481-cv-`)).json()) as { items: PlanRow[] };
    expect(flagged.items.map((r) => r.containerId)).toEqual([late.containerId]);
    const flaggedNoSearch = (await (await get(ownerCookie, `/projects/${projectId}/plan?overdue=true`)).json()) as { items: PlanRow[] };
    expect(flaggedNoSearch.items.map((r) => r.containerId)).toContain(late.containerId);
    expect(flaggedNoSearch.items.map((r) => r.containerId)).not.toContain(fine.containerId);
  });
});

describe('the work queue', () => {
  it('an overdue milestone reaches the owner’s people and the producer’s plan editors for their own rows — and no one else', async () => {
    const row = await newRow('wq');
    await put(superCookie, `/containers/${row.containerId}/milestones`, { milestones: [{ statusCode: 'S3', targetDate: PAST }] });
    const mine = (q: GetWorkQueueResponse) => q.items.filter((i) => i.kind === 'overdue_milestone' && i.label.includes(`T481-wq-${stamp}`));
    const owner = mine(await queue(ownerCookie));
    expect(owner).toHaveLength(1);
    expect(owner[0]!.label).toContain('S3');
    expect(owner[0]!.href).toBe(`plan?q=${encodeURIComponent(`T481-wq-${stamp}`)}&row=${row.containerId}`);
    expect(mine(await queue(superCookie))).toHaveLength(1);
    // the producer member who cannot edit the row, and a third organisation, are not told
    expect(mine(await queue(memberCookie))).toHaveLength(0);
    expect(mine(await queue(otherOrgCookie))).toHaveLength(0);
    // the row's live lead author is one of the plan editors for it
    expect(mine(await queue(leadCookie))).toHaveLength(0);
    await post(superCookie, `/containers/${row.containerId}/authors`, { participantId: leadParticipant, isLead: true });
    expect(mine(await queue(leadCookie))).toHaveLength(1);
    // reaching the code ends it: nothing stored said "overdue"
    await patch(superCookie, `/containers/${row.containerId}`, { metadata: { suitability: 'S3' } });
    expect(mine(await queue(ownerCookie))).toHaveLength(0);
    expect(mine(await queue(superCookie))).toHaveLength(0);
  });
});

describe('the spreadsheet shapes', () => {
  it('the template, the plan export and the import carry one Milestones column and the round trip keeps the dates', async () => {
    const template = await get(superCookie, `/projects/${projectId}/naming-scheme/template`);
    const templateGrid = parseXlsx(Buffer.from(await template.arrayBuffer()))!;
    expect(templateGrid[0]![templateGrid[0]!.length - 1]).toBe('Milestones');

    const row = await newRow('rt', { suitability: 'S1' });
    await put(superCookie, `/containers/${row.containerId}/milestones`, {
      milestones: [
        { statusCode: 'S3', targetDate: '2026-11-30' },
        { statusCode: 'A1', targetDate: '2027-01-15' },
      ],
    });
    // the whole plan: every live deliverable this person's plan read shows
    const whole = await post(superCookie, `/projects/${projectId}/plan/export`, { all: true });
    expect(whole.status).toBe(200);
    const bytes = Buffer.from(await whole.arrayBuffer());
    const grid = parseXlsx(bytes)!;
    const header = grid[0]!;
    const col = header.indexOf('Milestones');
    expect(col).toBe(header.length - 1);
    const exported = grid.find((r) => r[header.indexOf('Title')] === 'rt')!;
    expect(exported[col]).toBe('S3 2026-11-30; A1 2027-01-15');
    // a selection export carries it too, and a person outside the plan's reach exports nothing of it
    const picked = await post(superCookie, `/projects/${projectId}/plan/export`, { containerIds: [row.containerId] });
    expect(parseXlsx(Buffer.from(await picked.arrayBuffer()))![1]![col]).toBe('S3 2026-11-30; A1 2027-01-15');
    const theirs = await post(otherOrgCookie, `/projects/${projectId}/plan/export`, { all: true });
    expect(parseXlsx(Buffer.from(await theirs.arrayBuffer()))!.length).toBe(1);
    expect((await post(superCookie, `/projects/${projectId}/plan/export`, { all: true, containerIds: [row.containerId] })).status).toBe(400);

    // into a fresh project: the same rows, with the same milestones
    const [o2] = await db.insert(s.organisations).values({ name: `t481 owner2 ${stamp}` }).returning();
    const [p2] = await db.insert(s.projects).values({ name: `t481 fresh ${stamp}`, ownerOrganisationId: o2!.id }).returning();
    await db.insert(s.memberships).values([
      { organisationId: o2!.id, projectId: p2!.id, role: 'owner' },
      { organisationId: prodOrgId, projectId: p2!.id, role: 'member' },
    ]);
    const owner2 = await makeUser('t481-owner2', o2!.id, p2!.id, true);
    const sup2 = await makeUser('t481-sup2', prodOrgId, p2!.id, true);
    const scheme = {
      separator: '-',
      fields: [
        { key: 'project', label: 'Project', inCode: true, allowedValues: ['T481'] },
        { key: 'name', label: 'Name', inCode: true },
        { key: 'serial', label: 'Serial', inCode: true, isSerial: true, width: 3 },
        { key: 'suitability', label: 'Status code', type: 'select', inCode: false, allowedValues: CODES },
      ],
    };
    await put(owner2.cookie, `/projects/${p2!.id}/naming-scheme`, scheme);
    const importInto = (rows: (string | null)[][]) => {
      const form = new FormData();
      form.append('file', new File([new Uint8Array(buildXlsx([{ name: 'Deliverables', rows }]))], 'plan.xlsx'));
      return app.request(`/projects/${p2!.id}/plan/import`, { method: 'POST', headers: { cookie: sup2.cookie }, body: form });
    };
    const ok = await importInto([
      ['Title', 'Project', 'Name', 'Status code', 'Milestones'],
      ['Imported with dates', 'T481', 'ALPHA', 'S1', 'S3 2026-11-30; A1 2027-01-15'],
      ['Imported without', 'T481', 'ALPHA', '', ''],
    ]);
    expect(ok.status).toBe(201);
    const made = (await ok.json()) as PlanImportResult;
    expect(made.created).toBe(2);
    expect(made.ignoredColumns).toEqual([]);
    const withDates = made.items.find((r) => r.workItem?.title === 'Imported with dates')!;
    expect(withDates.milestones.map((m) => `${m.statusCode} ${m.targetDate}`)).toEqual(['S3 2026-11-30', 'A1 2027-01-15']);
    expect(made.items.find((r) => r.workItem?.title === 'Imported without')!.milestones).toEqual([]);
    const [stored] = await db.select().from(s.planMilestones).where(eq(s.planMilestones.containerId, withDates.containerId)).limit(1);
    expect(stored?.setByParticipantId).toBe(sup2.participantId);

    // a malformed cell, an unknown code or a repeat refuses the WHOLE file, naming the row
    const before = await db.select().from(s.containers).where(eq(s.containers.projectId, p2!.id));
    for (const [cell, words] of [
      ['S3 30/11/2026', 'YYYY-MM-DD'],
      ['S9 2026-11-30', 'status codes'],
      ['S3', 'status code and a date'],
      ['S3 2026-11-30; S3 2026-12-31', 'twice'],
    ] as const) {
      const bad = await importInto([
        ['Title', 'Project', 'Name', 'Milestones'],
        ['Fine', 'T481', 'BETA', ''],
        ['Bad dates', 'T481', 'BETA', cell],
      ]);
      expect(bad.status).toBe(400);
      const failure = ((await bad.json()) as PlanImportError).failures![0]!;
      expect(failure.row).toBe(3);
      expect(failure.problem).toContain('Milestones:');
      expect(failure.problem).toContain(words);
    }
    expect((await db.select().from(s.containers).where(eq(s.containers.projectId, p2!.id))).length).toBe(before.length);
    // two Milestones columns are ambiguous, as two columns for any field are
    const dup = await importInto([
      ['Title', 'Project', 'Name', 'Milestones', 'Milestones'],
      ['X', 'T481', 'GAMMA', '', ''],
    ]);
    expect(dup.status).toBe(400);
  });
});

describe('a third organisation a row is shared with', () => {
  it('reads the document, not the producer’s schedule for it: the export leaves the Milestones cell empty and the plan read never carries the row', async () => {
    const row = await newRow('shared');
    await put(superCookie, `/containers/${row.containerId}/milestones`, { milestones: [{ statusCode: 'S3', targetDate: '2099-03-31' }] });
    const [version] = await db.insert(s.versions).values({ containerId: row.containerId, versionReference: 'P01', content: 'shared' }).returning();
    await db.insert(s.deliverableShares).values({ containerId: row.containerId, organisationId: thirdOrgId, grantedByParticipantId: prodParticipantId });
    const [third] = await db.select({ id: s.participants.id }).from(s.participants).innerJoin(s.users, eq(s.users.id, s.participants.userId)).where(eq(s.users.organisationId, thirdOrgId));
    await db.insert(s.deliverableAcknowledgements).values({ containerId: row.containerId, versionId: version!.id, organisationId: thirdOrgId, acknowledgedByParticipantId: third!.id });
    const cellOf = async (cookie: string, body: unknown) => {
      const res = await post(cookie, `/projects/${projectId}/plan/export`, body);
      const grid = parseXlsx(Buffer.from(await res.arrayBuffer()))!;
      const header = grid[0]!;
      const line = grid.find((r) => r[header.indexOf('Title')] === 'shared');
      return line === undefined ? undefined : (line[header.indexOf('Milestones')] ?? '');
    };
    const pick = { containerIds: [row.containerId] };
    expect(await cellOf(superCookie, pick)).toBe('S3 2099-03-31');
    expect(await cellOf(ownerCookie, pick)).toBe('S3 2099-03-31');
    // the third organisation is admitted to the row and so exports it, without the dates
    expect(await cellOf(otherOrgCookie, pick)).toBe('');
    // its plan read and coverage never carry the producer's row, so no milestones
    const theirPlan = (await (await get(otherOrgCookie, `/projects/${projectId}/plan`)).json()) as { items: PlanRow[] };
    expect(theirPlan.items.some((r) => r.containerId === row.containerId)).toBe(false);
    expect((await coverage(otherOrgCookie)).total).toBe(0);
    expect((await put(otherOrgCookie, `/containers/${row.containerId}/milestones`, { milestones: [] })).status).toBe(404);
  });
});
