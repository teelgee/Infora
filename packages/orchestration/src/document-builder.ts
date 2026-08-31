// T-280 — `document_builder`, the implementation.
//
// It lives here rather than in `capabilities` because it WRITES: it needs a
// `Db` for the document row and for the two live access facts the label rests
// on, and `capabilities` holds no `Db` by design. The declaration and the
// prompt stay beside the other workers; only the half that touches a store is
// here. That is the same split `createDraftLeaf` already makes.
//
// **Three things are new against the chain's existing `document` mode**, which
// already drafts grounded-only into a sandbox and withholds unsourced claims:
// the TEMPLATE, the MANIFEST, and the LABEL.
//
//   • the template is an outline the draft is written into, so a built
//     document has a shape somebody declared rather than whatever the model
//     produced;
//   • the manifest records what each source was USED FOR, which is the
//     difference between "these documents were in scope" and "this paragraph
//     rests on this document";
//   • the label is the EVIDENCE THAT PROPAGATION HAPPENED (finding F2). A write
//     path that refused correctly and reported nothing is indistinguishable
//     downstream from one that never checked.
//
// **The builder does not retrieve.** Its sources are version ids it was handed.
// It still reaches their text only through the assembly gateway — a worker with
// a second path to the store bypasses the wall — and a named source the gateway
// did not return is REPORTED, never silently dropped: the caller asked about it.
import { eq } from 'drizzle-orm';
import type { Assemble, AssembledItem, Id } from '@infora/contracts';
import { composeTemplatePrompt } from '@infora/capabilities';
import type { TemplateRegistry } from '@infora/capabilities';
import { parseClaims } from '@infora/capabilities';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { checkPropagation, groundCheck } from '@infora/governance';
import type { AccessLabel } from '@infora/governance';
import { sandboxAudience, versionsAudience } from '@infora/knowledge';
import { costOf } from '@infora/model';
import type { ModelRates, Router } from '@infora/model';

export type DocumentBuilderInput = {
  templateId: string;
  brief: string;
  /** EXPLICIT, never "whatever you find" — the builder does not search */
  sources: { versionIds: Id[] };
  destination: { sandboxId: Id; title: string };
};

/**
 * The bucket a drafted sentence lands in when it matched none of the template's
 * heading lines (T-402).
 *
 * It is a `usedFor` value the manifest can carry, **not a section**: nothing
 * filed under it is written into the document, so any count of "sections
 * written" that includes it overstates. Named here rather than spelled as a
 * string at each site, because the miscount happened at a site that had no way
 * of knowing the string was special.
 */
export const UNSECTIONED = 'unsectioned';

/** One source, and what it was used for — the whole point of a manifest. */
export type ManifestEntry = {
  versionId: Id;
  documentReference: string | null;
  versionReference: string | null;
  locator: AssembledItem['locator'];
  /** the template section whose text rests on this source */
  usedFor: string;
};

export type DocumentBuilderOutput = {
  /** null where the write was withheld — the label refused it */
  documentId: Id | null;
  manifest: ManifestEntry[];
  label: {
    computedLabel: AccessLabel;
    /** the source that SET the computed label, named so the refusal is actionable */
    mostRestrictiveInput: Id | null;
    destinationLabel: AccessLabel;
    /** absent when the write was allowed */
    refusal?: string;
  };
  /** claims that resolved to no source and were not written */
  withheld: string[];
  /**
   * T-274's rule, applied here: a named source the gateway did not return is
   * reported rather than dropped. It is either out of reach or nothing in it
   * matched the brief, and both are facts the caller asked for.
   */
  unreachableSources: Id[];
  /**
   * T-402 — how many grounded sentences the drafting call wrote **outside the
   * outline**, matching none of the template's headings, and which the assembly
   * therefore did not write into the document.
   *
   * Reported rather than dropped, in the same spirit as `withheld` and
   * `unreachableSources`: it is material the run produced and the document does
   * not contain, which is exactly the kind of absence the document itself
   * cannot show.
   */
  outsideOutline: number;
  /**
   * T-396 — what the drafting call spent, so the executor can record it on the
   * Step row it opened. **Absent where no model call was made** — a refused
   * write and a brief that reached no passages both return before the router is
   * touched — and absent is not zero: an unpriced or un-made call must never
   * read as a free one (T-254).
   */
  usage?: { tokensPrompt: number; tokensCompletion: number; cost: number | null };
  model?: { id: string; version: string };
};

