// T-253 acceptance, end to end against the live dev database: passage-grain
// audit (finding F5, finding F5).
//
// The claim being converted into a demonstration is "we log what it saw". Not
// "which documents" — which PASSAGES, in the order the model received them,
// each attributed to the step that admitted it. And it stays producer-private:
// the passages are the client's own documents, so this is the producer's
// evidence, not a second route into the corpus.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asc, eq, sql } from 'drizzle-orm';
import type { GetRunContextResponse, Run } from '@infora/contracts';
import { createDb, hashPassword, schema as s, withProjectScope } from '@infora/db';
import { buildApp } from './app';
import { FAKE_EMBED_MODEL, fakeRouter, fakeVector } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t253';
let projectId: string;
let consultantCookie: string;
let ownerCookie: string;
let conversationId: string;
let versionId: string;
let chunkIds: string[];
const PASSAGES = [
  'The ground investigation recorded contamination exceedances at three trial pits.',
  'Groundwater was encountered at between four and six metres below ground level.',
];

async function makeUser(name: string, organisationId: string) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  await db.insert(s.participants).values({ userId: user!.id, projectId });
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${name}-${stamp}@test.local`, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

beforeAll(async () => {
  const [owner] = await db.insert(s.organisations).values({ name: `t253 owner ${stamp}` }).returning();
  const [consultant] = await db
    .insert(s.organisations)
    .values({ name: `t253 consultant ${stamp}` })
    .returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t253 project ${stamp}`, ownerOrganisationId: owner!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: owner!.id, projectId, role: 'owner' },
    { organisationId: consultant!.id, projectId, role: 'member' },
  ]);
  ownerCookie = await makeUser('t253-owner', owner!.id);
  consultantCookie = await makeUser('t253-consultant', consultant!.id);

  // one library document with TWO passages, produced by the consultant's own
  // organisation so it grounds without a share
  const [container] = await db
    .insert(s.containers)
    .values({
      projectId,
      producingOrganisationId: consultant!.id,
      documentReference: `T253-GEO-GIR-${stamp}`,
      inLibrary: true,
    })
    .returning();
  const [version] = await db
    .insert(s.versions)
    .values({ containerId: container!.id, versionReference: 'v3', content: PASSAGES.join(' ') })
    .returning();
  versionId = version!.id;
  // NB: no .returning() here — an INSERT that returns rows must also satisfy
  // the T-247 read policy, which requires a declared project scope. The ids
  // are read back below inside withProjectScope, the way retrieval does.
  await db
    .insert(s.versionChunks)
    .values(
      PASSAGES.map((content, chunkIndex) => ({
        versionId: version!.id,
        chunkIndex,
        content,
        embedding: fakeVector(content),
        embeddingModelId: FAKE_EMBED_MODEL,
        embeddingModelVersion: 'fake-1',
        // T-271 — the spans these passages really occupy in the version above,
        // which is PASSAGES joined by a single space
        startOffset: PASSAGES.slice(0, chunkIndex).reduce((at, p) => at + p.length + 1, 0),
        endOffset:
          PASSAGES.slice(0, chunkIndex).reduce((at, p) => at + p.length + 1, 0) + content.length,
      })),
    );
  chunkIds = await withProjectScope(db, projectId, async (tx) => {
    const rows = await tx
      .select({ id: s.versionChunks.id, chunkIndex: s.versionChunks.chunkIndex })
      .from(s.versionChunks)
      .where(eq(s.versionChunks.versionId, version!.id))
      .orderBy(asc(s.versionChunks.chunkIndex));
    return rows.map((row) => row.id);
  });

  conversationId = ((await (
    await app.request(`/projects/${projectId}/conversations`, {
      method: 'POST',
      headers: { cookie: consultantCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ surface: 'web' }),
    })
  ).json()) as { conversationId: string }).conversationId;
});

afterAll(async () => {
  await pool.end();
});

async function ask(): Promise<Run> {
  const res = await app.request(`/conversations/${conversationId}/runs`, {
    method: 'POST',
    headers: { cookie: consultantCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ request: 'What did the ground investigation record?' }),
  });
  return (await res.json()) as Run;
}

