// T-473 — currency on reference material, against the live dev database.
//
// *In plain terms: the owner's super user can say "this standard is still the
// one to rely on". The record keeps their name, the date, and when it is next
// due — a year on for a standard, six months for legislation, whatever the
// project has set. When that date passes the owner's work queue says so, and
// every sight of the document (the library, the source view, a citation of it)
// carries the fact — decided at the moment of the read, never stored as a
// state. A document nobody has confirmed keeps being read, with the mark.*
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import type {
  ConfirmCurrentResponse,
  GetContainerCurrencyResponse,
  GetLibraryResponse,
  GetPassageResponse,
  GetRecheckDefaultsResponse,
  GetVersionResponse,
  GetWorkQueueResponse,
} from '@infora/contracts';
import { createDb, hashPassword, schema as s, seedProjectOntology, withProjectScope } from '@infora/db';
import { readRun } from '@infora/orchestration';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const stamp = Date.now();
const password = 'pw-t473';
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter('ok') });

let projectId: string;
let ownerOrgId: string;
let ownerSuper: string;
let ownerSuperParticipant: string;
let ownerMember: string;
let producerSuper: string;
let termId: Record<string, string>; // document_type code → id
let standardId: string; // a Standard
let standardVersionId: string;
let legislationId: string; // Legislation
let unclassifiedId: string;
let deliverableId: string; // has a work item
let chunkId: string;

async function makeUser(name: string, organisationId: string, elevated: boolean) {
  const email = `${name}-${stamp}@test.local`;
  const [user] = await db.insert(s.users).values({ name, email, organisationId, orgRole: 'admin' }).returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db.insert(s.participants).values({ userId: user!.id, projectId, elevated }).returning();
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return { cookie: res.headers.get('set-cookie')!.split(';')[0]!, participantId: participant!.id };
}

const get = (cookie: string, path: string) => app.request(path, { headers: { cookie } });
const send = (method: 'POST' | 'PATCH', cookie: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: { cookie, 'content-type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
const row = async (id: string) => (await db.select().from(s.containers).where(eq(s.containers.id, id)))[0]!;
const queue = async (cookie: string) =>
  ((await (await get(cookie, `/projects/${projectId}/work-queue`)).json()) as GetWorkQueueResponse).items;
const libraryItem = async (id: string) =>
  ((await (await get(ownerSuper, `/projects/${projectId}/library`)).json()) as GetLibraryResponse).items.find(
    (i) => i.containerId === id,
  )!;
/** is `recheck_due_at` exactly `confirmed_current_at` plus N months (the database's own arithmetic)? */
const dueIsPlusMonths = async (id: string, months: number) => {
  const r = await db.execute(
    sql`select (confirmed_current_at + make_interval(months => ${months}) = recheck_due_at) as ok from containers where id = ${id}`,
  );
  return (r.rows[0] as { ok: boolean }).ok;
};
const makePast = (id: string, daysAgo: number) =>
  db
    .update(s.containers)
    .set({
      confirmedCurrentByParticipantId: ownerSuperParticipant,
      confirmedCurrentAt: sql`now() - interval '400 days'`,
      recheckDueAt: sql`now() - make_interval(days => ${daysAgo})`,
    })
    .where(eq(s.containers.id, id));

beforeAll(async () => {
  const [ownerOrg] = await db.insert(s.organisations).values({ name: `t473 owner ${stamp}` }).returning();
  const [prodOrg] = await db.insert(s.organisations).values({ name: `t473 producer ${stamp}` }).returning();
  ownerOrgId = ownerOrg!.id;
  const [project] = await db.insert(s.projects).values({ name: `t473 ${stamp}`, ownerOrganisationId: ownerOrgId }).returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrgId, projectId, role: 'owner' },
    { organisationId: prodOrg!.id, projectId, role: 'member' },
  ]);
  await seedProjectOntology(db, projectId);
  const o = await makeUser('t473-owner', ownerOrgId, true);
  ownerSuper = o.cookie;
  ownerSuperParticipant = o.participantId;
  ownerMember = (await makeUser('t473-member', ownerOrgId, false)).cookie;
  producerSuper = (await makeUser('t473-prod', prodOrg!.id, true)).cookie;

  const [facet] = await db
    .select()
    .from(s.classificationFacets)
    .where(and(eq(s.classificationFacets.projectId, projectId), eq(s.classificationFacets.key, 'document_type')));
  const terms = await db.select().from(s.classificationTerms).where(eq(s.classificationTerms.facetId, facet!.id));
  termId = Object.fromEntries(terms.map((t) => [t.code, t.id]));

  const admit = async (reference: string, content: string, code: string | null, withWorkItem = false) => {
    const [container] = await db
      .insert(s.containers)
      .values({
        projectId,
        producingOrganisationId: ownerOrgId,
        documentReference: reference,
        title: `Title of ${reference}`,
        inLibrary: true,
        state: 'live',
      })
      .returning();
    const [version] = await db
      .insert(s.versions)
      .values({ containerId: container!.id, versionReference: 'R01', content, isCurrent: true })
      .returning();
    if (code !== null) {
      await db.insert(s.containerClassifications).values({
        containerId: container!.id,
        facetId: facet!.id,
        termId: termId[code]!,
        setByParticipantId: ownerSuperParticipant,
      });
    }
    if (withWorkItem) {
      await db.insert(s.workItems).values({
        projectId,
        type: 'document_production',
        title: 'A deliverable',
        status: 'in_production',
        containerId: container!.id,
      });
    }
    return { containerId: container!.id, versionId: version!.id };
  };
  const standard = await admit(`T473-STD-${stamp}`, 'A standard says: test the ground before you design.', 'STD');
  standardId = standard.containerId;
  standardVersionId = standard.versionId;
  legislationId = (await admit(`T473-LEG-${stamp}`, 'An Act says: notify the authority.', 'LEG')).containerId;
  unclassifiedId = (await admit(`T473-UNC-${stamp}`, 'A paper nobody classified.', null)).containerId;
  deliverableId = (await admit(`T473-DEL-${stamp}`, 'A produced deliverable.', null, true)).containerId;

  const embedding = Array.from({ length: 1024 }, () => 0.01);
  const [chunk] = await withProjectScope(db, projectId, (tx) =>
    tx
      .insert(s.versionChunks)
      .values({
        versionId: standardVersionId,
        chunkIndex: 0,
        content: 'test the ground before you design.',
        embedding,
        embeddingModelId: 'test-t473',
        embeddingModelVersion: 't1',
        startOffset: 16,
        endOffset: 50,
      })
      .returning(),
  );
  chunkId = chunk!.id;
});

