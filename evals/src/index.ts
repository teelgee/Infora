// @infora/evals — the Ask eval harness (T-255). Cases and fixtures are data;
// the runner executes them through the real HTTP API with a real session.
export { ASSERTION_TYPES, CATEGORIES, caseSchema, declaredAssertions, loadCaseFile } from './case';
export type { Assertions, AssertionType, Category, EvalCase } from './case';
export { FIXTURE_PASSWORD, fixtureSchema, loadFixtureFile, materialise } from './fixture';
export type { Fixture, FixtureInstance } from './fixture';
export { FAKE_CHAT_FAMILY, HarnessSession, startHarness } from './harness';
export type { Harness } from './harness';
export { claimOf, gradeClaims, GRADED_PREFIX, isGraded } from './grading';
export type { GradeRecord, Grader, GradeRequest, GradingContext } from './grading';
export { evaluateAssertions, Unevaluable } from './assertions';
export type {
  AssertionContext,
  AssertionReport,
  Observation,
  ObservedSource,
  RetrievalMetrics,
} from './assertions';
export { prepareFixture, runCase, UnresolvedRef } from './runner';
export type { CaseResult, Verdict } from './runner';
export { buildReport, formatReport, modeOf, REPORTED_MODES } from './report';
export type { EvalReport, ReportedMode, Tally } from './report';
export { defaultRepeats, graded, isTier, selectCases, TIERS } from './tiers';
export type { Selection, Tier } from './tiers';
export { flakeGates, flakeNote, foldAttempts } from './flake';
export { CASES_DIR, FIXTURES_DIR, loadCaseById, loadCases, prepareFixtures, runCases } from './suite';
