// Deliverable visibility as an in-query SQL pre-filter (ADR-0016 + ADR-0035
// §5) — the SQL form of governance's `canReadDeliverable`. Shared by retrieval
// (grounding), the library list, and the version read, so that what grounds,
// what the list shows, and what a citation resolves can never drift apart. The
// query using it MUST carry `s.containers` in scope.
//
// producer | owner are ungated (§2). The share branch additionally requires,
// as an order-independent conjunction: the receiving organisation's
// acknowledgement of the deliverable's CURRENT version (§4, organisation grain)
// and the Participant within any narrowing present (§3, participant grain).
//
// The acknowledgement is per version and re-triggered on promotion (owner-ruled
// 2026-07-20), but the gate keys on the *current* version everywhere: grounding
// and the list only ever touch the current version, and a citation read of a
// superseded version resolves whenever the organisation is currently entitled
// (T-094 — an immutable record's citations must stay resolvable). Never a
// post-filter.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { EntitledSlice } from '@infora/governance';
import { schema as s } from '@infora/db';

export function deliverableVisibleSql(slice: EntitledSlice): SQL {
  return sql`(
    ${s.containers.producingOrganisationId} = ${slice.organisationId}
    or exists (select 1 from projects p
                where p.id = ${s.containers.projectId}
                  and p.owner_organisation_id = ${slice.organisationId})
    or (
      exists (select 1 from deliverable_shares ds
                where ds.container_id = ${s.containers.id}
                  and ds.organisation_id = ${slice.organisationId}
                  and ds.revoked_at is null)
      -- §4 acknowledgement gate, organisation grain: until the receiving
      -- organisation has acknowledged this deliverable's current version, no
      -- Participant of it retrieves the chunk, sees the list row, or resolves a
      -- citation
      and exists (select 1 from deliverable_acknowledgements da
                    join versions cv on cv.id = da.version_id
                where da.container_id = ${s.containers.id}
                  and da.organisation_id = ${slice.organisationId}
                  and cv.container_id = ${s.containers.id}
                  and cv.is_current = true)
      -- §3 narrowing, participant grain: no live grant present = whole-org
      -- default (everyone entitled sees it); a grant present = only the granted
      and (
        not exists (select 1 from deliverable_participant_grants g
                where g.container_id = ${s.containers.id}
                  and g.organisation_id = ${slice.organisationId}
                  and g.revoked_at is null)
        or exists (select 1 from deliverable_participant_grants g
                where g.container_id = ${s.containers.id}
                  and g.organisation_id = ${slice.organisationId}
                  and g.participant_id = ${slice.participantId}
                  and g.revoked_at is null)
      )
    )
  )`;
}