afterAll(async () => {
  await withProjectScope(db, projectId, (tx) =>
    tx.delete(s.versionChunks).where(eq(s.versionChunks.embeddingModelId, 'test-t473')),
  );
  await pool.end();
});

describe('the intervals (T-473)', () => {
  it('a project starts with Standard 12, Guidance 12, Legislation 6, Consultee response 24 and a fallback of 12', async () => {
    const res = await get(ownerMember, `/projects/${projectId}/recheck-defaults`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as GetRecheckDefaultsResponse;
    const by = Object.fromEntries(body.defaults.map((d) => [d.label, d.intervalMonths]));
    expect(by).toEqual({ Standard: 12, Guidance: 12, Legislation: 6, 'Consultee response': 24, 'Any other document': 12 });
    // the fallback is the last row
    expect(body.defaults.at(-1)).toMatchObject({ termId: null, label: 'Any other document' });
  });

  it('only the owner’s super user edits them; an unknown type is refused; a bad number is refused', async () => {
    const patch = { defaults: [{ termId: termId['LEG']!, intervalMonths: 3 }] };
    expect((await send('PATCH', ownerMember, `/projects/${projectId}/recheck-defaults`, patch)).status).toBe(403);
    expect((await send('PATCH', producerSuper, `/projects/${projectId}/recheck-defaults`, patch)).status).toBe(403);
    expect(
      (await send('PATCH', ownerSuper, `/projects/${projectId}/recheck-defaults`, { defaults: [{ termId: termId['LEG']!, intervalMonths: 0 }] })).status,
    ).toBe(400);
    expect(
      (await send('PATCH', ownerSuper, `/projects/${projectId}/recheck-defaults`, { defaults: [{ termId: termId['DR']!, intervalMonths: 5 }] })).status,
    ).toBe(400);
    const ok = await send('PATCH', ownerSuper, `/projects/${projectId}/recheck-defaults`, patch);
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as GetRecheckDefaultsResponse;
    expect(body.defaults.find((d) => d.label === 'Legislation')!.intervalMonths).toBe(3);
    // put it back for the tests below
    await send('PATCH', ownerSuper, `/projects/${projectId}/recheck-defaults`, { defaults: [{ termId: termId['LEG']!, intervalMonths: 6 }] });
  });
});

describe('confirming current (T-473)', () => {
  it('a document nobody has confirmed reads as unconfirmed, with no names and no dates', async () => {
    expect((await libraryItem(standardId)).currency).toEqual({ state: 'unconfirmed', confirmedBy: null, confirmedAt: null, recheckDue: null });
    const card = (await (await get(ownerMember, `/containers/${standardId}/currency`)).json()) as GetContainerCurrencyResponse;
    expect(card.currency.state).toBe('unconfirmed');
    expect(card.intervalMonths).toBe(12);
  });

  it('sets who, when and the due date from the document type’s interval — the latest confirmation wins', async () => {
    const res = await send('POST', ownerSuper, `/containers/${standardId}/confirm-current`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ConfirmCurrentResponse;
    expect(body.currency).toMatchObject({ state: 'confirmed', confirmedBy: 't473-owner' });
    expect(body.intervalMonths).toBe(12);
    const stored = await row(standardId);
    expect(stored.confirmedCurrentByParticipantId).toBe(ownerSuperParticipant);
    expect(stored.confirmedCurrentAt).not.toBeNull();
    expect(await dueIsPlusMonths(standardId, 12)).toBe(true);
    expect((await libraryItem(standardId)).currency).toMatchObject({ state: 'confirmed', confirmedBy: 't473-owner' });

    // legislation runs for six months
    expect((await send('POST', ownerSuper, `/containers/${legislationId}/confirm-current`)).status).toBe(200);
    expect(await dueIsPlusMonths(legislationId, 6)).toBe(true);
    // a document with no type takes the project's fallback
    expect((await send('POST', ownerSuper, `/containers/${unclassifiedId}/confirm-current`)).status).toBe(200);
    expect(await dueIsPlusMonths(unclassifiedId, 12)).toBe(true);

    // a second confirmation overwrites the first (the record keeps the latest)
    const first = (await row(standardId)).confirmedCurrentAt!;
    await new Promise((r) => setTimeout(r, 15));
    await send('POST', ownerSuper, `/containers/${standardId}/confirm-current`);
    expect((await row(standardId)).confirmedCurrentAt!.getTime()).toBeGreaterThan(first.getTime());
  });

  it('a changed interval applies to the next confirmation', async () => {
    await send('PATCH', ownerSuper, `/projects/${projectId}/recheck-defaults`, { defaults: [{ termId: termId['STD']!, intervalMonths: 2 }] });
    await send('POST', ownerSuper, `/containers/${standardId}/confirm-current`);
    expect(await dueIsPlusMonths(standardId, 2)).toBe(true);
    await send('PATCH', ownerSuper, `/projects/${projectId}/recheck-defaults`, { defaults: [{ termId: termId['STD']!, intervalMonths: 12 }] });
  });

  it('is refused for a deliverable (404) and writes nothing; and for anyone but the owner’s super user', async () => {
    expect((await send('POST', ownerSuper, `/containers/${deliverableId}/confirm-current`)).status).toBe(404);
    const d = await row(deliverableId);
    expect([d.confirmedCurrentByParticipantId, d.confirmedCurrentAt, d.recheckDueAt]).toEqual([null, null, null]);
    expect((await get(ownerSuper, `/containers/${deliverableId}/currency`)).status).toBe(404);
    expect((await libraryItem(deliverableId)).currency).toBeNull();

    // an owner-organisation member who is not a super user is told why; an organisation
    // that is not the owner is told nothing exists
    const refused = await send('POST', ownerMember, `/containers/${standardId}/confirm-current`);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ detail: 'owner_super_user_required' });
    expect((await send('POST', producerSuper, `/containers/${standardId}/confirm-current`)).status).toBe(404);
    // a container that does not exist
    expect((await send('POST', ownerSuper, `/containers/00000000-0000-4000-8000-000000000000/confirm-current`)).status).toBe(404);
  });
});

