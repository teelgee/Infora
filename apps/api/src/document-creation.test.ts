// T-309 acceptance — the document creator's DAG, over HTTP.
//
// Three properties carry the ticket, and none of them is "it drafts":
//
//   * **the plan is computed in CODE and shown before the click**, with a price
//     that is `null` where the deployment priced nothing and never 0
//     (ADR-0053 §4, T-254);
//   * **coverage is stated twice, in the same shape** — before the run in the
//     plan and after it beside the output (ADR-0053 §5), so an empty document
//     and a full one are told apart by the sentence rather than by the reader;
//   * **the write happens because a declared workflow said it would** — the
//     definition declares `writes: sandbox_document` and its label propagation,
//     which is the only reason T-396's executor lets `document_builder` run at
//     all.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { ingestVersion } from '@infora/data';
import { createDb, hashPassword, schema as s } from '@infora/db';
import type {
  DocumentCreationPlanResponse,
  DocumentCreationRunResponse,
} from '@infora/contracts';
import { loadWorkflows } from '@infora/workflows';
import { createWorkerRegistry } from '@infora/capabilities';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const router = fakeRouter();
const app = buildApp({
  db,
  sessionSecret: 'test-secret',
  router,
  workflows: loadWorkflows({ workers: createWorkerRegistry(), production: true }),
  workers: createWorkerRegistry(),
  // priced, so the plan can state a number rather than "not priced"
  modelRates: { 'fake-chat': { promptPerMTok: 3, completionPerMTok: 15 } },
  draftModelId: 'fake-chat',
});

const stamp = Date.now();
const password = 'pw-t309';

let projectId: string;
let cookie: string;
let strangerCookie: string;
let sandboxId: string;
let foreignSandboxId: string;
let versionId: string;

