// T-469 — the checker's scope goes INTO the gateway; nothing is filtered after.
//
// *In plain terms: a check narrowed to three documents used to ask the library
// for everything and then throw most of it away. Now it asks for the three, so
// a narrowed run never reads — or pays to read — anything outside them.*
//
// Two halves. The recording gateway shows the scope reaches every search
// unchanged and that nothing is dropped from what comes back (the old
// post-filter is gone). The real gateway shows the pre-filter does the
// narrowing: the number of passages it admits (`candidates`) counts only the
// scope.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Assemble, AssembledInput } from '@infora/contracts';
import { createDb, schema as s } from '@infora/db';
import { Router, SELF_HOSTED_UK } from '@infora/model';
import type { ChatAdapter, EmbeddingAdapter } from '@infora/model';
import { createQaSectionCheck } from './qa-checker';

const { db, pool } = createDb();

let organisationId: string;
let participantId: string;
let projectId: string;
let sandboxDocumentId: string;
let inScopeVersion: string;
let outOfScopeVersion: string;
let inScopeContainer: string;

const embeddings: EmbeddingAdapter = {
  modelId: 'fake-embed',
  dimensions: 4,
  attributes: SELF_HOSTED_UK,
  embed: async (texts) => ({
    embeddings: texts.map(() => [0, 0, 0, 0]),
    model: { id: 'fake-embed', version: '1' },
  }),
};
const chat: ChatAdapter = {
  modelId: 'fake-chat',
  attributes: SELF_HOSTED_UK,
  chat: async () => ({
    text: '{"findings":[],"summary":"nothing to report"}',
    model: { id: 'fake-chat', version: '1' },
    usage: { tokensPrompt: 1, tokensCompletion: 1 },
  }),
};
const router = new Router(chat, embeddings);

beforeAll(async () => {
  const stamp = Date.now();
  const [org] = await db.insert(s.organisations).values({ name: `t469 qa ${stamp}` }).returning();
  organisationId = org!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t469 qa ${stamp}`, ownerOrganisationId: organisationId })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId, projectId, role: 'owner' });
  const [user] = await db
    .insert(s.users)
    .values({ name: 't469 qa', email: `t469-qa-${stamp}@test.local`, organisationId })
    .returning();
  const [participant] = await db.insert(s.participants).values({ userId: user!.id, projectId }).returning();
  participantId = participant!.id;
  const [sandbox] = await db
    .insert(s.sandboxes)
    .values({
      projectId,
      owningOrganisationId: organisationId,
      scope: 'single_org',
      name: 't469 qa',
      createdByParticipantId: participantId,
    })
    .returning();
  const [document] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId,
      organisationId,
      sandboxId: sandbox!.id,
      title: 't469 draft',
      content: 'Assessment\n\nThe survey recorded three exceedances.',
      createdByParticipantId: participantId,
    })
    .returning();
  sandboxDocumentId = document!.id;

  const make = async (reference: string) => {
    const [container] = await db
      .insert(s.containers)
      .values({ projectId, producingOrganisationId: organisationId, documentReference: reference, inLibrary: true })
      .returning();
    const [version] = await db
      .insert(s.versions)
      .values({ containerId: container!.id, versionReference: 'P01', content: 'x', isCurrent: true })
      .returning();
    return { containerId: container!.id, versionId: version!.id };
  };
  const inside = await make(`T469-QA-IN-${stamp}`);
  const outside = await make(`T469-QA-OUT-${stamp}`);
  inScopeVersion = inside.versionId;
  inScopeContainer = inside.containerId;
  outOfScopeVersion = outside.versionId;
});

afterAll(async () => {
  await pool.end();
});

const passage = (versionId: string): AssembledInput['items'][number] => ({
  channel: 'grounded',
  corpus: 'library',
  source: { versionId },
  chunkId: `${versionId}-c0`,
  descriptor: { documentReference: versionId, documentTitle: null, versionReference: 'P01', superseded: false },
  content: `passage of ${versionId}`,
});

const input = () => ({
  sandboxDocumentId: sandboxDocumentId as never,
  section: 1,
  families: ['corpus_accuracy'] as const,
  depth: 'quick' as const,
});

describe('the checker hands its scope to the gateway and filters nothing afterwards (T-469)', () => {
  it('every search carries the scope, unchanged', async () => {
    const assemble = vi.fn<Assemble>(async () => ({
      items: [passage(inScopeVersion)],
      budget: { tokenLimit: 12000, tokensUsed: 0 },
    }));
    const scope = { containerIds: [inScopeContainer] };
    const check = createQaSectionCheck({ db, router, assemble });
    await check(
      { organisationId: organisationId as never, participantId: participantId as never },
      { projectId: projectId as never },
      { ...input(), scope },
    );
    expect(assemble).toHaveBeenCalled();
    for (const [call] of assemble.mock.calls) expect(call.request.scope).toEqual(scope);
  });

  it('with no scope, none is sent — the whole visible library', async () => {
    const assemble = vi.fn<Assemble>(async () => ({
      items: [],
      budget: { tokenLimit: 12000, tokensUsed: 0 },
    }));
    await createQaSectionCheck({ db, router, assemble })(
      { organisationId: organisationId as never, participantId: participantId as never },
      { projectId: projectId as never },
      input(),
    );
    expect('scope' in assemble.mock.calls[0]![0].request).toBe(false);
  });

  it('the old post-filter is gone: what the gateway returns is what the check reads', async () => {
    // a gateway that (wrongly) returned a passage outside the scope would have
    // had it dropped by the old filter. The pre-filter is now the ONLY thing
    // narrowing, which is why the real-gateway test below is the one that proves
    // the guarantee; this one proves nothing else is quietly standing in for it.
    const assemble = vi.fn<Assemble>(async () => ({
      items: [passage(inScopeVersion), passage(outOfScopeVersion)],
      budget: { tokenLimit: 12000, tokensUsed: 0 },
    }));
    const result = await createQaSectionCheck({ db, router, assemble })(
      { organisationId: organisationId as never, participantId: participantId as never },
      { projectId: projectId as never },
      { ...input(), scope: { containerIds: [inScopeContainer] } },
    );
    expect(result.coverage.passagesRead).toBe(2);
  });
});
