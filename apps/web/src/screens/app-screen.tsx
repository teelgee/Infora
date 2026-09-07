// T-442 — **the generated screen, drawn** (ADR-0056 §11).
//
// *In plain terms: this is where an app's own screen appears — the form a
// contractor fills in, the dashboard the client reads. The builder's agent
// wrote a short list of parts, and this file draws them.*
//
// 🔒 **THIS MODULE HAS NO OUTWARD REACH, AND A GUARD IN `pnpm run check` KEEPS
// IT THAT WAY.** `scripts/source-rules.mjs` rule 4 fences this exact file: no
// `fetch`, no socket, no markup that could carry a URL, nothing that evaluates
// text as code. ADR-0056 §11 rules that a generated screen runs in the viewer's
// browser, calls Infora's API as the viewer, holds no secret and reaches no
// outside system — and this is the half of that guarantee a grammar alone
// cannot give. The other half is the grammar itself
// (`packages/contracts/src/app-builder.ts`), whose six block shapes have no
// field that could hold a URL, an endpoint or a key.
//
// So: a generated screen's ONLY data source is the row list this file asks
// `AppTableRows`' own route for, through the typed API, as the viewer.
//
// 🔒 **NO PERMISSION IS COMPUTED HERE, AND NO ROW IS SELECTED HERE.** The rows
// arrive already decided by `canReadAppRow`; the totals below are sums of what
// arrived. That is what makes one screen behave as two — Nadia at Redgate sees
// her firm's returns, Rachel at Trentmoor sees every firm's — with no branch in
// this file and no `viewer` prop anywhere in it.
//
// **The parts are drawn plainly, in the kit.** T-441's precedent: the approved
// drawing is the acts and the states, and the plain kit is how they are
// rendered. A generated screen that could bring its own styling would be a
// second design system nobody reviewed.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppRowRecord, AppScreen, AppScreenBlock, AppState, AppTableRecord } from '@infora/contracts';
import { parseAppScreen } from '@infora/contracts';
import { Badge, Button, Card, Field, SectionLabel, Table, TextInput } from '@infora/ui';
import { api } from '../api';

const ROW_STATE_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  accepted: 'Accepted',
  rejected: 'Rejected',
  superseded: 'Superseded',
};

/**
 * Read a stored screen back for one table.
 *
 * Refuses on the way in as well as on the way out: a screen naming a column the
 * table no longer declares is not drawn at all. A builder who retires a column
 * out from under a published screen is told the screen needs redrawing, which
 * is honest; a screen quietly rendering an empty column is not.
 */
export function screenFor(source: string | null, table: AppTableRecord): AppScreen | null {
  return parseAppScreen(
    source,
    table.columns.map((column) => column.key),
  );
}

