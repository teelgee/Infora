// T-445 — the playbook's two predicates (ADR-0056 §10, §12).
//
// A unit test of a predicate proves nothing about a route, which is why the
// real acceptance is `apps/api/src/playbooks.test.ts` driving each party over
// HTTP. What this file pins is the shape of the rule itself: the wall is the
// organisation, being on the same project admits nobody, and deploying needs
// the same permission to build that making an app from nothing needs.
import { describe, expect, it } from 'vitest';
import { canDeployPlaybook, canReadPlaybook } from './playbook';

const firm = { organisationId: 'org-consultancy' };
const client = { organisationId: 'org-client' };

const theirs = { organisationId: 'org-consultancy', suppliedByInfora: false, retiredAt: null };
const supplied = { organisationId: 'org-infora', suppliedByInfora: true, retiredAt: null };
const somebodyElses = { organisationId: 'org-rival', suppliedByInfora: false, retiredAt: null };

describe('who reads a playbook (ADR-0056 §10)', () => {
  it('is the firm whose shelf it is on, and nobody else', () => {
    expect(canReadPlaybook(firm, theirs)).toBe(true);
    expect(canReadPlaybook(client, theirs)).toBe(false);
    expect(canReadPlaybook(firm, somebodyElses)).toBe(false);
  });

  it('puts Infora’s supplied templates on every firm’s shelf (§11)', () => {
    expect(canReadPlaybook(firm, supplied)).toBe(true);
    expect(canReadPlaybook(client, supplied)).toBe(true);
  });
});

describe('who deploys one (ADR-0056 §10, §12)', () => {
  it('needs their own firm’s permission to build', () => {
    expect(canDeployPlaybook(firm, true, theirs)).toBe(true);
    expect(canDeployPlaybook(firm, false, theirs)).toBe(false);
    // deploying is not an easier way to get an app than making one from nothing
    expect(canDeployPlaybook(firm, false, supplied)).toBe(false);
  });

  it('will not deploy another firm’s template, or a retired one', () => {
    expect(canDeployPlaybook(firm, true, somebodyElses)).toBe(false);
    expect(
      canDeployPlaybook(firm, true, { ...theirs, retiredAt: new Date('2026-09-07T00:00:00Z') }),
    ).toBe(false);
  });
});
