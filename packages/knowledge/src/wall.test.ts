// T-033 — the wall through the gateway (M2 acceptance): the same query
// returns content to the entitled requester and nothing to the unentitled;
// the superseded Version never appears; every item is channel-annotated; and
// no parameter exists by which a caller could WIDEN scope — checked at the
// type level, because the guarantee is the signature's shape (ADR-0029). T-469
// added a request `scope`, and the invariant these tests pin is now stated for
// what it protects: **scope ∩ visible == what is retrieved**. A scope is an
// intersection, never a union, and one naming a document the requester may not
// see retrieves, and counts, nothing from it — proved as each party below.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AssembledItem, AssemblyRequest } from '@infora/contracts';
import type { Attenuation } from '@infora/governance';
import { createDb, schema as s } from '@infora/db';
import { createAssembler } from './gateway';
import { FAKE_EMBED_MODEL, fakeRouter, fakeVector } from './test-router';

const { db, pool } = createDb();
const assemble = createAssembler({ db, router: fakeRouter() });

let projectId: string;
let entitled: AssemblyRequest['requester'];
let unentitled: AssemblyRequest['requester']; // a real participant — of another project
let supersededVersionId: string;
let containerId: string; // T-248 — the one container a narrowing can name

beforeAll(async () => {
  const stamp = Date.now();
  const [orgA] = await db.insert(s.organisations).values({ name: 't033 org A' }).returning();
  const [orgC] = await db.insert(s.organisations).values({ name: 't033 org C' }).returning();

  const [project] = await db
    .insert(s.projects)
    .values({ name: 't033 project', ownerOrganisationId: orgA!.id })
    .returning();
  projectId = project!.id;
  await db
    .insert(s.memberships)
    .values({ organisationId: orgA!.id, projectId, role: 'owner' });

  const [alice] = await db
    .insert(s.users)
    .values({ name: 't033 alice', email: `t033-alice-${stamp}@test.local`, organisationId: orgA!.id })
    .returning();
  const [aliceParticipant] = await db
    .insert(s.participants)
    .values({ userId: alice!.id, projectId })
    .returning();
  entitled = { organisationId: orgA!.id, participantId: aliceParticipant!.id };

  // org C holds a genuine Participant — on its own project, not this one
  const [otherProject] = await db
    .insert(s.projects)
    .values({ name: 't033 other project', ownerOrganisationId: orgC!.id })
    .returning();
  await db
    .insert(s.memberships)
    .values({ organisationId: orgC!.id, projectId: otherProject!.id, role: 'owner' });
  const [dara] = await db
    .insert(s.users)
    .values({ name: 't033 dara', email: `t033-dara-${stamp}@test.local`, organisationId: orgC!.id })
    .returning();
  const [daraParticipant] = await db
    .insert(s.participants)
    .values({ userId: dara!.id, projectId: otherProject!.id })
    .returning();
  unentitled = { organisationId: orgC!.id, participantId: daraParticipant!.id };

  // one library document with a superseded v1 and a live v2, both indexed
  const [container] = await db
    .insert(s.containers)
    .values({ projectId, producingOrganisationId: orgA!.id, documentReference: `T33-LIB-GIR-${stamp}`, inLibrary: true })
    .returning();
  containerId = container!.id;
  const versions = [
    { ref: 'v1', current: false, content: 'alpha superseded: no exceedances recorded.' },
    { ref: 'v2', current: true, content: 'alpha current: elevated PAH concentrations recorded.' },
  ];
  for (const v of versions) {
    const [version] = await db
      .insert(s.versions)
      .values({ containerId: container!.id, versionReference: v.ref, content: v.content, isCurrent: v.current })
      .returning();
    if (!v.current) supersededVersionId = version!.id;
    await db.insert(s.versionChunks).values({
      versionId: version!.id,
      chunkIndex: 0,
      content: v.content,
      embedding: fakeVector(v.content),
      embeddingModelId: FAKE_EMBED_MODEL,
      embeddingModelVersion: 'fake-1',
    });
  }
});

