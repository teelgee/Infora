// T-280 — `document_builder`. Three properties carry the ticket: the builder
// does not choose its sources, the manifest records what each source was USED
// FOR, and the label is the evidence that propagation happened.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Assemble, AssembledInput } from '@infora/contracts';
import { createDb, schema as s } from '@infora/db';
import { Router, SELF_HOSTED_UK } from '@infora/model';
import type { ChatAdapter, EmbeddingAdapter } from '@infora/model';
import { compileDraftingBrief } from '@infora/capabilities';
import { saveRuleSet } from '@infora/data';
import { createDocumentBuilder, builtDocumentContent, UNSECTIONED } from './document-builder';

const { db, pool } = createDb();

let organisationId: string;
let otherOrganisationId: string;
let projectId: string;
let participantId: string;
let userId: string;
let sandboxId: string;
let narrowSandboxId: string;
let openVersionId: string;
let sharedVersionId: string;

const embeddings: EmbeddingAdapter = {
  modelId: 'fake-embed',
  dimensions: 4,
  attributes: SELF_HOSTED_UK,
  embed: async (texts) => ({
    embeddings: texts.map(() => [0, 0, 0, 0]),
    model: { id: 'fake-embed', version: '1' },
  }),
};
/** The last system prompt the router was handed — T-406's subject. */
let lastSystemPrompt = '';
const answering = (text: string): Router => {
  const chat: ChatAdapter = {
    modelId: 'fake-chat',
    attributes: SELF_HOSTED_UK,
    endpoint: 'https://fake.example',
    chat: async (request) => {
      lastSystemPrompt = request.system ?? '';
      return {
        text,
        model: { id: 'fake-chat', version: 'fake-1' },
        usage: { tokensPrompt: 10, tokensCompletion: 10 },
      };
    },
  };
  return new Router(chat, embeddings);
};

async function makeDeliverable(reference: string, content: string) {
  const [container] = await db
    .insert(s.containers)
    .values({ projectId, producingOrganisationId: organisationId, documentReference: reference, inLibrary: true })
    .returning();
  const [version] = await db
    .insert(s.versions)
    .values({ containerId: container!.id, versionReference: 'P01', content })
    .returning();
  return { containerId: container!.id as string, versionId: version!.id as string };
}

