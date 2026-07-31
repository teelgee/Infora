// T-255 — the runner: load cases → materialise fixtures → execute against the
// system → apply assertions → emit results (evals/README.md).
//
// "Execute against the system" means over HTTP, against the composed app, as
// the acting user: log in, open a conversation on the fixture's subject
// project, ask the question, read the Run back. Everything the assertions see
// comes off that HTTP response — the runner has a database handle only to
// materialise fixtures, never to read a result it could have been told.
import type { PlanMode, Run } from '@infora/contracts';
import { evaluateAssertions, Unevaluable } from './assertions';
import type { Observation, ObservedSource, RetrievalMetrics } from './assertions';
import type { Category, EvalCase } from './case';
import type { GradeRecord } from './grading';
import { FIXTURE_PASSWORD, materialise } from './fixture';
import type { Fixture, FixtureInstance } from './fixture';
import { HarnessSession } from './harness';
import type { Harness } from './harness';

/**
 * T-257 — four verdicts, and `ungraded` is the new one (evals/README.md):
 * an assertion a model had to judge, and no independent model could. It is not
 * a pass, and it is not a failure of the answer — it is a check nobody made,
 * and it says so in its own column.
 */
export type Verdict = 'pass' | 'fail' | 'error' | 'ungraded';

export type CaseResult = {
  caseId: string;
  category: Category;
  description: string;
  verdict: Verdict;
  failures: string[];
  // T-258 — set by the RUNNER across repeated attempts, never by an author
  // (§8); the case schema refuses a hand-written `flaky` for the same reason.
  // A single-attempt run is `flaky: false` with one verdict recorded: not
  // "stable", just "not observed to vary".
  flaky: boolean;
  attempts: Verdict[];
  holdOut: boolean;
  fixture: { id: string; version: number; instance: string };
  routingTable: { chat: string; chatFamily: string; embedding: string };
  // Declared and recorded rather than inferred. Each is null because the thing
  // it names does not exist yet, and a plausible-looking value would be a
  // fabrication in the one artefact that has to be trustworthy:
  lens: string | null; // the Lens framework lands at T-281
  mode: PlanMode | null; // orchestration modes are labelled from T-266
  plan: unknown | null; // the plan artefact lands at T-260
  workersCalled: string[] | null; // the worker registry lands at T-269
  steps: Array<{ type: string; model: string | null; cost: number | null }>;
  // T-256 — gold-passage set metrics, recorded whenever the case declared them.
  // Reported beside the verdict rather than folded into it: retrieval quality
  // is tracked separately from answer quality (evals/README.md).
  retrieval: RetrievalMetrics | null;
  // T-257 — every model-graded claim with the grader's family, per §6. A grade
  // taken by an unnamed model is not evidence of anything.
  grades: GradeRecord[];
  run: {
    id: string;
    state: string;
    response: string | null;
    citations: ObservedSource[];
    sourceSet: ObservedSource[];
  } | null;
};

/**
 * Materialise a fixture for this harness, checking that its index is written
 * under the model the harness will query with — a fixture embedded under one
 * model and retrieved under another returns nothing, and would read as a
 * confident, wrong "the corpus does not answer that" (ADR-0024's pinned-model
 * pre-filter, T-031).
 */
export async function prepareFixture(harness: Harness, fixture: Fixture): Promise<FixtureInstance> {
  if (fixture.embedding_model !== harness.routing.embedding) {
    throw new Error(
      `fixture ${fixture.id} pins embedding model ${fixture.embedding_model}, harness routes ${harness.routing.embedding}`,
    );
  }
  return materialise(harness.db, fixture, harness.embed);
}

/**
 * One case, once. The attempt's own verdict is recorded as its single attempt —
 * `flaky` is a property of REPEATED execution (§8), and one execution can only
 * say what happened once. `runCases` folds several of these together.
 */
