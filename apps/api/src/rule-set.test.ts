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
import type {
  ExtractionReport,
  GetRuleSetResponse,
  ListRuleProposalsResponse,
  ProposedRule,
  RuleProposal,
  StyleGuideRecord,
} from '@infora/contracts';
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
        // scoped to a row THIS suite made (review, 2026-09-02): an unscoped
        // whole-table limit(1) is the shape that produced the findings-suite
        // flake fixed in this very slice
        loadedByUserId: (
          await db
            .select({ id: s.projectStyleGuides.loadedByUserId })
            .from(s.projectStyleGuides)
            .where(eq(s.projectStyleGuides.id, guideId))
        )[0]!.id,
      })
      .returning();
    expect((await extract(superCookie, guide!.id)).status).toBe(404);
  });
});

// ── T-425 — the review screen's other half: the save, which is what binds ────
describe('T-425 — saving produces a version, and nothing binds before it', () => {
  it('has no current set at all until somebody saves one', async () => {
    const res = await app.request(
      `/projects/${projectId}/style-guides/${emptyGuideId}/rule-sets/current`,
      { headers: { cookie: superCookie } },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ set: null });
  });

  it('saves the reviewed list as version 1, attributed to the person who saved it', async () => {
    const extracted = (await (await extract(superCookie, guideId)).json()) as {
      rules: ProposedRule[];
    };
    const res = await app.request(`/projects/${projectId}/style-guides/${guideId}/rule-sets`, {
      method: 'POST',
      headers: { cookie: superCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ rules: extracted.rules }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as GetRuleSetResponse;
    expect(body.set!.version).toBe(1);
    expect(body.set!.acceptedBy.name).toBe('t424-super');
    expect(body.set!.rules).toHaveLength(extracted.rules.length);
  });

  it('renders an extracted rule beside its source wording and a typed rule with none', async () => {
    const current = (await (
      await app.request(`/projects/${projectId}/style-guides/${guideId}/rule-sets/current`, {
        headers: { cookie: superCookie },
      })
    ).json()) as GetRuleSetResponse;
    const extracted = current.set!.rules.find((rule) => rule.origin === 'extracted')!;
    const proposed = current.set!.rules.find((rule) => rule.origin === 'infora_proposed')!;
    expect(extracted.clauseWording).toBeDefined();
    // 🔒 the typed/Infora-proposed rule does NOT fake one — an invented
    // quotation is worse than an absent one (decision 3)
    expect(proposed.clauseWording).toBeUndefined();
    expect(proposed.clauseId).toBeUndefined();
  });

  it('makes an amendment a NEW version, leaving the first standing', async () => {
    const before = (await (
      await app.request(`/projects/${projectId}/style-guides/${guideId}/rule-sets/current`, {
        headers: { cookie: superCookie },
      })
    ).json()) as GetRuleSetResponse;
    const res = await app.request(`/projects/${projectId}/style-guides/${guideId}/rule-sets`, {
      method: 'POST',
      headers: { cookie: superCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        rules: [
          {
            kind: 'judgement',
            origin: 'typed',
            statement: 'Never promise a programme date.',
            scope: 'sentence',
            exceptedContexts: [],
            exceptedTerms: [],
            register: 'all',
            enforcement: 'raises_findings',
            severity: 'required',
            payload: {},
          },
        ],
      }),
    });
    const after = (await res.json()) as GetRuleSetResponse;
    expect(after.set!.version).toBe(before.set!.version + 1);
    const rows = await db
      .select({ id: s.projectStyleGuideRuleSets.id })
      .from(s.projectStyleGuideRuleSets)
      .where(eq(s.projectStyleGuideRuleSets.styleGuideId, guideId));
    expect(rows.length).toBe(after.set!.version);
  });

  it('refuses a rule pointing at another guide’s clause rather than repairing it', async () => {
    // a clause from THIS suite's other guide — foreign to emptyGuideId, and
    // scoped rather than an arbitrary whole-table row (review, 2026-09-02)
    const [foreign] = await db
      .select({ id: s.projectStyleGuideClauses.id })
      .from(s.projectStyleGuideClauses)
      .where(eq(s.projectStyleGuideClauses.styleGuideId, guideId))
      .limit(1);
    const res = await app.request(`/projects/${projectId}/style-guides/${emptyGuideId}/rule-sets`, {
      method: 'POST',
      headers: { cookie: superCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        rules: [
          {
            kind: 'term',
            origin: 'extracted',
            clauseId: foreign!.id,
            statement: 'Borrowed.',
            scope: 'sentence',
            exceptedContexts: [],
            exceptedTerms: [],
            register: 'all',
            enforcement: 'raises_findings',
            severity: 'required',
            payload: {},
          },
        ],
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe('T-425 — reading binds nobody, so everybody may do it', () => {
  it('lets a consultant read the set that binds them', async () => {
    const res = await app.request(
      `/projects/${projectId}/style-guides/${guideId}/rule-sets/current`,
      { headers: { cookie: consultantCookie } },
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as GetRuleSetResponse).set!.rules.length).toBeGreaterThan(0);
  });

  it('refuses the SAVE to a consultant as nonexistence', async () => {
    const res = await app.request(`/projects/${projectId}/style-guides/${guideId}/rule-sets`, {
      method: 'POST',
      headers: { cookie: consultantCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ rules: [] }),
    });
    expect(res.status).toBe(404);
  });

  it('tells the owner’s own non-elevated person what tier the save needs', async () => {
    const res = await app.request(`/projects/${projectId}/style-guides/${guideId}/rule-sets`, {
      method: 'POST',
      headers: { cookie: plainOwnerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ rules: [] }),
    });
    expect(res.status).toBe(403);
  });
});

// ── T-426 — anyone proposes; the super user decides ─────────────────────────
//
// 🔒 **The assertion this ticket exists for, in BOTH directions.** A rival firm
// on the same project must never learn that a competitor is arguing about a
// rule — that is the ethical-wall breach nobody thinks of as crossing the wall
// (ADR-0048 §6's precedent) — and the three parties who may see it must
// actually see it, or the design is a wall with a hole where the decision goes.
describe('T-426 — a proposal is visible to three parties and no others', () => {
  let proposalId: string;
  let rivalCookie: string;
  let colleagueCookie: string;

  const proposals = async (cookie: string) =>
    (await (
      await app.request(
        `/projects/${projectId}/style-guides/${guideId}/rule-sets/proposals`,
        { headers: { cookie } },
      )
    ).json()) as ListRuleProposalsResponse;

  beforeAll(async () => {
    // a second consultancy on the same project — the rival
    const [rival] = await db.insert(s.organisations).values({ name: `t426 rival ${stamp}` }).returning();
    await db.insert(s.memberships).values({ organisationId: rival!.id, projectId, role: 'member' });
    rivalCookie = await person('t426-rival', rival!.id, false);

    // and a colleague of the proposer, in the proposer's own organisation
    const [proposerUser] = await db
      .select({ organisationId: s.users.organisationId })
      .from(s.users)
      .where(eq(s.users.email, `t424-consultant-${stamp}@test.local`));
    colleagueCookie = await person('t426-colleague', proposerUser!.organisationId, false);

    const res = await app.request(
      `/projects/${projectId}/style-guides/${guideId}/rule-sets/proposals`,
      {
        method: 'POST',
        headers: { cookie: consultantCookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          rule: {
            kind: 'judgement',
            origin: 'typed',
            statement: 'This rule fires on every quoted document title.',
            scope: 'sentence',
            exceptedContexts: [],
            exceptedTerms: [],
            register: 'all',
            enforcement: 'raises_findings',
            severity: 'advisory',
            payload: {},
          },
        }),
      },
    );
    expect(res.status).toBe(201);
    proposalId = ((await res.json()) as RuleProposal).id;
  });

  it('a rival firm on the same project sees NOTHING — absent, not refused', async () => {
    const listed = await proposals(rivalCookie);
    // 200, because a rival may legitimately have proposals of its own; the
    // competitor's is simply not in the result
    expect(listed.items.map((item) => item.id)).not.toContain(proposalId);
    expect(listed.mayDecide).toBeUndefined();
  });

  it('and cannot decide it — the decision route reads as nonexistence', async () => {
    const res = await app.request(
      `/projects/${projectId}/style-guides/${guideId}/rule-sets/proposals/${proposalId}/decision`,
      {
        method: 'POST',
        headers: { cookie: rivalCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'accept' }),
      },
    );
    expect(res.status).toBe(404);
  });

  it('the author sees their own', async () => {
    expect((await proposals(consultantCookie)).items.map((item) => item.id)).toContain(proposalId);
  });

  it('the author’s own organisation sees it', async () => {
    expect((await proposals(colleagueCookie)).items.map((item) => item.id)).toContain(proposalId);
  });

  it('the owner organisation sees it, and is the only party offered the decision', async () => {
    const listed = await proposals(superCookie);
    expect(listed.items.map((item) => item.id)).toContain(proposalId);
    expect(listed.mayDecide).toBe(true);
    // assembled, not filtered, at a button: absent for anyone who may not act
    expect((await proposals(consultantCookie)).mayDecide).toBeUndefined();
    expect((await proposals(plainOwnerCookie)).mayDecide).toBeUndefined();
  });

  it('accepting produces a new version, with the proposed rule in it', async () => {
    const before = (await (
      await app.request(`/projects/${projectId}/style-guides/${guideId}/rule-sets/current`, {
        headers: { cookie: superCookie },
      })
    ).json()) as GetRuleSetResponse;
    const res = await app.request(
      `/projects/${projectId}/style-guides/${guideId}/rule-sets/proposals/${proposalId}/decision`,
      {
        method: 'POST',
        headers: { cookie: superCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'accept' }),
      },
    );
    expect(res.status).toBe(200);
    const decided = (await res.json()) as RuleProposal;
    expect(decided.state).toBe('accepted');
    expect(decided.decidedBy!.name).toBe('t424-super');
    const after = (await (
      await app.request(`/projects/${projectId}/style-guides/${guideId}/rule-sets/current`, {
        headers: { cookie: superCookie },
      })
    ).json()) as GetRuleSetResponse;
    expect(after.set!.version).toBe(before.set!.version + 1);
    expect(after.set!.rules.map((rule) => rule.statement)).toContain(
      'This rule fires on every quoted document title.',
    );
  });

  it('declining records no reason — there is no field for one', async () => {
    const made = await app.request(
      `/projects/${projectId}/style-guides/${guideId}/rule-sets/proposals`,
      {
        method: 'POST',
        headers: { cookie: consultantCookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          rule: {
            kind: 'term',
            origin: 'typed',
            statement: 'Say works, not scheme.',
            scope: 'sentence',
            exceptedContexts: [],
            exceptedTerms: [],
            register: 'all',
            enforcement: 'raises_findings',
            severity: 'advisory',
            payload: {},
          },
        }),
      },
    );
    const id = ((await made.json()) as RuleProposal).id;
    const before = (await (
      await app.request(`/projects/${projectId}/style-guides/${guideId}/rule-sets/current`, {
        headers: { cookie: superCookie },
      })
    ).json()) as GetRuleSetResponse;
    const res = await app.request(
      `/projects/${projectId}/style-guides/${guideId}/rule-sets/proposals/${id}/decision`,
      {
        method: 'POST',
        headers: { cookie: superCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'decline', reason: 'not persuaded' }),
      },
    );
    const declined = (await res.json()) as RuleProposal;
    expect(declined.state).toBe('declined');
    expect(Object.keys(declined)).not.toContain('reason');
    // and declining changes nothing that binds anybody
    const after = (await (
      await app.request(`/projects/${projectId}/style-guides/${guideId}/rule-sets/current`, {
        headers: { cookie: superCookie },
      })
    ).json()) as GetRuleSetResponse;
    expect(after.set!.version).toBe(before.set!.version);
  });

  it('a proposal that has been decided cannot be decided again', async () => {
    const res = await app.request(
      `/projects/${projectId}/style-guides/${guideId}/rule-sets/proposals/${proposalId}/decision`,
      {
        method: 'POST',
        headers: { cookie: superCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'decline' }),
      },
    );
    expect(res.status).toBe(404);
  });

  it('refuses a proposal against a guide with no accepted rules — nothing to amend', async () => {
    const res = await app.request(
      `/projects/${projectId}/style-guides/${emptyGuideId}/rule-sets/proposals`,
      {
        method: 'POST',
        headers: { cookie: consultantCookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          rule: {
            kind: 'term',
            origin: 'typed',
            statement: 'Anything.',
            scope: 'sentence',
            exceptedContexts: [],
            exceptedTerms: [],
            register: 'all',
            enforcement: 'raises_findings',
            severity: 'advisory',
            payload: {},
          },
        }),
      },
    );
    expect(res.status).toBe(400);
  });
});

