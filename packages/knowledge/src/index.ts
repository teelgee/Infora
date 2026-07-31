// @infora/knowledge — project + org context stores, signal capture
export { createAssembler, TOKEN_LIMIT } from './gateway';
export type { GatewayDeps } from './gateway';
export { estimateTokens } from './merge';
export { deliverableVisibleSql } from './visibility';
// T-249 — the access facts behind label propagation (finding F2); the policy
// they feed is pure and lives in @infora/governance
export {
  runSourceAudience,
  sandboxAudience,
  sandboxDocumentAudience,
  versionsAudience,
} from './label-facts';
