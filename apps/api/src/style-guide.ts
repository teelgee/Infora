// T-397 — the project style guide's door into project context (ADR-0053 §3).
//
// In plain terms: this is where a project's own writing rules are loaded, read
// and retired. Everyone working on the project can read them, because they are
// bound by them; only the client's own super user can change them.
//
// THREE THINGS THIS SURFACE BORROWS FROM THE RULEBOOK'S, and one it does not.
// Borrowed, because each has the same reason here: **no file is kept** (the
// clause text is what steers; the original would be a blob nothing reads and a
// deletion obligation nothing needs), **no delete, retire only** (a finding
// written against a clause the project has since withdrawn still has to resolve
// to the words it quoted), and **the same parser** (two parsers would be two
// answers to what a clause is).
//
// Not borrowed: the SCOPE. A rulebook's route is `/organisation/...` because
// org context is portable to every project the organisation touches. A style
// guide's is `/projects/:projectId/...` because it belongs to the project, and
// that difference is ADR-0021's classification by ownership, not a routing
// preference.
//
// ── WHO MAY LOAD AND AMEND ONE ─────────────────────────────────────────────
//
// **The OWNER organisation's super user, and nobody else.** ADR-0053 §3 says
// the guide is *owner-curated* and *binds every organisation on the project*;
// the record already has the shape for exactly that kind of thing. Whole-
// project configuration — `conflict_attestation_required` (ADR-0046 §8),
// `review_period_default_days` (T-371) — sits on the Project row and is fixed
// by the owner super user, and a document every consultant on the scheme is
// checked against is the same kind of act as those, not a smaller one. So the
// gate is `membershipRole === 'owner'` **and** `Participant.elevated`, the
// T-174 tier.
//
// **Reading is every participant's**, and the asymmetry is deliberate: a rule
// that binds you is a rule you may read, and a style guide nobody but the owner
// can see would produce findings quoting a clause the consultant cannot look
// up. This is not a wall breach — ADR-0053 §9: privacy is a property of the
// source's SCOPE, and a project style guide's scope is the project.
//
// ⚠ **The other half of the governance question was NOT answered here, and is
// `Q-050`**: whether amending a guide mid-project is an event anyone is told
// about. It is a product ruling about the notification set (ADR-0049), not a
// store detail this ticket can settle, and the reversible state is to tell
// nobody — which is what this ships. An amendment is a retire-and-reload, so
// the record already carries who and when if the answer turns out to be yes.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { desc, eq, sql } from 'drizzle-orm';
import type { ApiError, ListStyleGuidesResponse, StyleGuideRecord } from '@infora/contracts';
import { loadStyleGuide, retireStyleGuide } from '@infora/data';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { extractText } from './extract';
import type { ExtractableFormat } from './extract';
import { projectScope } from './requester';
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

async function records(db: Db, projectId: string): Promise<StyleGuideRecord[]> {
  const rows = await db
    .select({
      id: s.projectStyleGuides.id,
      title: s.projectStyleGuides.title,
      sourceFormat: s.projectStyleGuides.sourceFormat,
      loadedAt: s.projectStyleGuides.loadedAt,
      retiredAt: s.projectStyleGuides.retiredAt,
      userId: s.users.id,
      name: s.users.name,
      clauses: sql<number>`count(${s.projectStyleGuideClauses.id})::int`,
      labelled: sql<number>`count(${s.projectStyleGuideClauses.clause})::int`,
    })
    .from(s.projectStyleGuides)
    .innerJoin(s.users, eq(s.users.id, s.projectStyleGuides.loadedByUserId))
    .leftJoin(
      s.projectStyleGuideClauses,
      eq(s.projectStyleGuideClauses.styleGuideId, s.projectStyleGuides.id),
    )
    .where(eq(s.projectStyleGuides.projectId, projectId))
    .groupBy(s.projectStyleGuides.id, s.users.id)
    // live first, then most recently retired: the shelf a person reads
    .orderBy(sql`${s.projectStyleGuides.retiredAt} is not null`, desc(s.projectStyleGuides.loadedAt));
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

export function styleGuideRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  /**
   * The curation gate. `404` for a member organisation and `403` for the
   * owner's own non-elevated participant, and the split is principle 4: a
   * member organisation has no business learning that a curation route exists
   * for a project it does not own, while the owner's own person is told they
   * need the tier — which is something they can act on.
   */
  const mayCurate = (c: Context<AppEnv>): Response | null => {
    const slice = c.get('slice');
    if (slice.membershipRole !== 'owner') return notFound(c);
    if (!slice.elevated) {
      return c.json({ error: 'forbidden', detail: 'super_user_required' } satisfies ApiError, 403);
    }
    return null;
  };

  // Read is every participant's: a rule that binds you is a rule you may read.
  app.get('/projects/:projectId/style-guides', project, async (c) =>
    c.json({
      items: await records(deps.db, c.get('slice').projectId),
    } satisfies ListStyleGuidesResponse),
  );

  app.post('/projects/:projectId/style-guides', project, async (c) => {
    const refused = mayCurate(c);
    if (refused !== null) return refused;
    const body = await c.req.parseBody().catch(() => null);
    const file = body?.file;
    if (!(file instanceof File)) return invalid(c, 'file_required');
    const format = formats[file.name.split('.').at(-1)?.toLowerCase() ?? ''];
    if (!format) return invalid(c, 'unsupported_format');

    // the same extractor and the same vocabulary of refusal the corpus and
    // rulebook paths use (T-303): a guide nobody can read is refused while the
    // person is still holding the file
    const extracted = extractText(format, Buffer.from(await file.arrayBuffer()));
    if (!extracted.ok) return invalid(c, extracted.reason);

    const loaded = await loadStyleGuide(deps.db, {
      projectId: c.get('slice').projectId,
      title:
        typeof body?.title === 'string' && body.title.trim()
          ? body.title.trim()
          : file.name.replace(/\.[^.]+$/, ''),
      sourceFormat: format,
      loadedByUserId: c.get('user').id,
      text: extracted.text,
    });
    const [record] = (await records(deps.db, c.get('slice').projectId)).filter(
      (r) => r.id === loaded.styleGuideId,
    );
    return c.json(record!, 201);
  });

  app.delete('/projects/:projectId/style-guides/:styleGuideId', project, async (c) => {
    const refused = mayCurate(c);
    if (refused !== null) return refused;
    const styleGuideId = c.req.param('styleGuideId');
    if (!isUuid(styleGuideId)) return notFound(c);
    // the ceiling is checked in the update's own WHERE, not before it: another
    // project's guide and a nonexistent one answer identically (principle 4)
    const retired = await retireStyleGuide(deps.db, {
      styleGuideId,
      projectId: c.get('slice').projectId,
    });
    if (!retired) return notFound(c);
    const [record] = (await records(deps.db, c.get('slice').projectId)).filter(
      (r) => r.id === styleGuideId,
    );
    return c.json(record!);
  });

  return app;
}
