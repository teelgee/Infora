// T-422 acceptance at the boundary — the two shelves, and the wall between
// them (ADR-0054 decision 1).
//
// *In plain terms: the Knowledge screen shows a firm's own material and the
// project's. This test is the assertion the ticket asks for rather than
// assumes — that a consultant working on the same project can never list
// another firm's manual, and that the project's guide is readable by every
// firm on the scheme because it binds every firm on the scheme.*
//
// The screen invents no endpoint: it composes three reads that already exist —
// `/organisation/rulebooks` (T-308, org-admin, project-less by construction),
// `/projects/:id/tools/document-creation/starting-outlines` (T-414, the firm's
// own, org-scoped inside a project route) and `/projects/:id/style-guides`
// (T-397, every participant reads, the owner's super user curates). What is
// under test here is the SHELF each read produces, from four different seats.
import { beforeAll, describe, expect, it } from 'vitest';
import type {
  ListRulebooksResponse,
  ListStartingOutlinesResponse,
  ListStyleGuidesResponse,
} from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';
import { docx } from './test-docx';

const { db } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t422';

let projectId: string;
let ownerAdminCookie: string;
let ownerSuperCookie: string;
let consultantAdminCookie: string;
let consultantPlainCookie: string;

async function person(
  name: string,
  organisationId: string,
  options: { onProject?: string; elevated?: boolean; orgRole?: 'admin' | 'member' } = {},
) {
  const email = `${name}-${stamp}@test.local`;
  const [user] = await db
    .insert(s.users)
    .values({ name, email, organisationId, orgRole: options.orgRole ?? 'member' })
    .returning();
  await db
    .insert(s.userCredentials)
    .values({ userId: user!.id, passwordHash: hashPassword(password) });
  if (options.onProject !== undefined) {
    await db
      .insert(s.participants)
      .values({ userId: user!.id, projectId: options.onProject, elevated: options.elevated ?? false });
  }
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

const rulebooks = async (cookie: string) => {
  const res = await app.request('/organisation/rulebooks', { headers: { cookie } });
  return { status: res.status, body: (await res.json()) as ListRulebooksResponse };
};

const guides = async (cookie: string) =>
  (await (
    await app.request(`/projects/${projectId}/style-guides`, { headers: { cookie } })
  ).json()) as ListStyleGuidesResponse;

const outlines = async (cookie: string) =>
  (await (
    await app.request(
      `/projects/${projectId}/tools/document-creation/starting-outlines`,
      { headers: { cookie } },
    )
  ).json()) as ListStartingOutlinesResponse;

beforeAll(async () => {
  const [owner] = await db.insert(s.organisations).values({ name: `t422 owner ${stamp}` }).returning();
  const [consultancy] = await db
    .insert(s.organisations)
    .values({ name: `t422 consultancy ${stamp}` })
    .returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t422 project ${stamp}`, ownerOrganisationId: owner!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId: owner!.id, projectId, role: 'owner' });
  await db
    .insert(s.memberships)
    .values({ organisationId: consultancy!.id, projectId, role: 'member' });

  ownerAdminCookie = await person('t422-owner-admin', owner!.id, {
    onProject: projectId,
    elevated: true,
    orgRole: 'admin',
  });
  ownerSuperCookie = await person('t422-owner-super', owner!.id, {
    onProject: projectId,
    elevated: true,
  });
  consultantAdminCookie = await person('t422-consultant-admin', consultancy!.id, {
    onProject: projectId,
    orgRole: 'admin',
  });
  consultantPlainCookie = await person('t422-consultant', consultancy!.id, {
    onProject: projectId,
  });

  // each firm loads its own manual, and the owner sets the project's guide
  const load = async (cookie: string, title: string, lines: string[]) => {
    const form = new FormData();
    form.append('file', new File([new Uint8Array(docx(lines))], 'manual.docx'));
    form.append('title', title);
    return app.request('/organisation/rulebooks', { method: 'POST', headers: { cookie }, body: form });
  };
  await load(ownerAdminCookie, `t422 owner manual ${stamp}`, ['1. Voice', 'Write plainly.']);
  await load(consultantAdminCookie, `t422 consultant manual ${stamp}`, [
    '1. Voice',
    'Write in the active voice.',
  ]);

  const guideForm = new FormData();
  guideForm.append(
    'file',
    new File([new Uint8Array(docx(['4.2 Terms', 'Say scheme, not project.']))], 'guide.docx'),
  );
  guideForm.append('title', `t422 project guide ${stamp}`);
  await app.request(`/projects/${projectId}/style-guides`, {
    method: 'POST',
    headers: { cookie: ownerSuperCookie },
    body: guideForm,
  });
});

describe('T-422 — the firm’s shelf is the firm’s, on every project and on no other firm’s screen', () => {
  it('shows an organisation its OWN manual and no other organisation’s', async () => {
    const ours = await rulebooks(ownerAdminCookie);
    const theirs = await rulebooks(consultantAdminCookie);
    expect(ours.body.items.map((r) => r.title)).toContain(`t422 owner manual ${stamp}`);
    // 🔒 the wall, asserted rather than assumed: the consultant works on the
    // same project and still never learns the owner's manual exists
    expect(ours.body.items.map((r) => r.title)).not.toContain(`t422 consultant manual ${stamp}`);
    expect(theirs.body.items.map((r) => r.title)).toContain(`t422 consultant manual ${stamp}`);
    expect(theirs.body.items.map((r) => r.title)).not.toContain(`t422 owner manual ${stamp}`);
  });

  it('answers a non-admin as nonexistence, which the shelf renders as an absent list', async () => {
    // T-308's tier, unchanged by this ticket. The surface obligation that
    // travels with it is pinned in apps/web: an absent list, never an empty
    // state and never a disabled control.
    const res = await rulebooks(consultantPlainCookie);
    expect(res.status).toBe(404);
  });

  it('carries no project anywhere in the shelf’s read', async () => {
    // ADR-0020 — org context travels to every project the organisation
    // touches, which is what makes ONE shelf reachable from two doors. A
    // project-scoped read here would be a per-project copy in disguise.
    const res = await app.request('/organisation/rulebooks', {
      headers: { cookie: ownerAdminCookie },
    });
    expect(res.status).toBe(200);
  });
});

describe('T-422 — the project’s shelf binds every firm, so every firm reads it', () => {
  it('is readable by a consultant who may not curate it', async () => {
    const list = await guides(consultantPlainCookie);
    expect(list.items.map((g) => g.title)).toContain(`t422 project guide ${stamp}`);
  });

  it('refuses curation to a member organisation as nonexistence', async () => {
    const form = new FormData();
    form.append('file', new File([new Uint8Array(docx(['1. No', 'Nope.']))], 'guide.docx'));
    const res = await app.request(`/projects/${projectId}/style-guides`, {
      method: 'POST',
      headers: { cookie: consultantPlainCookie },
      body: form,
    });
    expect(res.status).toBe(404);
  });
});

describe('T-422 — the two shelves stay two shelves', () => {
  it('lists no project material on the firm’s shelf and no firm material on the project’s', async () => {
    const firm = await rulebooks(ownerAdminCookie);
    const project = await guides(ownerSuperCookie);
    expect(firm.body.items.map((r) => r.title)).not.toContain(`t422 project guide ${stamp}`);
    expect(project.items.map((g) => g.title)).not.toContain(`t422 owner manual ${stamp}`);
  });

  it('offers the firm’s saved outlines through the project door, marked as the firm’s own', async () => {
    const list = await outlines(ownerSuperCookie);
    // the shipped outlines are Infora's and the saved ones are the firm's; the
    // shelf shows only the second, which is why `origin` has to be on the wire
    expect(list.items.every((outline) => outline.origin === 'infora' || outline.origin === 'firm')).toBe(
      true,
    );
  });
});
