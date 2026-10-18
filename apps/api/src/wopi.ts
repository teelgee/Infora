// T-453 — the WOPI host: Infora serves its own files to an editing engine
// (ADR-0043 §1, §2, §4; the 2026-10-18 dated note).
//
// *In plain terms: WOPI is the standard interface through which a browser
// editor — Collabora today, Microsoft's own Office for the web later — opens a
// file that lives in Infora and saves it back. The engine never holds the file
// for keeps and never decides who may see it: it asks Infora on every call, and
// Infora checks, every time, that the person it is acting for is still allowed
// in.*
//
// THE PASS (an "access token" in WOPI's words) IS NOT A CAPABILITY. A person's
// signed-in browser asks for one (`POST /sandbox-documents/:id/editing-session`)
// and hands it to the engine. It names ONE file and ONE sign-in, lasts an hour
// at most (and never past its sign-in's own end), and is stored only as a hash.
// Holding it proves nothing by itself: every WOPI call re-resolves the person's
// project slice and the sandbox's live scope grants, exactly as every sandbox
// read does, so a revoked grant refuses the very next call. That is T-317's
// presigned-URL rule applied here — a credential that outlived the check that
// minted it would hold the wall at the API and leak it at the engine.
//
// THE LOCK IS THE CHECK-OUT. WOPI's lock rides `head_locked` and the
// `sandbox_checkout_events` trail (engine-lock.ts); there is no second lock.
// A second writer — another engine, or a person's freeze — is refused with the
// current holder named in words (`X-WOPI-LockFailureReason`).
//
// A SAVE IS A WORKING REVISION. PutFile lands through `landFileRevision`, the
// same act as T-220's replace-file, so it appends a v0.x that keeps its file
// (ADR-0041) and is the same version-landing event ADR-0059's file source
// listens for.
//
// ENGINE-NEUTRAL BY CONSTRUCTION: nothing below names an engine. Every field is
// from the WOPI protocol itself, so pointing this host at Microsoft Office for
// the web after CSPP approval is configuration, not a rebuild (ADR-0043 §3).
//
// SESSIONLESS AND CSRF-EXEMPT, by name: the engine calls server-to-server with
// no cookie, so `/wopi/` is exempted in requester.ts and csrf.ts. CSRF is an
// attack on AMBIENT credentials (a cookie a browser attaches unasked); a WOPI
// call carries its credential explicitly, so there is nothing to forge.
import { createHash, randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, count, eq, isNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ApiError, EditingSession } from '@infora/contracts';
import { canAccessSandbox } from '@infora/governance';
import type { EntitledSlice } from '@infora/governance';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { getBlob } from './renditions';
import { landFileRevision } from './file-revision';
import { editorUrlFor } from './editor-engine';
import {
  checkoutHolder,
  extendEngineLock,
  releaseEngineLock,
  releaseLapsedEngineLock,
  swapEngineLock,
  takeEngineLock,
} from './engine-lock';
import { resolveSlice } from './requester';
import type { AppEnv, UserRow } from './requester';
import { DEFAULT_SESSION_POLICY, sessionIsLive } from './sessions';
import type { SessionPolicy } from './sessions';

/** Deployment configuration for in-browser editing (index.ts reads it from env). */
export type EditingConfig = {
  /** The API's own base URL as the ENGINE reaches it — the WOPISrc prefix. */
  wopiHostUrl?: string;
  /** A pass's lifetime in minutes; default 60, never past its sign-in's end. */
  tokenMinutes?: number;
  /** The web app's origin, which the engine may post messages to. */
  postMessageOrigin?: string;
  /**
   * T-454 — the editing engine's base URL as THIS API reaches it, for WOPI
   * discovery (editor-engine.ts). Absent means no engine: a pass is still
   * minted, and `editorUrl` is null, which the pane reports in words.
   */
  engineUrl?: string;
};

const DEFAULT_TOKEN_MINUTES = 60;
// the formats an engine edits — an uploaded PDF is the record rendition and
// never an editing surface (ADR-0004), and authored text has its own editor
const editableFormats = new Set(['docx', 'xlsx', 'pptx']);

const isUuid = (value: string) => z.uuid().safeParse(value).success;
const hashPass = (token: string) => createHash('sha256').update(token).digest('hex');
const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const unauthenticated = (c: Context) => c.json({ error: 'unauthenticated' } satisfies ApiError, 401);

type DocumentRow = typeof s.sandboxDocuments.$inferSelect;

