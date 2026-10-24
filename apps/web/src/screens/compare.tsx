// T-480 — THE COMPARE TAB: two versions of one document, side by side.
//
// *In plain terms: pick two versions and read them next to each other. For a
// document written in Infora, what was taken out is struck through on the left
// and what was put in is underlined on the right, with a line saying how many
// changes there are. For an uploaded document (a PDF) the two files sit side by
// side — Infora does not read inside a PDF to compare it, and says so.*
//
// No new read: a version's text is the Versions tab's own read (`api.version`),
// its files are the renditions the page already holds. The versions offered are
// the ones the page lists for this person, so nobody can compare what they may
// not already open.
import { useEffect, useMemo, useState } from 'react';
import type { Rendition } from '@infora/contracts';
import { Button, Markdown, SelectInput } from '@infora/ui';
import { api } from '../api';
import { changeCountWords, diffVersions, type DiffRow, type DiffRun } from './version-diff';
import { formatDate } from './shared';

export type CompareVersion = { versionId: string; versionReference: string; createdAt: string | null; note: string };

/** One side of the comparison once loaded: its text (null for an upload) and its PDF. */
export type CompareSide = {
  versionId: string;
  reference: string;
  /** the version's authored text; null when it has none (an uploaded document) or could not be read */
  text: string | null;
  /** the text read itself failed (not the same as a version that has no text) */
  textFailed?: boolean;
  pdfId: string | null;
  nativeId: string | null;
  nativeFormat: string | null;
};

export const PDF_SENTENCE = 'Side by side — Infora does not compare the contents of PDFs.';

/** Which two versions are showing: the ones the link names, else the previous and the current. */
export function resolvePair(
  versions: ReadonlyArray<Pick<CompareVersion, 'versionId'>>,
  fromParam: string | null,
  toParam: string | null,
): { from: string; to: string } | null {
  if (versions.length < 2) return null;
  const has = (id: string | null) => id !== null && versions.some((v) => v.versionId === id);
  const to = has(toParam) ? toParam! : versions[0]!.versionId;
  const from = has(fromParam) ? fromParam! : (versions.find((v) => v.versionId !== to) ?? versions[1]!).versionId;
  return { from, to };
}

const optionLabel = (v: CompareVersion) =>
  `${v.versionReference} — ${v.createdAt ? formatDate(v.createdAt) : v.note}`;

export function ComparePanel(props: {
  versions: CompareVersion[];
  renditionsByVersion: Record<string, Rendition[]>;
  from: string | null;
  to: string | null;
  onPick: (from: string, to: string) => void;
}) {
  const pair = resolvePair(props.versions, props.from, props.to);
  const [sides, setSides] = useState<Record<string, CompareSide>>({});
  const ids = pair ? [pair.from, pair.to] : [];
  const key = ids.join('|');
  useEffect(() => {
    let live = true;
    for (const id of key === '' ? [] : key.split('|')) {
      const v = props.versions.find((x) => x.versionId === id);
      if (!v) continue;
      void (async () => {
        let textFailed = false;
        const [text, renditions] = await Promise.all([
          api.version(id).then((r) => (r.content.trim() === '' ? null : r.content), () => {
            textFailed = true;
            return null;
          }),
          props.renditionsByVersion[id]
            ? Promise.resolve(props.renditionsByVersion[id]!)
            : api.renditions(id).then((r) => r.items, () => [] as Rendition[]),
        ]);
        const pdf = renditions.find((r) => r.kind === 'pdf') ?? null;
        const native = renditions.find((r) => r.kind === 'native') ?? null;
        if (live)
          setSides((s) => ({
            ...s,
            [id]: {
              versionId: id,
              reference: v.versionReference,
              text,
              textFailed,
              pdfId: pdf?.id ?? null,
              nativeId: native?.id ?? null,
              nativeFormat: native?.format ?? null,
            },
          }));
      })();
    }
    return () => {
      live = false;
    };
    // the pair is what to fetch; the lists are read when it changes
  }, [key]);

  if (!pair) return null;
  const options = props.versions.map((v) => ({ value: v.versionId, label: optionLabel(v) }));
  const left = sides[pair.from] ?? null;
  const right = sides[pair.to] ?? null;
  return (
    <CompareView
      left={left}
      right={right}
      pickers={[
        <SelectInput
          key="from"
          value={pair.from}
          onChange={(v) => props.onPick(v, pair.to)}
          options={options}
          ariaLabel="Compare — the older version"
        />,
        <SelectInput
          key="to"
          value={pair.to}
          onChange={(v) => props.onPick(pair.from, v)}
          options={options}
          ariaLabel="Compare — the newer version"
        />,
      ]}
    />
  );
}