export class UnknownDocumentTemplate extends Error {
  constructor(id: string, available: string[]) {
    super(`no document template "${id}" — this deployment has: ${available.join(', ')}`);
    this.name = 'UnknownDocumentTemplate';
  }
}

export type DocumentBuilderDeps = {
  db: Db;
  router: Router;
  assemble: Assemble;
  templates: TemplateRegistry;
  /** T-396 — provider rates per model id, as the draft leaf takes them. Absent
   *  records `cost: null` — unpriced, and reported as such. */
  rates?: ModelRates;
};

// T-396 — COST ATTRIBUTION ARRIVED, exactly as this comment predicted it would.
// A cost is recorded on a Step row and the row is opened by the executor; until
// the executor rule (ADR-0053 §7) nothing executed this worker as a step, so
// there was no row to record one on. The builder now reports what its drafting
// call spent and the executor's adapter writes it.

export function createDocumentBuilder(deps: DocumentBuilderDeps) {
  return async (
    requester: { organisationId: Id; participantId: Id },
    environment: { projectId: Id },
    input: DocumentBuilderInput,
  ): Promise<DocumentBuilderOutput> => {
    const template = deps.templates.get(input.templateId);
    if (template === undefined) {
      throw new UnknownDocumentTemplate(input.templateId, deps.templates.ids());
    }

    // the gateway, then narrowed to the ids the caller named — the extractor's
    // shape, and for the same reason: a second path to the store is the one
    // thing a worker may never have
    const assembled = await deps.assemble({
      request: { text: input.brief, mode: 'targeted' },
      environment: { kind: 'project', projectId: environment.projectId },
      requester,
    });
    const wanted = new Set(input.sources.versionIds);
    const passages = assembled.items
      .filter(
        (item): item is AssembledItem & { source: { versionId: Id } } =>
          item.channel === 'grounded' &&
          item.source !== undefined &&
          'versionId' in item.source &&
          wanted.has(item.source.versionId),
      )
      .map((item) => ({
        versionId: item.source.versionId,
        documentReference: item.descriptor?.documentReference ?? null,
        versionReference: item.descriptor?.versionReference ?? null,
        locator: item.locator,
        content: item.content,
      }));
    const reached = new Set(passages.map((passage) => passage.versionId));
    const unreachableSources = input.sources.versionIds.filter((id) => !reached.has(id));

    // ── the label, computed BEFORE the model runs ────────────────────────────
    //
    // Before, deliberately: a refusal after drafting has already spent the
    // money, and the refusal does not change with the words produced. It is
    // computed over the sources ACTUALLY REACHED rather than the ids requested,
    // because a label over material the run never saw would describe a document
    // that does not exist.
    const source = await versionsAudience(deps.db, [...reached]);
    const destination = await sandboxAudience(deps.db, input.destination.sandboxId);
    const verdict = checkPropagation(source, destination);
    const label = {
      computedLabel: verdict.source,
      mostRestrictiveInput: await mostRestrictive(deps.db, [...reached]),
      destinationLabel: verdict.destination,
    };

    if (!verdict.allowed) {
      // The write does not happen and the output SAYS SO with both labels
      // named. Nothing is drafted — there is no document to withhold, and
      // producing one to throw away would be paying for a refusal.
      return {
        documentId: null,
        manifest: [],
        label: { ...label, refusal: verdict.reason },
        withheld: [],
        unreachableSources,
        outsideOutline: 0,
      };
    }

    if (passages.length === 0) {
      return {
        documentId: null,
        manifest: [],
        label,
        withheld: [],
        unreachableSources,
        outsideOutline: 0,
      };
    }

    const sourceByMarker = new Map(
      passages.map((passage, at) => [`S${at + 1}`, passage] as const),
    );
    const result = await deps.router.chat('draft', {
      system: composeTemplatePrompt(template, input.brief),
      messages: [
        {
          role: 'user',
          content: passages.map((passage, at) => `[S${at + 1}] ${passage.content}`).join('\n\n'),
        },
      ],
    });

    // The same ground-check the chain runs, on the same claims: a built
    // document gets no weaker guarantee than an answer does, and `document`
    // mode is grounded-only, so an unsourced sentence is withheld rather than
    // labelled open-world.
    // THE SECTION EACH SENTENCE LANDED IN is resolved on the model's raw text,
    // by its HEADING LINES, before anything is parsed into claims. It has to
    // be: `parseClaims` splits on `[S#]` markers rather than on lines, so a
    // heading and the sentence after it arrive as one claim, and a manifest
    // built from claims alone would have no sections to name. Headings are
    // structure, not claims — the template's own words rather than the model's
    // — so holding them to a grounding rule would be checking the template
    // against the corpus.
    const sectioned: Array<{
      text: string;
      sourceRef?: ReturnType<typeof parseClaims>[number]['sourceRef'];
      section: string;
    }> = [];
    for (const block of splitByHeadings(result.text, template.sections)) {
      for (const claim of parseClaims(block.body, sourceByMarker as never)) {
        sectioned.push({
          text: claim.text,
          ...(claim.sourceRef !== undefined && { sourceRef: claim.sourceRef }),
          section: block.section,
        });
      }
    }

    const checked = groundCheck({
      claims: sectioned.map((claim) => ({
        text: claim.text,
        ...(claim.sourceRef !== undefined && { sourceRef: claim.sourceRef }),
      })),
      sourceSet: passages.map((passage) => ({ versionId: passage.versionId })),
      // grounded-only: `document` mode withholds an unsourced sentence rather
      // than labelling it open-world. A built document gets no weaker guarantee
      // than an answer does.
      unsourced: 'withhold',
    });

    // ── the manifest ─────────────────────────────────────────────────────────
    //
    // Built from the SURVIVING claims, not from the sources handed in: "what
    // this document rests on" is a different set from "what was offered to it",
    // and only the first is a manifest. `usedFor` is the template section the
    // sentence landed under, which is what makes the entry checkable against the
    // document rather than against the request.
    const survived = new Set(checked.surviving.map((claim) => claim.text));
    const manifest = manifestOf(
      sectioned.filter((claim) => survived.has(claim.text)),
      passages,
    );

    // the template's headings are written back into the document, and a section
    // that survived nothing is OMITTED rather than left as an empty heading —
    // an empty section reads as "the record says nothing here", which is a claim
    // this run has not made
    const content = template.sections
      .map((section) => {
        const lines = sectioned
          .filter((claim) => claim.section === section.id && survived.has(claim.text))
          .map((claim) => claim.text);
        return lines.length === 0 ? null : [section.heading, ...lines].join('\n\n');
      })
      .filter((block): block is string => block !== null)
      .join('\n\n');

    const [document] = await deps.db
      .insert(s.sandboxDocuments)
      .values({
        projectId: environment.projectId,
        organisationId: requester.organisationId,
        sandboxId: input.destination.sandboxId,
        title: input.destination.title,
        content,
        createdByParticipantId: requester.participantId,
      })
      .returning();

    const usage = {
      tokensPrompt: result.usage.tokensPrompt,
      tokensCompletion: result.usage.tokensCompletion,
      // priced against the model that ACTUALLY served the call, never the one
      // the deployment expected to be serving it
      cost: costOf(deps.rates, result.model, result.usage),
    };
    return {
      documentId: document!.id as Id,
      manifest,
      label,
      withheld: checked.withheld.map((claim) => claim.text),
      unreachableSources,
      // T-402 — grounded sentences that matched no heading. They survived the
      // ground check and were still not written, because the assembly above
      // writes the template's sections and nothing else.
      outsideOutline: sectioned.filter(
        (claim) => claim.section === UNSECTIONED && survived.has(claim.text),
      ).length,
      usage,
      model: result.model,
    };
  };
}

