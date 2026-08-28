// T-329 — the notification record (ADR-0049), the typed half of Drawer 8.
//
// **This file is where the event vocabulary lives, and that is a design
// decision rather than a filing one.** ADR-0049 §2 guards the record with a
// hard test — *adding a third event type must not require a schema change* — so
// `notifications.event_type` and `notifications.subject_kind` are `text` in the
// store, and the closed sets are these unions. A Postgres enum would fail the
// guard by construction (`ALTER TYPE … ADD VALUE` is a migration); seeding the
// deferred `lock-flipped` value into one would fail the other rule, the one
// T-301 wrote down when it left `supersede` out of `elevated_action` — a value
// the schema carries and no code can set is a claim the schema makes falsely.
//
// **Nothing here carries content, and that is §3 and §4 in a type.** A
// notification is a pointer; its `subject.label` is resolved LIVE from the
// subject on every read, through the same access path as the subject itself, so
// a notification is never a channel by which a fact reaches someone who could
// not otherwise reach it. A stored label would sit outside that path and still
// read after the share that permitted it was revoked.

import type { Id } from './shared';

/**
 * The pilot set, and only the pilot set (ADR-0049 §2, as amended 2026-08-27).
 *
 * `lock-flipped` is deliberately ABSENT: it is deferred, it fires far more often
 * than the other three, and declaring it here would let a surface render a case
 * nothing produces. When it lands it is one member added to this union and one
 * emitter — no migration, no new subject kind, which is the guard passing.
 *
 * ⚠ **T-329 builds the record; T-330 emits.** Nothing in the platform writes a
 * notification row yet — T-330 waits on T-323 (the SES transport) and therefore
 * on external lead time. The acts ship first and the telling follows.
 */
export type NotificationEventType =
  /** a review round was issued to you (ADR-0049 §2 — the named failure) */
  | 'round-issued'
  /** you were `@`-mentioned in a sandbox comment (T-112 stores them already) */
  | 'mention'
  /** a deliverable of your organisation's was withdrawn or superseded by
   * someone else's act — never by your own promotion (the 2026-08-27 amendment) */
  | 'record-state-changed-by-another-organisation';

/**
 * What the notification points at — **separate from the event type on purpose**.
 *
 * The resolver that decides visibility keys on the KIND, so a new event type
 * over an existing kind (`lock-flipped`, over a `sandbox-document`) reuses a
 * resolution path that already exists and is already tested, instead of adding
 * a branch to a switch on the event.
 */
export type NotificationSubjectKind =
  | 'round'
  | 'container'
  | 'sandbox-document'
  | 'sandbox-comment';

/**
 * The subject, **resolved**: its id, and the words the surface renders.
 *
 * `label` is derived on every read and stored nowhere — *"Chapter 7 — Noise and
 * Vibration"*, never the comment's text, never a finding's text, never a quoted
 * rulebook clause. It is what the subject is CALLED, which the requester can
 * already read by following the pointer, and nothing more.
 */
export type NotificationSubject = {
  kind: NotificationSubjectKind;
  id: Id;
  label: string;
  /**
   * **Where following the pointer lands**, resolved server-side in domain terms
   * — never a URL, which would put a surface's routing table inside the API.
   *
   * It exists because most subjects are not openable at their own grain: a
   * round lives on a deliverable's cycle screen and a comment lives on its
   * document, so a client holding only `{kind, id}` would have to join its way
   * back to something it can open — a second traversal, outside the access path
   * that just decided this row was visible. Resolving it here keeps the rule
   * from ADR-0049 §3 whole: one pass decides both *whether* you may see it and
   * *what* it points at.
   */
  opens: { kind: 'container' | 'sandbox-document'; id: Id };
};

export type Notification = {
  id: Id;
  eventType: NotificationEventType;
  subject: NotificationSubject;
  /** derived through the recipient's Participant — never a stored column */
  projectId: Id;
  projectName: string;
  createdAt: string;
  /** null is unread; a read notification is never deleted */
  readAt: string | null;
};

/**
 * The list, and the count, **from one call** — which is a consequence of §3
 * rather than a convenience.
 *
 * Because visibility is re-resolved per row against the live access path, the
 * unread count is not a `SELECT count(*)`: a row whose subject the requester
 * can no longer see is neither listed nor counted. Resolving twice — once to
 * count and once to list — is how the badge and the list start disagreeing, so
 * both come off the same resolution.
 *
 * `items` are newest first. Grouping by project is the surface's job and the
 * data for it is on every row (§6b: the rail is the user's own across every
 * project they can reach, grouped by project; the panel is scoped to one).
 */
export type ListNotificationsResponse = {
  items: Notification[];
  unread: number;
  /** per project, for the rail's grouped list. Absent projects have no rows. */
  unreadByProject: Array<{ projectId: Id; projectName: string; unread: number }>;
};

/** POST /notifications/:id/read — idempotent; re-reading keeps the first time. */
export type MarkNotificationReadResponse = { notification: Notification };

/** POST /notifications/read-all — everything the requester can currently SEE.
 * Scoped to one project when `projectId` is given, which is the "Needs you"
 * panel's own control; unscoped it is the rail's. */
export type MarkAllNotificationsReadResponse = { read: number };
