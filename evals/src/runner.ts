// T-255 — the runner: load cases → materialise fixtures → execute against the
// system → apply assertions → emit results (evals/README.md).
//
// "Execute against the system" means over HTTP, against the composed app, as
// the acting user: log in, open a conversation on the fixture's subject
// project, ask the question, read the Run back. Everything the assertions see
// comes off that HTTP response — the runner has a database handle only to
// materialise fixtures, never to read a result it could have been told.
import type { GetRunPlanResponse, Plan, PlanMode, Run } from '@infora/contracts';
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
  // T-282 — the Lens this case ran under. **T-261 moved this from the case's
  // declaration to the RUN'S OWN RECORD**: the plan stores `lens_id` and
  // `lens_version` (T-299), and reading them back is the difference between
  // "the case asked for this Lens" and "this Lens produced this answer". They
  // agree today; the point is that a divergence would now be visible.
  lens: string | null;
  // T-261 — the plan the run performed, read back over HTTP. `mode` is its
  // stored column, never derived (T-260): until T-266 every plan is `declared`,
  // and reporting that from the record rather than from a constant is what
  // makes the modes reportable separately from the first model-chosen run.
  mode: PlanMode | null;
  plan: Plan | null;
  // Still null, and the reason narrowed rather than cleared: the plan is
  // readable now, but every plan step's `worker` is null until the registry at
  // T-269, so an empty list would let `expect_not_called` pass on no evidence.
  workersCalled: string[] | null;
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
  // A case cannot pin what does not exist — it would run under whatever the
  // coded chain happens to do, and its pass would assert something the harness
  // never checked. The Lens half of that rule is now satisfiable (T-281/T-299),
  // so it becomes a resolution against the harness's registry rather than a
  // blanket refusal; a case naming an id the deployment does not offer is
  // still an `error`, and is caught HERE with a message naming the available
  // ids rather than surfacing later as an opaque 400.
  if (evalCase.lens !== undefined && !harness.lenses.has(evalCase.lens)) {
    return error(
      `case declares lens '${evalCase.lens}', which this deployment does not offer ` +
        `(available: ${harness.lenses.list().map((lens) => lens.id).join(', ')})`,
    );
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

  // T-259 — PERM-01's shape. A user with no Participant cannot open a
  // conversation at all: the API answers 404, because denial and nonexistence
  // read identically (principle 4). There is no run and no observation, so the
  // verdict IS the refusal.
  if (evalCase.expect_refused) {
    if (opened.status === 201) {
      return {
        ...base,
        verdict: 'fail',
        failures: [
          `expect_refused: the request was ALLOWED (201) — ${evalCase.acting_user} reached a conversation on the subject project`,
        ],
      };
    }
    // 404 specifically, not "any non-201": a 500 is a broken system, and a 403
    // would mean the API had started distinguishing denial from nonexistence,
    // which is itself a leak (principle 4). Either must not read as a pass.
    if (opened.status !== 404) {
      return error(
        `expect_refused: the request was refused with ${opened.status}, expected 404 — denial and nonexistence must read identically (principle 4)`,
      );
    }
    return { ...base, verdict: 'pass', failures: [] };
  }

  if (opened.status !== 201) {
    return error(`opening a conversation returned ${opened.status}`);
  }
  const { conversationId } = (await opened.json()) as { conversationId: string };

  const asked = await session.post(`/conversations/${conversationId}/runs`, {
    request: evalCase.question,
    ...(evalCase.lens !== undefined && { lensId: evalCase.lens }),
  });
  if (asked.status !== 201) return error(`asking the question returned ${asked.status}`);
  const run = (await asked.json()) as Run;
  if (run.state !== 'completed') return error(`run finished in state '${run.state}'`);

  // T-261 — the plan the run actually performed. Producer-private and read as
  // the requester itself, so this is the same read a consultant gets; a
  // non-200 leaves `plan` null rather than failing the case, because a case is
  // about the ANSWER and an unreadable plan is a harness fact, not a defect in
  // what was answered.
  const planRead = await session.get(`/runs/${run.id}/plan`);
  const planned =
    planRead.status === 200 ? ((await planRead.json()) as GetRunPlanResponse).plan : null;

  const observation = observe(run);
  const withRun: Omit<CaseResult, 'verdict' | 'failures'> = {
    ...base,
    plan: planned,
    mode: planned?.mode ?? null,
    // the run's own record, not the case's declaration
    lens: planned?.lensId ?? evalCase.lens ?? null,
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

  // T-259 — PERM-05. The claim is about the RELATIONSHIP between runs, not
  // about any one of them: the same question under every named Lens must admit
  // an identical source set. Compared on the SOURCE SET and never the answers,
  // because two Lenses producing identical answers is a different failure — a
  // Lens that did nothing — and conflating them would let either hide.
  const invarianceFailures: string[] = [];
  if (evalCase.lens_invariance !== undefined) {
    const baseline = fingerprint(observation.sourceSet);
    for (const lensId of evalCase.lens_invariance) {
      if (!harness.lenses.has(lensId)) {
        return {
          ...withRun,
          verdict: 'error',
          failures: [`lens_invariance names lens '${lensId}', which this deployment does not offer`],
        };
      }
      const under = await session.post(`/conversations/${conversationId}/runs`, {
        request: evalCase.question,
        lensId,
      });
      if (under.status !== 201) {
        return {
          ...withRun,
          verdict: 'error',
          failures: [`lens_invariance: asking under '${lensId}' returned ${under.status}`],
        };
      }
      const lensRun = (await under.json()) as Run;
      const seen = fingerprint(observe(lensRun).sourceSet);
      if (seen !== baseline) {
        invarianceFailures.push(
          `lens_invariance: the '${lensId}' Lens admitted a different source set — a Lens changes register, never reach`,
        );
      }
    }
  }

  const evaluated = {
    ...withRun,
    retrieval: report.retrieval,
    grades: report.grades,
  };
  report.failures.push(...invarianceFailures);
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

/** An order-independent identity for a source set — what lens_invariance compares. */
function fingerprint(sources: ObservedSource[]): string {
  return sources.map((source) => JSON.stringify(source)).sort().join('|');
}

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
    // Null, not []. The plan is readable from T-261, but every plan step's
    // `worker` stays null until the registry at T-269, so an empty list here
    // would let `expect_not_called` pass on no evidence.
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
