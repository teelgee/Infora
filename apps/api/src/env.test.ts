// T-206 — SESSION_SECRET is required: no default, so a deployment cannot
// silently run on a publicly-known signing key.
import { describe, expect, it } from 'vitest';
import { loadApiEnv } from './env';

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
