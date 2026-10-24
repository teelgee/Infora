// T-484 — before any spec runs, take out the "T472-…" reference documents that
// earlier (or crashed) runs of the reference-intake spec left in the seeded
// project. The spec sweeps for itself too, but the specs that read the library's
// first page (documents, library-bulk) run before it alphabetically, so on a
// polluted database the sweep has to come first. Product doors only: see
// tests/support/sweep-reference-intake.ts.
import { sweepReferenceIntake } from './tests/support/sweep-reference-intake';

export default async function globalSetup() {
  await sweepReferenceIntake();
}