describe('the work queue (T-473)', () => {
  it('lists a reference document past its re-check date for the owner’s super user — and for nobody else — and drops it once confirmed', async () => {
    await makePast(standardId, 20);
    const items = (await queue(ownerSuper)).filter((i) => i.kind === 'recheck_reference');
    expect(items).toHaveLength(1);
    expect(items[0]!.label).toMatch(/^Re-check: Title of T473-STD-\d+ — due \d{1,2} \w{3} \d{4}$/);
    expect(items[0]!.href).toBe(`documents/${standardId}`);
    // not for an owner-organisation member who is not a super user, nor a producer
    expect((await queue(ownerMember)).filter((i) => i.kind === 'recheck_reference')).toEqual([]);
    expect((await queue(producerSuper)).filter((i) => i.kind === 'recheck_reference')).toEqual([]);

    // confirming it removes the row
    await send('POST', ownerSuper, `/containers/${standardId}/confirm-current`);
    expect((await queue(ownerSuper)).filter((i) => i.kind === 'recheck_reference')).toEqual([]);
  });

  it('never lists a document nobody has confirmed (it carries the mark instead), and lists the longest-overdue first', async () => {
    await db.update(s.containers).set({ confirmedCurrentByParticipantId: null, confirmedCurrentAt: null, recheckDueAt: null }).where(eq(s.containers.id, unclassifiedId));
    await makePast(standardId, 5);
    await makePast(legislationId, 90);
    const items = (await queue(ownerSuper)).filter((i) => i.kind === 'recheck_reference');
    expect(items.map((i) => i.href)).toEqual([`documents/${legislationId}`, `documents/${standardId}`]);
    expect(items.some((i) => i.href.includes(unclassifiedId))).toBe(false);
    await send('POST', ownerSuper, `/containers/${standardId}/confirm-current`);
    await send('POST', ownerSuper, `/containers/${legislationId}/confirm-current`);
  });
});

