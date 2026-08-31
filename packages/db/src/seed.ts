// T-011: the walking-skeleton seed. Two organisations two ways scoped, the
// wall-test subjects (a no-Participant user and a third organisation with no
// Membership), one Work item, and a small live library to draft from — plus
// one superseded version and one withdrawn container to prove exclusion.
// Dev-only: wipes and reseeds (TRUNCATE bypasses row triggers by design).
import { and, eq, sql } from 'drizzle-orm';
import { createDb } from './client.js';
import { loadDbEnv } from './env.js';
import { hashPassword } from './credentials.js';
import { seedProjectOntology } from './ontology-seed.js';
import { seedProjectAcceptanceCodes } from './acceptance-code-seed.js';
import * as s from './schema/index.js';

// T-247 — the seed runs as the OWNER, like migrations. It TRUNCATEs, and the
// application role deliberately holds no TRUNCATE privilege: a running app has
// no business being able to wipe a table.
const { db, pool } = createDb(loadDbEnv().MIGRATE_DATABASE_URL);

await db.execute(sql`
  TRUNCATE TABLE citations, signals, suggestions, steps, runs, conversations,
    responses, review_comments, review_snapshots, transmittals, rounds, review_cycles,
    deliverable_authors, deliverable_reviewers, deliverable_shares, acceptance_codes,
    document_relationships, container_classifications, classification_terms, classification_facets,
    sandbox_document_versions, sandbox_documents, sandbox_scope_grants, sandboxes, renditions,
    versions, containers, work_items,
    project_style_guide_clauses, project_style_guides, rulebook_clauses, rulebooks,
    participants, memberships, projects, user_credentials, users, organisations CASCADE
`);

// ── Drawer 1: parties & access ──────────────────────────────────────────────
const [trentmoor] = await db.insert(s.organisations).values({ name: 'Trentmoor Energy' }).returning();
const [calderHale] = await db.insert(s.organisations).values({ name: 'Calder & Hale' }).returning();
// wall-test subject: an organisation with no Membership on the project
const [halvern] = await db.insert(s.organisations).values({ name: 'Halvern Associates' }).returning();

// each organisation names an org admin (ADR-0033, T-113) — the intra-org
// enrolment power T-117 exercises; never a project-level fact
const [rachel] = await db
  .insert(s.users)
  .values({ name: 'Rachel Bowen', email: 'rachel.bowen@trentmoor.example', organisationId: trentmoor!.id, orgRole: 'admin' })
  .returning();
const [eleanor] = await db
  .insert(s.users)
  .values({ name: 'Eleanor Price', email: 'eleanor.price@calderhale.example', organisationId: calderHale!.id, orgRole: 'admin' })
  .returning();
// wall-test subject: member-org user with NO Participant on the project
const [marcus] = await db
  .insert(s.users)
  .values({ name: 'Marcus Webb', email: 'marcus.webb@calderhale.example', organisationId: calderHale!.id })
  .returning();
// wall-test subject: an authenticated user in the membership-less third org (T-022);
// their org's admin, proving org_role grants nothing across the wall
const [priya] = await db
  .insert(s.users)
  .values({ name: 'Priya Nair', email: 'priya.nair@halvern.example', organisationId: halvern!.id, orgRole: 'admin' })
  .returning();

// skeleton session login (T-021) — dev password, printed below; the wall
// subjects can log in too, so T-022 exercises authenticated but unentitled users
const DEV_PASSWORD = 'wrenfield-dev';
await db.insert(s.userCredentials).values(
  [rachel!, eleanor!, marcus!, priya!].map((u) => ({
    userId: u.id,
    passwordHash: hashPassword(DEV_PASSWORD),
  })),
);

const [project] = await db
  .insert(s.projects)
  .values({ name: 'Wrenfield–Ashcombe 400kV Connection', ownerOrganisationId: trentmoor!.id })
  .returning();

await db.insert(s.memberships).values([
  { organisationId: trentmoor!.id, projectId: project!.id, role: 'owner' },
  { organisationId: calderHale!.id, projectId: project!.id, role: 'member' },
]);

// the owner's participant and the consultant lead author both hold the elevated
// (super-user) capability (T-174): the owner by default, the lead author because
// she may decline-and-close a rejected deliverable (ADR-0032)
const [ownerParticipant] = await db
  .insert(s.participants)
  .values({ userId: rachel!.id, projectId: project!.id, elevated: true })
  .returning();
