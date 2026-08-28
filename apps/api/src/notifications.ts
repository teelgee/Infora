// T-329 — the notification record's API (ADR-0049).
//
// **The one rule this file exists to hold: a notification's visibility follows
// the thing it points at, always, and never independently (§3).** Every read
// here re-resolves each row's subject through the same access path the subject
// itself is read by, and drops the row when that path returns nothing. So a
// notification is never a channel by which a fact reaches someone who could not
// otherwise reach it — the ethical wall (ADR-0018) applied to a surface nobody
// thinks of as a data surface, which is exactly why it needs a file that says
// so rather than a convention somebody keeps.
//
// TWO CONSEQUENCES OF THAT RULE, both easy to get wrong:
//
//   * **the unread count is not `SELECT count(*)`.** A row whose subject the
//     requester can no longer see is neither listed nor counted, so both come
//     off ONE resolution pass. Counting in SQL and listing in code is how the
//     rail's badge and the rail's list start disagreeing — and the disagreement
//     would be a leak, not a cosmetic bug: a badge counting three when the list
//     shows two says a third thing exists.
//   * **resolution keys on `subject.kind`, never on `event_type`.** §2's guard
//     is that a third event type needs no schema change; keeping the switch on
//     the kind means a new event over an existing kind (lock-flipped, over a
//     sandbox document) needs no new code here either.
//
// ⚠ **Nothing writes a row yet.** T-330 is the emitter and waits on T-323 (the
// SES transport). The record and its surface ship first, deliberately — the
// board's own sequencing note: the acts ship first and the telling follows.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type {
  ApiError,
  ListNotificationsResponse,
  MarkAllNotificationsReadResponse,
  MarkNotificationReadResponse,
  Notification,
  NotificationEventType,
  NotificationSubject,
  NotificationSubjectKind,
} from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { EntitledSlice } from '@infora/governance';
import { canSeeContainer } from './cycle';
import { resolveSlice } from './requester';
import type { AppEnv, UserRow } from './requester';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

/** One row as stored, plus the project it hangs from through its recipient. */
type StoredNotification = {
  id: string;
  eventType: string;
  subjectKind: string;
  subjectId: string;
  createdAt: Date;
  readAt: Date | null;
  projectId: string;
  projectName: string;
};

/**
 * A subject resolved for one requester: the words the surface renders, or
 * `null` meaning "this requester cannot see the thing this points at".
 *
 * `null` is the whole mechanism. It covers three cases with one answer — the
 * wall says no, the subject was deleted, and the id was never valid — which is
 * the same deny-as-nonexistence the API boundary uses everywhere else
 * (contracts principle 4).
 */
type ResolvedSubject = { label: string } | null;

/** The deliverable's name as a person reads it: its coded reference, its work
 * item's title, or both. Never invented — a container with neither resolves to
 * the honest fallback rather than to a guess. */
async function containerLabel(db: Db, containerId: string): Promise<string> {
  const [row] = await db
    .select({ reference: s.containers.documentReference, title: s.workItems.title })
    .from(s.containers)
    .leftJoin(s.workItems, eq(s.workItems.containerId, s.containers.id))
    .where(eq(s.containers.id, containerId))
    .limit(1);
  const parts = [row?.reference, row?.title].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(' — ') : 'a deliverable';
}

/**
 * One resolver per subject kind, and each one reuses the access path its own
 * surface already runs — `canSeeContainer` for the deliverable and its rounds,
 * the sandbox document's organisation for the working area. Nothing here
 * re-implements a wall rule; a second implementation is a second answer, and a
 * wall with two answers is a wall with one bug (component 2's rule).
 *
 * **The labels are deliberately thin.** A subject's NAME is something the
 * requester can already read by following the pointer. Its CONTENT is not: a
 * comment notification says *"a comment on Chapter 7"* and never the comment's
 * text, which is the in-app half of §4's rule about what email may carry — the
 * record is not a place to stage content outside the subject's access path
 * either.
 */
const subjectResolvers: Record<
  NotificationSubjectKind,
  (db: Db, slice: EntitledSlice, id: string) => Promise<ResolvedSubject>
