// T-370 acceptance — the two substrates ADR-0027's S10 amendment requires
// before any build may let an embedded agent act directly: **first-class actor
// identity for an agent run**, and the **receipt with undo**.
//
// **Nothing performs an administrative act yet**, which is the amendment's own
// sequencing rather than a gap — so these tests record acts directly and
// register a test-local undo handler. That is how a registry substrate is
// properly exercised: the deployment's registry is empty, and an act kind with
// no handler must be refused rather than quietly succeeding, which is itself one
// of the cases below.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { AgentReceipt, UndoAgentActResponse } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';
import { recordAgentAct } from './agent-acts';
import type { AgentActUndoRegistry } from './agent-acts';

const { db, pool } = createDb();

/** One handler, registered only here. `folder_created` is illustrative: no
 * ticket has claimed an act kind yet, and inventing a real one in this file
 * would be exactly the false claim T-301's rule forbids. */
let removed: string[] = [];
let refuseNext = false;
const agentActUndo: AgentActUndoRegistry = {
  folder_created: async (_db, act) => {
    if (refuseNext) return { ok: false, reason: 'folder_not_empty' };
    removed.push(act.subjectId);
    return { ok: true };
  },
};

const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter(), agentActUndo });

const stamp = Date.now();
const password = 'pw-t370';
let projectId: string;
let requesterCookie: string;
let requesterParticipantId: string;
let colleagueCookie: string;
let outsiderCookie: string;
let conversationId: string;
let runId: string;

async function makeUser(name: string, organisationId: string, join = true) {
  const email = `${name}-${stamp}@test.local`;
  const [user] = await db.insert(s.users).values({ name, email, organisationId }).returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const participant = join
    ? (await db.insert(s.participants).values({ userId: user!.id, projectId }).returning())[0]!
    : null;
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return { participant, cookie: res.headers.get('set-cookie')!.split(';')[0]! };
}

const post = (cookie: string, path: string) => app.request(path, { method: 'POST', headers: { cookie } });
const receipt = async (cookie: string, id = runId): Promise<AgentReceipt> => {
  const res = await app.request(`/runs/${id}/agent-acts`, { headers: { cookie } });
  expect(res.status).toBe(200);
  return (await res.json()) as AgentReceipt;
};