const [consultant] = await db
  .insert(s.participants)
  .values({ userId: eleanor!.id, projectId: project!.id, elevated: true })
  .returning();

// ── Drawer 5: the project's acceptance-code scheme (T-115, ADR-0003) ────────
// Infora's default scheme, COPIED to the project at creation — a copy, not a
// reference, so this project's edits never rewrite another's history. From
// T-383 the default is ISO 19650's 2021 National Annex set, and each code
// carries its own `is_contractual` and `grounds` answers.
await seedProjectAcceptanceCodes(db, project!.id);

// ── Drawer 6: the project's classification vocabulary (T-240, ADR-0045) ──────
// Infora's default Uniclass 2015 / ISO 19650 scheme, COPIED to the project at
// creation — the same copy-not-reference discipline as the acceptance codes.
await seedProjectOntology(db, project!.id);

// ── Drawer 7: the two style sources (T-397, T-336) ──────────────────────────
//
// T-397 built both stores and NOTHING SEEDED EITHER, so the QA checker's style
// family had nothing to bind, the walkthrough could not photograph a quoted
// rule, and a developer running the app locally saw a feature that looked
// broken. Found by building T-336 against the seeded world.
//
// 🔒 **THE TWO ARE SEEDED DIFFERENTLY BECAUSE THEY ARE SCOPED DIFFERENTLY**
// (ADR-0053 §9), and the seed is where that becomes visible: the PROJECT style
// guide belongs to Wrenfield and binds every organisation on it, so a finding
// quoting it crosses the wall; the RULEBOOK belongs to Calder & Hale and
// travels with them, so a finding quoting it is private to that firm. Both are
// quoted verbatim and neither is ever cited.
const [projectStyleGuide] = await db
  .insert(s.projectStyleGuides)
  .values({
    projectId: project!.id,
    title: 'Wrenfield–Ashcombe Project Style Guide',
    sourceFormat: 'docx',
    loadedByUserId: rachel!.id, // the owner's super user curates project context
  })
  .returning();
await db.insert(s.projectStyleGuideClauses).values(
  [
    {
      clause: '§2.1',
      heading: 'Naming the works',
      content:
        'Refer to the works as “the scheme”, in lower case, throughout. Do not capitalise it as a proper noun.',
    },
    {
      clause: '§2.4',
      heading: 'Figures',
      content:
        'State every quantitative result with its unit and its source. A figure without a unit is not a result.',
    },
    {
      clause: '§3.2',
      heading: 'Commitments',
      content:
        'Write a commitment as a single sentence naming who does what, and by when. Do not spread one commitment over a paragraph.',
    },
  ].map((clause, at) => ({
    styleGuideId: projectStyleGuide!.id,
    ordinal: at + 1,
    clause: clause.clause,
    heading: clause.heading,
    content: clause.content,
    spanStart: at * 200,
    spanEnd: at * 200 + clause.content.length,
  })),
);

const [calderHaleRulebook] = await db
  .insert(s.rulebooks)
  .values({
    organisationId: calderHale!.id,
    title: 'Calder & Hale Drafting Manual',
    sourceFormat: 'docx',
    loadedByUserId: eleanor!.id,
  })
  .returning();
await db.insert(s.rulebookClauses).values(
  [
    {
      clause: '§4.2',
      heading: 'Voice',
      content:
        'Avoid the passive voice. Name the party who acts, so a reader can tell who is responsible for what.',
    },
    {
      clause: '§4.7',
      heading: 'Hedging',
      content:
        'Do not hedge a conclusion the evidence supports. State it, and state the evidence beside it.',
    },
  ].map((clause, at) => ({
    rulebookId: calderHaleRulebook!.id,
    ordinal: at + 1,
    clause: clause.clause,
    heading: clause.heading,
    content: clause.content,
    spanStart: at * 200,
    spanEnd: at * 200 + clause.content.length,
  })),
);

// ── Drawer 3: the governed-work anchor for M3–M5 ────────────────────────────
// The work item's record half (ADR-0032 addendum): a planned, not-yet-produced
// container on the consultant's plan (ADR-0033 — the producing organisation
// creates its own plan rows), with both sides granted (T-115, ADR-0017).
const [plannedContainer] = await db
  .insert(s.containers)
  .values({
    projectId: project!.id,
    producingOrganisationId: calderHale!.id,
    documentReference: 'WA-EIA-MST-001',
    inLibrary: false,
    state: 'live',
  })
  .returning();
