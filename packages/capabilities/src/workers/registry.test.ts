// T-269 — entitlement assembly. The property under test is not "the right
// workers come back" but "the wrong ones are ABSENT", which is a different
// claim and the one the design rests on.
import { describe, expect, it } from 'vitest';
import type { WorkerDeclaration } from '@infora/contracts';
import type { EntitledSlice } from '@infora/governance';
import {
  assembleWorkers,
  BUILT_WORKERS,
  createWorkerRegistry,
  tierAdmitsThirdParty,
} from './registry';
import { CORPUS_RETRIEVAL } from './corpus-retrieval';

const slice: EntitledSlice = {
  organisationId: 'org-b',
  participantId: 'part-1',
  projectId: 'proj-1',
  membershipRole: 'member',
  elevated: false,
};

const declaration = (overrides: Partial<WorkerDeclaration>): WorkerDeclaration => ({
  ...CORPUS_RETRIEVAL,
  ...overrides,
});

// Declarations for workers that are NOT BUILT. The sovereign rule is a rule
// about `web_research`, and `web_research` does not exist — so testing it
// through the live registry would be testing nothing at all.
const webResearch = declaration({
  name: 'web_research',
  externalEgress: true,
  reach: 'none',
  cacheable: true,
});
const authorityLookup = declaration({ name: 'authority_lookup', requiresAuthorityShelf: true });

const facts = (overrides: Partial<Parameters<typeof assembleWorkers>[1]> = {}) => ({
  slice,
  tier: 'standard' as const,
  authorityShelf: false,
  ...overrides,
});

describe('entitlement assembly (T-269)', () => {
  it('NO SLICE, NO WORKERS AT ALL — not a reduced set', () => {
    const all = [CORPUS_RETRIEVAL, webResearch, authorityLookup];
    expect(assembleWorkers(all, facts({ slice: null }))).toEqual([]);
    // and not the read-only ones either: someone who cannot reach the project
    // has no agent on it, which is one answer rather than a shorter list
    expect(assembleWorkers(all, facts({ slice: null, authorityShelf: true }))).toEqual([]);
  });

  it('a sovereign deployment assembles no worker that reaches a third party', () => {
    const assembled = assembleWorkers([CORPUS_RETRIEVAL, webResearch], facts({ tier: 'sovereign' }));
    expect(assembled.map((worker) => worker.name)).toEqual(['corpus_retrieval']);
  });

  it('and the exclusion falls out of the ROUTER POLICY, not a per-worker switch', () => {
    // if a tier's provider eligibility ever widened, the web worker would
    // appear without anybody editing this file — which is the intent
    expect(tierAdmitsThirdParty('standard')).toBe(true);
    expect(tierAdmitsThirdParty('sovereign')).toBe(false);
    expect(assembleWorkers([webResearch], facts({ tier: 'standard' }))).toHaveLength(1);
  });

  it('an organisation with no authority shelf assembles no authority worker', () => {
    expect(assembleWorkers([authorityLookup], facts()).map((w) => w.name)).toEqual([]);
    expect(
      assembleWorkers([authorityLookup], facts({ authorityShelf: true })).map((w) => w.name),
    ).toEqual(['authority_lookup']);
  });

  it('ABSENT, NOT DISABLED — an excluded worker leaves no trace in the assembled set', () => {
    const assembled = assembleWorkers(
      [CORPUS_RETRIEVAL, webResearch],
      facts({ tier: 'sovereign' }),
    );
    // the check that matters: nothing in what the model is handed mentions the
    // excluded worker. A filtered design would have put it here with a flag,
    // and something downstream would eventually render it greyed out with a
    // tooltip naming a capability the viewer cannot have.
    expect(JSON.stringify(assembled)).not.toContain('web_research');
  });

  it('the declaration type has no enabled/disabled field to filter with', () => {
    // compile-time: adding `enabled` to WorkerDeclaration breaks this, which is
    // the review the assembled-not-filtered rule needs
    type HasNoToggle = 'enabled' extends keyof WorkerDeclaration
      ? false
      : 'disabled' extends keyof WorkerDeclaration
        ? false
        : 'availableTo' extends keyof WorkerDeclaration
          ? false
          : true;
    const pinned: HasNoToggle = true;
    expect(pinned).toBe(true);
  });

  it('every user gets a materially different agent — two requesters, two sets', () => {
    const all = [CORPUS_RETRIEVAL, webResearch, authorityLookup];
    const consultant = assembleWorkers(all, facts({ authorityShelf: true }));
    const sovereignUser = assembleWorkers(all, facts({ tier: 'sovereign' }));
    expect(consultant.map((w) => w.name)).toEqual([
      'corpus_retrieval',
      'web_research',
      'authority_lookup',
    ]);
    expect(sovereignUser.map((w) => w.name)).toEqual(['corpus_retrieval']);
  });
});

describe('the registry (T-269)', () => {
  it('holds only workers that are BUILT', () => {
    // declaring the unbuilt ones would put capabilities in the model's tool
    // set that no code implements — a worse failure than their absence,
    // because the model would call them. `extractor` joined the set at T-274
    // when it acquired an implementation, not before.
    expect(createWorkerRegistry().list()).toEqual([
      'corpus_retrieval',
      'extractor',
      'document_builder',
    ]);
    expect(BUILT_WORKERS.map((worker) => worker.name)).toEqual([
      'corpus_retrieval',
      'extractor',
      'document_builder',
    ]);
  });

  it("satisfies T-264's KnownWorkers, so a declared workflow validates against the real set", () => {
    const registry = createWorkerRegistry();
    expect(registry.has('corpus_retrieval')).toBe(true);
    expect(registry.has('do_the_thing')).toBe(false);
  });

  it('summaries carry what may be shown and never the schemas or the tools', () => {
    const [summary] = createWorkerRegistry().summaries(facts());
    expect(Object.keys(summary!).sort()).toEqual(['name', 'purpose', 'writes']);
  });

  it('non-negotiable 7: every built worker is a leaf', () => {
    // `workflow_runner` (T-265) is the single exception, and it is the only
    // declaration that may ever set this false
    for (const worker of BUILT_WORKERS) {
      expect(worker.leaf, worker.name).toBe(true);
    }
  });

  it('non-negotiable 8: no generic worker is declared', () => {
    const generic = ['research_agent', 'code_execution', 'do_the_thing', 'agent', 'run'];
    for (const worker of BUILT_WORKERS) expect(generic).not.toContain(worker.name);
  });
});
