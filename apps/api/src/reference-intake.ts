// T-472 — REFERENCE-MATERIAL INTAKE (ADR-0011's addendum of 2026-10-24;
// drawn in data-model.md, Drawer 2, before this was written).
//
// *In plain terms: the owner's super user drops a standard, a piece of guidance
// or a baseline report onto the library screen. Infora reads it, asks the AI to
// propose what it is called and how it should be classified, and parks it in a
// queue. A person looks, corrects, and confirms — one at a time or fifty at a
// time. Only on confirmation does a library document exist, and the record says
// who confirmed it. Reject a file and it is deleted.*
//
// 🔒 **NOTHING GROUNDS BEFORE CONFIRMATION, BY CONSTRUCTION.** An uploaded file
// is an intake row, not a container: no container or version exists until a
// person confirms, so there is nothing for retrieval to find and no flag in
// retrieval to forget. Confirmation admits through `admitReference`, the one
// path the operator's bulk load also takes.
//
// 🔒 **THE GATE IS THE OWNER'S SUPER USER** — owner organisation and
// `canEditPlan`, the same `ownerSuper` gate the work queue uses for the owner's
// confirmations. Anyone else on the project is refused in words (403
// `owner_super_user_required`); a stranger to the project never reaches here.
//
// **A scanned file is accepted, not refused.** Where the sandbox upload refuses a
// file with no readable text (a working draft nobody can read is a mistake), a
// scanned standard is a fact: it lands with its reason as `text_status`, gets no
// proposal, and — if confirmed — is admitted with its version marked
// `not_citable` (ADR-0011's addendum, ruling 3).
//
// **One file per request.** The screen's progress count ("7 of 50 uploaded · 2
// could not be read") is fed from each request's own result — server state, no
// timers — and one bad file cannot sink forty-nine good ones.
import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
  bulkConfirmIntakeBody,
  confirmIntakeBody,
  isOverUploadCeiling,
  referenceIntakeQuery,
  UPLOAD_MAX_BYTES,
  uploadTooLargeDetail,
} from '@infora/contracts';
import type {
  ApiError,
  BulkConfirmIntakeResponse,
  ConfirmIntakeResult,
  GetLibraryAdmissionResponse,
  IntakeClassification,
  IndexIntakeResponse,
  IntakeRow,
  ListReferenceIntakeResponse,
  UploadReferenceIntakeResponse,
} from '@infora/contracts';
import { ingestVersion, isVersionIndexed } from '@infora/data';
import { admitIntakeProposal, composeIntakePrompt, INTAKE_READ_CHARS } from '@infora/capabilities';
import type { IntakeFacet } from '@infora/capabilities';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { canEditPlan } from '@infora/governance';
import type { EntitledSlice } from '@infora/governance';
import type { ModelRates, Router } from '@infora/model';
import { costOf } from '@infora/model';
import { createConversation, finishRun, finishStep, openRun, openStep } from '@infora/orchestration';
import { disabledAiFeatures } from './ai-features';
import { referenceFor } from './bulk-load';
import { extractText } from './extract';
import { uploadFormats } from './file-revision';
import { AdmissionNotIndexed, admitReference, referenceInUse } from './reference-admission';
import { deleteBlob, putBlob } from './renditions';
import { projectScope, resolveSlice } from './requester';
import type { AppEnv } from './requester';

const isUuid = (value: string) => z.uuid().safeParse(value).success;
const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const forbidden = (c: Context) =>
  c.json({ error: 'forbidden', detail: 'owner_super_user_required' } satisfies ApiError, 403);
const invalid = (c: Context, detail?: string) =>
  c.json({ error: 'invalid', ...(detail && { detail }) } satisfies ApiError, 400);

// T-486 (f) — a file over the ceiling is refused in words (413) before anything
// is read, extracted or stored. The WOPI host's save is the house precedent for
// a worded 413 (`wopi.ts`).
const tooLarge = (c: Context, fileName?: string) =>
  c.json({ error: 'invalid', detail: uploadTooLargeDetail(fileName) } satisfies ApiError, 413);
