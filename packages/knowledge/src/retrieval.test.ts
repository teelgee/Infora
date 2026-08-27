// T-031 acceptance, against the live dev database: hybrid retrieval returns
// only the entitled project's live grounded corpus. Superseded versions,
// withdrawn containers, non-library containers, other projects and foreign
// embedding models are all excluded by the SQL pre-filter — proven by giving
// each excluded row content the query would otherwise match exactly.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EntitledSlice } from '@infora/governance';
import { createDb, schema as s } from '@infora/db';
import { chunkText } from '@infora/data';
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
  // T-271 — when set, the fixture chunks through the REAL chunker and stores
  // the spans it produces. Left unset, the whole-content chunk carries no span,
  // which is exactly the state of every row ingested before T-271 and is worth
  // keeping as the default: most of these cases are about the pre-filter, and
  // they should keep exercising the version-grain degrade for free.
  chunkMaxChars?: number;
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
    const chunks =
      options.chunkMaxChars === undefined
        ? [{ index: 0, content: v.content, start: null, end: null }]
        : chunkText(v.content, options.chunkMaxChars);
    await db.insert(s.versionChunks).values(
      chunks.map((chunk) => ({
        versionId: version!.id,
        chunkIndex: chunk.index,
        content: chunk.content,
        embedding: fakeVector(chunk.content),
        embeddingModelId: v.modelId ?? FAKE_EMBED_MODEL,
        embeddingModelVersion: 'fake-1',
        startOffset: chunk.start,
        endOffset: chunk.end,
      })),
    );
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
    elevated: false,
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
    // T-253 — the item carries the PASSAGE it is, not only the document it
    // came from: the chunk row is immutable, so its id makes the assembled
    // context exactly reconstructible (finding F5)
    expect(items[0]).toEqual({
      channel: 'grounded',
      corpus: 'library',
      source: { versionId: liveAlphaVersionId },
      chunkId: expect.any(String) as unknown as string,
      content: 'alpha: made ground and contamination findings.',
    });
  });

  it('never returns the superseded version — one live version per container', async () => {
    const items = await retrieve('beta exceedances');
    const versionIds = items.map((i) => (i.source && 'versionId' in i.source ? i.source.versionId : null));
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

  // T-271 — the locator, end to end: chunked by the real chunker, stored with
  // its span, and resolved back into the real document by retrieval.
  it('carries a locator that resolves into the source document (T-271)', async () => {
    const stamp = Date.now();
    // two paragraphs, so the interesting chunk is one whose span crosses a
    // paragraph break — the case a search-based implementation cannot find
    const content =
      'Locator fixture heading.\nThe dewatering assessment considers the perched horizon.  ' +
      'It reports a plausible pathway.\n\nThe monitoring ran across three visits.';
    const [versionId] = await addDocument({
      projectId: slice.projectId,
      reference: `T271-LIB-LOC-${stamp}`,
      versions: [{ current: true, content }],
      chunkMaxChars: 70,
    });

    const items = await retrieve('dewatering perched horizon pathway');
    const item = items.find((i) => i.source && 'versionId' in i.source && i.source.versionId === versionId);
    expect(item).toBeDefined();
    expect(item!.locator).toBeDefined();

    const { span, paragraph, verbatim } = item!.locator!;
    // the span points at real, contiguous text in the version
    expect(content.slice(span.start, span.end)).toBe(verbatim);
    // and the verbatim is the passage, differing from what the model saw only
    // in the whitespace the packer rewrote
    expect(verbatim.replace(/\s+/g, ' ')).toBe(item!.content.replace(/\s+/g, ' '));
    // paragraph is the source's own newline count before the span
    const before = content.slice(0, span.start);
    expect(paragraph).toBe(before.length - before.replaceAll('\n', '').length);
    // and no page: this fixture has no page boundaries, and a docx never has
    // any, so inventing one is the failure T-305 is careful about
    expect(item!.locator!.page).toBeUndefined();
  });

  // T-305 — page, derived in the same query from the form feeds a PDF's
  // extracted text carries. The fixture is shaped exactly as `pdfToText`
  // leaves a document, because that is what lands in `versions.content`.
  it('carries the page a passage sits on, for a source that has pages (T-305)', async () => {
    const stamp = Date.now();
    // every sentence carries the `gamma` basis keyword so this fixture ranks in
    // its own bucket and does not crowd the eight-chunk budget the cases above
    // depend on (test-router.ts)
    const content =
      'Gamma sedimentation heading.\nGamma page one discusses the settlement lagoon.\f' +
      'Gamma page two reports the turbidity excursion at outfall nine.\f' +
      'Gamma page three proposes a silt curtain during the works.\f';
    const [versionId] = await addDocument({
      projectId: slice.projectId,
      reference: `T305-LIB-PAGE-${stamp}`,
      versions: [{ current: true, content }],
      chunkMaxChars: 60,
    });

    const items = await retrieve('gamma turbidity excursion outfall nine');
    const mine = items.filter((i) => i.source && 'versionId' in i.source && i.source.versionId === versionId);
    expect(mine.length).toBeGreaterThan(1); // more than one page came back

    for (const item of mine) {
      expect(item.locator).toBeDefined();
      const { span, page } = item.locator!;
      // one-based, and it is the page the passage STARTS on
      const before = content.slice(0, span.start);
      expect(page).toBe(before.length - before.replaceAll('\f', '').length + 1);
    }
    // the three pages are told apart, which is the whole point of the locator
    const turbidity = mine.find((i) => i.content.includes('turbidity excursion'))!;
    expect(turbidity.locator!.page).toBe(2);
    const curtain = mine.find((i) => i.content.includes('silt curtain'))!;
    expect(curtain.locator!.page).toBe(3);
  });

  it('degrades to version grain for a chunk stored without a span (T-271)', async () => {
    // every chunk ingested before this ticket is in exactly this state, and the
    // honest answer is a citation with no locator — never a guessed one
    const stamp = Date.now();
    const [versionId] = await addDocument({
      projectId: slice.projectId,
      reference: `T271-LIB-NOSPAN-${stamp}`,
      versions: [{ current: true, content: 'Spanless fixture about ballast fouling on the branch.' }],
    });
    const items = await retrieve('ballast fouling branch');
    const item = items.find((i) => i.source && 'versionId' in i.source && i.source.versionId === versionId);
    expect(item).toBeDefined();
    expect(item!.locator).toBeUndefined();
    expect(item!.content).toContain('ballast fouling'); // still retrieved, still cited
  });

  it('extractReferenceCodes finds hyphenated codes and ignores prose', () => {
    expect(extractReferenceCodes('summarise WA-GEO-GIR-004 and wa-geo-gir-004, not follow-up.')).toEqual([
      'WA-GEO-GIR-004',
    ]);
    expect(extractReferenceCodes('no codes here')).toEqual([]);
  });
});
