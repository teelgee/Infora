// T-365 (S7, ADR-0040 addendum 2026-08-09) acceptance — the plan-locked mode:
// the tree derives from the owning org's own plan rows; folders appear as rows
// are created (batch import in batch), rename as the row retitles, and are
// kept badged when the row is withdrawn; the derived levels are system-owned
// (no hand create/move, no builder), while allowMemberFolderCreate still
// governs INSIDE a deliverable's working folder — the two settings compose.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PlanRow, Sandbox, SandboxFolder } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';
import { buildXlsx } from './xlsx';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t365';
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

const listFolders = async (): Promise<SandboxFolder[]> =>
  ((await (
    await app.request(`/sandboxes/${sandboxId}/folders`, { headers: { cookie: superCookie } })
  ).json()) as { items: SandboxFolder[] }).items;

beforeAll(async () => {
  const [oA] = await db.insert(s.organisations).values({ name: 't365 owner' }).returning();
  const [oB] = await db.insert(s.organisations).values({ name: 't365 consult' }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't365 project', ownerOrganisationId: oA!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: oA!.id, projectId, role: 'owner' },
    { organisationId: oB!.id, projectId, role: 'member' },
  ]);
  const ownerSuper = await makeUser('t365-oona', oA!.id, true);
  const superUser = await makeUser('t365-sana', oB!.id, true);
  const memberUser = await makeUser('t365-mona', oB!.id);
  const ownerCookie = await session(ownerSuper.user.email);
  superCookie = await session(superUser.user.email);
  memberCookie = await session(memberUser.user.email);

  // a two-field scheme so the import can compose references from Discipline alone
  await app.request(`/projects/${projectId}/naming-scheme`, {
    method: 'PUT',
    headers: asJson(ownerCookie),
    body: JSON.stringify({
      separator: '-',
      fields: [
        { key: 'discipline', label: 'Discipline', inCode: true, allowedValues: ['GEO', 'ENV'] },
        { key: 'serial', label: 'Serial', inCode: true, isSerial: true, width: 3 },
      ],
    }),
  });

  // a single_org sandbox owned by the consultancy, with a member-visible grant
  const created = await app.request(`/projects/${projectId}/sandboxes`, {
    method: 'POST',
    headers: asJson(superCookie),
    body: JSON.stringify({ name: 't365 working area', scope: 'single_org' }),
  });
  sandboxId = ((await created.json()) as Sandbox).id;

  // one plan row exists BEFORE the mode turns on — the toggle derives it
  await app.request(`/projects/${projectId}/plan`, {
    method: 'POST',
    headers: asJson(superCookie),
    body: JSON.stringify({
      documentReference: `T365-A-${stamp}`,
      title: 'Ground model',
      metadata: { discipline: 'GEO' },
    }),
  });
});

afterAll(async () => {
  await pool.end();
});

