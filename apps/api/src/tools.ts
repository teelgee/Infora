// T-334 — the Tools section stops being an empty state (Slice V1-T).
//
// *In plain terms: the rail has carried a "Tools" item since the skeleton, and
// its own copy recorded why it was empty. This endpoint is the list that fills
// it — the standalone things a consultant can open and run.*
//
// 🔒 **ASSEMBLED, NOT FILTERED.** T-269's rule applies to tools exactly as it
// does to workers: a tool the requester cannot use is **absent**, never
// disabled, so the section can never advertise a capability the viewer has no
// way to reach. The set is built per request from the same assembled worker set
// the classifier is handed, and there is no `enabled` flag anywhere here.
//
// **Infora-standard tools only.** Org-built and user-built tools are the
// builder, `Q-014`, and stay post-V1.
//
// **V1's set is three, and only one of them is a tile here** (ADR-0053 §11):
//
//   • the **document creator** — built (T-309), and available to anyone whose
//     assembled set carries `document_builder`;
//   • the **QA checker** — ✅ **built 2026-08-31 (T-336)**, and the tile flips
//     from `unbuilt` to `available` in that ticket's own commit. It carried a
//     `waitsOn` naming T-336 by name, which is exactly the copy that goes stale
//     silently if the flip is left to a later tidy-up;
//   • the **extractor** — deliberately absent altogether. Its tool is
//     unspecified and is `Q-049`: nothing says what a user picks, how a run is
//     scoped, or where the output lands. A tile promising a screen nobody has
//     designed is worse than no tile, and the fog note is the record.
import { Hono } from 'hono';
import type { ListToolsResponse, ToolSummary, Id } from '@infora/contracts';
import type { Db } from '@infora/db';
import type { WorkerRegistry } from '@infora/capabilities';
import type { WorkflowRegistry } from '@infora/workflows';
import { DOCUMENT_CREATION_WORKFLOW } from './document-creation';
import { QA_CHECK_WORKFLOW } from './qa-check';
import { disabledAiFeatures } from './ai-features';
import { projectScope } from './requester';
import type { AppEnv } from './requester';

export function toolRoutes(deps: {
  db: Db;
  workflows?: WorkflowRegistry;
  workers?: WorkerRegistry;
  authorityShelf?: (organisationId: Id) => Promise<boolean>;
}) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  app.get('/projects/:projectId/tools', project, async (c) => {
    const slice = c.get('slice');
    const assembled =
      deps.workers?.assemble({
        slice,
        tier: 'standard',
        authorityShelf: (await deps.authorityShelf?.(slice.organisationId)) ?? false,
      }) ?? [];
    const entitled = new Set(assembled.map((worker) => worker.name));
    // T-463 — a feature the project has switched off is ABSENT, as a worker the
    // requester cannot use is: same rule, one more filter beneath the tier
    const off = await disabledAiFeatures(deps.db, slice.projectId);

    const items: ToolSummary[] = [];

    // The creator is present only where BOTH hold: this deployment carries the
    // declared workflow, and this requester is entitled to the capability it
    // names. Either missing makes the tool absent rather than broken — a tile
    // that launches a run the executor would refuse is a promise the product
    // cannot keep.
    if (
      deps.workflows?.get(DOCUMENT_CREATION_WORKFLOW) !== undefined &&
      entitled.has('document_builder') &&
      !off.has('document_creator')
    ) {
      items.push({
        id: DOCUMENT_CREATION_WORKFLOW,
        label: 'Document creator',
        description:
          'Build a document’s structure, say what each section is for, and choose the library sources it draws on — before anything is drafted.',
        state: 'available',
        href: `/projects/${slice.projectId}/tools/document-creation`,
      });
    }

    // The checker is present on the same two conditions the creator is: this
    // deployment carries the declared workflow, AND this requester is entitled
    // to the capability it names. Either missing makes the tool absent rather
    // than broken — a tile that launches a run the executor would refuse is a
    // promise the product cannot keep.
    if (
      deps.workflows?.get(QA_CHECK_WORKFLOW) !== undefined &&
      entitled.has('qa_section_check') &&
      !off.has('qa_checker')
    ) {
      items.push({
        id: QA_CHECK_WORKFLOW,
        label: 'QA checker',
        description:
          'Check a draft against the project style guide, your firm’s own rules and the project library, and get anchored findings you accept or reject one at a time.',
        state: 'available',
        href: `/projects/${slice.projectId}/tools/qa-check`,
      });
    }

    return c.json({ items } satisfies ListToolsResponse);
  });

  return app;
}
