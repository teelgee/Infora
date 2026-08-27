// T-340 acceptance, against the live dev database.
//
// The ticket's own words: **the derived half is the whole ticket.** A purge
// that deletes the row and leaves `version_chunks` has erased nothing, because
// the text survives in the retrieval index — so the assertions that carry the
// weight here are the ones that look for the text *after* the act, both
// through retrieval's own path and by direct chunk query.
//
// The second load-bearing test is the boundary: ADR-0050 §6 bounds purge by
// **whose material it is**, and never reaches anything promoted into the
// library. That is the owner's record and the owner's act to remove from (§7).
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, hashPassword, schema as s, withProjectScope } from '@infora/db';
import { ingestVersion, isVersionIndexed } from '@infora/data';
import { buildApp } from './app';
import { purgeSandboxDocument, removeLibraryContainer } from './purge';
import { getBlob, putBlob } from './renditions';
import { fakeRouter, FAKE_EMBED_MODEL } from './test-router';

const { db, pool } = createDb();
const router = fakeRouter();
const app = buildApp({ db, sessionSecret: 'test-secret', router });

const stamp = Date.now();
const password = 'pw-t340';
let projectId: string;
let organisationId: string;
let adminId: string;
let adminCookie: string;
let memberCookie: string;
let participantId: string;

/**
 * "Is it indexed" is asked through @infora/data, because the grounding index
 * has one reader by construction (source-rules.mjs RULE 1) and a test in
 * apps/api is not it — the same rule the implementation obeys.
 */
const indexed = (versionId: string) => isVersionIndexed(db, router, versionId, projectId);

/** the phrase that makes the purged document findable if anything survives */
const NEEDLE = `perched horizon dewatering ${stamp}`;

async function seedDocument(title: string) {
  const [doc] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId,
      organisationId,
      sandboxId,
      title,
      origin: 'authored',
      kind: 'text',
      format: 'infora_text',
      content: `A working draft. ${NEEDLE}. It says more besides.`,
      fileRef: putBlob(Buffer.from('native bytes'), 'docx'),
      createdByParticipantId: participantId,
    })
    .returning();
  await db.insert(s.sandboxDocumentVersions).values({
    sandboxDocumentId: doc!.id,
    content: doc!.content,
    createdByParticipantId: participantId,
  });
  // the freeze series: org-private (ADR-0032), and the thing that carries the
  // document's text into the chunk index
  const [container] = await db
    .insert(s.containers)
    .values({
      projectId,
      producingOrganisationId: organisationId,
      scope: 'sandbox',
      sandboxDocumentId: doc!.id,
      inLibrary: false,
      state: 'live',
    })
    .returning();
  const [version] = await db
    .insert(s.versions)
    .values({ containerId: container!.id, versionReference: 'v0.1', content: doc!.content, isCurrent: true })
    .returning();
  await db.insert(s.renditions).values({
    versionId: version!.id,
    kind: 'native',
    format: 'docx',
    contentRef: putBlob(Buffer.from('frozen bytes'), 'docx'),
  });
  await ingestVersion(db, router, version!.id);
  return { doc: doc!, version: version!, container: container! };
}