> = {
  round: async (db, slice, id) => {
    const [row] = await db
      .select({ number: s.rounds.number, container: s.containers })
      .from(s.rounds)
      .innerJoin(s.reviewCycles, eq(s.rounds.cycleId, s.reviewCycles.id))
      .innerJoin(s.containers, eq(s.reviewCycles.containerId, s.containers.id))
      .where(eq(s.rounds.id, id))
      .limit(1);
    if (!row) return null;
    if (row.container.projectId !== slice.projectId) return null;
    if (!(await canSeeContainer(db, slice, row.container))) return null;
    return { label: `Round ${row.number} on ${await containerLabel(db, row.container.id)}` };
  },
  container: async (db, slice, id) => {
    const [container] = await db.select().from(s.containers).where(eq(s.containers.id, id)).limit(1);
    if (!container) return null;
    if (container.projectId !== slice.projectId) return null;
    if (!(await canSeeContainer(db, slice, container))) return null;
    return { label: await containerLabel(db, container.id) };
  },
  'sandbox-document': async (db, slice, id) => {
    const [doc] = await db
      .select({
        title: s.sandboxDocuments.title,
        projectId: s.sandboxDocuments.projectId,
        organisationId: s.sandboxDocuments.organisationId,
      })
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, id))
      .limit(1);
    if (!doc || doc.projectId !== slice.projectId) return null;
    // the sandbox is org-private (ADR-0018/0032) — the same check
    // `resourceHomes.sandboxDocument` makes on every sandbox route
    if (doc.organisationId !== slice.organisationId) return null;
    return { label: doc.title };
  },
  'sandbox-comment': async (db, slice, id) => {
    const [row] = await db
      .select({
        title: s.sandboxDocuments.title,
        projectId: s.sandboxDocuments.projectId,
        organisationId: s.sandboxDocuments.organisationId,
      })
      .from(s.sandboxComments)
      .innerJoin(s.sandboxDocuments, eq(s.sandboxComments.sandboxDocumentId, s.sandboxDocuments.id))
      .where(eq(s.sandboxComments.id, id))
      .limit(1);
    if (!row || row.projectId !== slice.projectId) return null;
    if (row.organisationId !== slice.organisationId) return null;
    // the document, never the comment's text — a label is a pointer, not content
    return { label: `a comment on ${row.title}` };
  },
};

/** A stored `subject_kind` the contracts union does not carry is not renderable
 * and is not guessed at: it resolves to nothing, exactly like a subject behind
 * the wall. The store is `text` so §2's guard holds; the vocabulary is still
 * closed at the surface. */
function knownKind(kind: string): kind is NotificationSubjectKind {
  return kind in subjectResolvers;
}

/** Rows for this user, newest first — live Participant intervals only.
 * A notification addressed to an engagement that has ENDED goes dark with the
 * engagement; the interval closing is the same act that ends the access
 * (ADR-0033), so nothing has to remember to sweep them. */
async function storedFor(
  db: Db,
  user: UserRow,
  projectId?: string,
): Promise<StoredNotification[]> {
  return db
    .select({
      id: s.notifications.id,
      eventType: s.notifications.eventType,
      subjectKind: s.notifications.subjectKind,
      subjectId: s.notifications.subjectId,
      createdAt: s.notifications.createdAt,
      readAt: s.notifications.readAt,
      projectId: s.participants.projectId,
      projectName: s.projects.name,
    })
    .from(s.notifications)
    .innerJoin(s.participants, eq(s.notifications.recipientParticipantId, s.participants.id))
    .innerJoin(s.projects, eq(s.participants.projectId, s.projects.id))
    .where(
      and(
        eq(s.participants.userId, user.id),
        isNull(s.participants.removedAt),
        ...(projectId ? [eq(s.participants.projectId, projectId)] : []),
      ),
    )
    .orderBy(desc(s.notifications.createdAt));
}

/**
 * The one resolution pass: stored rows in, visible notifications out.
 *
 * Slices are resolved once per project rather than once per row — the rail's
 * read is across every project the user can reach, and re-resolving access for
 * each notification of the same project would be the same answer computed N
 * times. It is a cache of one request's work, not of an access decision across
 * requests (the T-249 distinction).
 */
async function visibleFor(
  db: Db,
  user: UserRow,
  rows: StoredNotification[],
): Promise<Notification[]> {
  const slices = new Map<string, EntitledSlice | null>();
  const out: Notification[] = [];
  for (const row of rows) {
    if (!slices.has(row.projectId)) {
      slices.set(row.projectId, await resolveSlice(db, user, row.projectId));
    }
    const slice = slices.get(row.projectId);
    if (!slice) continue;
    if (!knownKind(row.subjectKind)) continue;
    const resolved = await subjectResolvers[row.subjectKind](db, slice, row.subjectId);
    if (!resolved) continue;
    const subject: NotificationSubject = {
      kind: row.subjectKind,
      id: row.subjectId,
      label: resolved.label,
    };
    out.push({
      id: row.id,
      eventType: row.eventType as NotificationEventType,
      subject,
      projectId: row.projectId,
      projectName: row.projectName,
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt?.toISOString() ?? null,
    });
  }
  return out;
}

