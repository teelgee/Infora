// Contracts §4 — the error envelope. `not_found` covers both nonexistence and
// denial (principle 4): there is no `forbidden` on cross-wall reads — that
// would leak existence. `forbidden` exists only *within* an entitled scope,
// where existence is already visible — the author-only writes on sandbox
// comments (T-112) — and is never a cross-wall answer.

// `rate_limited` (T-217) rides a 429: the request was well-formed and would
// have been entitled — the caller is simply over a throttle window.

// T-337 — `hint` is the SPECIFIC half of a refusal, and it is a separate field
// because `detail` is a machine code the surface maps to a sentence, while a
// hint is data from the request that no map could hold: which columns a
// spreadsheet actually had, which row was wrong. A refusal a person can act on
// usually needs both — "rename the column" plus "the columns are X, Y, Z" — and
// folding the second into the first would make `detail` unmappable.
//
// It carries **request-derived text**, so it is never used for anything the
// requester was not already shown: a hint that named a row of someone else's
// document would be a leak wearing an error's clothes.
export type ApiError = {
  error: 'not_found' | 'conflict' | 'invalid' | 'unauthenticated' | 'forbidden' | 'rate_limited';
  detail?: string;
  hint?: string;
};