/**
 * May this person edit this file in an engine? The SAME two gates every
 * sandbox read passes, and no third: the document's own organisation-private
 * floor (`resourceScope` for sandbox documents) AND a live scope grant on its
 * sandbox (ADR-0036's `canAccessSandbox`). Both, so the editor can never admit
 * someone the document's ordinary read would refuse — it only narrows.
 *
 * `inTransaction` takes the grant rows FOR SHARE: a revocation committing
 * while a save is landing waits for the save's transaction, and a revocation
 * that committed first is what the save reads. That is ADR-0024's "revoke
 * drops access in the same transaction" made literal for the write path.
 */
async function editableBy(
  db: Db,
  user: UserRow,
  doc: DocumentRow | undefined,
  inTransaction = false,
): Promise<EntitledSlice | null> {
  if (!doc || doc.deletedAt !== null || doc.origin !== 'uploaded') return null;
  if (!editableFormats.has(doc.format) || doc.fileRef === null) return null;
  const slice = await resolveSlice(db, user, doc.projectId);
  if (!slice || slice.organisationId !== doc.organisationId) return null;
  const query = db
    .select()
    .from(s.sandboxScopeGrants)
    .where(and(eq(s.sandboxScopeGrants.sandboxId, doc.sandboxId), isNull(s.sandboxScopeGrants.removedAt)));
  const grants = inTransaction ? await query.for('share') : await query;
  return canAccessSandbox(slice, grants) ? slice : null;
}

type Admitted = { doc: DocumentRow; slice: EntitledSlice; user: UserRow };

