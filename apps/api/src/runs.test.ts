// T-046 acceptance, against the live dev database with the fake Router: the
// full chain callable over HTTP, and run reads scoped per the 2026-07-06
// ruling — work-item-bound runs are project record (owner-readable in full);
// ad-hoc runs belong to the producing organisation only.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Run } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { FAKE_EMBED_MODEL, fakeRouter, fakeVector } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t046';
let owner: string; // owner-org session
let consultant: string; // member-org session
let projectId: string;
let workItemId: string;
let sandboxDocumentId: string; // the consultant org's
let foreignSandboxDocumentId: string; // the owner org's
let versionId: string;
let documentReference: string;

async function makeUser(name: string, organisationId: string, participantOf?: string) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  let participantId: string | undefined;
  if (participantOf) {
    const [participant] = await db
      .insert(s.participants)
      .values({ userId: user!.id, projectId: participantOf })
      .returning();
    participantId = participant!.id;
  }
  return { user: user!, participantId };
}

async function session(email: string): Promise<string> {
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

const post = (cookie: string, path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const get = (cookie: string, path: string) => app.request(path, { headers: { cookie } });

beforeAll(async () => {
  const [orgOwner] = await db.insert(s.organisations).values({ name: 't046 owner org' }).returning();
  const [orgMember] = await db.insert(s.organisations).values({ name: 't046 member org' }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't046 project', ownerOrganisationId: orgOwner!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: orgOwner!.id, projectId, role: 'owner' },
    { organisationId: orgMember!.id, projectId, role: 'member' },
  ]);

  const rachel = await makeUser('t046-owner', orgOwner!.id, projectId);
  const eleanor = await makeUser('t046-consultant', orgMember!.id, projectId);

  const [workItem] = await db
    .insert(s.workItems)
    .values({
      projectId,
      type: 'document_production',
      title: 't046 statement',
      status: 'in_production',
      assigneeParticipantId: eleanor.participantId,
    })
    .returning();
  workItemId = workItem!.id;

  const [doc] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId,
      organisationId: orgMember!.id,
      title: 't046 draft',
      createdByParticipantId: eleanor.participantId!,
    })
    .returning();
  sandboxDocumentId = doc!.id;
  const [foreign] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId,
      organisationId: orgOwner!.id,
      title: 't046 owner note',
      createdByParticipantId: rachel.participantId!,
    })
    .returning();
  foreignSandboxDocumentId = foreign!.id;

  // one live library document, indexed under the fake embedding model
  documentReference = `T46-GEO-GIR-${stamp}`;
  const [container] = await db
    .insert(s.containers)
    .values({ projectId, documentReference, inLibrary: true })
    .returning();
  const content = 'The ground investigation recorded contamination exceedances at three pits.';
  const [version] = await db
    .insert(s.versions)
    .values({ containerId: container!.id, versionReference: 'v2', content })
    .returning();
  versionId = version!.id;
  await db.insert(s.versionChunks).values({
    versionId,
    chunkIndex: 0,
    content,
    embedding: fakeVector(content),
    embeddingModelId: FAKE_EMBED_MODEL,
    embeddingModelVersion: 'fake-1',
  });

  [owner, consultant] = await Promise.all([
    session(`t046-owner-${stamp}@test.local`),
    session(`t046-consultant-${stamp}@test.local`),
  ]);
});

afterAll(async () => {
  await pool.end();
});