/**
 * What a multipart body adds to the file's own bytes (boundary lines, the part's
 * headers). The declared length is the whole body, so it is judged against the
 * ceiling plus this; the exact test is the parsed file's own size, below.
 */
const MULTIPART_ALLOWANCE = 64 * 1024;

/** the owner's super user — the work queue's own `ownerSuper` */
const ownerSuper = (slice: EntitledSlice) => slice.membershipRole === 'owner' && canEditPlan(slice);

/** The agent id the proposal run is recorded under. */
export const INTAKE_AGENT_ID = 'intake:reference-proposal';

/** a file name made into a title when nobody (and nothing) has a better one */
const titleFromFilename = (filename: string) => referenceFor(filename).replace(/_+/g, ' ');

export function referenceIntakeRoutes(deps: { db: Db; router: Router; modelRates?: ModelRates }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  // ── upload: one file, into the queue ──────────────────────────────────────
  app.post('/projects/:projectId/reference-intake', project, async (c) => {
    const slice = c.get('slice');
    if (!ownerSuper(slice)) return forbidden(c);
    // T-486 (f) — the declared length first: a body that says it is over the
    // ceiling is turned away BEFORE it is buffered (the file is not named — no
    // name exists until the body is read). A body that does not declare a length,
    // or declares a short one, is caught by the parsed file's own size below.
    const declared = Number(c.req.header('content-length') ?? '0');
    if (declared > UPLOAD_MAX_BYTES + MULTIPART_ALLOWANCE) return tooLarge(c);
    const body = await c.req.parseBody().catch(() => null);
    const file = body?.['file'];
    if (!(file instanceof File)) return invalid(c, 'file_required');
    // the backstop, and the exact rule: refused before it is read, extracted or stored
    if (isOverUploadCeiling(file.size)) return tooLarge(c, file.name);
    const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
    const format = uploadFormats[extension as keyof typeof uploadFormats];
    if (!format) return invalid(c, 'unsupported_format');
    const bytes = Buffer.from(await file.arrayBuffer());

    // a file with no readable text is NOT refused here (ADR-0011 addendum, ruling 3)
    const extracted = extractText(format, bytes);
    const text = extracted.ok ? extracted.text : null;
    const textStatus = extracted.ok ? 'extracted' : extracted.reason;
    const fileRef = putBlob(bytes, format);

    // the proposal — skipped, never refused, when the project has switched it off
    let proposedTitle = titleFromFilename(file.name);
    let proposed: IntakeClassification[] | null = null;
    let runId: string | null = null;
    const off = (await disabledAiFeatures(deps.db, slice.projectId)).has('reference_intake');
    if (text !== null && !off) {
      const made = await propose(deps, slice, file.name, text);
      if (made !== null) {
        runId = made.runId;
        if (made.title !== null) proposedTitle = made.title;
        proposed = made.classifications;
      }
    }

    const [row] = await deps.db
      .insert(s.referenceIntake)
      .values({
        projectId: slice.projectId,
        organisationId: slice.organisationId,
        uploadedByParticipantId: slice.participantId,
        fileRef,
        format,
        originalFilename: file.name.slice(0, 300),
        extractedText: text,
        textStatus,
        proposedTitle,
        proposedClassifications: proposed,
        proposedByRunId: runId,
      })
      .returning();
    const [item] = await toRows(deps, [row!]);
    return c.json({ item: item! } satisfies UploadReferenceIntakeResponse, 201);
  });

  // ── the queue ─────────────────────────────────────────────────────────────
  app.get('/projects/:projectId/reference-intake', project, async (c) => {
    const slice = c.get('slice');
    if (!ownerSuper(slice)) return forbidden(c);
    const parsed = referenceIntakeQuery.safeParse(c.req.query());
    if (!parsed.success) return invalid(c);
    const { status, page, pageSize } = parsed.data;
    const where = and(eq(s.referenceIntake.projectId, slice.projectId), eq(s.referenceIntake.status, status));
    const [total] = await deps.db.select({ n: count() }).from(s.referenceIntake).where(where);
    const rows = await deps.db
      .select()
      .from(s.referenceIntake)
      .where(where)
      .orderBy(status === 'proposed' ? asc(s.referenceIntake.createdAt) : desc(s.referenceIntake.confirmedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const proposalsOn = !(await disabledAiFeatures(deps.db, slice.projectId)).has('reference_intake');
    return c.json({
      items: await toRows(deps, rows),
      total: total?.n ?? 0,
      page,
      pageSize,
      proposalsOn,
    } satisfies ListReferenceIntakeResponse);
  });

  // ── confirm several — each admitted in turn, reported per row ─────────────
  // (registered before the `:id` routes so "confirm" is never read as an id)
  app.post('/projects/:projectId/reference-intake/confirm', project, async (c) => {
    const slice = c.get('slice');
    if (!ownerSuper(slice)) return forbidden(c);
    const body = bulkConfirmIntakeBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    const results: ConfirmIntakeResult[] = [];
    for (const item of body.data.items) {
      results.push(await confirmOne(deps, slice, item.id, item));
    }
    const confirmed = results.filter((r) => r.ok).length;
    return c.json({ results, confirmed, failed: results.length - confirmed } satisfies BulkConfirmIntakeResponse);
  });

  // ── confirm one ───────────────────────────────────────────────────────────
  app.post('/projects/:projectId/reference-intake/:id/confirm', project, async (c) => {
    const slice = c.get('slice');
    if (!ownerSuper(slice)) return forbidden(c);
    const body = confirmIntakeBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    const result = await confirmOne(deps, slice, c.req.param('id'), body.data);
    if (result.ok) return c.json(result);
    const status = result.reason === 'not_found' ? 404 : result.reason === 'invalid_classification' ? 400 : result.reason === 'admission_failed' ? 409 : 409;
    return c.json({ error: status === 404 ? 'not_found' : status === 400 ? 'invalid' : 'conflict', detail: result.reason } satisfies ApiError, status);
  });

  // ── reject: the file and the row are deleted, with no reason asked ─────────
  app.post('/projects/:projectId/reference-intake/:id/reject', project, async (c) => {
    const slice = c.get('slice');
    if (!ownerSuper(slice)) return forbidden(c);
    if (!isUuid(c.req.param('id'))) return notFound(c);
    const [row] = await deps.db
      .select()
      .from(s.referenceIntake)
      .where(
        and(
          eq(s.referenceIntake.id, c.req.param('id')),
          eq(s.referenceIntake.projectId, slice.projectId),
          eq(s.referenceIntake.status, 'proposed'),
        ),
      )
      .limit(1);
    if (row === undefined) return notFound(c);
    await deps.db.delete(s.referenceIntake).where(eq(s.referenceIntake.id, row.id));
    deleteBlob(row.fileRef);
    return c.json({ id: row.id, rejected: true });
  });

  // ── "Index again": a confirmed file whose index call failed ───────────────
  // The container committed and the AI cannot read it yet. This re-runs the one
  // index step on the version admission made — nothing else is touched.
  app.post('/projects/:projectId/reference-intake/:id/index', project, async (c) => {
    const slice = c.get('slice');
    if (!ownerSuper(slice)) return forbidden(c);
    if (!isUuid(c.req.param('id'))) return notFound(c);
    const [row] = await deps.db
      .select()
      .from(s.referenceIntake)
      .where(
        and(
          eq(s.referenceIntake.id, c.req.param('id')),
          eq(s.referenceIntake.projectId, slice.projectId),
          eq(s.referenceIntake.status, 'confirmed'),
        ),
      )
      .limit(1);
    if (row === undefined || row.containerId === null) return notFound(c);
    const [version] = await deps.db
      .select({ id: s.versions.id, notCitable: s.versions.notCitable })
      .from(s.versions)
      .where(and(eq(s.versions.containerId, row.containerId), eq(s.versions.isCurrent, true)))
      .limit(1);
    if (version === undefined) return notFound(c);
    if (version.notCitable) {
      return c.json({ error: 'conflict', detail: 'not_citable' } satisfies ApiError, 409);
    }
    try {
      const summary = await ingestVersion(deps.db, deps.router, version.id);
      return c.json({ id: row.id, indexed: true, chunks: summary.chunks } satisfies IndexIntakeResponse);
    } catch {
      return c.json({ error: 'conflict', detail: 'index_failed' } satisfies ApiError, 409);
    }
  });

  // ── who put this reference document in the library, and when ──────────────
  // (the document page's Activity tab). Read through the plan row's own
  // visibility: the owner, or the organisation that produced the container.
  app.get('/containers/:containerId/library-admission', async (c) => {
    if (!isUuid(c.req.param('containerId'))) return notFound(c);
    const [container] = await deps.db
      .select({
        projectId: s.containers.projectId,
        producingOrganisationId: s.containers.producingOrganisationId,
      })
      .from(s.containers)
      .where(eq(s.containers.id, c.req.param('containerId')))
      .limit(1);
    if (container === undefined) return notFound(c);
    const slice = await resolveSlice(deps.db, c.get('user'), container.projectId);
    if (!slice) return notFound(c);
    if (slice.membershipRole !== 'owner' && container.producingOrganisationId !== slice.organisationId) {
      return notFound(c);
    }
    const [row] = await deps.db
      .select()
      .from(s.referenceIntake)
      .where(
        and(eq(s.referenceIntake.containerId, c.req.param('containerId')), eq(s.referenceIntake.status, 'confirmed')),
      )
      .limit(1);
    if (row === undefined || row.confirmedByParticipantId === null || row.confirmedAt === null) {
      return c.json({ admission: null } satisfies GetLibraryAdmissionResponse);
    }
    const names = await participantNames(deps.db, [row.uploadedByParticipantId, row.confirmedByParticipantId]);
    const needsIndexing = await needsIndexingOf(deps, row);
    return c.json({
      admission: {
        intakeId: row.id,
        needsIndexing,
        uploadedBy: { participantId: row.uploadedByParticipantId, name: names.get(row.uploadedByParticipantId) ?? '' },
        confirmedBy: { participantId: row.confirmedByParticipantId, name: names.get(row.confirmedByParticipantId) ?? '' },
        confirmedAt: row.confirmedAt.toISOString(),
        originalFilename: row.originalFilename,
      },
    } satisfies GetLibraryAdmissionResponse);
  });

  return app;
}

// ── the proposal — an agent run on the record ───────────────────────────────

async function loadFacets(db: Db, projectId: string): Promise<IntakeFacet[]> {
  const facets = await db
    .select()
    .from(s.classificationFacets)
    .where(eq(s.classificationFacets.projectId, projectId))
    .orderBy(asc(s.classificationFacets.sortOrder));
  if (facets.length === 0) return [];
  const terms = await db
    .select()
    .from(s.classificationTerms)
    .where(
      and(
        inArray(
          s.classificationTerms.facetId,
          facets.map((f) => f.id),
        ),
        isNull(s.classificationTerms.retiredAt),
      ),
    )
    .orderBy(asc(s.classificationTerms.sortOrder));
  return facets.map((f) => ({
    id: f.id,
    key: f.key,
    name: f.name,
    terms: terms.filter((t) => t.facetId === f.id).map((t) => ({ id: t.id, code: t.code, label: t.label })),
  }));
}

/**
 * Ask the model for a title and a classification, as a Run on the record
 * (ADR-0028): a conversation, a run, one `intake_proposal` step. Returns null
 * when the call could not be made — the file still lands, and the person fills
 * the fields by hand.
 */
async function propose(
  deps: { db: Db; router: Router; modelRates?: ModelRates },
  slice: EntitledSlice,
  filename: string,
  text: string,
): Promise<{ runId: string; title: string | null; classifications: IntakeClassification[] } | null> {
  const facets = await loadFacets(deps.db, slice.projectId);
  const { system, prompt } = composeIntakePrompt(filename, text.slice(0, INTAKE_READ_CHARS), facets);
  const conversation = await createConversation(deps.db, { projectId: slice.projectId, surface: 'web' });
  const run = await openRun(deps.db, {
    conversationId: conversation.id,
    agentId: INTAKE_AGENT_ID,
    agentProvenance: 'infora',
    request: `Propose a title and classification for ${filename}`,
    environmentKey: slice.projectId,
    requesterParticipantId: slice.participantId,
  });
  const step = await openStep(deps.db, { runId: run.id, type: 'intake_proposal' });
  try {
    const result = await deps.router.chat('triage', {
      system,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 600,
    });
    const admitted = admitIntakeProposal(result.text, facets);
    await finishStep(deps.db, step.id, 'completed', {
      model: result.model,
      usage: {
        tokensPrompt: result.usage.tokensPrompt,
        tokensCompletion: result.usage.tokensCompletion,
        cost: costOf(deps.modelRates, result.model, result.usage),
      },
      ...(result.egress !== undefined && { egress: result.egress }),
    });
    await finishRun(deps.db, run.id, 'completed', { response: result.text });
    return { runId: run.id, title: admitted.title, classifications: admitted.classifications };
  } catch {
    // the call could not be made: recorded as such, and the upload is unharmed
    await finishStep(deps.db, step.id, 'failed');
    await finishRun(deps.db, run.id, 'failed');
    return null;
  }
}

// ── confirm = admit ─────────────────────────────────────────────────────────

async function confirmOne(
  deps: { db: Db; router: Router },
  slice: EntitledSlice,
  id: string,
  settled: { title: string; classifications?: Array<{ facetId: string; termId: string }> | undefined },
): Promise<ConfirmIntakeResult> {
  // a malformed id is "does not exist", as everywhere else
  if (!isUuid(id)) return { id, ok: false, reason: 'not_found' };
  const [row] = await deps.db
    .select()
    .from(s.referenceIntake)
    .where(and(eq(s.referenceIntake.id, id), eq(s.referenceIntake.projectId, slice.projectId)))
    .limit(1);
  if (row === undefined) return { id, ok: false, reason: 'not_found' };
  if (row.status !== 'proposed') return { id, ok: false, reason: 'already_confirmed' };

  // the settled terms must be the project's own live vocabulary, one per facet
  const wanted = settled.classifications ?? [];
  const facets = await loadFacets(deps.db, slice.projectId);
  const seen = new Set<string>();
  for (const c of wanted) {
    const facet = facets.find((f) => f.id === c.facetId);
    if (facet === undefined || !facet.terms.some((t) => t.id === c.termId) || seen.has(c.facetId)) {
      return { id, ok: false, reason: 'invalid_classification' };
    }
    seen.add(c.facetId);
  }

  const reference = referenceFor(row.originalFilename);
  if (await referenceInUse(deps.db, slice.projectId, reference)) {
    return { id, ok: false, reason: 'reference_in_use' };
  }

  // the AI's authorship is recorded only where the person left its term standing
  const proposal = (row.proposedClassifications ?? []) as IntakeClassification[];
  const classifications = wanted.map((c) => ({
    facetId: c.facetId,
    termId: c.termId,
    setByParticipantId: slice.participantId,
    proposedByRunId:
      row.proposedByRunId !== null && proposal.some((p) => p.facetId === c.facetId && p.termId === c.termId)
        ? row.proposedByRunId
        : null,
  }));

  let admitted: { containerId: string; notCitable: boolean };
  let indexed = true;
  try {
    admitted = await admitReference(deps, {
      projectId: slice.projectId,
      organisationId: row.organisationId,
      reference,
      title: settled.title.trim(),
      format: row.format as 'docx' | 'xlsx' | 'pptx' | 'pdf',
      fileRef: row.fileRef,
      // a file whose text could not be read is admitted marked not citable
      text: row.textStatus === 'extracted' ? (row.extractedText ?? '') : null,
      classifications,
      // T-473 — confirming into the library is also the first confirmation of currency
      confirmedByParticipantId: slice.participantId,
    });
  } catch (error) {
    // Only an index failure AFTER the container committed lands anything. The
    // ids come from the admission's own transaction — never from looking the
    // reference up, which could find another document of the same name.
    if (!(error instanceof AdmissionNotIndexed)) return { id, ok: false, reason: 'admission_failed' };
    admitted = { containerId: error.containerId, notCitable: false };
    indexed = false;
  }
  await markConfirmed(deps.db, row.id, slice.participantId, admitted.containerId);
  return { id, ok: true, containerId: admitted.containerId, documentReference: reference, notCitable: admitted.notCitable, indexed };
}

async function markConfirmed(db: Db, intakeId: string, participantId: string, containerId: string): Promise<void> {
  await db
    .update(s.referenceIntake)
    .set({
      status: 'confirmed',
      confirmedByParticipantId: participantId,
      confirmedAt: new Date(),
      containerId,
      // the text now lives on the version; the intake row keeps the audit, not a second copy
      extractedText: null,
    })
    .where(eq(s.referenceIntake.id, intakeId));
}

// ── the wire shape ──────────────────────────────────────────────────────────

async function participantNames(db: Db, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: s.participants.id, name: s.users.name })
    .from(s.participants)
    .innerJoin(s.users, eq(s.users.id, s.participants.userId))
    .where(inArray(s.participants.id, unique));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** a confirmed row whose current version is citable but not yet indexed */
async function needsIndexingOf(
  deps: { db: Db; router: Router },
  row: typeof s.referenceIntake.$inferSelect,
): Promise<boolean> {
  if (row.status !== 'confirmed' || row.containerId === null) return false;
  const [version] = await deps.db
    .select({ id: s.versions.id, notCitable: s.versions.notCitable })
    .from(s.versions)
    .where(and(eq(s.versions.containerId, row.containerId), eq(s.versions.isCurrent, true)))
    .limit(1);
  if (version === undefined || version.notCitable) return false;
  return !(await isVersionIndexed(deps.db, deps.router, version.id, row.projectId));
}

async function toRows(deps: { db: Db; router: Router }, rows: Array<typeof s.referenceIntake.$inferSelect>): Promise<IntakeRow[]> {
  const db = deps.db;
  const flags = new Map<string, boolean>();
  for (const r of rows) flags.set(r.id, await needsIndexingOf(deps, r));
  const names = await participantNames(
    db,
    rows.flatMap((r) => [r.uploadedByParticipantId, ...(r.confirmedByParticipantId ? [r.confirmedByParticipantId] : [])]),
  );
  return rows.map((r) => ({
    id: r.id,
    originalFilename: r.originalFilename,
    format: r.format,
    textStatus: r.textStatus,
    readable: r.textStatus === 'extracted',
    proposedTitle: r.proposedTitle,
    proposedClassifications: (r.proposedClassifications as IntakeClassification[] | null) ?? null,
    status: r.status === 'rejected' ? 'rejected' : r.status,
    uploadedBy: { participantId: r.uploadedByParticipantId, name: names.get(r.uploadedByParticipantId) ?? '' },
    uploadedAt: r.createdAt.toISOString(),
    confirmedBy: r.confirmedByParticipantId
      ? { participantId: r.confirmedByParticipantId, name: names.get(r.confirmedByParticipantId) ?? '' }
      : null,
    confirmedAt: r.confirmedAt?.toISOString() ?? null,
    containerId: r.containerId,
    needsIndexing: flags.get(r.id) ?? false,
  }));
}
