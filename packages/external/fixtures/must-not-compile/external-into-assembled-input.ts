// MUST NOT COMPILE. The subtler form of the same mistake: not calling an
// external source an assembled item, but appending one to the working input
// the draft leaf hands the model. The prompt is built by concatenating
// `retrieved.items` (packages/capabilities/src/grounded-draft.ts), so anything
// that reaches this array reaches the model.
import type { AssembledInput, ExternalSource } from '@infora/contracts';

declare const fetched: ExternalSource;

const working: AssembledInput = {
  items: [
    { channel: 'grounded', corpus: 'library', source: { versionId: 'v1' }, content: 'a project source' },
  ],
  budget: { tokenLimit: 12000, tokensUsed: 10 },
};

// expected: not assignable to parameter of type 'AssembledItem'
working.items.push(fetched);

// expected: the same, dressed as a channel — there is no channel for untrusted
// content, deliberately (ADR-0021's three channels are all trusted registers)
working.items.push({ channel: 'external', source: { url: fetched.url }, content: fetched.excerpt });

export {};