/** The comparison itself, from two loaded sides (null while one is loading). */
export function CompareView(props: {
  left: CompareSide | null;
  right: CompareSide | null;
  pickers?: [React.ReactNode, React.ReactNode];
}) {
  const { left, right } = props;
  const textual = left !== null && right !== null && left.text !== null && right.text !== null;
  const diff = useMemo(() => (textual ? diffVersions(left.text!, right.text!) : null), [textual, left, right]);
  const head = (side: CompareSide | null, picker: React.ReactNode, label: string) => (
    <div>
      <div className="section-label" style={{ margin: '0 0 6px' }}>{label}</div>
      {picker}
    </div>
  );
  return (
    <div data-compare>
      <div className="compare-two" style={{ marginBottom: 12 }}>
        {head(left, props.pickers?.[0] ?? null, 'Older')}
        {head(right, props.pickers?.[1] ?? null, 'Newer')}
      </div>
      {left === null || right === null ? (
        <span style={{ color: 'var(--text-muted)' }}>Loading…</span>
      ) : diff ? (
        <>
          <p data-compare-count style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 500 }}>
            {changeCountWords(diff)}
          </p>
          <DiffRows key={`${left.versionId}|${right.versionId}`} rows={diff.rows} />
        </>
      ) : (
        <>
          <p data-compare-note className="field-hint" style={{ marginTop: 0 }}>
            {left.textFailed || right.textFailed ? 'This version\'s text could not be loaded.' : PDF_SENTENCE}
          </p>
          <div className="compare-two">
            <FilePane side={left} which="older" />
            <FilePane side={right} which="newer" />
          </div>
        </>
      )}
    </div>
  );
}

function FilePane(props: { side: CompareSide; which: 'older' | 'newer' }) {
  const { side } = props;
  return (
    <div className="card compare-pane" data-side={props.which} style={{ padding: '12px 14px' }}>
      <div className="mono" style={{ fontSize: 12.5, marginBottom: 8 }}>{side.reference}</div>
      {side.pdfId ? (
        <object
          data={`/renditions/${side.pdfId}/file`}
          type="application/pdf"
          data-compare-pdf
          style={{ width: '100%', height: '64vh', border: '1px solid var(--border-default)', borderRadius: 6 }}
        >
          <p style={{ color: 'var(--text-muted)' }}>
            Your browser can’t preview the PDF — <a href={`/renditions/${side.pdfId}/file`}>download it</a>.
          </p>
        </object>
      ) : side.text !== null ? (
        <Markdown>{side.text}</Markdown>
      ) : side.nativeId ? (
        <p style={{ color: 'var(--text-secondary)' }}>
          The native file <span className="mono">.{side.nativeFormat}</span> is ready —{' '}
          <a href={`/renditions/${side.nativeId}/file`}>download it</a>.
        </p>
      ) : (
        <p style={{ color: 'var(--text-muted)' }}>This version has no file to show.</p>
      )}
    </div>
  );
}

const Runs = (props: { runs: DiffRun[] }) => (
  <>
    {props.runs.map((r, i) => (
      <span key={i}>
        {i > 0 && ' '}
        {r.kind === 'ins' ? (
          <ins data-change={r.change}>{r.text}</ins>
        ) : r.kind === 'del' ? (
          <del data-change={r.change}>{r.text}</del>
        ) : (
          r.text
        )}
      </span>
    ))}
  </>
);

/** Unchanged paragraphs fold away when two or more sit together. */
const FOLD_FROM = 2;

function DiffRows(props: { rows: DiffRow[] }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const groups: Array<{ start: number; rows: DiffRow[]; same: boolean }> = [];
  props.rows.forEach((row, i) => {
    const same = row.kind === 'same';
    const last = groups.at(-1);
    if (last && last.same === same && same) last.rows.push(row);
    else groups.push({ start: i, rows: [row], same });
  });
  const cell = (runs: DiffRun[], which: 'older' | 'newer') => (
    <div className="compare-cell" data-side={which} data-label={which === 'older' ? 'Older' : 'Newer'}>
      <Runs runs={runs} />
    </div>
  );
  const row = (r: DiffRow, i: number) => (
    <div key={i} className="compare-row" data-row={r.kind}>
      {cell(r.left, 'older')}
      {cell(r.right, 'newer')}
    </div>
  );
  return (
    <div className="card compare-pane" style={{ padding: '4px 14px' }}>
      {groups.map((g) =>
        g.same && g.rows.length >= FOLD_FROM && !open.has(g.start) ? (
          <div key={g.start} className="compare-fold">
            <Button size="sm" variant="quiet" onClick={() => setOpen((s) => new Set(s).add(g.start))}>
              … {g.rows.length} unchanged paragraphs …
            </Button>
          </div>
        ) : (
          g.rows.map((r, k) => row(r, g.start + k))
        ),
      )}
    </div>
  );
}
