// T-152 acceptance, against the live dev database: the owner defines the
// project-wide scheme; a producer self-generates compliant references with a
// per-org serial; propose-then-fold; the wall (a member cannot edit the scheme
// or resolve a proposal). ADR-0008 homed.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  GenerateReferenceResponse,
  GetNamingSchemeResponse,
  GetReviewPeriodResponse,
  SchemaImportResponse,
} from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { composeReference, templateFields } from './naming';
import { fakeRouter } from './test-router';
import { parseXlsx } from './xlsx';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t152';
let projectId: string;
let ownerCookie: string;
let consultCookie: string;
let otherCookie: string;

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

const scheme = {
  separator: '-',
  fields: [
    { key: 'project', label: 'Project', allowedValues: ['WA'] },
    { key: 'originator', label: 'Originator', isOriginator: true, allowedValues: ['BB', 'CC'] },
    { key: 'discipline', label: 'Discipline', allowedValues: ['GEO', 'ENV'] },
    { key: 'serial', label: 'Serial', isSerial: true, width: 3 },
  ],
};

beforeAll(async () => {
  const [oA] = await db.insert(s.organisations).values({ name: 't152 owner' }).returning();
  const [oB] = await db.insert(s.organisations).values({ name: 't152 consult B' }).returning();
  const [oC] = await db.insert(s.organisations).values({ name: 't152 consult C' }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't152 project', ownerOrganisationId: oA!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: oA!.id, projectId, role: 'owner' },
    { organisationId: oB!.id, projectId, role: 'member' },
    { organisationId: oC!.id, projectId, role: 'member' },
  ]);
  ownerCookie = await session((await makeUser('t152-oona', oA!.id, true)).email); // owner super-user
  consultCookie = await session((await makeUser('t152-bree', oB!.id, true)).email); // guest super-user
  otherCookie = await session((await makeUser('t152-cara', oC!.id)).email);
});

afterAll(async () => {
  await pool.end();
});

const genReference = (cookie: string, values: Record<string, string>) =>
  app.request(`/projects/${projectId}/naming-scheme/references`, {
    method: 'POST',
    headers: asJson(cookie),
    body: JSON.stringify({ values }),
  });

describe('composeReference (pure)', () => {
  it('composes with a zero-padded serial and reports the series key', () => {
    const out = composeReference(scheme, { project: 'WA', originator: 'BB', discipline: 'GEO' }, 4);
    expect(out.reference).toBe('WA-BB-GEO-004');
    expect(out.seriesKey).toBe('WA-BB-GEO');
  });
  it('rejects a value outside the allowed set', () => {
    expect(() => composeReference(scheme, { project: 'WA', originator: 'ZZ', discipline: 'GEO' }, 1)).toThrow();
  });
  it('composes from code fields only, ignoring metadata and role fields (T-188)', () => {
    const mixed = {
      separator: '-',
      fields: [
        { key: 'project', label: 'Project', inCode: true },
        { key: 'purpose', label: 'Purpose', type: 'select' as const, inCode: false },
        { key: 'authors', label: 'Authors', type: 'people' as const, role: 'author' as const },
        { key: 'serial', label: 'Serial', type: 'serial' as const, isSerial: true, width: 3, inCode: true },
      ],
    };
    const out = composeReference(mixed, { project: 'WA', purpose: 'For review', authors: 'x' }, 5);
    expect(out.reference).toBe('WA-005'); // only the code fields (project + serial)
    expect(out.seriesKey).toBe('WA');
  });
});

describe('the deliverable schema default (T-188)', () => {
  it('serves the Infora default when the owner has not saved a scheme, carrying the role slots', async () => {
    // this project has no saved scheme yet (the PUT describe runs after)
    const res = await app.request(`/projects/${projectId}/naming-scheme`, { headers: asJson(ownerCookie) });
    const body = (await res.json()) as GetNamingSchemeResponse;
    // T-376 — this assertion is what makes GetNamingSchemeResponse non-nullable
    // true rather than merely declared. A project ALWAYS has a scheme; while the
    // type allowed null, the plan screen read null as "no scheme defined" and
    // offered to hand-type a reference, which is the one thing ADR-0008 forbids.
    expect(body).not.toBeNull();
    expect(body.fields.some((f) => f.role === 'document_owner')).toBe(true);
    expect(body.fields.some((f) => f.role === 'lead_reviewer')).toBe(true);
    // the codes carry human descriptions (T-197)
    const disc = body.fields.find((f) => f.key === 'discipline');
    expect(disc?.allowedValueLabels?.['ECV']).toBe('Engineering – Civils');
    // and a producer can generate a reference straight off the default
    const gen = await genReference(consultCookie, { project: '133735', originator: 'MWJ', zone: 'Z1', elr: 'OXD', type: 'DRG', discipline: 'ECV' });
    expect(gen.status).toBe(200);
    expect(((await gen.json()) as GenerateReferenceResponse).reference).toMatch(/^133735-MWJ-Z1-OXD-DRG-ECV-\d{6}$/);
  });
});

