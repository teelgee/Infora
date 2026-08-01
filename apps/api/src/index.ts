// @infora/api — only deployable that touches the DB and models.
import { serve } from '@hono/node-server';
import { createDb } from '@infora/db';
import { loadLenses } from '@infora/lenses';
import { AnthropicChatAdapter, Router, VoyageEmbeddingAdapter, securityForTier } from '@infora/model';
import { buildApp } from './app';
import { loadApiEnv, resolveRouteAttributes } from './env';

const env = loadApiEnv();
const { db } = createDb();
// the deployment's security posture drives route selection (ADR-0037): the
// tier is a hard constraint, and the model endpoints must declare conforming
// egress attributes or the router fails closed.
const security = securityForTier(env.DEPLOYMENT_TIER, env.DATA_CLASSIFICATION);
const attributes = resolveRouteAttributes(env);
const router = new Router(
  AnthropicChatAdapter.fromEnv({
    ...(attributes !== undefined && { attributes }),
    ...(env.MODEL_CHAT_ENDPOINT !== undefined && { endpoint: env.MODEL_CHAT_ENDPOINT }),
  }),
  new VoyageEmbeddingAdapter({
    apiKey: env.VOYAGE_API_KEY,
    ...(attributes !== undefined && { attributes }),
    ...(env.MODEL_EMBED_ENDPOINT !== undefined && { endpoint: env.MODEL_EMBED_ENDPOINT }),
  }),
  security,
);
// T-216: deployments widen CORS only by declaring origins explicitly
const allowedOrigins = env.ALLOWED_ORIGINS?.split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin !== '');
// T-299 — the Lens registry, read and validated ONCE, at boot. A validation
// failure throws here, before the server listens: a Lens definition that does
// not load is a build failure, never a degradation, so the deployment refuses
// to start rather than quietly serving three Lenses where four were authored.
// Outside production the set hot-reloads and includes drafts, which is what
// AUTHORING.md's "put it in with status: draft and open Ask" depends on.
const lenses = loadLenses({ production: process.env.NODE_ENV === 'production' });

const app = buildApp({
  db,
  sessionSecret: env.SESSION_SECRET,
  router,
  lenses,
  ...(allowedOrigins !== undefined && { allowedOrigins }),
  // T-217: throttle overrides; unset vars fall through to the in-code defaults
  rateLimits: {
    ...(env.RATE_LIMIT_LOGIN_PER_MINUTE !== undefined && {
      loginPerMinute: env.RATE_LIMIT_LOGIN_PER_MINUTE,
    }),
    ...(env.RATE_LIMIT_RUNS_PER_MINUTE !== undefined && {
      runsPerMinute: env.RATE_LIMIT_RUNS_PER_MINUTE,
    }),
  },
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`@infora/api listening on :${info.port}`);
});
