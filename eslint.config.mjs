import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// ADR-0037 §3/§5 — the "cannot be bypassed" property is structural: provider
// SDKs may be imported only inside packages/model, so every model/embedding
// call goes through the Router. This lint fails the build if any other package
// imports a provider SDK directly; the runtime guard test (packages/model/src/
// bypass-guard.test.ts) additionally catches raw provider-URL fetches.
const providerSdkImports = [
  { name: '@anthropic-ai/sdk', message: 'Provider SDKs may only be imported inside packages/model (ADR-0037 §3/§5). Route the call through @infora/model.' },
  { name: 'voyageai', message: 'Provider SDKs may only be imported inside packages/model (ADR-0037 §3/§5). Route the call through @infora/model.' },
  { name: 'openai', message: 'Provider SDKs may only be imported inside packages/model (ADR-0037 §3/§5). Route the call through @infora/model.' },
];

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.turbo/**', 'docs/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: providerSdkImports }],
    },
  },
  {
    // the adapters are the one place the SDKs live (the enforced choke point)
    files: ['packages/model/src/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
);
