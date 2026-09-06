// T-441 — the rows of an app table on screen, and the acceptance flow
// (ADR-0056 §2, §2a; the approved mockup `returns-app-two-seats.html`).
//
// *In plain terms: the form a contractor fills in, and the list the client
// reads. The same component renders both, because it is the same app — each
// person simply reads the rows they may read and is offered the acts they may
// perform.*
//
// 🔒 **ONE COMPONENT, TWO SEATS, NO SWITCH BETWEEN THEM** (ADR-0056 §4). There
// is no `viewer` prop, no `isOwner` branch and no `role` here. Nadia at Redgate
// sees her organisation's returns because those are the rows the API gave her;
// Rachel at Trentmoor sees every organisation's because those are the rows the
// API gave her. What makes one app behave as two is the read predicate, not a
// screen deciding what to draw.
//
// 🔒 **EVERY ACT IS OFFERED FROM THE SERVER'S OWN ANSWER** — `mayEdit`,
// `maySubmit`, `mayDecide`, `mayCorrect`, `mayRetire`, each computed beside the
// predicate that decided the row was visible at all. A control derived here
// would be a second copy of the rule.
//
// **The rejection reason is on the row, always.** A rejected row shows who
// rejected it and what they said, to the organisation that submitted it — the
// review record's precedent, that every comment gets a response, applied to a
// figure. A rejection with no reason becomes a phone call, which is the record
// failing.
import { useCallback, useEffect, useState } from 'react';
import type { AppColumn, AppRowRecord, AppState, AppTableRecord } from '@infora/contracts';
import type { BadgeTone } from '@infora/ui';
import { Badge, Button, Card, Field, SectionLabel, Table, TextInput } from '@infora/ui';
import { api } from '../api';
import { formatDateTime } from './shared';

const ROW_STATE: Record<string, { tone: BadgeTone; label: string }> = {
  draft: { tone: 'neutral', label: 'Draft' },
  submitted: { tone: 'warning', label: 'Submitted' },
  accepted: { tone: 'success', label: 'Accepted' },
  rejected: { tone: 'danger', label: 'Rejected' },
  superseded: { tone: 'neutral', label: 'Superseded' },
};

/** The form's own state: one string per declared column, converted on the way
 * out. Kept as text because that is what an input holds, and a half-typed
 * number is not a number. */
type Draft = Record<string, string>;

function emptyDraft(columns: AppColumn[]): Draft {
  return Object.fromEntries(columns.map((column) => [column.key, '']));
}

function toValues(columns: AppColumn[], draft: Draft): Record<string, unknown> {
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
  return values;
}

