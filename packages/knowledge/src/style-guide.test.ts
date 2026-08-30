// T-397 acceptance — the PROJECT STYLE GUIDE, and the precedence the channel
// mislabel had made unreachable.
//
// Three properties, and the third is the one ADR-0053 §3 exists for:
//
//   * a project style guide reaches EVERY organisation on the project, because
//     it is the project's and binds all of them — the exact opposite of the
//     rulebook's org-private reach, and the reason the two are on different
//     channels (ADR-0021 classifies by OWNERSHIP);
//   * it reaches nobody on a different project — the only key is the project;
//   * ON CONFLICT, GUIDING WINS AND FIRM KNOW-HOW FILLS THE GAPS (ADR-0029,
//     refined 2026-07-06). With the rulebook mislabelled `guiding` the two
//     style sources shared one bucket with nothing to rank them by, so the
//     precedence could not be applied at all.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { AssemblyRequest } from '@infora/contracts';
import { loadRulebook, loadStyleGuide } from '@infora/data';
import { createDb, schema as s } from '@infora/db';
import { createAssembler, TOKEN_LIMIT } from './gateway';
import { mergeChannels } from './merge';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const assemble = createAssembler({ db, router: fakeRouter() });

const stamp = Date.now();
const GUIDE = ['4.2 Voice', 'Write in the active voice.', '', '9. Units', 'Use metric units.'].join(
  '\n',
);
const MANUAL = ['3.1 Voice', 'Use the passive voice for findings.'].join('\n');

let owner: string;
let consultant: string;
let projectA: string;
let projectB: string;
let ownerRequester: AssemblyRequest['requester'];
let consultantRequester: AssemblyRequest['requester'];
let elsewhereRequester: AssemblyRequest['requester'];
let guideId: string;

async function participantOn(projectId: string, organisationId: string, name: string) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId })
    .returning();
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId })
    .returning();
  return { organisationId, participantId: participant!.id };
}

const ask = (
  requester: AssemblyRequest['requester'],
  projectId: string,
): AssemblyRequest => ({
  request: { text: 'anything', mode: 'baseline' },
  environment: { kind: 'project', projectId },
  requester,
});

beforeAll(async () => {
  const [ownerOrg] = await db.insert(s.organisations).values({ name: `t397-owner-${stamp}` }).returning();
  const [memberOrg] = await db
    .insert(s.organisations)
    .values({ name: `t397-consultant-${stamp}` })
    .returning();
  owner = ownerOrg!.id;
  consultant = memberOrg!.id;

  const [a] = await db
    .insert(s.projects)
    .values({ name: `t397-a-${stamp}`, ownerOrganisationId: owner })
    .returning();
  const [b] = await db
    .insert(s.projects)
    .values({ name: `t397-b-${stamp}`, ownerOrganisationId: owner })
    .returning();
  projectA = a!.id;
  projectB = b!.id;
  for (const [organisationId, projectId, role] of [
    [owner, projectA, 'owner'],
    [consultant, projectA, 'member'],
    [owner, projectB, 'owner'],
  ] as const) {
    await db.insert(s.memberships).values({ organisationId, projectId, role });
  }

  const [loader] = await db
    .insert(s.users)
    .values({ name: 't397-loader', email: `t397-loader-${stamp}@test.local`, organisationId: owner })
    .returning();
  const loaded = await loadStyleGuide(db, {
    projectId: projectA,
    title: 'Scheme style guide',
    sourceFormat: 'docx',
    loadedByUserId: loader!.id,
    text: GUIDE,
  });
  guideId = loaded.styleGuideId;
  // the consultant's OWN manual, which disagrees with the project's on voice
  await loadRulebook(db, {
    organisationId: consultant,
    title: 'House drafting manual',
    sourceFormat: 'docx',
    loadedByUserId: loader!.id,
    text: MANUAL,
  });

  ownerRequester = await participantOn(projectA, owner, 't397-olly');
  consultantRequester = await participantOn(projectA, consultant, 't397-cass');
  elsewhereRequester = await participantOn(projectB, owner, 't397-eve');
});

afterAll(async () => {
  await pool.end();
});

