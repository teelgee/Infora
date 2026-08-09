// T-364 (S6, ADR-0027 propose-confirm) acceptance — the structure builder's
// agent proposes a candidate tree and writes nothing. The parser is pure and
// carries the honesty rules: unusable output becomes a QUESTION, never a
// silent empty tree and never a thrown error; an over-large tree is refused
// rather than truncated. The route is gated exactly like the builder it fills.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { ProposeFolderStructureResult, Sandbox } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { parseProposal } from './structure-agent';
import { fakeRouter } from './test-router';

describe('parseProposal (pure)', () => {
  it('takes a well-formed tree, fenced or bare', () => {
    const bare = parseProposal('{"nodes":[{"name":"Environmental","children":[{"name":"Ecology"}]}],"followUp":null}');
    expect(bare.nodes).toEqual([{ name: 'Environmental', children: [{ name: 'Ecology' }] }]);
    expect(bare.followUp).toBeNull();

    const fenced = parseProposal('```json\n{"nodes":[{"name":"Geotechnical"}]}\n```');
    expect(fenced.nodes).toEqual([{ name: 'Geotechnical' }]);
  });

  it('turns unusable output into a question rather than an error or an empty tree', () => {
    for (const bad of ['not json at all', '[]', 'null', '{"nodes":[{"name":""}]}', '{"nodes":"Ecology"}']) {
      const out = parseProposal(bad);
      expect(out.nodes).toEqual([]);
      expect(out.followUp).toMatch(/\?$/); // it asks
    }
  });

  it('carries the model’s own follow-up when it declines to guess', () => {
    const out = parseProposal('{"nodes":[],"followUp":"Which disciplines are on this project?"}');
    expect(out.nodes).toEqual([]);
    expect(out.followUp).toBe('Which disciplines are on this project?');
  });

  it('refuses names a person would not have chosen: whitespace-only, over-long, control characters', () => {
    // whitespace-only passed min(1) before the trim and left the builder in a
    // state that looks filled but cannot be created
    expect(parseProposal('{"nodes":[{"name":"   "}]}').nodes).toEqual([]);
    // the database column is unbounded text — nothing else backstops a length
    expect(parseProposal(JSON.stringify({ nodes: [{ name: 'x'.repeat(121) }] })).nodes).toEqual([]);
    // a NUL byte is a Postgres error; a newline is a folder list that lies
    expect(parseProposal(JSON.stringify({ nodes: [{ name: 'A\u0000B' }] })).nodes).toEqual([]);
    expect(parseProposal(JSON.stringify({ nodes: [{ name: 'A\nB' }] })).nodes).toEqual([]);
    // and a name at the boundary is still fine, trimmed
    expect(parseProposal(JSON.stringify({ nodes: [{ name: '  Ecology  ' }] })).nodes).toEqual([
      { name: 'Ecology' },
    ]);
  });

  it('answers a hostile depth with a question, never a thrown RangeError', () => {
    // zod's safeParse converts validation issues but lets a host RangeError
    // through — the whole parse therefore sits inside the catch
    let deep = '{"name":"leaf"}';
    for (let i = 0; i < 10000; i++) deep = `{"name":"n${i}","children":[${deep}]}`;
    const out = parseProposal(`{"nodes":[${deep}]}`);
    expect(out.nodes).toEqual([]);
    expect(out.followUp).toBeTruthy();
  });

  it('refuses an over-large tree instead of truncating it', () => {
    const many = { nodes: Array.from({ length: 201 }, (_, i) => ({ name: `Folder ${i}` })) };
    const out = parseProposal(JSON.stringify(many));
    expect(out.nodes).toEqual([]);
    expect(out.followUp).toContain('200');
  });
});

const { db, pool } = createDb();
const PROPOSAL = '{"nodes":[{"name":"Environmental","children":[{"name":"Ecology"},{"name":"Noise"}]}],"followUp":null}';
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter(PROPOSAL) });

const stamp = Date.now();
const password = 'pw-t364';
let projectId: string;
let sandboxId: string;
let superCookie: string;
let memberCookie: string;

async function makeUser(name: string, organisationId: string, elevated = false) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  await db.insert(s.participants).values({ userId: user!.id, projectId, elevated });
  return user!;
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
const propose = (cookie: string, ask: string) =>
  app.request(`/sandboxes/${sandboxId}/folder-structure/proposal`, {
    method: 'POST',
    headers: asJson(cookie),
    body: JSON.stringify({ ask }),
  });

beforeAll(async () => {
  const [oA] = await db.insert(s.organisations).values({ name: 't364 owner' }).returning();
  const [oB] = await db.insert(s.organisations).values({ name: 't364 consult' }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't364 project', ownerOrganisationId: oA!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: oA!.id, projectId, role: 'owner' },
    { organisationId: oB!.id, projectId, role: 'member' },
  ]);
  superCookie = await session((await makeUser('t364-sana', oB!.id, true)).email);
  memberCookie = await session((await makeUser('t364-mona', oB!.id)).email);

  const created = await app.request(`/projects/${projectId}/sandboxes`, {
    method: 'POST',
    headers: asJson(superCookie),
    body: JSON.stringify({ name: 't364 area', scope: 'single_org' }),
  });
  sandboxId = ((await created.json()) as Sandbox).id;
});

afterAll(async () => {
  await pool.end();
});

describe('the proposal route (T-364)', () => {
  it('proposes a tree and creates NOTHING — the deterministic endpoint still writes', async () => {
    const before = await db.select().from(s.sandboxFolders).where(eq(s.sandboxFolders.sandboxId, sandboxId));
    const res = await propose(superCookie, 'one area per discipline with survey and reporting inside');
    expect(res.status).toBe(200);
    const body = (await res.json()) as ProposeFolderStructureResult;
    expect(body.nodes[0]?.name).toBe('Environmental');
    expect(body.nodes[0]?.children?.map((n) => n.name)).toEqual(['Ecology', 'Noise']);

    const after = await db.select().from(s.sandboxFolders).where(eq(s.sandboxFolders.sandboxId, sandboxId));
    expect(after).toHaveLength(before.length); // proposed, never created
  });

  it('is gated like the builder it fills: an ordinary member is refused', async () => {
    const denied = await propose(memberCookie, 'give me a structure');
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { detail: string }).detail).toBe('super_user_only');
  });

  it('is refused in plan-locked mode — there the plan IS the structure', async () => {
    await app.request(`/sandboxes/${sandboxId}/settings`, {
      method: 'PATCH',
      headers: asJson(superCookie),
      body: JSON.stringify({ planLocked: true }),
    });
    const refused = await propose(superCookie, 'anything');
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { detail: string }).detail).toBe('plan_locked');
    await app.request(`/sandboxes/${sandboxId}/settings`, {
      method: 'PATCH',
      headers: asJson(superCookie),
      body: JSON.stringify({ planLocked: false }),
    });
  });

  it('refuses an empty ask, and never reaches another organisation’s sandbox', async () => {
    const empty = await propose(superCookie, '');
    expect(empty.status).toBe(400);

    const ownerSuper = await session((await makeUser('t364-oona', (await db.select().from(s.organisations).where(eq(s.organisations.name, 't364 owner')))[0]!.id, true)).email);
    // the owner-super holds no grant on the consultancy's own sandbox (ADR-0036)
    const acrossTheWall = await propose(ownerSuper, 'show me their structure');
    expect(acrossTheWall.status).toBe(404);
  });
});
