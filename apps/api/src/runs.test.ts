// T-046 acceptance, against the live dev database with the fake Router: the
// full chain callable over HTTP, and run reads scoped per the 2026-07-06
// ruling — work-item-bound runs are project record (owner-readable in full);
// ad-hoc runs belong to the producing organisation only.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GetHistoryResponse, GetRunPlanResponse, Run } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { createWorkerRegistry } from '@infora/capabilities';
import { loadWorkflows } from '@infora/workflows';
import { buildApp } from './app';
import { ensureDefaultSandbox } from './sandbox';
import { FAKE_EMBED_MODEL, fakeRouter, fakeVector } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t046';
let owner: string; // owner-org session
let consultant: string; // member-org session
let memberOrgId: string;
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
  memberOrgId = orgMember!.id;
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
      sandboxId: await ensureDefaultSandbox(db, projectId, orgMember!.id, eleanor.participantId!),
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
      sandboxId: await ensureDefaultSandbox(db, projectId, orgOwner!.id, rachel.participantId!),
      title: 't046 owner note',
      createdByParticipantId: rachel.participantId!,
    })
    .returning();
  foreignSandboxDocumentId = foreign!.id;

  // one live library document, indexed under the fake embedding model
  documentReference = `T46-GEO-GIR-${stamp}`;
  const [container] = await db
    .insert(s.containers)
    .values({ projectId, producingOrganisationId: orgOwner!.id, documentReference, inLibrary: true })
    .returning();
  // visibility is producer | owner | acknowledged share (T-119, ADR-0035): the
  // consultant's organisation grounds on this document through the owner's
  // share, once it has acknowledged the transmittal for the current version
  await db.insert(s.deliverableShares).values({
    containerId: container!.id,
    organisationId: orgMember!.id,
    grantedByParticipantId: rachel.participantId!,
  });
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
  // ADR-0035 §4: without the receiving organisation's acknowledgement the
  // shared deliverable neither grounds nor is visible — the consultant accepts
  // receipt on the org's behalf for the current version
  await db.insert(s.deliverableAcknowledgements).values({
    containerId: container!.id,
    versionId,
    organisationId: orgMember!.id,
    acknowledgedByParticipantId: eleanor.participantId!,
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
    expect(run.response).toBe('The investigation recorded contamination exceedances.'); // part of the record (2026-07-08)
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
    // T-253 — passage grain: the chunk beside the version (finding F5)
    expect(draft.sourceSet).toEqual([
      { versionId, chunkId: expect.any(String) as unknown as string },
    ]);
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

  // T-089 — the labelled-channels ruling (2026-07-09): chat keeps the
  // model-knowledge claim, labelled open-world; the grounded claim keeps its
  // citation, surfaced on the Run read (T-088)
  it('an untargeted chat run labels model knowledge instead of withholding it', async () => {
    const conversationId = await openConversation(consultant);
    const res = await post(consultant, `/conversations/${conversationId}/runs`, {
      request: 'What did the investigation find?',
    });
    const run = (await res.json()) as Run;

    expect(run.response).toBe(
      'The investigation recorded contamination exceedances.\n\nAn unsupported figure of 40%.',
    );
    const groundCheck = run.steps.find((st) => st.type === 'ground_check')!;
    expect(groundCheck.railOutcomes).toEqual([
      { rail: 'grounding', outcome: 'open_world', detail: 'An unsupported figure of 40%.' },
    ]);
    expect(run.suggestions).toEqual([]);
    expect(run.citations).toHaveLength(1); // the grounded claim only
    expect(run.citations[0]!.source).toEqual({ versionId, documentReference });
  });
});

