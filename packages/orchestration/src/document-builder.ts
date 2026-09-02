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
import type {
  Assemble,
  AssembledItem,
  DocumentLanguage,
  DocumentPurpose,
  DocumentSection,
  DocumentType,
  Id,
  OutlineEntry,
} from '@infora/contracts';
import { flattenOutline, outlineEntryName } from '@infora/contracts';
import { composeDraftingPrompt } from '@infora/capabilities';
import { freshModelOutput, normaliseFreshOutput, parseClaims, preferredWordings } from '@infora/capabilities';
import type { AcceptedRule } from '@infora/capabilities';
import { readCurrentRuleSet } from '@infora/data';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { checkPropagation, groundCheck } from '@infora/governance';
import type { AccessLabel } from '@infora/governance';
import { guidingStyleGuide, sandboxAudience, versionsAudience } from '@infora/knowledge';
import { costOf } from '@infora/model';
import type { ModelRates, Router } from '@infora/model';

export type DocumentBuilderInput = {
  /**
   * T-407 (ADR-0053 addendum A1) — **the outline the author composed**, and
   * `templateId` is gone with it. A template is a starting outline the surface
   * copies into these sections before the request is made, so the builder
   * drafts into what the author actually asked for and there is nothing left
   * for a template to lock.
   */
  sections: DocumentSection[];
  brief: string;
  /**
   * T-406 (ADR-0053 addendum A1) — the launcher's four answers, as run
   * parameters. `purpose` and `documentType` tell the drafting call what it is
   * writing; `language` sets the register and **wins on register** where a
   * style guide disagrees; `styleGuideIds` names the guides this document is
   * written to.
   *
   * **The style guides are read HERE and not handed in as text**, which is the
   * same rule `sources` follows one line down for the opposite reason: sources
   * are explicit because the builder must not choose what it sees, and clauses
   * are read here because the caller must not be able to put words in a guide's
   * mouth. Both are the propagation guarantee, from its two ends.
   */
  purpose: DocumentPurpose;
  language: DocumentLanguage;
  documentType: DocumentType;
  styleGuideIds: Id[];
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
  /**
   * The section whose text rests on this source, **by its heading** (T-407) —
   * or `unsectioned` for material that matched no heading at all. A heading and
   * not a position, because a manifest is read by people: "the evidence" says
   * what a source was used for and "s1" does not.
   *
   * T-412 — a **sub-section** is named under its parent, *"Baseline — 2025
   * survey"*, because its own heading may be one three sections of an outline
   * share and a manifest entry a reader cannot locate is not a manifest entry.
   */
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
   * T-407 — how many of the outline's sections the document actually has,
   * counted where the assembly decides it. Never the `unsectioned` bucket
   * (T-402), and never derived from the manifest's headings, which two
   * sections of one outline may honestly share.
   *
   * T-412 — **sub-sections count, at whatever depth**, because each is
   * separately drafted; a parent heading emitted only to host a surviving
   * sub-section does not, because nothing was written into it.
   */
  sectionsWritten: number;
  /**
   * T-396 — what the drafting call spent, so the executor can record it on the
   * Step row it opened. **Absent where no model call was made** — a refused
   * write and a brief that reached no passages both return before the router is
   * touched — and absent is not zero: an unpriced or un-made call must never
   * read as a free one (T-254).
   */
  usage?: { tokensPrompt: number; tokensCompletion: number; cost: number | null };
  model?: { id: string; version: string };
  /**
   * T-429 — what the tidy-up pass did to the model's own output: how many
   * wordings it swapped, and how many pattern-rule breaches it could not fix
   * because a pattern rule carries no replacement. Reported rather than silent,
   * in the same spirit as `withheld` and `unreachableSources`.
   */
  normalised?: { substitutions: number; unfixed: number };
};

/**
 * T-407 — the outline arrives composed, so there is nothing to look up and
 * nothing to refuse. `UnknownDocumentTemplate` is gone: it named a failure
 * mode — *"you asked for a template this deployment does not carry"* — that
 * this ticket removed rather than moved. A starting outline that does not
 * exist is now a menu the surface could not fill, and an author who picks
 * nothing composes their own sections instead.
 */
