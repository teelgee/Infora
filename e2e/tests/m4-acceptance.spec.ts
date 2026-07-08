// T-054 — the M4 acceptance test, on the harness substrate: each of the
// three resolutions writes exactly one Signal per Suggestion (sunk nowhere —
// nothing consumes it, by design); accept/edit lands the content in the
// sandbox document, reject leaves it untouched; a re-draft opens a new Run
// on the same Work item leaving the first intact; a manual edit produces no
// Suggestion and no Signal.
import { expect, test } from '@playwright/test';
import type {
  CreateConversationResponse,
  ListSuggestionsResponse,
  ListWorkItemsResponse,
  ResolveSuggestionResponse,
  Run,
  SandboxDocument,
} from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

// the fake providers' deterministic draft: one grounded claim survives
const SURVIVING = 'The investigation recorded contamination exceedances.';

test.describe.configure({ mode: 'serial' });

let consultant: ApiSession;
let projectId: string;
let workItemId: string;
let conversationId: string;
let documentId: string;

test.beforeAll(async () => {
  consultant = await ApiSession.login(SEEDED.consultant);
  const me = await consultant.get<{ participants: Array<{ projectId: string }> }>('/me');
  projectId = me.participants[0]!.projectId;
  const workItems = await consultant.get<ListWorkItemsResponse>(`/projects/${projectId}/work-items`);
  workItemId = workItems.items[0]!.id;

  const doc = await consultant.post<SandboxDocument>(`/projects/${projectId}/sandbox-documents`, {
    title: `T-054 acceptance ${Date.now()}`,
  });
  documentId = doc.id;
  const conversation = await consultant.post<CreateConversationResponse>(
    `/projects/${projectId}/conversations`,
    { surface: 'web', workItemId },
  );
  conversationId = conversation.conversationId;
});

test.afterAll(async () => {
  await consultant.dispose();
});

async function draft(): Promise<Run> {
  return consultant.post<Run>(`/conversations/${conversationId}/runs`, {
    request: 'Draft the contamination summary',
    sandboxDocumentId: documentId,
  });
}

const readDoc = () => consultant.get<SandboxDocument>(`/sandbox-documents/${documentId}`);
const suggestionsOf = () =>
  consultant.get<ListSuggestionsResponse>(`/sandbox-documents/${documentId}/suggestions`);

test('accept: one Signal, content lands in the sandbox document', async () => {
  const run = await draft();
  expect(run.suggestions).toHaveLength(1);

  const resolved = await consultant.post<ResolveSuggestionResponse>(
    `/suggestions/${run.suggestions[0]!.id}/resolution`,
    { resolution: 'accepted' },
  );
  expect(resolved.sandboxDocument?.content).toBe(SURVIVING);

  // exactly one Signal: it now rides the suggestion, and a second resolution conflicts
  const { items } = await suggestionsOf();
  expect(items.find((sg) => sg.id === run.suggestions[0]!.id)?.signal?.resolution).toBe('accepted');
  const again = await consultant.raw('post', `/suggestions/${run.suggestions[0]!.id}/resolution`, {
    resolution: 'rejected',
  });
  expect(again.status()).toBe(409);
});

test('edit: one Signal, the edited content lands — and the re-draft left run 1 intact', async () => {
  const first = (await consultant.get<{ runs: Run[] }>(`/conversations/${conversationId}`)).runs[0]!;

  const run = await draft(); // the re-draft: a new Run on the same Work item
  expect(run.id).not.toBe(first.id);

  const resolved = await consultant.post<ResolveSuggestionResponse>(
    `/suggestions/${run.suggestions[0]!.id}/resolution`,
    { resolution: 'edited', editedContent: 'The refined, human-edited paragraph.' },
  );
  expect(resolved.sandboxDocument?.content).toBe(
    `${SURVIVING}\n\nThe refined, human-edited paragraph.`,
  );

  // the first run's record is untouched by the second (append-only)
  const firstAgain = await consultant.get<Run>(`/runs/${first.id}`);
  expect(firstAgain.state).toBe('completed');
  expect(firstAgain.steps.map((st) => st.id)).toEqual(first.steps.map((st) => st.id));
});

test('reject: one Signal, the document untouched', async () => {
  const before = (await readDoc()).content;
  const run = await draft();

  const resolved = await consultant.post<ResolveSuggestionResponse>(
    `/suggestions/${run.suggestions[0]!.id}/resolution`,
    { resolution: 'rejected' },
  );
  expect(resolved.sandboxDocument).toBeUndefined();
  expect((await readDoc()).content).toBe(before);

  const { items } = await suggestionsOf();
  expect(items.find((sg) => sg.id === run.suggestions[0]!.id)?.signal?.resolution).toBe('rejected');
});

test('a manual edit produces no Suggestion and no Signal', async () => {
  const before = await suggestionsOf();

  const patched = await consultant.patch<SandboxDocument>(`/sandbox-documents/${documentId}`, {
    content: 'Typed by hand, as if AI did not exist.',
  });
  expect(patched.content).toBe('Typed by hand, as if AI did not exist.');

  const after = await suggestionsOf();
  expect(after.items.map((sg) => sg.id).sort()).toEqual(before.items.map((sg) => sg.id).sort());
  expect(after.items.map((sg) => sg.signal?.resolution).sort()).toEqual(
    before.items.map((sg) => sg.signal?.resolution).sort(),
  );
});