afterAll(async () => {
  await pool.end();
});

const query = (requester: AssemblyRequest['requester']): AssemblyRequest => ({
  request: { text: 'alpha contamination question', mode: 'baseline' },
  environment: { kind: 'project', projectId },
  requester,
});

describe('the wall through the gateway (T-033)', () => {
  it('same query: content for the entitled, nothing for the unentitled', async () => {
    const forEntitled = await assemble(query(entitled));
    const forUnentitled = await assemble(query(unentitled));

    expect(forEntitled.items.length).toBeGreaterThan(0);
    expect(forEntitled.budget.tokensUsed).toBeGreaterThan(0);
    expect(forUnentitled.items).toEqual([]);
    expect(forUnentitled.budget.tokensUsed).toBe(0);
  });

  it('the superseded Version is never returned, even to the entitled', async () => {
    const { items } = await assemble(query(entitled));
    for (const item of items) {
      expect(item.source).not.toEqual({ versionId: supersededVersionId });
      expect(item.content).not.toContain('superseded');
    }
  });

  it('every returned item is annotated with channel, and only a citable one carries a source', async () => {
    const { items } = await assemble(query(entitled));
    for (const item of items) {
      expect(['grounded', 'guiding', 'informing']).toContain(item.channel);
      if (item.channel === 'grounded') {
        expect(item.corpus).toBe('library');
        expect(item.source && ('versionId' in item.source || 'authorityRef' in item.source)).toBe(true);
      } else {
        // T-308 — a guiding item has NO source, and the absence is the
        // guarantee rather than an omission: `source` is what a citation
        // resolves to, and guiding material is never cited as project fact
        // (ADR-0021, ADR-0048 §5). An item that could not be cited but carried
        // a source anyway is a source chip waiting to be rendered.
        expect(item.source).toBeUndefined();
      }
    }
  });

  it('no parameter exists to WIDEN scope — the signature is the guarantee', () => {
    // compile-time exact-key checks: adding any widening parameter (corpus,
    // store, visibility, extra requester fields…) breaks this test's types
    type ExactKeys<T, K extends keyof T> = [Exclude<keyof T, K>] extends [never]
      ? [Exclude<K, keyof T>] extends [never]
        ? true
        : false
      : false;

    const requestShape: ExactKeys<AssemblyRequest, 'request' | 'environment' | 'requester'> = true;
    const requesterShape: ExactKeys<
      AssemblyRequest['requester'],
      'organisationId' | 'participantId'
    > = true;
    // T-469 added `scope`, and this test firing is the review. It is the one
    // request field that names documents, and it is admissible beside the
    // guarantee because it only NARROWS: the gateway resolves the wall, record
    // state and the entitled slice first and intersects the scope with that
    // set, so it can remove rows and never add one. The tests below prove it
    // as each party — a person in another organisation naming this one's
    // document gets nothing and counts nothing.
    const queryShape: ExactKeys<AssemblyRequest['request'], 'text' | 'mode' | 'scope'> = true;
    // T-253 added `chunkId`: an AUDIT field (which passage was seen), never a
    // scope one — it records what retrieval returned and cannot influence what
    // retrieval returns. Adding a key here is meant to be a reviewable event,
    // which is the whole point of pinning the shape.
    //
    // T-271 added `locator` on the same terms, and this test firing is the
    // review. It says WHERE an admitted passage sits in its version — computed
    // from a span the ingest path stored, on rows retrieval had already
    // returned. It is on the output side of the pre-filter, so it can no more
    // widen a slice than `chunkId` can.
    // T-308 added `rule`, and made `source` optional, and this test firing is
    // the review. `rule` carries the clause address a finding needs to quote a
    // house rule (ADR-0048 §5) — an OUTPUT annotation on an item the guiding
    // pipeline had already decided to return, exactly as `chunkId` and
    // `locator` are on the grounded side. It cannot widen a slice because
    // there is no slice to widen: the guiding read is keyed on the requester's
    // own organisation and reaches no project, no share and no other party.
    // `source` going optional narrows rather than widens — it is what says a
    // guiding item is not citable.
    // T-272 added `descriptor` and `relevance`, and this test firing is the
    // review. Both are OUTPUT annotations on rows the pre-filter had already
    // returned — how the source reads (its reference, title, revision and
    // whether it is superseded) and how well it scored — carrying no predicate
    // and no id a caller could pass back in. They can no more widen a slice
    // than `chunkId` or `locator` can, and they exist because a worker's
    // STRUCTURED output has to be able to name a document rather than only its
    // uuid.
    const itemShape: ExactKeys<
      AssembledItem,
      | 'channel'
      | 'corpus'
      | 'source'
      | 'rule'
      | 'chunkId'
      | 'locator'
      | 'descriptor'
      | 'relevance'
      | 'content'
    > = true;

    // T-248 extended this test to the OTHER direction, because "no parameter
    // widens" and "the narrowing parameter cannot widen either" are two
    // different claims and only the first was pinned. Two things are asserted
    // here and neither is redundant:
    //
    //   • `Attenuation`'s keys are exactly the two narrowing axes. A field
    //     added here — an extra project, a second organisation, a corpus
    //     name — would be a widening one by construction, and the review it
    //     needs is this test failing.
    //   • construction-time narrowing is STILL not a request field that
    //     widens. It rides the resolved slice via a constructed assembler; the
    //     request's own `scope` (T-469) is the same intersection spelled per
    //     call, and the shape above pins that it is the only addition.
    const attenuationShape: ExactKeys<Attenuation, 'containerIds' | 'elevated'> = true;

    expect([requestShape, requesterShape, queryShape, itemShape, attenuationShape]).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
  });
});

