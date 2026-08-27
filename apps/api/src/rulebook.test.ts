// T-308 acceptance at the boundary — the rulebook's door into org context.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { ListRulebooksResponse, RulebookRecord } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t308';

let adminCookie: string;
let plainCookie: string;
let rivalAdminCookie: string;
let rulebookId: string;

const MANUAL = ['4.2 Voice', 'Avoid the passive voice.', '', '7. Units', 'Use SI units throughout.'].join(
  '\n',
);

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

async function makeAdmin(name: string, organisationId: string, admin = true) {
  const email = `${name}-${stamp}@test.local`;
  const [user] = await db
    .insert(s.users)
    .values({ name, email, organisationId, orgRole: admin ? 'admin' : 'member' })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
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
  return app.request('/organisation/rulebooks', { method: 'POST', headers: { cookie }, body: form });
}

beforeAll(async () => {
  const [ashcombe] = await db.insert(s.organisations).values({ name: `t308 org ${stamp}` }).returning();
  const [rival] = await db.insert(s.organisations).values({ name: `t308 rival ${stamp}` }).returning();
  adminCookie = await makeAdmin('t308-ada', ashcombe!.id);
  plainCookie = await makeAdmin('t308-pat', ashcombe!.id, false);
  rivalAdminCookie = await makeAdmin('t308-rex', rival!.id);
});

afterAll(async () => {
  await pool.end();
});

describe('loading a rulebook into org context', () => {
  it('extracts, parses to clauses, and reports how many can be quoted by number', async () => {
    const res = await upload(adminCookie, 'manual.docx', docx(MANUAL.split('\n')), 'Drafting Manual');
    expect(res.status).toBe(201);
    const record = (await res.json()) as RulebookRecord;
    rulebookId = record.id;
    expect(record.title).toBe('Drafting Manual');
    expect(record.clauses).toBe(2);
    // the honest number: both clauses carry an address a finding can quote
    expect(record.labelled).toBe(2);
    expect(record.loadedBy.name).toBe('t308-ada');
  });

  it('stores each clause verbatim, with the manual’s own number', async () => {
    const clauses = await db
      .select()
      .from(s.rulebookClauses)
      .where(eq(s.rulebookClauses.rulebookId, rulebookId));
    expect(clauses.map((c) => c.clause).sort()).toEqual(['4.2', '7']);
    expect(clauses.find((c) => c.clause === '4.2')!.content).toContain('Avoid the passive voice.');
  });

  it('refuses a format it cannot read, while the person still holds the file', async () => {
    const res = await upload(adminCookie, 'manual.txt', Buffer.from('4.2 Voice'));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { detail?: string }).detail).toBe('unsupported_format');
  });

  it('refuses a docx with no text, rather than parking an empty rulebook', async () => {
    const res = await upload(adminCookie, 'empty.docx', docx(['   ']));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { detail?: string }).detail).toBe('docx_no_text');
  });
});

describe('the tier and the wall', () => {
  it('is org-admin only', async () => {
    expect((await app.request('/organisation/rulebooks', { headers: { cookie: plainCookie } })).status).toBe(
      404,
    );
    expect((await upload(plainCookie, 'manual.docx', docx(['4.2 Voice']))).status).toBe(404);
  });

  it('another organisation sees none of it, and cannot retire it', async () => {
    const listed = (await (
      await app.request('/organisation/rulebooks', { headers: { cookie: rivalAdminCookie } })
    ).json()) as ListRulebooksResponse;
    expect(listed.items.some((r) => r.id === rulebookId)).toBe(false);

    const res = await app.request(`/organisation/rulebooks/${rulebookId}`, {
      method: 'DELETE',
      headers: { cookie: rivalAdminCookie },
    });
    expect(res.status).toBe(404); // absence, not refusal
    const [row] = await db.select().from(s.rulebooks).where(eq(s.rulebooks.id, rulebookId));
    expect(row!.retiredAt).toBeNull();
  });
});

describe('retire, never delete', () => {
  it('retires the rulebook and keeps every clause it quoted', async () => {
    const res = await app.request(`/organisation/rulebooks/${rulebookId}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as RulebookRecord).retiredAt).not.toBeNull();
    const clauses = await db
      .select()
      .from(s.rulebookClauses)
      .where(eq(s.rulebookClauses.rulebookId, rulebookId));
    expect(clauses).toHaveLength(2);
  });

  it('a second retirement is absence — there is nothing live left to retire', async () => {
    const res = await app.request(`/organisation/rulebooks/${rulebookId}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie },
    });
    expect(res.status).toBe(404);
  });
});
