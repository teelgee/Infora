// T-281 — THE LENS IS NOT A PARAMETER OF `resolveAccess`, `assemble` OR
// `groundedLibrary`. The eleventh non-negotiable: a Lens changes register,
// never reach.
//
// The guarantee is enforced in three independent places, and this file is the
// first. None of them is redundant, because each fails a different way of
// getting it wrong:
//
//   1. HERE, at the type level — `assemble`'s signature is `Assemble` in
//      contracts, and its request shape is pinned key by key. Adding a `lens`
//      (or `persona`, or `role`) parameter breaks compilation.
//   2. IN THE MANIFEST — `@infora/lenses` depends on `@infora/contracts` and
//      nothing else, so this package holds no store handle, no access slice and
//      no retrieval query with which to narrow anything. scripts/dep-rules.mjs
//      fails the build if that line widens.
//   3. IN scripts/source-rules.mjs, RULE 3 — no file under packages/governance,
//      packages/knowledge or packages/data may so much as mention a Lens. That
//      is the one that catches `resolveAccess` and `groundedLibrary`, whose
//      signatures are not in contracts and so cannot be pinned from here.
//
// Deliberately absent from this test: any runtime assertion. A test that called
// `assemble` twice under two Lenses and compared source sets would prove the
// property for the inputs it happened to choose. `PERM-05` in the eval seed set
// (T-259) does exactly that as evidence; this file makes it unexpressible.
import { describe, expect, it } from 'vitest';
import type { Assemble, AssemblyRequest, Lens } from '@infora/contracts';

type ExactKeys<T, K extends keyof T> = [Exclude<keyof T, K>] extends [never]
  ? [Exclude<K, keyof T>] extends [never]
    ? true
    : false
  : false;

describe('T-281 — a Lens changes register, never reach', () => {
  it('the assembly signature has no Lens in it, and no room for one', () => {
    // if a Lens ever becomes a parameter of the one gateway every retrieval
    // goes through (ADR-0028 §4), these stop compiling
    const requestShape: ExactKeys<AssemblyRequest, 'request' | 'environment' | 'requester'> = true;
    const queryShape: ExactKeys<AssemblyRequest['request'], 'text' | 'mode'> = true;
    const requesterShape: ExactKeys<
      AssemblyRequest['requester'],
      'organisationId' | 'participantId'
    > = true;
    // and the whole call takes exactly one argument: there is no second,
    // optional "options" slot for a Lens to arrive through later
    const arity: Parameters<Assemble>['length'] = 1;

    expect([requestShape, queryShape, requesterShape, arity]).toEqual([true, true, true, 1]);
  });

  it('the Lens type carries no field a reach control could hide in', () => {
    // the positive half: a Lens is exactly these fifteen fields, all of which
    // are about how an answer reads. No scope, no filter, no corpus, no
    // visibility, no classification terms, no organisation.
    const lensShape: ExactKeys<
      Lens,
      | 'id'
      | 'label'
      | 'description'
      | 'status'
      | 'version'
      | 'register'
      | 'defaultDepth'
      | 'answerShape'
      | 'defaultOutput'
      | 'citationDisplay'
      | 'clarifyingBias'
      | 'escalationLanguage'
      | 'preferredWorkers'
      | 'prohibitions'
      | 'exampleExchanges'
    > = true;
    expect(lensShape).toBe(true);
  });

  it('`preferred_workers` is a hint, and its type says so — strings, not entitlements', () => {
    // a Lens naming a worker the requester is not entitled to changes nothing:
    // the tool set is assembled from entitlements first (T-269), and this field
    // ranks what is already there. It is `string[]` rather than a worker handle
    // precisely so it cannot be dereferenced into a capability.
    const workers: Lens['preferredWorkers'] = ['corpus_retrieval'];
    const isStrings: string[] = workers;
    expect(isStrings).toEqual(['corpus_retrieval']);
  });
});