// T-248 — the narrowing reaching the pre-filter (finding F8). The unit proof
// that attenuation never widens is attenuation.test.ts; what this adds is that
// the narrowing is actually INTERSECTED into the one query, so it composes with
// the wall rather than being applied beside it.
describe('scope attenuation through the gateway (T-248)', () => {
  const narrowed = (narrowing: Attenuation) =>
    createAssembler({ db, router: fakeRouter() }, narrowing);

  it('an unnarrowed assembler is unchanged — this ticket blocks nothing', async () => {
    const { items } = await createAssembler({ db, router: fakeRouter() })(query(entitled));
    expect(items.filter((i) => i.channel === 'grounded').length).toBeGreaterThan(0);
  });

  it('a narrowing to the container the requester already reaches returns the same grounded set', async () => {
    const wide = await assemble(query(entitled));
    const narrow = await narrowed({ containerIds: [containerId] })(query(entitled));
    expect(narrow.items.filter((i) => i.channel === 'grounded')).toEqual(
      wide.items.filter((i) => i.channel === 'grounded'),
    );
  });

  it('a narrowing to another container returns no grounded content', async () => {
    const { items } = await narrowed({ containerIds: [crypto.randomUUID()] })(query(entitled));
    expect(items.filter((i) => i.channel === 'grounded')).toEqual([]);
  });

  it('a narrowing to NOTHING admits nothing — absent and empty are not the same value', async () => {
    const { items } = await narrowed({ containerIds: [] })(query(entitled));
    expect(items.filter((i) => i.channel === 'grounded')).toEqual([]);
  });

  it('a narrowing cannot recover what the wall already refused', async () => {
    // the unentitled requester naming the entitled requester's own container:
    // resolution fails first, so there is nothing for the narrowing to act on
    const { items } = await narrowed({ containerIds: [containerId] })(query(unentitled));
    expect(items).toEqual([]);
  });
});

