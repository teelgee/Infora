// T-442 — **the stepped builder, with its agent beside it** (ADR-0056, and the
// 2026-09-06 addendum's six rulings; the approved drawing is
// `docs/design/mockups/app-builder-stepped-flow.html`).
//
// *In plain terms: the screen where a person builds an app step by step — what
// it is and who it is open to, its tables, the data it draws on, its screens,
// how often it runs, what its analysis should say, and finally checking it and
// opening it to people. An agent sits in a pane beside the steps, answers
// questions, and draws the screens.*
//
// 🔒 **THE STEPS ARE THE SPINE, AND THE PANE DOES NOT FILL THEM IN** (the
// addendum, rulings 5 and 6). A chat that filled the steps in was put to the
// owner and declined, because *"a chat can skip a question, a form cannot"*.
// So every choice lands in the form — closing the pane loses nothing — and the
// two questions the agent MUST ask (§2b) are computed from the definition by
// `pendingBuilderQuestions` in `@infora/contracts`, marked on the step rail and
// listed in the pane. They do not depend on what the model chooses to say.
//
// 🔒 **NO PERMISSION IS COMPUTED HERE.** `mayBuild` is the server's answer; a
// person who may not build this app is refused the working copy by the API and
// never reaches this screen. The narrowing an interface carries
// (`openToOrganisationIds`) is applied server-side too, in `apps.ts`.
//
// **The drawing is the acts and the states, drawn in the plain kit** — T-441's
// precedent, stated on its own record. What is honoured here is the step order,
// the two moments the agent asks, the pane's placement beside the steps, and
// the seventh step being the publish act; not a pixel of the mockup's chrome.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import type {
  AppColumnType,
  AppDefinition,
  AppInterface,
  AppSchedule,
  AppTableKind,
  AppTableRecord,
  BuilderQuestion,
  GetAppResponse,
  RosterEntry,
} from '@infora/contracts';
import { APP_SCHEDULES, INSIGHT_TABLE_COLUMNS, pendingBuilderQuestions } from '@infora/contracts';
import {
  Badge,
  Button,
  Card,
  Field,
  SectionLabel,
  SelectInput,
  Table,
  TextArea,
  TextInput,
} from '@infora/ui';
import { api } from '../api';
import { GeneratedScreen } from './app-screen';
import { formatDateTime } from './shared';

/** The seven steps, in the order the owner confirmed on 2026-09-06 (the
 * addendum's ruling 1). A `Record`-shaped constant rather than seven components
 * dotted about, so the order is one line to read and one line to change. */
const STEPS = [
  { n: 1, title: 'What the app is', sub: 'and who it is open to' },
  { n: 2, title: 'The tables', sub: 'what people fill in, and whether it holds contractual data' },
  { n: 3, title: 'Data connections', sub: 'systems outside Infora it draws on' },
  { n: 4, title: 'The interface', sub: 'the screens, and who may open each' },
  { n: 5, title: 'How often it runs', sub: 'a schedule, or only when someone presses Run' },
  { n: 6, title: 'Analysis and prompts', sub: 'what the agent says each run' },
  { n: 7, title: 'Check and open', sub: 'read it back; open it to its people' },
] as const;

/** T-443 — what a declared table is for, in the words a builder reads.
 * `reference` is on the enum for playbooks (T-445) and is not offered in the
 * steps yet, so its word is here for the listing and not for the picker. */
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

/** A stable id for a new interface or connection — lower-case, hyphenated, and
 * checked by the same rule the API validates against. */
