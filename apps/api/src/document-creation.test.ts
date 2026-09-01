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
  ListStartingOutlinesResponse,
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
  // T-407 — the outline the author composed. The shipped `technical-note`
  // starting outline seeds exactly this; here it is written out, because that
  // is what a request now carries.
  sections: [
    { heading: 'Purpose', purpose: 'State what question this note answers and for whom.' },
    { heading: 'The evidence', purpose: 'Set out what the project record says.' },
    { heading: 'Implication', purpose: 'State what follows for the design or the programme.' },
  ],
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

  // T-407 — this test used to assert that naming a template this deployment
  // does not carry failed by NAMING the ones it does. That failure mode is gone
  // with the template lookup: the outline arrives composed. Its replacement is
  // the refusal that took its place — an outline that is not one.
  it('refuses an empty outline, and a section with no heading or no purpose', async () => {
    for (const bad of [
      { sections: [] },
      { sections: [{ heading: '', purpose: 'something' }] },
      { sections: [{ heading: 'Purpose', purpose: '' }] },
    ]) {
      const res = await post(
        cookie,
        `/projects/${projectId}/tools/document-creation/plan`,
        request(bad),
      );
      expect(res.status).toBe(400);
    }
  });

  // T-407 — the starting outlines are OFFERED, and offering them is all they
  // do: the run draws its shape from the body's sections, never from these.
  it('offers the starting outlines with their guidance as section purposes', async () => {
    const res = await app.request(
      `/projects/${projectId}/tools/document-creation/starting-outlines`,
      { headers: { cookie } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as ListStartingOutlinesResponse;
    const note = body.items.find((outline) => outline.id === 'technical-note');
    expect(note).toBeDefined();
    expect(note!.sections[0]!.heading).toBe('Purpose');
    // the template's per-part guidance BECOMES the section's purpose
    expect(note!.sections[0]!.purpose).toContain('what question this note answers');
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
    // T-407 — and the manifest names sections by the author's own headings
    expect(body.manifest.every((entry) => entry.usedFor !== 'purpose')).toBe(true);
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

  // T-408 (review) — THE CORRECTED BRIEF REACHES THE DRAFTING CALL, not just
  // the plan. The defect this pins was found once and fixed twice: the client
  // dropped `brief` from the run body (caught in T-404), and the step-input
  // parser then dropped it again on the server (caught in review) — so the
  // plan showed the author's correction and the document was drafted without
  // it, with every other test green either side. The only honest assertion is
  // at the far end: the words the author typed, in the prompt the model saw.
  it("drafts with the author's corrected brief, not the description it replaced (T-408)", async () => {
    const seen: string[] = [];
    const capturing = buildApp({
      db,
      sessionSecret: 'test-secret',
      router: fakeRouter((system, prompt) => {
        seen.push(`${system}\n${prompt}`);
        return 'The investigation recorded contamination exceedances. [S1]';
      }),
      workflows: loadWorkflows({ workers: createWorkerRegistry(), production: true }),
      workers: createWorkerRegistry(),
      modelRates: { 'fake-chat': { promptPerMTok: 3, completionPerMTok: 15 } },
      draftModelId: 'fake-chat',
    });
    const res = await capturing.request(`/projects/${projectId}/tools/document-creation/runs`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(
        request({
          sections: [
            { heading: 'Purpose', purpose: 'State what question this note answers and for whom.' },
            {
              heading: 'The evidence',
              purpose: 'Set out what the project record says.',
              brief: 'set out the recorded exceedances as bullets, one per trial pit',
            },
            { heading: 'Implication', purpose: 'State what follows for the design or the programme.' },
          ],
        }),
      ),
    });
    expect(res.status).toBe(201);
    const drafting = seen.filter((call) =>
      call.includes('set out the recorded exceedances as bullets, one per trial pit'),
    );
    expect(drafting.length).toBeGreaterThan(0);
    // and the brief REPLACED the planner's description rather than joining it
    expect(
      drafting.some((call) => call.includes('The evidence — Set out what the project record says.')),
    ).toBe(false);
  });

  // 🔒 T-409 (review) — THE TWO DOORS PRODUCE ONE PLAN, asserted through the
  // real doors. A brief revised by the agent endpoint — the model's actual
  // reply, through the actual parse — and the same words typed by hand must
  // yield byte-identical plans, because both are nothing but a parameter by
  // the time the planner sees them. (An earlier version of this test lived at
  // the planner and compared two identical literals, which could not fail.)
  it('🔒 an agent tweak and a hand edit of the same brief produce one plan (T-409)', async () => {
    const revised = 'Set out the three constraints in bullets, one per consent condition.';
    const agentApp = buildApp({
      db,
      sessionSecret: 'test-secret',
      router: fakeRouter(() => JSON.stringify({ brief: revised, followUp: null })),
      workflows: loadWorkflows({ workers: createWorkerRegistry(), production: true }),
      workers: createWorkerRegistry(),
      modelRates: { 'fake-chat': { promptPerMTok: 3, completionPerMTok: 15 } },
      draftModelId: 'fake-chat',
    });
    const revision = await agentApp.request(
      `/projects/${projectId}/tools/document-creation/section-brief/revision`,
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          heading: 'The evidence',
          purpose: 'Set out what the project record says.',
          brief: 'Set out what the project record says.',
          ask: 'no, this should set out the constraints in bullets',
        }),
      },
    );
    expect(revision.status).toBe(200);
    const { brief } = (await revision.json()) as { brief: string | null };
    expect(brief).toBe(revised);

    const sectionsWith = (theBrief: string) => [
      { heading: 'Purpose', purpose: 'State what question this note answers and for whom.' },
      { heading: 'The evidence', purpose: 'Set out what the project record says.', brief: theBrief },
      { heading: 'Implication', purpose: 'State what follows for the design or the programme.' },
    ];
    const byAgent = await post(
      cookie,
      `/projects/${projectId}/tools/document-creation/plan`,
      request({ sections: sectionsWith(brief!) }),
    );
    const byHand = await post(
      cookie,
      `/projects/${projectId}/tools/document-creation/plan`,
      request({ sections: sectionsWith(revised) }),
    );
    const agentPlan = (await byAgent.json()) as DocumentCreationPlanResponse;
    const handPlan = (await byHand.json()) as DocumentCreationPlanResponse;
    expect(JSON.stringify(agentPlan.plan.steps)).toBe(JSON.stringify(handPlan.plan.steps));
    expect(agentPlan).toEqual(handPlan);
  });
});