describe('currency on every read of a reference document (T-473)', () => {
  it('overdue flips with the clock: confirmed, then — once the date has passed — overdue, on the library, the version and the passage', async () => {
    await send('POST', ownerSuper, `/containers/${standardId}/confirm-current`);
    const readAll = async () => {
      const lib = await libraryItem(standardId);
      const version = (await (await get(ownerSuper, `/versions/${standardVersionId}`)).json()) as GetVersionResponse;
      const passage = (await (await get(ownerSuper, `/versions/${standardVersionId}/passages/${chunkId}`)).json()) as GetPassageResponse;
      return [lib.currency, version.currency, passage.currency];
    };
    for (const c of await readAll()) expect(c).toMatchObject({ state: 'confirmed', confirmedBy: 't473-owner' });

    await makePast(standardId, 1); // the date passes — nothing is "set"; the read decides
    for (const c of await readAll()) {
      expect(c).toMatchObject({ state: 'overdue', confirmedBy: 't473-owner' });
      expect(c!.recheckDue).not.toBeNull();
    }
    // the card on the document page says the same
    const card = (await (await get(ownerSuper, `/containers/${standardId}/currency`)).json()) as GetContainerCurrencyResponse;
    expect(card.currency.state).toBe('overdue');
    await send('POST', ownerSuper, `/containers/${standardId}/confirm-current`);
  });

  it('a citation carries the currency as of the read — never stored on the citation row', async () => {
    const [conversation] = await db.insert(s.conversations).values({ projectId, surface: 'web' }).returning();
    const [run] = await db
      .insert(s.runs)
      .values({
        conversationId: conversation!.id,
        agentId: 'infora.document_production',
        agentProvenance: 'infora',
        request: 'what does the standard say',
        environmentKey: projectId,
        requesterParticipantId: ownerSuperParticipant,
      })
      .returning();
    const [step] = await db.insert(s.steps).values({ runId: run!.id, type: 'cite' }).returning();
    await db.insert(s.citations).values({ stepId: step!.id, versionId: standardVersionId, chunkId });
    // the deliverable is cited too — it has no currency
    const [deliverableVersion] = await db.select().from(s.versions).where(eq(s.versions.containerId, deliverableId));
    await db.insert(s.citations).values({ stepId: step!.id, versionId: deliverableVersion!.id });

    // confirmed: no mark needed, but the object is there
    let read = await readRun(db, run!.id);
    const cited = () => read!.citations!.find((c) => 'versionId' in c.source && c.source.versionId === standardVersionId)!;
    expect(cited().currency).toMatchObject({ state: 'confirmed' });
    expect(read!.citations!.find((c) => 'versionId' in c.source && c.source.versionId === deliverableVersion!.id)!.currency).toBeUndefined();

    // the same stored citation, read after the date has passed
    await makePast(standardId, 3);
    read = await readRun(db, run!.id);
    expect(cited().currency).toMatchObject({ state: 'overdue', confirmedBy: 't473-owner' });
    // and after the confirmation is withdrawn altogether
    await db.update(s.containers).set({ confirmedCurrentByParticipantId: null, confirmedCurrentAt: null, recheckDueAt: null }).where(eq(s.containers.id, standardId));
    read = await readRun(db, run!.id);
    expect(cited().currency).toEqual({ state: 'unconfirmed', confirmedBy: null, confirmedAt: null, recheckDue: null });
    // nothing about currency is on the stored row
    const [stored] = await db.select().from(s.citations).where(eq(s.citations.stepId, step!.id)).limit(1);
    expect(Object.keys(stored!).some((k) => k.toLowerCase().includes('currency'))).toBe(false);
  });

  it('the library’s "Needs confirming" filter lists unconfirmed and overdue reference documents, never a confirmed one or a deliverable', async () => {
    await send('POST', ownerSuper, `/containers/${legislationId}/confirm-current`);
    await db.update(s.containers).set({ confirmedCurrentByParticipantId: null, confirmedCurrentAt: null, recheckDueAt: null }).where(eq(s.containers.id, standardId));
    await makePast(unclassifiedId, 2);
    const res = await get(ownerSuper, `/projects/${projectId}/library/search?currency=needs_confirming`);
    const ids = ((await res.json()) as { items: Array<{ containerId: string }> }).items.map((i) => i.containerId);
    expect(ids.sort()).toEqual([standardId, unclassifiedId].sort());
  });
});