const post = (who: string, path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { cookie: who, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const request = (overrides: Record<string, unknown> = {}) => ({
  templateId: 'technical-note',
  brief: 'what did the ground investigation record?',
  // T-406 — the launcher's four answers, at their defaults
  purpose: 'technical-note',
  language: 'technical',
  documentType: 'whole-document',
  styleGuideIds: [],
  sourceVersionIds: [versionId],
  destinationSandboxId: sandboxId,
  title: 't309 built note',
  ...overrides,
});

beforeAll(async () => {
  const [owner] = await db.insert(s.organisations).values({ name: `t309 owner ${stamp}` }).returning();
  const [outside] = await db.insert(s.organisations).values({ name: `t309 outside ${stamp}` }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t309 project ${stamp}`, ownerOrganisationId: owner!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId: owner!.id, projectId, role: 'owner' });

  const make = async (name: string, organisationId: string, onProject: string | null) => {
    const email = `${name}-${stamp}@test.local`;
    const [user] = await db.insert(s.users).values({ name, email, organisationId }).returning();
    await db
      .insert(s.userCredentials)
      .values({ userId: user!.id, passwordHash: hashPassword(password) });
    let participantId: string | undefined;
    if (onProject !== null) {
      const [participant] = await db
        .insert(s.participants)
        .values({ userId: user!.id, projectId: onProject })
        .returning();
      participantId = participant!.id;
    }
    const res = await app.request('/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return { cookie: res.headers.get('set-cookie')!.split(';')[0]!, participantId };
  };

  const author = await make('t309-ada', owner!.id, projectId);
  cookie = author.cookie;
  strangerCookie = (await make('t309-sam', outside!.id, null)).cookie;

  const [sandbox] = await db
    .insert(s.sandboxes)
    .values({
      projectId,
      owningOrganisationId: owner!.id,
      scope: 'single_org',
      name: 't309 sandbox',
      createdByParticipantId: author.participantId!,
    })
    .returning();
  sandboxId = sandbox!.id;
  await db.insert(s.sandboxScopeGrants).values({
    sandboxId,
    granteeType: 'organisation',
    organisationId: owner!.id,
    grantedByParticipantId: author.participantId!,
  });

  // a sandbox on ANOTHER project: reachable to nobody here, and the request
  // naming it must read as nonexistence rather than as a refusal
  const [elsewhere] = await db
    .insert(s.projects)
    .values({ name: `t309 elsewhere ${stamp}`, ownerOrganisationId: owner!.id })
    .returning();
  const [foreign] = await db
    .insert(s.sandboxes)
    .values({
      projectId: elsewhere!.id,
      owningOrganisationId: owner!.id,
      scope: 'single_org',
      name: 't309 foreign',
      createdByParticipantId: author.participantId!,
    })
    .returning();
  foreignSandboxId = foreign!.id;

  const [container] = await db
    .insert(s.containers)
    .values({
      projectId,
      producingOrganisationId: owner!.id,
      documentReference: `T309-GI-${stamp}`,
      inLibrary: true,
    })
    .returning();
  const [version] = await db
    .insert(s.versions)
    .values({
      containerId: container!.id,
      versionReference: 'P01',
      content: 'The ground investigation recorded exceedances at three of the trial pits.',
    })
    .returning();
  versionId = version!.id;
  // indexed, so the builder's gateway call actually reaches the passage
  await ingestVersion(db, router, versionId);
});

afterAll(async () => {
  await pool.end();
});

describe('the plan, before the click (T-309, ADR-0053 §4)', () => {
  it('names its steps, prices them, and states what the run will cover', async () => {
    const res = await post(cookie, `/projects/${projectId}/tools/document-creation/plan`, request());
    expect(res.status).toBe(200);
    const { plan } = (await res.json()) as DocumentCreationPlanResponse;

    expect(plan.workflowId).toBe('document-creation');
    // one step, and the single step is the design: the builder does not
    // retrieve, so a search step here would spend money and change nothing
    expect(plan.steps.map((step) => step.worker)).toEqual(['document_builder']);
    expect(plan.steps[0]!.label).toContain('Draft 3 sections');
    expect(plan.cost.priced).toBe(true);
    expect(plan.cost.total).toBeGreaterThan(0);
    // the coverage sentence, before anything runs
    expect(plan.coverage).toBe('3 sections · 1 bound source · 1 drafting pass');
    expect(plan.refusal).toBeNull();
  });

  it('IS THE SAME PLAN TWICE — a plan a model chose would not be', async () => {
    const once = await post(cookie, `/projects/${projectId}/tools/document-creation/plan`, request());
    const twice = await post(cookie, `/projects/${projectId}/tools/document-creation/plan`, request());
    expect(await twice.json()).toEqual(await once.json());
  });

  it('an unpriced deployment reports `null`, NEVER a plausible zero', async () => {
    // T-254's rule reaching the estimate: zero is a price, null is nobody
    // priced it, and a plausible zero is what a business case gets built on
    const unpriced = buildApp({
      db,
      sessionSecret: 'test-secret',
      router,
      workflows: loadWorkflows({ workers: createWorkerRegistry(), production: true }),
      workers: createWorkerRegistry(),
    });
    const res = await unpriced.request(
      `/projects/${projectId}/tools/document-creation/plan`,
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(request()),
      },
    );
    const { plan } = (await res.json()) as DocumentCreationPlanResponse;
    expect(plan.cost.priced).toBe(false);
    expect(plan.cost.total).toBeNull();
    expect(plan.steps[0]!.estimate.cost).toBeNull();
  });

  it('REFUSES IN THE PLAN, before any spend, when nothing is bound to draft from', async () => {
    // ADR-0053 §5 — refusal is reserved for the pathological case and is said
    // before the click, never as a caveat under an empty document
    const res = await post(
      cookie,
      `/projects/${projectId}/tools/document-creation/plan`,
      request({ sourceVersionIds: [] }),
    );
    const { plan } = (await res.json()) as DocumentCreationPlanResponse;
    expect(plan.refusal).toContain('No sources are bound');

    // and the run endpoint HONOURS it rather than treating it as advice
    const run = await post(
      cookie,
      `/projects/${projectId}/tools/document-creation/runs`,
      request({ sourceVersionIds: [] }),
    );
    expect(run.status).toBe(400);
  });

  it('names the templates it has rather than failing opaquely', async () => {
    const res = await post(
      cookie,
      `/projects/${projectId}/tools/document-creation/plan`,
      request({ templateId: 'not-a-template' }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { detail: string }).detail).toContain('technical-note');
  });

  it('a destination the requester cannot reach is nonexistence, not a refusal', async () => {
    const res = await post(
      cookie,
      `/projects/${projectId}/tools/document-creation/plan`,
      request({ destinationSandboxId: foreignSandboxId }),
    );
    expect(res.status).toBe(404);
  });

  it('and the project itself is nonexistence to somebody not on it', async () => {
    const res = await post(
      strangerCookie,
      `/projects/${projectId}/tools/document-creation/plan`,
      request(),
    );
    expect(res.status).toBe(404);
  });
});

describe('the run (T-309)', () => {
  it('drafts into the template, records the manifest, and states coverage AFTER in the same shape', async () => {
    const res = await post(cookie, `/projects/${projectId}/tools/document-creation/runs`, request());
    expect(res.status).toBe(201);
    const body = (await res.json()) as DocumentCreationRunResponse;

    expect(body.documentId).not.toBeNull();
    expect(body.run.state).toBe('completed');
    // the manifest records what each source was USED FOR — the difference
    // between "these documents were in scope" and "this section rests on this"
    expect(body.manifest.length).toBeGreaterThan(0);
    expect(body.manifest[0]!.versionId).toBe(versionId);
    // both labels named, always — a refusal a user cannot act on reads as a
    // broken system rather than a careful one
    expect(body.label.computed).toBeDefined();
    expect(body.label.destination).toBeDefined();
    expect(body.label.refusal).toBeNull();
    // the SAME SHAPE as the plan's own sentence, so the difference between what
    // was promised and what happened is visible at a glance
    expect(body.coverage).toContain('of 3 sections written');
    expect(body.coverage).toContain('of 1 bound sources used');
    // and the plan the run executed is the plan the user was shown
    expect(body.plan.coverage).toBe('3 sections · 1 bound source · 1 drafting pass');
    // T-402 — the tally counts sections OF THE OUTLINE. The `unsectioned`
    // bucket is a report of where words went, never a section written, and a
    // count that included it once said "1 of 4 sections written" into an empty
    // document.
    const outlineSections = new Set(
      body.manifest.map((entry) => entry.usedFor).filter((usedFor) => usedFor !== 'unsectioned'),
    ).size;
    expect(body.coverage.startsWith(`${outlineSections} of 3 sections written`)).toBe(true);
  });

  it('writes a real sandbox document under the template’s own headings', async () => {
    const res = await post(cookie, `/projects/${projectId}/tools/document-creation/runs`, request());
    const body = (await res.json()) as DocumentCreationRunResponse;
    const [document] = await db
      .select()
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, body.documentId!));
    expect(document!.title).toBe('t309 built note');
    expect(document!.sandboxId).toBe(sandboxId);
  });

  it('records the drafting cost on the Step row the executor opened (T-396)', async () => {
    const res = await post(cookie, `/projects/${projectId}/tools/document-creation/runs`, request());
    const body = (await res.json()) as DocumentCreationRunResponse;
    const drafting = body.run.steps.find((step) => step.type === 'document_builder');
    expect(drafting).toBeDefined();
    // per-step cost attribution, which could not work before the executor
    // opened the row a cost is recorded on
    expect(drafting!.usage?.cost).not.toBeNull();
  });

  // T-410 (ADR-0053 addendum A3) — the price came OFF THE SCREEN and stayed in
  // the record. This is the half of that ruling nothing else would catch: a
  // later tidy-up that removed the estimate from the plan object, or the cost
  // from the Step row, would look like finishing the job and would quietly
  // destroy an audit and operations fact.
  it('still records cost per step and still computes the estimate, with neither shown (T-410)', async () => {
    const res = await post(cookie, `/projects/${projectId}/tools/document-creation/runs`, request());
    const body = (await res.json()) as DocumentCreationRunResponse;
    for (const step of body.run.steps) {
      // every step the executor opened carries its own usage record
      expect(step.usage).toBeDefined();
    }
    // and the plan still carries its estimate — it is simply not rendered
    expect(body.plan.cost).toBeDefined();
    expect(typeof body.plan.cost.priced).toBe('boolean');
  });
});
