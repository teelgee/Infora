// T-031 acceptance, against the live dev database: hybrid retrieval returns
// only the entitled project's live grounded corpus. Superseded versions,
// withdrawn containers, non-library containers, other projects and foreign
// embedding models are all excluded by the SQL pre-filter — proven by giving
// each excluded row content the query would otherwise match exactly.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EntitledSlice } from '@infora/governance';
import { createDb, schema as s } from '@infora/db';
import { extractReferenceCodes, groundedLibrary } from './retrieval';
import { FAKE_EMBED_MODEL, fakeRouter, fakeVector } from './test-router';

const { db, pool } = createDb();
const deps = { db, router: fakeRouter() };

let slice: EntitledSlice;

async function addDocument(options: {
  projectId: string;
  reference: string;
  inLibrary?: boolean;
  state?: 'live' | 'withdrawn';
  versions: Array<{ current: boolean; content: string; modelId?: string }>;
}) {
  // the producing organisation is the test project's owner (ADR-0033, T-114)
  const [proj] = await db
    .select({ ownerOrganisationId: s.projects.ownerOrganisationId })
    .from(s.projects)
    .where(eq(s.projects.id, options.projectId))
    .limit(1);
  const [container] = await db
    .insert(s.containers)
    .values({
      projectId: options.projectId,
      producingOrganisationId: proj!.ownerOrganisationId,
      documentReference: options.reference,
      inLibrary: options.inLibrary ?? true,
      state: options.state ?? 'live',
    })
    .returning();
  const versionIds: string[] = [];
  for (const [at, v] of options.versions.entries()) {
    const [version] = await db
      .insert(s.versions)
      .values({
        containerId: container!.id,
        versionReference: `v${at + 1}`,
        content: v.content,
        isCurrent: v.current,
      })
      .returning();
    versionIds.push(version!.id);
    await db.insert(s.versionChunks).values({
      versionId: version!.id,
      chunkIndex: 0,
      content: v.content,
      embedding: fakeVector(v.content),
      embeddingModelId: v.modelId ?? FAKE_EMBED_MODEL,
      embeddingModelVersion: 'fake-1',
    });
  }
  return versionIds;
}

let liveAlphaVersionId: string;
let supersededBetaVersionId: string;
let currentBetaVersionId: string;
let betaReference: string;

beforeAll(async () => {
  const stamp = Date.now();
  const [org] = await db.insert(s.organisations).values({ name: 't031 org' }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't031 project', ownerOrganisationId: org!.id })
    .returning();
  await db
    .insert(s.memberships)
    .values({ organisationId: org!.id, projectId: project!.id, role: 'owner' });
  const [user] = await db
    .insert(s.users)
    .values({ name: 't031', email: `t031-${stamp}@test.local`, organisationId: org!.id })
    .returning();
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId: project!.id })
    .returning();
  slice = {
    organisationId: org!.id,
    participantId: participant!.id,
    projectId: project!.id,
    membershipRole: 'owner',
  };

  liveAlphaVersionId = (
    await addDocument({
      projectId: project!.id,
      reference: `T31-LIB-ALPHA-${stamp}`,
      versions: [{ current: true, content: 'alpha: made ground and contamination findings.' }],
    })
  )[0]!;
  betaReference = `T31-LIB-BETA-${stamp}`;
  const betaVersionIds = await addDocument({
    projectId: project!.id,
    reference: betaReference,
    versions: [
      { current: false, content: 'beta superseded: no exceedances were recorded.' },
      { current: true, content: 'beta current: elevated PAH concentrations recorded.' },
    ],
  });
  supersededBetaVersionId = betaVersionIds[0]!;
  currentBetaVersionId = betaVersionIds[1]!;
  await addDocument({
    projectId: project!.id,
    reference: `T31-LIB-GONE-${stamp}`,
    state: 'withdrawn',
    versions: [{ current: true, content: 'alpha withdrawn: not to be relied on.' }],
  });
  await addDocument({
    projectId: project!.id,
    reference: `T31-SBX-NOTE-${stamp}`,
    inLibrary: false,
    versions: [{ current: true, content: 'alpha outside the library.' }],
  });
  await addDocument({
    projectId: project!.id,
    reference: `T31-LIB-MODEL-${stamp}`,
    versions: [{ current: true, content: 'alpha under another embedding model.', modelId: 'other-model' }],
  });

  // a second project the slice must never reach
  const [otherProject] = await db
    .insert(s.projects)
    .values({ name: 't031 other project', ownerOrganisationId: org!.id })
    .returning();
  await addDocument({
    projectId: otherProject!.id,
    reference: `T31-LIB-OTHER-${stamp}`,
    versions: [{ current: true, content: 'alpha in another project entirely.' }],
  });
});

afterAll(async () => {
  await pool.end();
});

const retrieve = (text: string) => groundedLibrary(deps, slice, { text, mode: 'baseline' });

describe('grounded library retrieval (T-031)', () => {
  it('returns the nearest live library chunk, annotated grounded/library with its source', async () => {
    const items = await retrieve('alpha question');
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toEqual({
      channel: 'grounded',
      corpus: 'library',
      source: { versionId: liveAlphaVersionId },
      content: 'alpha: made ground and contamination findings.',
    });
  });

  it('never returns the superseded version — one live version per container', async () => {
    const items = await retrieve('beta exceedances');
    const versionIds = items.map((i) => ('versionId' in i.source ? i.source.versionId : null));
    expect(versionIds).toContain(currentBetaVersionId);
    expect(versionIds).not.toContain(supersededBetaVersionId);
    expect(items.map((i) => i.content).join(' ')).not.toContain('superseded');
  });

  it('excludes withdrawn, non-library, other-project and other-model rows the query would match', async () => {
    const contents = (await retrieve('alpha question')).map((i) => i.content);
    for (const excluded of ['withdrawn', 'outside the library', 'another project', 'another embedding model']) {
      expect(contents.join(' ')).not.toContain(excluded);
    }
  });

  it('a deliverable code named in the request wins over similarity (hybrid, ADR-0022)', async () => {
    // the query is semantically far from beta (no keyword → the fallback
    // basis), but names its code — the lexical arm must put it first, and
    // still only its live current version
    const items = await retrieve(`summarise ${betaReference} for the report`);
    expect(items[0]!.source).toEqual({ versionId: currentBetaVersionId });
    expect(items[0]!.content).toContain('beta current');
  });

  it('extractReferenceCodes finds hyphenated codes and ignores prose', () => {
    expect(extractReferenceCodes('summarise WA-GEO-GIR-004 and wa-geo-gir-004, not follow-up.')).toEqual([
      'WA-GEO-GIR-004',
    ]);
    expect(extractReferenceCodes('no codes here')).toEqual([]);
  });
});
