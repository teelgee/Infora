// T-424 acceptance at the boundary — the standard becomes proposed rules, and
// nothing binds.
//
// *In plain terms: the client's senior person uploads a writing standard (or
// starts from nothing), Infora reads it and hands back a list of rules. This
// checks that the list carries the client's own wording where it came from
// their document, that Infora's own additions are marked as Infora's, that a
// document yielding nothing SAYS so, and that none of it is stored until
// somebody saves it.*
import { beforeAll, describe, expect, it } from 'vitest';
import type { ExtractionReport, ProposedRule, StyleGuideRecord } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { eq } from 'drizzle-orm';
import { buildApp } from './app';
import { fakeRouter } from './test-router';
import { docx } from './test-docx';

const { db } = createDb();
const stamp = Date.now();
const password = 'pw-t424';

const GUIDE = [
  '4.2 Terminology',
  'Refer to the works as the scheme throughout; never as the project.',
  '',
  '9 Voice',
  'Write in the active voice, and avoid contractions.',
].join('\n');

/**
 * The extraction answer, keyed off the clause markers the prompt really built.
 * It deliberately includes a rule naming a clause that does not exist, so the
 * admission rules are exercised end to end rather than only in the unit suite.
 */
const EXTRACTION = JSON.stringify({
  rules: [
    {
      clause: 'C1',
      kind: 'term',
      statement: 'Use “scheme”, not “project”.',
      scope: 'sentence',
      register: 'all',
      enforcement: 'raises_findings',
      excepted_contexts: ['quotations'],
      excepted_terms: ['the Project Board'],
      topic: null,
      payload: { preferred: 'scheme', replaces: ['project'] },
    },
    {
      clause: 'C2',
      kind: 'judgement',
      statement: 'Write in the active voice.',
      scope: 'sentence',
      register: 'all',
      enforcement: 'raises_findings',
      excepted_contexts: [],
      excepted_terms: [],
      topic: 'active-voice',
      payload: {},
    },
    { clause: 'C42', kind: 'term', statement: 'Invented.', scope: 'sentence', register: 'all' },
  ],
});

const app = buildApp({
  db,
  sessionSecret: 'test-secret',
  router: fakeRouter((system) =>
    system.includes('restructuring a written style guide') ? EXTRACTION : '{}',
  ),
});

let projectId: string;
let superCookie: string;
let plainOwnerCookie: string;
let consultantCookie: string;
let guideId: string;
let emptyGuideId: string;

