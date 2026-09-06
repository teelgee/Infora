// T-440 — the app predicates as a unit, beside sandbox.test.ts and
// access.test.ts. The wall inside an app is a pure function, so it is testable
// without a database and it is tested here first; the three-organisation e2e
// then proves the same rule holds through the routes, driven as each party.
import { describe, expect, it } from 'vitest';
import type { EntitledSlice } from './access';
import { appRunnable, canBuildApp, canOpenApp, canReadAppRow, canReassignApp, canShareAppTable, withinAppScope } from './app';
import type { AppBuildFacts, AppRowVisibilityFacts } from './app';

/** the two fields every predicate below actually judges; the rest of an
 * EntitledSlice is irrelevant to them and saying so keeps the fixtures honest */
const slice = (organisationId: string): Pick<EntitledSlice, 'organisationId' | 'participantId'> => ({
  organisationId,
  participantId: `participant-of-${organisationId}`,
});

const OWNER_ORG = 'org-trentmoor';
const ENTERING_ORG = 'org-calderhale';
const THIRD_ORG = 'org-redgate';

function row(over: Partial<AppRowVisibilityFacts> = {}): AppRowVisibilityFacts {
  return {
    projectOwnerOrganisationId: OWNER_ORG,
    enteringOrganisationId: ENTERING_ORG,
    state: 'submitted',
    sharedWithOrganisationIds: [],
    withinScope: true,
    ...over,
  };
}

function app(over: Partial<AppBuildFacts> = {}): AppBuildFacts {
  return {
    ownerOrganisationId: ENTERING_ORG,
    ownerIsLive: true,
    closed: false,
    published: true,
    withinScope: true,
    ...over,
  };
}

describe('the row predicate: entering organisation, or the owner, or a share — and nothing else', () => {
  it('reads its own organisation’s row', () => {
    expect(canReadAppRow(slice(ENTERING_ORG), row())).toBe(true);
  });

  it('reads a submitted row as the project owner', () => {
    expect(canReadAppRow(slice(OWNER_ORG), row())).toBe(true);
  });

  it('does NOT read a peer organisation’s row — the whole point of the drawer', () => {
    expect(canReadAppRow(slice(THIRD_ORG), row())).toBe(false);
  });

  it('reads it once the owner has shared the table, and stops when the share is closed', () => {
    expect(canReadAppRow(slice(THIRD_ORG), row({ sharedWithOrganisationIds: [THIRD_ORG] }))).toBe(true);
    // the caller passes LIVE shares only, so a revoked share is simply absent
    expect(canReadAppRow(slice(THIRD_ORG), row({ sharedWithOrganisationIds: [] }))).toBe(false);
  });

  it('a share never reaches a third organisation', () => {
    expect(canReadAppRow(slice('org-halvern'), row({ sharedWithOrganisationIds: [THIRD_ORG] }))).toBe(false);
  });

  it('refuses everyone outside the app’s participant scope, the project owner included', () => {
    expect(canReadAppRow(slice(OWNER_ORG), row({ withinScope: false }))).toBe(false);
    expect(canReadAppRow(slice(ENTERING_ORG), row({ withinScope: false }))).toBe(false);
  });
});

describe('a draft is read by its entering organisation alone (ruling 3)', () => {
  it('the entering organisation reads its own draft', () => {
    expect(canReadAppRow(slice(ENTERING_ORG), row({ state: 'draft' }))).toBe(true);
  });

  it('the PROJECT OWNER does not — the dashboard says “no return yet”, which is honest', () => {
    expect(canReadAppRow(slice(OWNER_ORG), row({ state: 'draft' }))).toBe(false);
  });

  it('and neither does an organisation the table is shared with', () => {
    expect(
      canReadAppRow(slice(THIRD_ORG), row({ state: 'draft', sharedWithOrganisationIds: [THIRD_ORG] })),
    ).toBe(false);
  });

  it('the owner reads it from `submitted` onward, and every later state', () => {
    for (const state of ['submitted', 'accepted', 'rejected', 'superseded'] as const) {
      expect(canReadAppRow(slice(OWNER_ORG), row({ state }))).toBe(true);
    }
  });

  it('a table with no acceptance step has no draft to hide', () => {
    expect(canReadAppRow(slice(OWNER_ORG), row({ state: null }))).toBe(true);
  });
});

