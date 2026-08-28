// T-255 — a frozen corpus fixture, declared as DATA (evals/README.md) and
// materialised by a loader. The substrate for this already existed as test
// setup code (packages/knowledge/src/retrieval-scope.test.ts, wall.test.ts);
// what is new is that a fixture is now a file a domain expert can read, and
// that materialising it is a function rather than a beforeAll block.
//
// A fixture declares the ACCESS GRAPH first — organisations, users,
// memberships, participants, shares, acknowledgements — because a permission
// case is meaningless without one, and the wall's real conditions (ADR-0016,
// ADR-0035 §3/§4) have to be reproducible rather than approximated.
//
// ISOLATION, and what it does not mean here. Every load materialises its own
// organisations, users and project under a unique namespace, so no case can
// see another case's data and nothing the harness writes touches the dev seed.
// It is NOT a separate Postgres schema: every migration in packages/db pins
// "public" in its foreign-key references and its grants (0032, 0034), so a
// second schema would need the migration history rewritten. The isolation that
// matters is enforced anyway — retrieval is project-scoped in SQL and, since
// T-247, under row-level security beneath that.
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { expandBackground } from './background';
import { z } from 'zod';
import { hashPassword, schema as s, withProjectScope } from '@infora/db';
import type { Db } from '@infora/db';

// The dev password every fixture user is created with. The harness logs in
// over HTTP like any client, so the users need credentials; there is nothing
// to protect here — a fixture user exists only in a developer's database.
export const FIXTURE_PASSWORD = 'eval-harness-dev';

const key = z.string().regex(/^[a-z0-9_]+$/, 'fixture keys are lower_snake_case');

const versionSchema = z
  .object({
    key,
    reference: z.string(), // the version reference, e.g. 'v2'
    content: z.string(),
    current: z.boolean().default(true),
    // one chunk per version unless the fixture splits it deliberately; a gold
    // passage addresses one of these by index, `version_key#0` (T-256)
    chunks: z.array(z.string()).optional(),
    // ADR-0035 §4: a shared deliverable neither grounds nor is visible until
    // the receiving organisation has acknowledged its CURRENT version
    acknowledged_by: z
      .array(z.object({ organisation: key, participant: key }))
      .default([]),
  })
  .strict();

const containerSchema = z
  .object({
    key,
    project: key,
    producer: key, // the producing organisation (ADR-0033)
    reference: z.string(), // the deliverable code, e.g. HOL-ENV-WQR-001
    in_library: z.boolean().default(true),
    state: z.enum(['live', 'superseded', 'withdrawn']).default('live'),
    // T-387 — the acceptance code that ADMITTED this deliverable to the library.
    // Library membership is necessary and no longer sufficient for grounding
    // (the ADR-0011 rider): a deliverable admitted under a code the project has
    // not marked as grounding is in the library, readable, citable by hand — and
    // out of the AI's reach. Absent means no accepting round at all, which is
    // owner-added reference material (T-304) and grounds on the owner's own
    // curation, so every fixture written before this stays exactly as it was.
    admitted_by: key.optional(),
    shares: z
      .array(
        z.object({
          organisation: key,
          granted_by: key,
          // T-259 — ADR-0035 §3 intra-organisation narrowing. Absent means the
          // whole-organisation default: every entitled Participant of the
          // receiving organisation sees it. Present means only these ones do —
          // narrowing UNDER the organisation ceiling, never widening it.
          narrowed_to: z.array(key).optional(),
        }),
      )
      .default([]),
    versions: z.array(versionSchema).min(1),
  })
  .strict();