// ── T-412 — A SECTION CAN CARRY SUB-SECTIONS ───────────────────────────────
//
// *In plain terms: an author adds a sub-section under a section, and it becomes
// a separately-drafted part of the document that lands under its parent's
// heading.*
//
// **Asserted end to end, over HTTP, for the reason T-408's own test states.**
// A sub-section is not one feature in one place: the outline that leaves the
// browser, the parser that reads it back off the persisted step input, the
// prompt the model is shown, the splitter that files the answer, the manifest,
// the assembly and both coverage sentences all have to agree that a
// sub-section is a section of its own with a parent. Six of those could pass
// their own unit test while the document came out flat, which is exactly how
// T-408's corrected brief was dropped twice with everything green either side.
describe('sub-sections are sections of their own, with a parent (T-412)', () => {
  const withSubSections = () =>
    request({
      sections: [
        { heading: 'Purpose', purpose: 'State what question this note answers and for whom.' },
        {
          heading: 'The evidence',
          purpose: 'Set out what the project record says.',
          subSections: [
            { heading: 'Trial pits', purpose: 'What the trial pits recorded.' },
            { heading: 'Groundwater', purpose: 'What the monitoring showed.' },
          ],
        },
      ],
    });

  it('counts them in the plan’s coverage sentence, at whatever depth', async () => {
    const res = await post(
      cookie,
      `/projects/${projectId}/tools/document-creation/plan`,
      withSubSections(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as DocumentCreationPlanResponse;
    // two sections and two sub-sections is FOUR parts to draft. A coverage
    // sentence that said "2 sections" would be understating the run before it
    // started, which is the failure ADR-0053 §5 exists to prevent.
    expect(body.plan.coverage).toBe('4 sections · 1 bound source · 1 drafting pass');
  });

  it('describes each of them on the plan, marked at its depth and under its parent', async () => {
    const res = await post(
      cookie,
      `/projects/${projectId}/tools/document-creation/plan`,
      withSubSections(),
    );
    const body = (await res.json()) as DocumentCreationPlanResponse;
    const proposal = body.plan.proposal!;
    expect(proposal.sections.map((section) => section.heading)).toEqual([
      'Purpose',
      'The evidence',
      'Trial pits',
      'Groundwater',
    ]);
    expect(proposal.sections.map((section) => section.depth)).toEqual([0, 0, 1, 1]);
    // a sub-section's purpose was written knowing what sat above it, so the
    // description says whose it is rather than reading as a section that
    // wandered off the outline
    expect(proposal.sections[2]!.brief).toContain('It sits under “The evidence”');
  });

  it('🔒 the T-408 determinism guarantee still holds over a NESTED outline', async () => {
    // same inputs, same steps — the one thing a declared workflow is sold on,
    // asserted again at the depth this ticket added
    const first = await post(
      cookie,
      `/projects/${projectId}/tools/document-creation/plan`,
      withSubSections(),
    );
    const second = await post(
      cookie,
      `/projects/${projectId}/tools/document-creation/plan`,
      withSubSections(),
    );
    expect(await first.json()).toEqual(await second.json());
  });

  it('puts every sub-section in the DRAFTING PROMPT, numbered under its parent', async () => {
    // the far-end assertion T-408's test argues for: the words the model
    // actually saw. A sub-section the surface drew, the plan counted and the
    // prompt left out would be a document silently missing a part.
    const seen: string[] = [];
    const capturing = buildApp({
      db,
      sessionSecret: 'test-secret',
      router: fakeRouter((system, prompt) => {
        seen.push(`${system}\n${prompt}`);
        return [
          '## Purpose',
          'This note answers what the ground investigation recorded. [S1]',
          '## The evidence',
          'The record covers three trial pits. [S1]',
          '## Trial pits',
          'The investigation recorded exceedances at three of the trial pits. [S1]',
          '## Groundwater',
          'The monitoring recorded no exceedance. [S1]',
        ].join('\n\n');
      }),
      workflows: loadWorkflows({ workers: createWorkerRegistry(), production: true }),
      workers: createWorkerRegistry(),
      modelRates: { 'fake-chat': { promptPerMTok: 3, completionPerMTok: 15 } },
      draftModelId: 'fake-chat',
    });
    const res = await capturing.request(
      `/projects/${projectId}/tools/document-creation/runs`,
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(withSubSections()),
      },
    );
    expect(res.status).toBe(201);
    const drafting = seen.find((call) => call.includes('Write the document under these headings'))!;
    expect(drafting).toBeDefined();
    expect(drafting).toContain('2.1 Trial pits — What the trial pits recorded.');
    expect(drafting).toContain('2.2 Groundwater — What the monitoring showed.');
  });

  it('writes them into the document UNDER THEIR PARENT’S HEADING, and counts them', async () => {
    const capturing = buildApp({
      db,
      sessionSecret: 'test-secret',
      router: fakeRouter(() =>
        [
          '## Purpose',
          'This note answers what the ground investigation recorded. [S1]',
          '## The evidence',
          'The record covers three trial pits. [S1]',
          '## Trial pits',
          'The investigation recorded exceedances at three of the trial pits. [S1]',
          '## Groundwater',
          'The monitoring recorded no exceedance at the standpipes. [S1]',
        ].join('\n\n'),
      ),
      workflows: loadWorkflows({ workers: createWorkerRegistry(), production: true }),
      workers: createWorkerRegistry(),
      modelRates: { 'fake-chat': { promptPerMTok: 3, completionPerMTok: 15 } },
      draftModelId: 'fake-chat',
    });
    const res = await capturing.request(`/projects/${projectId}/tools/document-creation/runs`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(withSubSections()),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as DocumentCreationRunResponse;
    const [document] = await db
      .select()
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, body.documentId!));
    const content = document!.content;
    // the parent stays `##` and its sub-sections are `###` beneath it, in
    // order — which is the whole of "the document carries them under their
    // parent's heading" once it reaches the file
    expect(content).toContain('## The evidence');
    expect(content).toContain('### Trial pits');
    expect(content).toContain('### Groundwater');
    expect(content.indexOf('## The evidence')).toBeLessThan(content.indexOf('### Trial pits'));
    expect(content.indexOf('### Trial pits')).toBeLessThan(content.indexOf('### Groundwater'));
    // and both coverage sentences count four parts, not two
    expect(body.plan.coverage).toContain('4 sections');
    expect(body.coverage).toContain('4 of 4 sections written');
    // the manifest names a sub-section under its parent, because "Trial pits"
    // on its own is a heading a reader cannot locate in a long document
    expect(body.manifest.map((entry) => entry.usedFor)).toContain('The evidence — Trial pits');
  });
});