let sandboxId: string;

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: `t340 org ${stamp}` }).returning();
  organisationId = org!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t340 project ${stamp}`, ownerOrganisationId: org!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId: org!.id, projectId, role: 'owner' });

  const makeUser = async (name: string, orgRole: 'admin' | 'member') => {
    const [user] = await db
      .insert(s.users)
      .values({ name, email: `${name}-${stamp}@test.local`, organisationId: org!.id, orgRole })
      .returning();
    await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
    const [participant] = await db
      .insert(s.participants)
      .values({ userId: user!.id, projectId })
      .returning();
    const res = await app.request('/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `${name}-${stamp}@test.local`, password }),
    });
    return { user: user!, participant: participant!, cookie: res.headers.get('set-cookie')!.split(';')[0]! };
  };
  const admin = await makeUser('t340admin', 'admin');
  adminId = admin.user.id;
  adminCookie = admin.cookie;
  participantId = admin.participant.id;
  memberCookie = (await makeUser('t340member', 'member')).cookie;

  const [sandbox] = await db
    .insert(s.sandboxes)
    .values({
      projectId,
      owningOrganisationId: organisationId,
      createdByParticipantId: participantId,
      scope: 'single_org',
      name: 't340 sandbox',
    })
    .returning();
  sandboxId = sandbox!.id;
});

afterAll(async () => {
  await pool.end();
});

/** the DB error behind drizzle's wrapper, which is where the trigger's words are */
async function rejection(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return String((error as Error).cause ?? error);
  }
  throw new Error('expected a rejection');
}

const chunksFor = (versionId: string) =>
  withProjectScope(db, projectId, (tx) =>
    tx.select().from(s.versionChunks).where(eq(s.versionChunks.versionId, versionId)),
  );

describe('purgeSandboxDocument — the derived half is the whole ticket (T-340)', () => {
  it('erases the row, the freeze series, and the chunks that carry the text', async () => {
    const { doc, version } = await seedDocument(`Purge subject ${stamp}`);
    // it is genuinely in the index before the act, or the test proves nothing
    expect((await chunksFor(version.id)).length).toBeGreaterThan(0);

    const result = await purgeSandboxDocument(db, {
      documentId: doc.id,
      projectId,
      organisationId,
      userId: adminId,
    });
    expect(result).not.toBeNull();
    expect(result!.reach.chunks).toBeGreaterThan(0);
    expect(result!.reach.frozenVersions).toBe(1);
    expect(result!.reach.ambientVersions).toBe(1);

    // the document, its freeze series and its versions are gone
    expect(await db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.id, doc.id))).toHaveLength(0);
    expect(await db.select().from(s.versions).where(eq(s.versions.id, version.id))).toHaveLength(0);

    // ...and so is the derived copy. THIS is the assertion the ticket is about:
    // a purge that stopped at the row would leave the text here, findable.
    expect(await chunksFor(version.id)).toHaveLength(0);
    const anyChunk = await withProjectScope(db, projectId, (tx) =>
      tx
        .select()
        .from(s.versionChunks)
        .where(eq(s.versionChunks.embeddingModelId, FAKE_EMBED_MODEL)),
    );
    expect(anyChunk.some((chunk) => chunk.content.includes(NEEDLE))).toBe(false);
  });

  it('erases the blobs, which is where the bytes actually live', async () => {
    const [doc] = await db
      .insert(s.sandboxDocuments)
      .values({
        projectId,
        organisationId,
        sandboxId,
        title: `Blob subject ${stamp}`,
        origin: 'uploaded',
        kind: 'text',
        format: 'docx',
        content: '',
        fileRef: putBlob(Buffer.from('the native file'), 'docx'),
        createdByParticipantId: participantId,
      })
      .returning();
    const ref = doc!.fileRef!;
    expect(getBlob(ref)).not.toBeNull();

    const result = await purgeSandboxDocument(db, {
      documentId: doc!.id,
      projectId,
      organisationId,
      userId: adminId,
    });
    expect(result!.reach.blobs).toBe(1);
    expect(getBlob(ref)).toBeNull();
  });

  it('NEVER reaches the library — that is the owner’s record (ADR-0050 §6/§7)', async () => {
    // a library container carrying the same text, and a sandbox document
    // beside it. Purging the draft must leave the promoted record untouched:
    // this is the boundary the whole act is bounded by.
    const [libraryContainer] = await db
      .insert(s.containers)
      .values({
        projectId,
        producingOrganisationId: organisationId,
        documentReference: `T340-LIB-${stamp}`,
        inLibrary: true,
        state: 'live',
      })
      .returning();
    const [libraryVersion] = await db
      .insert(s.versions)
      .values({
        containerId: libraryContainer!.id,
        versionReference: 'C01',
        content: `The promoted record. ${NEEDLE}. Accepted and issued.`,
        isCurrent: true,
      })
      .returning();
    await ingestVersion(db, router, libraryVersion!.id);

    const { doc } = await seedDocument(`Draft beside the record ${stamp}`);
    await purgeSandboxDocument(db, { documentId: doc.id, projectId, organisationId, userId: adminId });

    // the library version, its container and its chunks all survive
    expect(await db.select().from(s.versions).where(eq(s.versions.id, libraryVersion!.id))).toHaveLength(1);
    expect(
      await db.select().from(s.containers).where(eq(s.containers.id, libraryContainer!.id)),
    ).toHaveLength(1);
    expect((await chunksFor(libraryVersion!.id)).length).toBeGreaterThan(0);
  });

  it('is another organisation’s nothing — absence, not refusal', async () => {
    const { doc } = await seedDocument(`Someone else's draft ${stamp}`);
    const [otherOrg] = await db.insert(s.organisations).values({ name: `t340 other ${stamp}` }).returning();
    const result = await purgeSandboxDocument(db, {
      documentId: doc.id,
      projectId,
      organisationId: otherOrg!.id,
      userId: adminId,
    });
    expect(result).toBeNull();
    // and nothing was touched on the way to saying no
    expect(await db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.id, doc.id))).toHaveLength(1);
  });

  it('records the act with a name, and it outlives the document', async () => {
    const { doc } = await seedDocument(`Recorded purge ${stamp}`);
    const result = await purgeSandboxDocument(db, {
      documentId: doc.id,
      projectId,
      organisationId,
      userId: adminId,
    });
    const [event] = await db
      .select()
      .from(s.purgeEvents)
      .where(eq(s.purgeEvents.id, result!.eventId));
    expect(event!.purgedByUserId).toBe(adminId);
    // the title survives the document deliberately: a record naming only a
    // uuid answers "something was erased" and nothing else
    expect(event!.subjectTitle).toBe(`Recorded purge ${stamp}`);
    expect((event!.reached as { chunks: number }).chunks).toBeGreaterThan(0);
  });

  it('the purge record itself cannot be edited or deleted', async () => {
    // the whole value of this row is that it survives the act it describes
    const [event] = await db
      .select()
      .from(s.purgeEvents)
      .where(eq(s.purgeEvents.organisationId, organisationId))
      .limit(1);
    await expect(rejection(() =>
      db.update(s.purgeEvents).set({ subjectTitle: 'something else' }).where(eq(s.purgeEvents.id, event!.id)),
    )).resolves.toMatch(/append-only/);
    await expect(rejection(() => db.delete(s.purgeEvents).where(eq(s.purgeEvents.id, event!.id)))).resolves.toMatch(
      /append-only/,
    );
  });

  it('append-only still holds outside a purge — the carve-out is DELETE only', async () => {
    const { version } = await seedDocument(`Still append-only ${stamp}`);
    // no `infora.purge` set: the trigger refuses, exactly as before T-340
    await expect(rejection(() => db.delete(s.versions).where(eq(s.versions.id, version.id)))).resolves.toMatch(
      /append-only/,
    );
    // and a content UPDATE is refused even INSIDE a purge — erasure needs no
    // ability to rewrite, so the carve-out never admits one
    const inPurge = await rejection(() =>
      withProjectScope(db, projectId, async (tx) => {
        await tx.execute(sql`select set_config('infora.purge', 'on', true)`);
        return tx.update(s.versions).set({ content: 'rewritten' }).where(eq(s.versions.id, version.id));
      }),
    );
    expect(inPurge).toMatch(/only is_current may change/);
  });
});