async function newAct(act = 'folder_created', summary = 'Created the folder “Ground investigation”') {
  const row = await recordAgentAct(db, {
    runId,
    act,
    subjectKind: 'sandbox_folder',
    subjectId: crypto.randomUUID(),
    summary,
  });
  return row;
}

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: `t370 org ${stamp}` }).returning();
  const [other] = await db.insert(s.organisations).values({ name: `t370 outside ${stamp}` }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t370 project ${stamp}`, ownerOrganisationId: org!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId: org!.id, projectId, role: 'owner' });

  const requester = await makeUser('t370-rita', org!.id);
  requesterParticipantId = requester.participant!.id;
  requesterCookie = requester.cookie;
  colleagueCookie = (await makeUser('t370-colin', org!.id)).cookie;
  outsiderCookie = (await makeUser('t370-oona', other!.id, false)).cookie;

  const [conversation] = await db
    .insert(s.conversations)
    .values({ projectId, surface: 'web' })
    .returning();
  conversationId = conversation!.id;
  const [run] = await db
    .insert(s.runs)
    .values({
      conversationId,
      agentId: 'infora.structure_builder',
      agentProvenance: 'infora',
      request: 'tidy my folders',
      environmentKey: projectId,
      requesterParticipantId,
    })
    .returning();
  runId = run!.id;
});

afterAll(async () => {
  await pool.end();
});

describe('first-class actor identity for an agent run', () => {
  it('records the act against the RUN, which is the sentence the audit was missing', async () => {
    const act = await newAct();
    expect(act.runId).toBe(runId);
    const body = await receipt(requesterCookie);
    expect(body.acts.map((a) => a.id)).toContain(act.id);
    expect(body.acts.find((a) => a.id === act.id)!.summary).toContain('Ground investigation');
  });

  it('leaves the subject’s own attribution alone — agent performance is an ADDITIONAL fact', async () => {
    // the amendment's premise: the agent acts within the invoker's own
    // permissions, so the participant really is who the act is attributable to.
    // Nothing here writes to the subject at all.
    const [row] = await db.select().from(s.agentActs).where(eq(s.agentActs.runId, runId)).limit(1);
    expect(row!.subjectKind).toBe('sandbox_folder');
    // and the run still names its requester — the person, unchanged
    const [run] = await db.select().from(s.runs).where(eq(s.runs.id, runId));
    expect(run!.requesterParticipantId).toBe(requesterParticipantId);
  });

  it('the record is append-only, with the undo state as the only carve-out', async () => {
    const act = await newAct();
    await expect(
      db.update(s.agentActs).set({ summary: 'something else' }).where(eq(s.agentActs.id, act.id)),
    ).rejects.toThrow();
    await expect(
      db.delete(s.agentActs).where(eq(s.agentActs.id, act.id)),
    ).rejects.toThrow();
    // an audit of agent behaviour the agent's invoker could rewrite is worth
    // nothing, which is exactly who this trigger is defending against
    await db.update(s.agentActs).set({ undoneAt: new Date() }).where(eq(s.agentActs.id, act.id));
    const [row] = await db.select().from(s.agentActs).where(eq(s.agentActs.id, act.id));
    expect(row!.undoneAt).not.toBeNull();
  });
});

describe('the receipt, and who may act on it', () => {
  it('is readable by anyone who can see the run, and undoable only by its requester', async () => {
    const mine = await receipt(requesterCookie);
    expect(mine.canUndo).toBe(true);
    // a colleague on the same project can READ it — the run's own visibility is
    // unchanged — but no ruling gives anyone authority over another person's
    // agent turn, so the control is absent rather than offered and refused
    const theirs = await receipt(colleagueCookie);
    expect(theirs.acts.length).toBe(mine.acts.length);
    expect(theirs.canUndo).toBe(false);
  });

  it('reads as nonexistence to someone outside the project', async () => {
    const res = await app.request(`/runs/${runId}/agent-acts`, { headers: { cookie: outsiderCookie } });
    expect(res.status).toBe(404);
  });
});

describe('undo, and the boundary the amendment draws around it', () => {
  it('runs the registered handler and stamps the interval', async () => {
    const act = await newAct();
    removed = [];
    const res = await post(requesterCookie, `/agent-acts/${act.id}/undo`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as UndoAgentActResponse;
    expect(body.act.undoneAt).not.toBeNull();
    expect(removed).toEqual([act.subject.id]);
  });

  it('keeps the undone act on the receipt — undoing does not edit the record', async () => {
    const body = await receipt(requesterCookie);
    // currency by state: a receipt that emptied itself would leave a person
    // unable to answer "what did it do that I then reversed"
    expect(body.acts.some((a) => a.undoneAt !== null)).toBe(true);
  });

  it('refuses a second undo rather than accepting it silently', async () => {
    const act = await newAct();
    expect((await post(requesterCookie, `/agent-acts/${act.id}/undo`)).status).toBe(200);
    const again = await post(requesterCookie, `/agent-acts/${act.id}/undo`);
    expect(again.status).toBe(409);
    expect(((await again.json()) as { detail?: string }).detail).toBe('already_undone');
  });

  it('refuses an act kind with NO handler — an empty registry is the substrate working', async () => {
    // nothing performs an administrative act yet, so the deployment's registry
    // is empty; an unregistered kind must be refused, never quietly stamped
    const act = await newAct('plan_row_created', 'Created a plan row');
    const res = await post(requesterCookie, `/agent-acts/${act.id}/undo`);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { detail?: string }).detail).toBe('not_undoable');
    const [row] = await db.select().from(s.agentActs).where(eq(s.agentActs.id, act.id));
    expect(row!.undoneAt).toBeNull();
  });

  it('passes the handler’s own reason through — “cannot” is not one answer', async () => {
    // the amendment permits direct execution only for reversible or additive
    // acts, and whether an additive act is STILL removable is a runtime
    // question: a folder the agent created that has since filled with documents
    const act = await newAct();
    refuseNext = true;
    const res = await post(requesterCookie, `/agent-acts/${act.id}/undo`);
    refuseNext = false;
    expect(res.status).toBe(409);
    expect(((await res.json()) as { detail?: string }).detail).toBe('folder_not_empty');
    const [row] = await db.select().from(s.agentActs).where(eq(s.agentActs.id, act.id));
    expect(row!.undoneAt).toBeNull();
  });

  it('a colleague cannot undo, and is told nothing about the act', async () => {
    const act = await newAct();
    const res = await post(colleagueCookie, `/agent-acts/${act.id}/undo`);
    expect(res.status).toBe(404);
    const [row] = await db.select().from(s.agentActs).where(eq(s.agentActs.id, act.id));
    expect(row!.undoneAt).toBeNull();
  });
});