// T-108 — History: the log of the requester's own prompted turns on the
// project, newest first; a fresh user keeps the assertions exact against the
// shared database
describe('project history (T-108)', () => {
  it("lists only the requester's own turns, newest first, naming the document a turn targeted", async () => {
    await makeUser('t046-historian', memberOrgId, projectId);
    const historian = await session(`t046-historian-${stamp}@test.local`);

    const chat = await openConversation(historian);
    await post(historian, `/conversations/${chat}/runs`, { request: 'history chat turn' });
    const drafting = await openConversation(historian);
    await post(historian, `/conversations/${drafting}/runs`, {
      request: 'history document turn',
      sandboxDocumentId,
    });

    const res = await get(historian, `/projects/${projectId}/history`);
    expect(res.status).toBe(200);
    const { items } = (await res.json()) as GetHistoryResponse;

    // exactly their two turns — no sub-agent runs, one entry per run
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      request: 'history document turn',
      state: 'completed',
      sandboxDocument: { id: sandboxDocumentId, title: 't046 draft' },
    });
    expect(items[1]).toMatchObject({ request: 'history chat turn', sandboxDocument: null });
    expect(items[1]!.conversationId).toBe(chat); // Ask reopens the conversation from here

    // self-scoped: a colleague in the same organisation sees none of it
    const colleague = await get(consultant, `/projects/${projectId}/history`);
    const colleagueItems = ((await colleague.json()) as GetHistoryResponse).items;
    expect(colleagueItems.some((entry) => entry.request.startsWith('history '))).toBe(false);
  });
});

describe('run read scope — the 2026-07-12 ruling (supersedes 2026-07-06)', () => {
  it('every run is producing-organisation-private — work-item bound or not', async () => {
    const bound = await openConversation(consultant, workItemId);
    const boundRun = (await (
      await post(consultant, `/conversations/${bound}/runs`, { request: 'governed draft' })
    ).json()) as Run;
    const adHoc = await openConversation(consultant);
    const adHocRun = (await (
      await post(consultant, `/conversations/${adHoc}/runs`, { request: 'private ask' })
    ).json()) as Run;

    // the producer reads its own record in full — retained background data
    for (const run of [boundRun, adHocRun]) {
      const res = await get(consultant, `/runs/${run.id}`);
      expect(res.status).toBe(200);
      expect(((await res.json()) as Run).steps.length).toBeGreaterThan(0);
    }

    // the client owner never sees the agent's internals — the consultant
    // carries the liability; the client reviews the document, not the runs
    expect((await get(owner, `/runs/${boundRun.id}`)).status).toBe(404);
    expect((await get(owner, `/runs/${adHocRun.id}`)).status).toBe(404);

    // work-item and conversation reads filter identically
    const workItem = await get(owner, `/work-items/${workItemId}`);
    expect(workItem.status).toBe(200); // the review-cycle facts stay readable
    expect(((await workItem.json()) as { runs: Run[] }).runs).toEqual([]);
    const conversation = await get(owner, `/conversations/${bound}`);
    expect(((await conversation.json()) as { runs: Run[] }).runs).toEqual([]);
  });
});