describe('passage-grain audit (T-253, finding F5)', () => {
  it('records the chunk beside the version on every step that saw it', async () => {
    const run = await ask();
    const retrieve = run.steps.find((step) => step.type === 'retrieve')!;

    expect(retrieve.sourceSet.length).toBeGreaterThan(0);
    for (const source of retrieve.sourceSet) {
      expect(source).toMatchObject({ versionId });
      // the whole point: not just which document — which passage
      expect(chunkIds).toContain((source as { chunkId?: string }).chunkId);
    }
    // two passages of one version are two distinct sources, not one
    const distinct = new Set(retrieve.sourceSet.map((source) => JSON.stringify(source)));
    expect(distinct.size).toBe(retrieve.sourceSet.length);
  });

  it('reconstructs the assembled context exactly, in order, attributed to its step', async () => {
    const run = await ask();
    const res = await app.request(`/runs/${run.id}/context`, { headers: { cookie: consultantCookie } });
    expect(res.status).toBe(200);
    const context = (await res.json()) as GetRunContextResponse;

    expect(context.runId).toBe(run.id);
    expect(context.unreconstructable).toBe(0);
    // "in order" means the order the MODEL received them — the order the step
    // recorded — not the order they sit in the document. Retrieval ranks by
    // similarity, so those differ, and reproducing the document's order here
    // would misrepresent what the model was shown.
    const retrieve = run.steps.find((step) => step.type === 'retrieve')!;
    expect(context.passages.map((passage) => passage.chunkId)).toEqual(
      retrieve.sourceSet.map((source) => (source as { chunkId: string }).chunkId),
    );
    expect(context.passages.map((passage) => passage.content).sort()).toEqual([...PASSAGES].sort());
    for (const passage of context.passages) {
      expect(passage.documentReference).toBe(`T253-GEO-GIR-${stamp}`);
      expect(passage.versionReference).toBe('v3');
      expect(passage.stepType).toBe('retrieve'); // the step that admitted it
    }
    // each passage once, attributed to the FIRST step that saw it — the later
    // steps work from the same set and would otherwise triple the answer
    expect(context.passages).toHaveLength(PASSAGES.length);
  });

  // T-271 — the evidence read answers "what did your AI read" and now "where
  // was it", which is the difference between a citation and a checkable one.
  it('says where in the document each passage sat', async () => {
    const run = await ask();
    const context = (await (
      await app.request(`/runs/${run.id}/context`, { headers: { cookie: consultantCookie } })
    ).json()) as GetRunContextResponse;

    const source = PASSAGES.join(' ');
    for (const passage of context.passages) {
      expect(passage.locator).not.toBeNull();
      const { span, verbatim, paragraph } = passage.locator!;
      // the span slices the real version content back to the passage
      expect(source.slice(span.start, span.end)).toBe(verbatim);
      expect(verbatim).toBe(passage.content);
      expect(paragraph).toBe(0); // one paragraph in this fixture, no newlines
    }
    // and the two passages sit at different places, which is the whole point of
    // recording a position rather than a document
    const starts = context.passages.map((p) => p.locator!.span.start);
    expect(new Set(starts).size).toBe(PASSAGES.length);
  });

  it('is producer-private, like the run record it belongs to', async () => {
    const run = await ask();
    const res = await app.request(`/runs/${run.id}/context`, { headers: { cookie: ownerCookie } });
    expect(res.status).toBe(404); // the same 404 as nonexistence (principle 4)
  });

  it('states what it cannot reconstruct rather than rendering it as empty', async () => {
    const run = await ask();
    // a chunk re-ingested under a different model id is a different row; the
    // recorded id no longer resolves, and the honest answer says so
    await withProjectScope(db, projectId, (tx) =>
      tx.delete(s.versionChunks).where(eq(s.versionChunks.id, chunkIds[0]!)),
    );

    const context = (await (
      await app.request(`/runs/${run.id}/context`, { headers: { cookie: consultantCookie } })
    ).json()) as GetRunContextResponse;

    expect(context.unreconstructable).toBe(1);
    const lost = context.passages.find((passage) => passage.chunkId === chunkIds[0]);
    expect(lost?.content).toBeNull();
    expect(lost?.versionId).toBe(versionId); // the identity survives; the text does not
  });
});

// T-341 (step 1) — the property library removal rests on, probed BEFORE the act
// that depends on it is built.
//
// ADR-0050 §7: "The citing run stays, and does not lie." Removal erases the
// derived stores, so a run that cited a removed passage now points at nothing —
// and the honest answer is neither an erased record (which would falsify what
// happened) nor a silent gap (which reads as an AI that cited nothing). T-253
// built `unreconstructable` for a neighbouring case; this asks whether it
// covers this one.
describe('T-341 — a run that cited an erased passage says so', () => {
  it('reports unreconstructable rather than a silent gap', async () => {
    const run = await ask();
    const before = (await (
      await app.request(`/runs/${run.id}/context`, { headers: { cookie: consultantCookie } })
    ).json()) as GetRunContextResponse;
    expect(before.passages.length).toBeGreaterThan(0);
    expect(before.unreconstructable).toBe(0);

    // erase the chunks the run recorded — what removal will do, done directly,
    // because the act itself is what this ticket is about to build
    await withProjectScope(db, projectId, async (tx) => {
      await tx.execute(sql`select set_config('infora.purge', 'on', true)`);
      await tx.delete(s.versionChunks).where(eq(s.versionChunks.versionId, versionId));
    });

    const after = (await (
      await app.request(`/runs/${run.id}/context`, { headers: { cookie: consultantCookie } })
    ).json()) as GetRunContextResponse;
    // the record still says a passage was read there...
    expect(after.passages.length).toBe(before.passages.length);
    // ...and says plainly that it can no longer be produced
    expect(after.unreconstructable).toBe(before.passages.length);
    for (const passage of after.passages) {
      expect(passage.content).toBeNull();
      expect(passage.locator).toBeNull();
    }
  });
});
