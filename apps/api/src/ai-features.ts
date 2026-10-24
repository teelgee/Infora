// T-463 — THE AI TRANSPARENCY TABLE, and the per-project feature switch.
//
// *In plain terms: one page says, for every AI feature on the project, what it
// reads, what it may write, where it runs, what it keeps, and that it never
// trains on the project's data. Beside each row the owner's super user can
// turn the feature off for this project — saying why — and every throw of the
// switch is kept with their name. A switched-off feature is absent from every
// launcher and its endpoint refuses in words; it is never greyed out.*
//
// The registry below is the one place the facts are written, beside the code
// they describe; the page renders it and the export prints it, so a row cannot
// drift from the feature it names without the drift being visible in one diff.
// Where every call runs comes from the router's own enforced posture
// (ADR-0037), never from copy.
//
// The switch sits BENEATH the tier and the requester's entitlement and only
// narrows reach (ADR-0037 addendum): nothing here turns on what those refuse.
// Every throw is an append-only row — ADR-0030 §6's rule for a rails change.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { AI_FEATURE_KEYS, setAiFeatureBody } from '@infora/contracts';
import type { AiFeatureKey, AiFeatureRow, AiTransparencyResponse, ApiError } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { EntitledSlice } from '@infora/governance';
import type { Router } from '@infora/model';
import { textToDocx, mimeTypes } from './renditions';
import { projectScope } from './requester';
import type { AppEnv } from './requester';

type Facts = Omit<AiFeatureRow, 'enabled' | 'lastChange'>;

/** the registry: what each feature is, in the words the page shows */
export const AI_FEATURES: ReadonlyArray<Facts> = [
  {
    key: 'ask',
    label: 'Ask',
    where: 'The Ask screen; the Ask bar on the project home',
    reads: 'The project library within your reach, your organisation’s own rulebooks and the project style guide, and any sources you attach; nothing another organisation has not shared with you',
    mayWrite: 'Nothing to the record. An answer is shown to you and kept as a run',
    keeps: 'The run record — your question, what was read, the answer and its citations — kept by your organisation (ADR-0028); the project owner never sees it',
    trains: 'never',
    switchable: true,
  },
  {
    key: 'drafting',
    label: 'Drafting in the editor',
    where: 'The editor’s agent thread beside a working document',
    reads: 'The working document, the project library within your reach, the rulebooks and style guide that bind the draft, and attached sources',
    mayWrite: 'Only a suggestion, which lands in the document when a person accepts it (ADR-0048); where the record cannot support a sentence it says so',
    keeps: 'The run and the suggestion with who accepted, edited or rejected it, kept by your organisation',
    trains: 'never',
    switchable: true,
  },
  {
    key: 'document_creator',
    label: 'Document creator',
    where: 'Tools',
    reads: 'The sources you choose from the library and the outline you set; the rulebook and style guide',
    mayWrite: 'A new working document in your organisation’s sandbox, section by section, every paragraph cited or marked as a gap',
    keeps: 'The plan you confirmed, the run and the sources it read, kept by your organisation',
    trains: 'never',
    switchable: true,
  },
  {
    key: 'qa_checker',
    label: 'QA checker',
    where: 'Tools; the “Check this draft” button in the editor',
    reads: 'The working document you choose and the rules that bind it (the style guide’s rule set, your organisation’s rulebook)',
    mayWrite: 'Findings against the document, each anchored to a passage; it changes no text',
    keeps: 'The findings and the run, kept by your organisation and shown to the document’s team',
    trains: 'never',
    switchable: true,
  },
  {
    key: 'structure_builder',
    label: 'Folder structure builder',
    where: 'A sandbox’s folder structure, for the organisation’s super user',
    reads: 'What you ask for and the plan’s disciplines',
    mayWrite: 'A proposed folder tree, created only when you accept it',
    keeps: 'Nothing beyond the folders you accept',
    trains: 'never',
    switchable: true,
  },
  {
    key: 'rule_extraction',
    label: 'Rule extraction from a style guide',
    where: 'Knowledge — a project style guide’s rule set',
    reads: 'The style guide’s own clauses',
    mayWrite: 'A proposed rule set, in force only when the owner accepts it (ADR-0054)',
    keeps: 'The proposal, who accepted or declined it, and the accepted set’s versions',
    trains: 'never',
    switchable: true,
  },
  {
    key: 'reference_intake',
    label: 'Reference-material intake',
    where: 'The library — the intake screen for reference material you have just added',
    reads: 'The first few pages of each file the project owner’s super user uploads, and the project’s own classification vocabulary; never another project’s material',
    mayWrite: 'Only a proposed title and classification, which become the document’s own when a person confirms them; nothing is read by any run until then',
    keeps: 'The proposal run, and who confirmed what, kept by the owner organisation (ADR-0011)',
    trains: 'never',
    switchable: true,
  },
  {
    key: 'app_builder',
    label: 'App builder',
    where: 'Apps — the building screen’s conversation',
    reads: 'What you say to it and the app’s own shape so far; never a project document',
    mayWrite: 'The app’s tables and screens, as you confirm them (ADR-0056)',
    keeps: 'The build conversation, readable only by your organisation',
    trains: 'never',
    switchable: true,
  },
  {
    key: 'app_insights',
    label: 'App insights',
    where: 'Apps — a run on an app',
    reads: 'The app’s rows the person who pressed Run may read',
    mayWrite: 'An insight on the app, readable by the organisation that ran it and the project owner',
    keeps: 'The run and its insight',
    trains: 'never',
    switchable: true,
  },
];

