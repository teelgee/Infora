#!/usr/bin/env node
/**
 * tldr-to-png.mjs — render a tldraw .tldr file to a legible PNG, locally.
 *
 * Usage:
 *   node scripts/tldr-to-png.mjs <input.tldr> [output.png]
 *   node scripts/tldr-to-png.mjs --all        # render every docs/architecture/diagrams/*.tldr
 *                                             # into docs/architecture/diagrams/rendered/ (gitignored)
 *   node scripts/tldr-to-png.mjs --help
 *
 * No tldraw dependency and no network: the .tldr JSON store is parsed by hand
 * (geo shapes, text shapes, arrows + their bindings, frames, notes; richText is
 * tiptap JSON and is flattened to plain text). The shapes are laid out as an
 * absolutely-positioned HTML page and screenshotted with the Chromium that is
 * already installed for the e2e package (resolved from e2e/node_modules).
 *
 * Fidelity is deliberately approximate — right boxes, right labels, right
 * arrows, right places — not a pixel-faithful tldraw render.
 */

import { createRequire } from 'node:module';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const diagramsDir = path.join(repoRoot, 'docs', 'architecture', 'diagrams');
const defaultAllOutDir = path.join(diagramsDir, 'rendered');

// ---------------------------------------------------------------------------
// tldraw palette / size approximations
// ---------------------------------------------------------------------------

const COLORS = {
  black: '#1d1d1d',
  grey: '#9fa8b2',
  'light-violet': '#e085f4',
  violet: '#ae3ec9',
  blue: '#4263eb',
  'light-blue': '#4dabf7',
  yellow: '#f1ac4b',
  orange: '#f76707',
  green: '#099268',
  'light-green': '#4cb05e',
  'light-red': '#f87777',
  red: '#e03131',
  white: '#f3f4f6',
};
const color = (c) => COLORS[c] ?? COLORS.black;
// "semi"/"solid" fills → light wash of the shape colour so boxes stay readable.
const fillFor = (props) => {
  if (props.fill === 'none' || !props.fill) return 'transparent';
  if (props.fill === 'semi') return '#f1f3f9';
  return `color-mix(in srgb, ${color(props.color)} 18%, white)`;
};

const LABEL_FONT = { s: 18, m: 22, l: 26, xl: 32 };
const TEXT_FONT = { s: 24, m: 28, l: 36, xl: 44 };
const STROKE = { s: 2, m: 3.5, l: 5, xl: 8 };

// ---------------------------------------------------------------------------
// tldr store parsing
// ---------------------------------------------------------------------------

/** Flatten tiptap richText JSON (or legacy props.text) to plain text. */
function plainText(props) {
  if (typeof props?.text === 'string') return props.text;
  const doc = props?.richText;
  if (!doc || typeof doc !== 'object') return '';
  const blocks = [];
  const walkInline = (node, out) => {
    if (node.type === 'text' && typeof node.text === 'string') out.push(node.text);
    for (const child of node.content ?? []) walkInline(child, out);
  };
  const walkBlock = (node) => {
    if (node.type === 'paragraph' || node.type?.endsWith('eading')) {
      const out = [];
      walkInline(node, out);
      blocks.push(out.join(''));
      return;
    }
    for (const child of node.content ?? []) walkBlock(child);
  };
  walkBlock(doc);
  return blocks.join('\n').replace(/\n+$/, '');
}

function parseTldr(json) {
  const store = JSON.parse(json);
  const records = store.records ?? [];
  const shapes = records
    .filter((r) => r.typeName === 'shape')
    .sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0)); // fractional index = z-order
  const bindings = records.filter((r) => r.typeName === 'binding' && r.type === 'arrow');
  return { shapes, bindings };
}

/** Rough bounds for any shape (text height is estimated from line count). */
function shapeBounds(s) {
  const p = s.props ?? {};
  if (s.type === 'text') {
    const fs = TEXT_FONT[p.size] ?? 24;
    const lines = Math.max(1, plainText(p).split('\n').length);
    const w = p.autoSize ? Math.max(...plainText(p).split('\n').map((l) => l.length), 1) * fs * 0.55 : (p.w ?? 200);
    return { x: s.x, y: s.y, w, h: lines * fs * 1.35 };
  }
  if (s.type === 'note') return { x: s.x, y: s.y, w: 200, h: 200 + (p.growY ?? 0) };
  if (s.type === 'arrow') {
    const x1 = s.x + (p.start?.x ?? 0);
    const y1 = s.y + (p.start?.y ?? 0);
    const x2 = s.x + (p.end?.x ?? 0);
    const y2 = s.y + (p.end?.y ?? 0);
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
  }
  return { x: s.x, y: s.y, w: p.w ?? 100, h: (p.h ?? 100) + (p.growY ?? 0) };
}

