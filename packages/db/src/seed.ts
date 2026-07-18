// T-011: the walking-skeleton seed. Two organisations two ways scoped, the
// wall-test subjects (a no-Participant user and a third organisation with no
// Membership), one Work item, and a small live library to draft from — plus
// one superseded version and one withdrawn container to prove exclusion.
// Dev-only: wipes and reseeds (TRUNCATE bypasses row triggers by design).
import { sql } from 'drizzle-orm';
import { createDb } from './client.js';
import { hashPassword } from './credentials.js';
import * as s from './schema/index.js';

const { db, pool } = createDb();

await db.execute(sql`
  TRUNCATE TABLE citations, signals, suggestions, steps, runs, conversations,
    comments, drrs, sandbox_document_versions, sandbox_documents, renditions,
    versions, containers, work_items,
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

const [ownerParticipant] = await db
  .insert(s.participants)
  .values({ userId: rachel!.id, projectId: project!.id })
  .returning();
const [consultant] = await db
  .insert(s.participants)
  .values({ userId: eleanor!.id, projectId: project!.id })
  .returning();

// ── Drawer 3: the governed-work anchor for M3–M5 ────────────────────────────
await db.insert(s.workItems).values({
  projectId: project!.id,
  type: 'document_production',
  title: 'EIA Scoping Method Statement — Land Quality',
  status: 'in_production',
  assigneeParticipantId: consultant!.id,
});

// ── Drawer 2: the project library ───────────────────────────────────────────
type LibraryDoc = {
  reference: string;
  state?: 'live' | 'withdrawn';
  versions: Array<{ ref: string; current: boolean; content: string }>;
};

const library: LibraryDoc[] = [
  {
    reference: 'WA-GEO-GIR-004',
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
      inLibrary: true,
      state: doc.state ?? 'live',
    })
    .returning();
  for (const v of doc.versions) {
    await db.insert(s.versions).values({
      containerId: container!.id,
      versionReference: v.ref,
      content: v.content,
      isCurrent: v.current,
    });
  }
}

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
console.log(`dev login password for all seeded users: ${DEV_PASSWORD}`);
await pool.end();
