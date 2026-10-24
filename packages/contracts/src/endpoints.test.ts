import { describe, expect, it } from 'vitest';
import type { Citation } from './shared';
import type { GetPassageResponse } from './endpoints';
import {
  createConversationBody,
  createRunBody,
  createSandboxDocumentBody,
  createSessionBody,
  patchSandboxDocumentBody,
  resolveSuggestionBody,
} from './endpoints';

const uuid = '3f8a2c1e-9b4d-4f6a-8c2e-1d5b7a9f0e3c';

describe('request-body schemas (contracts §3)', () => {
  it('createConversationBody accepts the three surfaces, rejects others', () => {
    expect(createConversationBody.safeParse({ surface: 'web' }).success).toBe(true);
    expect(
      createConversationBody.safeParse({ surface: 'copilot', workItemId: uuid }).success,
    ).toBe(true);
    expect(createConversationBody.safeParse({ surface: 'mobile' }).success).toBe(false);
    expect(
      createConversationBody.safeParse({ surface: 'web', workItemId: 'not-a-uuid' }).success,
    ).toBe(false);
  });

  it('createRunBody requires non-empty request text', () => {
    expect(createRunBody.safeParse({ request: 'Draft the summary' }).success).toBe(true);
    expect(
      createRunBody.safeParse({ request: 'Draft it here', sandboxDocumentId: uuid }).success,
    ).toBe(true);
    expect(createRunBody.safeParse({ request: '' }).success).toBe(false);
  });

  it("resolveSuggestionBody: editedContent required iff resolution is 'edited'", () => {
    expect(resolveSuggestionBody.safeParse({ resolution: 'accepted' }).success).toBe(true);
    expect(resolveSuggestionBody.safeParse({ resolution: 'rejected' }).success).toBe(true);
    expect(
      resolveSuggestionBody.safeParse({ resolution: 'edited', editedContent: 'revised' }).success,
    ).toBe(true);
    expect(resolveSuggestionBody.safeParse({ resolution: 'edited' }).success).toBe(false);
    expect(
      resolveSuggestionBody.safeParse({ resolution: 'accepted', editedContent: 'stray' }).success,
    ).toBe(false);
  });

  it('sandbox-document bodies validate title and content', () => {
    expect(createSandboxDocumentBody.safeParse({ title: 'Options note' }).success).toBe(true);
    expect(createSandboxDocumentBody.safeParse({ title: '' }).success).toBe(false);
    expect(patchSandboxDocumentBody.safeParse({ content: '' }).success).toBe(true); // clearing is a valid manual edit
    expect(patchSandboxDocumentBody.safeParse({}).success).toBe(false);
  });

  it('createSessionBody requires a well-formed email and a password', () => {
    expect(
      createSessionBody.safeParse({ email: 'ines@wrenfield.example', password: 'pw' }).success,
    ).toBe(true);
    expect(createSessionBody.safeParse({ email: 'not-an-email', password: 'pw' }).success).toBe(
      false,
    );
    expect(
      createSessionBody.safeParse({ email: 'ines@wrenfield.example', password: '' }).success,
    ).toBe(false);
  });
});

// T-468 — the passage read and the citation's recorded chunk (shapes only; the
// behaviour is the API and knowledge tests')
describe('passage read (T-468)', () => {
  it('a held passage carries its text and locator; a gone one is null with held:false', () => {
    const held: GetPassageResponse = {
      versionId: uuid,
      chunkId: uuid,
      containerId: uuid,
      documentReference: 'WA-ENV-WQ-001',
      documentTitle: null,
      versionReference: 'C01',
      containerState: 'superseded',
      isCurrent: false,
      passage: { chunkIndex: 0, page: 14, paragraph: 3, span: { start: 1, end: 9 }, verbatim: 'a passage' },
      held: true,
      currency: null,
    };
    const gone: GetPassageResponse = { ...held, passage: null, held: false };
    expect(held.passage?.verbatim).toBe('a passage');
    expect(gone.passage).toBeNull();
  });

  it('a citation may carry the chunk it was written from; an authority reference has none', () => {
    const library: Citation = {
      id: uuid,
      chunkId: uuid,
      source: { versionId: uuid, documentReference: 'WA-ENV-WQ-001' },
    };
    const authority: Citation = { id: uuid, source: { authorityRef: 'EIA Regs 2017' } };
    expect(library.chunkId).toBe(uuid);
    expect(authority.chunkId).toBeUndefined();
  });
});
