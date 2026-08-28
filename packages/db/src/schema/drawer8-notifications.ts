// Drawer 8 — notifications (ADR-0049, T-329).
//
// WHY A DRAWER OF ITS OWN. A notification is not a party, a document, a run, an
// AI output, a review artefact, a classification or a context store — it points
// AT things in four of those drawers and belongs to none of them. Filing it in
// Drawer 5 would have been the near-miss: `round-issued` is a review event, but
// `@-mention` hangs off a sandbox comment (Drawer 2's working area) and
// `record-state-changed-by-another-organisation` off a container, so the table
// would have sat in a drawer two of its three pilot events have nothing to do
// with. The cut here is the one the data model already uses: a drawer is a
// subject area, and "the telling" is its own.
//
// THE ROW STORES NO CONTENT, AND THAT IS THE WHOLE DESIGN (ADR-0049 §3).
// Visibility follows the thing the notification points at, resolved through the
// same path as the subject itself — so a notification is never a channel by
// which a fact reaches someone who could not otherwise reach it (ADR-0018
// applied to a surface nobody thinks of as a data surface). A stored title or
// summary would defeat that at a stroke: it would be a copy of the subject's
// content sitting OUTSIDE the subject's access path, still readable after the
// share that permitted it was revoked. So the row carries a pointer, a time and
// a read state, and every word on screen is resolved live.
//
// TWO COLUMNS ARE DELIBERATELY UNCONSTRAINED TEXT, and it is ADR-0049 §2's
// guard that makes them so: **adding a third event type must not require a
// schema change.** A Postgres enum would break that guard by construction —
// `ALTER TYPE ... ADD VALUE` is a migration. Seeding the deferred `lock-flipped`
// value now would break a different rule, the one T-301 wrote down when it left
// `supersede` out of `elevated_action`: a value the schema carries and no code
// can set is a claim the schema makes falsely. So the vocabulary lives in
// `packages/contracts` — a union the API and every surface are typed against —
// and the store holds the text.
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { participants } from './drawer1-parties.js';

/**
 * One thing a person needs telling, and the pointer to where it can be read.
 *
 * PARTICIPANT GRAIN, not User. Every event in ADR-0049's set is about a project
 * subject, and a Participant is the person-on-a-project the access predicate
 * already resolves (ADR-0033). It also makes the wall rule hold without a
 * second mechanism: a Participant interval that closes on removal stops
 * resolving to a slice, so the notifications go dark in the same act that ends
 * the access — nothing has to remember to sweep them. The project is therefore
 * DERIVED through this column and never duplicated beside it; a second answer
 * to "which project" is a second thing to keep in step.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipientParticipantId: uuid('recipient_participant_id')
      .notNull()
      .references(() => participants.id),
    /** the vocabulary is `NotificationEventType` in @infora/contracts — see the
     * header: an enum here would be the schema change §2's guard forbids */
    eventType: text('event_type').notNull(),
    /**
     * WHAT the subject is, and it is a separate column from `event_type` on
     * purpose. The resolver that decides visibility keys on the KIND, so a new
     * event type over an existing kind (lock-flipped, over a sandbox document)
     * reuses a resolution path that already exists and is already tested,
     * instead of adding a branch to a switch on the event.
     */
    subjectKind: text('subject_kind').notNull(),
    /**
     * DELIBERATELY NOT A FOREIGN KEY. It is polymorphic across four tables in
     * three drawers, and a per-kind FK column would be exactly the schema change
     * §2's guard rules out. The integrity it gives up is bought back by the read
     * path rather than lost: a subject that no longer resolves is a notification
     * that is not visible to anybody, which is the same outcome a cascade would
     * have produced and is the outcome the visibility rule demands anyway.
     */
    subjectId: uuid('subject_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** currency by state: null is unread, and a read notification is never deleted */
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [
    index('notifications_recipient_idx').on(t.recipientParticipantId, t.createdAt),
    index('notifications_subject_idx').on(t.subjectKind, t.subjectId),
  ],
);
