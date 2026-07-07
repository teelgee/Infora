// @infora/api — only deployable that touches the DB and models.
import { serve } from '@hono/node-server';
import { createDb } from '@infora/db';
import { buildApp } from './app';
import { loadApiEnv } from './env';

const env = loadApiEnv();
const { db } = createDb();
const app = buildApp({ db, sessionSecret: env.SESSION_SECRET });

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`@infora/api listening on :${info.port}`);
});
