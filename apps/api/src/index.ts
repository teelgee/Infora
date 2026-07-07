// @infora/api — only deployable that touches the DB and models.
import { serve } from '@hono/node-server';
import { buildApp } from './app';
import { loadApiEnv } from './env';

const env = loadApiEnv();

serve({ fetch: buildApp().fetch, port: env.PORT }, (info) => {
  console.log(`@infora/api listening on :${info.port}`);
});
