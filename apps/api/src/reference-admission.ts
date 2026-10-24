// T-472 — THE ONE ADMISSION PATH for reference material.
//
// *In plain terms: there are two ways a received document gets into a project's
// library — the operator's bulk load, and a person confirming an intake row.
// They used to be one piece of code and a promise; now they are one piece of
// code. Whatever a document is made of — container, first version, its file,
// its reading by the index — is made here, once.*
//
// What admission is, ruled 2026-07-31 (T-304) and unchanged: the document
// enters as a **reference-material container** at `live`, with a single genesis
// Version, grounding (ADR-0011) and riding every access and state pre-filter
// untouched — and carrying **no work item**, which is the whole of what
// distinguishes it from a deliverable.
//
// **The one new case (ADR-0011's addendum of 2026-10-24, ruling 3).** A file
// whose text could not be read is admitted with `text: null`: its version is
// marked `not_citable` at insert (versions are append-only, so it can only be
// set here), carries `content ''`, and is NOT ingested — it has no passages and
// is not supposed to. That is the one admitted-empty case; `extract.ts` still
// refuses everywhere else.
import { and, eq } from 'drizzle-orm';
import { ingestVersion } from '@infora/data';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { Router } from '@infora/model';
import type { ExtractableFormat } from './extract';
import { confirmCurrent } from './reference-currency';
import { generateRenditions, putBlob } from './renditions';

/** The genesis revision of received material. Not a P or a C: it was never issued *here*. */
export const GENESIS_REVISION = 'R01';

export type AdmitReferenceInput = {
  projectId: string;
  /** whose material this is — becomes `producing_organisation_id`, which the wall reads */
  organisationId: string;
  /** the coded reference: the file name, for received material (see `referenceFor`) */
  reference: string;
  title: string;
  format: ExtractableFormat;
  /** the file, written to the blob store here — unless `fileRef` says it already is stored */
  bytes?: Buffer;
  /** an already-stored blob (the intake kept the upload's); one of `bytes` and this is required */
  fileRef?: string;
  /** the extracted text, or `null` for a file whose text could not be read (not citable) */
  text: string | null;
  /**
   * The classification rows to write with the container — empty for the
   * operator's load, which records nobody. `setByParticipantId` is the person
   * who settled it; `proposedByRunId` the agent run that proposed it, if any.
   */
  classifications?: Array<{
    facetId: string;
    termId: string;
    setByParticipantId: string;
    proposedByRunId: string | null;
  }>;
  /**
   * T-473 — the person whose confirmation this admission IS, who thereby also
   * confirms the document current (ADR-0011's addendum, ruling 4: "the intake's
   * confirmation is the first confirmation"). Absent for the operator's load,
   * which records nobody: its documents start unconfirmed, with the mark.
   */
  confirmedByParticipantId?: string;
};

/**
 * The index call failed AFTER the container committed. Carries the ids the
 * transaction itself returned, so a caller never has to look the container up
 * by reference (a lookup can find somebody else's document of the same name).
 * Anything thrown by `admitReference` that is NOT this means nothing landed.
 */
export class AdmissionNotIndexed extends Error {
  constructor(
    readonly containerId: string,
    readonly versionId: string,
    options?: { cause?: unknown },
  ) {
    super('the document was admitted but could not be indexed', options);
  }
}

export type AdmittedReference = {
  containerId: string;
  versionId: string;
  /** chunks written; `null` for a not-citable version, which is never ingested */
  chunks: number | null;
  notCitable: boolean;
};

export async function admitReference(
  deps: { db: Db; router: Router },
  input: AdmitReferenceInput,
): Promise<AdmittedReference> {
  const notCitable = input.text === null;
  // The blob first: a container pointing at a file that was never written is a
  // worse state to resume from than a file with no container.
  if (input.fileRef === undefined && input.bytes === undefined) {
    throw new Error('admitReference: a file (bytes or an already-stored fileRef) is required');
  }
  const fileRef = input.fileRef ?? putBlob(input.bytes!, input.format);

  const { containerId, versionId } = await deps.db.transaction(async (tx) => {
    const [container] = await tx
      .insert(s.containers)
      .values({
        projectId: input.projectId,
        producingOrganisationId: input.organisationId,
        documentReference: input.reference,
        // T-462 — reference material's own title
        title: input.title,
        scope: 'library',
        // admitted directly: received material has no cycle to be accepted by,
        // and inventing one is what the 2026-07-31 ruling refuses
        inLibrary: true,
        state: 'live',
      })
      .returning();
    const [version] = await tx
      .insert(s.versions)
      .values({
        containerId: container!.id,
        versionReference: GENESIS_REVISION,
        content: input.text ?? '',
        isCurrent: true,
        notCitable,
      })
      .returning();
    if (input.classifications !== undefined && input.classifications.length > 0) {
      await tx.insert(s.containerClassifications).values(
        input.classifications.map((c) => ({
          containerId: container!.id,
          facetId: c.facetId,
          termId: c.termId,
          setByParticipantId: c.setByParticipantId,
          proposedByRunId: c.proposedByRunId,
        })),
      );
    }
    // T-473 — the person's confirmation is the first confirmation of currency,
    // made in the same transaction so a document is never admitted half-recorded
    // (after the classification above, which fixes the interval it runs for)
    if (input.confirmedByParticipantId !== undefined) {
      await confirmCurrent(tx as unknown as Db, container!.id, input.confirmedByParticipantId);
    }
    // the native rendition is the file itself, so the Documents view opens the
    // real document rather than the extracted text. Inside the transaction, so
    // a failure here leaves NOTHING behind (a container with no file to open).
    await generateRenditions(
      tx as unknown as Db,
      { id: version!.id, content: input.text ?? '' },
      { title: input.reference, origin: 'uploaded', format: input.format, fileRef },
    );
    // NO work item is created, and that is the ticket rather than an omission.
    return { containerId: container!.id, versionId: version!.id };
  });

  // after the transaction commits (T-302): an outbound embedding call holds no
  // transaction open, and a failure here leaves a resumable half — which the
  // bulk load's resume check is what makes true. A not-citable version has no
  // passages to embed and is finished as it stands.
  if (notCitable) return { containerId, versionId, chunks: null, notCitable: true };
  let summary;
  try {
    summary = await ingestVersion(deps.db, deps.router, versionId);
  } catch (error) {
    throw new AdmissionNotIndexed(containerId, versionId, { cause: error });
  }
  return { containerId, versionId, chunks: summary.chunks, notCitable: false };
}

/** Is there already a library container with this reference in the project? */
export async function referenceInUse(db: Db, projectId: string, reference: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: s.containers.id })
    .from(s.containers)
    .where(and(eq(s.containers.projectId, projectId), eq(s.containers.documentReference, reference)))
    .limit(1);
  return existing !== undefined;
}