// ── T-429 — the compiled brief (ADR-0054 decision 6) ────────────────────────
describe('T-429 — the brief is compiled at save, and the same set gives the same brief', () => {
  const judgementSet = {
    rules: [
      {
        kind: 'judgement',
        origin: 'typed',
        statement: 'Write in the active voice where the meaning allows it.',
        scope: 'sentence',
        exceptedContexts: [],
        exceptedTerms: [],
        register: 'all',
        enforcement: 'raises_findings',
        severity: 'advisory',
        payload: { failExample: 'The barrier was installed.', passExample: 'We installed the barrier.' },
      },
      {
        kind: 'term',
        origin: 'typed',
        statement: 'Use “scheme”, not “project”.',
        scope: 'sentence',
        exceptedContexts: [],
        exceptedTerms: [],
        register: 'all',
        enforcement: 'raises_findings',
        severity: 'required',
        payload: { preferred: 'scheme', replaces: ['project'] },
      },
    ],
  };

  const save = (body: unknown) =>
    app.request(`/projects/${projectId}/style-guides/${emptyGuideId}/rule-sets`, {
      method: 'POST',
      headers: { cookie: superCookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('stores a brief carrying the judgement rules and not the coded ones', async () => {
    const first = (await (await save(judgementSet)).json()) as GetRuleSetResponse;
    expect(first.set!.draftingBrief).toContain('Write in the active voice');
    // a term rule is applied to the model's own output afterwards, so asking
    // for it in the prompt as well would be spending context on it twice
    expect(first.set!.draftingBrief).not.toContain('Use “scheme”, not “project”.');
    expect(first.set!.draftingBrief).toContain('The barrier was installed.');
  });

  it('produces the SAME brief from the same rules — a declared workflow’s guarantee', async () => {
    const first = (await (await save(judgementSet)).json()) as GetRuleSetResponse;
    const second = (await (
      await save({ rules: [...judgementSet.rules].reverse() })
    ).json()) as GetRuleSetResponse;
    expect(second.set!.version).toBeGreaterThan(first.set!.version);
    expect(second.set!.draftingBrief).toBe(first.set!.draftingBrief);
  });

  it('is empty where a set has nothing to say to a drafting model', async () => {
    const saved = (await (
      await save({ rules: [judgementSet.rules[1]] })
    ).json()) as GetRuleSetResponse;
    expect(saved.set!.draftingBrief).toBe('');
  });

  it('is readable by every participant on the wire, and shown only to the curator', async () => {
    // the read is not the gate — the SURFACE is, and that half is pinned in
    // apps/web. A rule that binds you is one you may look up, and the brief is
    // part of the same record.
    const res = await app.request(
      `/projects/${projectId}/style-guides/${emptyGuideId}/rule-sets/current`,
      { headers: { cookie: consultantCookie } },
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as GetRuleSetResponse).set!.draftingBrief).toBeDefined();
  });
});