// T-261 — the plan read API and its permissions. The plan inherits the run's
// read scope EXACTLY, so the interesting cases are the two edges: another
// organisation gets nonexistence, and a colleague inside the producing
// organisation gets the plan but not the right to re-run it.
describe('the plan read API (T-261)', () => {
  let colleague: string; // same organisation as the consultant, a different person

  beforeAll(async () => {
    await makeUser('t261-colleague', memberOrgId, projectId);
    colleague = await session(`t261-colleague-${stamp}@test.local`);
  });

  it('the requester reads the plan its run performed, with canRerun true', async () => {
    const conversation = await openConversation(consultant);
    const run = (await (
      await post(consultant, `/conversations/${conversation}/runs`, { request: 'plan read' })
    ).json()) as Run;

    const res = await get(consultant, `/runs/${run.id}/plan`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as GetRunPlanResponse;
    expect(body.plan.runId).toBe(run.id);
    expect(body.plan.mode).toBe('declared');
    expect(body.plan.state).toBe('complete');
    expect(body.canRerun).toBe(true);

    // the 1:1 the plan artefact promises: every plan step is bound to the
    // top-level Step row it became (T-260's acceptance, now readable)
    const topLevel = run.steps.filter((step) => step.parentStepId === null);
    expect(body.plan.steps.map((step) => step.stepRowId).sort()).toEqual(
      topLevel.map((step) => step.id).sort(),
    );
  });

  it('a colleague in the same organisation may READ the plan and may not re-run it', async () => {
    const conversation = await openConversation(consultant);
    const run = (await (
      await post(consultant, `/conversations/${conversation}/runs`, { request: 'colleague read' })
    ).json()) as Run;

    const res = await get(colleague, `/runs/${run.id}/plan`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as GetRunPlanResponse;
    expect(body.plan.runId).toBe(run.id);
    // re-running is a NEW Run with a NEW requester; offering it here would put
    // a run in the record attributed to whoever's question it was not
    expect(body.canRerun).toBe(false);
  });

  it('another organisation gets the same 404 as nonexistence — the plan is not a softer read', async () => {
    const conversation = await openConversation(consultant);
    const run = (await (
      await post(consultant, `/conversations/${conversation}/runs`, { request: 'owner may not read' })
    ).json()) as Run;

    // identical to the run read the owner is already refused (T-104): the plan
    // IS the run's internals, and the owner reviews the document instead
    expect((await get(owner, `/runs/${run.id}`)).status).toBe(404);
    expect((await get(owner, `/runs/${run.id}/plan`)).status).toBe(404);
    // and an id that does not exist reads identically
    expect((await get(owner, `/runs/${crypto.randomUUID()}/plan`)).status).toBe(404);
  });

  it("a sub-agent's child run has no plan of its own — 404, not an empty one", async () => {
    const conversation = await openConversation(consultant);
    const run = (await (
      await post(consultant, `/conversations/${conversation}/runs`, {
        request: `child run ${documentReference}`,
      })
    ).json()) as Run;

    const delegate = run.steps.find((step) => step.type === 'delegate');
    expect(delegate?.childRunId).toBeDefined();
    // a delegation is not a request: the child executes inside a step of its
    // parent's plan, so "no plan" is the honest answer rather than a null body
    expect((await get(consultant, `/runs/${delegate!.childRunId}/plan`)).status).toBe(404);
  });
});

// T-265 — the declared workflow over HTTP. The acceptance is that it changes
// no behaviour, so the test is a comparison rather than an assertion about the
// declared path alone: the same question, answered by an app composed with the
// workflow registry and by one composed without it, must produce the same
// answer and the same step rows — and differ only in what the PLAN records.
describe('the first declared workflow (T-265)', () => {
  const declaredApp = buildApp({
    db,
    sessionSecret: 'test-secret',
    router: fakeRouter(),
    workflows: loadWorkflows({ workers: createWorkerRegistry(), production: true }),
    askWorkflowId: 'project-question',
  });

  const ask = async (application: typeof app, cookie: string) => {
    const opened = await application.request(`/projects/${projectId}/conversations`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ surface: 'web' }),
    });
    const { conversationId } = (await opened.json()) as { conversationId: string };
    const res = await application.request(`/conversations/${conversationId}/runs`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ request: `what did ${documentReference} record?` }),
    });
    expect(res.status).toBe(201);
    return (await res.json()) as Run;
  };

  it('CHANGES NO BEHAVIOUR: same answer, same step rows, declared or not', async () => {
    const declaredCookie = await session(`t046-consultant-${stamp}@test.local`);
    const [viaWorkflow, viaChain] = [
      await ask(declaredApp, declaredCookie),
      await ask(app, consultant),
    ];

    expect(viaWorkflow.response).toBe(viaChain.response);
    expect(viaWorkflow.steps.map((step) => step.type)).toEqual(
      viaChain.steps.map((step) => step.type),
    );
    expect(viaWorkflow.state).toBe(viaChain.state);
  });

  it('records the workflow and its version on the plan, where the chain records neither', async () => {
    const cookie = await session(`t046-consultant-${stamp}@test.local`);
    const viaWorkflow = await ask(declaredApp, cookie);
    const viaChain = await ask(app, consultant);

    const planOf = async (application: typeof app, who: string, runId: string) =>
      ((await (await application.request(`/runs/${runId}/plan`, { headers: { cookie: who } })).json()) as GetRunPlanResponse)
        .plan;

    const declaredPlan = await planOf(declaredApp, cookie, viaWorkflow.id);
    const chainPlan = await planOf(app, consultant, viaChain.id);

    expect(declaredPlan.workflowId).toBe('project-question');
    expect(declaredPlan.workflowVersion).toBe(1);
    // the fallback stays legal and stays honest: a declared plan naming no
    // workflow is what the coded chain has always been
    expect(chainPlan.workflowId).toBeNull();
    expect(declaredPlan.mode).toBe('declared');
    expect(chainPlan.mode).toBe('declared');

    // and the retrieve step names the worker that realises it — the fact the
    // eval harness's `expect_calls` spent three tickets waiting for
    expect(declaredPlan.steps.map((step) => step.worker)).toEqual([
      'corpus_retrieval',
      null,
      null,
      null,
    ]);
    expect(chainPlan.steps.map((step) => step.stage)).toEqual(
      declaredPlan.steps.map((step) => step.stage),
    );
  });
});
