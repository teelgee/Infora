// T-409 (ADR-0053 addendum A2, second half) — the creator's agent pane: the
// THIRD embedded assistive agent, on T-337's and T-364's pattern.
//
// *In plain terms: beside the plan, the author tells an agent what it got wrong
// for one section — "no, this should set out X in bullets" — and the agent
// rewrites that section's description. Nothing runs; the plan simply redraws
// with the new description in it, and the author still has to accept it.*
//
// Four properties this file exists to keep:
//
//   1. 🔒 **IT REVISES A BRIEF AND NOTHING ELSE.** A brief is a *parameter* of
//      the run. The step list underneath the plan is computed in code from the
//      parameters, is editable by nobody, and regenerates when a brief changes.
//      So the model never touches a step list, the run stays `declared`, and
//      ADR-0053 §12 is not reopened — one more input simply became
//      conversationally revisable before the run.
//   2. **It PROPOSES and never applies** (ADR-0027, and the preview-confirm
//      lane T-337 and T-364 both stay in). The revised text goes back to the
//      surface, which sets it through the *same* code path a typed correction
//      takes. Two ways to change a brief would be two chances for them to
//      produce different plans, and the ticket's own test is that they cannot.
//   3. **It reads no project material at all** — not a source, not a document,
//      not the library. Its whole context is the section the author is looking
//      at and what the author said about it. That is narrower than the
//      structure agent (which reads the organisation's plan disciplines) and it
//      is narrower on purpose: a description of what a section will contain is
//      an instruction, not a finding, and an agent that reached into the record
//      to write one would be drafting the document a step early — ungrounded,
//      uncited, and in the one field that then steers the grounded call.
//   4. **A brief says what belongs in a section, never what to conclude.** It is
//      the rule the shipped templates' guidance was always held to, and the one
//      an agent is most likely to break, so the prompt states it twice and the
//      parser has no way to relax it.
import type { ReviseSectionBriefResult } from '@infora/contracts';
import type { Router } from '@infora/model';

/** A description is a short instruction, not a section. The cap is generous
 *  enough for three sentences and mean enough to refuse a draft. */
const MAX_BRIEF = 600;

const SYSTEM = [
  'You revise ONE section’s description in the plan for a document an engineering consultancy is about to draft from its project record.',
  'A description says what will be written into that section. It is an instruction to the drafting step, not the section itself.',
  'Answer with JSON only, no prose around it, in exactly this shape:',
  '{"brief":"<the revised description>","followUp":null}',
  'Rules:',
  '- Revise the description you are given, in light of what the author says is wrong with it. Keep what they did not object to.',
  `- At most ${MAX_BRIEF} characters. Two or three sentences. Never draft the section itself.`,
  '- Say what BELONGS in the section — its scope, its shape, its register. NEVER say what it should conclude, and never assert a fact about the project.',
  '- You have not seen the project record and must not pretend to have. No findings, no figures, no document references.',
  '- If the ask is too vague to revise from, return {"brief":null,"followUp":"<one short question>"}.',
].join('\n');

/** Strip a fenced code block if the model wrapped its JSON in one. */
function unfence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced?.[1] ?? text).trim();
}

/**
 * Parse the model's answer into a revision.
 *
 * Anything unparseable, empty or over length becomes a **followUp** rather than
 * an error — T-364's rule, and the same reasoning: an assistive agent that
 * cannot shape an answer should ask, not fail the surface the author is
 * standing on. An over-long answer is its own case and says so, because "it
 * wrote the section instead of describing it" is a thing the author can act on
 * where a generic failure is not.
 */
export function parseRevision(text: string): ReviseSectionBriefResult {
  const asked = {
    brief: null,
    followUp: 'I could not tell what to change — what should this section do differently?',
  } satisfies ReviseSectionBriefResult;
  try {
    const raw: unknown = JSON.parse(unfence(text));
    if (typeof raw !== 'object' || raw === null) return asked;
    const candidate = raw as { brief?: unknown; followUp?: unknown };
    const followUp =
      typeof candidate.followUp === 'string' && candidate.followUp.trim() !== ''
        ? candidate.followUp.trim()
        : null;
    const brief = typeof candidate.brief === 'string' ? candidate.brief.trim() : '';
    if (brief === '') return { brief: null, followUp: followUp ?? asked.followUp };
    if (brief.length > MAX_BRIEF) {
      return {
        brief: null,
        followUp: `That came back as a draft of the section rather than a description of it. What should the section cover?`,
      };
    }
    // a revision and a question are not both answers: the brief wins, because
    // the author asked for a change and got one
    return { brief, followUp: null };
  } catch {
    return asked;
  }
}

/**
 * Ask for one section's description to be revised.
 *
 * Routed on the existing **`draft`** task class, which is what the structure
 * agent uses and what this is: short prose written to an instruction. It is not
 * `clarify` — the follow-up question is the fallback, not the job.
 */
export async function reviseSectionBrief(
  router: Router,
  input: { heading: string; purpose: string; brief: string; ask: string },
): Promise<ReviseSectionBriefResult> {
  const result = await router.chat('draft', {
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          `The section is headed: ${input.heading}`,
          `The author said it should contain: ${input.purpose}`,
          `Its description currently reads: ${input.brief}`,
          '',
          `The author says: ${input.ask}`,
        ].join('\n'),
      },
    ],
    maxTokens: 600,
  });
  return parseRevision(result.text);
}
