// T-280 — `document_builder`. Three properties carry the ticket: the builder
// does not choose its sources, the manifest records what each source was USED
// FOR, and the label is the evidence that propagation happened.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Assemble, AssembledInput } from '@infora/contracts';
import { createDb, schema as s } from '@infora/db';
import { loadDocumentTemplates } from '@infora/capabilities';
import { Router, SELF_HOSTED_UK } from '@infora/model';
import type { ChatAdapter, EmbeddingAdapter } from '@infora/model';
import {
  createDocumentBuilder,
  builtDocumentContent,
  UNSECTIONED,
  UnknownDocumentTemplate,
} from './document-builder';

const { db, pool } = createDb();
const templates = loadDocumentTemplates();

let organisationId: string;
let otherOrganisationId: string;
let projectId: string;
let participantId: string;
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
const answering = (text: string): Router => {
  const chat: ChatAdapter = {
    modelId: 'fake-chat',
    attributes: SELF_HOSTED_UK,
    endpoint: 'https://fake.example',
    chat: async () => ({
      text,
      model: { id: 'fake-chat', version: 'fake-1' },
      usage: { tokensPrompt: 10, tokensCompletion: 10 },
    }),
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
      templates,
    });

    const output = await builder(requester(), { projectId }, {
      templateId: 'technical-note',
      brief: 'does the baseline support the assessment?',
      sources: { versionIds: [openVersionId, sharedVersionId] },
      destination: { sandboxId, title: 't280 built note' },
    });

    expect(output.documentId).not.toBeNull();
    // the manifest says what each source was USED FOR — the difference between
    // "these documents were in scope" and "this section rests on this document"
    expect(output.manifest.map((entry) => entry.usedFor)).toEqual(['purpose', 'evidence', 'implication']);
    expect(output.manifest[1]!.versionId).toBe(openVersionId);
    expect(output.manifest[1]!.documentReference).toBe('T280-A');
    expect(output.unreachableSources).toEqual([]);
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
      templates,
    });

    const output = await builder(requester(), { projectId }, {
      templateId: 'technical-note',
      brief: 'does the baseline support the assessment?',
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
      templates,
    });
    const output = await builder(requester(), { projectId }, {
      templateId: 'technical-note',
      brief: 'b',
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
      templates,
    });
    const output = await builder(requester(), { projectId }, {
      templateId: 'technical-note',
      brief: 'b',
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
      templates,
    });
    const output = await builder(requester(), { projectId }, {
      templateId: 'technical-note',
      brief: 'b',
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
      templates,
    });
    const output = await builder(requester(), { projectId }, {
      templateId: 'technical-note',
      brief: 'b',
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

  it('names the available templates when asked for one that does not exist', async () => {
    const builder = createDocumentBuilder({
      db,
      router: answering('x'),
      assemble: gateway(),
      templates,
    });
    await expect(
      builder(requester(), { projectId }, {
        templateId: 'invoice',
        brief: 'b',
        sources: { versionIds: [] },
        destination: { sandboxId, title: 'x' },
      }),
    ).rejects.toThrow(UnknownDocumentTemplate);
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
      templates,
    });
    const output = await builder(requester(), { projectId }, {
      templateId: 'technical-note',
      brief: 'b',
      sources: { versionIds: [openVersionId] },
      destination: { sandboxId, title: 't280 explicit' },
    });
    expect(output.manifest.every((entry) => entry.versionId === openVersionId)).toBe(true);
  });
});
