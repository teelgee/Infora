// T-440 — the app instance on screen (ADR-0056), and the section it lives in.
//
// *In plain terms: a project's apps appear in the Tools section; opening one
// shows what it holds, who it is open to, and — for the people who built it —
// the controls to publish it, share a table, hand it to somebody else or close
// it.*
//
// 🔒 **ASSEMBLED, NOT FILTERED** (T-269's rule, the same one the tool cards
// follow). An app this person cannot open never reaches this component: the
// list endpoint has already decided. There is no `enabled` prop below and there
// must never be one — the moment a surface decides what to grey out, the
// section is advertising something the viewer has no way to reach.
//
// 🔒 **DEFUNCT IS RENDERED, NOT HIDDEN.** An app whose owner has left the
// project is *visibly not working* on its card and at the head of its own page,
// with no notification — the owner's 2026-09-06 ruling. That is the one case
// where showing something a person cannot use is right: a broken thing that
// says so on its face is what was chosen over a message in a tray, and hiding
// it would make the app vanish silently.
//
// 🔒 **NO PERMISSION IS COMPUTED HERE.** `mayBuild`, `mayCreate`,
// `isProjectOwner` and every `may*` on a row are the server's answers. A screen
// that worked one out would be a second copy of the access rule, and the first
// disagreement between the copies is a button offered to somebody the API then
// refuses.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type {
  AppColumnType,
  AppExportRecord,
  AppRecord,
  AppRunRecord,
  AppState,
  AppSummary,
  AppTableRecord,
  GetAppResponse,
  RosterEntry,
} from '@infora/contracts';
import type { BadgeTone } from '@infora/ui';
import { Badge, Button, Card, Field, SectionLabel, SelectInput, Table, TextInput } from '@infora/ui';
import { api } from '../api';
import { AppTableRows } from './app-rows';
import { GeneratedScreen } from './app-screen';
import { formatDateTime } from './shared';

/** How each state reads on a card, in the words a person would use. `defunct`
 * says what is wrong and what fixes it, because the ruling replaced a
 * notification with this sentence. */
const STATE: Record<AppState, { tone: BadgeTone; label: string }> = {
  open: { tone: 'success', label: 'Open' },
  unpublished: { tone: 'neutral', label: 'Not opened yet — only its builders can see it' },
  defunct: { tone: 'danger', label: 'Not working — it has no owner until someone is given it' },
  closed: { tone: 'neutral', label: 'Closed — its tables can still be read' },
};

// ── The section on the Tools screen ────────────────────────────────────────

/**
 * The project's apps.
 *
 * **Deliberately its own section rather than a tile in the standard tool
 * grid.** The Tools list above it is Infora's own standard tools, assembled
 * from what this deployment carries and what this person is entitled to; an app
 * is a thing a firm built inside one project, and putting it in the same grid
 * would say the two are the same kind of thing.
 */
export function AppsSection({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<AppSummary[] | null>(null);
  const [mayCreate, setMayCreate] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    void api
      .apps(projectId)
      .then((res) => {
        setItems(res.items);
        setMayCreate(res.mayCreate);
      })
      // a failed read is not an empty list: rendering "no apps" off a request
      // that did not answer is a claim we cannot make
      .catch(() => setItems(null));
  }, [projectId]);
  useEffect(load, [load]);

  const create = async () => {
    if (name.trim() === '') return;
    setCreating(true);
    setError(null);
    try {
      await api.createApp(projectId, { name: name.trim(), organisationIds: [], participantIds: [] });
      setName('');
      load();
    } catch {
      setError('That could not be created. Your organisation decides who may build an app.');
    } finally {
      setCreating(false);
    }
  };

  if (items === null) return null;

  return (
    <>
      <SectionLabel>Apps built for this project</SectionLabel>
      <Card>
        <p className="page-sub">
          Apps a firm has had built inside this scheme — a form to fill in, a register, a dashboard.
          Every row somebody types in one remembers which organisation and which person entered it,
          and is read by that organisation and by the project owner, and by nobody else.
        </p>
        {items.length === 0 ? (
          <p className="page-sub">No apps yet.</p>
        ) : (
          <div className="tool-cards">
            {items.map((item) => (
              <Link key={item.id} className="tool-card" to={`/projects/${projectId}/tools/apps/${item.id}`}>
                <span className="tool-card-head">
                  <span className="tool-card-name">{item.name}</span>
                  <Badge tone={STATE[item.state].tone}>{STATE[item.state].label}</Badge>
                </span>
                <p className="tool-card-desc">
                  {item.description ??
                    (item.ownerName === null
                      ? 'Nobody owns this app.'
                      : `Owned by ${item.ownerName}.`)}
                </p>
              </Link>
            ))}
          </div>
        )}
        {/* rendered only where the server said this person may create one — the
            org admin's per-person toggle (ADR-0056 §12), never a disabled field */}
        {mayCreate && (
          <div className="shelf-head" style={{ marginTop: 12, gap: 8 }}>
            <Field label="New app">
              <TextInput value={name} onChange={setName} placeholder="Sustainability returns" />
            </Field>
            <Button onClick={() => void create()} disabled={creating || name.trim() === ''}>
              Create
            </Button>
          </div>
        )}
        {error !== null && <p className="page-sub">{error}</p>}
      </Card>
    </>
  );
}

