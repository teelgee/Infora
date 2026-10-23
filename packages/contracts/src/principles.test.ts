// The API's law, pinned — contracts.md's principles 3 and 4 as signature
// tests, following wall.test.ts's pattern for principle 2 (no scope-widening
// parameter): the guarantee is a shape, so pin the shape and make changing it
// a reviewable event rather than a silent drift.
//
// Principle 2's test lives beside the gateway it pins
// (packages/knowledge/src/wall.test.ts); principle 4's HTTP half — a denied
// request answers the same 404 as a nonexistent one, on every scoped route —
// lives at the boundary it exercises (apps/api/src/requester.test.ts, T-023).
// What is pinned HERE is the contracts-package half of each: the vocabulary
// and the request shapes every implementation is typed against.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ApiError } from './errors';
import * as endpoints from './endpoints';

describe('principle 4 — deny is silent', () => {
  it('the error vocabulary is pinned; a new member is a reviewable event', () => {
    // `not_found` covers both nonexistence and denial; `forbidden` exists only
    // WITHIN an entitled scope, where existence is already visible (the
    // author-only sandbox-comment writes, the T-246 grant refusal, the T-249
    // label refusal — in each the requester already sees both sides). A new
    // error word is where a cross-wall leak would arrive politely, so adding
    // one fails this test until the addition is argued.
    type ExactUnion<T, U extends T> = [Exclude<T, U>] extends [never] ? true : false;
    const vocabulary: ExactUnion<
      ApiError['error'],
      'not_found' | 'conflict' | 'invalid' | 'unauthenticated' | 'forbidden' | 'rate_limited'
    > = true;
    expect(vocabulary).toBe(true);
  });
});

describe('principle 3 — the requester is resolved, never supplied', () => {
  // Every identity-shaped key in every request-body schema, found by walking
  // the schemas themselves rather than trusting a list. A body may name a
  // SUBJECT — the user being enrolled, the organisation being shared with,
  // the participant being appointed — but never the REQUESTER, whose identity
  // comes from the session alone. The pin below is the reviewed subject list;
  // a new identity key anywhere fails until it is reviewed in as a subject.
  const IDENTITY_KEY = /^(user|organisation|participant|requester|actor)Ids?$/;

  function identityKeys(schema: unknown, found: Set<string>, depth = 0): void {
    if (depth > 6 || !(schema instanceof z.ZodType)) return;
    if (schema instanceof z.ZodObject) {
      for (const [key, value] of Object.entries(schema.shape)) {
        if (IDENTITY_KEY.test(key)) found.add(key);
        identityKeys(value, found, depth + 1);
      }
      return;
    }
    if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
      identityKeys(schema.unwrap(), found, depth + 1);
      return;
    }
    if (schema instanceof z.ZodArray) identityKeys(schema.element, found, depth + 1);
  }

  it('only the reviewed subject fields carry an identity-shaped key', () => {
    const observed: Record<string, string[]> = {};
    for (const [name, value] of Object.entries(endpoints)) {
      const found = new Set<string>();
      identityKeys(value, found);
      if (found.size > 0) observed[name] = [...found].sort();
    }

    // each entry is a SUBJECT, argued once here: who the act is about, with
    // the requester's own identity still resolved from the session
    expect(observed).toEqual({
      addMembershipBody: ['organisationId'], // the organisation being seated
      bulkTransmitBody: ['organisationIds'], // the recipients of a bulk issue — the same subject as issueTransmittalBody (T-461)
      createAppBody: ['organisationIds', 'participantIds'], // the app's initial scope set (T-440)
      createGrantRuleBody: ['participantId'], // the appointee the rule names
      createSandboxBody: ['organisationIds', 'participantIds'], // the initial scope set (T-187)
      enrolParticipantBody: ['userId'], // the colleague being enrolled (ADR-0015 level two)
      grantAppScopeBody: ['organisationId', 'participantId'], // the app scope being widened to (T-440)
      grantAppointmentBody: ['participantId'], // the author/reviewer being appointed
      nameLeadReviewerBody: ['participantId'], // the replacement lead being named (T-377)
      grantParticipantBody: ['participantId'], // the ADR-0035 §3 narrowing grantee
      grantSandboxScopeBody: ['organisationId', 'participantId'], // the scope being widened to
      issueTransmittalBody: ['organisationIds'], // the recipients of the issue
      reassignAppBody: ['participantId'], // the person an app is reassigned to (T-440)
      setDocumentOwnerBody: ['participantId'], // the participant ownership passes to
      shareAppTableBody: ['organisationId'], // the organisation an app table is shared with (ADR-0056 §6)
      shareDeliverableBody: ['organisationId'], // the organisation shared with (ADR-0016)
    });
  });
});