export const fixtureSchema = z
  .object({
    id: z.string(),
    // Fixtures are versioned and IMMUTABLE (§3): changing one creates a new
    // fixture, because cases pinned to the old one must keep meaning.
    version: z.number().int().positive(),
    description: z.string(),
    // the pinned embedding model this fixture's index is written under
    // (ADR-0024 — each model is its own index over the same corpus)
    embedding_model: z.string(),
    organisations: z.array(z.object({ key, name: z.string() })).min(1),
    users: z
      .array(z.object({ key, name: z.string(), organisation: key, org_role: z.enum(['admin', 'member']).default('member') }))
      .min(1),
    projects: z
      .array(
        z.object({
          key,
          name: z.string(),
          owner: key,
          memberships: z.array(z.object({ organisation: key, role: z.enum(['owner', 'member']) })),
        }),
      )
      .min(1),
    participants: z.array(z.object({ key, user: key, project: key })).default([]),
    // T-387 — the project's acceptance-code scheme (ADR-0003 as amended), copied
    // into every project the fixture declares, as a real project's is at
    // creation. `grounds` is per-code and per-project because the 2021 National
    // Annex leaves each Published code's meaning to the project's own
    // information standard — so a fixture that wants to say "accepted, but not
    // to be relied on by the agent" has to say it here.
    acceptance_codes: z
      .array(
        z.object({
          key,
          code: z.string(),
          description: z.string(),
          is_accepting: z.boolean().default(true),
          is_contractual: z.boolean().default(false),
          grounds: z.boolean().default(false),
        }),
      )
      .default([]),
    // the project a case's question is asked in; required once a fixture
    // carries more than one project
    subject_project: key.optional(),
    containers: z.array(containerSchema).default([]),
    // T-312 — the corpus a case has to find its answer IN. Written documents
    // carry meaning and are hand-authored above; these have no job but to be
    // in the way, so the fixture declares a recipe and `expandBackground`
    // produces them. Deterministic from `seed`, therefore still frozen (§3).
    background: z
      .object({
        count: z.number().int().positive().max(2000),
        seed: z.number().int().nonnegative(),
        producer: key,
        prefix: z.string().min(1),
        // who can reach them — background nobody can see competes with nothing
        shares: z.array(z.object({ organisation: key, granted_by: key })).default([]),
        acknowledged_by: z.array(z.object({ organisation: key, participant: key })).default([]),
      })
      .optional(),
  })
  .strict();

export type Fixture = z.infer<typeof fixtureSchema>;

/** A materialised fixture: the declared keys mapped to the rows that now exist. */
export type FixtureInstance = {
  fixture: Fixture;
  /** what makes this load's rows distinguishable from the last load's */
  namespace: string;
  subjectProjectId: string;
  organisationIds: Map<string, string>;
  users: Map<string, { id: string; email: string }>;
  projectIds: Map<string, string>;
  participantIds: Map<string, string>;
  containerIds: Map<string, string>;
  versionIds: Map<string, string>;
  /** `version_key#chunk_index` → the chunk row, for gold passages (T-256) */
  chunkIds: Map<string, string>;
};

export async function loadFixtureFile(path: string): Promise<Fixture> {
  const parsed = fixtureSchema.safeParse(parse(await readFile(path, 'utf8')));
  if (!parsed.success) {
    throw new Error(`invalid fixture ${path}: ${parsed.error.message}`);
  }
  // T-312 — expand the background recipe BEFORE validation, so a generated
  // container is held to exactly the same referential integrity as a written
  // one. A generator that could produce a fixture the loader would reject is a
  // generator nobody would trust.
  return validate(withBackground(parsed.data), path);
}

function withBackground(fixture: Fixture): Fixture {
  if (fixture.background === undefined) return fixture;
  const { shares, acknowledged_by, ...recipe } = fixture.background;
  const generated = expandBackground(recipe, {
    project: fixture.subject_project ?? fixture.projects[0]!.key,
    shares,
    acknowledged_by,
  });
  return { ...fixture, containers: [...fixture.containers, ...generated] };
}