export type DocumentBuilderDeps = {
  db: Db;
  router: Router;
  assemble: Assemble;
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
        sectionsWritten: 0,
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
        sectionsWritten: 0,
      };
    }

    // T-406 — the style material the drafting call now consumes. Read from the
    // store, narrowed to the guides the AUTHOR SELECTED: a guide they did not
    // choose is a rule about another document, not a rule this draft broke.
    // `anyStyleGuideLoaded` is a SECOND, deliberately separate question,
    // because "you selected none" and "this project has none" are two different
    // things to tell a model, and a prompt that conflated them would let a
    // project nobody had set up look like a deliberate choice.
    const styleClauses = (
      await guidingStyleGuide(deps.db, environment.projectId, input.styleGuideIds)
    ).map((item) => ({
      clause: item.rule?.clause ?? null,
      heading: item.rule?.heading ?? null,
      text: item.content,
    }));
    const anyStyleGuideLoaded =
      styleClauses.length > 0 || (await guidingStyleGuide(deps.db, environment.projectId)).length > 0;

    // T-429 (ADR-0054 decision 6) — the accepted rules of the guides the author
    // SELECTED. Two things come out of them and they go to different places:
    // the compiled brief and the preferred-wordings list go INTO the prompt,
    // and the term rules come back AFTER generation as the tidy-up pass.
    const accepted = await acceptedRulesFor(deps.db, environment.projectId, input.styleGuideIds);
    const brief = accepted.briefs.join('\n\n');

    const sourceByMarker = new Map(
      passages.map((passage, at) => [`S${at + 1}`, passage] as const),
    );
    const result = await deps.router.chat('draft', {
      system: composeDraftingPrompt(input.sections, input.brief, {
        purpose: input.purpose,
        language: input.language,
        documentType: input.documentType,
        styleClauses,
        anyStyleGuideLoaded,
        ...(brief !== '' && { draftingBrief: brief }),
        preferredWordings: preferredWordings(accepted.rules),
      }),
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
    // 🔒 T-412 — ONE FLATTENING, AND EVERYTHING BELOW READS IT. A sub-section
    // is a section of its own: it gets its own key, its own heading in the
    // document, its own manifest name and its own place in the tally. The one
    // thing it has that a top-level section does not is a parent, which is why
    // `outlineEntryName` names it under one and the assembly writes it under
    // one.
    const outline = flattenOutline(input.sections);
    for (const block of splitByHeadings(result.text, outline)) {
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
    // and only the first is a manifest. `usedFor` is the section the sentence
    // landed under, by its heading, which is what makes the entry checkable
    // against the document rather than against the request.
    const survived = new Set(checked.surviving.map((claim) => claim.text));
    const headingOf = new Map(
      outline.map((entry, at) => [sectionKey(at), outlineEntryName(entry)] as const),
    );
    const manifest = manifestOf(
      sectioned.filter((claim) => survived.has(claim.text)),
      passages,
      headingOf,
    );

    // The outline's headings are written back into the document, and a section
    // that survived nothing is OMITTED rather than left as an empty heading —
    // an empty section reads as "the record says nothing here", which is a
    // claim this run has not made.
    //
    // 🔒 **HEADINGS ARE WRITTEN AS MARKDOWN (`## …`), which is T-336's heading
    // finding applied to an AUTHOR'S outline** (T-407). T-336 found the
    // checker's splitter reading a heading only where a blank line sat above
    // it — the shape `document_builder` happened to write — and it also treats
    // a line as a heading only when it is short and unpunctuated. Those rules
    // are safe guesses about a heading nobody marked up, and they were fine
    // while every heading came from one of two templates. An author types
    // *"3.2 Baseline conditions, including the 2025 survey"* and the guess
    // fails, so the section the creator wrote becomes prose the checker never
    // sees as a section. An explicit `##` is not a guess: `ATX` matches it
    // unconditionally, whatever its length or punctuation, and the editor
    // renders it as the heading it is.
    //
    // 🔒 **T-412 — A SUB-SECTION IS WRITTEN UNDER ITS PARENT'S HEADING**, as
    // `###` to the parent's `##`, which is what "the document carries them
    // under their parent" means once it reaches the file. Two consequences,
    // and both are deliberate:
    //
    //   • a parent that survived nothing of its own but has a surviving
    //     sub-section still gets its heading written, because that heading is
    //     not empty — its content is the sub-section beneath it. Omitting it
    //     would leave a `###` floating under whatever section came before,
    //     which is a document that says something nobody wrote;
    //   • **and it is still not counted as written.** `written` holds only
    //     entries that got prose of their own, so the coverage sentence keeps
    //     T-402's discipline: a heading emitted to host a child is not a
    //     section the run wrote into.
    // 🔒 T-429 — THE TIDY-UP PASS, AND THE ONE PLACE IT MAY TOUCH.
    //
    // What goes in is THE MODEL'S OWN SENTENCES for this document — the claims
    // the drafting call just wrote, that survived the ground check, that no
    // human has seen. Those are normalised. The section HEADINGS, further
    // below, are the AUTHOR'S OWN WORDS out of the outline they composed, and
    // they are assembled without ever passing through here.
    //
    // **T-435 made that separation structural.** `normaliseFreshOutput` no
    // longer takes strings: it takes a `FreshModelOutput`, and the only way to
    // make one is `freshModelOutput(claims)` — so the author's headings could
    // not be handed to it even by a caller who wanted to. ADR-0048 §3 is
    // untouched, and `document-builder.test.ts` still pins the behaviour: an
    // author heading that breaches a term rule comes out unchanged while the
    // model's sentence beside it is corrected.
    const tidied = normaliseFreshOutput(
      freshModelOutput(sectioned.filter((claim) => survived.has(claim.text))),
      accepted.rules,
    );
    const normalisedText = new Map(
      sectioned
        .filter((claim) => survived.has(claim.text))
        .map((claim, at) => [claim.text, tidied.lines[at] ?? claim.text]),
    );
    const linesOf = (at: number) =>
      sectioned
        .filter((claim) => claim.section === sectionKey(at) && survived.has(claim.text))
        .map((claim) => normalisedText.get(claim.text) ?? claim.text);
    const written = new Set<string>();
    outline.forEach((_entry, at) => {
      if (linesOf(at).length > 0) written.add(sectionKey(at));
    });
    const hosts = new Set(
      outline
        .map((entry, at) => ({ entry, at }))
        .filter(({ entry, at }) => entry.depth === 1 && written.has(sectionKey(at)))
        .map(({ entry }) => entry.sectionIndex),
    );
    const content = outline
      .map((entry, at) => {
        const lines = linesOf(at);
        const hash = entry.depth === 0 ? '##' : '###';
        if (lines.length === 0) {
          return entry.depth === 0 && hosts.has(entry.sectionIndex)
            ? `${hash} ${entry.heading}`
            : null;
        }
        return [`${hash} ${entry.heading}`, ...lines].join('\n\n');
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
      // T-402/T-407 — counted HERE, beside the assembly that decided it, and
      // not derived downstream from the manifest. The manifest names a section
      // by its heading because that is what a reader needs; two sections of one
      // outline may honestly share a heading, so a count taken off those names
      // would under-report, which is the same class of error as T-402's
      // over-report.
      sectionsWritten: written.size,
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
      // reported rather than silent: the run says what it tidied and what it
      // could not, because a pattern rule carries no replacement and there is
      // nothing to apply for one
      normalised: { substitutions: tidied.substitutions, unfixed: tidied.unfixed },
    };
  };
}

/**
 * T-429 — the accepted rules and compiled briefs of the guides the author chose.
 *
 * **Read here rather than handed in**, which is the rule `styleClauses` already
 * follows one read up and for the same reason: the caller must not be able to
 * put words in a guide's mouth.
 */
async function acceptedRulesFor(
  db: Db,
  projectId: Id,
  styleGuideIds: readonly Id[],
): Promise<{ rules: AcceptedRule[]; briefs: string[] }> {
  if (styleGuideIds.length === 0) return { rules: [], briefs: [] };
  const wanted = new Set<string>(styleGuideIds);
  const rules: AcceptedRule[] = [];
  const briefs: string[] = [];
  for (const styleGuideId of styleGuideIds) {
    const set = await readCurrentRuleSet(db, styleGuideId);
    if (set === null || !wanted.has(set.styleGuideId)) continue;
    if (set.draftingBrief.trim() !== '') briefs.push(set.draftingBrief);
    for (const rule of set.rules) {
      rules.push({
        id: rule.id,
        kind: rule.kind as AcceptedRule['kind'],
        origin: rule.origin as AcceptedRule['origin'],
        statement: rule.statement,
        scope: rule.scope as AcceptedRule['scope'],
        exceptedContexts: rule.exceptedContexts as AcceptedRule['exceptedContexts'],
        exceptedTerms: rule.exceptedTerms,
        register: rule.register as AcceptedRule['register'],
        enforcement: rule.enforcement as AcceptedRule['enforcement'],
        severity: rule.severity as AcceptedRule['severity'],
        payload: rule.payload as AcceptedRule['payload'],
        styleGuideId: set.styleGuideId,
        clause: rule.clause,
        ...(rule.clauseWording !== null && { clauseWording: rule.clauseWording }),
      });
    }
  }
  return { rules, briefs };
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
 * Split the model's answer at the outline's own heading lines.
 *
 * Matched on a line of its own, whitespace- and case-insensitively and ignoring
 * markdown hashes, because the one thing a model reliably varies is decoration.
 * Text before the first heading is `unsectioned` rather than dropped: a
 * sentence the model wrote outside the outline is still a sentence it wrote,
 * and losing it silently would make the manifest describe a document that is
 * not the one written.
 *
 * ⚠ **`unsectioned` is not one of the outline's sections and must never be
 * counted as one** (T-402). The assembly below writes only the outline's own
 * sections, so this bucket's material never reaches the document; a tally that
 * counted it reported a section written into a document that has none.
 *
 * **T-407 — sections are identified by POSITION, not by heading.** An author
 * composing an outline may reasonably write "Mitigation" twice, in two
 * chapters' worth of sections; keying on the heading would silently merge them
 * and report one section where the document has two.
 *
 * **T-412 — the position is the position in the FLATTENED outline**, so a
 * sub-section has a key of its own on the same terms as a section. There is
 * one traversal (`flattenOutline`) producing that order and every count in the
 * run reads it, because two traversals is how a plan that promised five
 * sections comes back reporting three.
 */
const sectionKey = (index: number) => `s${index}`;

/**
 * One normalisation, applied to BOTH sides of the match (T-407).
 *
 * It used to normalise only the model's line — hashes stripped, trailing
 * punctuation dropped, case and whitespace folded — while the outline's own
 * heading was compared raw. That was safe while every heading came from a
 * template, because a template author would not write a heading ending in a
 * full stop. An author composing their own outline will, and the section they
 * defined would then match nothing the model wrote under it.
 */
const asHeading = (line: string) =>
  line.trim().replace(/^#+\s*/, '').replace(/[:.]$/, '').trim().toLowerCase();

function splitByHeadings(
  text: string,
  outline: ReadonlyArray<OutlineEntry>,
): Array<{ section: string; body: string }> {
  // FIRST position wins a repeated heading: two sections may honestly share
  // one, and the earlier is the one the model reaches first. T-412 — the
  // outline arrives already flat, so a sub-section's heading competes for a
  // line on exactly the same terms as its parent's, which is what makes it a
  // section of its own rather than prose inside one.
  const byHeading = new Map<string, string>();
  for (const [at, entry] of outline.entries()) {
    const key = asHeading(entry.heading);
    if (!byHeading.has(key)) byHeading.set(key, sectionKey(at));
  }
  const blocks: Array<{ section: string; body: string[] }> = [{ section: UNSECTIONED, body: [] }];
  for (const line of text.split('\n')) {
    const heading = byHeading.get(asHeading(line));
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
  headingOf: ReadonlyMap<string, string>,
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
      usedFor: headingOf.get(claim.section) ?? claim.section,
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