// T-371 (ADR-0005 addendum, 2026-08-22) — the review period's project-level
// default. Its own endpoints beside the scheme, never a field inside it.
describe('the review-period default (T-371)', () => {
  const read = (cookie: string) =>
    app.request(`/projects/${projectId}/review-period`, { headers: asJson(cookie) });
  const days = async (res: Response) => ((await res.json()) as GetReviewPeriodResponse).defaultDays;
  const write = (cookie: string, body: unknown) =>
    app.request(`/projects/${projectId}/review-period`, {
      method: 'PATCH',
      headers: asJson(cookie),
      body: JSON.stringify(body),
    });

  it('starts at ten working days without anyone setting it', async () => {
    const res = await read(ownerCookie);
    expect(res.status).toBe(200);
    expect(await days(res)).toBe(10);
  });

  it('is read by every participant — the status bar renders a date computed from it', async () => {
    for (const cookie of [consultCookie, otherCookie]) {
      const res = await read(cookie);
      expect(res.status).toBe(200);
      expect(await days(res)).toBe(10);
    }
  });

  it('is set by the owner super-user, and by nobody else', async () => {
    expect((await write(consultCookie, { defaultDays: 30 })).status).toBe(404); // guest super-user
    expect((await write(otherCookie, { defaultDays: 30 })).status).toBe(404); // ordinary participant
    const ok = await write(ownerCookie, { defaultDays: 15 });
    expect(ok.status).toBe(200);
    expect(await days(ok)).toBe(15);
    expect(await days(await read(consultCookie))).toBe(15);
  });

  it('refuses a period that is not a positive count of days', async () => {
    expect((await write(ownerCookie, { defaultDays: 0 })).status).toBe(400);
    expect((await write(ownerCookie, { defaultDays: -5 })).status).toBe(400);
    expect((await write(ownerCookie, { defaultDays: 2.5 })).status).toBe(400);
    // and the refused writes left the stored value alone
    expect(await days(await read(ownerCookie))).toBe(15);
    await write(ownerCookie, { defaultDays: 10 }); // back to the default for later suites
  });
});

describe('the naming scheme + code-builder API (T-152, ADR-0008)', () => {
  it('lets the owner define the scheme; a member cannot', async () => {
    const denied = await app.request(`/projects/${projectId}/naming-scheme`, {
      method: 'PUT',
      headers: asJson(consultCookie),
      body: JSON.stringify(scheme),
    });
    expect(denied.status).toBe(404); // the wall: deny reads as nonexistence

    const ok = await app.request(`/projects/${projectId}/naming-scheme`, {
      method: 'PUT',
      headers: asJson(ownerCookie),
      body: JSON.stringify(scheme),
    });
    expect(ok.status).toBe(200);
    const read = await app.request(`/projects/${projectId}/naming-scheme`, { headers: asJson(consultCookie) });
    const body = (await read.json()) as GetNamingSchemeResponse;
    expect(body?.fields.length).toBe(4);
  });

  it('self-generates references with a per-organisation serial; cross-org distinct on originator', async () => {
    const b1 = (await (await genReference(consultCookie, { project: 'WA', originator: 'BB', discipline: 'GEO' })).json()) as GenerateReferenceResponse;
    const b2 = (await (await genReference(consultCookie, { project: 'WA', originator: 'BB', discipline: 'GEO' })).json()) as GenerateReferenceResponse;
    const c1 = (await (await genReference(otherCookie, { project: 'WA', originator: 'CC', discipline: 'GEO' })).json()) as GenerateReferenceResponse;
    expect(b1.reference).toBe('WA-BB-GEO-001');
    expect(b2.reference).toBe('WA-BB-GEO-002'); // same org increments
    expect(c1.reference).toBe('WA-CC-GEO-001'); // other org's allocation is independent, still 001
  });

  it('rejects generating with a disallowed field value', async () => {
    const res = await genReference(consultCookie, { project: 'WA', originator: 'ZZ', discipline: 'GEO' });
    expect(res.status).toBe(400);
  });

  it('records a producer proposal the owner folds in; a member cannot resolve', async () => {
    const proposed = await app.request(`/projects/${projectId}/naming-scheme/proposals`, {
      method: 'POST',
      headers: asJson(consultCookie),
      body: JSON.stringify({ body: 'Add discipline DRN (drainage)' }),
    });
    const { id } = (await proposed.json()) as { id: string };

    const memberResolve = await app.request(`/naming-proposals/${id}/resolution`, {
      method: 'POST',
      headers: asJson(consultCookie),
      body: JSON.stringify({ status: 'accepted' }),
    });
    expect(memberResolve.status).toBe(404); // only the owner resolves

    const ownerResolve = await app.request(`/naming-proposals/${id}/resolution`, {
      method: 'POST',
      headers: asJson(ownerCookie),
      body: JSON.stringify({ status: 'accepted' }),
    });
    expect(ownerResolve.status).toBe(200);
    const list = await app.request(`/projects/${projectId}/naming-scheme/proposals`, { headers: asJson(ownerCookie) });
    const { items } = (await list.json()) as { items: Array<{ id: string; status: string }> };
    expect(items.find((p) => p.id === id)?.status).toBe('accepted');
  });
});

