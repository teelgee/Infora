// T-206 — SESSION_SECRET is required: no default, so a deployment cannot
// silently run on a publicly-known signing key.
import { describe, expect, it } from 'vitest';
import { loadApiEnv, parseChatRoutes, resolveRouteAttributes } from './env';

const base = {
  ANTHROPIC_API_KEY: 'test-anthropic-key',
  VOYAGE_API_KEY: 'test-voyage-key',
};

describe('loadApiEnv', () => {
  it('throws when SESSION_SECRET is not set', () => {
    expect(() => loadApiEnv({ ...base })).toThrow(/invalid api environment/);
  });

  it('throws when SESSION_SECRET is empty', () => {
    expect(() => loadApiEnv({ ...base, SESSION_SECRET: '' })).toThrow(/invalid api environment/);
  });

  it('loads when SESSION_SECRET is set', () => {
    const env = loadApiEnv({ ...base, SESSION_SECRET: 'a-real-secret' });
    expect(env.SESSION_SECRET).toBe('a-real-secret');
  });
});

// T-285 — the declared fallback chain. Strict at boot for T-254's reason: a
// typo produces a route that silently never conforms, and the symptom is a
// deployment failing closed on every call with no clue why.
describe('parseChatRoutes (T-285)', () => {
  const route = {
    modelId: 'claude-opus-4-8',
    endpoint: 'https://uk.example/v1',
    region: 'uk',
    retention: 'zero',
    jurisdiction: 'uk-sovereign',
    eligibility: 'enterprise-zdr',
  };

  it('parses a declared chain and resolves each route its own credential', () => {
    const routes = parseChatRoutes(
      JSON.stringify([
        { ...route, serves: ['frontier'] },
        { ...route, endpoint: 'https://fallback.example/v1', apiKeyEnv: 'FALLBACK_KEY' },
      ]),
      { ANTHROPIC_API_KEY: 'primary', FALLBACK_KEY: 'secondary' },
    );
    expect(routes.map((r) => r.apiKey)).toEqual(['primary', 'secondary']);
    expect(routes[0]!.serves).toEqual(['frontier']);
    expect(routes[1]!.serves).toBeUndefined(); // omitted = serves every task
  });

  it('refuses a route missing an egress attribute rather than inheriting one', () => {
    const withoutRegion = { ...route, region: undefined };
    expect(() => parseChatRoutes(JSON.stringify([withoutRegion]), {})).toThrow(
      /MODEL_CHAT_ROUTES must be a non-empty array/,
    );
  });

  it('refuses a route whose named credential is not set', () => {
    expect(() => parseChatRoutes(JSON.stringify([route]), {})).toThrow(/ANTHROPIC_API_KEY, which is not set/);
  });

  it('refuses malformed JSON and an empty chain', () => {
    expect(() => parseChatRoutes('{', {})).toThrow(/not valid JSON/);
    expect(() => parseChatRoutes('[]', {})).toThrow(/non-empty array/);
  });
});

// T-487 — the four model-route settings. A route is trusted only when all four
// are declared; but what WAS declared is kept, so the refusal can name exactly
// the settings still unset instead of blaming all four.
describe('resolveRouteAttributes (T-487)', () => {
  const withSession = { ...base, SESSION_SECRET: 'a-real-secret' };

  it('is undefined when none of the four settings is declared', () => {
    expect(resolveRouteAttributes(loadApiEnv(withSession))).toBeUndefined();
  });

  it('keeps the settings that were declared and marks only the rest unknown', () => {
    const env = loadApiEnv({ ...withSession, MODEL_REGION: 'uk', MODEL_ELIGIBILITY: 'self-hosted' });
    expect(resolveRouteAttributes(env)).toEqual({
      region: 'uk',
      retention: 'unknown',
      jurisdiction: 'unknown',
      eligibility: 'self-hosted',
    });
  });

  it('resolves a fully declared route as declared', () => {
    const env = loadApiEnv({
      ...withSession,
      MODEL_REGION: 'uk',
      MODEL_RETENTION: 'zero',
      MODEL_JURISDICTION: 'uk-sovereign',
      MODEL_ELIGIBILITY: 'enterprise-zdr',
    });
    expect(resolveRouteAttributes(env)).toEqual({
      region: 'uk',
      retention: 'zero',
      jurisdiction: 'uk-sovereign',
      eligibility: 'enterprise-zdr',
    });
  });
});
