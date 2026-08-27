// T-271/T-305 — the locator's raw materials, read in the same query as the
// passage. Both the retrieval path and the evidence read need them, and a
// second hand-written copy of these three expressions is how the two would
// come to disagree about where a citation points — so there is one.
//
// Computed in SQL rather than by selecting `versions.content`: pulling a
// 200-page chapter's full text back to read two small facts about eight chunks
// would be the expensive way round. Postgres `substr` is 1-indexed, hence the
// +1.
//
// **Paragraph and page are the same derivation over different separators**,
// which is the whole reason T-305 added a page locator without adding a
// column. `docxToText` emits exactly one `\n` per `<w:p>`; `pdfToText`
// terminates every page with a form feed. A source carrying no form feed at
// all — every docx — reports no page rather than an invented one.
import { sql } from 'drizzle-orm';
import { schema as s } from '@infora/db';

const PAGE_BREAK = sql`chr(12)`; // the form feed pdfToText writes between pages

export const locatorColumns = {
  startOffset: s.versionChunks.startOffset,
  endOffset: s.versionChunks.endOffset,
  verbatim: sql<string | null>`substr(${s.versions.content}, ${s.versionChunks.startOffset} + 1,
    ${s.versionChunks.endOffset} - ${s.versionChunks.startOffset})`.as('verbatim'),
  paragraph: sql<number | null>`length(left(${s.versions.content}, ${s.versionChunks.startOffset}))
    - length(replace(left(${s.versions.content}, ${s.versionChunks.startOffset}), E'\n', ''))`.as('paragraph'),
  page: sql<number | null>`case when position(${PAGE_BREAK} in ${s.versions.content}) = 0 then null
    else length(left(${s.versions.content}, ${s.versionChunks.startOffset}))
      - length(replace(left(${s.versions.content}, ${s.versionChunks.startOffset}), ${PAGE_BREAK}, ''))
      + 1 end`.as('page'),
};