await db.insert(s.deliverableAuthors).values({
  containerId: plannedContainer!.id,
  participantId: consultant!.id,
  isLead: true,
  grantedByParticipantId: consultant!.id,
});
// propose-then-confirm as the model actually runs it (ADR-0033): the PRODUCING
// organisation proposes the lead reviewer at planning ("where known"), and the
// owner confirms — which is where ADR-0015's share-first invariant bites and
// where access begins. Seeding it granted-by-the-owner made the appointment
// read as the owner proposing themselves, which is a shape the plan screen
// cannot produce.
// Deliberately NOT accepted (T-372): acceptance is the appointee's own act, and
// a seed that pre-accepted it would fabricate an undertaking nobody gave —
// exactly what the ADR forbids. Rachel accepts on screen, which is the point.
await db.insert(s.deliverableReviewers).values({
  containerId: plannedContainer!.id,
  participantId: ownerParticipant!.id,
  isLead: true,
  grantedByParticipantId: consultant!.id,
  confirmedByParticipantId: ownerParticipant!.id,
  confirmedAt: sql`now()`,
});

await db.insert(s.workItems).values({
  projectId: project!.id,
  type: 'document_production',
  title: 'EIA Scoping Method Statement — Land Quality',
  status: 'in_production',
  containerId: plannedContainer!.id,
  assigneeParticipantId: consultant!.id,
});

// ── Drawer 2: the project library ───────────────────────────────────────────
type LibraryDoc = {
  reference: string;
  state?: 'live' | 'withdrawn';
  // T-405 — what the document IS, as the person who filed it would say it.
  // Seeded so the source picker can be read (and photographed) with real
  // sentences in it rather than a column of codes. Typed, never generated.
  description: string;
  versions: Array<{ ref: string; current: boolean; content: string }>;
};

