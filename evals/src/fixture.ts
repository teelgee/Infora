// T-255 — a frozen corpus fixture, declared as DATA (docs/build/ask/07 §3) and
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
import { z } from 'zod';
import { hashPassword, schema as s } from '@infora/db';
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
    // one chunk per version unless the fixture splits it deliberately; gold
    // passages (T-256) will address these by index
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
    shares: z
      .array(z.object({ organisation: key, granted_by: key }))
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
    // the project a case's question is asked in; required once a fixture
    // carries more than one project
    subject_project: key.optional(),
    containers: z.array(containerSchema).default([]),
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
};

export async function loadFixtureFile(path: string): Promise<Fixture> {
  const parsed = fixtureSchema.safeParse(parse(await readFile(path, 'utf8')));
  if (!parsed.success) {
    throw new Error(`invalid fixture ${path}: ${parsed.error.message}`);
  }
  return validate(parsed.data, path);
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
  for (const container of fixture.containers) {
    if (!projects.has(container.project)) fail(`container ${container.key} names unknown project ${container.project}`);
    if (!orgs.has(container.producer)) fail(`container ${container.key} names unknown producer ${container.producer}`);
    for (const share of container.shares) {
      if (!orgs.has(share.organisation)) fail(`container ${container.key} shares with unknown organisation ${share.organisation}`);
      if (!participants.has(share.granted_by)) fail(`container ${container.key} names unknown granting participant ${share.granted_by}`);
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
      await db.insert(s.versionChunks).values(
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
      );

      for (const ack of version.acknowledged_by) {
        await db.insert(s.deliverableAcknowledgements).values({
          containerId: row!.id,
          versionId: versionRow!.id,
          organisationId: instance.organisationIds.get(ack.organisation)!,
          acknowledgedByParticipantId: instance.participantIds.get(ack.participant)!,
        });
      }
    }
  }

  return instance;
}
