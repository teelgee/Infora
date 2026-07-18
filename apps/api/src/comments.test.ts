// T-112 acceptance, against the live dev database: comment threads on a
// sandbox document — create, reply, mention, close — mutable like the
// sandbox; author-only edits; the wall rides the document's scope.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  ListRosterResponse,
  ListSandboxCommentsResponse,
  SandboxComment,
  SandboxDocument,
} from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t112';
let projectId: string;
let orgA: string;
let alice: string; // org A author
let alfie: string; // org A colleague — replies, closes, may not edit alice's
let bella: string; // org B participant on the same project — the wall case
let alfieParticipantId: string;
let bellaParticipantId: string;
let documentId: string;

async function makeUser(name: string, organisationId: string) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId })
    .returning();
  return { user: user!, participant: participant! };
}

async function session(email: string): Promise<string> {
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

const asJson = (cookie: string) => ({ cookie, 'content-type': 'application/json' });

async function comment(
  cookie: string,
  body: Record<string, unknown>,
  docId = documentId,
): Promise<Response> {
  return app.request(`/sandbox-documents/${docId}/comments`, {
    method: 'POST',
    headers: asJson(cookie),
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const [a] = await db.insert(s.organisations).values({ name: 't112 org A' }).returning();
  const [b] = await db.insert(s.organisations).values({ name: 't112 org B' }).returning();
  orgA = a!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't112 project', ownerOrganisationId: orgA })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: orgA, projectId, role: 'owner' },
    { organisationId: b!.id, projectId, role: 'member' },
  ]);
  await makeUser('t112-alice', orgA);
  const alfieMade = await makeUser('t112-alfie', orgA);
  alfieParticipantId = alfieMade.participant.id;
  const bellaMade = await makeUser('t112-bella', b!.id);
  bellaParticipantId = bellaMade.participant.id;
  [alice, alfie, bella] = await Promise.all([
    session(`t112-alice-${stamp}@test.local`),
    session(`t112-alfie-${stamp}@test.local`),
    session(`t112-bella-${stamp}@test.local`),
  ]);

  const created = await app.request(`/projects/${projectId}/sandbox-documents`, {
    method: 'POST',
    headers: asJson(alice),
    body: JSON.stringify({ title: 'Commented draft' }),
  });
  documentId = ((await created.json()) as SandboxDocument).id;
});

afterAll(async () => {
  await pool.end();
});