/** One block, drawn. Every branch renders text as text. */
export function ScreenBlock(props: {
  block: AppScreenBlock;
  table: AppTableRecord;
  rows: AppRowRecord[];
  onEnter: (values: Record<string, unknown>) => void;
  pending: boolean;
}) {
  const { block, table, rows } = props;
  const label = (key: string) => table.columns.find((column) => column.key === key)?.label ?? key;

  if (block.kind === 'heading') return <SectionLabel>{block.text}</SectionLabel>;
  if (block.kind === 'paragraph') return <p className="page-sub">{block.text}</p>;

  if (block.kind === 'count') {
    return (
      <p className="page-sub">
        {block.label}: <strong>{rows.length}</strong>
      </p>
    );
  }

  if (block.kind === 'total') {
    // the sum of what THIS viewer received — never a figure computed elsewhere
    // and handed down, which would be a number about rows they cannot read
    const total = rows.reduce((sum, row) => {
      const value = row.values[block.columnKey];
      return typeof value === 'number' ? sum + value : sum;
    }, 0);
    return (
      <p className="page-sub">
        {block.label}: <strong>{Number.isInteger(total) ? total : total.toFixed(2)}</strong>
      </p>
    );
  }

  if (block.kind === 'rowForm') {
    return (
      <ScreenForm
        block={block}
        table={table}
        onEnter={props.onEnter}
        pending={props.pending}
        label={label}
      />
    );
  }

  return (
    <Table>
      <table>
        <thead>
          <tr>
            {block.showOrganisation && <th>Organisation</th>}
            {block.columnKeys.map((key) => (
              <th key={key}>{label(key)}</th>
            ))}
            {block.showState && <th>State</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={
                  block.columnKeys.length + (block.showOrganisation ? 1 : 0) + (block.showState ? 1 : 0)
                }
              >
                <span className="page-sub">Nothing entered yet.</span>
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                {block.showOrganisation && <td>{row.organisationName}</td>}
                {block.columnKeys.map((key) => (
                  <td key={key}>{formatValue(row.values[key])}</td>
                ))}
                {block.showState && (
                  <td>
                    {row.state === null ? (
                      <span className="page-sub">—</span>
                    ) : (
                      <Badge tone={row.state === 'accepted' ? 'success' : row.state === 'rejected' ? 'danger' : 'neutral'}>
                        {ROW_STATE_LABEL[row.state] ?? row.state}
                      </Badge>
                    )}
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </Table>
  );
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/** The form part. It enters a row through the ordinary row route — the same one
 * the plain rows screen uses — so nothing about a generated screen is a second
 * way into the store. */
function ScreenForm(props: {
  block: Extract<AppScreenBlock, { kind: 'rowForm' }>;
  table: AppTableRecord;
  onEnter: (values: Record<string, unknown>) => void;
  pending: boolean;
  label: (key: string) => string;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const columns = props.block.columnKeys.map(
    (key) => props.table.columns.find((column) => column.key === key)!,
  );

  const enter = () => {
    const values: Record<string, unknown> = {};
    for (const column of columns) {
      const raw = (draft[column.key] ?? '').trim();
      if (raw === '') continue;
      values[column.key] =
        column.type === 'number'
          ? Number(raw)
          : column.type === 'boolean'
            ? raw.toLowerCase() === 'yes' || raw === 'true'
            : raw;
    }
    props.onEnter(values);
    setDraft({});
  };

  return (
    <div>
      {columns.map((column) => (
        <Field key={column.key} label={props.label(column.key)}>
          <TextInput
            value={draft[column.key] ?? ''}
            onChange={(next) => setDraft((prev) => ({ ...prev, [column.key]: next }))}
          />
        </Field>
      ))}
      <Button onClick={enter} disabled={props.pending}>
        {props.block.submitLabel}
      </Button>
    </div>
  );
}

/**
 * A whole published screen, opened by whoever the API offered it to.
 *
 * The interface list this comes from is narrowed SERVER-SIDE (`apps.ts`,
 * `openableInterfaces`): a screen this person may not open never reached the
 * browser, so there is no decision left for this component to make.
 */
export function GeneratedScreen(props: {
  source: string | null;
  table: AppTableRecord;
  appState: AppState;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<AppRowRecord[] | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const screen = useMemo(() => screenFor(props.source, props.table), [props.source, props.table]);

  const load = useCallback(() => {
    void api.appRows(props.table.id).then(
      (res) => setRows(res.items),
      // a failed read is not an empty table: drawing "nothing entered yet" off a
      // request that did not answer is a claim we cannot make
      () => setRows(null),
    );
  }, [props.table.id]);
  useEffect(load, [load]);

  const enter = async (values: Record<string, unknown>) => {
    setPending(true);
    setNotice(null);
    try {
      await api.enterAppRow(props.table.id, { values, submit: props.table.hasAcceptance });
      load();
      props.onChanged?.();
    } catch {
      setNotice('That could not be entered. Check the figures and try again.');
    } finally {
      setPending(false);
    }
  };

  if (screen === null) {
    return (
      <Card>
        <p className="page-sub">
          This screen has not been drawn yet, or it names a column the table no longer has. Its
          builder can redraw it in the app builder.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      {rows === null ? (
        <p className="page-sub">Loading…</p>
      ) : (
        screen.blocks.map((block, index) => (
          <ScreenBlock
            key={index}
            block={block}
            table={props.table}
            rows={rows}
            onEnter={(values) => void enter(values)}
            pending={pending || props.appState !== 'open'}
          />
        ))
      )}
      {notice !== null && <p className="page-sub">{notice}</p>}
    </Card>
  );
}