function slugId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function AppBuilderScreen() {
  const { projectId, appId } = useParams();
  const [data, setData] = useState<GetAppResponse | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [step, setStep] = useState(1);
  const [saved, setSaved] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    if (appId === undefined) return;
    void api.app(appId).then(setData, () => setData(null));
  }, [appId]);
  useEffect(load, [load]);

  useEffect(() => {
    if (projectId === undefined) return;
    void api
      .participants(projectId)
      .then((res) => setRoster(res.items.filter((r) => r.removedAt === null)))
      .catch(() => setRoster([]));
  }, [projectId]);

  const definition = data?.app.definition ?? null;
  const tables = data?.tables ?? [];

  const questions = useMemo<BuilderQuestion[]>(
    () => (definition === null ? [] : pendingBuilderQuestions(definition, tables)),
    [definition, tables],
  );

  if (appId === undefined || projectId === undefined) return null;
  if (data === null) return <div className="content"><p className="page-sub">Loading…</p></div>;

  const { app } = data;

  // The API returns the working copy to a builder and null to everyone else, so
  // this is the server's answer rather than a check of our own.
  if (definition === null) {
    return (
      <div className="content">
        <h1 className="page">{app.name}</h1>
        <Card>
          <p className="page-sub">
            This app is not yours to build. Its own organisation decides who among its people may
            build it, and a closed app is built by nobody.{' '}
            <Link to={`/projects/${projectId}/tools/apps/${appId}`}>Open the app instead.</Link>
          </p>
        </Card>
      </div>
    );
  }

  /** Save the working copy. Every step writes through this one call, so a
   * change the agent proposed and a change somebody typed meet the same
   * validation on the way in. */
  const save = async (next: Partial<AppDefinition>) => {
    setNotice(null);
    try {
      await api.patchAppDefinition(appId, { definition: { ...definition, ...next } });
      setSaved(new Date().toISOString());
      load();
    } catch {
      setNotice('That could not be saved.');
    }
  };

  const answer = (key: string, next?: Partial<AppDefinition>) =>
    save({
      ...next,
      answeredQuestions: [...new Set([...definition.answeredQuestions, key])],
    });

  return (
    <div className="content">
      <h1 className="page">{app.name}</h1>
      <p className="page-sub">
        <Badge tone={app.publishedVersion === null ? 'neutral' : 'success'}>
          {app.publishedVersion === null
            ? 'Draft — not yet open to anyone'
            : `Open as version ${app.publishedVersion}`}
        </Badge>{' '}
        You are editing the working copy. Nothing you change here reaches the people the app is
        open to until you open it again at step 7.
      </p>

      <div className="builder">
        <nav className="builder-steps" aria-label="The steps">
          {STEPS.map((entry) => {
            const asks = questions.filter((q) => q.step === entry.n).length;
            return (
              <button
                key={entry.n}
                type="button"
                className={`builder-step${step === entry.n ? ' is-current' : ''}`}
                onClick={() => setStep(entry.n)}
              >
                <span className="builder-step-n">{entry.n}</span>
                <span>
                  <span className="builder-step-title">{entry.title}</span>
                  <span className="builder-step-sub">{entry.sub}</span>
                  {asks > 0 && <span className="builder-step-asks">The agent asks</span>}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="builder-body">
          {step === 1 && (
            <StepWhatItIs app={data} roster={roster} onDone={load} />
          )}
          {step === 2 && (
            <StepTables
              appId={appId}
              tables={tables}
              questions={questions.filter((q) => q.kind === 'contractual-data')}
              onAnswered={(tableId) => void answer(`contractual-data:${tableId}`)}
              onDone={load}
            />
          )}
          {step === 3 && <StepConnections definition={definition} onSave={save} />}
          {step === 4 && (
            <StepInterfaces
              appId={appId}
              definition={definition}
              tables={tables}
              roster={roster}
              appState={app.state}
              onSave={save}
              onAnswered={(interfaceId, next) => void answer(`who-may-open:${interfaceId}`, next)}
            />
          )}
          {step === 5 && <StepSchedule definition={definition} onSave={save} />}
          {step === 6 && <StepAnalysis definition={definition} tables={tables} onSave={save} />}
          {step === 7 && (
            <StepCheckAndOpen
              appId={appId}
              projectId={projectId}
              app={data}
              questions={questions}
              onDone={load}
            />
          )}
          <div className="builder-foot">
            <Button variant="quiet" disabled={step === 1} onClick={() => setStep(step - 1)}>
              ← Back
            </Button>
            <span className="page-sub">
              {saved === null ? 'Saved as you go' : `Saved ${formatDateTime(saved)}`}
            </span>
            <Button disabled={step === 7} onClick={() => setStep(step + 1)}>
              Next: {STEPS[step]?.title ?? ''} →
            </Button>
          </div>
          {notice !== null && <p className="page-sub">{notice}</p>}
        </div>

        <BuilderAgentPane appId={appId} step={step} questions={questions} />
      </div>
    </div>
  );
}

// ── Step 1 — what the app is, and who it is open to ────────────────────────

function StepWhatItIs(props: { app: GetAppResponse; roster: RosterEntry[]; onDone: () => void }) {
  const { app } = props.app;
  const [name, setName] = useState(app.name);
  const [description, setDescription] = useState(app.description ?? '');
  const [organisationId, setOrganisationId] = useState('');
  const organisations = [
    ...new Map(props.roster.map((r) => [r.organisationId, r.organisationName])).entries(),
  ].map(([value, label]) => ({ value, label }));

  return (
    <Card>
      <SectionLabel>What the app is</SectionLabel>
      <Field label="Name">
        <TextInput value={name} onChange={setName} />
      </Field>
      <Field label="What it is for" hint="One or two sentences, for the people who will open it.">
        <TextArea value={description} onChange={setDescription} rows={2} />
      </Field>
      <Button
        onClick={() =>
          void api
            .patchAppDefinition(app.id, { name, description: description === '' ? null : description })
            .then(props.onDone, props.onDone)
        }
      >
        Save
      </Button>

      <SectionLabel>Who it is open to</SectionLabel>
      <p className="page-sub">
        Being open to an organisation is not the same as being able to read a row. A row is read by
        the organisation that entered it and by the project owner, and by nobody else unless the
        project owner shares its whole table.
      </p>
      <ul>
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

// ── Step 2 — the tables, and the agent's first required question ───────────

/**
 * **The acceptance question is asked here, not found in a settings page**
 * (ADR-0056 §2b). It is the one choice that decides whether a figure can ever
 * change hands, so it is on the declaration form and it is also the question
 * the agent raises for any table that arrived without an answer.
 */
function StepTables(props: {
  appId: string;
  tables: AppTableRecord[];
  questions: BuilderQuestion[];
  onAnswered: (tableId: string) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [columns, setColumns] = useState('month:Month:text, landfill:Waste to landfill (tonnes):number');
  const [hasAcceptance, setHasAcceptance] = useState('');
  // T-443 — what the table is FOR. `data` is what people fill in; `insight` is
  // where a run writes what it found, and its columns are Infora's rather than
  // the builder's, so the run always knows where the sentence goes.
  const [kind, setKind] = useState<AppTableKind>('data');
  const [notice, setNotice] = useState<string | null>(null);
  const isInsight = kind === 'insight';

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
    try {
      const table = await api.declareAppTable(props.appId, {
        name: name.trim(),
        // the API replaces these for an insight table, and sending them here is
        // what the builder is shown on screen — the two agree by using the one
        // exported list rather than by both being typed out
        columns: isInsight ? INSIGHT_TABLE_COLUMNS : parsed,
        kind,
        hasAcceptance: isInsight ? false : hasAcceptance === 'yes',
      });
      setName('');
      setHasAcceptance('');
      setKind('data');
      // declaring a table ANSWERS the agent's question about it — the form
      // asked, so the pane does not ask again
      props.onAnswered(table.id);
      props.onDone();
    } catch {
      setNotice('That table could not be declared. Check the column list.');
    }
  };

  return (
    <Card>
      <SectionLabel>The tables</SectionLabel>
      <p className="page-sub">
        Each table is a set of columns people fill in, one row at a time. Every row remembers which
        organisation and which person entered it.
      </p>
      {props.tables.length > 0 && (
        <Table>
          <table>
            <thead>
              <tr>
                <th>Table</th>
                <th>What it is for</th>
                <th>Columns</th>
                <th>Acceptance</th>
              </tr>
            </thead>
            <tbody>
              {props.tables.map((table) => (
                <tr key={table.id}>
                  <td>{table.name}</td>
                  <td>{TABLE_KIND_WORDS[table.kind]}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </Table>
      )}

      {/* the required question, for a table that arrived without an answer */}
      {props.questions.map((question) => (
        <div key={question.subjectId} className="builder-ask">
          <SectionLabel>The agent asks</SectionLabel>
          <p>{question.question}</p>
          <div className="shelf-head" style={{ gap: 8 }}>
            <Button
              onClick={() =>
                void api
                  .setAppTableAcceptance(question.subjectId, true)
                  .then(() => props.onAnswered(question.subjectId), () =>
                    setNotice(
                      'That table already has rows in it, so an acceptance step cannot be added now — a figure that has already changed hands cannot change hands again. Declare a new table instead.',
                    ),
                  )
              }
            >
              Yes — it holds contractual data
            </Button>
            <Button
              variant="quiet"
              onClick={() =>
                void api
                  .setAppTableAcceptance(question.subjectId, false)
                  .then(() => props.onAnswered(question.subjectId), () =>
                    setNotice('That table already has rows in it, so its acceptance step cannot be removed.'),
                  )
              }
            >
              No — it is working data
            </Button>
          </div>
        </div>
      ))}

      <SectionLabel>Add a table</SectionLabel>
      <Field label="Name">
        <TextInput value={name} onChange={setName} placeholder="Monthly returns" />
      </Field>
      <Field
        label="What is this table for?"
        hint="An insight table is where the app's analysis lands each time it runs. Its columns are fixed, and nobody types into it."
      >
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
        /* T-443 — the columns of an insight table are Infora's, so they are
           shown rather than asked for. A field that looked editable and was
           overwritten by the server would be worse than no field. */
        <p className="page-sub">
          Its columns are fixed: {INSIGHT_TABLE_COLUMNS.map((column) => column.label).join(', ')}.
          Each run writes one row here, stamped with the organisation of whoever ran it — so your
          firm and the project owner read it, and nobody else does.
        </p>
      ) : (
        <>
          <Field label="Columns" hint="key:label:type, separated by commas. Types: text, number, date, boolean, choice.">
            <TextInput value={columns} onChange={setColumns} mono />
          </Field>
          <Field
            label="Does this table hold contractual data?"
            hint="If it does, a row is submitted and then accepted or rejected, and an accepted row becomes the project owner's record — never edited or deleted in place; a correction arrives as a new row."
          >
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
      <Button
        onClick={() => void declare()}
        disabled={name.trim() === '' || (!isInsight && hasAcceptance === '')}
      >
        Declare the table
      </Button>
      {notice !== null && <p className="page-sub">{notice}</p>}
    </Card>
  );
}

// ── Step 3 — data connections, declared and visibly unfillable ─────────────

function StepConnections(props: {
  definition: AppDefinition;
  onSave: (next: Partial<AppDefinition>) => Promise<void>;
}) {
  const [system, setSystem] = useState('');
  const [needs, setNeeds] = useState('');

  return (
    <Card>
      <SectionLabel>Data connections</SectionLabel>
      {/* ADR-0057's build waits for the deployment's secrets store, and saying
          so plainly is the honest state — a field that looked fillable and was
          not would be worse than no field. */}
      <p className="page-sub">
        A connection to a system outside Infora is <strong>described here and connected after
        Infora is deployed</strong>. There is nowhere to type a password or an address on this
        screen, on purpose: this machine has no safe place to keep one. What you write is the
        requirement — what the app would need, for whoever satisfies it later.
      </p>
      {props.definition.connections.length === 0 ? (
        <p className="page-sub">Nothing described. Most apps need none.</p>
      ) : (
        <ul>
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
      <Field label="What kind of system" hint="e.g. ArcGIS, a supplier's portal">
        <TextInput value={system} onChange={setSystem} />
      </Field>
      <Field label="What the app would want from it">
        <TextArea value={needs} onChange={setNeeds} rows={2} />
      </Field>
      <Button
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
        Describe this connection
      </Button>
    </Card>
  );
}

// ── Step 4 — the interface, and the agent's second required question ───────

function StepInterfaces(props: {
  appId: string;
  definition: AppDefinition;
  tables: AppTableRecord[];
  roster: RosterEntry[];
  appState: GetAppResponse['app']['state'];
  onSave: (next: Partial<AppDefinition>) => Promise<void>;
  onAnswered: (interfaceId: string, next: Partial<AppDefinition>) => void;
}) {
  const [label, setLabel] = useState('');
  const [appTableId, setAppTableId] = useState('');
  const organisations = [
    ...new Map(props.roster.map((r) => [r.organisationId, r.organisationName])).entries(),
  ];

  const replace = (id: string, next: Partial<AppInterface>): AppInterface[] =>
    props.definition.interfaces.map((screen) => (screen.id === id ? { ...screen, ...next } : screen));

  return (
    <Card>
      <SectionLabel>The interface</SectionLabel>
      <p className="page-sub">
        Describe each screen in plain words and the agent writes it. A screen runs in the viewer's
        own browser and shows each person only what they could already see — choosing who may open
        one can narrow who sees something, never widen it.
      </p>

      {props.definition.interfaces.map((screen) => {
        const table = props.tables.find((t) => t.id === screen.appTableId) ?? null;
        return (
          <div key={screen.id} className="builder-screen">
            <div className="shelf-head">
              <strong>{screen.label}</strong>
              <Badge tone={screen.openToOrganisationIds.length === 0 ? 'neutral' : 'info'}>
                {screen.openToOrganisationIds.length === 0
                  ? 'Opens to everyone the app is open to'
                  : `Opens to ${screen.openToOrganisationIds
                      .map((orgId) => organisations.find(([id]) => id === orgId)?.[1] ?? 'an organisation')
                      .join(', ')}`}
              </Badge>
              <Button
                variant="quiet"
                size="sm"
                onClick={() =>
                  void props.onSave({
                    interfaces: props.definition.interfaces.filter((s) => s.id !== screen.id),
                  })
                }
              >
                Remove
              </Button>
            </div>

            {/* who may open it — the agent's second required question, answered
                in the form so that closing the pane loses nothing */}
            <Field label="Who may open this screen?">
              <div className="shelf-head" style={{ gap: 6, flexWrap: 'wrap' }}>
                <Button
                  size="sm"
                  variant={screen.openToOrganisationIds.length === 0 ? 'primary' : 'quiet'}
                  onClick={() =>
                    props.onAnswered(screen.id, {
                      interfaces: replace(screen.id, { openToOrganisationIds: [] }),
                    })
                  }
                >
                  Everyone the app is open to
                </Button>
                {organisations.map(([orgId, orgName]) => {
                  const on = screen.openToOrganisationIds.includes(orgId);
                  return (
                    <Button
                      key={orgId}
                      size="sm"
                      variant={on ? 'primary' : 'quiet'}
                      onClick={() =>
                        props.onAnswered(screen.id, {
                          interfaces: replace(screen.id, {
                            openToOrganisationIds: on
                              ? screen.openToOrganisationIds.filter((id) => id !== orgId)
                              : [...screen.openToOrganisationIds, orgId],
                          }),
                        })
                      }
                    >
                      {orgName}
                    </Button>
                  );
                })}
              </div>
            </Field>

            <ScreenWriter
              appId={props.appId}
              screen={screen}
              table={table}
              onWritten={(source) =>
                void props.onSave({ interfaces: replace(screen.id, { source }) })
              }
            />

            {table !== null && screen.source !== null && (
              <>
                <SectionLabel>What this screen looks like to you</SectionLabel>
                <GeneratedScreen
                  source={screen.source}
                  table={table}
                  appState={props.appState}
                />
              </>
            )}
          </div>
        );
      })}

      <SectionLabel>Add a screen</SectionLabel>
      <Field label="What it is called">
        <TextInput value={label} onChange={setLabel} placeholder="Submit a return" />
      </Field>
      <Field label="Which table it is over">
        <SelectInput
          value={appTableId}
          onChange={setAppTableId}
          options={props.tables.map((table) => ({ value: table.id, label: table.name }))}
          placeholder="Choose a table…"
        />
      </Field>
      <Button
        disabled={label.trim() === '' || appTableId === ''}
        onClick={() => {
          void props
            .onSave({
              interfaces: [
                ...props.definition.interfaces,
                {
                  id: slugId('screen'),
                  label: label.trim(),
                  appTableId,
                  openToOrganisationIds: [],
                  source: null,
                },
              ],
            })
            .then(() => {
              setLabel('');
              setAppTableId('');
            });
        }}
      >
        Add this screen
      </Button>
    </Card>
  );
}

/**
 * The agent drawing one screen.
 *
 * **It proposes; this component saves.** What comes back goes onto the working
 * copy through the same `PATCH /definition` a hand edit takes — and is refused
 * there if it is not a screen in the grammar, so there is no road from the
 * model to the store that skips the check.
 */
function ScreenWriter(props: {
  appId: string;
  screen: AppInterface;
  table: AppTableRecord | null;
  onWritten: (source: string) => void;
}) {
  const [purpose, setPurpose] = useState('');
  const [busy, setBusy] = useState(false);
  const [followUp, setFollowUp] = useState<string | null>(null);

  if (props.table === null) {
    return <p className="page-sub">This screen has no table yet, so there is nothing to draw.</p>;
  }

  const write = async () => {
    setBusy(true);
    setFollowUp(null);
    try {
      const answer = await api.writeAppScreen(props.appId, {
        appTableId: props.table!.id,
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
    <div className="agent-pane">
      <span className="field-label">
        {props.screen.source === null ? 'What this screen does' : 'What should change about it'}
      </span>
      <TextArea
        value={purpose}
        onChange={setPurpose}
        rows={2}
        placeholder="e.g. A form for one month's return, with the totals so far underneath."
      />
      {followUp !== null && <p className="agent-pane-followup">{followUp}</p>}
      <div className="agent-pane-controls">
        <Button size="sm" variant="primary" disabled={busy || purpose.trim() === ''} onClick={() => void write()}>
          {props.screen.source === null ? 'Write this screen' : 'Rewrite this screen'}
        </Button>
      </div>
    </div>
  );
}

// ── Step 5 — how often it runs ─────────────────────────────────────────────

function StepSchedule(props: {
  definition: AppDefinition;
  onSave: (next: Partial<AppDefinition>) => Promise<void>;
}) {
  return (
    <Card>
      <SectionLabel>How often it runs</SectionLabel>
      <Field label="Run the analysis">
        <SelectInput
          value={props.definition.schedule}
          onChange={(value) => void props.onSave({ schedule: value as AppSchedule })}
          options={APP_SCHEDULES.map((schedule) => ({
            value: schedule,
            label: SCHEDULE_WORDS[schedule],
          }))}
        />
      </Field>
      {/* ADR-0056 §13d — stored from the first ticket, honoured when a clock
          exists. Saying it plainly is the whole point: a schedule that looks
          set and does nothing is a claim the screen would be making falsely. */}
      {props.definition.schedule !== 'manual' && (
        <p className="page-sub">
          <Badge tone="warning">Saved, but not running yet</Badge> Infora runs on one machine that
          is not always on, so nothing happens on a clock today. This schedule is stored and starts
          working the day there is a server that stays on. Until then the app runs when somebody
          presses Run.
        </p>
      )}
    </Card>
  );
}

// ── Step 6 — analysis and prompts ──────────────────────────────────────────

function StepAnalysis(props: {
  definition: AppDefinition;
  tables: AppTableRecord[];
  onSave: (next: Partial<AppDefinition>) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState(props.definition.analysisPrompt ?? '');
  // T-443 — an insight has to land somewhere. Saying so here, where the prompt
  // is written, is the honest place: a prompt saved with nowhere to put its
  // answer is a setting that looks live and does nothing.
  const insightTable = props.tables.find((table) => table.kind === 'insight' && table.retiredAt === null);
  return (
    <Card>
      <SectionLabel>Analysis and prompts</SectionLabel>
      <p className="page-sub">
        What the agent should write about the rows each run covers. It writes the sentence; the
        figures are computed, never written by a model. A run acts as whoever pressed Run — or, on
        a schedule, as the app's owner — so it covers the rows that person may read and no others.
      </p>
      <Field label="What the analysis should say">
        <TextArea
          value={prompt}
          onChange={setPrompt}
          rows={4}
          placeholder="e.g. Say which organisations have returned this month and which have not, and note any figure that moved by more than a fifth against last month."
        />
      </Field>
      <Button onClick={() => void props.onSave({ analysisPrompt: prompt === '' ? null : prompt })}>
        Save the prompt
      </Button>
      {insightTable === undefined ? (
        <p className="page-sub">
          <Badge tone="warning">Nowhere to write it yet</Badge> A run keeps what it finds as a row
          in an insight table, and this app has not declared one. Go back to step 2 and add a table
          whose purpose is “where a run writes what it found”; until then a run will read the rows
          and record that it had nowhere to write.
        </p>
      ) : (
        <p className="page-sub">
          <Badge tone="success">It has somewhere to land</Badge> Each run writes one row into “
          {insightTable.name}”, stamped with the organisation of whoever ran it, with how many rows
          it covered and which opened version it ran against.
        </p>
      )}
    </Card>
  );
}

// ── Step 7 — check and open (the publish act) ──────────────────────────────

/**
 * **The seventh step IS the publish act** (the addendum's ruling 2): the
 * builder edits a working copy, and the people the app is open to see the
 * published one. So this step reads the whole definition back and says what
 * will change hands, and the button is what puts it in front of them.
 */
function StepCheckAndOpen(props: {
  appId: string;
  projectId: string;
  app: GetAppResponse;
  questions: BuilderQuestion[];
  onDone: () => void;
}) {
  const { app, tables } = props.app;
  const definition = app.definition!;
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <Card>
      <SectionLabel>Check and open</SectionLabel>
      <ul>
        <li>
          <strong>{app.name}</strong> — {app.description ?? 'no description'}
        </li>
        <li>
          Open to:{' '}
          {app.scope
            .filter((g) => g.revokedAt === null)
            .map((g) => g.organisationName ?? g.participantName ?? 'someone')
            .join(', ') || 'nobody yet'}
        </li>
        <li>
          Tables:{' '}
          {tables.length === 0
            ? 'none declared'
            : tables
                .map((t) => `${t.name}${t.hasAcceptance ? ' (with an acceptance step)' : ''}`)
                .join(', ')}
        </li>
        <li>Data connections described: {definition.connections.length}</li>
        <li>
          Screens:{' '}
          {definition.interfaces.length === 0
            ? 'none'
            : definition.interfaces
                .map(
                  (screen) =>
                    `${screen.label}${screen.source === null ? ' (not drawn yet)' : ''}${
                      screen.openToOrganisationIds.length === 0 ? '' : ' — narrowed'
                    }`,
                )
                .join(', ')}
        </li>
        <li>Runs: {SCHEDULE_WORDS[definition.schedule]}</li>
        <li>Analysis prompt: {definition.analysisPrompt === null ? 'none' : 'written'}</li>
      </ul>

      {props.questions.length > 0 && (
        <div className="builder-ask">
          <SectionLabel>Still to answer</SectionLabel>
          <ul>
            {props.questions.map((question) => (
              <li key={`${question.kind}:${question.subjectId}`}>
                Step {question.step} — {question.subjectName}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="page-sub">
        Opening it copies what you have built to the people the app is open to, and records who
        opened it and when. Until then only its builders can see any of this.
      </p>
      <div className="shelf-head" style={{ gap: 8 }}>
        <Button
          onClick={() =>
            void api.publishApp(props.appId).then(props.onDone, () =>
              setNotice('That could not be opened.'),
            )
          }
        >
          {app.publishedVersion === null ? 'Check and open' : 'Open the latest version'}
        </Button>
        <Link to={`/projects/${props.projectId}/tools/apps/${props.appId}`}>
          <Button variant="quiet">Open the app</Button>
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

// ── The agent's pane, beside the steps (the addendum's ruling 5) ───────────

/**
 * **The pane, and what it is not.** The conversation runs alongside the steps
 * and is continuous across them; the agent answers about the app being built
 * and writes nothing into it. Every choice lives in the form, so closing this
 * pane loses nothing — which is the sentence the ruling turns on.
 *
 * The conversation is kept in this component and nowhere else: it is not
 * stored, so there is no new record about a named person to register, and a
 * refreshed page starts a fresh conversation over a definition that already
 * carries every answer.
 */
export function BuilderAgentPane(props: {
  appId: string;
  step: number;
  questions: BuilderQuestion[];
}) {
  const [turns, setTurns] = useState<Array<{ from: 'you' | 'agent'; text: string }>>([]);
  const [ask, setAsk] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const text = ask.trim();
    if (text === '') return;
    setTurns((prev) => [...prev, { from: 'you', text }]);
    setAsk('');
    setBusy(true);
    try {
      const answer = await api.askBuilderAgent(props.appId, { step: props.step, ask: text });
      setTurns((prev) => [...prev, { from: 'agent', text: answer.reply }]);
    } catch {
      setTurns((prev) => [
        ...prev,
        { from: 'agent', text: 'I could not be reached just now. Your steps are saved.' },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="builder-agent">
      <div className="shelf-head">
        <SectionLabel>The builder&rsquo;s agent</SectionLabel>
        <span className="page-sub">Step {props.step} of 7</span>
      </div>

      {/* 🔒 the two required questions, computed from the definition — not
          something the model decides to raise (ADR-0056 §2b, addendum ruling 6) */}
      {props.questions.length > 0 && (
        <div className="builder-ask">
          <span className="field-label">Still to ask you</span>
          {props.questions.map((question) => (
            <p key={`${question.kind}:${question.subjectId}`}>{question.question}</p>
          ))}
        </div>
      )}

      <div className="builder-turns">
        {turns.length === 0 ? (
          <p className="page-sub">
            Ask about anything you are building — what an acceptance step means, who ends up seeing
            a screen, what a schedule will and will not do.
          </p>
        ) : (
          turns.map((turn, index) => (
            <p key={index} className={turn.from === 'you' ? 'bubble mine' : 'reply'}>
              {turn.text}
            </p>
          ))
        )}
      </div>

      <TextArea value={ask} onChange={setAsk} rows={2} placeholder="Ask the agent…" />
      <Button size="sm" disabled={busy || ask.trim() === ''} onClick={() => void send()}>
        Ask
      </Button>
    </aside>
  );
}