export async function runCase(
  harness: Harness,
  instance: FixtureInstance,
  evalCase: EvalCase,
): Promise<CaseResult> {
  const result = await runOnce(harness, instance, evalCase);
  return { ...result, attempts: [result.verdict] };
}

async function runOnce(
  harness: Harness,
  instance: FixtureInstance,
  evalCase: EvalCase,
): Promise<CaseResult> {
  const base: Omit<CaseResult, 'verdict' | 'failures'> = {
    caseId: evalCase.id,
    category: evalCase.category,
    description: evalCase.description,
    flaky: false,
    attempts: [],
    holdOut: evalCase.hold_out,
    fixture: {
      id: instance.fixture.id,
      version: instance.fixture.version,
      instance: instance.namespace,
    },
    routingTable: harness.routing,
    lens: null,
    mode: null,
    plan: null,
    workersCalled: null,
    steps: [],
    retrieval: null,
    grades: [],
    run: null,
  };

  const error = (reason: string): CaseResult => ({ ...base, verdict: 'error', failures: [reason] });

  if (evalCase.fixture !== instance.fixture.id) {
    return error(`case pins fixture ${evalCase.fixture}, given ${instance.fixture.id}`);
  }
  // A case cannot pin what does not exist. Both of these run silently if
  // allowed through — the case would execute Lens-less, or under whatever
  // orchestration the coded chain happens to be, and its pass would assert
  // something the harness never checked.
  if (evalCase.lens !== undefined) {
    return error(`case declares lens '${evalCase.lens}'; no Lens framework is wired yet (T-281)`);
  }
  if (evalCase.mode !== 'any') {
    return error(`case declares mode '${evalCase.mode}'; orchestration modes are not labelled yet (T-266)`);
  }

  const actor = instance.users.get(evalCase.acting_user);
  if (actor === undefined) {
    return error(`acting_user '${evalCase.acting_user}' is not a user of fixture ${instance.fixture.id}`);
  }

  const session = await HarnessSession.login(harness, actor.email, FIXTURE_PASSWORD);

  const opened = await session.post(`/projects/${instance.subjectProjectId}/conversations`, {
    surface: 'web',
  });
  if (opened.status !== 201) {
    // The deny path is real behaviour, not a harness fault — but it is not yet
    // an observation the assertion set can describe (nothing in §1 asserts
    // over a refusal). PERM-01 needs it; T-259 gives it a shape.
    return error(
      `opening a conversation returned ${opened.status}; a refused case has no assertion shape until T-259`,
    );
  }
  const { conversationId } = (await opened.json()) as { conversationId: string };

  const asked = await session.post(`/conversations/${conversationId}/runs`, {
    request: evalCase.question,
  });
  if (asked.status !== 201) return error(`asking the question returned ${asked.status}`);
  const run = (await asked.json()) as Run;
  if (run.state !== 'completed') return error(`run finished in state '${run.state}'`);

  const observation = observe(run);
  const withRun: Omit<CaseResult, 'verdict' | 'failures'> = {
    ...base,
    steps: run.steps.map((step) => ({
      type: step.type,
      model: step.model?.id ?? null,
      cost: step.usage?.cost ?? null,
    })),
    run: {
      id: run.id,
      state: run.state,
      response: run.response,
      citations: observation.citations,
      sourceSet: observation.sourceSet,
    },
  };

  let report;
  try {
    report = await evaluateAssertions(evalCase.assertions, {
      observation,
      resolveRef: (ref) => {
        const versionId = instance.versionIds.get(ref);
        if (versionId === undefined) {
          // an assertion nothing can resolve is an authoring mistake, and it
          // must read as one — never as an assertion that held
          throw new UnresolvedRef(
            `assertion names '${ref}', which fixture ${instance.fixture.id} does not declare`,
          );
        }
        return { versionId, documentReference: documentReferenceOf(instance, ref) };
      },
      resolveChunk: (ref) => {
        const chunkId = instance.chunkIds.get(ref);
        if (chunkId === undefined) {
          throw new UnresolvedRef(
            `gold passage '${ref}' is not a passage of fixture ${instance.fixture.id}`,
          );
        }
        return { chunkId };
      },
      // T-257 — who may grade a `~claim`. The producing family comes off the
      // harness's own routing record for now; when the router carries families
      // (T-284/T-286) it comes off the run's draft step instead.
      grading: { producerFamily: harness.routing.chatFamily, grader: harness.grader },
    });
  } catch (thrown) {
    // Both are the same verdict for the same reason: the harness could not
    // check what the case declared, and a case it could not check is never a
    // pass. `Unevaluable` is the registry's own (no plan to read workers from,
    // no ground-check to count against); `UnresolvedRef` is an authoring
    // mistake in the case.
    if (!(thrown instanceof UnresolvedRef) && !(thrown instanceof Unevaluable)) throw thrown;
    return { ...withRun, verdict: 'error', failures: [thrown.message] };
  }

  const evaluated = { ...withRun, retrieval: report.retrieval, grades: report.grades };
  if (report.unsupported.length > 0) {
    return {
      ...evaluated,
      verdict: 'error',
      failures: [
        `unsupported assertion type(s): ${report.unsupported.join(', ')}`,
        ...report.failures,
      ],
    };
  }
  // Precedence: error > fail > ungraded > pass. A known failure is more
  // informative than an ungraded one, so it wins the label; but a case with
  // nothing failing and something ungraded is NOT a pass (§6) — that is the
  // whole point of the fourth verdict.
  const ungraded = report.grades.some((grade) => grade.outcome === 'ungraded');
  return {
    ...evaluated,
    verdict: report.failures.length > 0 ? 'fail' : ungraded ? 'ungraded' : 'pass',
    failures: report.failures,
  };
}

