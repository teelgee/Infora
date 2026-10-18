// T-450 — **the building screen: the conversation first, the state of the app
// beside it** (ADR-0056's third addendum, rulings 2 and 4; T-442's stepped
// builder is what this replaces).
//
// *In plain terms: you tell the agent what app you want, on the left; on the
// right, a panel shows everything decided so far — the tables, the screens and
// who may open each, the schedule, the analysis prompt, the connection
// requirements — and what is still unanswered. You can change anything in the
// panel yourself, without asking; the agent reads what you changed before it
// does anything next.*
//
// 🔒 **THE SEVEN STEPS DIED AS NAVIGATION AND LIVE ON AS THE PANEL'S SECTIONS**
// (ruling 4). The order is still the owner's confirmed order of 2026-09-06 —
// what the app is and who it is open to, the tables, data connections, the
// screens, how often it runs, analysis, and opening it — but nothing is
// walked: every section is open at once, and the conversation is the way in.
//
// 🔒 **WHAT IS STILL OPEN IS THE SERVER'S ANSWER, MARKED WHERE IT LIVES.** The
// questions are `publishGate.questions` from the API — the same computation that
// refuses a publish (T-448) — never worked out here. A table whose
// contractual-data question is open says so on the table; a screen whose
// who-may-open question is open says so on the screen; and the open act shows
// the gate's own words before anybody clicks.
//
// 🔒 **NO PERMISSION IS COMPUTED HERE.** `mayBuild`, `publishGate` and the
// definition itself are the server's answers; a person who may not build this
// app is refused the working copy by the API and never reaches the panel.
//
// **The drawing is the acts and the states, in the plain kit** — T-441's
// precedent. Every panel edit goes through the same routes it always did
// (`PATCH /definition`, the table routes, scope); the agent's acts go through
// the same functions on the server. Neither can do something the other cannot
// see.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import type {
  AppBuildTurn,
  AppColumnType,
  AppDefinition,
  AppInterface,
  AppSchedule,
  AppTableKind,
  AppTableRecord,
  AppTableSourceRecord,
  BuilderQuestion,
  GetAppResponse,
  RosterEntry,
  SourceDocumentOption,
  SourceRegion,
} from '@infora/contracts';
import { APP_SCHEDULES, INSIGHT_TABLE_COLUMNS } from '@infora/contracts';
import {
  Badge,
  Button,
  Card,
  Field,
  SectionLabel,
  SelectInput,
  TextArea,
  TextInput,
} from '@infora/ui';
import { api, RequestError } from '../api';
import { GeneratedScreen } from './app-screen';
import { formatDateTime } from './shared';

/** What a declared table is for, in the words a builder reads. */
const TABLE_KIND_WORDS: Record<AppTableKind, string> = {
  data: 'Data people fill in',
  insight: 'Where a run writes what it found',
  reference: 'The firm’s own lookup rows',
};

const SCHEDULE_WORDS: Record<AppSchedule, string> = {
  manual: 'Only when someone presses Run',
  daily: 'Every day',
  weekly: 'Every week',
  monthly: 'Every month',
};

/** A stable id for a new screen or connection — lower-case, hyphenated, and
 * checked by the same rule the API validates against. */
function slugId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The server's words when it refuses, or our own when it gave none. */
function refusal(error: unknown, fallback: string): string {
  return error instanceof RequestError && error.body?.detail !== undefined ? error.body.detail : fallback;
}

export function AppBuilderScreen() {
  const { projectId, appId } = useParams();
  const [data, setData] = useState<GetAppResponse | null>(null);
  const [missing, setMissing] = useState(false);
  const [turns, setTurns] = useState<AppBuildTurn[] | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);

  const load = useCallback(() => {
    if (appId === undefined) return;
    void api.app(appId).then(
      (res) => {
        setData(res);
        setMissing(false);
      },
      // a 404 is the server saying "not yours, or not there" — the two read
      // the same on purpose (principle 4), and the page says so in words
      () => setMissing(true),
    );
  }, [appId]);
  useEffect(load, [load]);

  useEffect(() => {
    if (appId === undefined) return;
    void api
      .buildConversation(appId)
      .then((res) => setTurns(res.turns))
      // not a builder of this app: the API said 404, and the page says why below
      .catch(() => setTurns([]));
  }, [appId]);

  useEffect(() => {
    if (projectId === undefined) return;
    void api
      .participants(projectId)
      .then((res) => setRoster(res.items.filter((r) => r.removedAt === null)))
      .catch(() => setRoster([]));
  }, [projectId]);

  if (appId === undefined || projectId === undefined) return null;
  if (missing) {
    return (
      <div className="content">
        <h1 className="page">Building an app</h1>
        <Card>
          <p className="page-sub">
            There is no app here for you to build. Either it does not exist, or it is not yours to
            build — its own organisation decides who among its people may.
          </p>
        </Card>
      </div>
    );
  }
  if (data === null) return <div className="content"><p className="page-sub">Loading…</p></div>;

  const { app } = data;
  const definition = app.definition;

  // The API returns the working copy to a builder and null to everyone else, so
  // this is the server's answer rather than a check of our own.
  if (definition === null || data.publishGate === null) {
    return (
      <div className="content">
        <h1 className="page">{app.name}</h1>
        <Card>
          <p className="page-sub">
            This app is not yours to build. Its own organisation decides who among its people may
            build it, and a closed app is built by nobody.{' '}
            <Link to={`/projects/${projectId}/apps/${appId}`}>Open the app instead.</Link>
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="content">
      <h1 className="page">{app.name}</h1>
      <p className="page-sub">
        <Badge tone={app.publishedVersion === null ? 'neutral' : 'success'}>
          {app.publishedVersion === null
            ? 'Draft — not yet open to anyone'
            : `Open as version ${app.publishedVersion}`}
        </Badge>{' '}
        You are building the working copy. Only the people who may build this app can see it; nothing
        here reaches the people it is open to until you open it, at the foot of the panel.
      </p>

      <div className="builder-split">
        <BuilderConversation
          appId={appId}
          turns={turns}
          onTurn={(next, app) => {
            setTurns((prev) => [...(prev ?? []), ...next]);
            setData(app);
          }}
        />
        <AppStatePanel
          appId={appId}
          projectId={projectId}
          data={data}
          definition={definition}
          roster={roster}
          onChanged={load}
        />
      </div>
    </div>
  );
}