describe('project context binds every organisation on the project (T-397)', () => {
  it('reaches the owner who curated it', async () => {
    const { items } = await assemble(ask(ownerRequester, projectA));
    expect(items.filter((i) => i.channel === 'guiding').map((i) => i.rule?.clause)).toEqual([
      '4.2',
      '9',
    ]);
  });

  it('REACHES A DIFFERENT ORGANISATION on the same project — that is the point of it', async () => {
    // the exact opposite of the rulebook's reach, and the reason the two sit on
    // different channels: quoting a project style guide across the wall is what
    // it is for (ADR-0053 §9)
    const { items } = await assemble(ask(consultantRequester, projectA));
    expect(items.filter((i) => i.channel === 'guiding')).toHaveLength(2);
  });

  it('reaches nobody on another project — the only key is the project', async () => {
    const { items } = await assemble(ask(elsewhereRequester, projectB));
    expect(items.filter((i) => i.channel === 'guiding')).toEqual([]);
  });
});

describe('quotable, and never citable (ADR-0048 §5, one store along)', () => {
  it('carries the clause address a finding needs, and no source at all', async () => {
    const { items } = await assemble(ask(consultantRequester, projectA));
    const voice = items.find((i) => i.rule?.clause === '4.2')!;
    expect(voice.rule?.heading).toBe('Voice');
    expect(voice.rule?.rulebookRef).toBe(guideId);
    expect(voice.content).toContain('Write in the active voice.');
    for (const rule of items.filter((i) => i.channel === 'guiding')) {
      expect(rule.source).toBeUndefined();
    }
  });
});

// ── THE PRECEDENCE, WHICH THE MISLABEL HAD MADE UNREACHABLE ────────────────
describe('on conflict, guiding wins and firm know-how fills the gaps', () => {
  it('the consultant sees BOTH sources, on two distinguishable channels', async () => {
    const { items } = await assemble(ask(consultantRequester, projectA));
    // this is the assertion that could not have been written before the
    // correction: with the rulebook labelled `guiding` too, both would have
    // arrived in one bucket with nothing to rank them by
    expect(items.filter((i) => i.channel === 'guiding')).toHaveLength(2);
    expect(items.filter((i) => i.channel === 'informing')).toHaveLength(1);
  });

  it('guiding is ORDERED FIRST, so the project rule is the one read first', async () => {
    const { items } = await assemble(ask(consultantRequester, projectA));
    const steering = items.filter((i) => i.channel !== 'grounded').map((i) => i.channel);
    expect(steering).toEqual(['guiding', 'guiding', 'informing']);
  });

  it('and the firm rulebook is DROPPED FIRST when the budget binds', async () => {
    // ADR-0029 §5's drop order, and the reason ADR-0053 §5 makes the checker's
    // planner split rather than drop: for a CHECKER a dropped source is silence
    // that reads as compliance, which is why the checker may not rely on this.
    const long = 'x'.repeat(TOKEN_LIMIT * 4);
    const merged = mergeChannels(
      {
        grounded: [],
        guiding: [{ channel: 'guiding', content: long }],
        informing: [{ channel: 'informing', content: long }],
      },
      TOKEN_LIMIT,
    );
    expect(merged.items.map((i) => i.channel)).toEqual(['guiding']);
  });
});

describe('currency by state (T-397)', () => {
  it('a retired style guide stops steering and is not deleted', async () => {
    await db
      .update(s.projectStyleGuides)
      .set({ retiredAt: new Date() })
      .where(eq(s.projectStyleGuides.id, guideId));
    const { items } = await assemble(ask(consultantRequester, projectA));
    expect(items.filter((i) => i.channel === 'guiding')).toEqual([]);
    // the words a past finding quoted still resolve — an amendment is a
    // retire-and-reload, never an edit, so the evidence behind a review that
    // already happened is never rewritten
    const clauses = await db
      .select()
      .from(s.projectStyleGuideClauses)
      .where(eq(s.projectStyleGuideClauses.styleGuideId, guideId));
    expect(clauses).toHaveLength(2);
    await db
      .update(s.projectStyleGuides)
      .set({ retiredAt: null })
      .where(eq(s.projectStyleGuides.id, guideId));
  });
});
