// @infora/api — only deployable that touches the DB and models.
import { serve } from '@hono/node-server';
import { createDb } from '@infora/db';
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
const app = buildApp({
  db,
  sessionSecret: env.SESSION_SECRET,
  router,
  ...(allowedOrigins !== undefined && { allowedOrigins }),
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`@infora/api listening on :${info.port}`);
});
