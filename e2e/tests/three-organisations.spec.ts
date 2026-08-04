// T-300 — three organisations on one project, and the wall between the two
// consultants. [v1.md]'s first end-to-end negative, stated as a test rather
// than as a property taken on trust:
//
//   "An Org C user sees nothing of Org B's sandbox work — enforced at the
//    database, not only the application."
//
// Trentmoor Energy is Org A (owner), Calder & Hale is Org B, Redgate Ecology is
// Org C. All three hold a live Membership on Wrenfield, which is what makes
// this different from the existing wall negatives: those subjects are outside
// the project, and the interesting failure is between two organisations who are
// both legitimately inside it.
//
// The positives matter as much as the negatives here. A test that only asserts
// 404s would pass just as well against a broken project, so each half checks
// that the party who SHOULD see the thing does.
import { expect, test } from '@playwright/test';
import type {
  GetLibraryResponse,
  MeResponse,
  ListSandboxDocumentsResponse,
  SandboxDocument,
} from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

const ORG_C_DELIVERABLE = 'WA-ECO-PEA-001'; // Redgate produced it, shared it with nobody
const ORG_C_SANDBOX_DOC = 'Bat activity survey — working notes';

test('three organisations on one project: B and C are both inside it, and invisible to each other', async () => {
  const rachel = await ApiSession.login(SEEDED.owner); // Org A — owns the library
  const eleanor = await ApiSession.login(SEEDED.consultant); // Org B
  const nadia = await ApiSession.login(SEEDED.secondConsultant); // Org C

  // ── Org C really is on the project, or every negative below is vacuous ─────
  const nadiaMe = await nadia.get<MeResponse>('/me');
  const projectId = nadiaMe.participants[0]!.projectId;
  expect(nadiaMe.participants[0]!.projectName).toBe('Wrenfield–Ashcombe 400kV Connection');

  const eleanorMe = await eleanor.get<MeResponse>('/me');
  expect(eleanorMe.participants[0]!.projectId).toBe(projectId); // the same project

  // ── the library: C produced a deliverable and shared it with nobody ────────
  const refs = async (session: ApiSession) =>
    (await session.get<GetLibraryResponse>(`/projects/${projectId}/library`)).items.map(
      (i) => i.documentReference,
    );

  // the producer sees its own
  expect(await refs(nadia)).toContain(ORG_C_DELIVERABLE);
  // the OWNER sees it too — visibility is producer | project owner | live share
  // (ADR-0016 as data), so this is the control: the document exists, is live,
  // and is in the library. Only the share is missing.
  expect(await refs(rachel)).toContain(ORG_C_DELIVERABLE);
  // and Org B, inside the same project, sees nothing of it
  expect(await refs(eleanor)).not.toContain(ORG_C_DELIVERABLE);

  // ── the sandbox, both ways ────────────────────────────────────────────────
  const sandboxTitles = async (session: ApiSession) =>
    (
      await session.get<ListSandboxDocumentsResponse>(`/projects/${projectId}/sandbox-documents`)
    ).items.map((d) => d.title);

  // C's seeded working notes: C sees them, B does not
  expect(await sandboxTitles(nadia)).toContain(ORG_C_SANDBOX_DOC);
  expect(await sandboxTitles(eleanor)).not.toContain(ORG_C_SANDBOX_DOC);

  // and the direction v1.md's acceptance names, created here rather than seeded
  // so it is B's *live* work rather than a fixture: Org C sees nothing of it
  const stamp = Date.now();
  const bDraft = await eleanor.post<SandboxDocument>(`/projects/${projectId}/sandbox-documents`, {
    title: `Org B land quality draft ${stamp}`,
  });
  expect(await sandboxTitles(eleanor)).toContain(`Org B land quality draft ${stamp}`);
  expect(await sandboxTitles(nadia)).not.toContain(`Org B land quality draft ${stamp}`);

  // naming the id directly is refused the same way — denial and nonexistence
  // read identically (contracts principle 4), so it is 404 and not 403
  const direct = await nadia.raw('get', `/sandbox-documents/${bDraft.id}`);
  expect(direct.status()).toBe(404);

  await Promise.all([rachel.dispose(), eleanor.dispose(), nadia.dispose()]);
});