describe('the scope ladder is the grant set, and a revocation closes it', () => {
  const org = { granteeType: 'organisation' as const, organisationId: THIRD_ORG, participantId: null };
  it('admits an organisation grant, and stops on revocation', () => {
    expect(withinAppScope(slice(THIRD_ORG), [{ ...org, revokedAt: null }])).toBe(true);
    expect(withinAppScope(slice(THIRD_ORG), [{ ...org, revokedAt: new Date() }])).toBe(false);
  });

  it('admits a named participant without their organisation', () => {
    const grants = [
      { granteeType: 'participant' as const, organisationId: null, participantId: 'p-nadia', revokedAt: null },
    ];
    expect(withinAppScope({ organisationId: THIRD_ORG, participantId: 'p-nadia' }, grants)).toBe(true);
    expect(withinAppScope({ organisationId: THIRD_ORG, participantId: 'p-other' }, grants)).toBe(false);
  });
});

describe('building, opening and running', () => {
  it('needs the organisation’s own toggle — being on the project is not enough (§12)', () => {
    expect(canBuildApp(slice(ENTERING_ORG), false, app())).toBe(false);
    expect(canBuildApp(slice(ENTERING_ORG), true, app())).toBe(true);
  });

  it('is the app’s own organisation’s business — the project owner does not build somebody else’s app', () => {
    expect(canBuildApp(slice(OWNER_ORG), true, app())).toBe(false);
  });

  it('an unpublished app is open to its builders alone (ruling 2)', () => {
    const unpublished = app({ published: false });
    expect(canOpenApp(slice(ENTERING_ORG), true, unpublished)).toBe(true);
    // a colleague in the same firm without the toggle sees nothing yet
    expect(canOpenApp(slice(ENTERING_ORG), false, unpublished)).toBe(false);
    // and neither does the client the form is being built for
    expect(canOpenApp(slice(OWNER_ORG), true, unpublished)).toBe(false);
  });

  it('a published app is open to everyone in its scope', () => {
    expect(canOpenApp(slice(OWNER_ORG), false, app())).toBe(true);
  });

  it('an app whose owner has gone is defunct and cannot run until reassigned', () => {
    expect(appRunnable(app({ ownerIsLive: false }))).toEqual({
      runnable: false,
      because: 'the app has no owner and is defunct until it is reassigned',
    });
    expect(appRunnable(app()).runnable).toBe(true);
  });

  it('a closed app never runs, and an unpublished one has nothing to run against', () => {
    expect(appRunnable(app({ closed: true })).runnable).toBe(false);
    expect(appRunnable(app({ published: false })).runnable).toBe(false);
  });
});

describe('sharing and reassigning are super-user acts', () => {
  it('sharing a table is the project owner super-user’s and nobody else’s (§6)', () => {
    expect(canShareAppTable({ membershipRole: 'owner', elevated: true })).toBe(true);
    expect(canShareAppTable({ membershipRole: 'owner', elevated: false })).toBe(false);
    expect(canShareAppTable({ membershipRole: 'member', elevated: true })).toBe(false);
  });

  it('reassigning is the project owner’s, and the app’s own firm’s (§7, §12)', () => {
    const facts = { ownerOrganisationId: ENTERING_ORG };
    expect(canReassignApp({ ...slice(OWNER_ORG), membershipRole: 'owner', elevated: true }, facts)).toBe(true);
    expect(canReassignApp({ ...slice(ENTERING_ORG), membershipRole: 'member', elevated: true }, facts)).toBe(true);
    // a third firm on the project cannot take somebody else's app
    expect(canReassignApp({ ...slice(THIRD_ORG), membershipRole: 'member', elevated: true }, facts)).toBe(false);
    // and it is never an ordinary participant's act
    expect(canReassignApp({ ...slice(ENTERING_ORG), membershipRole: 'member', elevated: false }, facts)).toBe(false);
  });
});
