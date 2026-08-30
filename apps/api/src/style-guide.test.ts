// T-397 acceptance at the boundary — the project style guide's door into
// project context, and the governance half that this ticket ANSWERED.
//
// **Who may load and amend one: the owner organisation's super user.** ADR-0053
// §3 makes the guide *owner-curated* and *binding every organisation on the
// project*, and the record already has that shape — whole-project configuration
// (`conflict_attestation_required`, `review_period_default_days`) is fixed by
// the owner super user, and a document every consultant on the scheme is
// checked against is the same kind of act. **Reading is every participant's**,
// because a rule that binds you is a rule you may look up.
//
// The other half — whether a mid-project amendment is an event anyone is told
// about — is `Q-050` and is deliberately not answered here.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ListStyleGuidesResponse, StyleGuideRecord } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t397';

const GUIDE = ['4.2 Voice', 'Write in the active voice.', '', '9. Units', 'Use metric units.'].join(
  '\n',
);

let projectId: string;
let ownerSuperCookie: string;
let ownerPlainCookie: string;
let consultantCookie: string;
let outsiderCookie: string;
let guideId: string;

/**
 * A minimal real .docx, built in memory: a zip whose only entry is
 * `word/document.xml`. Stored (no compression) so no zlib is needed, which
 * keeps the fixture honest — `docxToText` reads a real file, not a stub.
 */
function docx(paragraphs: string[]): Buffer {
  const xml = Buffer.from(
    `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${paragraphs
      .map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`)
      .join('')}</w:body></w:document>`,
  );
  const name = Buffer.from('word/document.xml');
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let crc = 0xffffffff;
  for (const byte of xml) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  crc = (crc ^ 0xffffffff) >>> 0;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 8); // stored
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(xml.length, 18);
  local.writeUInt32LE(xml.length, 22);
  local.writeUInt16LE(name.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(xml.length, 20);
  central.writeUInt32LE(xml.length, 24);
  central.writeUInt16LE(name.length, 28);

  const centralStart = local.length + name.length + xml.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(centralStart, 16);

  return Buffer.concat([local, name, xml, central, name, end]);
}

async function person(
  name: string,
  organisationId: string,
  onProject: string | null,
  elevated = false,
) {
  const email = `${name}-${stamp}@test.local`;
  const [user] = await db
    .insert(s.users)
    .values({ name, email, organisationId })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  if (onProject !== null) {
    await db.insert(s.participants).values({ userId: user!.id, projectId: onProject, elevated });
  }
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

function upload(cookie: string, filename: string, bytes: Buffer, title?: string) {
  const form = new FormData();
  form.append('file', new File([new Uint8Array(bytes)], filename));
  if (title) form.append('title', title);
  return app.request(`/projects/${projectId}/style-guides`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  });
}

const list = async (cookie: string) =>
  (await (
    await app.request(`/projects/${projectId}/style-guides`, { headers: { cookie } })
  ).json()) as ListStyleGuidesResponse;

beforeAll(async () => {
  const [owner] = await db.insert(s.organisations).values({ name: `t397 owner ${stamp}` }).returning();
  const [consultancy] = await db
    .insert(s.organisations)
    .values({ name: `t397 consultancy ${stamp}` })
    .returning();
  const [outside] = await db.insert(s.organisations).values({ name: `t397 outside ${stamp}` }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t397 project ${stamp}`, ownerOrganisationId: owner!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId: owner!.id, projectId, role: 'owner' });
  await db.insert(s.memberships).values({ organisationId: consultancy!.id, projectId, role: 'member' });

  ownerSuperCookie = await person('t397-olly', owner!.id, projectId, true);
  ownerPlainCookie = await person('t397-pam', owner!.id, projectId);
  consultantCookie = await person('t397-cass', consultancy!.id, projectId);
  outsiderCookie = await person('t397-oscar', outside!.id, null);
});

afterAll(async () => {
  await pool.end();
});

describe('who may curate a project style guide (T-397)', () => {
  it("the owner's super user loads it, and the record names who and when", async () => {
    const res = await upload(ownerSuperCookie, 'style.docx', docx(GUIDE.split('\n')), 'Scheme style guide');
    expect(res.status).toBe(201);
    const record = (await res.json()) as StyleGuideRecord;
    guideId = record.id;
    expect(record.title).toBe('Scheme style guide');
    expect(record.clauses).toBe(2);
    // the honest number: both clauses carry an address a finding can quote
    expect(record.labelled).toBe(2);
    expect(record.loadedBy.name).toBe('t397-olly');
  });

  it("the owner's own non-elevated participant is told they need the tier", async () => {
    // 403 and not 404: they are of the owner organisation, so the route's
    // existence is not news, and "you need the super-user tier" is something
    // they can act on
    const res = await upload(ownerPlainCookie, 'style.docx', docx(GUIDE.split('\n')));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { detail?: string }).detail).toBe('super_user_required');
  });

  it('a consultant on the project gets the same 404 as nonexistence', async () => {
    // principle 4: a member organisation has no business learning that a
    // curation route exists for a project it does not own
    expect((await upload(consultantCookie, 'style.docx', docx(GUIDE.split('\n')))).status).toBe(404);
  });

  it('and so does an organisation that is not on the project at all', async () => {
    expect((await upload(outsiderCookie, 'style.docx', docx(GUIDE.split('\n')))).status).toBe(404);
  });
});

describe('who may READ one (T-397)', () => {
  it('every participant on the project can — a rule that binds you is one you may look up', async () => {
    const consultantView = await list(consultantCookie);
    expect(consultantView.items.map((item) => item.id)).toContain(guideId);
    const ownerView = await list(ownerPlainCookie);
    expect(ownerView.items.map((item) => item.id)).toContain(guideId);
  });

  it('and an organisation not on the project reads nothing at all', async () => {
    const res = await app.request(`/projects/${projectId}/style-guides`, {
      headers: { cookie: outsiderCookie },
    });
    expect(res.status).toBe(404);
  });
});

describe('retire, never delete (T-397)', () => {
  it('refuses a format it cannot read, while the person still holds the file', async () => {
    const res = await upload(ownerSuperCookie, 'style.txt', Buffer.from('4.2 Voice'));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { detail?: string }).detail).toBe('unsupported_format');
  });

  it("a consultant cannot retire the owner's guide", async () => {
    const res = await app.request(`/projects/${projectId}/style-guides/${guideId}`, {
      method: 'DELETE',
      headers: { cookie: consultantCookie },
    });
    expect(res.status).toBe(404);
  });

  it('the owner super user retires it, and the row survives with a date on it', async () => {
    const res = await app.request(`/projects/${projectId}/style-guides/${guideId}`, {
      method: 'DELETE',
      headers: { cookie: ownerSuperCookie },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as StyleGuideRecord).retiredAt).not.toBeNull();
    // still listed, and still readable: a finding written against a clause the
    // project has since withdrawn must still resolve to the words it quoted
    expect((await list(ownerSuperCookie)).items.map((i) => i.id)).toContain(guideId);
  });
});
