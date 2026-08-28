// T-241 — the project ontology API (ADR-0045, contracts §ontology). Two halves:
// the owner-owned classification vocabulary a deliverable classifies against,
// and the first-class typed edges between deliverables. Access is resolved here
// and never in the data layer (component 2 rule):
//   - reads apply the SAME deliverable-visibility SQL pre-filter as the library
//     and grounding (deliverableVisibleSql), so an edge into a container the
//     requester cannot see is never returned — the wall holds on the ontology.
//   - classification and relationship WRITES are a producing-organisation act:
//     they are AUTHORING metadata (ADR-0045 — agent-proposed, human-editable by
//     the authoring team; CONTEXT), distinct from the plan-IDENTITY metadata
//     PATCH which stays a super-user act. Any live participant of the producing
//     organisation may set them on that organisation's own deliverable.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { proposeRelationshipBody, setClassificationBody } from '@infora/contracts';
import type {
  ApiError,
  ClassificationSchemeResponse,
  ContainerClassificationRead,
  ContainerClassificationsResponse,
  ContainerRelationshipRead,
  ContainerRelationshipsResponse,
  DocumentRelationship,
} from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { EntitledSlice } from '@infora/governance';
import { deliverableVisibleSql as deliverableVisible } from '@infora/knowledge';
import { projectScope, resolveSlice } from './requester';
import type { AppEnv } from './requester';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const conflict = (c: Context, detail?: string) =>
  c.json({ error: 'conflict', ...(detail ? { detail } : {}) } satisfies ApiError, 409);
const invalid = (c: Context) => c.json({ error: 'invalid' } satisfies ApiError, 400);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

function isUniqueViolation(error: unknown): boolean {
  for (let e = error; e instanceof Error; e = e.cause as Error) {
    if ((e as { code?: string }).code === '23505') return true;
    if (e.message.includes('duplicate key value')) return true;
    if (!(e.cause instanceof Error)) break;
  }
  return false;
}

type ContainerRow = typeof s.containers.$inferSelect;
type RelationshipRow = typeof s.documentRelationships.$inferSelect;

const toRelationship = (r: RelationshipRow): DocumentRelationship => ({
  id: r.id,
  projectId: r.projectId,
  fromContainerId: r.fromContainerId,
  toContainerId: r.toContainerId,
  type: r.type,
  proposed: r.confirmedAt === null,
  confirmedByParticipantId: r.confirmedByParticipantId,
  createdAt: r.createdAt.toISOString(),
  confirmedAt: r.confirmedAt?.toISOString() ?? null,
  retiredAt: r.retiredAt?.toISOString() ?? null,
});