async function openConversation(cookie: string, workItem?: string): Promise<string> {
  const res = await post(cookie, `/projects/${projectId}/conversations`, {
    surface: 'web',
    ...(workItem !== undefined && { workItemId: workItem }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { conversationId: string }).conversationId;
}

describe('the full chain over HTTP (T-046)', () => {
  it('runs the chain and returns the contracts Run — steps, audit, suggestion, citations', async () => {
    const conversationId = await openConversation(consultant, workItemId);
    const res = await post(consultant, `/conversations/${conversationId}/runs`, {
      request: 'Draft the contamination summary',
      sandboxDocumentId,
    });
    expect(res.status).toBe(201);
    const run = (await res.json()) as Run;

    expect(run.state).toBe('completed');
    expect(run.request).toBe('Draft the contamination summary');
    expect(run.steps.map((st) => st.type)).toEqual([
      'retrieve',
      'delegate',
      'draft',
      'ground_check',
      'cite',
    ]);
    const draft = run.steps.find((st) => st.type === 'draft')!;
    expect(draft.model).toEqual({ id: 'fake-chat', version: 'fake-chat-1' });
    expect(draft.usage?.tokensPrompt).toBe(500);
    expect(draft.sourceSet).toEqual([{ versionId }]);
    const groundCheck = run.steps.find((st) => st.type === 'ground_check')!;
    expect(groundCheck.railOutcomes).toEqual([
      { rail: 'grounding', outcome: 'withheld', detail: 'An unsupported figure of 40%.' },
    ]);

    // the sub-agent is a real child Run, readable through its childRunId
    const delegate = run.steps.find((st) => st.type === 'delegate')!;
    const child = await get(consultant, `/runs/${delegate.childRunId}`);
    expect(child.status).toBe(200);
    expect(((await child.json()) as Run).parentRunId).toBe(run.id);

    expect(run.suggestions).toHaveLength(1);
    const suggestion = run.suggestions[0]!;
    expect(suggestion).toMatchObject({
      workItemId,
      sandboxDocumentId,
      kind: 'insert',
      content: 'The investigation recorded contamination exceedances.',
    });
    expect(suggestion.citations).toHaveLength(1);
    expect(suggestion.citations[0]!.source).toEqual({ versionId, documentReference });
  });

  it("refuses to target another organisation's sandbox document — as not_found", async () => {
    const conversationId = await openConversation(consultant);
    const res = await post(consultant, `/conversations/${conversationId}/runs`, {
      request: 'q',
      sandboxDocumentId: foreignSandboxDocumentId,
    });
    expect(res.status).toBe(404);
  });

  it('a conversation read lists top-level runs only', async () => {
    const conversationId = await openConversation(consultant, workItemId);
    await post(consultant, `/conversations/${conversationId}/runs`, { request: 'q' });
    const res = await get(consultant, `/conversations/${conversationId}`);
    const { runs } = (await res.json()) as { runs: Run[] };
    expect(runs).toHaveLength(1);
    expect(runs[0]!.parentRunId).toBeNull();
  });
});

describe('run read scope — the 2026-07-06 ruling (T-046)', () => {
  it('a work-item-bound run is project record: the owner reads it in full', async () => {
    const conversationId = await openConversation(consultant, workItemId);
    const created = (await (
      await post(consultant, `/conversations/${conversationId}/runs`, { request: 'governed draft' })
    ).json()) as Run;

    const res = await get(owner, `/runs/${created.id}`);
    expect(res.status).toBe(200);
    const run = (await res.json()) as Run;
    expect(run.request).toBe('governed draft'); // prompt text included — the full record
    expect(run.steps.length).toBeGreaterThan(0);

    // and it appears on the work item's record for the owner
    const workItem = await get(owner, `/work-items/${workItemId}`);
    const body = (await workItem.json()) as { runs: Run[] };
    expect(body.runs.some((r) => r.id === run.id)).toBe(true);
  });

  it("an ad-hoc run is the producing organisation's only — the owner gets 404", async () => {
    const conversationId = await openConversation(consultant); // no work item
    const created = (await (
      await post(consultant, `/conversations/${conversationId}/runs`, { request: 'private ask' })
    ).json()) as Run;

    expect((await get(consultant, `/runs/${created.id}`)).status).toBe(200);
    expect((await get(owner, `/runs/${created.id}`)).status).toBe(404);

    // the conversation read filters the same way
    const asOwner = await get(owner, `/conversations/${conversationId}`);
    expect(((await asOwner.json()) as { runs: Run[] }).runs).toEqual([]);
  });
});