const library: LibraryDoc[] = [
  {
    reference: 'WA-GEO-GIR-004',
    description:
      'Interprets the ground investigation at Wrenfield Sidings: what the made ground is, what contamination was found in it, and what the perched water means for construction dewatering.',
    versions: [
      {
        ref: 'v1',
        current: false, // the superseded version — must never ground (T-033)
        content:
          'Ground Investigation Interpretative Report (superseded). Preliminary trial pitting at ' +
          'Wrenfield Sidings identified made ground to 1.1 m. No contamination exceedances were ' +
          'recorded in the four pits completed at the time of issue. Groundwater was not encountered.',
      },
      {
        ref: 'v2',
        current: true,
        content:
          'Ground Investigation Interpretative Report. Intrusive investigation across the Wrenfield ' +
          'Sidings compound identified made ground to a depth of 2.4 m, comprising ash, clinker and ' +
          'demolition fill over glacial till. Elevated concentrations of polycyclic aromatic ' +
          'hydrocarbons (PAHs) were recorded in three of eleven trial pits (WS-TP03, WS-TP07, ' +
          'WS-TP09), with benzo(a)pyrene up to 18 mg/kg. A shallow perched water table was ' +
          'encountered at 1.6–2.1 m within the made ground. Monitoring over three visits confirmed ' +
          'seasonal persistence. The perched horizon provides a plausible migration pathway toward ' +
          'the Ashcombe Brook during construction dewatering. Asbestos screening returned no ' +
          'detectable fibres. Recommendations: construction-phase watching brief, targeted ' +
          'remediation of the three PAH hotspots, and a dewatering management plan.',
      },
    ],
  },
  {
    reference: 'WA-ENV-BAS-003',
    description:
      'The environmental baseline for the corridor — the existing conditions every assessment chapter measures its effects against.',
    versions: [
      {
        ref: 'v3',
        current: true,
        content:
          'Environmental Baseline Compendium. The study area comprises predominantly arable ' +
          'agricultural land crossed by the Ashcombe Brook, with two former industrial sites: ' +
          'Wrenfield Sidings (railway land, ceased 1968) and the Ashcombe depot (plant maintenance, ' +
          'ceased 1994). Historical landfill (Wrenfield East, closed 1979, inert and commercial ' +
          'waste) is recorded east of the order limits within 250 m of the proposed cable corridor ' +
          '(Figure 4). The Ashcombe Brook supports brown trout and is classified Moderate under the ' +
          'Water Framework Directive (Table 9). Two residential receptors lie within 150 m of the ' +
          'corridor at Ashcombe Lane. Baseline dust deposition and groundwater quality monitoring ' +
          'commenced March 2026 and continues quarterly.',
      },
    ],
  },
  {
    reference: 'WA-WAT-FRA-001',
    description:
      'The flood risk assessment for the corridor, including the Ashcombe Brook crossing and how surface water leaving the compounds is managed.',
    versions: [
      {
        ref: 'v1',
        current: true,
        content:
          'Flood Risk Assessment — Screening Note. The cable corridor crosses Flood Zone 2 for ' +
          '380 m either side of the Ashcombe Brook. Trenchless crossing is proposed beneath the ' +
          'watercourse, with launch and reception pits located outside Flood Zone 3. Surface water ' +
          'flow paths follow field drains toward the brook; construction compounds are sited on ' +
          'ground above the 1 in 100 year plus climate change level. A drainage strategy will manage ' +
          'runoff from the Wrenfield Sidings compound, where made ground limits infiltration.',
      },
    ],
  },
  {
    reference: 'WA-CON-SCC-002',
    description:
      'How the community was consulted, when, and what they said — the record the routeing refinement was justified against.',
    versions: [
      {
        ref: 'v1',
        current: true,
        content:
          'Statement of Community Consultation (working draft admitted as reference). Two rounds of ' +
          'statutory consultation were held (October 2025, March 2026) with parish councils at ' +
          'Wrenfield, Ashcombe and Netherfold. Principal themes raised: construction traffic on ' +
          'Ashcombe Lane, protection of the brook corridor, and reinstatement of field drainage. ' +
          'Responses informed the routeing refinement adopted in the Preferred Corridor Report.',
      },
    ],
  },
  {
    reference: 'WA-EIA-SCP-001',
    description:
      'Sets out what the Environmental Impact Assessment will and will not cover, and the register and structure every chapter is written to.',
    versions: [
      {
        ref: 'v1',
        current: true,
        content:
          'EIA Scoping Report. The Environmental Impact Assessment will address land quality, water ' +
          'environment, ecology, landscape and visual, noise, traffic and transport, and cultural ' +
          'heritage. For land quality, the assessment scope includes ground contamination associated ' +
          'with Wrenfield Sidings and the Ashcombe depot, and pollutant linkages to controlled ' +
          'waters. Scoping statements follow the project style: define the study area, summarise the ' +
          'baseline, identify receptors, state the assessment methodology, and set out mitigation ' +
          'principles. Chapters use formal register, cite project sources by document reference, and ' +
          'avoid cost or programme commitments.',
      },
    ],
  },
  {
    reference: 'WA-HER-DBA-002',
    description:
      'The original heritage desk-based assessment. Withdrawn: its methodology was superseded, and it must not be relied on.',
    state: 'withdrawn', // stays in the library, leaves the grounded corpus (ADR-0013)
    versions: [
      {
        ref: 'v1',
        current: true,
        content:
          'Heritage Desk-Based Assessment (withdrawn 02 Jul 2026 — superseded methodology). ' +
          'Identified two non-designated assets within the corridor. Not to be relied on.',
      },
    ],
  },
];

for (const doc of library) {
  const [container] = await db
    .insert(s.containers)
    .values({
      projectId: project!.id,
      // the seed library is owner-added reference material (ADR-0011), so the
      // owner organisation is its producing organisation (ADR-0033)
      producingOrganisationId: trentmoor!.id,
      documentReference: doc.reference,
      description: doc.description,
      inLibrary: true,
      state: doc.state ?? 'live',
    })
    .returning();
  let liveVersionId: string | undefined;
  for (const v of doc.versions) {
    const [version] = await db
      .insert(s.versions)
      .values({
        containerId: container!.id,
        versionReference: v.ref,
        content: v.content,
        isCurrent: v.current,
      })
      .returning();
    if (v.current) liveVersionId = version!.id;
  }
  // the owner shares the reference library with the consultant organisation
  // (ADR-0016 as data, T-119) — visibility is producer | owner | live share,
  // so without this row Calder & Hale would ground on nothing
  await db.insert(s.deliverableShares).values({
    containerId: container!.id,
    organisationId: calderHale!.id,
    grantedByParticipantId: ownerParticipant!.id,
  });
  // ADR-0035 §4: a shared deliverable now also needs the receiving org's
  // acknowledgement of the transmittal before it is visible or grounds. Eleanor
  // Price (Calder & Hale's org admin) accepts receipt on the org's behalf for
  // the live version, so the demo grounds exactly as before the gate landed.
  if (liveVersionId) {
    await db.insert(s.deliverableAcknowledgements).values({
      containerId: container!.id,
      versionId: liveVersionId,
      organisationId: calderHale!.id,
      acknowledgedByParticipantId: consultant!.id,
    });
  }
}

