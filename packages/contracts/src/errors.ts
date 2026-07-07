// Contracts §4 — the error envelope. `not_found` covers both nonexistence and
// denial (principle 4): there is no `forbidden` on cross-wall reads — that
// would leak existence.

export type ApiError = {
  error: 'not_found' | 'conflict' | 'invalid' | 'unauthenticated';
  detail?: string;
};
