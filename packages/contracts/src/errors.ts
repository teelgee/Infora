// Contracts §4 — the error envelope. `not_found` covers both nonexistence and
// denial (principle 4): there is no `forbidden` on cross-wall reads — that
// would leak existence. `forbidden` exists only *within* an entitled scope,
// where existence is already visible — the author-only writes on sandbox
// comments (T-112) — and is never a cross-wall answer.

// `rate_limited` (T-217) rides a 429: the request was well-formed and would
// have been entitled — the caller is simply over a throttle window.

export type ApiError = {
  error: 'not_found' | 'conflict' | 'invalid' | 'unauthenticated' | 'forbidden' | 'rate_limited';
  detail?: string;
};