// Referential integrity of the declaration itself, checked at load: a fixture
// naming an organisation that does not exist is an authoring mistake, and it
// should read as one rather than as a foreign-key error three functions later.
function validate(fixture: Fixture, path: string): Fixture {
  const fail = (message: string): never => {
    throw new Error(`invalid fixture ${path}: ${message}`);
  };
  const known = (keys: Iterable<string>) => new Set(keys);
  const orgs = known(fixture.organisations.map((o) => o.key));
  const users = known(fixture.users.map((u) => u.key));
  const projects = known(fixture.projects.map((p) => p.key));
  const participants = known(fixture.participants.map((p) => p.key));

  for (const user of fixture.users) {
    if (!orgs.has(user.organisation)) fail(`user ${user.key} names unknown organisation ${user.organisation}`);
  }
  for (const project of fixture.projects) {
    if (!orgs.has(project.owner)) fail(`project ${project.key} names unknown organisation ${project.owner}`);
    if (project.memberships.filter((m) => m.role === 'owner').length !== 1) {
      fail(`project ${project.key} must declare exactly one owner membership`);
    }
    for (const membership of project.memberships) {
      if (!orgs.has(membership.organisation)) fail(`project ${project.key} shares with unknown organisation ${membership.organisation}`);
    }
  }
  for (const participant of fixture.participants) {
    if (!users.has(participant.user)) fail(`participant ${participant.key} names unknown user ${participant.user}`);
    if (!projects.has(participant.project)) fail(`participant ${participant.key} names unknown project ${participant.project}`);
  }
  const codes = known(fixture.acceptance_codes.map((c) => c.key));
  for (const container of fixture.containers) {
    if (!projects.has(container.project)) fail(`container ${container.key} names unknown project ${container.project}`);
    if (!orgs.has(container.producer)) fail(`container ${container.key} names unknown producer ${container.producer}`);
    if (container.admitted_by !== undefined && !codes.has(container.admitted_by)) {
      fail(`container ${container.key} is admitted by unknown acceptance code ${container.admitted_by}`);
    }
    for (const share of container.shares) {
      if (!orgs.has(share.organisation)) fail(`container ${container.key} shares with unknown organisation ${share.organisation}`);
      if (!participants.has(share.granted_by)) fail(`container ${container.key} names unknown granting participant ${share.granted_by}`);
      for (const narrowed of share.narrowed_to ?? []) {
        if (!participants.has(narrowed)) fail(`container ${container.key} narrows to unknown participant ${narrowed}`);
      }
    }
    if (container.versions.filter((v) => v.current).length !== 1) {
      fail(`container ${container.key} must declare exactly one current version`);
    }
    for (const version of container.versions) {
      for (const ack of version.acknowledged_by) {
        if (!orgs.has(ack.organisation)) fail(`version ${version.key} acknowledged by unknown organisation ${ack.organisation}`);
        if (!participants.has(ack.participant)) fail(`version ${version.key} acknowledged by unknown participant ${ack.participant}`);
      }
    }
  }
  if (fixture.subject_project === undefined && fixture.projects.length > 1) {
    fail('a fixture with more than one project must declare subject_project');
  }
  if (fixture.subject_project !== undefined && !projects.has(fixture.subject_project)) {
    fail(`subject_project names unknown project ${fixture.subject_project}`);
  }
  return fixture;
}

/**
 * Materialise a fixture into the database under a fresh namespace, and return
 * the map from declared keys to the rows that now exist.
 *
 * `embed` is the harness's embedding function — the fixture's index is written
 * under the SAME pinned model the harness's router queries with, which is what
 * keeps retrieval reproducible without a provider call (ADR-0024, T-031).
 */
