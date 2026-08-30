// T-308 acceptance — the org-context binding, through the one gateway.
//
// Two properties, and the second is the wall one:
//
//   * a firm's rulebook reaches its OWN people on EVERY project, because org
//     context is portable to every project the organisation touches (ADR-0020);
//   * and it reaches nobody else — a competitor's drafting standards are
//     exactly the kind of thing ADR-0048 §6 calls an ethical-wall breach
//     delivered by a feature nobody thinks of as crossing the wall.
//
// Plus the one that makes ADR-0048 §5 implementable: the item carries a clause
// address and NO source, so it can be quoted and can never be cited.
//
// T-397 — THE CHANNEL MOVED FROM `guiding` TO `informing` and every assertion
// below moved with it, unchanged in substance. ADR-0048 §4's dated addendum
// (2026-08-30): ADR-0021 classifies context by OWNERSHIP, and a firm's drafting
// manual is the firm's own IP. **Nothing about reach changed**, which is the
// claim the whole file makes and which the relabel had to leave standing —
// there is a test at the foot asserting exactly that, because "we only changed
// a label" is the kind of sentence that needs evidence rather than assurance.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { AssemblyRequest } from '@infora/contracts';
import { loadRulebook } from '@infora/data';
import { createDb, schema as s } from '@infora/db';
import { createAssembler } from './gateway';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const assemble = createAssembler({ db, router: fakeRouter() });

const stamp = Date.now();
const MANUAL = ['4.2 Voice', 'Avoid the passive voice.', '', '7. Units', 'Use SI units throughout.'].join(
  '\n',
);

let ashcombe: string;
let rival: string;
let ashcombeRequester: AssemblyRequest['requester'];
let ashcombeElsewhere: AssemblyRequest['requester'];
let rivalRequester: AssemblyRequest['requester'];
let projectA: string;
let projectB: string;
let rulebookId: string;

async function participantOn(projectId: string, organisationId: string, name: string) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId })
    .returning();
  await db
    .insert(s.memberships)
    .values({ organisationId, projectId, role: 'member', state: 'active' })
    .onConflictDoNothing();
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId })
    .returning();
  return { organisationId, participantId: participant!.id };
}

const ask = (requester: AssemblyRequest['requester'], projectId: string): AssemblyRequest => ({
  request: { text: 'anything at all', mode: 'baseline' },
  environment: { kind: 'project', projectId },
  requester,
});

beforeAll(async () => {
  const [a] = await db.insert(s.organisations).values({ name: `t308 ashcombe ${stamp}` }).returning();
  const [r] = await db.insert(s.organisations).values({ name: `t308 rival ${stamp}` }).returning();
  ashcombe = a!.id;
  rival = r!.id;
  const [pA] = await db
    .insert(s.projects)
    .values({ name: `t308 project A ${stamp}`, ownerOrganisationId: ashcombe })
    .returning();
  const [pB] = await db
    .insert(s.projects)
    .values({ name: `t308 project B ${stamp}`, ownerOrganisationId: ashcombe })
    .returning();
  projectA = pA!.id;
  projectB = pB!.id;

  const [loader] = await db
    .insert(s.users)
    .values({ name: 't308-admin', email: `t308-admin-${stamp}@test.local`, organisationId: ashcombe })
    .returning();
  const loaded = await loadRulebook(db, {
    organisationId: ashcombe,
    title: 'Ashcombe Drafting Manual',
    sourceFormat: 'docx',
    loadedByUserId: loader!.id,
    text: MANUAL,
  });
  rulebookId = loaded.rulebookId;

  ashcombeRequester = await participantOn(projectA, ashcombe, 't308-ada');
  ashcombeElsewhere = await participantOn(projectB, ashcombe, 't308-abe');
  rivalRequester = await participantOn(projectA, rival, 't308-rex');
});

afterAll(async () => {
  await pool.end();
});

describe('org context is portable to every project the organisation touches', () => {
  it('reaches its own people on the project it was loaded beside', async () => {
    const { items } = await assemble(ask(ashcombeRequester, projectA));
    const rules = items.filter((i) => i.channel === 'informing');
    expect(rules.map((r) => r.rule?.clause)).toEqual(['4.2', '7']);
  });

  it('reaches the same organisation on a DIFFERENT project — no project key exists', async () => {
    const { items } = await assemble(ask(ashcombeElsewhere, projectB));
    expect(items.filter((i) => i.channel === 'informing')).toHaveLength(2);
  });

  it('reaches nobody else, on the project they SHARE (ADR-0048 §6)', async () => {
    const { items } = await assemble(ask(rivalRequester, projectA));
    expect(items.filter((i) => i.channel === 'informing')).toEqual([]);
  });
});

describe('quotable, and never citable (ADR-0048 §5)', () => {
  it('carries the clause address a finding needs, and the words verbatim', async () => {
    const { items } = await assemble(ask(ashcombeRequester, projectA));
    const voice = items.find((i) => i.rule?.clause === '4.2')!;
    expect(voice.rule?.heading).toBe('Voice');
    expect(voice.rule?.rulebookRef).toBe(rulebookId);
    expect(voice.content).toContain('Avoid the passive voice.');
  });

  it('has NO source — the absence is the guarantee, not an omission', async () => {
    const { items } = await assemble(ask(ashcombeRequester, projectA));
    for (const rule of items.filter((i) => i.channel === 'informing')) {
      expect(rule.source).toBeUndefined();
      expect(rule.corpus).toBeUndefined();
    }
  });
});

describe('currency by state', () => {
  it('a retired rulebook stops steering and is not deleted', async () => {
    await db.update(s.rulebooks).set({ retiredAt: new Date() }).where(eq(s.rulebooks.id, rulebookId));
    const { items } = await assemble(ask(ashcombeRequester, projectA));
    expect(items.filter((i) => i.channel === 'informing')).toEqual([]);
    // the words a past finding quoted still resolve
    const clauses = await db
      .select()
      .from(s.rulebookClauses)
      .where(eq(s.rulebookClauses.rulebookId, rulebookId));
    expect(clauses).toHaveLength(2);
    await db.update(s.rulebooks).set({ retiredAt: null }).where(eq(s.rulebooks.id, rulebookId));
  });
});

// ── T-397 — THE RELABEL CHANGED THE LABEL AND NOTHING ELSE ──────────────────
describe('the channel correction is a relabel, not a reach change (T-397)', () => {
  it('the same three reach facts hold, stated once more against the new label', async () => {
    // own people, own project
    const own = await assemble(ask(ashcombeRequester, projectA));
    expect(own.items.filter((i) => i.channel === 'informing')).toHaveLength(2);
    // own people, a DIFFERENT project — no project key exists on this store
    const elsewhere = await assemble(ask(ashcombeElsewhere, projectB));
    expect(elsewhere.items.filter((i) => i.channel === 'informing')).toHaveLength(2);
    // and nobody else, on the project they share
    const rivalRead = await assemble(ask(rivalRequester, projectA));
    expect(rivalRead.items.filter((i) => i.channel === 'informing')).toEqual([]);
  });

  it('NOTHING is on the guiding channel from this store — the label really moved', async () => {
    const { items } = await assemble(ask(ashcombeRequester, projectA));
    expect(items.filter((i) => i.channel === 'guiding')).toEqual([]);
  });
});
