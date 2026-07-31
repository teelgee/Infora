// T-255 — the runner: load cases → materialise fixtures → execute against the
// system → apply assertions → emit results (docs/build/ask/07 §4).
//
// "Execute against the system" means over HTTP, against the composed app, as
// the acting user: log in, open a conversation on the fixture's subject
// project, ask the question, read the Run back. Everything the assertions see
// comes off that HTTP response — the runner has a database handle only to
// materialise fixtures, never to read a result it could have been told.
import type { Run } from '@infora/contracts';
import { evaluateAssertions } from './assertions';
import type { Observation, ObservedSource } from './assertions';
import type { Category, EvalCase } from './case';
import { FIXTURE_PASSWORD, materialise } from './fixture';
import type { Fixture, FixtureInstance } from './fixture';
import { HarnessSession } from './harness';
import type { Harness } from './harness';

export type CaseResult = {
  caseId: string;
  category: Category;
  description: string;
  verdict: 'pass' | 'fail' | 'error';
  failures: string[];
  holdOut: boolean;
  fixture: { id: string; version: number; instance: string };
  routingTable: { chat: string; embedding: string };
  // Declared and recorded rather than inferred. Each is null because the thing
  // it names does not exist yet, and a plausible-looking value would be a
  // fabrication in the one artefact that has to be trustworthy:
  lens: string | null; // the Lens framework lands at T-281
  mode: string | null; // orchestration modes are labelled from T-266
  plan: unknown | null; // the plan artefact lands at T-260
  workersCalled: string[] | null; // the worker registry lands at T-269
  steps: Array<{ type: string; model: string | null; cost: number | null }>;
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

export async function runCase(
  harness: Harness,
  instance: FixtureInstance,
  evalCase: EvalCase,
): Promise<CaseResult> {
  const base: Omit<CaseResult, 'verdict' | 'failures'> = {
    caseId: evalCase.id,
    category: evalCase.category,
    description: evalCase.description,
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
    report = evaluateAssertions(evalCase.assertions, {
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
    });
  } catch (thrown) {
    if (!(thrown instanceof UnresolvedRef)) throw thrown;
    return { ...withRun, verdict: 'error', failures: [thrown.message] };
  }

  if (report.unsupported.length > 0) {
    return {
      ...withRun,
      verdict: 'error',
      failures: [
        `unsupported assertion type(s): ${report.unsupported.join(', ')} — implemented at T-256`,
        ...report.failures,
      ],
    };
  }
  return {
    ...withRun,
    verdict: report.failures.length === 0 ? 'pass' : 'fail',
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
  return {
    answer: run.response ?? '',
    citations,
    sourceSet,
    railOutcomes: run.steps.flatMap((step) => step.railOutcomes),
  };
}

function toObserved(source: { versionId: string } | { authorityRef: string }): ObservedSource {
  return 'versionId' in source ? { versionId: source.versionId } : { authorityRef: source.authorityRef };
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