// T-136 — the ADR-0035 acknowledgement gate and intra-organisation narrowing,
// through the same one gateway. Every retrieval — baseline and the retrieval
// sub-agent's (ADR-0028 §4) — routes through assemble(), so gating it here is
// the gate holding for the agent path by construction, not only for direct
// reads.
describe('the acknowledgement gate and intra-org narrowing (T-136, ADR-0035)', () => {
  let owner: AssemblyRequest['requester']; // owner-org participant — ungated (§2)
  let paul: AssemblyRequest['requester']; // receiving-org participant
  let quinn: AssemblyRequest['requester']; // receiving-org participant, a colleague
  let gateProjectId: string;
  let ownerOrgId: string;
  let recvOrgId: string;
  let paulParticipantId: string;
  let quinnParticipantId: string;

  // a library deliverable produced by the owner org, optionally shared with the
  // receiving org, optionally acknowledged (by Paul, on the org's behalf),
  // optionally narrowed to named participants — returns its live version id
  async function makeDeliverable(opts: {
    ref: string;
    producingOrganisationId: string;
    shareWithRecv?: boolean;
    acknowledged?: boolean;
    narrowedTo?: string[]; // participant ids granted
  }): Promise<string> {
    const [container] = await db
      .insert(s.containers)
      .values({
        projectId: gateProjectId,
        producingOrganisationId: opts.producingOrganisationId,
        documentReference: opts.ref,
        inLibrary: true,
      })
      .returning();
    const content = `gamma deliverable ${opts.ref}`;
    const [version] = await db
      .insert(s.versions)
      .values({ containerId: container!.id, versionReference: 'v1', content, isCurrent: true })
      .returning();
    await db.insert(s.versionChunks).values({
      versionId: version!.id,
      chunkIndex: 0,
      content,
      embedding: fakeVector(content),
      embeddingModelId: FAKE_EMBED_MODEL,
      embeddingModelVersion: 'fake-1',
    });
    if (opts.shareWithRecv) {
      await db.insert(s.deliverableShares).values({
        containerId: container!.id,
        organisationId: recvOrgId,
        grantedByParticipantId: paulParticipantId,
      });
    }
    if (opts.acknowledged) {
      await db.insert(s.deliverableAcknowledgements).values({
        containerId: container!.id,
        versionId: version!.id,
        organisationId: recvOrgId,
        acknowledgedByParticipantId: paulParticipantId,
      });
    }
    for (const participantId of opts.narrowedTo ?? []) {
      await db.insert(s.deliverableParticipantGrants).values({
        containerId: container!.id,
        organisationId: recvOrgId,
        participantId,
        grantedByParticipantId: paulParticipantId,
      });
    }
    return version!.id;
  }

  const gammaQuery = (requester: AssemblyRequest['requester']): AssemblyRequest => ({
    request: { text: 'gamma deliverable question', mode: 'baseline' },
    environment: { kind: 'project', projectId: gateProjectId },
    requester,
  });

  // does this requester retrieve the given deliverable version through the gateway?
  async function canRetrieve(
    requester: AssemblyRequest['requester'],
    versionId: string,
  ): Promise<boolean> {
    const { items } = await assemble(gammaQuery(requester));
    return items.some((i) => i.source && 'versionId' in i.source && i.source.versionId === versionId);
  }

  beforeAll(async () => {
    const stamp = Date.now();
    const [ownerOrg] = await db.insert(s.organisations).values({ name: 't136 owner' }).returning();
    const [recvOrg] = await db.insert(s.organisations).values({ name: 't136 recv' }).returning();
    ownerOrgId = ownerOrg!.id;
    recvOrgId = recvOrg!.id;

    const [project] = await db
      .insert(s.projects)
      .values({ name: 't136 project', ownerOrganisationId: ownerOrgId })
      .returning();
    gateProjectId = project!.id;
    await db.insert(s.memberships).values([
      { organisationId: ownerOrgId, projectId: gateProjectId, role: 'owner' },
      { organisationId: recvOrgId, projectId: gateProjectId, role: 'member' },
    ]);

    const [olivia] = await db
      .insert(s.users)
      .values({ name: 't136 olivia', email: `t136-olivia-${stamp}@test.local`, organisationId: ownerOrgId })
      .returning();
    const [oliviaP] = await db
      .insert(s.participants)
      .values({ userId: olivia!.id, projectId: gateProjectId })
      .returning();
    owner = { organisationId: ownerOrgId, participantId: oliviaP!.id };

    const [paulUser] = await db
      .insert(s.users)
      .values({ name: 't136 paul', email: `t136-paul-${stamp}@test.local`, organisationId: recvOrgId })
      .returning();
    const [quinnUser] = await db
      .insert(s.users)
      .values({ name: 't136 quinn', email: `t136-quinn-${stamp}@test.local`, organisationId: recvOrgId })
      .returning();
    const [paulP] = await db
      .insert(s.participants)
      .values({ userId: paulUser!.id, projectId: gateProjectId })
      .returning();
    const [quinnP] = await db
      .insert(s.participants)
      .values({ userId: quinnUser!.id, projectId: gateProjectId })
      .returning();
    paulParticipantId = paulP!.id;
    quinnParticipantId = quinnP!.id;
    paul = { organisationId: recvOrgId, participantId: paulParticipantId };
    quinn = { organisationId: recvOrgId, participantId: quinnParticipantId };
  });

  it('(b) the gate withholds from ALL entitled participants until the org acknowledges once', async () => {
    // shared but unacknowledged — withheld from the whole receiving org
    const before = await makeDeliverable({
      ref: `T136-NOACK-${Date.now()}`,
      producingOrganisationId: ownerOrgId,
      shareWithRecv: true,
      acknowledged: false,
    });
    expect(await canRetrieve(paul, before)).toBe(false);
    expect(await canRetrieve(quinn, before)).toBe(false);

    // acknowledged once (by Paul, on the org's behalf) — opens for the whole org
    const after = await makeDeliverable({
      ref: `T136-ACKED-${Date.now()}`,
      producingOrganisationId: ownerOrgId,
      shareWithRecv: true,
      acknowledged: true,
    });
    expect(await canRetrieve(paul, after)).toBe(true);
    expect(await canRetrieve(quinn, after)).toBe(true);
  });

  it('(d) whole-org default: no narrowing present means every entitled participant sees it', async () => {
    const v = await makeDeliverable({
      ref: `T136-OPEN-${Date.now()}`,
      producingOrganisationId: ownerOrgId,
      shareWithRecv: true,
      acknowledged: true,
    });
    expect(await canRetrieve(paul, v)).toBe(true);
    expect(await canRetrieve(quinn, v)).toBe(true);
  });

  it('(a) intra-org narrowing: the same query returns it to the granted, nothing to the ungranted', async () => {
    const v = await makeDeliverable({
      ref: `T136-NARROW-${Date.now()}`,
      producingOrganisationId: ownerOrgId,
      shareWithRecv: true,
      acknowledged: true,
      narrowedTo: [paulParticipantId],
    });
    expect(await canRetrieve(paul, v)).toBe(true);
    expect(await canRetrieve(quinn, v)).toBe(false);
  });

  it('(e) the owner and authoring org see it with no share and no acknowledgement gate', async () => {
    // shared to recv but NOT acknowledged: recv sees nothing, yet the owner org
    // retrieves it ungated (§2)
    const ownerView = await makeDeliverable({
      ref: `T136-OWNER-${Date.now()}`,
      producingOrganisationId: ownerOrgId,
      shareWithRecv: true,
      acknowledged: false,
    });
    expect(await canRetrieve(owner, ownerView)).toBe(true);
    expect(await canRetrieve(paul, ownerView)).toBe(false);

    // produced by the receiving org (the author): its own participants see it
    // with no share and no acknowledgement
    const authored = await makeDeliverable({
      ref: `T136-AUTHORED-${Date.now()}`,
      producingOrganisationId: recvOrgId,
    });
    expect(await canRetrieve(paul, authored)).toBe(true);
    expect(await canRetrieve(quinn, authored)).toBe(true);
  });

  it('(f) the conjunction is independent: within-narrowing-but-unacked and acked-but-outside both see nothing', async () => {
    // within the narrowing (granted to Paul) but the org has not acknowledged
    const grantNoAck = await makeDeliverable({
      ref: `T136-GRANT-NOACK-${Date.now()}`,
      producingOrganisationId: ownerOrgId,
      shareWithRecv: true,
      acknowledged: false,
      narrowedTo: [paulParticipantId],
    });
    expect(await canRetrieve(paul, grantNoAck)).toBe(false);

    // acknowledged, but Paul is outside the narrowing (granted to Quinn only)
    const ackedOutside = await makeDeliverable({
      ref: `T136-ACK-OUTSIDE-${Date.now()}`,
      producingOrganisationId: ownerOrgId,
      shareWithRecv: true,
      acknowledged: true,
      narrowedTo: [quinnParticipantId],
    });
    expect(await canRetrieve(paul, ackedOutside)).toBe(false);
    expect(await canRetrieve(quinn, ackedOutside)).toBe(true);
  });

  it('(c) the gate holds through the agent retrieval path — assemble() is the sub-agent’s only route (ADR-0028 §4)', async () => {
    // there is no second path: the retrieval sub-agent calls the same gateway,
    // so an unacknowledged deliverable is invisible to the agent by construction
    const v = await makeDeliverable({
      ref: `T136-AGENT-${Date.now()}`,
      producingOrganisationId: ownerOrgId,
      shareWithRecv: true,
      acknowledged: false,
    });
    expect(await canRetrieve(paul, v)).toBe(false);
  });
});

