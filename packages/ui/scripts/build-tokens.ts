// Regenerates packages/ui/src/tokens.ts and packages/ui/src/tokens.generated.css
// from docs/design/design-tokens.json — the design system's source of truth
// (see design-rules.md §E "Net effect for the coding agent" and §F).
//
// Run: node packages/ui/scripts/build-tokens.ts
// Re-run whenever docs/design/design-tokens.json changes. Output is deterministic
// (sorted traversal, no timestamps) — a no-op JSON change produces an empty git diff.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const tokensJsonPath = join(repoRoot, 'docs/design/design-tokens.json');
const tokensTsPath = join(repoRoot, 'packages/ui/src/tokens.ts');
const tokensCssPath = join(repoRoot, 'packages/ui/src/tokens.generated.css');

type JsonValue = string | number | boolean | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

const tokens = JSON.parse(readFileSync(tokensJsonPath, 'utf8')) as JsonObject;

// ---------------------------------------------------------------------------
// Naming: dotted JSON path -> CSS custom property name.
//   primitive.color.*  -> --primitive-<rest>        ("color" dropped)
//   primitive.<cat>.*  -> --primitive-<cat>-<rest>
//   semantic.<cat>.*   -> --<rest>                    (tier + category dropped)
//   component.<name>.* -> --<name>-<rest>
//   iconography.*      -> --icon-<rest>
// ---------------------------------------------------------------------------