export function ontologyRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  // Load a container the requester may SEE (the deliverable-visibility pre-filter,
  // same as the library and grounding). Deny is the usual silent 404.
  async function loadVisible(
    c: Context,
    containerId: string,
  ): Promise<{ container: ContainerRow; slice: EntitledSlice } | null> {
    if (!isUuid(containerId)) return null;
    const [container] = await deps.db.select().from(s.containers).where(eq(s.containers.id, containerId)).limit(1);
    if (!container) return null;
    const slice = await resolveSlice(deps.db, c.get('user'), container.projectId);
    if (!slice) return null;
    // re-select under the visibility pre-filter — the wall, in SQL
    const [visible] = await deps.db
      .select({ id: s.containers.id })
      .from(s.containers)
      .where(and(eq(s.containers.id, container.id), deliverableVisible(slice)))
      .limit(1);
    if (!visible) return null;
    return { container, slice };
  }

  // The subset of the given container ids the requester may see — one scoped
  // query, so the wall stays in SQL (used to filter an edge's other endpoint).
  async function visibleAmong(slice: EntitledSlice, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await deps.db
      .select({ id: s.containers.id })
      .from(s.containers)
      .where(and(inArray(s.containers.id, ids), deliverableVisible(slice)));
    return new Set(rows.map((r) => r.id));
  }

  const producesIt = (container: ContainerRow, slice: EntitledSlice) =>
    container.producingOrganisationId === slice.organisationId && container.scope === 'library';

  // T-386 (ADR-0045 as amended 2026-08-27) — who may write an edge, in the two
  // halves the amendment separates.
  //
  // PROPOSAL is open to either party. It was a producing-organisation act
  // throughout, which left the owner — whose library the edge is about — unable
  // to say "this one replaces that one" about its own record.
  //
  // CONFIRMATION follows the publication boundary, exactly as record state does
  // (ADR-0013 §2). It keys on the edge's TARGET, because that is the container a
  // confirmation writes to: a confirmed `supersedes` edge INTO A LIBRARY
  // CONTAINER sets that container's record state, and a record in the owner's
  // library is the owner's. A target that is not yet published is unchanged —
  // the producing organisation's own record, its own edge to confirm.
  const mayProposeEdge = (from: ContainerRow, slice: EntitledSlice) =>
    from.scope === 'library' &&
    (from.producingOrganisationId === slice.organisationId || slice.membershipRole === 'owner');
  const mayConfirmEdge = (target: ContainerRow, from: ContainerRow, slice: EntitledSlice) =>
    target.inLibrary ? slice.membershipRole === 'owner' : producesIt(from, slice);

  // ── The classification vocabulary (project-wide, owner-owned) ──────────────
  app.get('/projects/:projectId/classification-scheme', project, async (c) => {
    const slice = c.get('slice');
    const facets = await deps.db
      .select()
      .from(s.classificationFacets)
      .where(eq(s.classificationFacets.projectId, slice.projectId))
      .orderBy(asc(s.classificationFacets.sortOrder));
    const facetIds = facets.map((f) => f.id);
    const terms = facetIds.length
      ? await deps.db
          .select()
          .from(s.classificationTerms)
          .where(inArray(s.classificationTerms.facetId, facetIds))
          .orderBy(asc(s.classificationTerms.sortOrder))
      : [];
    const body: ClassificationSchemeResponse = {
      facets: facets.map((f) => ({
        id: f.id,
        key: f.key,
        name: f.name,
        source: f.source,
        sortOrder: f.sortOrder,
        terms: terms
          .filter((t) => t.facetId === f.id)
          .map((t) => ({
            id: t.id,
            facetId: t.facetId,
            parentTermId: t.parentTermId,
            code: t.code,
            label: t.label,
            sortOrder: t.sortOrder,
            retiredAt: t.retiredAt?.toISOString() ?? null,
          })),
      })),
    };
    return c.json(body);
  });

  // ── A container's classifications (read) ───────────────────────────────────
  app.get('/containers/:containerId/classifications', async (c) => {
    const scoped = await loadVisible(c, c.req.param('containerId'));
    if (!scoped) return notFound(c);
    const rows = await deps.db
      .select({
        cc: s.containerClassifications,
        facetKey: s.classificationFacets.key,
        termCode: s.classificationTerms.code,
        termLabel: s.classificationTerms.label,
      })
      .from(s.containerClassifications)
      .innerJoin(s.classificationFacets, eq(s.containerClassifications.facetId, s.classificationFacets.id))
      .innerJoin(s.classificationTerms, eq(s.containerClassifications.termId, s.classificationTerms.id))
      .where(eq(s.containerClassifications.containerId, scoped.container.id))
      .orderBy(asc(s.classificationFacets.sortOrder));
    const items: ContainerClassificationRead[] = rows.map((r) => ({
      id: r.cc.id,
      containerId: r.cc.containerId,
      facetId: r.cc.facetId,
      termId: r.cc.termId,
      proposed: r.cc.setByParticipantId === null,
      setByParticipantId: r.cc.setByParticipantId,
      updatedAt: r.cc.updatedAt.toISOString(),
      facetKey: r.facetKey,
      termCode: r.termCode,
      termLabel: r.termLabel,
    }));
    return c.json({ items } satisfies ContainerClassificationsResponse);
  });

  // ── Set/replace one facet's term on a container (producing-org act) ────────
  app.put('/containers/:containerId/classifications', async (c) => {
    const scoped = await loadVisible(c, c.req.param('containerId'));
    if (!scoped) return notFound(c);
    if (!producesIt(scoped.container, scoped.slice)) return notFound(c);
    const body = setClassificationBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    // the term must belong to the named facet, and the facet to this project —
    // a classification is only ever against this project's own vocabulary
    const [term] = await deps.db
      .select({ facetId: s.classificationTerms.facetId, projectId: s.classificationFacets.projectId })
      .from(s.classificationTerms)
      .innerJoin(s.classificationFacets, eq(s.classificationTerms.facetId, s.classificationFacets.id))
      .where(
        and(
          eq(s.classificationTerms.id, body.data.termId),
          eq(s.classificationTerms.facetId, body.data.facetId),
          isNull(s.classificationTerms.retiredAt),
        ),
      )
      .limit(1);
    if (!term || term.projectId !== scoped.container.projectId) return invalid(c);
    // upsert: one term per facet per container (human-set → setBy the actor)
    await deps.db
      .insert(s.containerClassifications)
      .values({
        containerId: scoped.container.id,
        facetId: body.data.facetId,
        termId: body.data.termId,
        setByParticipantId: scoped.slice.participantId,
      })
      .onConflictDoUpdate({
        target: [s.containerClassifications.containerId, s.containerClassifications.facetId],
        set: {
          termId: body.data.termId,
          setByParticipantId: scoped.slice.participantId,
          proposedByRunId: null,
          updatedAt: sql`now()`,
        },
      });
    return c.body(null, 204);
  });

  // ── A container's relationship edges (read, both directions, wall-filtered) ─
  app.get('/containers/:containerId/relationships', async (c) => {
    const scoped = await loadVisible(c, c.req.param('containerId'));
    if (!scoped) return notFound(c);
    const id = scoped.container.id;
    const edges = await deps.db
      .select()
      .from(s.documentRelationships)
      .where(
        and(
          isNull(s.documentRelationships.retiredAt),
          or(
            eq(s.documentRelationships.fromContainerId, id),
            eq(s.documentRelationships.toContainerId, id),
          ),
        ),
      )
      .orderBy(asc(s.documentRelationships.createdAt));
    // the wall: only edges whose OTHER endpoint the requester may also see
    const others = edges.map((e) => (e.fromContainerId === id ? e.toContainerId : e.fromContainerId));
    const visible = await visibleAmong(scoped.slice, others);
    const kept = edges.filter((e) => {
      const other = e.fromContainerId === id ? e.toContainerId : e.fromContainerId;
      return visible.has(other);
    });
    const otherRefs = kept.length
      ? await deps.db
          .select({ id: s.containers.id, ref: s.containers.documentReference })
          .from(s.containers)
          .where(inArray(s.containers.id, [...visible]))
      : [];
    const refById = new Map(otherRefs.map((r) => [r.id, r.ref ?? '']));
    const items: ContainerRelationshipRead[] = kept.map((e) => {
      const outgoing = e.fromContainerId === id;
      const other = outgoing ? e.toContainerId : e.fromContainerId;
      return {
        ...toRelationship(e),
        direction: outgoing ? 'outgoing' : 'incoming',
        otherContainerId: other,
        otherDocumentReference: refById.get(other) ?? '',
      };
    });
    return c.json({ items } satisfies ContainerRelationshipsResponse);
  });

  // ── Propose an edge from this container to another (either party, T-386) ───
  app.post('/containers/:containerId/relationships', async (c) => {
    const scoped = await loadVisible(c, c.req.param('containerId'));
    if (!scoped) return notFound(c);
    if (!mayProposeEdge(scoped.container, scoped.slice)) return notFound(c);
    const body = proposeRelationshipBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    if (body.data.toContainerId === scoped.container.id) return invalid(c); // no self-edge
    // the target must be a container the proposer may see and in the same
    // project — you cannot draw an edge to a deliverable behind the wall
    const [target] = await deps.db
      .select({ id: s.containers.id })
      .from(s.containers)
      .where(
        and(
          eq(s.containers.id, body.data.toContainerId),
          eq(s.containers.projectId, scoped.container.projectId),
          deliverableVisible(scoped.slice),
        ),
      )
      .limit(1);
    if (!target) return notFound(c);
    try {
      const [edge] = await deps.db
        .insert(s.documentRelationships)
        .values({
          projectId: scoped.container.projectId,
          fromContainerId: scoped.container.id,
          toContainerId: body.data.toContainerId,
          type: body.data.type,
          createdByParticipantId: scoped.slice.participantId,
        })
        .returning();
      return c.json(toRelationship(edge!), 201);
    } catch (error) {
      if (isUniqueViolation(error)) return conflict(c, 'edge_exists');
      throw error;
    }
  });

  // Confirm a proposed edge → live. On a library target this is the OWNER's act
  // (T-386), and for `supersedes` it is no longer only a metadata write: the
  // confirmation sets the target's record state to `superseded` (ADR-0045 as
  // amended §1, ADR-0013 §3). This is the mechanism for the case a version bump
  // cannot express — a DIFFERENT document, not a newer revision, becoming the
  // authoritative one. The schema anticipated it (*"`supersedes` records the
  // link ADR-0013's supersede state implies"*); this wires it.
  app.post('/relationships/:relationshipId/confirmation', async (c) => {
    const edge = await loadEdgeForWrite(c, c.req.param('relationshipId'));
    if (!edge) return notFound(c);
    if (edge.row.confirmedAt) return conflict(c, 'already_confirmed');
    if (edge.row.retiredAt) return notFound(c);
    const [updated] = await deps.db
      .update(s.documentRelationships)
      .set({ confirmedByParticipantId: edge.slice.participantId, confirmedAt: sql`now()` })
      .where(eq(s.documentRelationships.id, edge.row.id))
      .returning();
    // Only `live` is overwritten. A target already `withdrawn` or `rejected` is
    // in a state a person set for a reason, and none of the three grounds — so
    // there is nothing to gain by restating it and a reason to lose.
    if (edge.row.type === 'supersedes' && edge.target.inLibrary && edge.target.state === 'live') {
      await deps.db
        .update(s.containers)
        .set({ state: 'superseded' })
        .where(eq(s.containers.id, edge.target.id));
    }
    return c.json(toRelationship(updated!));
  });

  // Retire an edge (currency-by-state; nothing deleted). Retiring a proposal is
  // how a proposed edge is rejected; retiring a CONFIRMED `supersedes` edge is
  // how a superseding that should not have happened is undone — ADR-0045 §1
  // grants the consequence to a confirmed *and un-retired* edge, so the target
  // returns to `live` when no other such edge still points at it (T-386). That
  // is the only way back from `superseded`: nothing withdrew the container, so
  // T-385's restore rule has no act to read.
  app.post('/relationships/:relationshipId/retirement', async (c) => {
    const edge = await loadEdgeForWrite(c, c.req.param('relationshipId'));
    if (!edge) return notFound(c);
    if (edge.row.retiredAt) return notFound(c);
    const [updated] = await deps.db
      .update(s.documentRelationships)
      .set({ retiredAt: sql`now()` })
      .where(eq(s.documentRelationships.id, edge.row.id))
      .returning();
    if (edge.row.type === 'supersedes' && edge.row.confirmedAt && edge.target.state === 'superseded') {
      const standing = await deps.db
        .select({ id: s.documentRelationships.id })
        .from(s.documentRelationships)
        .where(
          and(
            eq(s.documentRelationships.toContainerId, edge.target.id),
            eq(s.documentRelationships.type, 'supersedes'),
            isNull(s.documentRelationships.retiredAt),
            sql`${s.documentRelationships.confirmedAt} is not null`,
          ),
        )
        .limit(1);
      if (standing.length === 0) {
        await deps.db
          .update(s.containers)
          .set({ state: 'live' })
          .where(eq(s.containers.id, edge.target.id));
      }
    }
    return c.json(toRelationship(updated!));
  });

  // Load an edge for a confirm/retire write. The authority is the TARGET's:
  // owner-side on a library container, the from container's producing
  // organisation otherwise (T-386). The target row comes back with it, because
  // both writes now need its record state.
  async function loadEdgeForWrite(
    c: Context,
    relationshipId: string,
  ): Promise<{ row: RelationshipRow; slice: EntitledSlice; target: ContainerRow } | null> {
    if (!isUuid(relationshipId)) return null;
    const [row] = await deps.db
      .select()
      .from(s.documentRelationships)
      .where(eq(s.documentRelationships.id, relationshipId))
      .limit(1);
    if (!row) return null;
    const scoped = await loadVisible(c, row.fromContainerId);
    if (!scoped) return null;
    // the target must be visible to the writer too — the wall does not open
    // because an edge points through it
    const targetScoped = await loadVisible(c, row.toContainerId);
    if (!targetScoped) return null;
    if (!mayConfirmEdge(targetScoped.container, scoped.container, scoped.slice)) return null;
    return { row, slice: scoped.slice, target: targetScoped.container };
  }

  return app;
}
