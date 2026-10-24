// T-475 — visible gaps and passage authorship (ADR-0048's amendment of
// 2026-10-24, ADR-0049 §7 as amended).
//
// *In plain terms: a draft with a marked gap in it cannot be promoted until the
// gap is cleared; an owner's override records how many were open; hovering a
// paragraph can say who wrote it; and a project can choose that exports end
// with a list of the passages the AI drafted.*
//
// **Repeatable on one database.** Every lookup is by an id this file created —
// never by title (T-474's lesson: a second run matched the first run's rows).
import { inflateRawSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type {
  DocumentProvenanceResponse,
  FreezeResult,
  PromotionPreflight,
  PromotionResult,
  Rendition,
  Sandbox,
} from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';
import { getBlob, textToDocx, textToPdf } from './renditions';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t475';
let projectId: string;
let producerOrg: string;
let ownerParticipantId: string;
let ownerCookie: string;
let leadCookie: string;
let leadParticipantId: string;
let leadName: string;
let plainCookie: string;
let plainParticipantId: string;
let acceptingCode: string;

async function makeUser(name: string, organisationId: string, elevated = false) {
  const email = `${name}-${stamp}@test.local`;
  const [user] = await db.insert(s.users).values({ name, email, organisationId }).returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId, elevated })
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
const post = (cookie: string, path: string, body?: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: asJson(cookie),
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
const patch = (cookie: string, path: string, body: unknown) =>
  app.request(path, { method: 'PATCH', headers: asJson(cookie), body: JSON.stringify(body) });

/** A promotable draft (the T-332 shape) holding the given content. */
async function promotableDraft(
  reference: string,
  content: string,
  cookie = leadCookie,
  participantId = leadParticipantId,
) {
  const [container] = await db
    .insert(s.containers)
    .values({ projectId, producingOrganisationId: producerOrg, documentReference: reference })
    .returning();
  await db.insert(s.workItems).values({
    projectId,
    type: 'document_production',
    title: `Deliverable ${reference}`,
    status: 'planned',
    containerId: container!.id,
  });
  await db.insert(s.deliverableAuthors).values({
    containerId: container!.id,
    participantId,
    isLead: true,
    grantedByParticipantId: participantId,
  });
  await db.insert(s.deliverableReviewers).values({
    containerId: container!.id,
    participantId: ownerParticipantId,
    isLead: true,
    grantedByParticipantId: participantId,
    confirmedAt: new Date(),
    acceptedAt: new Date(),
  });
  const created = await post(cookie, `/projects/${projectId}/sandboxes`, {
    name: `t475 area ${reference}`,
    scope: 'single_org',
  });
  const sandbox = (await created.json()) as Sandbox;
  await db.update(s.sandboxes).set({ promotionRequiresQa: false }).where(eq(s.sandboxes.id, sandbox.id));
  const doc = await post(cookie, `/projects/${projectId}/sandbox-documents`, {
    title: `Draft ${reference}`,
    sandboxId: sandbox.id,
    containerId: container!.id,
  });
  const docId = ((await doc.json()) as { id: string }).id;
  await patch(cookie, `/sandbox-documents/${docId}`, { content });
  return { containerId: container!.id, docId };
}

const preflight = async (docId: string, cookie = leadCookie): Promise<PromotionPreflight> => {
  const res = await app.request(`/sandbox-documents/${docId}/promotion-preflight`, { headers: { cookie } });
  expect(res.status).toBe(200);
  return (await res.json()) as PromotionPreflight;
};

/** A run, and a suggestion it made against the document. */
async function suggest(docId: string, participantId: string, content: string) {
  const [conversation] = await db.insert(s.conversations).values({ projectId, surface: 'web' }).returning();
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
    .values({ runId: run!.id, sandboxDocumentId: docId, kind: 'insert', content, rationale: 'r' })
    .returning();
  return { runId: run!.id as string, suggestionId: suggestion!.id as string };
}

const provenance = async (docId: string, cookie = leadCookie) => {
  const res = await app.request(`/sandbox-documents/${docId}/provenance`, { headers: { cookie } });
  expect(res.status).toBe(200);
  return ((await res.json()) as DocumentProvenanceResponse).passages;
};

/** Read one entry out of a stored/deflated zip (the docx rendition). */
function zipEntry(zip: Buffer, name: string): string {
  let at = 0;
  while (zip.readUInt32LE(at) === 0x04034b50) {
    const method = zip.readUInt16LE(at + 8);
    const compressed = zip.readUInt32LE(at + 18);
    const nameLength = zip.readUInt16LE(at + 26);
    const extra = zip.readUInt16LE(at + 28);
    const entryName = zip.subarray(at + 30, at + 30 + nameLength).toString();
    const start = at + 30 + nameLength + extra;
    const data = zip.subarray(start, start + compressed);
    if (entryName === name) return (method === 8 ? inflateRawSync(data) : data).toString();
    at = start + compressed;
  }
  throw new Error(`no ${name} in the zip`);
}

beforeAll(async () => {
  const [oA] = await db.insert(s.organisations).values({ name: `t475 owner ${stamp}` }).returning();
  const [oB] = await db.insert(s.organisations).values({ name: `t475 producer ${stamp}` }).returning();
  producerOrg = oB!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t475 project ${stamp}`, ownerOrganisationId: oA!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: oA!.id, projectId, role: 'owner' },
    { organisationId: oB!.id, projectId, role: 'member' },
  ]);
  // an accepting, contractual code, so a deliverable can be accepted and issue its C revision
  const [code] = await db
    .insert(s.acceptanceCodes)
    .values({
      projectId,
      code: 'A1',
      description: 'Published — authorized and accepted',
      isAccepting: true,
      isContractual: true,
      grounds: true,
      sortOrder: 1,
    })
    .returning();
  acceptingCode = code!.id;
  const owner = await makeUser('t475-orla', oA!.id, true);
  ownerParticipantId = owner.participant.id;
  ownerCookie = await session(owner.user.email);
  const lead = await makeUser('t475-eleanor', oB!.id, true);
  leadParticipantId = lead.participant.id;
  leadName = lead.user.name;
  leadCookie = await session(lead.user.email);
  const plain = await makeUser('t475-pat', oB!.id, false);
  plainParticipantId = plain.participant.id;
  plainCookie = await session(plain.user.email);
});

afterAll(async () => {
  await pool.end();
});

const GAP = '[Gap: the record does not give the made-ground thickness per parcel]';

describe('an open gap holds promotion exactly as an open thread does (ADR-0049 §7, amended)', () => {
  it('counts the gap, names it, and refuses the promotion', async () => {
    const { containerId, docId } = await promotableDraft(`T475-OPEN-${stamp}`, `Intro.\n\n${GAP}\n\nEnd.`);
    const pre = await preflight(docId);
    expect(pre.blocker).toBe('open_items');
    expect(pre.openItems.openGaps).toBe(1);
    // the window names the gap, not only the number
    expect(pre.openItems.gaps.map((g) => g.text)).toEqual([
      'the record does not give the made-ground thickness per parcel',
    ]);
    // and it is a third list, not a thread or a finding in disguise
    expect(pre.openItems.threads).toBe(0);
    expect(pre.openItems.findings.open).toBe(0);

    const res = await post(leadCookie, `/sandbox-documents/${docId}/promotion`);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { detail?: string }).detail).toBe('open_items');
    expect(await db.select().from(s.versions).where(eq(s.versions.containerId, containerId))).toHaveLength(0);
  });

  it('a look-alike inside a sentence is just text and blocks nothing', async () => {
    const { docId } = await promotableDraft(`T475-LOOK-${stamp}`, 'See [Gap: inline] here.\n\n[Gap:]\n\n[gap: lower]');
    const pre = await preflight(docId);
    expect(pre.openItems.openGaps).toBe(0);
    expect(pre.blocker).toBeNull();
  });

  it('deleting the line clears the gate — the author writes what the record supports, or removes it', async () => {
    const { docId } = await promotableDraft(`T475-CLEAR-${stamp}`, `Intro.\n\n${GAP}\n\nEnd.`);
    expect((await preflight(docId)).blocker).toBe('open_items');
    await patch(leadCookie, `/sandbox-documents/${docId}`, { content: 'Intro.\n\nEnd.' });
    const pre = await preflight(docId);
    expect(pre.openItems.openGaps).toBe(0);
    expect(pre.blocker).toBeNull();
    expect((await post(leadCookie, `/sandbox-documents/${docId}/promotion`)).status).toBe(201);
  });

  it('an elevated override goes through, and the record says how many gaps were open', async () => {
    const { containerId, docId } = await promotableDraft(
      `T475-FORCE-${stamp}`,
      `A.\n\n${GAP}\n\n[Gap: the groundwater level is not recorded]\n\nB.`,
    );
    const res = await post(leadCookie, `/sandbox-documents/${docId}/promotion`, { overrideOpenItems: true });
    expect(res.status).toBe(201);
    const result = (await res.json()) as PromotionResult;
    const [override] = await db
      .select()
      .from(s.promotionOverrides)
      .where(eq(s.promotionOverrides.versionId, result.versionId));
    expect(override).toBeDefined();
    expect(override!.containerId).toBe(containerId);
    expect(override!.openGaps).toBe(2);
    expect(override!.openThreads).toBe(0);
    expect(override!.openFindings).toBe(0);
  });

  it('an ordinary participant cannot pass a gap', async () => {
    const { docId } = await promotableDraft(`T475-PLAIN-${stamp}`, `A.\n\n${GAP}`, plainCookie, plainParticipantId);
    const pre = await preflight(docId, plainCookie);
    expect(pre.blocker).toBe('open_items');
    expect(pre.canOverrideOpenItems).toBe(false);
    const res = await post(plainCookie, `/sandbox-documents/${docId}/promotion`, { overrideOpenItems: true });
    expect(res.status).toBe(403);
  });
});

describe('a gap that is only in the QA-frozen version still holds promotion', () => {
  it('refuses when the head is clean but the version that would be issued carries the gap', async () => {
    const { docId } = await promotableDraft(`T475-FROZEN-${stamp}`, `Intro.\n\n${GAP}\n\nEnd.`);
    // the QA gate on (the default for a project sandbox): what promotes is the frozen version
    const [doc] = await db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.id, docId));
    await db.update(s.sandboxes).set({ promotionRequiresQa: true }).where(eq(s.sandboxes.id, doc!.sandboxId));
    const f1 = (await (await post(leadCookie, `/sandbox-documents/${docId}/freeze`)).json()) as FreezeResult;
    expect((await post(leadCookie, `/containers/${f1.containerId}/reviewers`, { participantId: leadParticipantId, isLead: true })).status).toBe(201);
    expect((await post(leadCookie, `/sandbox-documents/${docId}/freeze`)).status).toBe(201);
    const cycle = (await (await app.request(`/containers/${f1.containerId}/cycle`, { headers: { cookie: leadCookie } })).json()) as {
      rounds: { id: string }[];
    };
    const roundId = cycle.rounds.at(-1)!.id;
    expect((await post(leadCookie, `/rounds/${roundId}/deliverable-code`, { acceptanceCodeId: acceptingCode })).status).toBe(200);
    expect((await post(leadCookie, `/rounds/${roundId}/issue`)).status).toBe(200);

    // the author then removes the gap from the head; the frozen QA version still has it
    await patch(leadCookie, `/sandbox-documents/${docId}`, { content: 'Intro.\n\nEnd.' });
    const pre = await preflight(docId);
    expect(pre.blocker).toBe('open_items');
    expect(pre.openItems.openGaps).toBe(1);
    expect(pre.openItems.gaps[0]!.text).toContain('made-ground thickness');
    const res = await post(leadCookie, `/sandbox-documents/${docId}/promotion`);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { detail?: string }).detail).toBe('open_items');
  });
});

describe('who wrote each paragraph, worked out from the record (provenance)', () => {
  it('names the agent run and the acceptor, and the hand that wrote the rest', async () => {
    const { docId } = await promotableDraft(`T475-PROV-${stamp}`, '');
    const { runId, suggestionId } = await suggest(docId, leadParticipantId, 'Agent paragraph one.\n\nAgent paragraph two.');
    const accepted = await post(leadCookie, `/suggestions/${suggestionId}/resolution`, { resolution: 'accepted' });
    expect(accepted.status).toBe(201);
    // a person then writes a paragraph of their own, and the editor saves it
    const head = ((await (await app.request(`/sandbox-documents/${docId}`, { headers: { cookie: leadCookie } })).json()) as {
      content: string;
    }).content;
    await patch(leadCookie, `/sandbox-documents/${docId}`, { content: `${head}\n\nHand paragraph.` });

    const passages = await provenance(docId);
    expect(passages).toHaveLength(3);
    for (const agent of passages.slice(0, 2)) {
      expect(agent.origin).toBe('agent');
      expect(agent.runId).toBe(runId);
      expect(agent.acceptedByName).toBe(leadName);
      expect(agent.edited).toBe(false);
      expect(agent.acceptedAt).not.toBeNull();
    }
    expect(passages[2]!.origin).toBe('hand');
    expect(passages[2]!.runId).toBeNull();
    expect(passages[2]!.savedByName).toBe(leadName);
    expect(passages[2]!.savedAt).not.toBeNull();
  });

  it('an edited-then-accepted suggestion reads as edited, and the words match the edit, not the proposal', async () => {
    const { docId } = await promotableDraft(`T475-EDIT-${stamp}`, '');
    const { runId, suggestionId } = await suggest(docId, leadParticipantId, 'Proposed words.');
    const res = await post(leadCookie, `/suggestions/${suggestionId}/resolution`, {
      resolution: 'edited',
      editedContent: 'Edited words.',
    });
    expect(res.status).toBe(201);
    const [passage] = await provenance(docId);
    expect(passage!.origin).toBe('agent');
    expect(passage!.edited).toBe(true);
    expect(passage!.runId).toBe(runId);
  });

  it('a paragraph changed after acceptance honestly falls to written by hand', async () => {
    const { docId } = await promotableDraft(`T475-DRIFT-${stamp}`, '');
    const { suggestionId } = await suggest(docId, leadParticipantId, 'The agent wrote this.');
    await post(leadCookie, `/suggestions/${suggestionId}/resolution`, { resolution: 'accepted' });
    expect((await provenance(docId))[0]!.origin).toBe('agent');
    await patch(leadCookie, `/sandbox-documents/${docId}`, { content: 'The agent wrote this, and I changed it.' });
    const [passage] = await provenance(docId);
    // the limit, stated: the record keeps no span-to-suggestion link, so a near match is no match
    expect(passage!.origin).toBe('hand');
    expect(passage!.savedByName).toBe(leadName);
  });

  it('a rejected suggestion earns the paragraph nothing', async () => {
    const { docId } = await promotableDraft(`T475-REJ-${stamp}`, 'Typed by a person.');
    const { suggestionId } = await suggest(docId, leadParticipantId, 'Typed by a person.');
    await post(leadCookie, `/suggestions/${suggestionId}/resolution`, { resolution: 'rejected' });
    expect((await provenance(docId))[0]!.origin).toBe('hand');
  });

  it('is behind the document\'s own scope — another organisation cannot read it', async () => {
    const { docId } = await promotableDraft(`T475-WALL-${stamp}`, 'Private words.');
    const res = await app.request(`/sandbox-documents/${docId}/provenance`, { headers: { cookie: ownerCookie } });
    expect(res.status).toBe(404);
  });
});

describe('the authorship appendix is a project option, off unless the owner turns it on', () => {
  it('is off by default, and only the owner\'s super user may switch it', async () => {
    const read = await app.request(`/projects/${projectId}/export-authorship-appendix`, { headers: { cookie: leadCookie } });
    expect(await read.json()).toEqual({ projectId, enabled: false });
    expect((await patch(leadCookie, `/projects/${projectId}/export-authorship-appendix`, { enabled: true })).status).toBe(404);
    expect((await patch(ownerCookie, `/projects/${projectId}/export-authorship-appendix`, { enabled: 'yes' })).status).toBe(400);
    expect(
      (await db.select().from(s.projects).where(eq(s.projects.id, projectId)))[0]!.exportAuthorshipAppendix,
    ).toBe(false);
  });

  it('renders a gap as a marked line in both exports, never as prose', () => {
    const text = `Before.\n${GAP}\nAfter.`;
    const docx = zipEntry(textToDocx(text), 'word/document.xml');
    expect(docx).toContain('⚠ GAP: the record does not give the made-ground thickness per parcel');
    expect(docx).toContain('w:highlight');
    expect(docx).not.toContain('[Gap:');
    const pdf = textToPdf('Title', text).toString('binary');
    expect(pdf).toContain('*** GAP: the record does not give the made-ground thickness per parcel ***');
  });

  it('with it on, a promotion\'s docx and PDF end with the machine-drafted passages; off, they do not', async () => {
    const renditionTexts = async (versionId: string) => {
      const list = (await (await app.request(`/versions/${versionId}/renditions`, { headers: { cookie: leadCookie } })).json()) as {
        items: Rendition[];
      };
      const rows = await db.select().from(s.renditions).where(eq(s.renditions.versionId, versionId));
      expect(list.items).toHaveLength(2);
      const bytes = (format: string) => getBlob(rows.find((r) => r.format === format)!.contentRef)!;
      return {
        docx: zipEntry(bytes('docx'), 'word/document.xml'),
        pdf: bytes('pdf').toString('binary'),
      };
    };
    const make = async (tag: string) => {
      const { docId } = await promotableDraft(`T475-${tag}-${stamp}`, '');
      const { runId, suggestionId } = await suggest(docId, leadParticipantId, 'Drafted by the agent.');
      await post(leadCookie, `/suggestions/${suggestionId}/resolution`, { resolution: 'accepted' });
      const head = ((await (await app.request(`/sandbox-documents/${docId}`, { headers: { cookie: leadCookie } })).json()) as {
        content: string;
      }).content;
      await patch(leadCookie, `/sandbox-documents/${docId}`, { content: `${head}\n\nWritten by a person.` });
      const res = await post(leadCookie, `/sandbox-documents/${docId}/promotion`);
      expect(res.status).toBe(201);
      return { runId, result: (await res.json()) as PromotionResult };
    };

    // off (the default): nothing changes
    const off = await make('APPX-OFF');
    const plain = await renditionTexts(off.result.versionId);
    expect(plain.docx).not.toContain('Machine-drafted passages');
    expect(plain.pdf).not.toContain('Machine-drafted passages');

    // on
    expect((await patch(ownerCookie, `/projects/${projectId}/export-authorship-appendix`, { enabled: true })).status).toBe(200);
    try {
      const on = await make('APPX-ON');
      const withAppendix = await renditionTexts(on.result.versionId);
      for (const text of [withAppendix.docx, withAppendix.pdf]) {
        expect(text).toContain('Machine-drafted passages');
        expect(text).toContain(on.runId); // the run, in full
        expect(text).toContain(`accepted by ${leadName}`);
        expect(text).toContain('Drafted by the agent.');
      }
      // the person's own paragraph is not listed as machine-drafted
      const appendixOnly = withAppendix.pdf.slice(withAppendix.pdf.indexOf('Machine-drafted passages'));
      expect(appendixOnly).not.toContain('Written by a person');
    } finally {
      await patch(ownerCookie, `/projects/${projectId}/export-authorship-appendix`, { enabled: false });
    }
  });
});

describe('the appendix is also written on the revision issued at acceptance', () => {
  it('the contractual revision gets the appendix when it is on, and is unchanged when it is off', async () => {
    const accepted = async (tag: string) => {
      const { docId, containerId } = await promotableDraft(`T475-${tag}-${stamp}`, '');
      const { runId, suggestionId } = await suggest(docId, leadParticipantId, 'Agent text at acceptance.');
      await post(leadCookie, `/suggestions/${suggestionId}/resolution`, { resolution: 'accepted' });
      const promoted = (await (await post(leadCookie, `/sandbox-documents/${docId}/promotion`)).json()) as PromotionResult;
      await post(ownerCookie, `/rounds/${promoted.roundId}/acknowledge`);
      expect((await post(ownerCookie, `/rounds/${promoted.roundId}/deliverable-code`, { acceptanceCodeId: acceptingCode })).status).toBe(200);
      expect((await post(ownerCookie, `/rounds/${promoted.roundId}/issue`, {})).status).toBe(200);
      const versions = await db.select().from(s.versions).where(eq(s.versions.containerId, containerId));
      const c = versions.find((v) => v.versionReference.startsWith('C'))!;
      expect(c).toBeDefined();
      const rows = await db.select().from(s.renditions).where(eq(s.renditions.versionId, c.id));
      expect(rows.map((r) => r.format).sort()).toEqual(['docx', 'pdf']);
      const bytes = (format: string) => getBlob(rows.find((r) => r.format === format)!.contentRef)!;
      return { runId, docx: zipEntry(bytes('docx'), 'word/document.xml'), pdf: bytes('pdf').toString('binary') };
    };

    const off = await accepted('ACC-OFF');
    expect(off.docx).not.toContain('Machine-drafted passages');
    expect(off.pdf).not.toContain('Machine-drafted passages');

    expect((await patch(ownerCookie, `/projects/${projectId}/export-authorship-appendix`, { enabled: true })).status).toBe(200);
    try {
      const on = await accepted('ACC-ON');
      for (const text of [on.docx, on.pdf]) {
        expect(text).toContain('Machine-drafted passages');
        expect(text).toContain(on.runId);
        expect(text).toContain(`accepted by ${leadName}`);
        expect(text).toContain('Agent text at acceptance.');
      }
    } finally {
      await patch(ownerCookie, `/projects/${projectId}/export-authorship-appendix`, { enabled: false });
    }
  });
});
