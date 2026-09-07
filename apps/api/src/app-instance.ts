// T-445 — **the one path that makes an app instance**, so that a deployed
// playbook is an ordinary app and not a second kind of one.
//
// *In plain terms: whether somebody creates an empty app from scratch or
// deploys one of their firm's templates, the same code makes it. So it gets the
// same stamps, the same starting scope and the same rules either way, and there
// is no second version of "how an app comes into existence" to drift.*
//
// This was T-440's `POST /projects/:projectId/apps` body, lifted here unchanged
// when T-445 needed a second caller. It is a NEW FILE rather than an export
// from `apps.ts` so that the app routes and the playbook routes both depend on
// it and neither depends on the other.
//
// 🔒 **THE CREATOR'S OWN ORGANISATION IS ALWAYS IN SCOPE, AND NOTHING ELSE IS
// IMPLIED.** T-440's reason stands: an app nobody can open, including the
// person who just made it, is a bug rather than a strict default. A deployment
// passes no other organisation at all — an organisation id from the project a
// playbook was saved in is another project's fact, and means nothing here.
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { EMPTY_APP_DEFINITION } from '@infora/contracts';
import type { AppDefinition } from '@infora/contracts';
import type { EntitledSlice } from '@infora/governance';

export type NewAppInstance = {
  projectId: string;
  /** who is making it — the owner, the creator and the definition's author all
   * start as this one person */
  slice: EntitledSlice;
  name: string;
  description?: string | null;
  /** the ADR-0036 ladder's initial rungs, beyond the creator's own firm */
  organisationIds?: readonly string[];
  participantIds?: readonly string[];
  /** the working copy it starts from — `EMPTY_APP_DEFINITION` from scratch, a
   * playbook's saved definition on a deployment */
  definition?: AppDefinition;
  /** what it was deployed from, and there is NO LIVE LINK (ADR-0056 §10): the
   * version is stored beside the id because updating a playbook must never
   * change what is already running inside a client's project */
  playbookId?: string | null;
  playbookVersion?: number | null;
};

/** Insert the app and its initial scope grants. Returns the new app's id. */
export async function createAppInstance(db: Db, input: NewAppInstance): Promise<string> {
  const [created] = await db
    .insert(s.apps)
    .values({
      projectId: input.projectId,
      name: input.name,
      description: input.description ?? null,
      ownerParticipantId: input.slice.participantId,
      createdByParticipantId: input.slice.participantId,
      definitionUpdatedByParticipantId: input.slice.participantId,
      definition: input.definition ?? EMPTY_APP_DEFINITION,
      playbookId: input.playbookId ?? null,
      playbookVersion: input.playbookVersion ?? null,
    })
    .returning();

  const organisationIds = new Set([input.slice.organisationId, ...(input.organisationIds ?? [])]);
  for (const organisationId of organisationIds) {
    await db.insert(s.appScopeGrants).values({
      appId: created!.id,
      granteeType: 'organisation',
      organisationId,
      grantedByParticipantId: input.slice.participantId,
    });
  }
  for (const participantId of input.participantIds ?? []) {
    // a named person on the ladder's bottom rung; one live grant per pair
    await db
      .insert(s.appScopeGrants)
      .values({
        appId: created!.id,
        granteeType: 'participant',
        participantId,
        grantedByParticipantId: input.slice.participantId,
      })
      .onConflictDoNothing();
  }
  return created!.id;
}