// ── T-300 — the THIRD organisation on Wrenfield: Org C ──────────────────────
// [v1.md] seeds three organisations on one project so the wall is *demonstrable
// in the customer's own tenant* — a screen the buyer can look at, rather than a
// property they take on trust. Session B's story exactly: Trentmoor is Org A
// (owner), Calder & Hale is Org B (consultant), and Redgate Ecology is Org C,
// brought in to probe cross-organisation sharing. **B↔C invisibility is the
// thing a consultancy will actually poke at**, so Org C is seeded with work of
// its own — a sandbox and a produced deliverable it has NOT shared — and the
// negative is demonstrable rather than merely an absence of rows.
//
// TWO OF THE THREE ARE OPERATOR-HELD OR FICTIONAL ([v1.md]). This is a
// demonstration, not a commercial proof: the wall between two genuinely
// independent firms stays unproven until [operating-envelope.md]'s revisit trigger 1 fires for
// real. Said here because this is where an operator reads it.
//
// Redgate is a NEW organisation rather than a promotion of Halvern Associates:
// Halvern's documented meaning is "an organisation with no Membership at all"
// (T-022's wall subject), and reusing it would delete a test subject to create
// one. ORDER: created after the Wrenfield participants above, so `participants[0]`
// stays Wrenfield for the dozen e2e specs that index it (T-298).
const [redgate] = await db.insert(s.organisations).values({ name: 'Redgate Ecology' }).returning();
const [nadia] = await db
  .insert(s.users)
  .values({
    name: 'Nadia Okonjo',
    email: 'nadia.okonjo@redgate.example',
    organisationId: redgate!.id,
    orgRole: 'admin',
  })
  .returning();
await db.insert(s.userCredentials).values({ userId: nadia!.id, passwordHash: hashPassword(DEV_PASSWORD) });
await db
  .insert(s.memberships)
  .values({ organisationId: redgate!.id, projectId: project!.id, role: 'member' });
// elevated for the same reason Eleanor is: Org C's lead author may decline-and-
// close her own organisation's deliverable (ADR-0032, T-174)
const [redgateParticipant] = await db
  .insert(s.participants)
  .values({ userId: nadia!.id, projectId: project!.id, elevated: true })
  .returning();

// Org C's own single-org sandbox, provisioned exactly as the API's lazy path
// would (ADR-0018/0019): the working area Org B must never see into. The name
// mirrors `sandboxDefaultName` (apps/api/src/sandbox.ts, T-394), which cannot
// be imported here — `packages/db` sits below the app — so the shape is
// repeated deliberately and pinned by a test there. A seeded row spelling the
// default differently would be a demonstration dataset quietly disagreeing
// with the code that produces it.
const [redgateSandbox] = await db
  .insert(s.sandboxes)
  .values({
    projectId: project!.id,
    name: `${redgate!.name} — working area`,
    scope: 'single_org',
    owningOrganisationId: redgate!.id,
    createdByParticipantId: redgateParticipant!.id,
  })
  .returning();
await db.insert(s.sandboxScopeGrants).values({
  sandboxId: redgateSandbox!.id,
  granteeType: 'organisation',
  organisationId: redgate!.id,
  grantedByParticipantId: redgateParticipant!.id,
});
await db.insert(s.sandboxDocuments).values({
  projectId: project!.id,
  organisationId: redgate!.id,
  title: 'Bat activity survey — working notes',
  sandboxId: redgateSandbox!.id,
  createdByParticipantId: redgateParticipant!.id,
  content:
    'Working notes, not for issue. Three transect visits completed; common and soprano pipistrelle ' +
    'recorded along the Ashcombe Brook corridor. Roost potential in the Wrenfield Sidings brick ' +
    'structure to be confirmed by emergence survey. Belongs to Redgate Ecology and must never be ' +
    'visible to Calder & Hale.',
});

