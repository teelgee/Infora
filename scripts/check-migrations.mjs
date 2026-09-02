// The migration journal's ordering guard (minted in review, 2026-09-02).
//
// *In plain terms: the database-change log must be in time order, and no entry
// may claim to come from the future — because the tool that applies changes
// silently skips anything dated earlier than the newest change already
// applied, while still printing "migrations applied clean".*
//
// The failure this exists to stop happened twice in one day: migration 0065's
// hand-written timestamp was ~35 hours in the future, so 0066 — honestly
// dated — was silently skipped on every database that already carried 0065,
// and the first fix moved 0066 one millisecond past 0065, preserving the trap
// for whatever came next. Drizzle's applier compares strictly against the
// newest applied `created_at` and raises nothing on a skip, so the only
// reliable defence is refusing to let a future-dated or out-of-order entry
// into the repository at all.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, '..', 'packages', 'db', 'migrations');
const journal = JSON.parse(readFileSync(path.join(dir, 'meta', '_journal.json'), 'utf8'));

const problems = [];
let previous = null;
for (const entry of journal.entries) {
  if (previous !== null) {
    if (entry.idx !== previous.idx + 1) {
      problems.push(`idx ${entry.idx} (${entry.tag}) does not follow ${previous.idx} — the journal has a gap or a reorder`);
    }
    if (entry.when <= previous.when) {
      problems.push(`${entry.tag} is dated at or before ${previous.tag} — the applier would skip it silently`);
    }
  }
  if (entry.when > Date.now()) {
    problems.push(`${entry.tag} is dated in the future (${new Date(entry.when).toISOString()}) — every later migration generated before that instant would be silently skipped`);
  }
  if (!existsSync(path.join(dir, `${entry.tag}.sql`))) {
    problems.push(`${entry.tag} has a journal entry and no SQL file`);
  }
  previous = entry;
}

if (problems.length > 0) {
  console.error('Migration-journal violations:');
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}
console.log(`Migration journal holds: ${journal.entries.length} entries, ascending, none future-dated, every SQL file present.`);
