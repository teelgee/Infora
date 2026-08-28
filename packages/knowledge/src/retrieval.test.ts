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
  // T-387 — how the deliverable was ADMITTED to the library: one closed cycle
  // per entry, in chronological order, each accepted under a code that grounds
  // or does not. Left unset the container has no accepting round at all, which
  // is owner-added reference material (T-304) and is the default here because
  // it is what every fixture written before this ticket implicitly was.
  admittedBy?: boolean[];
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
  // T-387 — the admission history: a cycle per entry, accepted under a code
  // whose `grounds` flag is the entry. `launched_at` is set explicitly and
  // spaced, because the clause reads the MOST RECENT accepting round and two
  // cycles opened in the same millisecond would make that order arbitrary.
  for (const [at, grounds] of (options.admittedBy ?? []).entries()) {
    const [cycle] = await db
      .insert(s.reviewCycles)
      .values({
        containerId: container!.id,
        state: 'accepted',
        launchedAt: new Date(Date.UTC(2026, 0, 1 + at)),
      })
      .returning();
    await db.insert(s.rounds).values({
      cycleId: cycle!.id,
      number: 1,
      versionId: versionIds[versionIds.length - 1]!,
      state: 'issued',
      deliverableCodeId: grounds ? groundingCodeId : nonGroundingCodeId,
    });
  }
  return versionIds;
}

let groundingCodeId: string;
let nonGroundingCodeId: string;

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

