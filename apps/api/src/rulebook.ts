// T-308 — the rulebook's door into org context (ADR-0020, ADR-0048 §4).
//
// THREE THINGS THAT ARE NOT ON THIS SURFACE, each deliberately:
//
//   * **no project.** Org context is portable to every project the
//     organisation touches, so the route is `/organisation/...` like the user
//     picker beside it, and there is no `projectScope` to reach for. A rulebook
//     scoped to a project would be a narrower thing wearing the same name.
//   * **no file kept.** Unlike a sandbox upload, the bytes are not canonical
//     here: what steers the checker is the clause text, and keeping the
//     original would add a blob nothing reads and a deletion obligation
//     nothing needs.
//   * **no delete.** Retire only. A finding written against a rule the firm has
//     since withdrawn still has to resolve to the words it quoted, or the
//     record of that review becomes unreadable.
//
// The tier is `orgRole === 'admin'`, matching `/organisation/users`: this is an
// account-level administrative act, and there is no project seat to check it
// against.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { desc, eq, sql } from 'drizzle-orm';
import type { ApiError, ListRulebooksResponse, RulebookRecord } from '@infora/contracts';
import { loadRulebook, retireRulebook } from '@infora/data';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { extractText } from './extract';
import type { ExtractableFormat } from './extract';
import type { AppEnv } from './requester';
import { z } from 'zod';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const invalid = (c: Context, detail: string) =>
  c.json({ error: 'invalid', detail } satisfies ApiError, 400);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

const formats: Record<string, ExtractableFormat> = {
  docx: 'docx',
  xlsx: 'xlsx',
  pptx: 'pptx',
  pdf: 'pdf',
};

async function records(db: Db, organisationId: string): Promise<RulebookRecord[]> {
  const rows = await db
    .select({
      id: s.rulebooks.id,
      title: s.rulebooks.title,
      sourceFormat: s.rulebooks.sourceFormat,
      loadedAt: s.rulebooks.loadedAt,
      retiredAt: s.rulebooks.retiredAt,
      userId: s.users.id,
      name: s.users.name,
      clauses: sql<number>`count(${s.rulebookClauses.id})::int`,
      labelled: sql<number>`count(${s.rulebookClauses.clause})::int`,
    })
    .from(s.rulebooks)
    .innerJoin(s.users, eq(s.users.id, s.rulebooks.loadedByUserId))
    .leftJoin(s.rulebookClauses, eq(s.rulebookClauses.rulebookId, s.rulebooks.id))
    .where(eq(s.rulebooks.organisationId, organisationId))
    .groupBy(s.rulebooks.id, s.users.id)
    // live first, then most recently retired: the shelf a person reads
    .orderBy(sql`${s.rulebooks.retiredAt} is not null`, desc(s.rulebooks.loadedAt));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    sourceFormat: row.sourceFormat,
    clauses: row.clauses,
    labelled: row.labelled,
    loadedBy: { userId: row.userId, name: row.name },
    loadedAt: row.loadedAt.toISOString(),
    retiredAt: row.retiredAt?.toISOString() ?? null,
  }));
}

export function rulebookRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();

  app.get('/organisation/rulebooks', async (c) => {
    const user = c.get('user');
    if (user.orgRole !== 'admin') return notFound(c);
    return c.json({ items: await records(deps.db, user.organisationId) } satisfies ListRulebooksResponse);
  });

  app.post('/organisation/rulebooks', async (c) => {
    const user = c.get('user');
    if (user.orgRole !== 'admin') return notFound(c);
    const body = await c.req.parseBody().catch(() => null);
    const file = body?.file;
    if (!(file instanceof File)) return invalid(c, 'file_required');
    const format = formats[file.name.split('.').at(-1)?.toLowerCase() ?? ''];
    if (!format) return invalid(c, 'unsupported_format');

    // the same extractor and the same vocabulary of refusal the corpus path
    // uses (T-303). A rulebook nobody can read is refused while the person is
    // still holding the file, for the same reason a corpus document is: the
    // alternative is a manual sitting in org context steering nothing.
    const extracted = extractText(format, Buffer.from(await file.arrayBuffer()));
    if (!extracted.ok) return invalid(c, extracted.reason);

    const loaded = await loadRulebook(deps.db, {
      organisationId: user.organisationId,
      title: typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : file.name.replace(/\.[^.]+$/, ''),
      sourceFormat: format,
      loadedByUserId: user.id,
      text: extracted.text,
    });
    const [record] = (await records(deps.db, user.organisationId)).filter((r) => r.id === loaded.rulebookId);
    return c.json(record!, 201);
  });

  app.delete('/organisation/rulebooks/:rulebookId', async (c) => {
    const user = c.get('user');
    const rulebookId = c.req.param('rulebookId');
    if (user.orgRole !== 'admin' || !isUuid(rulebookId)) return notFound(c);
    // the ceiling is checked in the update's own WHERE, not before it: another
    // organisation's rulebook and a nonexistent one answer identically, which
    // is principle 4 and also the org wall (ADR-0018's floor)
    const retired = await retireRulebook(deps.db, { rulebookId, organisationId: user.organisationId });
    if (!retired) return notFound(c);
    const [record] = (await records(deps.db, user.organisationId)).filter((r) => r.id === rulebookId);
    return c.json(record!);
  });

  return app;
}