function toKebabWord(seg: string): string {
  return seg.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function segsToVarName(segs: string[]): string {
  return '--' + segs.flatMap((s) => s.split('.')).map(toKebabWord).join('-');
}

interface Leaf {
  pathSegs: string[]; // raw path segments, exactly as they'd appear inside a `{...}` ref
  varSegs: string[]; // segments used to build the CSS var name
  light: string | number;
  dark: string | number | undefined;
}

function isJsonObject(v: JsonValue): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Merges the `X.light` / `X.dark` flat-sibling-key pattern (used by e.g. appFrame)
 * into a single `X: { light, dark }` entry, so it's handled the same way as the
 * more common nested-object `{ light, dark }` pattern used elsewhere. */
function mergeLightDarkSiblingKeys(obj: JsonObject): JsonObject {
  const keys = Object.keys(obj);
  const merged: JsonObject = {};
  const consumed = new Set<string>();
  for (const k of keys) {
    if (consumed.has(k)) continue;
    if (k.endsWith('.light')) {
      const base = k.slice(0, -'.light'.length);
      const darkKey = base + '.dark';
      if (keys.includes(darkKey)) {
        merged[base] = { light: obj[k], dark: obj[darkKey] } as unknown as JsonValue;
        consumed.add(k);
        consumed.add(darkKey);
        continue;
      }
    }
    merged[k] = obj[k];
  }
  return merged;
}

function isLightDarkPair(obj: JsonObject): boolean {
  return Object.prototype.hasOwnProperty.call(obj, 'light');
}

/** Matches the one other paired shape in the JSON — semantic.elevation.*
 * entries, `{ shadow, shadowDark?, usage? }` — where nothing but those three
 * keys exists (so it doesn't misfire on e.g. `component.pane`, which also has
 * a `shadow` key but many *other* keys alongside it that must stay separate). */
function isShadowPair(obj: JsonObject): boolean {
  if (typeof obj.shadow !== 'string' && typeof obj.shadow !== 'number') return false;
  return Object.keys(obj).every((k) => k === 'shadow' || k === 'shadowDark' || k === 'usage');
}

/** Resolves a dotted ref path (e.g. "primitive.color.neutral.900") against the
 * raw JSON tree, using the same greedy longest-dotted-key match the source
 * doc's own compound keys need (`semantic.color["action.primary.bg"]` is one
 * key, not three levels of nesting). */
function resolveRawPath(path: string): JsonValue {
  const segs = path.split('.');
  let node: JsonValue = tokens;
  let i = 0;
  while (i < segs.length) {
    let matched = false;
    for (let len = segs.length - i; len >= 1; len--) {
      const key = segs.slice(i, i + len).join('.');
      if (isJsonObject(node) && Object.prototype.hasOwnProperty.call(node, key)) {
        node = node[key];
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) throw new Error(`build-tokens: cannot resolve path "${path}"`);
  }
  return node;
}

const BARE_REF_RE = /^\{([\w.]+)\}$/;

/** A handful of component fields (e.g. `navRail.item.text`) reference a whole
 * `semantic.type.*` entry — a bundle of family/size/weight/lineHeight, not a
 * single CSS value. These describe "use this type scale" for a reader, not a
 * literal CSS property, so they're not emittable as one custom property —
 * skip them rather than force a nonsensical var(). */
function isCompositeRef(value: string | number): boolean {
  if (typeof value !== 'string') return false;
  const m = value.match(BARE_REF_RE);
  if (!m) return false;
  const target = resolveRawPath(m[1]);
  if (!isJsonObject(target)) return false;
  if (isLightDarkPair(mergeLightDarkSiblingKeys(target))) return false;
  if (isShadowPair(target)) return false;
  return true;
}

/** Walks a JSON subtree, calling `visit` once per leaf token (a light/dark pair,
 * or a bare scalar). Skips documentation-only keys (`note`, `usage`), arrays
 * (enum lists like badge.status.variants), booleans (behavior flags, not CSS
 * values — e.g. navRail.resizable), and composite type-scale references.
 *
 * Every `xDark`-suffixed key elsewhere in the JSON (primitive.color.neutralDark,
 * primitive.color.focusRingDark, primitive.shadow.level2Dark, ...) is a wholly
 * separate, independently-referenced primitive, not an implicit dark variant of
 * `x` — so no generic `x`/`xDark` merging happens here beyond the shadow-pair
 * shape above, which is how the JSON itself explicitly pairs that one value. */
function walk(node: JsonValue, pathSegs: string[], varSegs: string[], visit: (leaf: Leaf) => void): void {
  if (node === null || node === undefined || Array.isArray(node)) return;
  if (typeof node === 'boolean') return;
  const emit = (light: string | number, dark: string | number | undefined) => {
    if (isCompositeRef(light)) return;
    visit({ pathSegs, varSegs, light, dark });
  };
  if (!isJsonObject(node)) {
    emit(node, undefined);
    return;
  }
  const merged = mergeLightDarkSiblingKeys(node);
  if (isLightDarkPair(merged)) {
    emit(merged.light as string | number, merged.dark as string | number | undefined);
    return;
  }
  if (isShadowPair(merged)) {
    emit(merged.shadow as string | number, merged.shadowDark as string | number | undefined);
    return;
  }
  for (const [key, val] of Object.entries(merged)) {
    if (key === 'note' || key === 'usage') continue;
    walk(val, [...pathSegs, key], [...varSegs, key], visit);
  }
}

function driveAllTiers(visit: (leaf: Leaf) => void): void {
  const primitive = tokens.primitive as JsonObject;
  for (const [category, categoryVal] of Object.entries(primitive)) {
    const varPrefix = category === 'color' ? ['primitive'] : ['primitive', category];
    walk(categoryVal, ['primitive', category], varPrefix, visit);
  }

  const semantic = tokens.semantic as JsonObject;
  for (const [category, categoryVal] of Object.entries(semantic)) {
    walk(categoryVal, ['semantic', category], [], visit);
  }

  const component = tokens.component as JsonObject;
  for (const [category, categoryVal] of Object.entries(component)) {
    walk(categoryVal, ['component', category], category.split('.'), visit);
  }

  walk(tokens.iconography, ['iconography'], ['icon'], visit);
}

// ---------------------------------------------------------------------------
// Pass 1: register every leaf's canonical JSON path -> CSS var name.
// ---------------------------------------------------------------------------

const varNameByPath = new Map<string, string>();
const pathByVarName = new Map<string, string>();

driveAllTiers((leaf) => {
  const canonicalPath = leaf.pathSegs.join('.');
  const varName = segsToVarName(leaf.varSegs);
  if (varNameByPath.has(canonicalPath)) {
    throw new Error(`build-tokens: duplicate path "${canonicalPath}"`);
  }
  const collision = pathByVarName.get(varName);
  if (collision !== undefined) {
    throw new Error(
      `build-tokens: CSS var name collision "${varName}" — generated for both "${collision}" and "${canonicalPath}"`,
    );
  }
  varNameByPath.set(canonicalPath, varName);
  pathByVarName.set(varName, canonicalPath);
});

// ---------------------------------------------------------------------------
// Pass 2: resolve `{ref}` placeholders into `var(--name)` references and
// collect (varName -> { light, dark }) for CSS + TS emission.
// ---------------------------------------------------------------------------

const REF_RE = /\{([\w.]+)\}/g;

function resolveValue(raw: string | number): string {
  if (typeof raw === 'number') return String(raw);
  return raw.replace(REF_RE, (whole, refPath: string) => {
    const varName = varNameByPath.get(refPath);
    if (!varName) throw new Error(`build-tokens: unresolved ref "{${refPath}}"`);
    return `var(${varName})`;
  });
}

interface Resolved {
  varName: string;
  light: string;
  dark: string | undefined;
}

const resolved: Resolved[] = [];

driveAllTiers((leaf) => {
  const varName = varNameByPath.get(leaf.pathSegs.join('.'))!;
  resolved.push({
    varName,
    light: resolveValue(leaf.light),
    dark: leaf.dark !== undefined ? resolveValue(leaf.dark) : undefined,
  });
});

resolved.sort((a, b) => a.varName.localeCompare(b.varName));

// ---------------------------------------------------------------------------
// Emit tokens.generated.css
// ---------------------------------------------------------------------------

const rootLines = resolved.map((r) => `  ${r.varName}: ${r.light};`);
const darkLines = resolved.filter((r) => r.dark !== undefined).map((r) => `  ${r.varName}: ${r.dark};`);

const css = `/* GENERATED by packages/ui/scripts/build-tokens.ts from docs/design/design-tokens.json.
 * Do not hand-edit — re-run the script instead. */

:root {
${rootLines.join('\n')}
}

:root[data-theme='dark'] {
${darkLines.join('\n')}
}
`;

writeFileSync(tokensCssPath, css);

// ---------------------------------------------------------------------------
// Emit tokens.ts — a flat map of every leaf to its CSS var() reference, so
// JS/TS code that needs a token value gets a theme-aware string for free
// (the browser resolves var() live against whichever :root block is active).
// ---------------------------------------------------------------------------

const tsEntries = resolved.map((r) => `  '${r.varName.slice(2)}': 'var(${r.varName})',`).join('\n');

const ts = `// GENERATED by packages/ui/scripts/build-tokens.ts from docs/design/design-tokens.json.
// Do not hand-edit — re-run the script instead.
//
// Keyed by CSS custom-property name (minus the leading '--'). Each value is a
// var() reference, not a resolved literal — it stays theme-aware because the
// browser resolves it live against whichever :root block is active.

export const designTokens = {
${tsEntries}
} as const;

export type DesignTokenName = keyof typeof designTokens;
`;

writeFileSync(tokensTsPath, ts);

console.log(`build-tokens: wrote ${resolved.length} tokens to tokens.ts + tokens.generated.css`);