export async function materialise(
  db: Db,
  fixture: Fixture,
  embed: (text: string) => { vector: number[]; modelId: string; modelVersion: string },
): Promise<FixtureInstance> {
  const namespace = `${fixture.id}-v${fixture.version}-${randomBytes(4).toString('hex')}`;
  const instance: FixtureInstance = {
    fixture,
    namespace,
    subjectProjectId: '',
    organisationIds: new Map(),
    users: new Map(),
    projectIds: new Map(),
    participantIds: new Map(),
    containerIds: new Map(),
    versionIds: new Map(),
    chunkIds: new Map(),
  };

  for (const org of fixture.organisations) {
    const [row] = await db
      .insert(s.organisations)
      .values({ name: `${org.name} [${namespace}]` })
      .returning();
    instance.organisationIds.set(org.key, row!.id);
  }

  const passwordHash = hashPassword(FIXTURE_PASSWORD);
  for (const user of fixture.users) {
    // namespaced, and on the reserved .invalid TLD (RFC 2606) so a fixture
    // address can never be mistaken for one that could receive mail
    const email = `${user.key}.${namespace}@evals.invalid`;
    const [row] = await db
      .insert(s.users)
      .values({
        name: user.name,
        email,
        organisationId: instance.organisationIds.get(user.organisation)!,
        orgRole: user.org_role,
      })
      .returning();
    await db.insert(s.userCredentials).values({ userId: row!.id, passwordHash });
    instance.users.set(user.key, { id: row!.id, email });
  }

  for (const project of fixture.projects) {
    const [row] = await db
      .insert(s.projects)
      .values({
        name: `${project.name} [${namespace}]`,
        ownerOrganisationId: instance.organisationIds.get(project.owner)!,
      })
      .returning();
    instance.projectIds.set(project.key, row!.id);
    await db.insert(s.memberships).values(
      project.memberships.map((membership) => ({
        organisationId: instance.organisationIds.get(membership.organisation)!,
        projectId: row!.id,
        role: membership.role,
      })),
    );
  }
  instance.subjectProjectId = instance.projectIds.get(
    fixture.subject_project ?? fixture.projects[0]!.key,
  )!;

  for (const participant of fixture.participants) {
    const [row] = await db
      .insert(s.participants)
      .values({
        userId: instance.users.get(participant.user)!.id,
        projectId: instance.projectIds.get(participant.project)!,
      })
      .returning();
    instance.participantIds.set(participant.key, row!.id);
  }

  // T-387 — the acceptance-code scheme, copied into every project, as a real
  // project's is at creation (ADR-0003: a copy, never a shared reference, so one
  // project's edits cannot rewrite another's history). Keyed per project because
  // that copy is the whole point.
  const codeIds = new Map<string, string>();
  for (const [projectKey, projectId] of instance.projectIds) {
    for (const code of fixture.acceptance_codes) {
      const [row] = await db
        .insert(s.acceptanceCodes)
        .values({
          projectId,
          code: code.code,
          description: code.description,
          isAccepting: code.is_accepting,
          isContractual: code.is_contractual,
          grounds: code.grounds,
        })
        .returning();
      codeIds.set(`${projectKey}|${code.key}`, row!.id);
    }
  }

  for (const container of fixture.containers) {
    const [row] = await db
      .insert(s.containers)
      .values({
        projectId: instance.projectIds.get(container.project)!,
        producingOrganisationId: instance.organisationIds.get(container.producer)!,
        documentReference: container.reference,
        inLibrary: container.in_library,
        state: container.state,
      })
      .returning();
    instance.containerIds.set(container.key, row!.id);

    for (const share of container.shares) {
      await db.insert(s.deliverableShares).values({
        containerId: row!.id,
        organisationId: instance.organisationIds.get(share.organisation)!,
        grantedByParticipantId: instance.participantIds.get(share.granted_by)!,
      });
      // ADR-0035 §3 — the narrowing sits INSIDE the share it narrows, so a
      // fixture cannot express a participant grant without the organisation
      // ceiling that bounds it. That is the invariant, not a convenience.
      for (const narrowed of share.narrowed_to ?? []) {
        await db.insert(s.deliverableParticipantGrants).values({
          containerId: row!.id,
          organisationId: instance.organisationIds.get(share.organisation)!,
          participantId: instance.participantIds.get(narrowed)!,
          grantedByParticipantId: instance.participantIds.get(share.granted_by)!,
        });
      }
    }

    for (const version of container.versions) {
      const [versionRow] = await db
        .insert(s.versions)
        .values({
          containerId: row!.id,
          versionReference: version.reference,
          content: version.content,
          isCurrent: version.current,
        })
        .returning();
      instance.versionIds.set(version.key, versionRow!.id);

      const chunks = version.chunks ?? [version.content];
      // Inside the project scope, and not for the insert's sake: version_chunks
      // is under row-level security (0034) and the policy is on SELECT, so the
      // RETURNING clause — a read — comes back empty without it, and the gold
      // passages would silently have no ids to resolve against.
      const chunkRows = await withProjectScope(
        db,
        instance.projectIds.get(container.project)!,
        (tx) =>
          tx
            .insert(s.versionChunks)
            .values(
              chunks.map((content, chunkIndex) => {
                const embedded = embed(content);
                return {
                  versionId: versionRow!.id,
                  chunkIndex,
                  content,
                  embedding: embedded.vector,
                  embeddingModelId: embedded.modelId,
                  embeddingModelVersion: embedded.modelVersion,
                };
              }),
            )
            .returning({ id: s.versionChunks.id, chunkIndex: s.versionChunks.chunkIndex }),
      );
      if (chunkRows.length !== chunks.length) {
        throw new Error(
          `fixture ${fixture.id}: version ${version.key} wrote ${chunks.length} chunks and read back ${chunkRows.length} — a gold passage would resolve to nothing`,
        );
      }
      for (const row of chunkRows) {
        instance.chunkIds.set(`${version.key}#${row.chunkIndex}`, row.id);
      }

      for (const ack of version.acknowledged_by) {
        await db.insert(s.deliverableAcknowledgements).values({
          containerId: row!.id,
          versionId: versionRow!.id,
          organisationId: instance.organisationIds.get(ack.organisation)!,
          acknowledgedByParticipantId: instance.participantIds.get(ack.participant)!,
        });
      }
    }

    // T-387 — the admission act itself: a closed cycle whose round carries the
    // accepting code. Retrieval reads this join, so a fixture that only set
    // `in_library` would be declaring a state the product cannot reach.
    if (container.admitted_by !== undefined) {
      const currentVersion = container.versions.find((v) => v.current)!;
      const [cycle] = await db
        .insert(s.reviewCycles)
        .values({ containerId: row!.id, state: 'accepted' })
        .returning();
      await db.insert(s.rounds).values({
        cycleId: cycle!.id,
        number: 1,
        versionId: instance.versionIds.get(currentVersion.key)!,
        state: 'issued',
        deliverableCodeId: codeIds.get(`${container.project}|${container.admitted_by}`)!,
      });
    }
  }

  return instance;
}