async function person(name: string, organisationId: string, elevated: boolean) {
  const email = `${name}-${stamp}@test.local`;
  const [user] = await db.insert(s.users).values({ name, email, organisationId }).returning();
  await db
    .insert(s.userCredentials)
    .values({ userId: user!.id, passwordHash: hashPassword(password) });
  await db.insert(s.participants).values({ userId: user!.id, projectId, elevated });
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

const extract = (
  cookie: string,
  styleGuideId: string,
  body: Record<string, unknown> = {
    registers: ['technical'],
    fillGaps: true,
    defaultSeverity: 'required',
  },
) =>
  app.request(`/projects/${projectId}/style-guides/${styleGuideId}/rule-sets/extraction`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  const [owner] = await db.insert(s.organisations).values({ name: `t424 owner ${stamp}` }).returning();
  const [consultancy] = await db
    .insert(s.organisations)
    .values({ name: `t424 consultancy ${stamp}` })
    .returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t424 project ${stamp}`, ownerOrganisationId: owner!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId: owner!.id, projectId, role: 'owner' });
  await db
    .insert(s.memberships)
    .values({ organisationId: consultancy!.id, projectId, role: 'member' });
  superCookie = await person('t424-super', owner!.id, true);
  plainOwnerCookie = await person('t424-owner-plain', owner!.id, false);
  consultantCookie = await person('t424-consultant', consultancy!.id, false);

  const form = new FormData();
  form.append('file', new File([new Uint8Array(docx(GUIDE.split('\n')))], 'standard.docx'));
  form.append('title', `t424 standard ${stamp}`);
  const loaded = await app.request(`/projects/${projectId}/style-guides`, {
    method: 'POST',
    headers: { cookie: superCookie },
    body: form,
  });
  guideId = ((await loaded.json()) as StyleGuideRecord).id;
});

describe('T-424 — the upload is optional, and an empty start is a real thing', () => {
  it('creates a guide from a name alone, with no clauses and an honest format', async () => {
    const form = new FormData();
    form.append('title', `t424 from nothing ${stamp}`);
    const res = await app.request(`/projects/${projectId}/style-guides`, {
      method: 'POST',
      headers: { cookie: superCookie },
      body: form,
    });
    expect(res.status).toBe(201);
    const record = (await res.json()) as StyleGuideRecord;
    emptyGuideId = record.id;
    expect(record.clauses).toBe(0);
    expect(record.sourceFormat).toBe('none');
  });

  it('still refuses a request that names nothing at all', async () => {
    const res = await app.request(`/projects/${projectId}/style-guides`, {
      method: 'POST',
      headers: { cookie: superCookie },
      body: new FormData(),
    });
    expect(res.status).toBe(400);
  });
});

describe('T-424 — extraction reports how many rules can quote the client’s guide', () => {
  it('returns the extracted rules with the client’s own wording beside each', async () => {
    const res = await extract(superCookie, guideId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rules: ProposedRule[]; report: ExtractionReport };
    const extracted = body.rules.filter((rule) => rule.origin === 'extracted');
    expect(extracted).toHaveLength(2);
    // 🔒 BYTE FOR BYTE against the clause we stored — the assertion the whole
    // clause store survived this design for (ADR-0048 §5, ADR-0054 decision 3)
    const stored = await db
      .select({ clause: s.projectStyleGuideClauses.clause, content: s.projectStyleGuideClauses.content })
      .from(s.projectStyleGuideClauses)
      .where(eq(s.projectStyleGuideClauses.styleGuideId, guideId))
      .orderBy(s.projectStyleGuideClauses.ordinal);
    expect(extracted[0]!.clauseWording).toBe(stored[0]!.content);
    expect(extracted[0]!.clauseWording).not.toBe(extracted[0]!.statement);
    expect(extracted[0]!.clause).toBe('4.2');
    // the honest number, the way T-308's loader reports quotable clauses
    expect(body.report.clausesRead).toBe(2);
    expect(body.report.withWording).toBe(2);
    expect(body.report.nothingExtracted).toBeNull();
  });

  it('adds Infora’s own rules where the guide is silent, marked as Infora’s', async () => {
    const body = (await (await extract(superCookie, guideId)).json()) as {
      rules: ProposedRule[];
      report: ExtractionReport;
    };
    const own = body.rules.filter((rule) => rule.origin === 'infora_proposed');
    expect(own.length).toBeGreaterThan(0);
    expect(body.report.gapFilled).toBe(own.length);
    for (const rule of own) expect(rule.clauseWording).toBeUndefined();
    // the guide DID cover the active voice, so Infora does not propose it again
    expect(own.map((rule) => rule.statement)).not.toContain(
      'Write in the active voice where the meaning allows it.',
    );
  });

  it('proposes nothing of its own when the client unticks gap-filling', async () => {
    const body = (await (
      await extract(superCookie, guideId, {
        registers: ['technical'],
        fillGaps: false,
        defaultSeverity: 'required',
      })
    ).json()) as { rules: ProposedRule[]; report: ExtractionReport };
    expect(body.report.gapFilled).toBe(0);
    expect(body.rules.every((rule) => rule.origin === 'extracted')).toBe(true);
  });

  it('says a document yielded nothing rather than producing a set that looks configured', async () => {
    // no clauses AND no gap-filling: an empty answer, and the report says why
    const body = (await (
      await extract(superCookie, emptyGuideId, {
        registers: ['technical'],
        fillGaps: false,
        defaultSeverity: 'required',
      })
    ).json()) as { rules: ProposedRule[]; report: ExtractionReport };
    expect(body.rules).toHaveLength(0);
    expect(body.report.nothingExtracted).toContain('no clauses');
  });
});

describe('T-424 — extraction stores nothing, and the tier is T-397’s', () => {
  it('writes no rule and no version — the review step sits between, always', async () => {
    await extract(superCookie, guideId);
    const versions = await db
      .select({ id: s.projectStyleGuideRuleSets.id })
      .from(s.projectStyleGuideRuleSets)
      .where(eq(s.projectStyleGuideRuleSets.styleGuideId, guideId));
    expect(versions).toHaveLength(0);
  });

  it('answers a member organisation as nonexistence', async () => {
    expect((await extract(consultantCookie, guideId)).status).toBe(404);
  });

  it('tells the owner’s own non-elevated person what tier they need', async () => {
    const res = await extract(plainOwnerCookie, guideId);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ detail: 'super_user_required' });
  });

  it('reads another project’s guide as absent', async () => {
    const [org] = await db.insert(s.organisations).values({ name: `t424 far ${stamp}` }).returning();
    const [far] = await db
      .insert(s.projects)
      .values({ name: `t424 far project ${stamp}`, ownerOrganisationId: org!.id })
      .returning();
    const [guide] = await db
      .insert(s.projectStyleGuides)
      .values({
        projectId: far!.id,
        title: 'elsewhere',
        sourceFormat: 'docx',
        loadedByUserId: (
          await db.select({ id: s.users.id }).from(s.users).limit(1)
        )[0]!.id,
      })
      .returning();
    expect((await extract(superCookie, guide!.id)).status).toBe(404);
  });
});
