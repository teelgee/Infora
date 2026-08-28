// T-285 — fallback chains: what counts as "try the next route", and what does
// not.
//
// THE DISTINCTION IS THE TICKET. A fallback exists for **provider outage and
// rate limiting** — the route is unavailable, so ask an equally-conforming one.
// It does not exist for a route that answered. A model that REFUSED, a request
// the provider rejected as malformed, a response with no text: those are
// answers, and retrying them on a second model is shopping for one that will
// comply. That would turn a safety behaviour into a latency problem, and it
// would do it silently, because the run would succeed.
//
// So the classification is a deliberate ALLOW-LIST of transient conditions and
// everything unrecognised is treated as an answer. The failure direction of an
// unknown error is therefore "stop", which is the direction that cannot
// launder a refusal.
import type { RouteAttempt } from './types.js';

/** Provider statuses that mean "not now", never "no". */
const TRANSIENT_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

/** Node/undici transport failures — the route was not reached at all. */
const TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/** Raised by the router when a route exceeded the deployment's attempt budget. */
export class RouteTimeout extends Error {
  constructor(endpoint: string, timeoutMs: number) {
    super(`route '${endpoint}' did not answer within ${timeoutMs}ms`);
    this.name = 'RouteTimeout';
  }
}

/**
 * Is this error the route being unavailable, rather than the route answering?
 *
 * Reads `status` and `code` structurally rather than instanceof-ing a provider
 * SDK's error classes: `@infora/model` holds several adapters and will hold
 * more, and a check tied to one vendor's class hierarchy silently stops
 * recognising a second vendor's outage.
 */
export function isRouteUnavailable(error: unknown): boolean {
  if (error instanceof RouteTimeout) return true;
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { status?: unknown; code?: unknown; name?: unknown };
  if (typeof candidate.status === 'number' && TRANSIENT_STATUS.has(candidate.status)) return true;
  if (typeof candidate.code === 'string' && TRANSIENT_CODES.has(candidate.code)) return true;
  // the SDK's own transport errors, which carry no HTTP status because no
  // response arrived
  return candidate.name === 'APIConnectionError' || candidate.name === 'APIConnectionTimeoutError';
}

/**
 * Every conforming route was tried and none answered.
 *
 * Carries the attempts, because the ticket's audit requirement is that a
 * fallback that fired is visible in the record — and a chain that fired and
 * then exhausted is the case where that matters most. The message names each
 * endpoint and its reason: "the model call failed" tells an operator nothing
 * they can act on, and this is the error text that reaches the answer body via
 * T-268's failure reporting.
 */
export class RouteChainExhausted extends Error {
  constructor(readonly failures: ReadonlyArray<{ endpoint: string; reason: string }>) {
    super(
      `every conforming route failed: ${failures
        .map((failure) => `${failure.endpoint} (${failure.reason})`)
        .join('; ')}`,
    );
    this.name = 'RouteChainExhausted';
  }
}

/**
 * The attempts the router stamped on a thrown error.
 *
 * The router attaches them to whatever the last route threw rather than
 * wrapping it, because the error a caller sees for a model refusal should stay
 * the refusal — wrapping it would make every failure look like a routing
 * failure. This reader is how the audit path gets the attempts back off it
 * without every call site knowing that.
 */
export function attemptsOf(error: unknown): RouteAttempt[] {
  if (typeof error !== 'object' || error === null) return [];
  const carried = (error as { attempts?: unknown }).attempts;
  return Array.isArray(carried) ? (carried as RouteAttempt[]) : [];
}

/**
 * Bound one attempt by the deployment's timeout.
 *
 * The signal is passed to the adapter as well as raced, so a provider client
 * that supports cancellation actually stops rather than continuing to run and
 * be billed behind an answer nobody is waiting for. Racing alone would make
 * the timeout a claim about this process rather than about the call.
 */
export async function withTimeout<T>(
  endpoint: string,
  timeoutMs: number | undefined,
  run: (signal?: AbortSignal) => Promise<T>,
): Promise<T> {
  if (timeoutMs === undefined) return run();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await Promise.race([
      run(controller.signal),
      new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () =>
          reject(new RouteTimeout(endpoint, timeoutMs)),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