/**
 * Which single source set the computed label — the one whose own audience is
 * the most restrictive.
 *
 * Named because a refusal a user cannot act on reads as a broken system rather
 * than a careful one: *"this document draws on material restricted to three
 * named people"* is only actionable if you can be told **which** material.
 * Null where there are no sources at all, which is an unconstrained label
 * rather than a restrictive one.
 */
async function mostRestrictive(db: Db, versionIds: Id[]): Promise<Id | null> {
  if (versionIds.length === 0) return null;
  const ranked = await Promise.all(
    versionIds.map(async (versionId) => ({
      versionId,
      audience: await versionsAudience(db, [versionId]),
    })),
  );
  let winner = ranked[0]!;
  for (const candidate of ranked.slice(1)) {
    // narrower participants beat a broader organisation set; otherwise fewer
    // organisations wins. Ties keep the first, so the answer is stable.
    const a = candidate.audience;
    const b = winner.audience;
    const narrower =
      (a.participantIds !== null && b.participantIds === null) ||
      (a.participantIds !== null &&
        b.participantIds !== null &&
        a.participantIds.length < b.participantIds.length) ||
      (a.participantIds === null &&
        b.participantIds === null &&
        a.organisationIds.length < b.organisationIds.length);
    if (narrower) winner = candidate;
  }
  return winner.versionId;
}