// T-387 — the third grounding condition (the ADR-0011 rider, ADR-0013 §6).
//
// ⚠ THE TESTS LEAN ONE WAY ON PURPOSE. This clause fails silently and
// asymmetrically: too RESTRICTIVE is visible — answers thin out and users
// complain — while too PERMISSIVE is invisible, because the answer cites a
// document that really exists and every citation still resolves. So the cases
// below are mostly assertions of ABSENCE, and each excluded fixture is given
// content the query would otherwise match exactly, the same discipline the
// pre-filter cases above use.
describe('the admitting code decides whether a deliverable grounds (T-387)', () => {
  // ITS OWN PROJECT, deliberately. The fake embedder ranks by keyword basis and
  // every fixture here shares the fallback basis, so on a shared project the
  // eight-chunk budget decides which of them comes back — and a test whose
  // absence assertion is satisfied by a crowded budget rather than by the
  // pre-filter is exactly the reassurance this ticket exists to refuse.
  let codeSlice: EntitledSlice;

  beforeAll(async () => {
    const stamp = Date.now();
    const [org] = await db.insert(s.organisations).values({ name: 't387 org' }).returning();
    const [project] = await db
      .insert(s.projects)
      .values({ name: 't387 project', ownerOrganisationId: org!.id })
      .returning();
    await db
      .insert(s.memberships)
      .values({ organisationId: org!.id, projectId: project!.id, role: 'owner' });
    const [user] = await db
      .insert(s.users)
      .values({ name: 't387', email: `t387-${stamp}@test.local`, organisationId: org!.id })
      .returning();
    const [participant] = await db
      .insert(s.participants)
      .values({ userId: user!.id, projectId: project!.id })
      .returning();
    codeSlice = {
      organisationId: org!.id,
      participantId: participant!.id,
      projectId: project!.id,
      membershipRole: 'owner',
      elevated: false,
    };

    // the project's own scheme: one accepting code that grounds and one that
    // does not. The 2021 National Annex makes Published codes stage-agnostic and
    // leaves each `An` code's meaning to the project's information standard,
    // which is precisely why this is per-project data and not a constant.
    const [grounding] = await db
      .insert(s.acceptanceCodes)
      .values({
        projectId: project!.id,
        code: 'A1',
        description: 'Published — authorized and accepted',
        isAccepting: true,
        isContractual: true,
        grounds: true,
      })
      .returning();
    groundingCodeId = grounding!.id;
    const [preliminary] = await db
      .insert(s.acceptanceCodes)
      .values({
        projectId: project!.id,
        code: 'B1',
        description: 'Published — partial sign-off with comments',
        isAccepting: true,
        isContractual: false,
        grounds: false,
      })
      .returning();
    nonGroundingCodeId = preliminary!.id;
  });

  const contentsOf = async (text: string, mode: 'baseline' | 'targeted' = 'baseline') =>
    (await groundedLibrary(deps, codeSlice, { text, mode })).map((i) => i.content).join(' ');

  it('excludes a deliverable admitted under a NON-GROUNDING code', async () => {
    const stamp = Date.now();
    await addDocument({
      projectId: codeSlice.projectId,
      reference: `T387-LIB-PARTIAL-${stamp}`,
      versions: [{ current: true, content: 'delta partial sign-off: the culvert capacity is 2.4 cumecs.' }],
      admittedBy: [false],
    });
    await addDocument({
      projectId: codeSlice.projectId,
      reference: `T387-LIB-FULL-${stamp}`,
      versions: [{ current: true, content: 'delta accepted: the culvert capacity is 3.1 cumecs.' }],
      admittedBy: [true],
    });

    const contents = await contentsOf('delta culvert capacity cumecs');
    // the invisible failure, named: a broken-permissive build returns this and
    // looks perfectly healthy doing it
    expect(contents).not.toContain('partial sign-off');
    expect(contents).toContain('delta accepted');
  });

  it('holds in TARGETED mode too — the clause is in the gateway, not a caller', async () => {
    // ADR-0029 §4 puts baseline assembly and targeted sub-agent retrieval on one
    // call precisely so a guarantee holds in both; a clause added one path up
    // would let an agentic sub-agent reach what the baseline excludes, and
    // nothing about the answer would look wrong
    expect(await contentsOf('delta culvert capacity cumecs', 'targeted')).not.toContain(
      'partial sign-off',
    );
  });

  it('holds on the LEXICAL arm too — naming the code does not open the door', async () => {
    const stamp = Date.now();
    const reference = `T387-LIB-NAMED-${stamp}`;
    await addDocument({
      projectId: codeSlice.projectId,
      reference,
      versions: [{ current: true, content: 'epsilon partial: the embankment was re-profiled in May.' }],
      admittedBy: [false],
    });
    // the hybrid's code arm beats similarity, so it is the path most likely to
    // reach past a filter that was only applied to the vector arm
    expect(await contentsOf(`summarise ${reference} for the report`)).not.toContain(
      'epsilon partial',
    );
  });

  it('the MOST RECENT accepting round decides, in both directions', async () => {
    const stamp = Date.now();
    // accepted preliminary first, then properly: it grounds now
    await addDocument({
      projectId: codeSlice.projectId,
      reference: `T387-LIB-RESCUED-${stamp}`,
      versions: [{ current: true, content: 'zeta rescued: the ground investigation was re-issued.' }],
      admittedBy: [false, true],
    });
    // and the other way round, which is the one that fails quietly
    await addDocument({
      projectId: codeSlice.projectId,
      reference: `T387-LIB-DEMOTED-${stamp}`,
      versions: [{ current: true, content: 'zeta demoted: the ground investigation was re-opened.' }],
      admittedBy: [true, false],
    });

    const contents = await contentsOf('zeta ground investigation');
    expect(contents).toContain('zeta rescued');
    expect(contents).not.toContain('zeta demoted');
  });

  it('owner-added reference material has no admitting code, and still grounds', async () => {
    // T-304: a reference container has no work item, no cycle and no code. Its
    // admission decision is the owner's own curation, which ADR-0011 has always
    // treated as the trust decision — a clause requiring a grounding code would
    // have silently emptied the reference half of every project library, which
    // is the RESTRICTIVE failure and the one users would eventually report
    const stamp = Date.now();
    await addDocument({
      projectId: codeSlice.projectId,
      reference: `T387-LIB-REF-${stamp}`,
      versions: [{ current: true, content: 'eta reference: the design manual for roads and bridges.' }],
    });
    expect(await contentsOf('eta design manual roads bridges')).toContain('eta reference');
  });

  it('the flag is read LIVE — turning a code off changes the very next query', async () => {
    // ADR-0013 §6 forbids caching the composite answer, and T-390's editor
    // promises a blast-radius count about the NEXT query. If this path cached
    // anything, that promise would be one the surface makes and retrieval does
    // not keep.
    const stamp = Date.now();
    const reference = `T387-LIB-LIVE-${stamp}`;
    await addDocument({
      projectId: codeSlice.projectId,
      reference,
      versions: [{ current: true, content: 'theta live-flag: the outfall headwall was rebuilt.' }],
      admittedBy: [true],
    });
    expect(await contentsOf('theta outfall headwall')).toContain('theta live-flag');

    await db
      .update(s.acceptanceCodes)
      .set({ grounds: false })
      .where(eq(s.acceptanceCodes.id, groundingCodeId));
    try {
      expect(await contentsOf('theta outfall headwall')).not.toContain('theta live-flag');
    } finally {
      await db
        .update(s.acceptanceCodes)
        .set({ grounds: true })
        .where(eq(s.acceptanceCodes.id, groundingCodeId));
    }
    expect(await contentsOf('theta outfall headwall')).toContain('theta live-flag');
  });
});