describe('sandbox comments (T-112)', () => {
  it('anchored root comment → reply → close by a colleague — the whole loop', async () => {
    const rootRes = await comment(alice, {
      body: "I don't like 'robust' here — let's say 'resilient'.",
      anchor: 'a robust drainage strategy',
    });
    expect(rootRes.status).toBe(201);
    const root = (await rootRes.json()) as SandboxComment;
    expect(root).toMatchObject({
      sandboxDocumentId: documentId,
      parentCommentId: null,
      anchor: 'a robust drainage strategy',
      status: 'open',
      closedBy: null,
    });
    expect(root.author.name).toBe('t112-alice');

    const replyRes = await comment(alfie, { body: 'Agreed — changed it.', parentCommentId: root.id });
    expect(replyRes.status).toBe(201);
    const reply = (await replyRes.json()) as SandboxComment;
    expect(reply.parentCommentId).toBe(root.id);

    // the colleague who made the manual edit closes the thread — not the author
    const closed = await app.request(`/sandbox-comments/${root.id}/status`, {
      method: 'POST',
      headers: asJson(alfie),
      body: JSON.stringify({ status: 'closed' }),
    });
    expect(closed.status).toBe(200);
    const closedRoot = (await closed.json()) as SandboxComment;
    expect(closedRoot.status).toBe('closed');
    expect(closedRoot.closedBy?.name).toBe('t112-alfie');
    expect(closedRoot.closedAt).not.toBeNull();

    // reopen clears the close facts — mutable working area
    const reopened = (await (
      await app.request(`/sandbox-comments/${root.id}/status`, {
        method: 'POST',
        headers: asJson(alice),
        body: JSON.stringify({ status: 'open' }),
      })
    ).json()) as SandboxComment;
    expect(reopened).toMatchObject({ status: 'open', closedBy: null, closedAt: null });

    const list = (await (
      await app.request(`/sandbox-documents/${documentId}/comments`, { headers: { cookie: alfie } })
    ).json()) as ListSandboxCommentsResponse;
    expect(list.items.map((i) => i.id)).toEqual(expect.arrayContaining([root.id, reply.id]));
  });

  it('status lives on the root; replies to replies are rejected', async () => {
    const root = (await (await comment(alice, { body: 'root' })).json()) as SandboxComment;
    const reply = (await (
      await comment(alice, { body: 'reply', parentCommentId: root.id })
    ).json()) as SandboxComment;

    const statusOnReply = await app.request(`/sandbox-comments/${reply.id}/status`, {
      method: 'POST',
      headers: asJson(alice),
      body: JSON.stringify({ status: 'closed' }),
    });
    expect(statusOnReply.status).toBe(400);

    const nested = await comment(alice, { body: 'nested', parentCommentId: reply.id });
    expect(nested.status).toBe(400);
  });

  it('edit and delete are author-only; a colleague gets forbidden', async () => {
    const root = (await (await comment(alice, { body: 'my wording' })).json()) as SandboxComment;

    const foreignEdit = await app.request(`/sandbox-comments/${root.id}`, {
      method: 'PATCH',
      headers: asJson(alfie),
      body: JSON.stringify({ body: 'rewritten' }),
    });
    expect(foreignEdit.status).toBe(403);

    const foreignDelete = await app.request(`/sandbox-comments/${root.id}`, {
      method: 'DELETE',
      headers: { cookie: alfie },
    });
    expect(foreignDelete.status).toBe(403);

    const ownEdit = await app.request(`/sandbox-comments/${root.id}`, {
      method: 'PATCH',
      headers: asJson(alice),
      body: JSON.stringify({ body: 'my better wording' }),
    });
    expect(ownEdit.status).toBe(200);
    expect(((await ownEdit.json()) as SandboxComment).body).toBe('my better wording');

    const ownDelete = await app.request(`/sandbox-comments/${root.id}`, {
      method: 'DELETE',
      headers: { cookie: alice },
    });
    expect(ownDelete.status).toBe(204);
    const gone = await app.request(`/sandbox-comments/${root.id}`, {
      method: 'PATCH',
      headers: asJson(alice),
      body: JSON.stringify({ body: 'ghost' }),
    });
    expect(gone.status).toBe(404);
  });

  it('deleting a root deletes its thread', async () => {
    const root = (await (await comment(alice, { body: 'thread root' })).json()) as SandboxComment;
    const reply = (await (
      await comment(alfie, { body: 'thread reply', parentCommentId: root.id })
    ).json()) as SandboxComment;

    await app.request(`/sandbox-comments/${root.id}`, { method: 'DELETE', headers: { cookie: alice } });

    const list = (await (
      await app.request(`/sandbox-documents/${documentId}/comments`, { headers: { cookie: alice } })
    ).json()) as ListSandboxCommentsResponse;
    expect(list.items.some((i) => i.id === root.id || i.id === reply.id)).toBe(false);
  });

  it('mentions name document-entitled participants only; the roster is project-visible (ADR-0033, T-117)', async () => {
    const good = await comment(alice, { body: '@alfie please review', mentions: [alfieParticipantId] });
    expect(good.status).toBe(201);
    expect(((await good.json()) as SandboxComment).mentions).toEqual([alfieParticipantId]);

    // bella is a participant on the project but cannot see this document
    const bad = await comment(alice, { body: '@bella?', mentions: [bellaParticipantId] });
    expect(bad.status).toBe(400);

    // the roster is project-visible — the wall hides work, never presence
    // (ADR-0033 widened the T-112 org-scoped picker); mentioning someone who
    // cannot see the document still 400s above, which is the real gate
    const picker = (await (
      await app.request(`/projects/${projectId}/participants`, { headers: { cookie: alice } })
    ).json()) as ListRosterResponse;
    const names = picker.items.map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining(['t112-alice', 't112-alfie', 't112-bella']));
  });

  it('the wall rides the document: the other org’s participant sees nothing', async () => {
    const root = (await (await comment(alice, { body: 'org-private chatter' })).json()) as SandboxComment;

    const reads = await Promise.all([
      app.request(`/sandbox-documents/${documentId}/comments`, { headers: { cookie: bella } }),
      comment(bella, { body: 'peek' }),
      app.request(`/sandbox-comments/${root.id}`, {
        method: 'PATCH',
        headers: asJson(bella),
        body: JSON.stringify({ body: 'peek' }),
      }),
      app.request(`/sandbox-comments/${root.id}`, { method: 'DELETE', headers: { cookie: bella } }),
      app.request(`/sandbox-comments/${root.id}/status`, {
        method: 'POST',
        headers: asJson(bella),
        body: JSON.stringify({ status: 'closed' }),
      }),
    ]);
    for (const res of reads) expect(res.status).toBe(404); // denial reads as nonexistence
  });
});
