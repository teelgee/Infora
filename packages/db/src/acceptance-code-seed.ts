// Infora's default acceptance-code scheme (ADR-0003 as amended 2026-08-27,
// T-383), seeded from ISO 19650's **2021 UK National Annex** status codes —
// see docs/reference/iso-19650.md §7. COPIED into a project at creation — a
// copy, not a reference, so one project's edits never rewrite another's
// history (the ontology / naming-scheme pattern).
//
// ⚠ THE 2021 SET, NOT THE 2018 ONE. Most free material online — including the
// current edition of UK BIM Framework Guidance Part C, whose Edition 2 was
// never published — still reproduces the 2018 table without saying so. In that
// table `S5` meant *withdrawn*, `S6`/`S7` and `CR` existed, and `A2` implied a
// RIBA stage. All of that is gone: the 2021 NA reused `S5` for appointing-party
// acceptance, removed `S6`/`S7`/`CR`, deprecated `B1`/`Bn`, and made the
// Published codes stage-agnostic.
//
// WHY ONLY `A1`. The NA writes the Published codes as "A1, An…" and rules that
// the reason for each `An` code **must be written into the project's
// information standard** — `A4` might mean suitable for construction, `A5`
// suitable as a construction record, only because that project said so. A
// default cannot invent those meanings, so it ships the one code whose meaning
// the standard itself fixes, and the project adds its own (T-390's editor is
// what makes that possible). `B1`/`Bn` — partial sign-off — is deprecated and
// therefore not seeded, though a project may still add it: the NA permits codes
// to be expanded or excluded where the project's information standard
// documents them.
import type { Db } from './client.js';
import { acceptanceCodes } from './schema/drawer5-review.js';

export interface DefaultAcceptanceCode {
  code: string;
  description: string;
  // a deliverable-level code ends the cycle; a comment-level code is a
  // reviewer's verdict on one comment. The default leaves every code available
  // at both levels, as Infora's pre-19650 default did — the project narrows.
  isAccepting: boolean;
  isContractual: boolean;
  grounds: boolean;
}

// The default for `grounds` follows the revision column (ADR-0003 as amended):
// contractual grounds, preliminary does not. The owner may change it, and the
// blast-radius count on T-390's editor is what makes that change safe.
export const DEFAULT_ACCEPTANCE_SCHEME: DefaultAcceptanceCode[] = [
  {
    code: 'S0',
    description: 'Work in progress — not yet suitable to share outside the task team',
    isAccepting: false,
    isContractual: false,
    grounds: false,
  },
  {
    code: 'S1',
    description: 'Shared — suitable for coordination',
    isAccepting: false,
    isContractual: false,
    grounds: false,
  },
  {
    code: 'S2',
    description: 'Shared — suitable for information',
    isAccepting: false,
    isContractual: false,
    grounds: false,
  },
  {
    code: 'S3',
    description: 'Shared — suitable for review and comment',
    isAccepting: false,
    isContractual: false,
    grounds: false,
  },
  {
    // cl. 5.7.1 — the lead appointed party AUTHORIZES. Infora's internal QA
    // (sandbox-scope) cycle is this act, and it is never contractual (ADR-0041
    // §3, which the 2021 NA turns out to state itself).
    code: 'S4',
    description: 'Shared — submitted for lead appointed party authorization',
    isAccepting: false,
    isContractual: false,
    grounds: false,
  },
  {
    // cl. 5.7.3 — the appointing party ACCEPTS. New in 2021, introduced
    // precisely because industry was collapsing the two gates into one code.
    code: 'S5',
    description: 'Shared — submitted for appointing party review and acceptance',
    isAccepting: false,
    isContractual: false,
    grounds: false,
  },
  {
    code: 'A1',
    description: 'Published — authorized and accepted',
    isAccepting: true,
    isContractual: true,
    grounds: true,
  },
];

// Copy the default scheme into one project. The unique index on
// (project, code) among the live set makes a second call throw rather than
// duplicate — the same shape as seedProjectOntology.
export async function seedProjectAcceptanceCodes(db: Db, projectId: string): Promise<void> {
  await db.insert(acceptanceCodes).values(
    DEFAULT_ACCEPTANCE_SCHEME.map((entry, index) => ({
      projectId,
      code: entry.code,
      description: entry.description,
      level: 'both' as const,
      isAccepting: entry.isAccepting,
      isContractual: entry.isContractual,
      grounds: entry.grounds,
      sortOrder: index + 1,
    })),
  );
}