beforeAll(async () => {
  const stamp = Date.now();
  const [org] = await db.insert(s.organisations).values({ name: `t280 org ${stamp}` }).returning();
  organisationId = org!.id;
  const [other] = await db.insert(s.organisations).values({ name: `t280 other ${stamp}` }).returning();
  otherOrganisationId = other!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t280 project ${stamp}`, ownerOrganisationId: organisationId })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId, projectId, role: 'owner' },
    { organisationId: otherOrganisationId, projectId, role: 'member' },
  ]);
  const [user] = await db
    .insert(s.users)
    .values({ name: 't280', email: `t280-${stamp}@test.local`, organisationId })
    .returning();
  userId = user!.id;
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId })
    .returning();
  participantId = participant!.id;

  const [sandbox] = await db
    .insert(s.sandboxes)
    .values({
      projectId,
      owningOrganisationId: organisationId,
      scope: 'single_org',
      name: 't280 sandbox',
      createdByParticipantId: participantId,
    })
    .returning();
  sandboxId = sandbox!.id;
  await db.insert(s.sandboxScopeGrants).values({
    sandboxId,
    granteeType: 'organisation',
    organisationId,
    grantedByParticipantId: participantId,
  });
  // a sandbox reaching a SECOND organisation — broader than a single-org source
  const [wide] = await db
    .insert(s.sandboxes)
    .values({
      projectId,
      owningOrganisationId: organisationId,
      scope: 'multi_org',
      name: 't280 wide',
      createdByParticipantId: participantId,
    })
    .returning();
  narrowSandboxId = wide!.id;
  await db.insert(s.sandboxScopeGrants).values([
    { sandboxId: narrowSandboxId, granteeType: 'organisation', organisationId, grantedByParticipantId: participantId },
    {
      sandboxId: narrowSandboxId,
      granteeType: 'organisation',
      organisationId: otherOrganisationId,
      grantedByParticipantId: participantId,
    },
  ]);

  ({ versionId: openVersionId } = await makeDeliverable(`T280-A-${stamp}`, 'the baseline survey recorded three exceedances'));
  ({ versionId: sharedVersionId } = await makeDeliverable(`T280-B-${stamp}`, 'the mitigation commits to a five-year maintenance period'));
});

afterAll(async () => {
  await pool.end();
});

const passage = (versionId: string, reference: string, content: string) => ({
  channel: 'grounded' as const,
  corpus: 'library' as const,
  source: { versionId },
  chunkId: `${versionId}-c0`,
  descriptor: {
    documentReference: reference,
    documentTitle: null,
    versionReference: 'P01',
    superseded: false,
  },
  content,
});

const gateway = (...items: ReturnType<typeof passage>[]): Assemble => {
  const input: AssembledInput = { items, budget: { tokenLimit: 12000, tokensUsed: 0 } };
  return vi.fn().mockResolvedValue(input);
};

const requester = () => ({ organisationId, participantId });

/**
 * T-407 — the outline these tests compose. It is what the shipped
 * `technical-note` starting outline seeds, written out here as the author's own
 * list, because that is what the builder now takes.
 */
const outline = [
  { heading: 'Purpose', purpose: 'State what question this note answers and for whom.' },
  { heading: 'The evidence', purpose: 'Set out what the project record says.' },
  { heading: 'Implication', purpose: 'State what follows for the design or the programme.' },
];

/**
 * T-406's four launcher answers, at their defaults. Spread into every input so
 * the tests below keep saying what they were written to say — the drafting
 * character is its own subject, tested where it is tested rather than smeared
 * across every case that happens to build a document.
 */
const character = {
  purpose: 'technical-note' as const,
  language: 'technical' as const,
  documentType: 'whole-document' as const,
  styleGuideIds: [],
};

describe('document_builder (T-280)', () => {
  it('drafts into the template and records what each source was used for', async () => {
    const builder = createDocumentBuilder({
      db,
      router: answering(
        [
          'Purpose',
          'This note answers whether the baseline supports the assessment [S1].',
          'The evidence',
          'The baseline survey recorded three exceedances [S1].',
          'Implication',
          'The mitigation commits to a five-year maintenance period [S2].',
        ].join('\n\n'),
      ),
      assemble: gateway(
        passage(openVersionId, 'T280-A', 'the baseline survey recorded three exceedances'),
        passage(sharedVersionId, 'T280-B', 'the mitigation commits to a five-year maintenance period'),
      ),
    });

    const output = await builder(requester(), { projectId }, {
      sections: outline,
      brief: 'does the baseline support the assessment?',
      ...character,
      sources: { versionIds: [openVersionId, sharedVersionId] },
      destination: { sandboxId, title: 't280 built note' },
    });

    expect(output.documentId).not.toBeNull();
    // the manifest says what each source was USED FOR — the difference between
    // "these documents were in scope" and "this section rests on this document"
    // T-407 — by the section's HEADING, because a manifest is read by people
    expect(output.manifest.map((entry) => entry.usedFor)).toEqual([
      'Purpose',
      'The evidence',
      'Implication',
    ]);
    expect(output.manifest[1]!.versionId).toBe(openVersionId);
    expect(output.manifest[1]!.documentReference).toBe('T280-A');
    expect(output.unreachableSources).toEqual([]);
  });

  // T-406 — THE WHOLE PATH, not just the prompt composer: a style guide loaded
  // into the store, selected by id, reaching the actual model call. The
  // composer's own unit tests live beside it in `capabilities`; this is the
  // wiring between the store and the router, which is the half that would break
  // silently and leave every one of those tests green.
  it('reads the SELECTED style guides from the store and puts their clauses in the call (T-406)', async () => {
    const [guide] = await db
      .insert(s.projectStyleGuides)
      .values({
        projectId,
        title: 't406 project style guide',
        sourceFormat: 'docx',
        loadedByUserId: userId,
      })
      .returning();
    const [other] = await db
      .insert(s.projectStyleGuides)
      .values({
        projectId,
        title: 't406 a guide nobody selected',
        sourceFormat: 'docx',
        loadedByUserId: userId,
      })
      .returning();
    await db.insert(s.projectStyleGuideClauses).values([
      {
        styleGuideId: guide!.id,
        ordinal: 1,
        clause: '4.2',
        heading: 'Terminology',
        content: 'Write “made ground”, never “fill”.',
        spanStart: 0,
        spanEnd: 40,
      },
      {
        styleGuideId: other!.id,
        ordinal: 1,
        clause: '1.1',
        heading: 'Unselected',
        content: 'A rule about some other document entirely.',
        spanStart: 0,
        spanEnd: 40,
      },
    ]);

    const builder = createDocumentBuilder({
      db,
      router: answering('Purpose\n\nA sentence [S1].'),
      assemble: gateway(passage(openVersionId, 'T280-A', 'the baseline survey recorded three exceedances')),
    });
    await builder(requester(), { projectId }, {
      sections: outline,
      brief: 'a brief',
      ...character,
      language: 'simple-english',
      styleGuideIds: [guide!.id],
      sources: { versionIds: [openVersionId] },
      destination: { sandboxId, title: 't406 styled note' },
    });

    expect(lastSystemPrompt).toContain('Write “made ground”, never “fill”.');
    expect(lastSystemPrompt).toContain('4.2 Terminology');
    // 🔒 a guide the author did NOT select is a rule about another document,
    // and must not reach this draft
    expect(lastSystemPrompt).not.toContain('some other document entirely');
    // and the register answer travelled with it
    expect(lastSystemPrompt).toContain('short sentences');
  });

  // T-402 — THE MISCOUNT'S ROOT, pinned at the builder. A drafting call whose
  // prose matches none of the template's headings writes NOTHING into the
  // document: the assembly writes the template's own sections and nothing else.
  // The material is still reported — as `outsideOutline`, and in the manifest
  // under the `unsectioned` bucket — so the surface above can say where the
  // words went instead of counting the bucket as a section written.
  it('writes nothing for prose that matched no heading, and reports how much fell outside', async () => {
    const builder = createDocumentBuilder({
      db,
      router: answering(
        'The baseline survey recorded three exceedances [S1]. The mitigation commits to a five-year maintenance period [S2].',
      ),
      assemble: gateway(
        passage(openVersionId, 'T280-A', 'the baseline survey recorded three exceedances'),
        passage(sharedVersionId, 'T280-B', 'the mitigation commits to a five-year maintenance period'),
      ),
    });

    const output = await builder(requester(), { projectId }, {
      sections: outline,
      brief: 'does the baseline support the assessment?',
      ...character,
      sources: { versionIds: [openVersionId, sharedVersionId] },
      destination: { sandboxId, title: 't402 headingless note' },
    });

    expect(await builtDocumentContent(db, output.documentId!)).toBe('');
    expect(output.outsideOutline).toBeGreaterThan(0);
    // every manifest entry is the bucket, and not one of them is a section of
    // the outline — which is precisely what the old tally counted
    expect(output.manifest.map((entry) => entry.usedFor)).toEqual(
      output.manifest.map(() => UNSECTIONED),
    );
  });

  // the label is not decoration: a write path that refused correctly and said
  // nothing is indistinguishable downstream from one that never checked
  it('reports the computed label, the input that set it and the destination’s', async () => {
    const builder = createDocumentBuilder({
      db,
      router: answering('Purpose\n\nA sentence [S1].'),
      assemble: gateway(passage(openVersionId, 'T280-A', 'the baseline survey recorded three exceedances')),
    });
    const output = await builder(requester(), { projectId }, {
      sections: outline,
      brief: 'b',
      ...character,
      sources: { versionIds: [openVersionId] },
      destination: { sandboxId, title: 't280 label note' },
    });
    expect(output.label.computedLabel).toBeDefined();
    expect(output.label.destinationLabel).toBeDefined();
    expect(output.label.mostRestrictiveInput).toBe(openVersionId);
    expect(output.label.refusal).toBeUndefined();
  });

  it('withholds the write when the destination is broader than the sources, naming both labels', async () => {
    const router = answering('Purpose\n\nA sentence [S1].');
    const spy = vi.spyOn(router, 'chat');
    const builder = createDocumentBuilder({
      db,
      router,
      assemble: gateway(passage(openVersionId, 'T280-A', 'text')),
    });
    const output = await builder(requester(), { projectId }, {
      sections: outline,
      brief: 'b',
      ...character,
      sources: { versionIds: [openVersionId] },
      destination: { sandboxId: narrowSandboxId, title: 't280 refused' },
    });

    expect(output.documentId).toBeNull();
    expect(output.label.refusal).toMatch(/destination is/);
    // and NOTHING was drafted: the refusal does not change with the words
    // produced, so paying for them would be paying for a refusal
    expect(spy).not.toHaveBeenCalled();
  });

  // a named source the gateway did not return is reported, never dropped
  it('reports a requested source that was not reachable', async () => {
    const builder = createDocumentBuilder({
      db,
      router: answering('Purpose\n\nA sentence [S1].'),
      assemble: gateway(passage(openVersionId, 'T280-A', 'text')),
    });
    const output = await builder(requester(), { projectId }, {
      sections: outline,
      brief: 'b',
      ...character,
      sources: { versionIds: [openVersionId, sharedVersionId] },
      destination: { sandboxId, title: 't280 partial' },
    });
    expect(output.unreachableSources).toEqual([sharedVersionId]);
  });

  // grounded-only: a built document gets no weaker guarantee than an answer
  it('withholds an unsourced sentence rather than writing it', async () => {
    const builder = createDocumentBuilder({
      db,
      router: answering('Purpose\n\nA sourced sentence [S1].\n\nAn invented one with no marker at all.'),
      assemble: gateway(passage(openVersionId, 'T280-A', 'text')),
    });
    const output = await builder(requester(), { projectId }, {
      sections: outline,
      brief: 'b',
      ...character,
      sources: { versionIds: [openVersionId] },
      destination: { sandboxId, title: 't280 withheld' },
    });
    expect(output.withheld.join(' ')).toContain('An invented one');
    const [row] = await db
      .select({ content: s.sandboxDocuments.content })
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, output.documentId!));
    expect(row!.content).not.toContain('An invented one');
  });

  // T-407 — this test used to assert that asking for a template this deployment
  // does not carry named the ones it does. That failure mode no longer exists:
  // the outline arrives composed in the request, so there is nothing to look up
  // and nothing to be missing. What replaces it is the case that DOES still
  // matter — the outline is the author's, and the document comes out under
  // their headings rather than any template's.
  it('drafts into the AUTHOR’S headings, not a template’s (T-407)', async () => {
    const builder = createDocumentBuilder({
      db,
      router: answering(
        [
          '3.2 Baseline conditions, including the 2025 survey.',
          'The baseline survey recorded three exceedances [S1].',
        ].join('\n\n'),
      ),
      assemble: gateway(
        passage(openVersionId, 'T280-A', 'the baseline survey recorded three exceedances'),
      ),
    });
    const output = await builder(requester(), { projectId }, {
      sections: [
        {
          heading: '3.2 Baseline conditions, including the 2025 survey.',
          purpose: 'set out the baseline as the record establishes it',
        },
      ],
      brief: 'b',
      ...character,
      sources: { versionIds: [openVersionId] },
      destination: { sandboxId, title: 't407 composed note' },
    });
    const content = await builtDocumentContent(db, output.documentId!);
    // 🔒 written as MARKDOWN — T-336's heading finding, applied to a heading a
    // person typed. This one is long AND ends in a full stop, so every rule the
    // checker's splitter uses to GUESS at an unmarked heading fails on it; `##`
    // is not a guess.
    expect(content).toContain('## 3.2 Baseline conditions, including the 2025 survey.');
    expect(output.sectionsWritten).toBe(1);
    // and the manifest names the section by the author's own heading
    expect(output.manifest[0]!.usedFor).toBe('3.2 Baseline conditions, including the 2025 survey.');
  });

  // T-407 — two sections may honestly share a heading, and the count must not
  // merge them. This is why sections are identified by POSITION internally.
  it('counts two same-named sections as two (T-407)', async () => {
    const builder = createDocumentBuilder({
      db,
      router: answering(
        ['Mitigation', 'A first point [S1].', 'Mitigation', 'A second point [S1].'].join('\n\n'),
      ),
      assemble: gateway(
        passage(openVersionId, 'T280-A', 'the baseline survey recorded three exceedances'),
      ),
    });
    const output = await builder(requester(), { projectId }, {
      sections: [
        { heading: 'Mitigation', purpose: 'noise' },
        { heading: 'Mitigation', purpose: 'ecology' },
      ],
      brief: 'b',
      ...character,
      sources: { versionIds: [openVersionId] },
      destination: { sandboxId, title: 't407 repeated heading' },
    });
    // the splitter maps a repeated heading to its FIRST position, so only one
    // section fills — but the count is of sections, never of heading names, and
    // the second stays honestly unwritten rather than being merged away
    expect(output.sectionsWritten).toBe(1);
    expect(await builtDocumentContent(db, output.documentId!)).toContain('## Mitigation');
  });

  // THE BUILDER DOES NOT RETRIEVE: everything outside the named ids is dropped,
  // whatever the gateway returned
  it('uses only the sources it was handed', async () => {
    const builder = createDocumentBuilder({
      db,
      router: answering('Purpose\n\nA sentence [S1].'),
      assemble: gateway(
        passage(openVersionId, 'T280-A', 'wanted'),
        passage(sharedVersionId, 'T280-B', 'not asked for'),
      ),
    });
    const output = await builder(requester(), { projectId }, {
      sections: outline,
      brief: 'b',
      ...character,
      sources: { versionIds: [openVersionId] },
      destination: { sandboxId, title: 't280 explicit' },
    });
    expect(output.manifest.every((entry) => entry.versionId === openVersionId)).toBe(true);
  });
});