export class UnresolvedRef extends Error {}

function observe(run: Run): Observation {
  const citations = [...run.citations, ...run.suggestions.flatMap((s) => s.citations)].map(
    (citation) => toObserved(citation.source),
  );
  const sourceSet: ObservedSource[] = [];
  const seen = new Set<string>();
  for (const step of run.steps) {
    for (const source of step.sourceSet) {
      const key = JSON.stringify(source);
      if (seen.has(key)) continue;
      seen.add(key);
      sourceSet.push(toObserved(source));
    }
  }
  // The set metrics measure RETRIEVAL, so they read the retrieve step's own
  // admitted set rather than the union above — a later step's set is what the
  // chain carried forward, which is a different question (§1.1).
  const retrieve = run.steps.find((step) => step.type === 'retrieve' && step.parentStepId === null);
  return {
    answer: run.response ?? '',
    citations,
    sourceSet,
    retrieved: retrieve === undefined ? null : retrieve.sourceSet.map(toObserved),
    railOutcomes: run.steps.flatMap((step) => step.railOutcomes),
    // Null, not []. The plan read API is T-261 and the worker registry T-269;
    // an empty list here would let `expect_not_called` pass on no evidence.
    workersCalled: null,
  };
}

// T-253 put the chunk in the Step row's source set, so an observation carries
// the PASSAGE where there was one — the grain the set metrics need, and the
// grain "what did your AI see" is actually answered at.
function toObserved(
  source: ({ versionId: string } | { authorityRef: string }) & { chunkId?: string },
): ObservedSource {
  const base: ObservedSource =
    'versionId' in source ? { versionId: source.versionId } : { authorityRef: source.authorityRef };
  return source.chunkId === undefined ? base : { ...base, chunkId: source.chunkId };
}

// The deliverable code the fixture declared for the container holding this
// version — what a leak would look like in prose, and what the citation
// renders as.
function documentReferenceOf(instance: FixtureInstance, versionKey: string): string {
  for (const container of instance.fixture.containers) {
    if (container.versions.some((version) => version.key === versionKey)) return container.reference;
  }
  return versionKey;
}
