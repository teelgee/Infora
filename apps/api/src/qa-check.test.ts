// T-336 acceptance — the launcher's two endpoints: the plan before any spend,
// and the run that executes exactly that plan.
//
// **The cases that carry the ticket are the honesty ones.** A checker that ran
// and returned an empty list would pass a happy-path suite while making the one
// claim ADR-0053 §5 exists to forbid: *your document is fine*, said about
// material nobody read. So the coverage statement is asserted **before and
// after, in the same shape**, the refusal is asserted **before any spend**, and
// the editor route is asserted to be the Tools route rather than a second flow.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { QaCheckPlanResponse, QaCheckRunResponse } from '@infora/contracts';
import { createWorkerRegistry } from '@infora/capabilities';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { loadWorkflows } from '@infora/workflows';
import { buildApp } from './app';
import { fakeRouter } from './test-router';
import { docx } from './test-docx';

const { db, pool } = createDb();
const workflows = loadWorkflows({ workers: createWorkerRegistry(), production: true });

/**
 * A router that answers the CHECK prompt with one well-formed finding and the
 * assertion-extraction prompt with a line of text. It keys on the system prompt
 * because the two calls are different acts and a fake that answered both the
 * same way could not exercise either honestly.
 */
const checkingRouter = () =>
  fakeRouter((system) => {
    if (system.includes('checkable factual assertions')) return 'the reduction in loading';
    if (system.includes('summaries of what each section')) {
      return JSON.stringify({ findings: [] });
    }
    return JSON.stringify({
      summary: 'The section asserts a 12% reduction.',
      findings: [
        {
          family: 'style',
          quote: 'The Scheme',
          defect: 'The works are capitalised where the guide says lower case.',
          severity: 'advisory',
          rule: 'R1',
          replacement: 'The scheme',
        },
      ],
    });
  });

const app = buildApp({
  db,
  sessionSecret: 'test-secret',
  router: checkingRouter(),
  workflows,
  workers: createWorkerRegistry(),
});

const stamp = Date.now();
const password = 'pw-t336';
let projectId: string;
let organisationId: string;
let cookie: string;
let participantId: string;
let documentId: string;
let emptyDocumentId: string;

const CONTENT = [
  'Introduction',
  '',
  'The Scheme is assessed for land quality across its whole extent.',
  '',
  'Assessment',
  '',
  'The Scheme delivers a 12% reduction in contaminant loading. TBC.',
  '',
  'Conclusions',
  '',
  'The works are acceptable subject to the validation strategy.',
].join('\n');

