// T-469 acceptance — a scope on the request, and the reach it comes back with.
//
// *In plain terms: ask a question limited to one document and the run says what
// it was told to read and what it actually read, and the three numbers agree —
// what was read is no more than what was in scope, and what was in scope is no
// more than what the asker could see. A person in another organisation who names
// that document gets nothing back and nothing counted.*
//
// API-driven, like the other wall specs: the interesting half is the numbers and
// the refusal, and the browser half (the control and the sentence on screen) is
// T-470's.
import { expect, test } from '@playwright/test';
import type {
  CreateConversationResponse,
  GetGroundingScopeResponse,
  GetLibraryResponse,
  MeResponse,
  Run,
} from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

const ORG_C_DELIVERABLE = 'WA-ECO-PEA-001'; // Redgate produced it, shared it with nobody

test('Ask with a scope of one document: the reach is recorded and the counts agree', async () => {
  const eleanor = await ApiSession.login(SEEDED.consultant); // Org B
  const nadia = await ApiSession.login(SEEDED.secondConsultant); // Org C
  const projectId = (await eleanor.get<MeResponse>('/me')).participants[0]!.projectId;

  const ask = async (session: ApiSession, scope?: unknown) => {
    const { conversationId } = await session.post<CreateConversationResponse>(
      `/projects/${projectId}/conversations`,
      { surface: 'web' },
    );
    return session.raw('post', `/conversations/${conversationId}/runs`, {
      request: 'What did the ground investigation record?',
      ...(scope !== undefined && { scope }),
    });
  };

  // a document Eleanor can actually be grounded on (the same list the chip reads)
  const { sources } = await eleanor.get<GetGroundingScopeResponse>(`/projects/${projectId}/grounding-scope`);
  expect(sources.length).toBeGreaterThan(1);
  const chosen = sources[0]!;

  // ── the unscoped run: the whole visible library ────────────────────────────
  const whole = (await (await ask(eleanor)).json()) as Run;
  expect(whole.reach).toBeDefined();
  expect(whole.reach!.leftOutByScope).toBe(0);
  expect(whole.reach!.inScope).toBe(whole.reach!.visibleLive);

  // ── the scoped run: exactly one document ───────────────────────────────────
  const res = await ask(eleanor, { containerIds: [chosen.containerId] });
  expect(res.status()).toBe(201);
  const run = (await res.json()) as Run;
  const reach = run.reach!;
  expect(reach.inScope).toBe(1);
  // the scope left out what was left, and the parts add up
  expect(reach.leftOutByScope).toBe(reach.visibleLive - 1);
  expect(reach.visibleLive).toBe(whole.reach!.visibleLive);
  // read ≤ in scope ≤ visible, and `read` is the audit rolled up: the one
  // document, and nothing outside it, is in any step's source set
  expect(reach.read).toBeLessThanOrEqual(reach.inScope);
  expect(reach.inScope).toBeLessThanOrEqual(reach.visibleLive);
  expect(reach.read).toBe(1);
  const versionIds = new Set(
    run.steps.flatMap((step) => step.sourceSet).flatMap((source) => ('versionId' in source ? [source.versionId] : [])),
  );
  expect(versionIds.has(chosen.versionId)).toBe(true);
  for (const id of versionIds) expect(id).toBe(chosen.versionId);

  // ── the wall: B naming C's unshared deliverable gets nothing and a refusal ─
  const library = await nadia.get<GetLibraryResponse>(`/projects/${projectId}/library`);
  const theirs = library.items.find((item) => item.documentReference === ORG_C_DELIVERABLE)!;
  const refused = await ask(eleanor, { containerIds: [theirs.containerId] });
  expect(refused.status()).toBe(400);
  expect(((await refused.json()) as { detail: string }).detail).toContain('Your scope leaves nothing to read');

  // …and an empty scope is a 400 in words, never a quiet "everything"
  const empty = await ask(eleanor, { containerIds: [] });
  expect(empty.status()).toBe(400);
  expect(((await empty.json()) as { detail: string }).detail).toContain('a scope must name at least one');

  await eleanor.dispose();
  await nadia.dispose();
});
