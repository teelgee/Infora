// @infora/db — Postgres + pgvector: schema, migrations, seed
export { createDb, withProjectScope, type Db } from './client.js';
export { loadDbEnv, type DbEnv } from './env.js';
export { hashPassword, verifyPassword } from './credentials.js';
export { seedProjectOntology, DEFAULT_CLASSIFICATION_SCHEME } from './ontology-seed.js';
export {
  seedProjectAcceptanceCodes,
  DEFAULT_ACCEPTANCE_SCHEME,
  type DefaultAcceptanceCode,
} from './acceptance-code-seed.js';
export * as schema from './schema/index.js';
