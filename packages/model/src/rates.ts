// T-254 — provider rates, per model id (finding F7).
//
// THE FAILURE THIS CLOSES: every step in the running system recorded a cost of
// exactly zero. Token counts were real; the rates defaulted to 0 and the draft
// leaf was bound with no options, so the multiplication was always by nothing.
// A pilot cannot be priced off that, and "our AI costs £0.00 per run" is the
// kind of number that goes into a business case unchallenged.
//
// THE MISTAKE THIS FILE EXISTS TO AVOID IS REPEATING IT ONE LEVEL UP. A rate
// table that returns 0 for a model it does not know is the same lie with more
// steps: the arithmetic succeeds, the number is plausible, and nobody notices
// until a provider changes a model id. So an unpriced call yields **null**, not
// zero, all the way to the audit row and the report — and the report says how
// many calls it could not price, rather than quietly totalling them as free.
//
// Rates are DEPLOYMENT CONFIGURATION and nothing here defaults them. Provider
// pricing changes without warning, moves per region, and is negotiated per
// customer; a number compiled into this repository would be wrong somewhere
// from the day it was written.
import type { ModelIdentity } from './types.js';

/** What one model costs, per million tokens, in the deployment's own currency. */
export type ModelRate = {
  promptPerMTok: number;
  completionPerMTok: number;
};

/** Model id → rate. Absent means unpriced, which is a reportable state. */
export type ModelRates = Record<string, ModelRate>;

export type TokenUsage = { tokensPrompt: number; tokensCompletion: number };

/**
 * What this call cost, or `null` when the deployment declared no rate for the
 * model that served it.
 *
 * Null is the whole point. A step that says `cost: null` is a step nobody can
 * mistake for a free one, and it is a question an operator can answer — "which
 * model was that, and what does it cost?" — where `0` is a question nobody
 * knows to ask.
 */
export function costOf(
  rates: ModelRates | undefined,
  model: ModelIdentity | string,
  usage: TokenUsage,
): number | null {
  const id = typeof model === 'string' ? model : model.id;
  const rate = rates?.[id];
  if (rate === undefined) return null;
  return (
    (usage.tokensPrompt * rate.promptPerMTok + usage.tokensCompletion * rate.completionPerMTok) /
    1_000_000
  );
}

/**
 * Parse a rate table from configuration, refusing a malformed one at boot.
 *
 * Deliberately strict: a typo in a rate table is a pricing error that reports
 * a confident wrong number, which is worse than a deployment that refuses to
 * start. A negative rate is refused for the same reason — it would make a
 * total go down as usage went up, and nobody reading the report would suspect
 * the table.
 */
export function parseModelRates(source: string): ModelRates {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`MODEL_RATES is not valid JSON: ${(error as Error).message}`, { cause: error });
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('MODEL_RATES must be an object of { "<model-id>": { promptPerMTok, completionPerMTok } }');
  }

  const rates: ModelRates = {};
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`MODEL_RATES["${id}"] must be { promptPerMTok, completionPerMTok }`);
    }
    const rate = value as Record<string, unknown>;
    for (const field of ['promptPerMTok', 'completionPerMTok'] as const) {
      const number = rate[field];
      if (typeof number !== 'number' || !Number.isFinite(number) || number < 0) {
        throw new Error(
          `MODEL_RATES["${id}"].${field} must be a non-negative number (found ${JSON.stringify(number)})`,
        );
      }
    }
    rates[id] = {
      promptPerMTok: rate['promptPerMTok'] as number,
      completionPerMTok: rate['completionPerMTok'] as number,
    };
  }
  return rates;
}