describe('the fillable plan template (T-358, S2)', () => {
  it('serves an .xlsx whose header row is the schema attribute fields — no reference, no serial, no roles', async () => {
    const res = await app.request(`/projects/${projectId}/naming-scheme/template`, {
      headers: { cookie: consultCookie },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('spreadsheetml');
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    const rows = parseXlsx(bytes)!;
    // this project saved the 4-field test scheme above: Title + its non-serial
    // code fields, and never the serial (numbering is generated at import, S3)
    // T-481 — and the one column outside the scheme, last
    expect(rows[0]).toEqual(['Title', 'Project', 'Originator', 'Discipline', 'Milestones']);
  });

  it('is a participant read, not a super-user act — but never crosses the wall', async () => {
    const member = await app.request(`/projects/${projectId}/naming-scheme/template`, {
      headers: { cookie: otherCookie },
    });
    expect(member.status).toBe(200);
    const outsider = await app.request(`/projects/${crypto.randomUUID()}/naming-scheme/template`, {
      headers: { cookie: otherCookie },
    });
    expect(outsider.status).toBe(404);
  });
});

describe('templateFields (pure, T-358)', () => {
  it('never leaks a serial, role or duplicate-title column, whichever way the field is flagged', () => {
    const fields = [
      { key: 'project', label: 'Project', inCode: true },
      { key: 'seq', label: 'Sequence', type: 'serial' as const }, // bare type, no isSerial flag
      { key: 'authors', label: 'Author(s)', role: 'author' as const, inCode: true }, // role forced inCode
      { key: 'title', label: 'Document title' }, // folds into the synthetic Title
      { key: 'suitability', label: 'Suitability' },
    ];
    const out = templateFields({ fields });
    expect(out.map((f) => f.key)).toEqual(['title', 'project', 'suitability']);
  });
});

// T-337 — schema import. The endpoint's own job is small: the tier, the
// refusal shape, and — the one that matters most — that it WRITES NOTHING.
describe('schema import (T-337)', () => {
  const importFile = async (cookie: string, name: string, bytes: Buffer) => {
    const form = new FormData();
    form.append('file', new File([new Uint8Array(bytes)], name));
    return app.request(`/projects/${projectId}/naming-scheme/import`, {
      method: 'POST',
      headers: { cookie },
      body: form,
    });
  };
  const codes = Buffer.from('Field,Code,Description\nDiscipline,ECV,Engineering – Civils\nDiscipline,EEN,Environmental\n');

  it('returns candidates and changes nothing', async () => {
    const before = await (
      await app.request(`/projects/${projectId}/naming-scheme`, { headers: { cookie: ownerCookie } })
    ).json();

    const res = await importFile(ownerCookie, 'codes.csv', codes);
    expect(res.status).toBe(200);
    const body = (await res.json()) as SchemaImportResponse;
    expect(body.fields[0]!.label).toBe('Discipline');
    expect(body.fields[0]!.allowedValues).toEqual(['ECV', 'EEN']);
    expect(body.skipped).toEqual([]);

    // the whole point of "candidate": an import that wrote the scheme by
    // arriving would let a mistyped upload rewrite a project's numbering, and
    // numbering is what every reference in the record is built on
    const after = await (
      await app.request(`/projects/${projectId}/naming-scheme`, { headers: { cookie: ownerCookie } })
    ).json();
    expect(after).toEqual(before);
  });

  it('is the scheme’s own tier — proposing numbering is the same act as saving it', async () => {
    // a member of a producing org cannot edit the scheme, so it cannot propose
    // one either; the answer is 404, never 403 (contracts principle 4)
    expect((await importFile(consultCookie, 'codes.csv', codes)).status).toBe(404);
    expect((await importFile(otherCookie, 'codes.csv', codes)).status).toBe(404);
  });

  it('refuses an unreadable sheet by name, with what it did find', async () => {
    const res = await importFile(ownerCookie, 'codes.csv', Buffer.from('Widget,Sprocket\na,b\n'));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { detail: string; hint?: string };
    expect(body.detail).toBe('no_recognisable_headers');
    expect(body.hint).toContain('Widget');
  });

  it('names the rows it skipped, so a person can go and look at them', async () => {
    const messy = Buffer.from('Code,Description\nECV,Engineering\n,orphan description\nbad code,spaces\n');
    const res = await importFile(ownerCookie, 'codes.csv', messy);
    const body = (await res.json()) as SchemaImportResponse;
    expect(body.fields[0]!.allowedValues).toEqual(['ECV']);
    expect(body.skipped.map((s) => s.row)).toEqual([3, 4]);
  });
});
