import { describe, expect, it } from 'vitest';
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