export function wopiRoutes(deps: { db: Db; sessionPolicy?: SessionPolicy; editing?: EditingConfig }) {
  const app = new Hono<AppEnv>();
  const policy = deps.sessionPolicy ?? DEFAULT_SESSION_POLICY;
  const config = deps.editing ?? {};

  /**
   * Every WOPI call starts here. 401 when the pass itself is no good (unknown,
   * expired, for another file, or its sign-in has ended); 404 when the person
   * behind a good pass may no longer reach the file — the same answer as a
   * file that does not exist (contracts principle 4).
   */
  async function admit(
    db: Db,
    c: Context,
    inTransaction: boolean,
  ): Promise<{ ok: true; admitted: Admitted } | { ok: false; response: Response }> {
    const fileId = c.req.param('fileId') ?? '';
    const bearer = c.req.header('authorization')?.match(/^Bearer (.+)$/)?.[1];
    const token = c.req.query('access_token') ?? bearer;
    if (!token || !isUuid(fileId)) return { ok: false, response: unauthenticated(c) };
    const [pass] = await db
      .select()
      .from(s.wopiAccessTokens)
      .where(eq(s.wopiAccessTokens.tokenHash, hashPass(token)))
      .limit(1);
    // single-file: a pass for one document opens no other, whatever the path says
    if (!pass || pass.expiresAt.getTime() <= Date.now() || pass.sandboxDocumentId !== fileId) {
      return { ok: false, response: unauthenticated(c) };
    }
    if (!(await sessionIsLive(db, pass.sessionId, policy))) return { ok: false, response: unauthenticated(c) };
    const [user] = await db
      .select({ user: s.users })
      .from(s.sessions)
      .innerJoin(s.users, eq(s.users.id, s.sessions.userId))
      .where(eq(s.sessions.id, pass.sessionId))
      .limit(1);
    const docQuery = db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.id, fileId)).limit(1);
    const [doc] = inTransaction ? await docQuery.for('update') : await docQuery;
    const slice = user ? await editableBy(db, user.user, doc, inTransaction) : null;
    if (!slice) return { ok: false, response: notFound(c) };
    return { ok: true, admitted: { doc: doc!, slice, user: user!.user } };
  }

  /** The working revision the file is at, v0.N — WOPI's item version. */
  async function itemVersion(db: Db, documentId: string): Promise<string> {
    const [row] = await db
      .select({ n: count() })
      .from(s.sandboxDocumentVersions)
      .where(eq(s.sandboxDocumentVersions.sandboxDocumentId, documentId));
    return `v0.${Math.max(1, Number(row?.n ?? 0))}`;
  }

  /**
   * The refusal, in words a person can act on. WOPI's 409 carries the current
   * lock string (empty when the head is held by something that is not an
   * engine) and a free-text reason the engine shows; the body says it again
   * for any caller that reads JSON.
   */
  async function refuse(
    db: Db,
    c: Context,
    doc: DocumentRow,
    detail: 'held_by_another_editor' | 'checked_out' | 'not_locked',
  ) {
    let reason = 'This file is not open for editing: the editor has to take the lock before it saves.';
    if (detail !== 'not_locked') {
      const holder = await checkoutHolder(db, doc.id);
      const who = holder?.name ?? 'Someone';
      const since = holder ? ` since ${holder.since.toISOString().slice(0, 16).replace('T', ' ')} UTC` : '';
      reason =
        detail === 'held_by_another_editor'
          ? `${who} has this file open in another editor${since}. Only that editor can save it until it closes the file.`
          : `${who} has checked this file out for review${since}. It can be edited again once it is released.`;
    }
    c.header('X-WOPI-Lock', doc.wopiLock ?? '');
    // a header is Latin-1 by HTTP's rules and a person's name need not be, so
    // the header carries a safe rendering and the body carries the exact words
    c.header('X-WOPI-LockFailureReason', reason.normalize('NFKD').replace(/[^\x20-\x7e]/g, (ch) => (/\p{M}/u.test(ch) ? '' : '?')));
    return c.json({ error: 'conflict', detail, hint: reason } satisfies ApiError, 409);
  }

  // ── The pass: minted for a signed-in person, for one file ────────────────
  app.post('/sandbox-documents/:id/editing-session', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) return notFound(c);
    const [doc] = await deps.db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.id, id)).limit(1);
    const slice = await editableBy(deps.db, c.get('user'), doc);
    if (!slice) return notFound(c);
    const [session] = await deps.db
      .select({ expiresAt: s.sessions.expiresAt })
      .from(s.sessions)
      .where(eq(s.sessions.id, c.get('sessionId')))
      .limit(1);
    // the table holds only live passes: an expired one is deleted, not kept
    await deps.db.delete(s.wopiAccessTokens).where(lte(s.wopiAccessTokens.expiresAt, sql`now()`));
    const token = randomBytes(32).toString('base64url');
    const lifetime = Date.now() + (config.tokenMinutes ?? DEFAULT_TOKEN_MINUTES) * 60_000;
    const expiresAt = new Date(Math.min(lifetime, session!.expiresAt.getTime()));
    await deps.db.insert(s.wopiAccessTokens).values({
      tokenHash: hashPass(token),
      sandboxDocumentId: id,
      sessionId: c.get('sessionId'),
      expiresAt,
    });
    const wopiSrc = `${config.wopiHostUrl ?? ''}/wopi/files/${id}`;
    return c.json(
      {
        documentId: id,
        wopiSrc,
        accessToken: token,
        accessTokenTtl: expiresAt.getTime(),
        editorUrl: config.engineUrl ? await editorUrlFor(config.engineUrl, doc!.format, wopiSrc) : null,
      } satisfies EditingSession,
      201,
    );
  });

  // ── CheckFileInfo ─────────────────────────────────────────────────────────
  app.get('/wopi/files/:fileId', async (c) => {
    const gate = await admit(deps.db, c, false);
    if (!gate.ok) return gate.response;
    const { doc, slice, user } = gate.admitted;
    const bytes = getBlob(doc.fileRef!);
    if (!bytes) return notFound(c);
    // a person's freeze holds the head with no engine lock: the file opens to
    // read, and the editor says why it cannot be changed
    const frozenByPerson = doc.headLocked && doc.wopiLock === null;
    return c.json({
      BaseFileName: `${doc.title}.${doc.format}`,
      OwnerId: doc.createdByParticipantId,
      Size: bytes.length,
      UserId: slice.participantId,
      UserFriendlyName: user.name,
      Version: await itemVersion(deps.db, doc.id),
      LastModifiedTime: doc.updatedAt.toISOString(),
      UserCanWrite: !frozenByPerson,
      ReadOnly: frozenByPerson,
      SupportsLocks: true,
      SupportsGetLock: true,
      SupportsUpdate: true,
      SupportsRename: false,
      UserCanRename: false,
      // a "save as" would create a file outside Infora's grants — not offered
      UserCanNotWriteRelative: true,
      ...(config.postMessageOrigin && { PostMessageOrigin: config.postMessageOrigin }),
    });
  });

  // ── GetFile ───────────────────────────────────────────────────────────────
  app.get('/wopi/files/:fileId/contents', async (c) => {
    const gate = await admit(deps.db, c, false);
    if (!gate.ok) return gate.response;
    const bytes = getBlob(gate.admitted.doc.fileRef!);
    if (!bytes) return notFound(c);
    return c.body(new Uint8Array(bytes), 200, {
      'content-type': 'application/octet-stream',
      'X-WOPI-ItemVersion': await itemVersion(deps.db, gate.admitted.doc.id),
    });
  });

  // ── PutFile ───────────────────────────────────────────────────────────────
  app.post('/wopi/files/:fileId/contents', async (c) => {
    if ((c.req.header('x-wopi-override') ?? '').toUpperCase() !== 'PUT') return notFound(c);
    const bytes = Buffer.from(await c.req.arrayBuffer());
    const lock = c.req.header('x-wopi-lock') ?? '';
    const fileId = c.req.param('fileId');
    if (isUuid(fileId)) await releaseLapsedEngineLock(deps.db, fileId);
    return deps.db.transaction(async (tx) => {
      const db = tx as unknown as Db;
      const gate = await admit(db, c, true);
      if (!gate.ok) return gate.response;
      const { doc, slice } = gate.admitted;
      // a save comes only through the lock that holds the head — never into an
      // unlocked file, and never past a person's freeze or another editor
      if (!doc.headLocked) return refuse(db, c, doc, 'not_locked');
      if (doc.wopiLock === null) return refuse(db, c, doc, 'checked_out');
      if (doc.wopiLock !== lock) return refuse(db, c, doc, 'held_by_another_editor');
      const landed = await landFileRevision(db, doc, bytes, slice.participantId);
      if (!landed.ok) return c.json({ error: 'invalid', detail: landed.detail } satisfies ApiError, 400);
      // a save is activity: the engine's 30 minutes start again
      await extendEngineLock(db, doc.id);
      c.header('X-WOPI-ItemVersion', await itemVersion(db, doc.id));
      return c.json({ LastModifiedTime: landed.doc.updatedAt.toISOString() });
    });
  });

  // ── The lock family: LOCK (and UnlockAndRelock), GET_LOCK, REFRESH_LOCK, UNLOCK
  app.post('/wopi/files/:fileId', async (c) => {
    const override = (c.req.header('x-wopi-override') ?? '').toUpperCase();
    if (!['LOCK', 'GET_LOCK', 'REFRESH_LOCK', 'UNLOCK'].includes(override)) {
      // PUT_RELATIVE, RENAME_FILE, DELETE…: not offered, and CheckFileInfo says so
      return c.json({ error: 'invalid', detail: 'unsupported_operation' } satisfies ApiError, 501);
    }
    const lock = c.req.header('x-wopi-lock') ?? '';
    const oldLock = c.req.header('x-wopi-oldlock');
    const fileId = c.req.param('fileId');
    if (isUuid(fileId)) await releaseLapsedEngineLock(deps.db, fileId);
    return deps.db.transaction(async (tx) => {
      const db = tx as unknown as Db;
      const gate = await admit(db, c, true);
      if (!gate.ok) return gate.response;
      const { doc, slice } = gate.admitted;
      const ok = () => c.body(null, 200);

      if (override === 'GET_LOCK') {
        c.header('X-WOPI-Lock', doc.wopiLock ?? '');
        return c.body(null, 200);
      }
      if (lock === '') return c.json({ error: 'invalid', detail: 'lock_required' } satisfies ApiError, 400);

      if (override === 'LOCK' && oldLock !== undefined) {
        // UnlockAndRelock: only the holder may swap its own string
        if (doc.wopiLock === null) return refuse(db, c, doc, doc.headLocked ? 'checked_out' : 'not_locked');
        if (doc.wopiLock !== oldLock) return refuse(db, c, doc, 'held_by_another_editor');
        await swapEngineLock(db, doc.id, oldLock, lock, slice.participantId);
        return ok();
      }
      if (override === 'LOCK') {
        if (!doc.headLocked) {
          await takeEngineLock(db, doc.id, lock, slice.participantId);
          return ok();
        }
        // the same engine re-asserting its lock is a refresh (WOPI's rule, and
        // how an engine that never sends REFRESH_LOCK keeps a file)
        if (doc.wopiLock === lock) {
          await extendEngineLock(db, doc.id);
          return ok();
        }
        return refuse(db, c, doc, doc.wopiLock === null ? 'checked_out' : 'held_by_another_editor');
      }
      // REFRESH_LOCK and UNLOCK: the holder only
      if (doc.wopiLock === null) return refuse(db, c, doc, doc.headLocked ? 'checked_out' : 'not_locked');
      if (doc.wopiLock !== lock) return refuse(db, c, doc, 'held_by_another_editor');
      if (override === 'REFRESH_LOCK') await extendEngineLock(db, doc.id);
      else await releaseEngineLock(db, doc.id, lock, slice.participantId);
      return ok();
    });
  });

  return app;
}
