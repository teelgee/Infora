// T-053 acceptance, against the live dev database: each resolution writes
// exactly one Signal; accept/edit applies content to the sandbox document;
// reject leaves it untouched; a second call is 409 conflict.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { ResolveSuggestionResponse, SandboxDocument } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { ensureDefaultSandbox } from './sandbox';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t053';
let projectId: string;
let organisationId: string;
let participantId: string;
let cookie: string;

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: 't053 org' }).returning();
  organisationId = org!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't053 project', ownerOrganisationId: org!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId: org!.id, projectId, role: 'owner' });
  const [user] = await db
    .insert(s.users)
    .values({ name: 't053', email: `t053-${stamp}@test.local`, organisationId: org!.id })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId })
    .returning();
  participantId = participant!.id;

  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `t053-${stamp}@test.local`, password }),
  });
  cookie = res.headers.get('set-cookie')!.split(';')[0]!;
});

afterAll(async () => {
  await pool.end();
});

async function makeSuggestion(documentContent = ''): Promise<{ suggestionId: string; documentId: string }> {
  const [doc] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId,
      organisationId,
      sandboxId: await ensureDefaultSandbox(db, projectId, organisationId, participantId),
      title: 't053 doc',
      content: documentContent,
      createdByParticipantId: participantId,
    })
    .returning();
  const [conversation] = await db
    .insert(s.conversations)
    .values({ projectId, surface: 'web' })
    .returning();
  const [run] = await db
    .insert(s.runs)
    .values({
      conversationId: conversation!.id,
      agentId: 'infora.grounded_draft',
      agentProvenance: 'infora',
      request: 'draft',
      environmentKey: projectId,
      requesterParticipantId: participantId,
    })
    .returning();
  const [suggestion] = await db
    .insert(s.suggestions)
    .values({
      runId: run!.id,
      sandboxDocumentId: doc!.id,
      kind: 'insert',
      content: 'The proposed paragraph.',
      rationale: 'r',
    })
    .returning();
  return { suggestionId: suggestion!.id, documentId: doc!.id };
}

const resolve = (suggestionId: string, body: unknown) =>
  app.request(`/suggestions/${suggestionId}/resolution`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('resolution → Signal → apply (T-053)', () => {
  it('accept writes one Signal and applies the content to the document', async () => {
    const { suggestionId, documentId } = await makeSuggestion('Existing text.');
    const res = await resolve(suggestionId, { resolution: 'accepted' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ResolveSuggestionResponse;
    expect(body.sandboxDocument?.content).toBe('Existing text.\n\nThe proposed paragraph.');

    const signals = await db.select().from(s.signals).where(eq(s.signals.suggestionId, suggestionId));
    expect(signals).toHaveLength(1);
    expect(signals[0]!.resolution).toBe('accepted');
    expect(signals[0]!.resolvedByParticipantId).toBe(participantId);
    void documentId;
  });

  it('a second resolution is 409 conflict — exactly one Signal, immutable', async () => {
    const { suggestionId } = await makeSuggestion();
    await resolve(suggestionId, { resolution: 'accepted' });
    const again = await resolve(suggestionId, { resolution: 'rejected' });
    expect(again.status).toBe(409);
    expect(((await again.json()) as { error: string }).error).toBe('conflict');
    const signals = await db.select().from(s.signals).where(eq(s.signals.suggestionId, suggestionId));
    expect(signals).toHaveLength(1);
  });

  it('edit applies the edited content and records it on the Signal', async () => {
    const { suggestionId } = await makeSuggestion();
    const res = await resolve(suggestionId, { resolution: 'edited', editedContent: 'The refined paragraph.' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ResolveSuggestionResponse;
    expect(body.sandboxDocument?.content).toBe('The refined paragraph.'); // empty head takes it whole
    const [signal] = await db.select().from(s.signals).where(eq(s.signals.suggestionId, suggestionId));
    expect(signal!.editedContent).toBe('The refined paragraph.');
  });

  it('reject writes the Signal and leaves the document untouched', async () => {
    const { suggestionId, documentId } = await makeSuggestion('Untouched.');
    const res = await resolve(suggestionId, { resolution: 'rejected' });
    expect(res.status).toBe(201);
    expect(((await res.json()) as ResolveSuggestionResponse).sandboxDocument).toBeUndefined();

    const doc = (await (
      await app.request(`/sandbox-documents/${documentId}`, { headers: { cookie } })
    ).json()) as SandboxDocument;
    expect(doc.content).toBe('Untouched.');
  });

  it("rejects 'edited' without editedContent as invalid", async () => {
    const { suggestionId } = await makeSuggestion();
    expect((await resolve(suggestionId, { resolution: 'edited' })).status).toBe(400);
  });
});