// A deliverable Org C PRODUCED and did NOT share. Note the visibility rule it
// exercises (ADR-0016 as data): producer | project owner | live share — so
// Trentmoor sees it because it owns the library, and Calder & Hale does not,
// because there is no share row. Deliberately no deliverable_shares and no
// acknowledgement: the missing rows ARE the negative.
const [redgateContainer] = await db
  .insert(s.containers)
  .values({
    projectId: project!.id,
    producingOrganisationId: redgate!.id,
    documentReference: 'WA-ECO-PEA-001',
    description:
      'Redgate’s preliminary ecological appraisal of the corridor — habitats, protected species and the survey work still outstanding.',
    inLibrary: true,
    state: 'live',
  })
  .returning();
await db.insert(s.deliverableAuthors).values({
  containerId: redgateContainer!.id,
  participantId: redgateParticipant!.id,
  isLead: true,
  grantedByParticipantId: redgateParticipant!.id,
});
await db.insert(s.versions).values({
  containerId: redgateContainer!.id,
  versionReference: 'v1',
  content:
    'Preliminary Ecological Appraisal. Extended Phase 1 habitat survey of the order limits recorded ' +
    'species-poor semi-improved grassland, defunct hedgerow along Ashcombe Lane, and a small area of ' +
    'wet woodland adjoining the brook. Great crested newt eDNA returned negative at both ponds. ' +
    'Badger activity was recorded at two setts outside the working corridor. This report was ' +
    'produced by Redgate Ecology and has NOT been shared with Calder & Hale, so it must never ' +
    'appear in an answer they receive.',
  isCurrent: true,
});
await db.insert(s.workItems).values({
  projectId: project!.id,
  type: 'document_production',
  title: 'Preliminary Ecological Appraisal',
  status: 'accepted',
  containerId: redgateContainer!.id,
  assigneeParticipantId: redgateParticipant!.id,
});

// ── T-298 — the second client, so the conflict register (ADR-0046) is real ──
// An exclusion pairs TWO projects, so with one seeded project the register was
// visible and unusable. The scenario it exists for is a consultancy acting for
// two different clients, so the second project gets its own owner rather than
// being a second Trentmoor scheme — a same-owner pair would not exercise the
// different-clients axis that makes the control mean anything.
//
// ORDER MATTERS: every participant here is created AFTER the Wrenfield ones, and
// readMe now orders participants by created_at, so `participants[0]` stays
// Wrenfield for the dozen e2e specs that assume it.
const [marchwood] = await db
  .insert(s.organisations)
  .values({ name: 'Marchwood Aggregates' })
  .returning();
const [ledbrook] = await db
  .insert(s.projects)
  .values({ name: 'Marchwood Quarry Rail Link', ownerOrganisationId: marchwood!.id })
  .returning();

const [hannah] = await db
  .insert(s.users)
  .values({
    name: 'Hannah Sturt',
    email: 'hannah.sturt@marchwood.example',
    organisationId: marchwood!.id,
    orgRole: 'admin',
  })
  .returning();
// T-298 — the individual-grain subject that must stay ALLOWED: a Calder & Hale
// colleague on Wrenfield only. A wall naming Eleanor must not touch him, which
// is the whole point of individual grain (ADR-0046 §7). Marcus cannot play this
// part — his documented meaning is "no Participant at all" (T-022 wall subject).
const [owen] = await db
  .insert(s.users)
  .values({ name: 'Owen Vance', email: 'owen.vance@calderhale.example', organisationId: calderHale!.id })
  .returning();
await db.insert(s.userCredentials).values(
  [hannah!, owen!].map((u) => ({ userId: u.id, passwordHash: hashPassword(DEV_PASSWORD) })),
);

