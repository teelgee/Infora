// T-463 — "HOW THE AI WORKS HERE": the transparency table and the switches.
//
// *In plain terms: one page an owner organisation can read on day one — and
// hand to its client — saying for every AI feature what it reads, what it may
// write, where it runs, what it keeps and that it never trains on the project's
// data. The owner's super user can turn any feature off for this project,
// saying why; every throw is listed with a name and a date. The same page in
// the workspace shows the deployment's facts with no project and no switch.*
import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router';
import type { AiFeatureRow, AiTransparencyResponse, MeResponse } from '@infora/contracts';
import { Badge, Button, Field, Modal, SectionLabel, Table, TextArea, PageIntro } from '@infora/ui';
import { api } from '../api';
import { rememberAiFeatures } from '../ai-features';
import { formatDate } from './shared';

type ShellContext = { participant: MeResponse['participants'][number] };

export function AiTransparencyScreen() {
  const { participant } = useOutletContext<ShellContext>();
  const projectId = participant.projectId;
  const [table, setTable] = useState<AiTransparencyResponse | null>(null);
  const [throwing, setThrowing] = useState<AiFeatureRow | null>(null);
  const load = useCallback(() => {
    void api.aiTransparency(projectId).then((t) => {
      setTable(t);
      rememberAiFeatures(projectId, t);
    });
  }, [projectId]);
  useEffect(load, [load]);
  return (
    <div className="content">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="page">How the AI works here</h1>
          <PageIntro
            line="Every AI feature on this project: what it reads, what it may write, where it runs, what it keeps — and that none of it ever trains a model."
            more={
              table?.mayConfigure
                ? 'As the owner’s super user you can turn a feature off for this project, giving a reason; a switched-off feature disappears from every screen until it is turned back on, and every change is kept here with your name for everyone on the project to read.'
                : 'Only the project owner’s super user can turn a feature off for this project; every change is listed here with a name, a date and the reason.'
            }
          />
        </div>
        <Button size="sm" variant="quiet" onClick={() => void api.exportAiTransparency(projectId)}>
          Export as a document
        </Button>
      </div>
      {table && (
        <>
          <TransparencyTable table={table} onThrow={table.mayConfigure ? setThrowing : undefined} />
          {table.history.length > 0 && (
            <>
              <SectionLabel>Switch history</SectionLabel>
              <Table>
                <table aria-label="Switch history">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Who</th>
                      <th>Feature</th>
                      <th>Change</th>
                      <th>Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.history.map((h, i) => (
                      <tr key={i}>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatDate(h.at)}</td>
                        <td>{h.name}</td>
                        <td>{table.features.find((f) => f.key === h.key)?.label ?? h.key}</td>
                        <td>
                          <Badge tone={h.enabled ? 'success' : 'warning'}>{h.enabled ? 'Turned on' : 'Turned off'}</Badge>
                        </td>
                        <td>{h.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Table>
            </>
          )}
        </>
      )}
      {throwing && (
        <SwitchModal
          feature={throwing}
          onClose={() => setThrowing(null)}
          onSubmit={async (reason) => {
            const next = await api.setAiFeature(projectId, throwing.key, { enabled: !throwing.enabled, reason });
            setTable(next);
            rememberAiFeatures(projectId, next);
            setThrowing(null);
          }}
        />
      )}
    </div>
  );
}

/** the table itself — the project page and the workspace page share it */
export function TransparencyTable(props: { table: AiTransparencyResponse; onThrow?: ((f: AiFeatureRow) => void) | undefined }) {
  const { tier, routes } = props.table;
  return (
    <>
      {/* T-487 — the line below says what the tier ALLOWS. When no model route is
          declared to meet it, every AI feature is refused, and describing UK,
          zero-retention calls as if they were happening would be false. */}
      {!routes.anyQualifies && (
        <div className="banner banner--warning" role="alert" style={{ marginTop: 12 }}>
          <strong>AI features are not working on this setup.</strong> No model route meets the{' '}
          <strong>{tier.tier}</strong> security tier, so every AI feature is refused rather than
          sent somewhere the tier does not allow.
          {routes.problems.length > 0 && (
            <ul aria-label="Why no model route qualifies" style={{ margin: '6px 0 0', paddingLeft: 20 }}>
              {routes.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: 6 }}>
            This is for whoever runs Infora here to put right: they declare what is true of the model
            contract behind it, in the settings described in <code>.env.example</code>.
          </div>
        </div>
      )}
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '12px 0 8px' }}>
        <strong>{routes.anyQualifies ? 'Where every call runs:' : 'Where a call would run, if a route qualified:'}</strong> the <strong>{tier.tier}</strong> tier — region {tier.region.join(', ')}; retention{' '}
        {tier.retention.join(', ')}; jurisdiction {tier.jurisdiction.join(', ')}. The model router enforces this on every call and refuses rather
        than falls back (ADR-0037). <strong>No model is ever trained on this project’s data</strong> (ADR-0026).
      </p>
      <Table>
        <table aria-label="How the AI works here">
          <thead>
            <tr>
              <th>Feature</th>
              <th>Where you meet it</th>
              <th>What it reads</th>
              <th>What it may write</th>
              <th>What it keeps</th>
              <th>Trains on your data</th>
              <th>On this project</th>
            </tr>
          </thead>
          <tbody>
            {props.table.features.map((f) => (
              <tr key={f.key}>
                <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{f.label}</td>
                <td style={{ fontSize: 12.5 }}>{f.where}</td>
                <td style={{ fontSize: 12.5 }}>{f.reads}</td>
                <td style={{ fontSize: 12.5 }}>{f.mayWrite}</td>
                <td style={{ fontSize: 12.5 }}>{f.keeps}</td>
                <td>
                  <Badge tone="success">Never</Badge>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <Badge tone={f.enabled ? 'success' : 'warning'}>{f.enabled ? 'On' : 'Off'}</Badge>
                    {props.onThrow && f.switchable && (
                      <Button size="sm" variant="quiet" onClick={() => props.onThrow!(f)} aria-label={`${f.enabled ? 'Turn off' : 'Turn on'} ${f.label}`}>
                        {f.enabled ? 'Turn off…' : 'Turn on…'}
                      </Button>
                    )}
                  </span>
                  {f.lastChange && (
                    <div className="field-hint" style={{ marginTop: 4 }}>
                      {f.lastChange.enabled ? 'On' : 'Off'} since {formatDate(f.lastChange.at)} — {f.lastChange.name}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Search and the retrieval index</td>
              <td style={{ fontSize: 12.5 }}>Every register’s search box, and under every feature above</td>
              <td style={{ fontSize: 12.5 }}>Each published version of the project library, and your organisation’s own working documents only for your organisation</td>
              <td style={{ fontSize: 12.5 }}>Nothing. It indexes; it does not author</td>
              <td style={{ fontSize: 12.5 }}>Passages and their vectors under the pinned embedding model (ADR-0024), deleted when the document is erased</td>
              <td>
                <Badge tone="success">Never</Badge>
              </td>
              <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 12.5 }}>Always on — the substrate</td>
            </tr>
          </tbody>
        </table>
      </Table>
    </>
  );
}

function SwitchModal(props: { feature: AiFeatureRow; onClose: () => void; onSubmit: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const off = props.feature.enabled;
  return (
    <Modal
      open
      onClose={props.onClose}
      size="sm"
      title={`${off ? 'Turn off' : 'Turn on'} ${props.feature.label}`}
      footer={
        <>
          <Button variant="quiet" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            variant={off ? 'danger' : 'primary'}
            disabled={busy || reason.trim() === ''}
            onClick={async () => {
              setBusy(true);
              await props.onSubmit(reason.trim()).finally(() => setBusy(false));
            }}
          >
            {off ? 'Turn off for this project' : 'Turn on'}
          </Button>
        </>
      }
    >
      <p style={{ marginTop: 0, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {off
          ? 'The feature disappears from every screen on this project and its endpoint refuses until it is turned back on. Nothing already produced is removed.'
          : 'The feature returns to every screen on this project.'}{' '}
        The change is kept with your name, the time and this reason, and everyone on the project can read it.
      </p>
      <Field label="Why" hint="A project decision, in a sentence — not a note about anybody.">
        <TextArea value={reason} onChange={setReason} rows={3} placeholder={off ? 'e.g. The client has not yet agreed automated checking on its documents.' : 'e.g. The client agreed it on 23 October.'} />
      </Field>
    </Modal>
  );
}