export function AppTableRows(props: {
  table: AppTableRecord;
  appState: AppState;
  onChanged: () => void;
}) {
  const { table } = props;
  const columns = table.columns;
  const [rows, setRows] = useState<AppRowRecord[] | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(columns));
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    void api.appRows(table.id).then(
      (res) => setRows(res.items),
      () => setRows(null),
    );
  }, [table.id]);
  useEffect(load, [load]);

  const act = async (run: () => Promise<unknown>, failure: string) => {
    setNotice(null);
    try {
      await run();
      load();
      props.onChanged();
    } catch {
      setNotice(failure);
    }
  };

  const enter = (submit: boolean) =>
    act(async () => {
      if (correcting !== null) {
        await api.correctAppRow(correcting, { values: toValues(columns, draft), submit });
        setCorrecting(null);
      } else {
        await api.enterAppRow(table.id, { values: toValues(columns, draft), submit });
      }
      setDraft(emptyDraft(columns));
    }, 'That could not be saved. Check the figures and try again.');

  return (
    <>
      <SectionLabel>{table.name}</SectionLabel>
      <Card>
        {table.hasAcceptance ? (
          <p className="page-sub">
            Save a draft as the figures come in; submit when it is complete. A draft is read by your
            organisation and by nobody else — not even the project owner — until you submit it. A
            submitted row is accepted or rejected by the project owner, and a rejected one is
            corrected by submitting again.
          </p>
        ) : (
          <p className="page-sub">
            Rows here are simply entered. Each one remembers your organisation and your name, and is
            read by your organisation and by the project owner.
          </p>
        )}

        {props.appState !== 'closed' && (
          <div style={{ marginTop: 8 }}>
            {correcting !== null && (
              <Badge tone="info">Correcting an earlier row — this will supersede it</Badge>
            )}
            {columns.map((column) => (
              <Field
                key={column.key}
                label={column.label}
                {...(column.required && { hint: 'Required' })}
              >
                <TextInput
                  value={draft[column.key] ?? ''}
                  onChange={(value) => setDraft((d) => ({ ...d, [column.key]: value }))}
                />
              </Field>
            ))}
            <div className="shelf-head" style={{ gap: 8 }}>
              {table.hasAcceptance && <Button onClick={() => void enter(false)}>Save draft</Button>}
              <Button onClick={() => void enter(true)}>
                {table.hasAcceptance ? 'Submit' : 'Add the row'}
              </Button>
              {correcting !== null && (
                <Button onClick={() => setCorrecting(null)}>Cancel the correction</Button>
              )}
            </div>
          </div>
        )}

        {notice !== null && <p className="page-sub">{notice}</p>}

        {rows === null ? (
          <p className="page-sub">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="page-sub">No rows yet.</p>
        ) : (
          <Table>
            <table>
              <thead>
                <tr>
                  <th>Organisation</th>
                  {columns.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                  <th>State</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} style={{ opacity: row.retiredAt === null ? 1 : 0.55 }}>
                    <td>
                      {row.organisationName}
                      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {row.enteredByName}
                      </div>
                    </td>
                    {columns.map((column) => (
                      <td key={column.key}>{String(row.values[column.key] ?? '—')}</td>
                    ))}
                    <td>
                      {row.state === null ? (
                        <span className="page-sub">—</span>
                      ) : (
                        <Badge tone={ROW_STATE[row.state]!.tone}>{ROW_STATE[row.state]!.label}</Badge>
                      )}
                      {row.decidedAt !== null && (
                        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          {formatDateTime(row.decidedAt)}
                          {row.decidedByName === null ? '' : ` · ${row.decidedByName}`}
                        </div>
                      )}
                      {/* the reason, on the row, for the organisation that
                          submitted it — ruling 4 */}
                      {row.rejectionReason !== null && (
                        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          “{row.rejectionReason}”
                        </div>
                      )}
                      {row.supersededByRowId !== null && (
                        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>· superseded</div>
                      )}
                      {row.retiredAt !== null && (
                        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>· retired</div>
                      )}
                    </td>
                    <td>
                      <div className="shelf-head" style={{ gap: 6 }}>
                        {row.maySubmit && (
                          <Button
                            onClick={() =>
                              void act(() => api.submitAppRow(row.id), 'That could not be submitted.')
                            }
                          >
                            Submit
                          </Button>
                        )}
                        {row.mayDecide && (
                          <>
                            <Button
                              onClick={() =>
                                void act(
                                  () => api.decideAppRow(row.id, { decision: 'accept' }),
                                  'That could not be accepted.',
                                )
                              }
                            >
                              Accept
                            </Button>
                            <Button onClick={() => setRejecting(row.id)}>Reject — say why…</Button>
                          </>
                        )}
                        {row.mayCorrect && (
                          <Button
                            onClick={() => {
                              setCorrecting(row.id);
                              setDraft(
                                Object.fromEntries(
                                  columns.map((column) => [
                                    column.key,
                                    String(row.values[column.key] ?? ''),
                                  ]),
                                ),
                              );
                            }}
                          >
                            Correct
                          </Button>
                        )}
                        {row.mayRetire && (
                          <Button
                            onClick={() =>
                              void act(() => api.retireAppRow(row.id), 'That could not be retired.')
                            }
                          >
                            Retire
                          </Button>
                        )}
                      </div>
                      {rejecting === row.id && (
                        <div style={{ marginTop: 6 }}>
                          <Field
                            label="Why is it being rejected?"
                            hint="The organisation that submitted it reads this on the row. A rejection has to say why."
                          >
                            <TextInput value={reason} onChange={setReason} />
                          </Field>
                          <Button
                            disabled={reason.trim() === ''}
                            onClick={() =>
                              void act(async () => {
                                await api.decideAppRow(row.id, {
                                  decision: 'reject',
                                  reason: reason.trim(),
                                });
                                setRejecting(null);
                                setReason('');
                              }, 'That could not be rejected.')
                            }
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Table>
        )}
      </Card>
    </>
  );
}