// ── One app ────────────────────────────────────────────────────────────────

export function AppScreen() {
  const { projectId, appId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<GetAppResponse | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [runs, setRuns] = useState<AppRunRecord[]>([]);
  const [exports, setExports] = useState<AppExportRecord[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  // T-441 — which table's rows are open. One at a time: the mockup's two seats
  // are each ONE table's worth of rows, and a page stacking every table would
  // be a different screen from the one the owner approved.
  const [openTableId, setOpenTableId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (appId === undefined) return;
    void api.app(appId).then(setData, () => setData(null));
    void api.appRuns(appId).then((res) => setRuns(res.items), () => setRuns([]));
    void api.appExports(appId).then((res) => setExports(res.items), () => setExports([]));
  }, [appId]);
  useEffect(load, [load]);

  useEffect(() => {
    if (projectId === undefined) return;
    void api
      .participants(projectId)
      .then((res) => setRoster(res.items.filter((r) => r.removedAt === null)))
      .catch(() => setRoster([]));
  }, [projectId]);

  if (appId === undefined || projectId === undefined) return null;
  if (data === null) return <div className="content"><p className="page-sub">Loading…</p></div>;

  const { app, tables } = data;
  const state = STATE[app.state];
  // the published copy, which is what the app's people open (ruling 2); a
  // builder's unpublished edits are not on this screen at all
  const publishedScreens = (app.published?.interfaces ?? []).filter(
    (screen) => screen.source !== null && screen.appTableId !== null,
  );

  const act = async (run: () => Promise<unknown>, failure: string) => {
    setNotice(null);
    try {
      await run();
      load();
    } catch {
      setNotice(failure);
    }
  };

  return (
    <div className="content">
      <h1 className="page">{app.name}</h1>
      <p className="page-sub">
        {app.description ?? 'An app built for this project.'}{' '}
        {app.ownerName === null ? '' : `Owned by ${app.ownerName}.`}
      </p>

      {/* the state, always, at the head — this is where `defunct` says so */}
      <Card>
        <div className="shelf-head">
          <Badge tone={state.tone}>{state.label}</Badge>
          {app.publishedVersion !== null && app.publishedAt !== null && (
            <span className="page-sub">
              Opened as version {app.publishedVersion} on {formatDateTime(app.publishedAt)}
              {app.publishedByName === null ? '' : ` by ${app.publishedByName}`}
            </span>
          )}
        </div>
        {app.state === 'defunct' && (
          <p className="page-sub">
            The person who owned this app is no longer on the project, so nothing it does can run —
            a scheduled run acts as its owner, and there is nobody for it to act as. Give it to
            somebody, or close it. Its rows are unaffected and are still read by the same people.
          </p>
        )}
        <div className="shelf-head" style={{ gap: 8, marginTop: 8 }}>
          {/* T-442 — the stepped builder, offered only where the server said
              this person may build. `mayBuild` is the API's answer; nothing
              here works it out. */}
          {app.mayBuild && app.state !== 'closed' && (
            <Link to={`/projects/${projectId}/tools/apps/${app.id}/build`}>
              <Button>Build it — the steps</Button>
            </Link>
          )}
          {app.mayBuild && app.state !== 'closed' && (
            <Button onClick={() => void act(() => api.publishApp(app.id), 'That could not be opened.')}>
              {app.publishedVersion === null ? 'Check and open' : 'Open the latest version'}
            </Button>
          )}
          {app.state === 'open' && (
            <Button
              onClick={() =>
                void act(() => api.runApp(app.id), 'That could not be run right now.')
              }
            >
              Run the analysis now
            </Button>
          )}
        </div>
        {notice !== null && <p className="page-sub">{notice}</p>}
      </Card>

      {/* T-442 — the app's own screens, as its people open them.
          🔒 The list is ASSEMBLED SERVER-SIDE: a screen this person may not open
          never reached the browser (`openableInterfaces` in apps.ts), so there
          is no narrowing decision left on this screen to get wrong. And a
          screen draws only the rows the API gave the person looking at it,
          which is what makes one app behave as two. */}
      {publishedScreens.length > 0 && (
        <>
          <SectionLabel>Screens</SectionLabel>
          {publishedScreens.map((screen) => {
            const table = tables.find((t) => t.id === screen.appTableId);
            if (table === undefined) return null;
            return (
              <div key={screen.id}>
                <p className="page-sub">{screen.label}</p>
                <GeneratedScreen
                  source={screen.source}
                  table={table}
                  appState={app.state}
                  onChanged={load}
                />
              </div>
            );
          })}
        </>
      )}

      <SectionLabel>What it holds</SectionLabel>
      <Card>
        {tables.length === 0 ? (
          <p className="page-sub">No tables declared yet.</p>
        ) : (
          <Table>
            <table>
              <thead>
                <tr>
                  <th>Table</th>
                  <th>What it is for</th>
                  <th>Columns</th>
                  <th>Acceptance</th>
                  <th>Shared with</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tables.map((table) => (
                  <tr key={table.id}>
                    <td>{table.name}</td>
                    <td>
                      {table.kind === 'insight' ? (
                        'Where a run writes what it found'
                      ) : table.kind === 'reference' ? (
                        'The firm’s own lookup rows'
                      ) : (
                        'Data people fill in'
                      )}
                    </td>
                    <td>{table.columns.map((column) => column.label).join(', ')}</td>
                    <td>
                      {table.kind === 'insight' ? (
                        <span className="page-sub">None — a run writes it</span>
                      ) : table.hasAcceptance ? (
                        <Badge tone="info">Submitted, then accepted or rejected</Badge>
                      ) : (
                        <span className="page-sub">None — rows never change hands</span>
                      )}
                    </td>
                    <td>
                      <ShareCell
                        table={table}
                        mayShare={app.isProjectOwner}
                        roster={roster}
                        onDone={load}
                      />
                    </td>
                    <td>
                      <Button
                        onClick={() =>
                          setOpenTableId((current) => (current === table.id ? null : table.id))
                        }
                      >
                        {openTableId === table.id ? 'Hide rows' : 'Open'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Table>
        )}
        {app.mayBuild && app.state !== 'closed' && <DeclareTable appId={app.id} onDone={load} />}
      </Card>

      {openTableId !== null && tables.some((t) => t.id === openTableId) && (
        <AppTableRows
          table={tables.find((t) => t.id === openTableId)!}
          appState={app.state}
          onChanged={load}
        />
      )}

      {/* T-444 — the export. Offered to everyone who can open the app, because
          what comes out is decided by the read predicate rather than by who is
          asking: a contractor's file holds its own rows, the client's holds
          every organisation's, and the same button does both. */}
      <SectionLabel>Take a copy</SectionLabel>
      <Card>
        <p className="page-sub">
          Download this app's data as a spreadsheet. It contains only what you can see here, and it
          carries a note of what data it came from and when — nothing else. The file is yours: edit
          it, transpose it, and put it through the normal review cycles.
        </p>
        <div className="shelf-head" style={{ gap: 8 }}>
          <Button
            onClick={() =>
              void act(() => api.exportAppData(app.id), 'That could not be downloaded.')
            }
          >
            Download as a spreadsheet
          </Button>
        </div>
        {exports.length > 0 && (
          <Table>
            <table>
              <thead>
                <tr>
                  <th>Taken</th>
                  <th>By</th>
                  <th>Data as of</th>
                  <th>Rows</th>
                </tr>
              </thead>
              <tbody>
                {exports.map((record) => (
                  <tr key={record.id}>
                    <td>{formatDateTime(record.exportedAt)}</td>
                    <td>
                      {record.exportedByName} — {record.exportedByOrganisationName}
                    </td>
                    <td>{formatDateTime(record.dataAsOf)}</td>
                    <td>{record.rowsCovered}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Table>
        )}
      </Card>

      <SectionLabel>Who it is open to</SectionLabel>
      <Card>
        <p className="page-sub">
          The app's scope. Widening adds an entry; revoking closes one, and the effect is immediate.
          Being in the scope is not the same as being able to read a row — a row is still read by the
          organisation that entered it, the project owner, and anyone the owner has shared its table
          with.
        </p>
        <ul>
          {app.scope.map((grant) => (
            <li key={grant.id}>
              {grant.organisationName ?? grant.participantName ?? 'Unknown'}
              {grant.revokedAt === null ? '' : ' — revoked'}
              {app.mayBuild && grant.revokedAt === null && (
                <>
                  {' '}
                  <Button
                    onClick={() =>
                      void act(
                        () => api.revokeAppScope(app.id, grant.id),
                        'That could not be revoked.',
                      )
                    }
                  >
                    Revoke
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
        {app.mayBuild && app.state !== 'closed' && (
          <GrantScope appId={app.id} roster={roster} onDone={load} />
        )}
      </Card>

      {runs.length > 0 && (
        <>
          <SectionLabel>Runs</SectionLabel>
          <Card>
            {/* 🔒 T-443 — the run list is read by everyone who may open the app,
                and an insight is NOT: it is stamped with the organisation of the
                person the run acted as, and read by that organisation and the
                project owner alone. So what a run says here is how many rows it
                covered and a fixed phrase Infora wrote — never the insight's own
                words. The insight itself is a row in the insight table, read
                through the same predicate as every other row. */}
            <p className="page-sub">
              What each run covered. The insight a run wrote is a row in the app's insight table,
              read by the organisation that ran it and the project owner — open that table to read
              it.
            </p>
            <Table>
              <table>
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Trigger</th>
                    <th>Acted as</th>
                    <th>Rows covered</th>
                    <th>What happened</th>
                    <th>Against version</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td>{formatDateTime(run.startedAt)}</td>
                      <td>{run.trigger === 'manual' ? 'Run by hand' : 'Scheduled'}</td>
                      <td>{run.asName}</td>
                      <td>{run.rowsCovered}</td>
                      <td>{run.outcome ?? '—'}</td>
                      <td>{run.definitionsVersion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Table>
          </Card>
        </>
      )}

      <ReassignAndClose app={app} roster={roster} onDone={load} onClosed={() => navigate(`/projects/${projectId}/tools`)} />
    </div>
  );
}

/**
 * The project owner's share of one table with one named organisation (§6).
 *
 * Rendered as a control only for the project owner; everyone else sees the list
 * of shares they are entitled to know about — which for a member organisation
 * is its own share and nothing else, decided server-side.
 */
function ShareCell(props: {
  table: AppTableRecord;
  mayShare: boolean;
  roster: RosterEntry[];
  onDone: () => void;
}) {
  const [organisationId, setOrganisationId] = useState('');
  const live = props.table.shares.filter((share) => share.revokedAt === null);
  const organisations = [
    ...new Map(props.roster.map((r) => [r.organisationId, r.organisationName])).entries(),
  ].map(([value, label]) => ({ value, label }));

  return (
    <>
      {live.length === 0 ? (
        <span className="page-sub">Nobody</span>
      ) : (
        live.map((share) => (
          <span key={share.id}>
            {share.organisationName}{' '}
            {props.mayShare && (
              <Button
                onClick={() =>
                  void api
                    .revokeAppTableShare(props.table.id, share.id)
                    .then(props.onDone, props.onDone)
                }
              >
                Revoke
              </Button>
            )}
          </span>
        ))
      )}
      {props.mayShare && (
        <div className="shelf-head" style={{ gap: 6, marginTop: 6 }}>
          <SelectInput
            value={organisationId}
            onChange={setOrganisationId}
            options={organisations}
            placeholder="Share with…"
          />
          <Button
            disabled={organisationId === ''}
            onClick={() =>
              void api
                .shareAppTable(props.table.id, organisationId)
                .then(props.onDone, props.onDone)
            }
          >
            Share
          </Button>
        </div>
      )}
    </>
  );
}

/**
 * Declaring a table, with **the acceptance question asked rather than found**
 * (ADR-0056 §2b). The full stepped builder with its agent is T-442; what is
 * here is the substrate's own form, and the question is on it from the start
 * because it is the one choice that decides whether a figure can ever change
 * hands.
 */
function DeclareTable(props: { appId: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [columns, setColumns] = useState('month:Month:text, landfill:Waste to landfill (tonnes):number');
  const [hasAcceptance, setHasAcceptance] = useState('no');

  const declare = async () => {
    const parsed = columns
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, label, type] = part.split(':').map((piece) => piece.trim());
        return {
          key: key ?? '',
          label: label ?? key ?? '',
          type: (type ?? 'text') as AppColumnType,
          required: false,
        };
      });
    await api.declareAppTable(props.appId, {
      name: name.trim(),
      columns: parsed,
      kind: 'data',
      hasAcceptance: hasAcceptance === 'yes',
    });
    setName('');
    props.onDone();
  };

  return (
    <div style={{ marginTop: 12 }}>
      <Field label="New table">
        <TextInput value={name} onChange={setName} placeholder="Monthly returns" />
      </Field>
      <Field label="Columns" hint="key:label:type, separated by commas">
        <TextInput value={columns} onChange={setColumns} mono />
      </Field>
      {/* this quick form declares a DATA table; an insight table (where a run
          writes what it found) is declared at step 2 of the stepped builder,
          where its fixed columns can be shown alongside the choice */}
      <Field
        label="Does this table hold contractual data?"
        hint="If it does, a row is submitted and then accepted or rejected, and an accepted row becomes the project owner's record — it can never be edited or deleted afterwards."
      >
        <SelectInput
          value={hasAcceptance}
          onChange={setHasAcceptance}
          options={[
            { value: 'no', label: 'No — rows are just entered' },
            { value: 'yes', label: 'Yes — rows are submitted, then accepted or rejected' },
          ]}
        />
      </Field>
      <Button onClick={() => void declare()} disabled={name.trim() === ''}>
        Declare the table
      </Button>
    </div>
  );
}

function GrantScope(props: { appId: string; roster: RosterEntry[]; onDone: () => void }) {
  const [organisationId, setOrganisationId] = useState('');
  const organisations = [
    ...new Map(props.roster.map((r) => [r.organisationId, r.organisationName])).entries(),
  ].map(([value, label]) => ({ value, label }));
  return (
    <div className="shelf-head" style={{ gap: 8, marginTop: 8 }}>
      <SelectInput
        value={organisationId}
        onChange={setOrganisationId}
        options={organisations}
        placeholder="Open it to…"
      />
      <Button
        disabled={organisationId === ''}
        onClick={() =>
          void api.grantAppScope(props.appId, { organisationId }).then(props.onDone, props.onDone)
        }
      >
        Open it to this organisation
      </Button>
    </div>
  );
}

/**
 * Reassign-or-close (§5, §7) — the two acts that end a defunct state.
 *
 * The controls are rendered from the server's own answer about who may act:
 * this component asks for the acts and shows what comes back, and a person who
 * may not do either simply gets a refusal rather than a hidden control that was
 * never offered — which is why the failure message says what happened.
 */
function ReassignAndClose(props: {
  app: AppRecord;
  roster: RosterEntry[];
  onDone: () => void;
  onClosed: () => void;
}) {
  const [participantId, setParticipantId] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  if (props.app.state === 'closed') return null;
  const people = props.roster.map((r) => ({ value: r.participantId, label: `${r.name} — ${r.organisationName}` }));

  return (
    <>
      <SectionLabel>Ownership</SectionLabel>
      <Card>
        <p className="page-sub">
          An app needs a living owner: a run with nobody looking acts as that person, using their
          entitlements and nothing wider. Give it to somebody else, or close it — a closed app's
          tables can still be read by the same people as before.
        </p>
        <div className="shelf-head" style={{ gap: 8 }}>
          <SelectInput
            value={participantId}
            onChange={setParticipantId}
            options={people}
            placeholder="Give it to…"
          />
          <Button
            disabled={participantId === ''}
            onClick={() =>
              void api
                .reassignApp(props.app.id, participantId)
                .then(props.onDone, () =>
                  setNotice(
                    'That could not be done. The new owner has to be on this project and allowed to build apps.',
                  ),
                )
            }
          >
            Give it to this person
          </Button>
          <Button
            onClick={() =>
              void api
                .closeApp(props.app.id)
                .then(props.onClosed, () => setNotice('That could not be closed.'))
            }
          >
            Close the app
          </Button>
        </div>
        {notice !== null && <p className="page-sub">{notice}</p>}
      </Card>
    </>
  );
}