describe('POST /projects/:projectId/purges — the gate (T-340)', () => {
  const purge = (cookie: string, body: unknown) =>
    app.request(`/projects/${projectId}/purges`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('is org-admin only', async () => {
    const { doc } = await seedDocument(`Gate subject ${stamp}`);
    const res = await purge(memberCookie, { sandboxDocumentId: doc.id, confirmation: doc.title });
    expect(res.status).toBe(404); // absence, not refusal
    expect(await db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.id, doc.id))).toHaveLength(1);
  });

  it('enforces the typed confirmation SERVER-SIDE', async () => {
    // a client-side-only confirmation is a speed bump for a person and nothing
    // at all for a script, and this is the one act with no undo
    const { doc } = await seedDocument(`Typed confirmation ${stamp}`);
    const wrong = await purge(adminCookie, { sandboxDocumentId: doc.id, confirmation: 'yes' });
    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as { detail: string }).detail).toBe('confirmation_mismatch');
    expect(await db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.id, doc.id))).toHaveLength(1);

    const right = await purge(adminCookie, { sandboxDocumentId: doc.id, confirmation: doc.title });
    expect(right.status).toBe(200);
    expect(await db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.id, doc.id))).toHaveLength(0);
  });

  it('lists the organisation’s own purge record', async () => {
    const res = await app.request(`/projects/${projectId}/purges`, { headers: { cookie: adminCookie } });
    expect(res.status).toBe(200);
    const { items } = (await res.json()) as { items: Array<{ subjectTitle: string; purgedByName: string }> };
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]!.purgedByName).toBe('t340admin');
    // ...and a member of the same organisation cannot read it
    expect(
      (await app.request(`/projects/${projectId}/purges`, { headers: { cookie: memberCookie } })).status,
    ).toBe(404);
  });
});