// ── T-429 — the compiled brief, and the tidy-up pass (ADR-0054 decision 6) ──
//
// 🔒 **THE ASSERTION THIS SUITE EXISTS FOR IS THE NEGATIVE ONE.** The tidy-up
// pass is the one place in this design that comes near the checker acquiring a
// write path, and ADR-0054 says explicitly that it is not one: it reaches only
// the model's **own fresh output**, inside the invoker's own sandbox, before any
// human has seen it, and it **never** touches text a person wrote. The author's
// section headings are text a person wrote — they come out of the outline the
// author composed — and they sit in the same document as the sentences the pass
// does normalise, which is what makes this a real test rather than a tautology.
describe('T-429 — the tidy-up pass touches the model’s output and nothing else', () => {
  const RULE = {
    kind: 'term',
    origin: 'typed' as const,
    statement: 'Use “scheme”, not “project”.',
    scope: 'sentence',
    exceptedContexts: [] as string[],
    exceptedTerms: [] as string[],
    register: 'all',
    enforcement: 'raises_findings',
    severity: 'required',
    payload: { preferred: 'scheme', replaces: ['project'] },
  };

  async function guideWithRules() {
    const [guide] = await db
      .insert(s.projectStyleGuides)
      .values({
        projectId,
        title: `t429 guide ${Date.now()}`,
        sourceFormat: 'none',
        loadedByUserId: userId,
      })
      .returning();
    await saveRuleSet(db, {
      styleGuideId: guide!.id,
      acceptedByUserId: userId,
      draftingBrief: compileDraftingBrief([
        {
          kind: 'judgement',
          statement: 'Write in the active voice where the meaning allows it.',
          scope: 'sentence',
          register: 'all',
          enforcement: 'raises_findings',
        },
      ]),
      rules: [RULE],
    });
    return guide!.id as string;
  }

  it('normalises the model’s sentences and leaves the AUTHOR’S heading untouched', async () => {
    const styleGuideId = await guideWithRules();
    const builder = createDocumentBuilder({
      db,
      router: answering(
        [
          // 🔒 the author's own heading, written back by the assembly — it
          // breaches the term rule and MUST come out unchanged
          'The project purpose',
          'The project baseline survey recorded three exceedances [S1].',
        ].join('\n\n'),
      ),
      assemble: gateway(
        passage(openVersionId, 'T429-A', 'the baseline survey recorded three exceedances'),
      ),
    });

    const output = await builder(requester(), { projectId }, {
      sections: [
        { heading: 'The project purpose', purpose: 'State what question this note answers.' },
      ],
      brief: 'does the baseline support the assessment?',
      ...character,
      styleGuideIds: [styleGuideId],
      sources: { versionIds: [openVersionId] },
      destination: { sandboxId, title: 't429 built note' },
    });

    const [written] = await db
      .select({ content: s.sandboxDocuments.content })
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, output.documentId!));

    // 🔒 the author's heading is text a person wrote: unchanged, still saying
    // "project", even though the accepted rule forbids that word
    expect(written!.content).toContain('## The project purpose');
    // and the model's own sentence beside it IS normalised
    expect(written!.content).toContain('The scheme baseline survey recorded three exceedances.');
    expect(written!.content).not.toContain('The project baseline survey');
    expect(output.normalised).toMatchObject({ substitutions: 1 });
  });

  it('hands the model the compiled brief and a short preferred-wordings list', async () => {
    const styleGuideId = await guideWithRules();
    const builder = createDocumentBuilder({
      db,
      router: answering('Purpose\n\nThe baseline survey recorded three exceedances [S1].'),
      assemble: gateway(
        passage(openVersionId, 'T429-B', 'the baseline survey recorded three exceedances'),
      ),
    });
    await builder(requester(), { projectId }, {
      sections: [{ heading: 'Purpose', purpose: 'State what question this note answers.' }],
      brief: 'does the baseline support the assessment?',
      ...character,
      styleGuideIds: [styleGuideId],
      sources: { versionIds: [openVersionId] },
      destination: { sandboxId, title: 't429 brief note' },
    });
    // the judgement rule arrives as the compiled brief, not as the whole set
    expect(lastSystemPrompt).toContain('Write in the active voice where the meaning allows it.');
    // and the term rule arrives as a short list of preferred wordings
    expect(lastSystemPrompt).toContain('Preferred wordings');
    expect(lastSystemPrompt).toContain('scheme — not project');
  });

  it('does nothing at all where the author selected no guide', async () => {
    const builder = createDocumentBuilder({
      db,
      router: answering('Purpose\n\nThe project baseline recorded three exceedances [S1].'),
      assemble: gateway(passage(openVersionId, 'T429-C', 'the baseline recorded three exceedances')),
    });
    const output = await builder(requester(), { projectId }, {
      sections: [{ heading: 'Purpose', purpose: 'State what question this note answers.' }],
      brief: 'does the baseline support the assessment?',
      ...character,
      sources: { versionIds: [openVersionId] },
      destination: { sandboxId, title: 't429 unruled note' },
    });
    expect(output.normalised).toMatchObject({ substitutions: 0, unfixed: 0 });
  });
});