/** the substrate row — stated on the page, never switchable */
const INDEX_ROW = {
  label: 'Search and the retrieval index',
  where: 'Every register’s search box, and under every feature above',
  reads: 'Each published version of the project library, and your organisation’s own working documents only for your organisation',
  mayWrite: 'Nothing. It indexes; it does not author',
  keeps: 'Passages and their vectors under the pinned embedding model (ADR-0024), deleted when the document is erased',
  trains: 'never' as const,
};

const isKey = (v: string): v is AiFeatureKey => (AI_FEATURE_KEYS as readonly string[]).includes(v);
const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const forbidden = (c: Context, detail: string) => c.json({ error: 'forbidden', detail } satisfies ApiError, 403);
const invalid = (c: Context) => c.json({ error: 'invalid' } satisfies ApiError, 400);

/** the features switched off on a project — the newest row per feature decides */
export async function disabledAiFeatures(db: Db, projectId: string): Promise<Set<AiFeatureKey>> {
  const rows = await db
    .select({ feature: s.aiFeatureSwitches.feature, enabled: s.aiFeatureSwitches.enabled })
    .from(s.aiFeatureSwitches)
    .where(eq(s.aiFeatureSwitches.projectId, projectId))
    .orderBy(desc(s.aiFeatureSwitches.changedAt));
  const seen = new Set<string>();
  const off = new Set<AiFeatureKey>();
  for (const r of rows) {
    if (seen.has(r.feature)) continue;
    seen.add(r.feature);
    if (!r.enabled && isKey(r.feature)) off.add(r.feature);
  }
  return off;
}

/** the gateway's one-line guard: null to proceed, or the refusal to return */
export async function refuseIfOff(c: Context, db: Db, projectId: string, feature: AiFeatureKey): Promise<Response | null> {
  const off = await disabledAiFeatures(db, projectId);
  if (!off.has(feature)) return null;
  return c.json(
    { error: 'forbidden', detail: 'ai_feature_off', message: `${AI_FEATURES.find((f) => f.key === feature)?.label ?? feature} is switched off on this project.` },
    403,
  );
}

const mayConfigure = (slice: EntitledSlice) => slice.membershipRole === 'owner' && slice.elevated;