function listResponse(items: Notification[]): ListNotificationsResponse {
  const byProject = new Map<string, { projectId: string; projectName: string; unread: number }>();
  let unread = 0;
  for (const item of items) {
    if (item.readAt !== null) continue;
    unread += 1;
    const entry = byProject.get(item.projectId) ?? {
      projectId: item.projectId,
      projectName: item.projectName,
      unread: 0,
    };
    entry.unread += 1;
    byProject.set(item.projectId, entry);
  }
  return { items, unread, unreadByProject: [...byProject.values()] };
}

export function notificationRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();

  // §6b — the rail's scope: the user's OWN, across every project they can
  // reach, with the project on every row so the surface can group. Without this
  // split a mention on a second project would be silently invisible, because
  // the rail sits beneath a project switcher and would otherwise inherit its
  // scope.
  app.get('/notifications', async (c) => {
    const rows = await storedFor(deps.db, c.get('user'));
    return c.json(listResponse(await visibleFor(deps.db, c.get('user'), rows)));
  });

  // §6b — the "Needs you" panel's scope: this project only. Same resolution,
  // narrower query, so the two surfaces cannot disagree about what is visible.
  app.get('/projects/:projectId/notifications', async (c) => {
    const projectId = c.req.param('projectId');
    if (!isUuid(projectId)) return notFound(c);
    const slice = await resolveSlice(deps.db, c.get('user'), projectId);
    if (!slice) return notFound(c);
    const rows = await storedFor(deps.db, c.get('user'), projectId);
    return c.json(listResponse(await visibleFor(deps.db, c.get('user'), rows)));
  });

  /** Marking read is a read-state write and nothing else: the trigger on the
   * table rejects any UPDATE that touches the event itself. */
  async function markRead(db: Db, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const updated = await db
      .update(s.notifications)
      // idempotent: re-reading keeps the FIRST time, because "when did they see
      // it" is the question the column answers
      .set({ readAt: sql`now()` })
      .where(and(inArray(s.notifications.id, ids), isNull(s.notifications.readAt)))
      .returning({ id: s.notifications.id });
    return updated.length;
  }

  // A notification you cannot SEE is a notification you cannot mark read — the
  // 404 is the same one the list's silence gives, so neither read nor write
  // discloses that a row exists.
  app.post('/notifications/:id/read', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) return notFound(c);
    const rows = (await storedFor(deps.db, c.get('user'))).filter((r) => r.id === id);
    const [visible] = await visibleFor(deps.db, c.get('user'), rows);
    if (!visible) return notFound(c);
    await markRead(deps.db, [visible.id]);
    const [fresh] = await visibleFor(
      deps.db,
      c.get('user'),
      (await storedFor(deps.db, c.get('user'))).filter((r) => r.id === id),
    );
    if (!fresh) return notFound(c);
    return c.json({ notification: fresh } satisfies MarkNotificationReadResponse);
  });

  // Mark-all, at both of §6b's scopes — the rail clears everything the user can
  // see, the panel clears its own project. Both go through the SAME visibility
  // pass as the list, so "mark all read" can never touch a row the requester
  // was not shown.
  app.post('/notifications/read-all', async (c) => {
    const visible = await visibleFor(deps.db, c.get('user'), await storedFor(deps.db, c.get('user')));
    const read = await markRead(deps.db, visible.filter((n) => n.readAt === null).map((n) => n.id));
    return c.json({ read } satisfies MarkAllNotificationsReadResponse);
  });

  app.post('/projects/:projectId/notifications/read-all', async (c) => {
    const projectId = c.req.param('projectId');
    if (!isUuid(projectId)) return notFound(c);
    const slice = await resolveSlice(deps.db, c.get('user'), projectId);
    if (!slice) return notFound(c);
    const visible = await visibleFor(
      deps.db,
      c.get('user'),
      await storedFor(deps.db, c.get('user'), projectId),
    );
    const read = await markRead(deps.db, visible.filter((n) => n.readAt === null).map((n) => n.id));
    return c.json({ read } satisfies MarkAllNotificationsReadResponse);
  });

  return app;
}
