// @infora/evals — the Ask eval harness (T-255). Cases and fixtures are data;
// the runner executes them through the real HTTP API with a real session.
export { ASSERTION_TYPES, CATEGORIES, caseSchema, declaredAssertions, loadCaseFile } from './case';
export type { Assertions, AssertionType, Category, EvalCase } from './case';
export { FIXTURE_PASSWORD, fixtureSchema, loadFixtureFile, materialise } from './fixture';
export type { Fixture, FixtureInstance } from './fixture';
export { HarnessSession, startHarness } from './harness';
export type { Harness } from './harness';
export { evaluateAssertions, Unevaluable } from './assertions';
export type {
  AssertionContext,
  AssertionReport,
  Observation,
  ObservedSource,
  RetrievalMetrics,
} from './assertions';
export { prepareFixture, runCase, UnresolvedRef } from './runner';
export type { CaseResult } from './runner';
export { buildReport, formatReport } from './report';
export type { CategoryTally, EvalReport } from './report';
export { CASES_DIR, FIXTURES_DIR, loadCaseById, loadCases, prepareFixtures, runCases } from './suite';