export function aiFeatureRoutes(deps: { db: Db; router: Router }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  const tier = () => {
    const p = deps.router.posture;
    return { tier: p.tier, region: [...p.region], retention: [...p.retention], jurisdiction: [...p.jurisdiction] };
  };

  async function table(projectId: string, slice: EntitledSlice): Promise<AiTransparencyResponse> {
    const rows = await deps.db
      .select({
        feature: s.aiFeatureSwitches.feature,
        enabled: s.aiFeatureSwitches.enabled,
        reason: s.aiFeatureSwitches.reason,
        at: s.aiFeatureSwitches.changedAt,
        name: s.users.name,
      })
      .from(s.aiFeatureSwitches)
      .innerJoin(s.participants, eq(s.participants.id, s.aiFeatureSwitches.changedByParticipantId))
      .innerJoin(s.users, eq(s.users.id, s.participants.userId))
      .where(eq(s.aiFeatureSwitches.projectId, projectId))
      .orderBy(desc(s.aiFeatureSwitches.changedAt));
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!latest.has(r.feature)) latest.set(r.feature, r);
    return {
      tier: tier(),
      features: AI_FEATURES.map((f) => {
        const last = latest.get(f.key);
        return {
          ...f,
          enabled: last ? last.enabled : true,
          lastChange: last ? { name: last.name, at: last.at.toISOString(), reason: last.reason, enabled: last.enabled } : null,
        };
      }),
      mayConfigure: mayConfigure(slice),
      history: rows
        .filter((r) => isKey(r.feature))
        .map((r) => ({ key: r.feature as AiFeatureKey, enabled: r.enabled, reason: r.reason, name: r.name, at: r.at.toISOString() })),
    };
  }

  // the project's table, with its switches and their history — everyone on the project
  app.get('/projects/:projectId/ai-transparency', project, async (c) => {
    const slice = c.get('slice');
    return c.json(await table(slice.projectId, slice));
  });

  // the workspace's table: the deployment's facts, no project and no switch
  app.get('/ai-transparency', (c) => {
    const body: AiTransparencyResponse = {
      tier: tier(),
      features: AI_FEATURES.map((f) => ({ ...f, enabled: true, lastChange: null })),
      mayConfigure: false,
      history: [],
    };
    return c.json(body);
  });

  // the switch: the owner's super user, with a reason; append-only
  app.put('/projects/:projectId/ai-features/:feature', project, async (c) => {
    const slice = c.get('slice');
    const feature = c.req.param('feature');
    if (!isKey(feature)) return notFound(c);
    if (!mayConfigure(slice)) return forbidden(c, 'owner_super_user_required');
    const body = setAiFeatureBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    await deps.db.insert(s.aiFeatureSwitches).values({
      projectId: slice.projectId,
      feature,
      enabled: body.data.enabled,
      reason: body.data.reason,
      changedByParticipantId: slice.participantId,
    });
    return c.json(await table(slice.projectId, slice));
  });

  // the table as a document, for the owner organisation's own file
  app.get('/projects/:projectId/ai-transparency/export', project, async (c) => {
    const slice = c.get('slice');
    const t = await table(slice.projectId, slice);
    const [projectRow] = await deps.db.select({ name: s.projects.name }).from(s.projects).where(eq(s.projects.id, slice.projectId)).limit(1);
    const lines: string[] = [
      `How the AI works here — ${projectRow?.name ?? 'this project'}`,
      `Exported ${new Date().toISOString().slice(0, 10)}`,
      '',
      `Where every call runs: the ${t.tier.tier} tier — region ${t.tier.region.join(', ')}; retention ${t.tier.retention.join(', ')}; jurisdiction ${t.tier.jurisdiction.join(', ')}. No model is ever trained on this project's data (ADR-0026).`,
      '',
    ];
    for (const f of t.features) {
      lines.push(`${f.label} — ${f.enabled ? 'on' : 'OFF'}`);
      lines.push(`  Where you meet it: ${f.where}`);
      lines.push(`  What it reads: ${f.reads}`);
      lines.push(`  What it may write: ${f.mayWrite}`);
      lines.push(`  What it keeps: ${f.keeps}`);
      lines.push(`  Trains on project data: never`);
      if (f.lastChange) lines.push(`  Last switched ${f.lastChange.enabled ? 'on' : 'off'} by ${f.lastChange.name} on ${f.lastChange.at.slice(0, 10)}: ${f.lastChange.reason}`);
      lines.push('');
    }
    lines.push(`${INDEX_ROW.label} — always on`);
    lines.push(`  Where you meet it: ${INDEX_ROW.where}`);
    lines.push(`  What it reads: ${INDEX_ROW.reads}`);
    lines.push(`  What it may write: ${INDEX_ROW.mayWrite}`);
    lines.push(`  What it keeps: ${INDEX_ROW.keeps}`);
    lines.push(`  Trains on project data: never`);
    if (t.history.length > 0) {
      lines.push('', 'Switch history');
      for (const h of t.history) lines.push(`  ${h.at.slice(0, 16).replace('T', ' ')} — ${h.name} turned ${AI_FEATURES.find((f) => f.key === h.key)?.label ?? h.key} ${h.enabled ? 'on' : 'off'}: ${h.reason}`);
    }
    const bytes = textToDocx(lines.join('\n'));
    c.header('content-type', mimeTypes.docx);
    c.header('content-disposition', `attachment; filename="how-the-ai-works-here.docx"`);
    return c.body(new Uint8Array(bytes));
  });

  return app;
}

export { INDEX_ROW as AI_INDEX_ROW };