// ── The conversation ───────────────────────────────────────────────────────

/**
 * **The way in.** What the builder says, and what the agent says and did in
 * reply, stored against the app and read back here — so tomorrow's visit picks
 * up where today's left off. The agent's receipt (what it did, what it suggests
 * the person does) is drawn from the stored turn, never from the prose.
 */
export function BuilderConversation(props: {
  appId: string;
  turns: AppBuildTurn[] | null;
  onTurn: (turns: AppBuildTurn[], app: GetAppResponse) => void;
}) {
  const [say, setSay] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const send = async () => {
    const text = say.trim();
    if (text === '') return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await api.sayToBuilder(props.appId, { say: text });
      setSay('');
      props.onTurn(res.turns, res.app);
    } catch (error) {
      setNotice(refusal(error, 'The agent could not be reached just now. What you have built is saved.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="builder-conversation" aria-label="The conversation with the builder’s agent">
      <SectionLabel>Tell the agent what you want</SectionLabel>
      <div className="builder-turns">
        {props.turns === null ? (
          <p className="page-sub">Loading the conversation…</p>
        ) : props.turns.length === 0 ? (
          <p className="page-sub">
            Describe the app in your own words — who fills it in, who reads it, how often. The agent
            drafts it in the panel beside this, and asks you the two things it must never decide for
            you: whether a table holds contractual data, and who may open each screen.
          </p>
        ) : (
          props.turns.map((turn) => <Turn key={turn.id} turn={turn} />)
        )}
      </div>
      <TextArea
        value={say}
        onChange={setSay}
        rows={3}
        placeholder="e.g. Build me a monthly sustainability returns app for three contractors."
        disabled={busy}
      />
      <div className="agent-pane-controls">
        <Button variant="primary" disabled={busy || say.trim() === ''} onClick={() => void send()}>
          {busy ? 'The agent is working…' : 'Send'}
        </Button>
      </div>
      {notice !== null && <p className="page-sub">{notice}</p>}
    </section>
  );
}

function Turn({ turn }: { turn: AppBuildTurn }) {
  if (turn.role === 'person') {
    return (
      <div className="builder-turn is-person">
        <span className="builder-turn-who">{turn.speakerName}</span>
        <p className="bubble mine">{turn.text}</p>
      </div>
    );
  }
  return (
    <div className="builder-turn is-agent">
      <span className="builder-turn-who">The agent</span>
      <p className="reply builder-turn-text">{turn.text}</p>
      {turn.acts.length > 0 && (
        <div className="builder-receipt">
          <span className="field-label">What it did</span>
          <ul>
            {turn.acts.map((act, index) => (
              <li key={index}>{act.summary}</li>
            ))}
          </ul>
        </div>
      )}
      {turn.proposals.length > 0 && (
        <div className="builder-receipt">
          <span className="field-label">It suggests</span>
          <ul>
            {turn.proposals.map((proposal, index) => (
              <li key={index}>{proposal.summary}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── The state of the app, editable ─────────────────────────────────────────

function AppStatePanel(props: {
  appId: string;
  projectId: string;
  data: GetAppResponse;
  definition: AppDefinition;
  roster: RosterEntry[];
  onChanged: () => void;
}) {
  const { data, definition } = props;
  const questions = data.publishGate!.questions;
  const [notice, setNotice] = useState<string | null>(null);

  /** Save the working copy. Every section writes through this one call, so a
   * change made here and a change the agent made meet the same validation. */
  const save = async (next: Partial<AppDefinition>) => {
    setNotice(null);
    try {
      await api.patchAppDefinition(props.appId, { definition: { ...definition, ...next } });
      props.onChanged();
    } catch (error) {
      setNotice(refusal(error, 'That could not be saved.'));
    }
  };

  const answer = (key: string, next: Partial<AppDefinition>) =>
    save({ ...next, answeredQuestions: [...new Set([...definition.answeredQuestions, key])] });

  const openFor = (kind: BuilderQuestion['kind']) => questions.filter((q) => q.kind === kind);

  return (
    <aside className="builder-panel" aria-label="The state of the app">
      <PanelWhatItIs app={data} roster={props.roster} onDone={props.onChanged} />
      <PanelTables
        appId={props.appId}
        projectId={props.projectId}
        tables={data.tables}
        open={openFor('contractual-data')}
        onDone={props.onChanged}
      />
      <PanelScreens
        appId={props.appId}
        definition={definition}
        tables={data.tables}
        app={data}
        open={openFor('who-may-open')}
        onSave={save}
        onAnswered={(interfaceId, next) => answer(`who-may-open:${interfaceId}`, next)}
      />
      <PanelConnections definition={definition} onSave={save} />
      <PanelSchedule definition={definition} onSave={save} />
      <PanelAnalysis definition={definition} tables={data.tables} onSave={save} />
      <PanelOpen appId={props.appId} projectId={props.projectId} data={data} onDone={props.onChanged} />
      {notice !== null && <p className="page-sub">{notice}</p>}
    </aside>
  );
}

/** A panel section's head, with how many required questions are still open in
 * it — the mark the stepped rail used to carry. */
function SectionHead(props: { title: string; open?: number }) {
  return (
    <div className="builder-section-head">
      <SectionLabel>{props.title}</SectionLabel>
      {props.open !== undefined && props.open > 0 && (
        <Badge tone="warning">{props.open === 1 ? '1 to answer' : `${props.open} to answer`}</Badge>
      )}
    </div>
  );
}

// ── What the app is, and who it is open to ─────────────────────────────────

function PanelWhatItIs(props: { app: GetAppResponse; roster: RosterEntry[]; onDone: () => void }) {
  const { app } = props.app;
  const [name, setName] = useState(app.name);
  const [description, setDescription] = useState(app.description ?? '');
  const [organisationId, setOrganisationId] = useState('');
  // the agent may have named or described the app since this was typed: follow
  // the stored copy until the person starts editing
  useEffect(() => setName(app.name), [app.name]);
  useEffect(() => setDescription(app.description ?? ''), [app.description]);
  const organisations = [
    ...new Map(props.roster.map((r) => [r.organisationId, r.organisationName])).entries(),
  ].map(([value, label]) => ({ value, label }));

  return (
    <Card className="builder-section">
      <SectionHead title="What the app is" />
      <Field label="Name">
        <TextInput value={name} onChange={setName} />
      </Field>
      <Field label="What it is for">
        <TextArea value={description} onChange={setDescription} rows={2} />
      </Field>
      <Button
        size="sm"
        onClick={() =>
          void api
            .patchAppDefinition(app.id, { name, description: description === '' ? null : description })
            .then(props.onDone, props.onDone)
        }
      >
        Save
      </Button>

      <SectionHead title="Who it is open to" />
      <p className="page-sub">
        Being open to an organisation is not the same as reading its rows. A row is read by the
        organisation that entered it and by the project owner, and by nobody else unless the project
        owner shares its whole table. Opening the app to an organisation is yours to do — the agent
        cannot.
      </p>
      <ul className="builder-list">
        {app.scope
          .filter((grant) => grant.revokedAt === null)
          .map((grant) => (
            <li key={grant.id}>
              {grant.organisationName ?? grant.participantName ?? 'Unknown'}{' '}
              <Button
                variant="quiet"
                size="sm"
                onClick={() => void api.revokeAppScope(app.id, grant.id).then(props.onDone, props.onDone)}
              >
                Revoke
              </Button>
            </li>
          ))}
      </ul>
      <div className="shelf-head" style={{ gap: 8 }}>
        <SelectInput
          value={organisationId}
          onChange={setOrganisationId}
          options={organisations}
          placeholder="Open it to…"
        />
        <Button
          size="sm"
          disabled={organisationId === ''}
          onClick={() =>
            void api.grantAppScope(app.id, { organisationId }).then(props.onDone, props.onDone)
          }
        >
          Open it to this organisation
        </Button>
      </div>
    </Card>
  );
}

// ── The tables, and the first required question ────────────────────────────

/**
 * **The contractual-data question is marked on the table it is about**, and
 * answered here or in the conversation — never defaulted. It is the one choice
 * that decides whether a figure can ever change hands.
 */
function PanelTables(props: {
  appId: string;
  projectId: string;
  tables: AppTableRecord[];
  open: BuilderQuestion[];
  onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [columns, setColumns] = useState('month:Month:text, landfill:Waste to landfill (tonnes):number');
  const [hasAcceptance, setHasAcceptance] = useState('');
  const [kind, setKind] = useState<AppTableKind>('data');
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const isInsight = kind === 'insight';
  const openIds = new Set(props.open.map((q) => q.subjectId));
  const live = props.tables.filter((table) => table.retiredAt === null);

  const setAcceptance = (tableId: string, value: boolean) =>
    void api.setAppTableAcceptance(tableId, value).then(props.onDone, (error: unknown) =>
      setNotice(
        refusal(
          error,
          'That table already holds rows, so whether it holds contractual data cannot change now.',
        ),
      ),
    );

  const declare = async () => {
    const parsed = columns
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, label, type] = part.split(':').map((piece) => piece.trim());
        return { key: key ?? '', label: label ?? key ?? '', type: (type ?? 'text') as AppColumnType, required: false };
      });
    try {
      await api.declareAppTable(props.appId, {
        name: name.trim(),
        columns: isInsight ? INSIGHT_TABLE_COLUMNS : parsed,
        kind,
        // an explicit answer, chosen in the form — the server records it (T-448)
        hasAcceptance: isInsight ? false : hasAcceptance === 'yes',
      });
      setName('');
      setHasAcceptance('');
      setKind('data');
      setAdding(false);
      props.onDone();
    } catch {
      setNotice('That table could not be declared. Check the column list.');
    }
  };

  return (
    <Card className="builder-section">
      <SectionHead title="Tables" open={props.open.length} />
      {live.length === 0 ? (
        <p className="page-sub">No tables yet. Tell the agent what people fill in, or add one here.</p>
      ) : (
        live.map((table) => (
          <div key={table.id} className={`builder-item${openIds.has(table.id) ? ' is-open' : ''}`}>
            <div className="builder-item-head">
              <strong>{table.name}</strong>
              <span className="page-sub">{TABLE_KIND_WORDS[table.kind]}</span>
            </div>
            <p className="page-sub">{table.columns.map((column) => column.label).join(', ')}</p>
            {table.kind === 'insight' ? (
              <p className="page-sub">No acceptance step — a run writes it.</p>
            ) : openIds.has(table.id) ? (
              <div className="builder-ask">
                <span className="field-label">Still to answer</span>
                <p>
                  Does “{table.name}” hold contractual data? Something a payment hangs on, that
                  discharges a condition, or that the project owner will rely on as its record.
                </p>
                <div className="shelf-head" style={{ gap: 8 }}>
                  <Button size="sm" onClick={() => setAcceptance(table.id, true)}>
                    Yes — it holds contractual data
                  </Button>
                  <Button size="sm" variant="quiet" onClick={() => setAcceptance(table.id, false)}>
                    No — it is working data
                  </Button>
                </div>
              </div>
            ) : table.hasAcceptance ? (
              <Badge tone="info">Contractual — submitted, then accepted or rejected</Badge>
            ) : (
              <span className="page-sub">Working data — rows never change hands</span>
            )}
            {table.kind !== 'insight' && (
              <TableSource appId={props.appId} projectId={props.projectId} table={table} />
            )}
          </div>
        ))
      )}

      {!adding ? (
        <Button size="sm" variant="quiet" onClick={() => setAdding(true)}>
          Add a table by hand
        </Button>
      ) : (
        <div className="builder-item">
          <Field label="Name">
            <TextInput value={name} onChange={setName} placeholder="Monthly returns" />
          </Field>
          <Field label="What is this table for?">
            <SelectInput
              value={kind}
              onChange={(value) => setKind(value as AppTableKind)}
              options={[
                { value: 'data', label: 'Data people fill in' },
                { value: 'insight', label: 'Where a run writes what it found' },
              ]}
            />
          </Field>
          {isInsight ? (
            <p className="page-sub">
              Its columns are fixed: {INSIGHT_TABLE_COLUMNS.map((column) => column.label).join(', ')}.
            </p>
          ) : (
            <>
              <Field label="Columns" hint="key:label:type, separated by commas. Types: text, number, date, boolean, choice.">
                <TextInput value={columns} onChange={setColumns} mono />
              </Field>
              <Field label="Does this table hold contractual data?">
                <SelectInput
                  value={hasAcceptance}
                  onChange={setHasAcceptance}
                  options={[
                    { value: 'yes', label: 'Yes — add an acceptance step' },
                    { value: 'no', label: 'No — rows never change hands' },
                  ]}
                  placeholder="Choose…"
                />
              </Field>
            </>
          )}
          <div className="shelf-head" style={{ gap: 8 }}>
            <Button
              size="sm"
              onClick={() => void declare()}
              disabled={name.trim() === '' || (!isInsight && hasAcceptance === '')}
            >
              Declare the table
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {notice !== null && <p className="page-sub">{notice}</p>}
    </Card>
  );
}

// ── T-452 — a table's Source: fed from a spreadsheet the project holds ─────

/** Headings compare as a person reads them — case, spacing and a trailing
 * unit in brackets ("Cost (£)") are not a different heading from "Cost". */
const headingKey = (text: string) =>
  text
    .replace(/\([^)]*\)/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

/**
 * **A table's Source** (ADR-0059; T-451's acts, T-452's panel).
 *
 * *In plain terms: point this table at a spreadsheet in the project, pick the
 * block of cells that holds the data, say which heading fills which column —
 * and from then on every new version of that spreadsheet refills the table by
 * itself, in the name of whoever uploaded it.*
 *
 * 🔒 **A PERSON'S ACT, NEVER THE AGENT'S** (decision 4): this section is the
 * only way a source is attached. 🔒 **NOTHING HERE DECIDES WHO THE ROWS NAME**
 * — the server stamps them with the file version's uploader. And the receipt
 * is the server's sentence, shown as it was written.
 */
function TableSource(props: { appId: string; projectId: string; table: AppTableRecord }) {
  const { table } = props;
  const [source, setSource] = useState<AppTableSourceRecord | null | undefined>(undefined);
  const [picking, setPicking] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    void api.tableSource(table.id).then(
      (res) => setSource(res.source),
      () => setSource(null),
    );
  }, [table.id]);
  useEffect(load, [load]);

  const act = async (run: () => Promise<{ source: AppTableSourceRecord | null }>, failed: string) => {
    setPending(true);
    setNotice(null);
    try {
      setSource((await run()).source);
    } catch (error) {
      setNotice(refusal(error, failed));
    } finally {
      setPending(false);
    }
  };

  if (source === undefined) return null;
  const live = source !== null && source.detachedAt === null;
  const label = (key: string) => table.columns.find((column) => column.key === key)?.label ?? key;

  return (
    <div className="builder-source" role="group" aria-label={`Source of ${table.name}`}>
      <span className="field-label">Source</span>
      {live ? (
        <>
          <p className="page-sub">
            Fed from{' '}
            <strong>{source.document.title ?? 'a spreadsheet you can no longer open'}</strong>, sheet
            “{source.sheet}”:{' '}
            {source.mapping.map((entry) => `“${entry.header}” fills ${label(entry.columnKey)}`).join('; ')}.
          </p>
          <p className="page-sub">
            {source.reflectsVersion === null
              ? 'The table does not reflect any version of it yet.'
              : `The table reflects ${source.reflectsVersion}`}
            {source.reflectsVersion !== null &&
              (source.document.currentVersion !== null &&
              source.document.currentVersion !== source.reflectsVersion
                ? ` — the file is now at ${source.document.currentVersion}.`
                : '.')}{' '}
            Each new version refills the table, entered by whoever uploaded it
            {table.hasAcceptance ? ' and submitted for acceptance' : ''}.
          </p>
          {source.lastImport !== null && (
            <div className="builder-receipt" aria-label="Last import">
              <Badge tone={source.lastImport.succeeded ? 'success' : 'danger'}>
                {source.lastImport.succeeded ? 'Last import' : 'Last import failed'}
              </Badge>{' '}
              <span className="page-sub">{formatDateTime(source.lastImport.at)}</span>
              <p>{source.lastImport.outcome}</p>
            </div>
          )}
          <div className="shelf-head" style={{ gap: 8 }}>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                void act(() => api.refreshTableSource(table.id), 'The file could not be read just now.')
              }
            >
              Refresh from the file now
            </Button>
            {source.mayReconfigure && !picking && (
              <Button size="sm" variant="quiet" onClick={() => setPicking(true)}>
                Change the cells
              </Button>
            )}
            <Button
              size="sm"
              variant="quiet"
              disabled={pending}
              onClick={() =>
                void act(() => api.detachTableSource(table.id), 'The table could not be detached.')
              }
            >
              Stop feeding this table
            </Button>
          </div>
        </>
      ) : (
        <>
          {source !== null && source.detachedAt !== null && (
            <p className="page-sub">
              No longer fed from a spreadsheet (stopped {formatDateTime(source.detachedAt)}). The rows it
              brought in are kept.
            </p>
          )}
          {!picking && (
            <Button size="sm" variant="quiet" onClick={() => setPicking(true)}>
              Feed this table from a spreadsheet
            </Button>
          )}
        </>
      )}
      {picking && (
        <SourcePicker
          appId={props.appId}
          projectId={props.projectId}
          table={table}
          current={live ? source : null}
          onAttached={(attached) => {
            setSource(attached);
            setPicking(false);
          }}
          onCancel={() => setPicking(false)}
        />
      )}
      {notice !== null && <p className="page-sub">{notice}</p>}
    </div>
  );
}

/**
 * Choosing the cells: a spreadsheet the builder can open (or one they upload
 * here into their own sandbox), then one of the **table-shaped regions** Infora
 * found in it — a header row and the rows beneath, never loose cells, the Power
 * BI lesson — then which heading fills which declared column.
 */
function SourcePicker(props: {
  appId: string;
  projectId: string;
  table: AppTableRecord;
  current: AppTableSourceRecord | null;
  onAttached: (source: AppTableSourceRecord | null) => void;
  onCancel: () => void;
}) {
  const { table, current } = props;
  const [documents, setDocuments] = useState<SourceDocumentOption[] | null>(null);
  const [chosen, setChosen] = useState(current === null ? '' : `${current.document.kind}:${current.document.id}`);
  const [regions, setRegions] = useState<SourceRegion[] | null>(null);
  const [regionIndex, setRegionIndex] = useState<number | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadDocuments = useCallback(() => {
    void api.sourceDocuments(props.appId).then(
      (res) => setDocuments(res.items),
      () => setDocuments([]),
    );
  }, [props.appId]);
  useEffect(loadDocuments, [loadDocuments]);

  const pointer = (key: string) => {
    const [kind, id] = key.split(':');
    return kind === 'library' ? { containerId: id! } : { sandboxDocumentId: id! };
  };

  /** Fill the mapping from the region's headings: a heading that reads as a
   * column's label fills it; the builder confirms or changes every one. */
  const suggest = useCallback(
    (region: SourceRegion) => {
      const byHeading = new Map(region.headers.map((header) => [headingKey(header), header]));
      const next: Record<string, string> = {};
      for (const column of table.columns) {
        const kept = current?.mapping.find((entry) => entry.columnKey === column.key)?.header;
        const header =
          kept !== undefined && region.headers.includes(kept)
            ? kept
            : (byHeading.get(headingKey(column.label)) ?? byHeading.get(headingKey(column.key)));
        if (header !== undefined) next[column.key] = header;
      }
      setMapping(next);
    },
    [table.columns, current],
  );

  useEffect(() => {
    setRegions(null);
    setRegionIndex(null);
    setNotice(null);
    if (chosen === '') return;
    void api.sourceRegions(props.appId, pointer(chosen)).then(
      (res) => {
        setRegions(res.regions);
        // reconfiguring: start from the region the table is fed from now
        const again =
          current === null
            ? -1
            : res.regions.findIndex(
                (region) =>
                  region.sheet === current.sheet &&
                  current.mapping.every((entry) => region.headers.includes(entry.header)),
              );
        const start = again >= 0 ? again : res.regions.length === 1 ? 0 : -1;
        if (start >= 0) {
          setRegionIndex(start);
          suggest(res.regions[start]!);
        }
      },
      (error: unknown) => {
        setRegions([]);
        setNotice(refusal(error, 'That spreadsheet could not be read.'));
      },
    );
    // re-read only when the chosen document changes — not when the suggestion
    // or the current source re-render, which would reset the builder's picks
  }, [chosen, props.appId]);

  const upload = async (file: File | undefined) => {
    if (file === undefined) return;
    setNotice(null);
    try {
      const uploaded = await api.uploadSandboxFile(props.projectId, file);
      loadDocuments();
      setChosen(`sandbox:${uploaded.id}`);
    } catch (error) {
      setNotice(refusal(error, 'That file could not be uploaded.'));
    }
  };

  const region = regionIndex === null ? null : (regions?.[regionIndex] ?? null);
  const unfed = table.columns.filter((column) => column.required && mapping[column.key] === undefined);

  const attach = async () => {
    if (region === null) return;
    setPending(true);
    setNotice(null);
    try {
      const res = await api.attachTableSource(table.id, {
        ...pointer(chosen),
        sheet: region.sheet,
        headerRow: region.headers,
        mapping: Object.entries(mapping).map(([columnKey, header]) => ({ header, columnKey })),
      });
      props.onAttached(res.source);
    } catch (error) {
      setNotice(refusal(error, 'The table could not be pointed at those cells.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="builder-item">
      <Field label="Spreadsheet" hint="Only spreadsheets you can open are offered.">
        <SelectInput
          value={chosen}
          onChange={setChosen}
          options={(documents ?? []).map((doc) => ({
            value: `${doc.kind}:${doc.id}`,
            label: `${doc.title} — ${doc.kind === 'library' ? 'library' : 'your sandbox'}, ${doc.version}`,
          }))}
          placeholder={documents === null ? 'Loading…' : 'Choose a spreadsheet…'}
        />
      </Field>
      <Field label="Or upload one to your sandbox">
        <input type="file" accept=".xlsx" onChange={(e) => void upload(e.target.files?.[0])} />
      </Field>

      {regions !== null && regions.length === 0 && notice === null && (
        <p className="page-sub">
          Infora found no table in it — a row of headings with rows beneath. Add headings above the
          figures and upload it again.
        </p>
      )}
      {regions !== null && regions.length > 0 && (
        <fieldset className="builder-regions">
          <legend className="field-label">Which table in it?</legend>
          {regions.map((candidate, index) => (
            <label key={`${candidate.sheet}-${candidate.headerRowNumber}-${index}`} className="builder-region">
              <input
                type="radio"
                name={`region-${table.id}`}
                checked={regionIndex === index}
                onChange={() => {
                  setRegionIndex(index);
                  suggest(candidate);
                }}
              />{' '}
              <span>
                Sheet “{candidate.sheet}”, row {candidate.headerRowNumber}: {candidate.headers.join(', ')} —{' '}
                {candidate.rowCount === 1 ? '1 row' : `${candidate.rowCount} rows`}
                {candidate.sample.length > 0 && (
                  <span className="page-sub"> (first: {candidate.sample[0]!.join(', ')})</span>
                )}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {region !== null && (
        <>
          <span className="field-label">Which heading fills each column?</span>
          {table.columns.map((column) => (
            <Field key={column.key} label={`${column.label}${column.required ? ' (required)' : ''}`}>
              <SelectInput
                value={mapping[column.key] ?? ''}
                onChange={(header) =>
                  setMapping((before) => {
                    const next = { ...before };
                    if (header === '') delete next[column.key];
                    else next[column.key] = header;
                    return next;
                  })
                }
                options={region.headers.map((header) => ({ value: header, label: header }))}
                placeholder="Not filled from the file"
              />
            </Field>
          ))}
          {unfed.length > 0 && (
            <p className="page-sub">
              {unfed.map((column) => column.label).join(', ')} {unfed.length === 1 ? 'is' : 'are'}{' '}
              required, so a heading has to fill {unfed.length === 1 ? 'it' : 'each'}.
            </p>
          )}
        </>
      )}

      <div className="shelf-head" style={{ gap: 8 }}>
        <Button size="sm" disabled={region === null || unfed.length > 0 || pending} onClick={() => void attach()}>
          Feed the table from these cells
        </Button>
        <Button size="sm" variant="quiet" onClick={props.onCancel}>
          Cancel
        </Button>
      </div>
      {notice !== null && <p className="page-sub">{notice}</p>}
    </div>
  );
}

// ── The screens, and the second required question ──────────────────────────

function PanelScreens(props: {
  appId: string;
  definition: AppDefinition;
  tables: AppTableRecord[];
  app: GetAppResponse;
  open: BuilderQuestion[];
  onSave: (next: Partial<AppDefinition>) => Promise<void>;
  onAnswered: (interfaceId: string, next: Partial<AppDefinition>) => Promise<void>;
}) {
  const [label, setLabel] = useState('');
  const [appTableId, setAppTableId] = useState('');
  const openIds = new Set(props.open.map((q) => q.subjectId));
  // who the screens may be narrowed to: the organisations the app is open to
  const organisations = props.app.app.scope
    .filter((grant) => grant.revokedAt === null && grant.organisationId !== null)
    .map((grant) => [grant.organisationId!, grant.organisationName ?? 'An organisation'] as const);

  const replace = (id: string, next: Partial<AppInterface>): AppInterface[] =>
    props.definition.interfaces.map((screen) => (screen.id === id ? { ...screen, ...next } : screen));

  return (
    <Card className="builder-section">
      <SectionHead title="Screens, and who may open each" open={props.open.length} />
      <p className="page-sub">
        A screen shows each person only what they could already see; choosing who may open one can
        narrow that, never widen it.
      </p>
      {props.definition.interfaces.length === 0 && <p className="page-sub">No screens yet.</p>}
      {props.definition.interfaces.map((screen) => {
        const table = props.tables.find((t) => t.id === screen.appTableId) ?? null;
        return (
          <ScreenItem
            key={screen.id}
            appId={props.appId}
            screen={screen}
            table={table}
            appState={props.app.app.state}
            organisations={organisations}
            isOpen={openIds.has(screen.id)}
            onRename={(next) => void props.onSave({ interfaces: replace(screen.id, { label: next }) })}
            onRemove={() =>
              void props.onSave({
                interfaces: props.definition.interfaces.filter((s) => s.id !== screen.id),
                answeredQuestions: props.definition.answeredQuestions.filter(
                  (key) => key !== `who-may-open:${screen.id}`,
                ),
              })
            }
            onOpenTo={(ids) =>
              void props.onAnswered(screen.id, { interfaces: replace(screen.id, { openToOrganisationIds: ids }) })
            }
            onWritten={(source) => void props.onSave({ interfaces: replace(screen.id, { source }) })}
          />
        );
      })}

      <div className="builder-item">
        <span className="field-label">Add a screen by hand</span>
        <div className="shelf-head" style={{ gap: 8, flexWrap: 'wrap' }}>
          <TextInput value={label} onChange={setLabel} placeholder="What it is called" />
          <SelectInput
            value={appTableId}
            onChange={setAppTableId}
            options={props.tables
              .filter((table) => table.retiredAt === null)
              .map((table) => ({ value: table.id, label: table.name }))}
            placeholder="Over which table…"
          />
          <Button
            size="sm"
            disabled={label.trim() === '' || appTableId === ''}
            onClick={() => {
              void props
                .onSave({
                  interfaces: [
                    ...props.definition.interfaces,
                    { id: slugId('screen'), label: label.trim(), appTableId, openToOrganisationIds: [], source: null },
                  ],
                })
                .then(() => {
                  setLabel('');
                  setAppTableId('');
                });
            }}
          >
            Add
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ScreenItem(props: {
  appId: string;
  screen: AppInterface;
  table: AppTableRecord | null;
  appState: GetAppResponse['app']['state'];
  organisations: ReadonlyArray<readonly [string, string]>;
  isOpen: boolean;
  onRename: (label: string) => void;
  onRemove: () => void;
  onOpenTo: (organisationIds: string[]) => void;
  onWritten: (source: string) => void;
}) {
  const { screen } = props;
  const [label, setLabel] = useState(screen.label);
  const [showPreview, setShowPreview] = useState(false);
  useEffect(() => setLabel(screen.label), [screen.label]);
  const narrowedTo = screen.openToOrganisationIds;

  return (
    <div className={`builder-item${props.isOpen ? ' is-open' : ''}`} data-screen-id={screen.id}>
      <div className="shelf-head" style={{ gap: 8, flexWrap: 'wrap' }}>
        <TextInput value={label} onChange={setLabel} onEnter={() => props.onRename(label.trim())} />
        <Button
          size="sm"
          variant="quiet"
          disabled={label.trim() === '' || label.trim() === screen.label}
          onClick={() => props.onRename(label.trim())}
        >
          Rename
        </Button>
        <Button size="sm" variant="quiet" onClick={props.onRemove}>
          Remove
        </Button>
      </div>
      <p className="page-sub">
        Over {props.table === null ? 'no table' : `“${props.table.name}”`}
        {screen.source === null ? ' · not drawn yet' : ''}
      </p>

      <div className={props.isOpen ? 'builder-ask' : undefined}>
        <span className="field-label">
          {props.isOpen ? `Still to answer — who may open “${screen.label}”?` : 'Who may open it'}
        </span>
        <div className="shelf-head" style={{ gap: 6, flexWrap: 'wrap' }}>
          <Button
            size="sm"
            variant={!props.isOpen && narrowedTo.length === 0 ? 'primary' : 'quiet'}
            onClick={() => props.onOpenTo([])}
          >
            Everyone the app is open to
          </Button>
          {props.organisations.map(([orgId, orgName]) => {
            const on = !props.isOpen && narrowedTo.includes(orgId);
            return (
              <Button
                key={orgId}
                size="sm"
                variant={on ? 'primary' : 'quiet'}
                onClick={() =>
                  props.onOpenTo(
                    on
                      ? narrowedTo.filter((id) => id !== orgId)
                      : [...(props.isOpen ? [] : narrowedTo), orgId],
                  )
                }
              >
                Only {orgName}
              </Button>
            );
          })}
        </div>
      </div>

      {props.table !== null && (
        <ScreenWriter appId={props.appId} screen={screen} table={props.table} onWritten={props.onWritten} />
      )}
      {props.table !== null && screen.source !== null && (
        <>
          <Button size="sm" variant="quiet" onClick={() => setShowPreview(!showPreview)}>
            {showPreview ? 'Hide what it looks like' : 'Show what it looks like to you'}
          </Button>
          {showPreview && (
            <GeneratedScreen source={screen.source} table={props.table} appState={props.appState} />
          )}
        </>
      )}
    </div>
  );
}

/**
 * Draw or redraw one screen from a description, without going through the
 * conversation. **It proposes; the panel saves** — through the same
 * `PATCH /definition`, refused there if it is not a screen in the grammar.
 */
function ScreenWriter(props: {
  appId: string;
  screen: AppInterface;
  table: AppTableRecord;
  onWritten: (source: string) => void;
}) {
  const [purpose, setPurpose] = useState('');
  const [busy, setBusy] = useState(false);
  const [followUp, setFollowUp] = useState<string | null>(null);

  const write = async () => {
    setBusy(true);
    setFollowUp(null);
    try {
      const answer = await api.writeAppScreen(props.appId, {
        appTableId: props.table.id,
        purpose: purpose.trim(),
        current: props.screen.source,
      });
      if (answer.source === null) setFollowUp(answer.followUp);
      else {
        props.onWritten(answer.source);
        setPurpose('');
      }
    } catch {
      setFollowUp('The agent could not be reached just now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shelf-head" style={{ gap: 8, flexWrap: 'wrap' }}>
      <TextInput
        value={purpose}
        onChange={setPurpose}
        placeholder={props.screen.source === null ? 'Describe this screen to draw it' : 'Describe a change to this screen'}
      />
      <Button size="sm" variant="quiet" disabled={busy || purpose.trim() === ''} onClick={() => void write()}>
        {props.screen.source === null ? 'Draw it' : 'Redraw it'}
      </Button>
      {followUp !== null && <p className="agent-pane-followup">{followUp}</p>}
    </div>
  );
}

// ── Data connections, declared and visibly unfillable ──────────────────────

function PanelConnections(props: {
  definition: AppDefinition;
  onSave: (next: Partial<AppDefinition>) => Promise<void>;
}) {
  const [system, setSystem] = useState('');
  const [needs, setNeeds] = useState('');

  return (
    <Card className="builder-section">
      <SectionHead title="Data connections" />
      <p className="page-sub">
        A connection to a system outside Infora is <strong>described here and connected after
        Infora is deployed</strong>. There is nowhere to type a password or an address, on purpose.
      </p>
      {props.definition.connections.length === 0 ? (
        <p className="page-sub">Nothing described. Most apps need none.</p>
      ) : (
        <ul className="builder-list">
          {props.definition.connections.map((connection) => (
            <li key={connection.id}>
              <strong>{connection.system}</strong> — {connection.needs}{' '}
              <Badge tone="warning">Cannot be connected yet</Badge>{' '}
              <Button
                variant="quiet"
                size="sm"
                onClick={() =>
                  void props.onSave({
                    connections: props.definition.connections.filter((c) => c.id !== connection.id),
                  })
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="shelf-head" style={{ gap: 8, flexWrap: 'wrap' }}>
        <TextInput value={system} onChange={setSystem} placeholder="What kind of system" />
        <TextInput value={needs} onChange={setNeeds} placeholder="What the app would want from it" />
        <Button
          size="sm"
          variant="quiet"
          disabled={system.trim() === '' || needs.trim() === ''}
          onClick={() => {
            void props
              .onSave({
                connections: [
                  ...props.definition.connections,
                  { id: slugId('connection'), system: system.trim(), needs: needs.trim() },
                ],
              })
              .then(() => {
                setSystem('');
                setNeeds('');
              });
          }}
        >
          Describe it
        </Button>
      </div>
    </Card>
  );
}

// ── How often it runs ──────────────────────────────────────────────────────

function PanelSchedule(props: {
  definition: AppDefinition;
  onSave: (next: Partial<AppDefinition>) => Promise<void>;
}) {
  return (
    <Card className="builder-section">
      <SectionHead title="How often it runs" />
      <SelectInput
        value={props.definition.schedule}
        onChange={(value) => void props.onSave({ schedule: value as AppSchedule })}
        options={APP_SCHEDULES.map((schedule) => ({ value: schedule, label: SCHEDULE_WORDS[schedule] }))}
      />
      {/* ADR-0056 §13d — stored, honoured when a clock exists; saying so plainly
          is the point */}
      {props.definition.schedule !== 'manual' && (
        <p className="page-sub">
          <Badge tone="warning">Saved, but not running yet</Badge> Infora runs on one machine that is
          not always on, so nothing happens on a clock today. Until there is a server that stays on,
          the app runs when somebody presses Run.
        </p>
      )}
    </Card>
  );
}

// ── Analysis ───────────────────────────────────────────────────────────────

function PanelAnalysis(props: {
  definition: AppDefinition;
  tables: AppTableRecord[];
  onSave: (next: Partial<AppDefinition>) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState(props.definition.analysisPrompt ?? '');
  useEffect(() => setPrompt(props.definition.analysisPrompt ?? ''), [props.definition.analysisPrompt]);
  const insightTable = props.tables.find((table) => table.kind === 'insight' && table.retiredAt === null);
  return (
    <Card className="builder-section">
      <SectionHead title="What each run's analysis says" />
      <TextArea
        value={prompt}
        onChange={setPrompt}
        rows={3}
        placeholder="e.g. Say which organisations have returned this month and which have not."
      />
      <Button
        size="sm"
        variant="quiet"
        disabled={prompt === (props.definition.analysisPrompt ?? '')}
        onClick={() => void props.onSave({ analysisPrompt: prompt === '' ? null : prompt })}
      >
        Save the prompt
      </Button>
      {insightTable === undefined ? (
        <p className="page-sub">
          <Badge tone="warning">Nowhere to write it yet</Badge> A run keeps what it finds as a row in an
          insight table, and this app has not declared one.
        </p>
      ) : (
        <p className="page-sub">Each run writes one row into “{insightTable.name}”.</p>
      )}
    </Card>
  );
}

// ── Opening it (the publish act), with the gate's state in words ───────────

/**
 * **The gate's state, before the click** (T-448). The words are the server's —
 * `publishGate.words`, the same sentence a refused publish carries — so what
 * this says and what the server would do cannot disagree. The button stays
 * closed while the gate is; the server refuses past it regardless.
 */
function PanelOpen(props: { appId: string; projectId: string; data: GetAppResponse; onDone: () => void }) {
  const { app } = props.data;
  const gate = props.data.publishGate!;
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <Card className="builder-section">
      <SectionHead title="Open it to its people" open={gate.questions.length} />
      <p className={gate.open ? 'page-sub' : 'builder-gate is-closed'} role="status">
        {gate.words}
      </p>
      {!gate.open && (
        <ul className="builder-list">
          {gate.questions.map((question) => (
            <li key={`${question.kind}:${question.subjectId}`}>{question.question.split('?')[0]}?</li>
          ))}
        </ul>
      )}
      <p className="page-sub">
        Opening it copies what you have built to the people the app is open to, and records who
        opened it and when. Only a person can open it — the agent cannot.
      </p>
      <div className="shelf-head" style={{ gap: 8 }}>
        <Button
          disabled={!gate.open}
          onClick={() =>
            void api.publishApp(props.appId).then(props.onDone, (error: unknown) =>
              setNotice(refusal(error, 'That could not be opened.')),
            )
          }
        >
          {app.publishedVersion === null ? 'Open it' : 'Open the latest version'}
        </Button>
        <Link to={`/projects/${props.projectId}/apps/${props.appId}`}>
          <Button variant="quiet">Go to the app</Button>
        </Link>
      </div>
      {app.publishedVersion !== null && app.publishedAt !== null && (
        <p className="page-sub">
          Last opened as version {app.publishedVersion} on {formatDateTime(app.publishedAt)}
          {app.publishedByName === null ? '' : ` by ${app.publishedByName}`}.
        </p>
      )}
      {notice !== null && <p className="page-sub">{notice}</p>}
    </Card>
  );
}