/**
 * Split the model's answer at the template's own heading lines.
 *
 * Matched on a line of its own, whitespace- and case-insensitively and ignoring
 * markdown hashes, because the one thing a model reliably varies is decoration.
 * Text before the first heading is `unsectioned` rather than dropped: a
 * sentence the model wrote outside the outline is still a sentence it wrote,
 * and losing it silently would make the manifest describe a document that is
 * not the one written.
 *
 * ⚠ **`unsectioned` is not one of the template's sections and must never be
 * counted as one** (T-402). The assembly below writes only the template's own
 * sections, so this bucket's material never reaches the document; a tally that
 * counted it reported a section written into a document that has none.
 */
function splitByHeadings(
  text: string,
  sections: ReadonlyArray<{ id: string; heading: string }>,
): Array<{ section: string; body: string }> {
  const byHeading = new Map(
    sections.map((section) => [section.heading.trim().toLowerCase(), section.id]),
  );
  const blocks: Array<{ section: string; body: string[] }> = [{ section: UNSECTIONED, body: [] }];
  for (const line of text.split('\n')) {
    const heading = byHeading.get(line.trim().replace(/^#+\s*/, '').replace(/[:.]$/, '').toLowerCase());
    if (heading !== undefined) blocks.push({ section: heading, body: [] });
    else blocks[blocks.length - 1]!.body.push(line);
  }
  return blocks
    .map((block) => ({ section: block.section, body: block.body.join('\n').trim() }))
    .filter((block) => block.body !== '');
}

function manifestOf(
  surviving: ReadonlyArray<{
    text: string;
    sourceRef?: { versionId: Id } | { authorityRef: string };
    section: string;
  }>,
  passages: ReadonlyArray<{
    versionId: Id;
    documentReference: string | null;
    versionReference: string | null;
    locator: AssembledItem['locator'];
  }>,
): ManifestEntry[] {
  const byVersion = new Map(passages.map((passage) => [passage.versionId, passage]));
  const entries: ManifestEntry[] = [];
  // one entry per (source, section): the same document used in two sections is
  // two facts, and used twice in one section is one
  const seen = new Set<string>();
  for (const claim of surviving) {
    const ref = claim.sourceRef;
    if (ref === undefined || !('versionId' in ref)) continue;
    const key = `${ref.versionId}::${claim.section}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const passage = byVersion.get(ref.versionId);
    entries.push({
      versionId: ref.versionId,
      documentReference: passage?.documentReference ?? null,
      versionReference: passage?.versionReference ?? null,
      locator: passage?.locator,
      usedFor: claim.section,
    });
  }
  return entries;
}

/** Reads back what a built document rests on — used by the tests and by T-309. */
export async function builtDocumentContent(db: Db, documentId: Id): Promise<string | null> {
  const [row] = await db
    .select({ content: s.sandboxDocuments.content })
    .from(s.sandboxDocuments)
    .where(eq(s.sandboxDocuments.id, documentId))
    .limit(1);
  return row?.content ?? null;
}
