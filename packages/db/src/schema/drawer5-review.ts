// Drawer 5 — review, thin in the skeleton (ADR-0005–0014; full cycle is Slice A).
import { jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { participants } from './drawer1-parties.js';
import { containers, versions } from './drawer2-documents.js';

export const drrs = pgTable(
  'drrs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    containerId: uuid('container_id')
      .notNull()
      .references(() => containers.id),
    editLockHolder: text('edit_lock_holder').notNull(), // which side holds the write token (ADR-0014)
  },
  (t) => [uniqueIndex('drrs_one_per_container').on(t.containerId)],
);

// Append-only (trigger, T-008).
export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  drrId: uuid('drr_id')
    .notNull()
    .references(() => drrs.id),
  versionId: uuid('version_id')
    .notNull()
    .references(() => versions.id),
  authorParticipantId: uuid('author_participant_id')
    .notNull()
    .references(() => participants.id),
  body: text('body').notNull(),
  acceptanceCode: text('acceptance_code'),
  anchor: jsonb('anchor'), // page + highlight on the frozen PDF (ADR-0006)
});
