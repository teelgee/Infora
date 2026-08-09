// T-364 (S6, ADR-0040 addendum 2026-08-09) — the structure builder's agent:
// the SECOND embedded assistive agent, on T-337's pattern and ADR-0027's
// propose-confirm rule. A super-user's free-form ask ("a structure for these
// disciplines, with these sub-areas") becomes a CANDIDATE tree that fills the
// existing interactive builder; the super-user edits it and confirms; the
// existing deterministic endpoint executes.
//
// Three properties this file exists to keep:
//   1. It PROPOSES and never writes — no folder is created here (ADR-0027).
//   2. It reads NO sandbox content — not a folder name, not a document, not a
//      title. `Q-020` (whether sandbox material may enter agent context) stays
//      untouched, which is what lets this ship while that question is open.
//   3. Its only project input is the OWNING organisation's plan disciplines,
//      which the deterministic seed (T-363) already derives from — plan data
//      the requester can read anyway (an owner-side super-user reaching a
//      guest's sandbox already reads every organisation's plan, ADR-0008; a
//      guest reads only its own), never sandbox material.
import { and, eq } from 'drizzle-orm';
import type { FolderStructureNode, ProposeFolderStructureResult } from '@infora/contracts';
import { folderStructureNode } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { Router } from '@infora/model';

const MAX_NODES = 200; // the deterministic endpoint's own cap (T-182)

const SYSTEM = [
  'You lay out folder structures for an engineering consultancy’s working area on a construction project.',
  'Answer with JSON only, no prose around it, in exactly this shape:',
  '{"nodes":[{"name":"Environmental","children":[{"name":"Ecology"}]}],"followUp":null}',
  'Rules:',
  '- Every node needs a short, human folder name. No numbering, no codes, no dates.',
  '- Nest only where the ask implies it. Two levels is usually enough, three at most.',
  `- At most ${MAX_NODES} folders in total.`,
  '- If the ask is too vague to shape a tree from, return {"nodes":[],"followUp":"<one short question>"}.',
  '- Never invent document names or content — folders only.',
].join('\n');

/** Every node at every depth — the same total the deterministic endpoint caps. */
function countNodes(nodes: FolderStructureNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countNodes(node.children ?? []), 0);
}

/** Strip a fenced code block if the model wrapped its JSON in one. */
function unfence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced?.[1] ?? text).trim();
}

/** Parse the model's answer into a candidate tree. Anything unparseable
 * becomes a followUp rather than an error: an assistive agent that cannot
 * shape a tree should ask, not fail the surface (ADR-0027's propose half). */
export function parseProposal(text: string): ProposeFolderStructureResult {
  const asked = {
    nodes: [],
    followUp: 'I could not shape a structure from that — what disciplines or work areas should it cover?',
  } satisfies ProposeFolderStructureResult;
  try {
    // the WHOLE parse sits inside the catch, not just JSON.parse: zod's
    // safeParse converts validation issues to a result but lets a host
    // RangeError through, and a deeply nested answer would otherwise escape
    // this function as a 500 rather than becoming a question
    const raw: unknown = JSON.parse(unfence(text));
    if (typeof raw !== 'object' || raw === null) return asked;
    const candidate = raw as { nodes?: unknown; followUp?: unknown };
    const parsed = folderStructureNode.array().safeParse(candidate.nodes ?? []);
    if (!parsed.success) return asked;
    const followUp =
      typeof candidate.followUp === 'string' && candidate.followUp.trim() !== ''
        ? candidate.followUp.trim()
        : null;
    if (parsed.data.length === 0) return { nodes: [], followUp: followUp ?? asked.followUp };
    if (countNodes(parsed.data) > MAX_NODES) {
      return {
        nodes: [],
        followUp: `That would be more than ${MAX_NODES} folders — which part of the work should it cover?`,
      };
    }
    return { nodes: parsed.data, followUp };
  } catch {
    return asked;
  }
}

/** The organisation's own live plan disciplines — the same source the
 * deterministic seed uses (T-363), passed as context so a free-form ask lands
 * in this project's vocabulary rather than a generic one. */
export async function planDisciplines(
  db: Db,
  projectId: string,
  organisationId: string,
): Promise<string[]> {
  const rows = await db
    .select({ metadata: s.containers.metadata })
    .from(s.containers)
    .where(
      and(
        eq(s.containers.projectId, projectId),
        eq(s.containers.scope, 'library'),
        eq(s.containers.producingOrganisationId, organisationId),
        eq(s.containers.state, 'live'),
      ),
    );
  const codes = new Set<string>();
  for (const row of rows) {
    const value = (row.metadata as Record<string, unknown>)['discipline'];
    if (typeof value === 'string' && value.trim() !== '') codes.add(value.trim());
  }
  return [...codes].sort();
}

export async function proposeStructure(
  router: Router,
  ask: string,
  disciplines: string[],
): Promise<ProposeFolderStructureResult> {
  const context =
    disciplines.length > 0
      ? `The organisation's own deliverables plan uses these discipline codes: ${disciplines.join(', ')}.`
      : 'The organisation has no disciplined plan rows yet.';
  const result = await router.chat('draft', {
    system: SYSTEM,
    messages: [{ role: 'user', content: `${context}\n\nThe ask: ${ask}` }],
    maxTokens: 1200,
  });
  return parseProposal(result.text);
}