// T-341 — library removal (ADR-0050 §7). The refusals carry this ticket, not
// the erasure: erasure is T-340's machinery reused, and what is new is WHO may
// do it, WHEN, and to WHAT.
describe('removeLibraryContainer (T-341)', () => {
  let ownerOrgId: string;
  let otherOrgId: string;

  const admitReference = async (reference: string, state: 'live' | 'withdrawn') => {
    const [container] = await db
      .insert(s.containers)
      .values({
        projectId,
        producingOrganisationId: organisationId,
        documentReference: reference,
        inLibrary: true,
        state,
      })
      .returning();
    const [version] = await db
      .insert(s.versions)
      .values({
        containerId: container!.id,
        versionReference: 'R01',
        content: `A loaded reference document. ${NEEDLE}. Received, not produced here.`,
        isCurrent: true,
      })
      .returning();
    await ingestVersion(db, router, version!.id);
    return { container: container!, version: version! };
  };

  beforeAll(async () => {
    const [project] = await db.select().from(s.projects).where(eq(s.projects.id, projectId)).limit(1);
    ownerOrgId = project!.ownerOrganisationId;
    const [other] = await db.insert(s.organisations).values({ name: `t341 other ${stamp}` }).returning();
    otherOrgId = other!.id;
  });

  it('refuses a container that is not withdrawn — the two steps cannot collapse', async () => {
    // withdraw is reversible and this is not, so the reversible one has to have
    // happened first
    const { container } = await admitReference(`T341-LIVE-${stamp}`, 'live');
    const result = await removeLibraryContainer(db, {
      containerId: container.id,
      projectId,
      organisationId: ownerOrgId,
      userId: adminId,
    });
    expect(result).toEqual({ ok: false, reason: 'not_withdrawn' });
    expect(await db.select().from(s.containers).where(eq(s.containers.id, container.id))).toHaveLength(1);
  });

  it('refuses an organisation that does not own the library', async () => {
    // the lever sits with the owner, or a consultancy could erase six months of
    // corpus ahead of a dispute and leave every citation resolving to nothing
    const { container } = await admitReference(`T341-NOTOWNER-${stamp}`, 'withdrawn');
    const result = await removeLibraryContainer(db, {
      containerId: container.id,
      projectId,
      organisationId: otherOrgId,
      userId: adminId,
    });
    expect(result).toEqual({ ok: false, reason: 'not_owner' });
  });

  it('refuses a container carrying a review record — §8 retains that', async () => {
    const { container } = await admitReference(`T341-REVIEWED-${stamp}`, 'withdrawn');
    await db.insert(s.workItems).values({
      projectId,
      type: 'document_production',
      title: 'A produced deliverable',
      status: 'planned',
      containerId: container.id,
    });
    const result = await removeLibraryContainer(db, {
      containerId: container.id,
      projectId,
      organisationId: ownerOrgId,
      userId: adminId,
    });
    expect(result).toEqual({ ok: false, reason: 'has_review_record' });
  });

  it('erases a withdrawn reference document, chunks and all', async () => {
    const { container, version } = await admitReference(`T341-REMOVE-${stamp}`, 'withdrawn');
    expect(await indexed(version.id)).toBe(true);

    const result = await removeLibraryContainer(db, {
      containerId: container.id,
      projectId,
      organisationId: ownerOrgId,
      userId: adminId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reach.versions).toBe(1);
    expect(result.reach.chunks).toBeGreaterThan(0);

    expect(await db.select().from(s.containers).where(eq(s.containers.id, container.id))).toHaveLength(0);
    expect(await db.select().from(s.versions).where(eq(s.versions.id, version.id))).toHaveLength(0);
    // removal means ERASED, not delisted — delisting buys nothing withdraw had
    // not already bought
    expect(await indexed(version.id)).toBe(false);

    const [event] = await db.select().from(s.purgeEvents).where(eq(s.purgeEvents.id, result.eventId));
    expect(event!.subjectKind).toBe('library_container');
    expect(event!.subjectTitle).toBe(`T341-REMOVE-${stamp}`);
    expect(event!.purgedByUserId).toBe(adminId);
  });
});