describe('plan-locked derivation (T-365)', () => {
  it('turning the mode on derives discipline → deliverable folders from the rows as they stand', async () => {
    const res = await app.request(`/sandboxes/${sandboxId}/settings`, {
      method: 'PATCH',
      headers: asJson(superCookie),
      body: JSON.stringify({ planLocked: true }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Sandbox).planLocked).toBe(true);

    const folders = await listFolders();
    const discipline = folders.find((f) => f.kind === 'discipline' && f.name === 'GEO');
    expect(discipline).toBeDefined();
    const working = folders.find((f) => f.kind === 'deliverable');
    expect(working?.name).toBe(`T365-A-${stamp} — Ground model`);
    expect(working?.parentFolderId).toBe(discipline!.id);
    expect(working?.containerId).toBeTruthy();
  });

  it('folders appear as rows are created — the batch import creates its folders in batch', async () => {
    const form = new FormData();
    const bytes = buildXlsx([
      {
        name: 'Deliverables',
        rows: [
          ['Title', 'Reference', 'Discipline'],
          ['Ecology chapter', '', 'ENV'],
          ['Noise chapter', '', 'ENV'],
        ],
      },
    ]);
    form.append('file', new File([new Uint8Array(bytes)], 'plan.xlsx'));
    const imported = await app.request(`/projects/${projectId}/plan/import`, {
      method: 'POST',
      headers: { cookie: superCookie },
      body: form,
    });
    expect(imported.status).toBe(201);

    const folders = await listFolders();
    expect(folders.filter((f) => f.kind === 'deliverable')).toHaveLength(3);
    expect(folders.filter((f) => f.kind === 'discipline').map((f) => f.name).sort()).toEqual([
      'ENV',
      'GEO',
    ]);
  });

  it('a retitle renames the working folder; a withdrawal keeps it', async () => {
    const plan = (await (
      await app.request(`/projects/${projectId}/plan`, { headers: { cookie: superCookie } })
    ).json()) as { items: PlanRow[] };
    const row = plan.items.find((r) => r.documentReference === `T365-A-${stamp}`)!;

    await app.request(`/containers/${row.containerId}/title`, {
      method: 'PATCH',
      headers: asJson(superCookie),
      body: JSON.stringify({ title: 'Ground model — final' }),
    });
    let folders = await listFolders();
    const renamed = folders.find((f) => f.containerId === row.containerId);
    expect(renamed?.name).toBe(`T365-A-${stamp} — Ground model — final`);

    const withdrawn = await app.request(`/containers/${row.containerId}/withdrawal`, {
      method: 'POST',
      headers: asJson(superCookie),
      body: JSON.stringify({ reason: 'descoped' }),
    });
    expect(withdrawn.status).toBe(200);
    folders = await listFolders();
    // kept, never deleted — the badge is the surface's job
    expect(folders.some((f) => f.containerId === row.containerId)).toBe(true);
  });

  it('the derived levels are system-owned: no hand folders at root or in a discipline folder, no builder, no moving a system folder', async () => {
    const folders = await listFolders();
    const discipline = folders.find((f) => f.kind === 'discipline' && f.name === 'GEO')!;
    const working = folders.find((f) => f.kind === 'deliverable')!;

    // even the super user cannot hand-create at the system-owned levels
    const atRoot = await app.request(`/sandboxes/${sandboxId}/folders`, {
      method: 'POST',
      headers: asJson(superCookie),
      body: JSON.stringify({ name: 'freehand' }),
    });
    expect(atRoot.status).toBe(403);
    expect(((await atRoot.json()) as { detail: string }).detail).toBe('plan_locked_structure');
    const inDiscipline = await app.request(`/sandboxes/${sandboxId}/folders`, {
      method: 'POST',
      headers: asJson(superCookie),
      body: JSON.stringify({ name: 'freehand', parentFolderId: discipline.id }),
    });
    expect(inDiscipline.status).toBe(403);

    const builder = await app.request(`/sandboxes/${sandboxId}/folder-structure`, {
      method: 'POST',
      headers: asJson(superCookie),
      body: JSON.stringify({ nodes: [{ name: 'X' }] }),
    });
    expect(builder.status).toBe(409);
    expect(((await builder.json()) as { detail: string }).detail).toBe('plan_locked');

    const moveSystem = await app.request(`/folders/${working.id}/move`, {
      method: 'POST',
      headers: asJson(superCookie),
      body: JSON.stringify({ parentFolderId: null }),
    });
    expect(moveSystem.status).toBe(403);
    expect(((await moveSystem.json()) as { detail: string }).detail).toBe('system_folder');
  });

  it('inside a deliverable folder the member toggle composes: allowed while on, member-refused when off, super still allowed', async () => {
    const folders = await listFolders();
    const working = folders.find((f) => f.kind === 'deliverable')!;

    const memberInside = await app.request(`/sandboxes/${sandboxId}/folders`, {
      method: 'POST',
      headers: asJson(memberCookie),
      body: JSON.stringify({ name: 'drafts', parentFolderId: working.id }),
    });
    expect(memberInside.status).toBe(201);
    expect(((await memberInside.json()) as SandboxFolder).kind).toBe('manual');

    // switch member creation off — the compose: plan_locked stays, members lose the inside too
    await app.request(`/sandboxes/${sandboxId}/settings`, {
      method: 'PATCH',
      headers: asJson(superCookie),
      body: JSON.stringify({ allowMemberFolderCreate: false }),
    });
    const memberRefused = await app.request(`/sandboxes/${sandboxId}/folders`, {
      method: 'POST',
      headers: asJson(memberCookie),
      body: JSON.stringify({ name: 'more drafts', parentFolderId: working.id }),
    });
    expect(memberRefused.status).toBe(403);
    expect(((await memberRefused.json()) as { detail: string }).detail).toBe(
      'member_folder_create_disabled',
    );
    const superInside = await app.request(`/sandboxes/${sandboxId}/folders`, {
      method: 'POST',
      headers: asJson(superCookie),
      body: JSON.stringify({ name: 'qa pack', parentFolderId: working.id }),
    });
    expect(superInside.status).toBe(201);
  });

  it('the sync is idempotent: repeated toggling derives nothing twice', async () => {
    const before = (await listFolders()).length;
    await app.request(`/sandboxes/${sandboxId}/settings`, {
      method: 'PATCH',
      headers: asJson(superCookie),
      body: JSON.stringify({ planLocked: false }),
    });
    // turning off deletes nothing
    expect((await listFolders()).length).toBe(before);
    await app.request(`/sandboxes/${sandboxId}/settings`, {
      method: 'PATCH',
      headers: asJson(superCookie),
      body: JSON.stringify({ planLocked: true }),
    });
    expect((await listFolders()).length).toBe(before);
  });
});