// ---------------------------------------------------------------------------
// arrow geometry
// ---------------------------------------------------------------------------

/** Point where the segment from `inside` (within rect) towards `outside` crosses the rect edge. */
function clipToRect(inside, outside, rect, pad = 4) {
  const { x, y, w, h } = rect;
  const dx = outside.x - inside.x;
  const dy = outside.y - inside.y;
  let tMin = 1;
  const candidates = [];
  if (dx !== 0) candidates.push((x - pad - inside.x) / dx, (x + w + pad - inside.x) / dx);
  if (dy !== 0) candidates.push((y - pad - inside.y) / dy, (y + h + pad - inside.y) / dy);
  for (const t of candidates) {
    if (t > 0 && t <= 1) {
      const px = inside.x + dx * t;
      const py = inside.y + dy * t;
      if (
        px >= x - pad - 0.5 && px <= x + w + pad + 0.5 &&
        py >= y - pad - 0.5 && py <= y + h + pad + 0.5
      ) tMin = Math.min(tMin, t);
    }
  }
  return { x: inside.x + dx * tMin, y: inside.y + dy * tMin };
}

/** Resolve an arrow's terminals, honouring bindings, and clip to bound-shape edges. */
function arrowGeometry(arrow, bindings, shapeById) {
  const p = arrow.props ?? {};
  const terminal = (name) => {
    const local = p[name] ?? { x: 0, y: 0 };
    const point = { x: arrow.x + local.x, y: arrow.y + local.y };
    const binding = bindings.find((b) => b.fromId === arrow.id && b.props?.terminal === name);
    const target = binding ? shapeById.get(binding.toId) : undefined;
    if (!target) return { point, rect: null };
    const rect = shapeBounds(target);
    const anchor = binding.props?.isPrecise
      ? { x: rect.x + rect.w * binding.props.normalizedAnchor.x, y: rect.y + rect.h * binding.props.normalizedAnchor.y }
      : { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
    return { point: anchor, rect };
  };
  const start = terminal('start');
  const end = terminal('end');
  let a = start.point;
  let b = end.point;
  if (start.rect) a = clipToRect(start.point, end.point, start.rect);
  if (end.rect) b = clipToRect(end.point, start.point, end.rect);
  // Quadratic-bezier control point reproducing tldraw's arc "bend" midpoint.
  const bend = p.bend ?? 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const ctrl = { x: mid.x - (dy / len) * 2 * bend, y: mid.y + (dx / len) * 2 * bend };
  const labelAt = {
    x: 0.25 * a.x + 0.5 * ctrl.x + 0.25 * b.x,
    y: 0.25 * a.y + 0.5 * ctrl.y + 0.25 * b.y,
  };
  return { a, b, ctrl, labelAt, curved: bend !== 0 };
}

// ---------------------------------------------------------------------------
// HTML generation
// ---------------------------------------------------------------------------

const esc = (s) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const escLines = (s) => esc(s).replaceAll('\n', '<br>');
const round = (n) => Math.round(n * 100) / 100;

function buildHtml({ shapes, bindings }) {
  const shapeById = new Map(shapes.map((s) => [s.id, s]));

  // Overall bounds.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of shapes) {
    const b = shapeBounds(s);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  if (!Number.isFinite(minX)) { minX = minY = 0; maxX = maxY = 100; }
  const PAD = 48;
  const width = Math.ceil(maxX - minX + PAD * 2);
  const height = Math.ceil(maxY - minY + PAD * 2);
  const ox = PAD - minX;
  const oy = PAD - minY;

  const divs = [];
  const svgParts = [];
  const markerColors = new Set();

  for (const s of shapes) {
    const p = s.props ?? {};
    if (s.type === 'arrow') {
      const g = arrowGeometry(s, bindings, shapeById);
      const stroke = color(p.color);
      markerColors.add(p.color ?? 'black');
      const dash = p.dash === 'dashed' ? ' stroke-dasharray="8 6"' : p.dash === 'dotted' ? ' stroke-dasharray="2 5"' : '';
      const markerEnd = p.arrowheadEnd && p.arrowheadEnd !== 'none' ? ` marker-end="url(#ah-${p.color ?? 'black'})"` : '';
      const markerStart = p.arrowheadStart && p.arrowheadStart !== 'none' ? ` marker-start="url(#ah-${p.color ?? 'black'})"` : '';
      const d = g.curved
        ? `M ${round(g.a.x + ox)} ${round(g.a.y + oy)} Q ${round(g.ctrl.x + ox)} ${round(g.ctrl.y + oy)} ${round(g.b.x + ox)} ${round(g.b.y + oy)}`
        : `M ${round(g.a.x + ox)} ${round(g.a.y + oy)} L ${round(g.b.x + ox)} ${round(g.b.y + oy)}`;
      svgParts.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${STROKE[p.size] ?? 2}"${dash}${markerEnd}${markerStart}/>`);
      const label = plainText(p);
      if (label) {
        divs.push(
          `<div class="alabel" style="left:${round(g.labelAt.x + ox)}px;top:${round(g.labelAt.y + oy)}px;color:${color(p.labelColor ?? p.color)};font-size:${(LABEL_FONT[p.size] ?? 18) * 0.85}px">${escLines(label)}</div>`,
        );
      }
      continue;
    }

    const b = shapeBounds(s);
    const left = round(b.x + ox);
    const top = round(b.y + oy);

    if (s.type === 'text') {
      const fs = TEXT_FONT[p.size] ?? 24;
      const alignMap = { start: 'left', middle: 'center', end: 'right' };
      divs.push(
        `<div class="text" style="left:${left}px;top:${top}px;width:${round(b.w)}px;color:${color(p.color)};font-size:${fs}px;text-align:${alignMap[p.textAlign] ?? 'left'}">${escLines(plainText(p))}</div>`,
      );
      continue;
    }

    if (s.type === 'note') {
      divs.push(
        `<div class="note" style="left:${left}px;top:${top}px;width:${round(b.w)}px;height:${round(b.h)}px;font-size:${LABEL_FONT[p.size] ?? 18}px">${escLines(plainText(p))}</div>`,
      );
      continue;
    }

    if (s.type === 'frame') {
      divs.push(
        `<div class="frame" style="left:${left}px;top:${top}px;width:${round(b.w)}px;height:${round(b.h)}px"><span class="frame-name">${esc(p.name ?? 'Frame')}</span></div>`,
      );
      continue;
    }

    // geo (and anything unknown, rendered as a box so nothing silently vanishes)
    const stroke = color(p.color);
    const borderStyle = p.dash === 'dashed' ? 'dashed' : p.dash === 'dotted' ? 'dotted' : 'solid';
    const justify = { start: 'flex-start', middle: 'center', end: 'flex-end' };
    const isDiamond = p.geo === 'diamond';
    const isEllipse = p.geo === 'ellipse' || p.geo === 'oval';
    let shapeCss = `border:${STROKE[p.size] ?? 2}px ${borderStyle} ${stroke};background:${fillFor(p)};`;
    if (isEllipse) shapeCss += 'border-radius:50%;';
    if (isDiamond) {
      // clip-path drops the CSS border, so paint the outline via the background.
      shapeCss = `clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);background:${stroke};padding:${STROKE[p.size] ?? 2}px;`;
    }
    const inner = isDiamond
      ? `<div class="geo-inner" style="clip-path:polygon(50% 1.5%,99% 50%,50% 98.5%,1% 50%);background:${p.fill === 'none' ? '#fff' : fillFor(p)}">`
      : '';
    const label = plainText(p);
    divs.push(
      `<div class="geo" style="left:${left}px;top:${top}px;width:${round(b.w)}px;height:${round(b.h)}px;${shapeCss}` +
        `align-items:${justify[p.verticalAlign] ?? 'center'};justify-content:${justify[p.align] ?? 'center'};` +
        `text-align:${p.align === 'start' ? 'left' : p.align === 'end' ? 'right' : 'center'}">` +
        `${inner}<span class="glabel" style="color:${color(p.labelColor ?? p.color)};font-size:${LABEL_FONT[p.size] ?? 18}px">${escLines(label)}</span>${inner ? '</div>' : ''}</div>`,
    );
  }

  const markers = [...markerColors]
    .map(
      (c) =>
        `<marker id="ah-${c}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="${color(c)}" stroke-width="1.8"/></marker>`,
    )
    .join('');

  // Cap the rasterised size so PNGs stay readable-but-loadable.
  const scale = Math.min(1, 4200 / Math.max(width, height));
  const outW = Math.ceil(width * scale);
  const outH = Math.ceil(height * scale);

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { background:#fff; }
  #clip { position:relative; width:${outW}px; height:${outH}px; overflow:hidden; }
  #canvas { position:absolute; left:0; top:0; width:${width}px; height:${height}px;
    transform:scale(${scale}); transform-origin:0 0;
    font-family:-apple-system, "Segoe UI", Helvetica, Arial, sans-serif; }
  #canvas svg { position:absolute; left:0; top:0; }
  .geo { position:absolute; display:flex; padding:10px; }
  .geo-inner { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; }
  .glabel { line-height:1.25; overflow-wrap:break-word; max-width:100%; }
  .text { position:absolute; line-height:1.3; white-space:pre-wrap; overflow-wrap:break-word; }
  .alabel { position:absolute; transform:translate(-50%,-50%); background:rgba(255,255,255,.92);
    padding:1px 5px; border-radius:3px; line-height:1.2; text-align:center; max-width:280px; }
  .note { position:absolute; background:#f5eb70; border-radius:8px; padding:14px;
    box-shadow:2px 3px 6px rgba(0,0,0,.15); line-height:1.25; overflow:hidden; }
  .frame { position:absolute; border:2px solid #777; background:rgba(255,255,255,.4); }
  .frame-name { position:absolute; top:-24px; left:0; font-size:15px; color:#555; }
  </style></head><body><div id="clip"><div id="canvas">
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${markers}</defs>${svgParts.join('')}</svg>
  ${divs.join('\n')}
  </div></div></body></html>`;

  return { html, outW, outH };
}

// ---------------------------------------------------------------------------
// rasterisation via the e2e package's Chromium
// ---------------------------------------------------------------------------

async function launchChromium() {
  const requireFromE2e = createRequire(path.join(repoRoot, 'e2e', 'package.json'));
  const { chromium } = requireFromE2e('@playwright/test');
  return chromium.launch();
}

async function renderFile(browser, inputPath, outputPath) {
  const json = await readFile(inputPath, 'utf8');
  const { html, outW, outH } = buildHtml(parseTldr(json));
  const page = await browser.newPage({
    viewport: { width: Math.min(outW, 1600), height: Math.min(outH, 1200) },
    deviceScaleFactor: Math.max(outW, outH) > 2400 ? 1.5 : 2,
  });
  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.locator('#clip').screenshot({ path: outputPath });
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const HELP = `Render a tldraw .tldr file to PNG (no tldraw, no network; uses e2e's Chromium).

Usage:
  node scripts/tldr-to-png.mjs <input.tldr> [output.png]   # default output: beside the input
  node scripts/tldr-to-png.mjs --all                       # all docs/architecture/diagrams/*.tldr
                                                           # -> docs/architecture/diagrams/rendered/
  node scripts/tldr-to-png.mjs --help
`;

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
    process.exit(args.length === 0 ? 1 : 0);
  }

  const browser = await launchChromium();
  try {
    if (args.includes('--all')) {
      await mkdir(defaultAllOutDir, { recursive: true });
      const files = (await readdir(diagramsDir)).filter((f) => f.endsWith('.tldr'));
      for (const f of files) {
        const out = path.join(defaultAllOutDir, `${path.basename(f, '.tldr')}.png`);
        await renderFile(browser, path.join(diagramsDir, f), out);
        console.log(out);
      }
    } else {
      const input = path.resolve(args[0]);
      const output = args[1] ? path.resolve(args[1]) : input.replace(/\.tldr$/, '') + '.png';
      await renderFile(browser, input, output);
      console.log(output);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err.stack ?? String(err));
  process.exit(1);
});