// Calder & Hale acts for BOTH clients — the ADR-0046 scenario, as data
await db.insert(s.memberships).values([
  { organisationId: marchwood!.id, projectId: ledbrook!.id, role: 'owner' },
  { organisationId: calderHale!.id, projectId: ledbrook!.id, role: 'member' },
]);
await db.insert(s.participants).values({ userId: hannah!.id, projectId: ledbrook!.id, elevated: true });
// Eleanor works both schemes, so declaring a wall over the pair immediately
// reports her — the retrospective case (§4) is live in the seed rather than
// something you have to construct by hand
await db.insert(s.participants).values({ userId: eleanor!.id, projectId: ledbrook!.id });
await db.insert(s.participants).values({ userId: owen!.id, projectId: project!.id });

await seedProjectAcceptanceCodes(db, ledbrook!.id);
await seedProjectOntology(db, ledbrook!.id);

// A little library on the second project, so cross-project retrieval isolation
// (T-247's RLS, and the ADR-0022 pre-filter above it) is observable by hand
// after `pnpm --filter @infora/data run ingest` — one project's chunks must
// never surface in the other's answers.
const [marchwoodContainer] = await db
  .insert(s.containers)
  .values({
    projectId: ledbrook!.id,
    producingOrganisationId: marchwood!.id,
    documentReference: 'MQ-GEO-GIR-001',
    description:
      'The ground investigation report for the Ledbrook quarry extension — a different project entirely, and the wall test’s subject.',
    inLibrary: true,
    state: 'live',
  })
  .returning();
const [marchwoodVersion] = await db
  .insert(s.versions)
  .values({
    containerId: marchwoodContainer!.id,
    versionReference: 'v1',
    content:
      'Ground Investigation Interpretative Report, Marchwood Quarry Rail Link. Made ground was ' +
      'recorded to 0.8 m across the proposed rail head, over firm grey CLAY. No contamination ' +
      'exceedances were identified. This report belongs to the Marchwood scheme and must never ' +
      'appear in an answer about Wrenfield–Ashcombe.',
    isCurrent: true,
  })
  .returning();
await db.insert(s.deliverableShares).values({
  containerId: marchwoodContainer!.id,
  organisationId: calderHale!.id,
  grantedByParticipantId: (
    await db
      .select({ id: s.participants.id })
      .from(s.participants)
      .where(and(eq(s.participants.userId, hannah!.id), eq(s.participants.projectId, ledbrook!.id)))
      .limit(1)
  )[0]!.id,
});
await db.insert(s.deliverableAcknowledgements).values({
  containerId: marchwoodContainer!.id,
  versionId: marchwoodVersion!.id,
  organisationId: calderHale!.id,
  acknowledgedByParticipantId: (
    await db
      .select({ id: s.participants.id })
      .from(s.participants)
      .where(and(eq(s.participants.userId, eleanor!.id), eq(s.participants.projectId, ledbrook!.id)))
      .limit(1)
  )[0]!.id,
});

const counts = await db.execute(sql`
  SELECT (SELECT count(*) FROM organisations) AS orgs,
         (SELECT count(*) FROM users) AS users,
         (SELECT count(*) FROM participants) AS participants,
         (SELECT count(*) FROM work_items) AS work_items,
         (SELECT count(*) FROM containers) AS containers,
         (SELECT count(*) FROM versions) AS versions
`);
console.log('seeded:', counts.rows[0]);
console.log(`owner participant ${ownerParticipant!.id} (Rachel Bowen, Trentmoor Energy)`);
console.log(`consultant participant ${consultant!.id} (Eleanor Price, Calder & Hale)`);
console.log(
  `T-300 three organisations on Wrenfield — A: Trentmoor Energy (owner), B: Calder & Hale, ` +
    `C: Redgate Ecology (nadia.okonjo@redgate.example, participant ${redgateParticipant!.id}). ` +
    'B↔C is the demonstrable negative: Redgate produced WA-ECO-PEA-001 and shared it with nobody, ' +
    'and holds a sandbox of its own — so Eleanor Price sees neither, while Rachel Bowen sees the ' +
    'deliverable because Trentmoor owns the library. Two of the three are operator-held: this is a ' +
    'demonstration, not a commercial proof (v1.md).',
);
console.log(
  'T-298 conflict-register subjects: Eleanor Price works BOTH schemes (declaring a wall over the ' +
    'pair reports her); Owen Vance works Wrenfield only (an individual wall on Eleanor must leave ' +
    'him alone). Declare from Personal settings → Ethical walls as eleanor.price@calderhale.example.',
);
console.log(`dev login password for all seeded users: ${DEV_PASSWORD}`);
await pool.end();
