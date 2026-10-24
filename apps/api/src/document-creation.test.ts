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
  StartingOutline,
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
/** T-414 — an ordinary member of the author's own firm */
let colleagueCookie: string;
/** T-414 — an admin of a DIFFERENT organisation, on the same project */
let otherOrgCookie: string;
let sandboxId: string;
let foreignSandboxId: string;
let versionId: string;
let containerId: string;

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
  // T-469 — the part of the library the draft may draw on, as a scope
  scope: { containerIds: [containerId] },
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

  const make = async (
    name: string,
    organisationId: string,
    onProject: string | null,
    orgRole: 'admin' | 'member' = 'member',
  ) => {
    const email = `${name}-${stamp}@test.local`;
    const [user] = await db
      .insert(s.users)
      .values({ name, email, organisationId, orgRole })
      .returning();
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

  // the author is her firm's admin — T-414's curator tier is the rulebook's
  // (`orgRole === 'admin'`), so the retire path needs one
  const author = await make('t309-ada', owner!.id, projectId, 'admin');
  cookie = author.cookie;
  strangerCookie = (await make('t309-sam', outside!.id, null)).cookie;
  // an ordinary member of the SAME firm: A5 says anyone in the firm saves, and
  // only a curator retires, so both halves need a subject
  colleagueCookie = (await make('t309-cal', owner!.id, projectId)).cookie;

  // T-414 — a SECOND ORGANISATION ON THE SAME PROJECT. The wall assertion this
  // ticket needs is not "somebody off the project sees nothing" (which every
  // route already gives); it is that a firm's saved outlines are invisible to
  // a colleague-organisation working the same job. That needs a participant
  // who passes the entitlement check and still sees none of them.
  const [member] = await db
    .insert(s.organisations)
    .values({ name: `t309 member ${stamp}` })
    .returning();
  await db
    .insert(s.memberships)
    .values({ organisationId: member!.id, projectId, role: 'member' });
  otherOrgCookie = (await make('t309-mo', member!.id, projectId, 'admin')).cookie;

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
  containerId = container!.id;
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
    expect(plan.coverage).toBe('3 sections · 1 drafting pass. 1 document can be read.');
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

  it('REFUSES IN THE PLAN, before any spend, when the scope leaves nothing to read (T-469)', async () => {
    // ADR-0053 §5 — refusal is reserved for the pathological case and is said
    // before the click, never as a caveat under an empty document. The scope
    // names a document that does not exist for this requester: it admits
    // nothing, and says so in words.
    const nothing = { scope: { containerIds: [crypto.randomUUID()] } };
    const res = await post(cookie, `/projects/${projectId}/tools/document-creation/plan`, request(nothing));
    const { plan } = (await res.json()) as DocumentCreationPlanResponse;
    expect(plan.refusal).toContain('Your scope leaves nothing to read');

    // and the run endpoint HONOURS it rather than treating it as advice
    const run = await post(cookie, `/projects/${projectId}/tools/document-creation/runs`, request(nothing));
    expect(run.status).toBe(400);
    expect(((await run.json()) as { detail: string }).detail).toContain('Your scope leaves nothing to read');
  });

  it('an EMPTY scope is a 400 in words — one convention: absent is the whole library, never an empty list (T-469)', async () => {
    for (const scope of [{}, { containerIds: [] }, { termIds: [], containerIds: [] }]) {
      const res = await post(
        cookie,
        `/projects/${projectId}/tools/document-creation/plan`,
        request({ scope }),
      );
      expect(res.status).toBe(400);
      expect(((await res.json()) as { detail: string }).detail).toContain('a scope must name at least one');
    }
  });

  it('with NO scope the draft may draw on the whole visible library (T-469)', async () => {
    const res = await post(
      cookie,
      `/projects/${projectId}/tools/document-creation/plan`,
      request({ scope: undefined }),
    );
    const { plan } = (await res.json()) as DocumentCreationPlanResponse;
    expect(plan.refusal).toBeNull();
    expect(plan.coverage).toContain('1 document can be read.');
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
    // T-469 — and ends with the ONE reach sentence every surface renders, off
    // the counts the run itself recorded; `read` is the passage-grain audit
    // rolled up to documents, so the sentence cannot disagree with the record
    expect(body.coverage).toContain('Read 1 document.');
    expect(body.run.reach).toEqual({
      visibleLive: 1,
      inScope: 1,
      excludedByState: { superseded: 0, withdrawn: 0 },
      leftOutByScope: 0,
      // T-472 — the count of held-but-unreadable documents is recorded too (none here)
      notCitable: 0,
      awaitingRecheck: 0,
      read: 1,
    });
    // and the plan the run executed is the plan the user was shown
    expect(body.plan.coverage).toBe('3 sections · 1 drafting pass. 1 document can be read.');
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
    expect(body.plan.coverage).toBe('4 sections · 1 drafting pass. 1 document can be read.');
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

// ── T-414 — SAVED STARTING OUTLINES (ADR-0053 addendum A5) ─────────────────
//
// *In plain terms: having built an outline you like, you keep it — and next
// time it appears beside the ones Infora ships, for your firm only, marked as
// yours. Anyone in the firm may save one; a firm administrator may retire one.*
//
// **The wall assertion here is the one worth writing.** "Somebody off the
// project sees nothing" is true of every route in this app and proves nothing
// about this store. What A5 requires is that a firm's outlines are invisible to
// a **colleague organisation working the same job** — a participant who passes
// the entitlement check and still sees none of them. That is the subject the
// suite gained for this ticket.
describe('a composed outline saves as a starting outline, for the firm (T-414)', () => {
  const outlineBody = (label: string) => ({
    label,
    sections: [
      { heading: 'Purpose', purpose: 'State what question this note answers.' },
      {
        heading: 'Baseline',
        purpose: 'Set out what the record says.',
        // T-412's sub-sections ride: the whole point of saving an outline is
        // saving the one you actually built
        subSections: [{ heading: 'Trial pits', purpose: 'What the trial pits recorded.' }],
      },
    ],
  });
  const outlines = async (who: string) => {
    const res = await app.request(
      `/projects/${projectId}/tools/document-creation/starting-outlines`,
      { headers: { cookie: who } },
    );
    expect(res.status).toBe(200);
    return ((await res.json()) as ListStartingOutlinesResponse).items;
  };

  it('ANYONE IN THE FIRM SAVES — no tier check, because A5 rules there is none', async () => {
    const res = await post(
      colleagueCookie,
      `/projects/${projectId}/tools/document-creation/starting-outlines`,
      outlineBody(`Cal's land quality note ${stamp}`),
    );
    expect(res.status).toBe(201);
    const saved = (await res.json()) as StartingOutline;
    expect(saved.origin).toBe('firm');
    expect(saved.savedBy!.name).toBe('t309-cal');
    // sub-sections survived the round trip — an outline saved flatter than it
    // was built is a worse outline than none
    expect(saved.sections[1]!.subSections![0]!.heading).toBe('Trial pits');
    // and the menu says what it is without anybody typing a description
    expect(saved.description).toBe('3 sections, saved by t309-cal.');
  });

  it('appears beside the shipped ones, marked as the firm’s own', async () => {
    await post(
      cookie,
      `/projects/${projectId}/tools/document-creation/starting-outlines`,
      outlineBody(`Ada's note ${stamp}`),
    );
    const items = await outlines(cookie);
    // the shipped ones are still there, and say so
    expect(items.some((o) => o.id === 'technical-note' && o.origin === 'infora')).toBe(true);
    const mine = items.find((o) => o.label === `Ada's note ${stamp}`);
    expect(mine).toBeDefined();
    expect(mine!.origin).toBe('firm');
    // an outline somebody saved last Tuesday and one Infora ships carry
    // different authority, and the difference has to be visible (A5)
    expect(mine!.savedBy!.name).toBe('t309-ada');
  });

  it('🔒 ANOTHER ORGANISATION ON THE SAME PROJECT NEVER SEES ONE', async () => {
    // asserted, not assumed: this requester passes the entitlement check and
    // reaches the same route — how a firm structures its documents is firm
    // know-how, and org-private means absent rather than summarised
    const theirs = await outlines(otherOrgCookie);
    expect(theirs.every((o) => o.origin === 'infora')).toBe(true);
    expect(theirs.some((o) => o.label.includes(String(stamp)))).toBe(false);
    // they still get the shipped menu — the firm's rows are the only absence
    expect(theirs.some((o) => o.id === 'technical-note')).toBe(true);
  });

  it('offers the retire control only to a curator — absent, never disabled', async () => {
    const curator = await outlines(cookie);
    const ordinary = await outlines(colleagueCookie);
    expect(curator.filter((o) => o.origin === 'firm').every((o) => o.mayRetire === true)).toBe(true);
    // the assembled-not-filtered rule at a button: an action nobody may take is
    // not rendered greyed, it does not reach the surface at all
    expect(ordinary.some((o) => o.mayRetire !== undefined)).toBe(false);
  });

  it('an ordinary member cannot retire, and is told nothing about the route', async () => {
    const [target] = (await outlines(cookie)).filter((o) => o.origin === 'firm');
    const res = await app.request(
      `/projects/${projectId}/tools/document-creation/starting-outlines/${target!.id}`,
      { method: 'DELETE', headers: { cookie: colleagueCookie } },
    );
    expect(res.status).toBe(404);
    // and it is still on their menu, because nothing happened
    expect((await outlines(cookie)).some((o) => o.id === target!.id)).toBe(true);
  });

  it('a curator retires one: it stops being offered, and the documents made from it are untouched', async () => {
    const save = await post(
      cookie,
      `/projects/${projectId}/tools/document-creation/starting-outlines`,
      outlineBody(`Retire me ${stamp}`),
    );
    const saved = (await save.json()) as StartingOutline;

    // a document made FROM it, before it is retired. Nothing links the two —
    // a chosen outline is copied into the request — so this is asserting a
    // property of the design rather than a behaviour of the delete.
    const made = await post(cookie, `/projects/${projectId}/tools/document-creation/runs`, {
      ...request(),
      sections: saved.sections,
      title: `made from a retired outline ${stamp}`,
    });
    expect(made.status).toBe(201);
    const madeBody = (await made.json()) as DocumentCreationRunResponse;

    const res = await app.request(
      `/projects/${projectId}/tools/document-creation/starting-outlines/${saved.id}`,
      { method: 'DELETE', headers: { cookie } },
    );
    expect(res.status).toBe(200);
    expect((await outlines(cookie)).some((o) => o.id === saved.id)).toBe(false);

    // 🔒 RETIRE, NEVER DELETE — the row survives, closed by an interval
    const [row] = await db
      .select()
      .from(s.startingOutlines)
      .where(eq(s.startingOutlines.id, saved.id));
    expect(row).toBeDefined();
    expect(row!.retiredAt).not.toBeNull();

    // and the document is exactly where it was
    const [document] = await db
      .select()
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, madeBody.documentId!));
    expect(document).toBeDefined();
    expect(document!.title).toBe(`made from a retired outline ${stamp}`);
  });

  it('retiring the same outline twice is nonexistence the second time', async () => {
    const save = await post(
      cookie,
      `/projects/${projectId}/tools/document-creation/starting-outlines`,
      outlineBody(`Twice ${stamp}`),
    );
    const saved = (await save.json()) as StartingOutline;
    const path = `/projects/${projectId}/tools/document-creation/starting-outlines/${saved.id}`;
    expect((await app.request(path, { method: 'DELETE', headers: { cookie } })).status).toBe(200);
    expect((await app.request(path, { method: 'DELETE', headers: { cookie } })).status).toBe(404);
  });

  it('refuses an outline with no label and one with no sections', async () => {
    const bad = async (body: unknown) =>
      (
        await post(cookie, `/projects/${projectId}/tools/document-creation/starting-outlines`, body)
      ).status;
    expect(await bad({ label: '', sections: outlineBody('x').sections })).toBe(400);
    expect(await bad({ label: 'x', sections: [] })).toBe(400);
  });
});

// ── T-471 — THE AUTHOR'S WORKING SET ────────────────────────────────────────
//
// *In plain terms: the creator can be handed some of the author's own drafts to
// read as background. The server checks, draft by draft, that the author is in
// the working area it sits in — a draft from a working area they are not in
// refuses the run, in words, before anything is spent — and a draft that is
// handed over is read as background marked "attached by the user", recorded on
// the plan, and never becomes a source or a citation.*
describe('the creator’s working set (T-471)', () => {
  let ownDocId: string;
  let narrowDocId: string;
  let authorParticipantId: string;
  let seenPrompt = '';
  let capturing: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    const [participantRow] = await db
      .select({ id: s.participants.id })
      .from(s.participants)
      .innerJoin(s.users, eq(s.participants.userId, s.users.id))
      .where(eq(s.users.email, `t309-ada-${stamp}@test.local`));
    authorParticipantId = participantRow!.id;
    const [colleague] = await db
      .select({ id: s.participants.id, organisationId: s.users.organisationId })
      .from(s.participants)
      .innerJoin(s.users, eq(s.participants.userId, s.users.id))
      .where(eq(s.users.email, `t309-cal-${stamp}@test.local`));
    const [own] = await db
      .insert(s.sandboxDocuments)
      .values({
        projectId,
        organisationId: colleague!.organisationId,
        sandboxId,
        title: 'Ada’s own method statement',
        content: 'The method statement proposes dewatering by sump pumping.',
        createdByParticipantId: authorParticipantId,
      })
      .returning();
    ownDocId = own!.id;
    // a named-user working area that admits only the colleague
    const [narrow] = await db
      .insert(s.sandboxes)
      .values({
        projectId,
        owningOrganisationId: colleague!.organisationId,
        scope: 'named_user',
        name: 't471 narrow',
        createdByParticipantId: colleague!.id,
      })
      .returning();
    await db.insert(s.sandboxScopeGrants).values({
      sandboxId: narrow!.id,
      granteeType: 'participant',
      participantId: colleague!.id,
      grantedByParticipantId: colleague!.id,
    });
    const [hidden] = await db
      .insert(s.sandboxDocuments)
      .values({
        projectId,
        organisationId: colleague!.organisationId,
        sandboxId: narrow!.id,
        title: 'Cal’s private note',
        content: 'Not for Ada.',
        createdByParticipantId: colleague!.id,
      })
      .returning();
    narrowDocId = hidden!.id;
    capturing = buildApp({
      db,
      sessionSecret: 'test-secret',
      router: fakeRouter((_system, prompt) => {
        seenPrompt = prompt;
        return 'The investigation recorded exceedances. [S1] The method statement proposes sump pumping. [A1]';
      }),
      workflows: loadWorkflows({ workers: createWorkerRegistry(), production: true }),
      workers: createWorkerRegistry(),
    });
  });

  const runsOf = async () =>
    (await db.select().from(s.runs).where(eq(s.runs.requesterParticipantId, authorParticipantId))).length;

  it('🔒 refuses — in words, on the plan and on the run — a draft from a working area the author is not in', async () => {
    const before = await runsOf();
    for (const route of ['plan', 'runs']) {
      const res = await post(cookie, `/projects/${projectId}/tools/document-creation/${route}`, request({ attachedDocumentIds: [narrowDocId] }));
      expect(res.status).toBe(400);
      const detail = ((await res.json()) as { detail: string }).detail;
      expect(detail).toContain('not in a working area you are part of');
      // by the id that was sent — the refusal never says what the draft is called
      expect(detail).toContain(narrowDocId);
      expect(detail).not.toContain('Cal’s private note');
    }
    expect(await runsOf()).toBe(before);
  });

  it('reads an own draft as background, records it, and cites none of it', async () => {
    seenPrompt = '';
    const res = await capturing.request(`/projects/${projectId}/tools/document-creation/runs`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(request({ attachedDocumentIds: [ownDocId] })),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as DocumentCreationRunResponse;

    // the drafting call was shown it, marked
    expect(seenPrompt).toContain('[A1] (attached by the user — not a project source) Ada’s own method statement');
    expect(seenPrompt).toContain('dewatering by sump pumping');

    // recorded on the plan as id and label — never the text
    expect(body.run.workingSet).toEqual([{ sandboxDocumentId: ownDocId, label: 'Ada’s own method statement', openToYou: true }]);
    const [plan] = await db.select().from(s.plans).where(eq(s.plans.runId, body.run.id));
    expect(JSON.stringify(plan!.workingSet)).not.toContain('dewatering');

    // never a source: the manifest names library versions only, and no [A#] reached the document
    expect(body.manifest.every((entry) => entry.versionId === versionId)).toBe(true);
    const [made] = await db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.id, body.documentId!));
    expect(made!.content).not.toMatch(/\[A\d+\]/);
    expect(made!.content).not.toContain('sump pumping');
  });

  it('a draft handed in twice is read once; no working set records none', async () => {
    const res = await post(cookie, `/projects/${projectId}/tools/document-creation/runs`, request());
    const none = (await res.json()) as DocumentCreationRunResponse;
    expect(none.run.workingSet).toBeUndefined();
    const twice = await post(cookie, `/projects/${projectId}/tools/document-creation/runs`, request({ attachedDocumentIds: [ownDocId, ownDocId] }));
    expect(((await twice.json()) as DocumentCreationRunResponse).run.workingSet).toHaveLength(1);
  });
});