const post = (path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const body = (over: Record<string, unknown> = {}) => ({
  sandboxDocumentId: documentId,
  families: ['style', 'corpus_accuracy', 'self_contradiction', 'readability', 'completeness'],
  depth: 'full',
  attachedDocumentIds: [],
  ...over,
});

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: `t336 org ${stamp}` }).returning();
  organisationId = org!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t336 project ${stamp}`, ownerOrganisationId: organisationId })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId, projectId, role: 'owner' });

  const [user] = await db
    .insert(s.users)
    .values({ name: 't336-eleanor', email: `t336-${stamp}@test.local`, organisationId })
    .returning();
  await db
    .insert(s.userCredentials)
    .values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId, elevated: true })
    .returning();
  participantId = participant!.id;
  const session = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user!.email, password }),
  });
  cookie = session.headers.get('set-cookie')!.split(';')[0]!;

  const [sandbox] = await db
    .insert(s.sandboxes)
    .values({
      projectId,
      name: `t336 area ${stamp}`,
      scope: 'single_org',
      owningOrganisationId: organisationId,
      createdByParticipantId: participantId,
    })
    .returning();
  const [document] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId,
      organisationId,
      sandboxId: sandbox!.id,
      title: `t336 draft ${stamp}`,
      content: CONTENT,
      createdByParticipantId: participantId,
    })
    .returning();
  documentId = document!.id;
  const [empty] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId,
      organisationId,
      sandboxId: sandbox!.id,
      title: `t336 empty ${stamp}`,
      content: '',
      createdByParticipantId: participantId,
    })
    .returning();
  emptyDocumentId = empty!.id;

  // the project's own style guide, so the style family has something to bind
  const [guide] = await db
    .insert(s.projectStyleGuides)
    .values({
      projectId,
      title: 'Wrenfield Project Style Guide',
      sourceFormat: 'docx',
      loadedByUserId: user!.id,
    })
    .returning();
  await db.insert(s.projectStyleGuideClauses).values({
    styleGuideId: guide!.id,
    ordinal: 1,
    clause: '§2.1',
    heading: 'Naming',
    content: 'Refer to the works as “the scheme”, in lower case.',
    spanStart: 0,
    spanEnd: 48,
  });
});

afterAll(async () => {
  await pool.end();
});

describe('the plan is shown before anything is spent (ADR-0053 §4)', () => {
  it('names its shape, its steps and what it will cover', async () => {
    const res = await post(`/projects/${projectId}/tools/qa-check/plan`, body());
    expect(res.status).toBe(200);
    const { plan } = (await res.json()) as QaCheckPlanResponse;
    expect(plan.workflowId).toBe('qa-check');
    expect(plan.shape).toBeDefined();
    expect(plan.steps.length).toBeGreaterThan(0);
    // coverage BEFORE: sections, checks, the record's reach, the clause ratio
    expect(plan.coverage).toContain('3 sections');
    expect(plan.coverage).toContain('5 checks');
    expect(plan.coverage).toContain('1 of 1 clauses');
    expect(plan.refusal).toBeNull();
  });

  it('the plan endpoint spends nothing — no run, no findings, no rows', async () => {
    const before = await db.select().from(s.runs).where(eq(s.runs.environmentKey, projectId));
    await post(`/projects/${projectId}/tools/qa-check/plan`, body());
    const after = await db.select().from(s.runs).where(eq(s.runs.environmentKey, projectId));
    expect(after.length).toBe(before.length);
  });

  it('the same request plans the same way twice, over HTTP', async () => {
    // 🔒 the declared-workflow promise, asserted at the boundary a user meets
    const first = (await (
      await post(`/projects/${projectId}/tools/qa-check/plan`, body())
    ).json()) as QaCheckPlanResponse;
    const second = (await (
      await post(`/projects/${projectId}/tools/qa-check/plan`, body())
    ).json()) as QaCheckPlanResponse;
    expect(second).toEqual(first);
  });

  it('changing a parameter changes the plan, which is how the user shapes it', async () => {
    const full = (await (
      await post(`/projects/${projectId}/tools/qa-check/plan`, body())
    ).json()) as QaCheckPlanResponse;
    const narrow = (await (
      await post(`/projects/${projectId}/tools/qa-check/plan`, body({ families: ['readability'] }))
    ).json()) as QaCheckPlanResponse;
    expect(narrow.plan.steps.length).toBeLessThan(full.plan.steps.length);
    expect(narrow.plan.coverage).toContain('1 check');
  });

  it('refuses an empty draft rather than planning a run over nothing', async () => {
    const res = await post(
      `/projects/${projectId}/tools/qa-check/plan`,
      body({ sandboxDocumentId: emptyDocumentId }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { detail?: string }).detail).toContain('nothing to check');
  });

  it('a draft that is not this requester’s does not exist to them', async () => {
    const res = await post(
      `/projects/${projectId}/tools/qa-check/plan`,
      body({ sandboxDocumentId: '00000000-0000-0000-0000-000000000000' }),
    );
    expect(res.status).toBe(404);
  });
});

describe('the run executes exactly that plan, and states its coverage again', () => {
  it('runs, writes anchored findings, and reports coverage in the same shape', async () => {
    const res = await post(`/projects/${projectId}/tools/qa-check/runs`, body());
    expect(res.status).toBe(201);
    const result = (await res.json()) as QaCheckRunResponse;

    // the plan the user saw and the plan the run executed are ONE object
    expect(result.plan.workflowId).toBe('qa-check');
    expect(result.run.id).toBeDefined();

    // 🔒 the same SHAPE as the plan's sentence, so the difference between what
    // was promised and what happened is visible at a glance
    expect(result.coverage).toContain('sections read');
    // and the SHORT shape reports every section, not one: reading the whole
    // draft in one pass read all of it, and "1 of 3 sections read" would
    // understate the coverage — the same class of error as overstating it
    expect(result.coverage).toMatch(/^3 of 3 sections read/);
    expect(result.coverage).toContain('5 checks');
    expect(result.coverage).toContain('style guide');

    // the findings are stored, anchored into the draft, and come back
    expect(result.findings.length).toBeGreaterThan(0);
    const [row] = await db
      .select()
      .from(s.findings)
      .where(eq(s.findings.sandboxDocumentId, documentId))
      .limit(1);
    expect(row).toBeDefined();
    expect(row!.runId).toBe(result.run.id);
  });

  it('the CODE families run with no model behind them, and find the placeholder', async () => {
    const res = await post(
      `/projects/${projectId}/tools/qa-check/runs`,
      body({ families: ['completeness'] }),
    );
    const result = (await res.json()) as QaCheckRunResponse;
    // "TBC." is in the draft; no model call is involved in finding it
    expect(
      result.findings.some((finding) => finding.defect.includes('placeholder')),
    ).toBe(true);
    expect(result.findings.every((finding) => finding.checkFamily === 'completeness')).toBe(true);
  });

  it('records the run as DECLARED, with a step of each capability’s own kind', async () => {
    const res = await post(`/projects/${projectId}/tools/qa-check/runs`, body());
    const result = (await res.json()) as QaCheckRunResponse;
    const steps = await db.select().from(s.steps).where(eq(s.steps.runId, result.run.id));
    const types = new Set(steps.map((step) => step.type));
    // the executor rule: a plan step runs the capability it NAMES, and the Step
    // row is of that capability's own kind (T-396, migration 0061's vocabulary)
    expect(types.has('qa_section_check')).toBe(true);
    expect(types.has('qa_document_check')).toBe(true);
  });

  it('“no findings” is never unqualified — the coverage says what was read', async () => {
    // a run whose model finds nothing still states its reach, which is the only
    // thing distinguishing a clean result from an unexamined one
    const quiet = buildApp({
      db,
      sessionSecret: 'test-secret',
      router: fakeRouter(() => JSON.stringify({ summary: 'x', findings: [] })),
      workflows,
      workers: createWorkerRegistry(),
    });
    const res = await quiet.request(`/projects/${projectId}/tools/qa-check/runs`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(body({ families: ['style', 'corpus_accuracy'] })),
    });
    const result = (await res.json()) as QaCheckRunResponse;
    expect(result.findings).toHaveLength(0);
    expect(result.coverage).toContain('sections read');
    // and it says the library gave it nothing rather than implying it agreed
    expect(result.coverage).toContain('the library returned nothing to check against');
  });
});

describe('one run shape, and one place the scope is stated (ADR-0053 §1)', () => {
  it('a run covers ONE document — the body has no way to name a second', () => {
    // the shape itself is the guarantee: there is no `sandboxDocumentIds`, and
    // a set sweep would produce a report, which ADR-0048 §1 made the checker
    // deliberately not be
    expect(Object.keys(body())).toContain('sandboxDocumentId');
    expect(Object.keys(body())).not.toContain('sandboxDocumentIds');
  });

  it('the run honours the plan’s refusal rather than treating it as advice', async () => {
    // a section too long to check even on its own — the pathological case, said
    // in the plan BEFORE any spend
    const [huge] = await db
      .insert(s.sandboxDocuments)
      .values({
        projectId,
        organisationId,
        sandboxId: (await db.select().from(s.sandboxes).where(eq(s.sandboxes.projectId, projectId)).limit(1))[0]!.id,
        title: `t336 huge ${stamp}`,
        content: `One\n\n${'x'.repeat(400_000)}\n\nTwo\n\nshort.`,
        createdByParticipantId: participantId,
      })
      .returning();

    const planned = (await (
      await post(`/projects/${projectId}/tools/qa-check/plan`, body({ sandboxDocumentId: huge!.id }))
    ).json()) as QaCheckPlanResponse;
    expect(planned.plan.refusal).not.toBeNull();

    const res = await post(
      `/projects/${projectId}/tools/qa-check/runs`,
      body({ sandboxDocumentId: huge!.id }),
    );
    expect(res.status).toBe(400);
    const runs = await db.select().from(s.findings).where(eq(s.findings.sandboxDocumentId, huge!.id));
    expect(runs).toHaveLength(0);
  });
});


// ── T-399 — A FILE HANDED STRAIGHT TO A CHECK ───────────────────────────────
//
// **The cases that carry this ticket are the NEGATIVE ones.** An upload that
// reaches the check is the easy half and one test covers it; the ticket's
// actual rule is that the file is parsed for the run and stored NOWHERE, and
// the only way to assert "stored nowhere" is to go looking for it in every
// place it could plausibly have landed and find nothing. The mechanism this
// ticket nearly shipped — the text riding a workflow parameter — would have
// passed a happy-path suite while writing the user's file into the run record,
// so `plan_steps.inputs` is asserted against directly.
describe('a file can be handed straight to a check, and is kept nowhere (T-399)', () => {
  const FILE = 'Ecology_Baseline.docx';
  const UPLOAD_TEXT = 'The badger survey recorded four setts within the red line boundary.';

  const withFile = (over: Record<string, unknown> = {}, filename = FILE, text = UPLOAD_TEXT) => {
    const form = new FormData();
    form.append('body', JSON.stringify(body(over)));
    form.append('file', new File([new Uint8Array(docx([text]))], filename));
    return form;
  };

  const postForm = (path: string, form: FormData) =>
    app.request(path, { method: 'POST', headers: { cookie }, body: form });

  it('names the uploaded file in the plan’s coverage sentence, before any spend', async () => {
    const res = await postForm(`/projects/${projectId}/tools/qa-check/plan`, withFile());
    expect(res.status).toBe(200);
    const { plan } = (await res.json()) as QaCheckPlanResponse;
    // NAMED, not counted: the file is stored nowhere, so its name is the only
    // handle the record will ever have for it
    expect(plan.coverage).toContain(`attached: ${FILE}`);
    expect(plan.coverage).toContain('never grounds, never cited');
  });

  it('says in the plan that the file is kept nowhere and the check cannot be re-run from the record', async () => {
    const res = await postForm(`/projects/${projectId}/tools/qa-check/plan`, withFile());
    const { plan } = (await res.json()) as QaCheckPlanResponse;
    const caveats = (plan.caveats ?? []).join(' ');
    expect(caveats).toContain('kept nowhere');
    expect(caveats).toContain('attaching the file again');
    // and the ADR-0022 treatment is stated the same way a sandbox pin gets it
    expect(caveats).toContain('never cited');
  });

  it('runs, and states the attachment in the result the same way the plan did', async () => {
    const res = await postForm(`/projects/${projectId}/tools/qa-check/runs`, withFile());
    expect(res.status).toBe(201);
    const result = (await res.json()) as QaCheckRunResponse;
    expect(result.plan.coverage).toContain(`attached: ${FILE}`);
    // 🔒 ADR-0053 §5 — the after-sentence is in the SAME SHAPE as the plan's,
    // or the two stop being comparable and the coverage claim stops meaning
    // anything
    expect(result.coverage).toContain(`attached: ${FILE}`);
    expect(result.coverage).toContain('never grounds, never cited');
    // …and the text genuinely REACHED the check rather than only the prose
    // about it: this count comes from the excerpts the section check was
    // actually shown, so a run that named the file and never read it fails here
    expect(result.coverage).toContain('1 attached excerpt, never cited');
  });

  it('🔒 writes the FINGERPRINT into the run record and never the file’s text', async () => {
    const res = await postForm(`/projects/${projectId}/tools/qa-check/runs`, withFile());
    const result = (await res.json()) as QaCheckRunResponse;

    const [plan] = await db.select().from(s.plans).where(eq(s.plans.runId, result.run.id)).limit(1);
    expect(plan).toBeDefined();
    const steps = await db.select().from(s.planSteps).where(eq(s.planSteps.planId, plan!.id));
    const inputs = JSON.stringify(steps.map((step) => step.inputs));

    // the fingerprint IS there — the record says exactly which file was read
    expect(inputs).toContain(FILE);
    expect(inputs).toContain('sha256');
    // …and the file's words are NOT. This is the assertion the whole ticket
    // turns on: a parameter carrying the text would have satisfied every other
    // test in this block while storing the user's document.
    expect(inputs).not.toContain('badger');
    expect(inputs).not.toContain(UPLOAD_TEXT);
  });

  it('🔒 the uploaded file becomes no document, no version and no style guide', async () => {
    // scoped to THIS project (review, 2026-08-31): the suite shares one
    // database with concurrently running files, so a whole-table count races
    // against whatever a neighbouring suite inserts in the window — the
    // assertion is about what THIS run wrote, and this project is what it
    // could have written into
    const count = async () => ({
      documents: (
        await db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.projectId, projectId))
      ).length,
      guides: (
        await db.select().from(s.projectStyleGuides).where(eq(s.projectStyleGuides.projectId, projectId))
      ).length,
      // versions hang off containers, which hang off the project
      versions: (
        await db
          .select({ id: s.versions.id })
          .from(s.versions)
          .innerJoin(s.containers, eq(s.versions.containerId, s.containers.id))
          .where(eq(s.containers.projectId, projectId))
      ).length,
    });
    const before = await count();
    await postForm(`/projects/${projectId}/tools/qa-check/runs`, withFile());
    const after = await count();
    expect(after.documents).toBe(before.documents);
    expect(after.guides).toBe(before.guides);
    expect(after.versions).toBe(before.versions);
  });

  it('refuses a file it cannot read, before any spend — the loader’s own vocabulary', async () => {
    const form = new FormData();
    form.append('body', JSON.stringify(body()));
    form.append('file', new File([new Uint8Array(Buffer.from('not a docx'))], 'broken.docx'));
    const res = await postForm(`/projects/${projectId}/tools/qa-check/plan`, form);
    expect(res.status).toBe(400);
  });

  it('refuses a format the extractor does not handle', async () => {
    const form = new FormData();
    form.append('body', JSON.stringify(body()));
    form.append('file', new File([new Uint8Array(Buffer.from('hello'))], 'notes.txt'));
    const res = await postForm(`/projects/${projectId}/tools/qa-check/plan`, form);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { detail?: string }).detail).toBe('unsupported_format');
  });

  // (review, 2026-08-31) — the transiency promise is an IN-MEMORY parse, this
  // route is open to any project participant and never throttled (the plan
  // legitimately recomputes on every changed answer), so the parse must be
  // bounded before anything is buffered. Both refusals land before any spend
  // and say what to do in words.
  it('refuses a file over the size bound, before buffering it', async () => {
    const form = new FormData();
    form.append('body', JSON.stringify(body()));
    form.append('file', new File([new Uint8Array(21 * 1024 * 1024)], 'enormous.docx'));
    const res = await postForm(`/projects/${projectId}/tools/qa-check/plan`, form);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { detail?: string }).detail).toContain('too large');
  });

  it('refuses more files than the bound, naming the bound', async () => {
    const form = new FormData();
    form.append('body', JSON.stringify(body()));
    for (let at = 0; at < 6; at++) {
      form.append('file', new File([new Uint8Array(docx([`file ${at}`]))], `f${at}.docx`));
    }
    const res = await postForm(`/projects/${projectId}/tools/qa-check/plan`, form);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { detail?: string }).detail).toContain('5 at most');
  });

  it('leaves the JSON request exactly as it was — an upload is an addition, not a new shape', async () => {
    const res = await post(`/projects/${projectId}/tools/qa-check/plan`, body());
    expect(res.status).toBe(200);
    const { plan } = (await res.json()) as QaCheckPlanResponse;
    expect(plan.coverage).not.toContain('attached:');
    // `caveats` is omitted entirely when a plan has none, so the absence is
    // asserted against both shapes rather than against one of them
    expect((plan.caveats ?? []).join(' ')).not.toContain('kept nowhere');
  });

  // 🔒 the planner's widths come from the DOCUMENT, never the attachment — so
  // attaching a file cannot change how many calls a run makes, and the plan
  // stays the same declared shape it was without one
  it('does not change the shape of the plan: same steps, with and without the file', async () => {
    const plain = (await (
      await post(`/projects/${projectId}/tools/qa-check/plan`, body())
    ).json()) as QaCheckPlanResponse;
    const uploaded = (await (
      await postForm(`/projects/${projectId}/tools/qa-check/plan`, withFile())
    ).json()) as QaCheckPlanResponse;
    expect(uploaded.plan.steps.map((step) => step.worker)).toEqual(
      plain.plan.steps.map((step) => step.worker),
    );
    expect(uploaded.plan.steps).toHaveLength(plain.plan.steps.length);
  });
});

// ── T-416, T-469 — narrowing the scope lands on the plan's own sentence ────
//
// *In plain terms: the accuracy check's scope now has a search over it. What
// this pins is that searching changed nothing about what narrowing MEANS —
// the same scope rides the same request field and comes back stated in the
// plan's coverage sentence, in the one reach sentence every surface renders.*
//
// A search is a filter over what is rendered, never a second way to choose:
// two paths into the scope would be two chances for the plan to describe a
// scope the run did not use. T-469 made that ONE path, and one convention: no
// scope reads the whole visible library, a scope reads exactly it, an empty
// scope is a 400 in words.
describe('T-416, T-469 — a scope is stated in the plan, and an empty one is refused in words', () => {
  it('states what the library search can reach when nothing is narrowed', async () => {
    const res = await post(`/projects/${projectId}/tools/qa-check/plan`, body());
    expect(res.status).toBe(200);
    const { plan } = (await res.json()) as QaCheckPlanResponse;
    expect(plan.coverage).toContain('the library searched statement by statement');
    expect(plan.coverage).toMatch(/No documents can be read\.|documents? can be read\./);
    expect(plan.coverage).not.toContain('in your scope');
  });

  it('REFUSES IN THE PLAN, before any spend, when the scope leaves nothing to read', async () => {
    // ids the requester cannot reach are not a way in — the gateway intersects
    // them with what they may see, so they admit nothing and the plan says so
    const scoped = body({
      scope: {
        containerIds: [
          '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000002',
        ],
      },
    });
    const res = await post(`/projects/${projectId}/tools/qa-check/plan`, scoped);
    expect(res.status).toBe(200);
    const { plan } = (await res.json()) as QaCheckPlanResponse;
    expect(plan.refusal).toContain('Your scope leaves nothing to read');
    // and the run endpoint honours it
    const run = await post(`/projects/${projectId}/tools/qa-check/runs`, scoped);
    expect(run.status).toBe(400);
  });

  it('an EMPTY scope is a 400 in words', async () => {
    for (const scope of [{}, { containerIds: [] }]) {
      const res = await post(`/projects/${projectId}/tools/qa-check/plan`, body({ scope }));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { detail: string }).detail).toContain('a scope must name at least one');
    }
  });
});

// ── T-418 — the run can be WATCHED while it happens ────────────────────────
//
// *In plain terms: a long check should read as working rather than hung, and
// the only way a browser can show that is to be able to look the run up before
// it finishes.*
//
// **No engine state is added by any of this.** A tool run has always opened a
// Conversation like every other run, and every step has always opened and
// closed a Step row (ADR-0028's append-only tree). What changed is *when* the
// conversation row is created: the caller may open it first, so it has a handle
// to poll by. A caller that passes none gets exactly the previous behaviour.
describe('T-418 — a caller-opened conversation is the handle a run is watched by', () => {
  const openConversation = async () => {
    const res = await post(`/projects/${projectId}/conversations`, { surface: 'web' });
    expect(res.status).toBe(201);
    return ((await res.json()) as { conversationId: string }).conversationId;
  };

  it('hangs the run off the conversation the caller opened, so it is findable', async () => {
    const conversationId = await openConversation();
    const res = await post(`/projects/${projectId}/tools/qa-check/runs`, body({ conversationId }));
    expect(res.status).toBe(201);
    const run = (await res.json()) as QaCheckRunResponse;
    expect(run.run.conversationId).toBe(conversationId);

    // and the run is reachable through that conversation, with the Step rows
    // the progress box counts — this is the read the poll makes
    const read = await app.request(`/conversations/${conversationId}`, { headers: { cookie } });
    expect(read.status).toBe(200);
    const { runs } = (await read.json()) as { runs: Array<{ id: string; steps: unknown[] }> };
    expect(runs.map((entry) => entry.id)).toContain(run.run.id);
    expect(runs[0]!.steps.length).toBeGreaterThan(0);
  });

  it('opens one itself when the caller passes none — the previous behaviour, unchanged', async () => {
    const res = await post(`/projects/${projectId}/tools/qa-check/runs`, body());
    expect(res.status).toBe(201);
    const run = (await res.json()) as QaCheckRunResponse;
    expect(run.run.conversationId).toBeTruthy();
  });

  it('🔒 a conversation on another project is NONEXISTENCE, not a refusal', async () => {
    // it must not be a way to hang a run off somebody else's thread, and the
    // 404 is principle 4: a refusal that said "not yours" would confirm it
    const [elsewhere] = await db
      .insert(s.projects)
      .values({ name: `t418 elsewhere ${stamp}`, ownerOrganisationId: organisationId })
      .returning();
    const [foreign] = await db
      .insert(s.conversations)
      .values({ projectId: elsewhere!.id, surface: 'web' })
      .returning();
    const res = await post(
      `/projects/${projectId}/tools/qa-check/runs`,
      body({ conversationId: foreign!.id }),
    );
    expect(res.status).toBe(404);
  });
});

// ── T-471 — THE CHECKER'S ATTACHED DRAFTS ARE CHECKED FOR REACH ─────────────
//
// *In plain terms: before this ticket the checker read an attached draft by its
// id alone. The check on the draft being CHECKED looked at its firm; nothing
// looked at the drafts handed in alongside it, so an id from a working area the
// author was not in would have been read into the prompt. Now each attached id
// is checked against its own working area's grants — on the plan and on the run
// — and a draft that is out of reach refuses the check, in words, before
// anything is spent.*
describe('attached drafts are checked for reach, per draft (T-471)', () => {
  let ownAttachedId: string;
  let strangersId: string;
  let seenPrompts: string[] = [];
  let capturing: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    // the author's own working area, which admits the author by a participant grant
    const [own] = await db
      .insert(s.sandboxes)
      .values({ projectId, name: `t471 own ${stamp}`, scope: 'named_user', owningOrganisationId: organisationId, createdByParticipantId: participantId })
      .returning();
    await db.insert(s.sandboxScopeGrants).values({ sandboxId: own!.id, granteeType: 'participant', participantId, grantedByParticipantId: participantId });
    const [ownDoc] = await db
      .insert(s.sandboxDocuments)
      .values({ projectId, organisationId, sandboxId: own!.id, title: 'Ground model note', content: 'The ground model assumes made ground to 2 m.', createdByParticipantId: participantId })
      .returning();
    ownAttachedId = ownDoc!.id;

    // a colleague in the SAME firm, in a working area of their own that the author is not in
    const [colleagueUser] = await db
      .insert(s.users)
      .values({ name: 't471-colleague', email: `t471-col-${stamp}@test.local`, organisationId })
      .returning();
    const [colleague] = await db.insert(s.participants).values({ userId: colleagueUser!.id, projectId }).returning();
    const [theirs] = await db
      .insert(s.sandboxes)
      .values({ projectId, name: `t471 theirs ${stamp}`, scope: 'named_user', owningOrganisationId: organisationId, createdByParticipantId: colleague!.id })
      .returning();
    await db.insert(s.sandboxScopeGrants).values({ sandboxId: theirs!.id, granteeType: 'participant', participantId: colleague!.id, grantedByParticipantId: colleague!.id });
    const [theirDoc] = await db
      .insert(s.sandboxDocuments)
      .values({ projectId, organisationId, sandboxId: theirs!.id, title: 'Colleague’s private notes', content: 'Not for the checker.', createdByParticipantId: colleague!.id })
      .returning();
    strangersId = theirDoc!.id;

    capturing = buildApp({
      db,
      sessionSecret: 'test-secret',
      router: fakeRouter((system, prompt) => {
        seenPrompts.push(`${system}\n${prompt}`);
        if (system.includes('checkable factual assertions')) return 'the reduction in loading';
        return JSON.stringify({ summary: 'ok', findings: [] });
      }),
      workflows,
      workers: createWorkerRegistry(),
    });
  });

  const runsNow = async () => (await db.select().from(s.runs).where(eq(s.runs.environmentKey, projectId))).length;

  it('🔒 refuses an attached id from a working area the author is not in — plan and run alike, nothing spent', async () => {
    const before = await runsNow();
    for (const route of ['plan', 'runs']) {
      const res = await post(`/projects/${projectId}/tools/qa-check/${route}`, body({ attachedDocumentIds: [strangersId] }));
      expect(res.status).toBe(400);
      const detail = ((await res.json()) as { detail: string }).detail;
      expect(detail).toContain('not in a working area you are part of');
      expect(detail).toContain(strangersId);
      // never what the draft is called
      expect(detail).not.toContain('Colleague');
    }
    // a made-up id and a mix of reachable and unreachable read the same — nothing is dropped quietly
    for (const ids of [['00000000-0000-4000-8000-000000000000'], [ownAttachedId, strangersId]]) {
      const res = await post(`/projects/${projectId}/tools/qa-check/runs`, body({ attachedDocumentIds: ids }));
      expect(res.status).toBe(400);
    }
    expect(await runsNow()).toBe(before);
  });

  it('shows the section check an attached draft only once it has been checked, records it, and cites none of it', async () => {
    seenPrompts = [];
    const res = await capturing.request(`/projects/${projectId}/tools/qa-check/runs`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(body({ attachedDocumentIds: [ownAttachedId], families: ['corpus_accuracy'] })),
    });
    expect(res.status).toBe(201);
    const result = (await res.json()) as QaCheckRunResponse;
    // the section check was shown the excerpt, marked
    expect(seenPrompts.join('\n')).toContain('Ground model note: The ground model assumes made ground to 2 m.');
    // the run says what it was handed, by id and title
    expect(result.run.workingSet).toEqual([{ sandboxDocumentId: ownAttachedId, label: 'Ground model note', openToYou: true }]);
    // and the record keeps the id and the label, not the text
    const [plan] = await db.select().from(s.plans).where(eq(s.plans.runId, result.run.id));
    expect(plan!.workingSet).toEqual([{ sandboxDocumentId: ownAttachedId, label: 'Ground model note' }]);
    expect(JSON.stringify(plan!.workingSet)).not.toContain('made ground');
    expect(result.run.citations).toEqual([]);
  });
});