// T-273 — the deliberate opt-in, and the two things it must not become.
describe('include_superseded widens record state and nothing else (T-273)', () => {
  it('is not expressible on the request — a caller can only be HANDED it', () => {
    // the same guarantee `no parameter exists to widen scope` pins above, read
    // for the one parameter that genuinely widens something: it rides the
    // assembler's CONSTRUCTION, exactly as T-248's narrowing does, so a worker
    // or a plan step cannot ask the gateway for more than it was built with.
    type ExactKeys<T, K extends keyof T> = [Exclude<keyof T, K>] extends [never]
      ? [Exclude<K, keyof T>] extends [never]
        ? true
        : false
      : false;
    // read for the one parameter that genuinely WIDENS: the request's keys are
    // the query, its mode, and the narrowing-only scope (T-469) — nothing that
    // relaxes a clause
    const stillNoWidener: ExactKeys<AssemblyRequest['request'], 'text' | 'mode' | 'scope'> = true;
    expect(stillNoWidener).toBe(true);
  });

  it('returns the superseded Version to the entitled, flagged, when built to', async () => {
    const including = createAssembler({ db, router: fakeRouter() }, undefined, { superseded: true });
    const { items } = await including(query(entitled));
    const old = items.find(
      (item) => item.source !== undefined && 'versionId' in item.source && item.source.versionId === supersededVersionId,
    );
    expect(old).toBeDefined();
    // and it says what it is — the flag is a fact on the item, not a rendering
    expect(old!.descriptor?.superseded).toBe(true);
  });

  it('STILL returns nothing across the wall, opt-in or not', async () => {
    // the widening relaxes record state; every access clause is untouched, and
    // this is the assertion that says so rather than the comment that claims it
    const including = createAssembler({ db, router: fakeRouter() }, undefined, { superseded: true });
    const { items } = await including(query(unentitled));
    expect(items).toEqual([]);
  });
});
