// T-155 — the TIDP page (ADR-0008/0033). One substrate, two views: a member
// reads and writes its own organisation's rows (the TIDP); the owner reads
// every organisation's (the MIDP consolidation). A new row creates a planned
// container; its coded reference comes from the code-builder (T-156) or, where
// no scheme is defined yet, is entered by hand. Live status is event-driven.
import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import type { MeResponse, NamingScheme, PlanRow } from '@infora/contracts';
import { FileText, Plus } from 'lucide-react';
import { Badge, Button, SectionLabel, Table } from '@infora/ui';
import { api } from '../api';

type ShellContext = { participant: MeResponse['participants'][number] };

const stateTone = (state: PlanRow['state']) =>
  state === 'live' ? 'success' : state === 'rejected' ? 'danger' : 'neutral';

export function PlanScreen() {
  const { participant } = useOutletContext<ShellContext>();
  const projectId = participant.projectId;
  const isOwner = participant.membershipRole === 'owner';

  const [rows, setRows] = useState<PlanRow[] | null>(null);
  const [scheme, setScheme] = useState<NamingScheme | null>(null);
  const [creating, setCreating] = useState(false);
  const [reference, setReference] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = () => void api.plan(projectId).then((res) => setRows(res.items));
  useEffect(load, [projectId]);
  useEffect(() => {
    void api.namingScheme(projectId).then(setScheme);
  }, [projectId]);

  const grouped = useMemo(() => {
    const by = new Map<string, PlanRow[]>();
    for (const r of rows ?? []) {
      const key = r.producingOrganisationName;
      (by.get(key) ?? by.set(key, []).get(key)!).push(r);
    }
    return [...by.entries()];
  }, [rows]);

  async function create() {
    setError(null);
    try {
      await api.createPlanRow(projectId, reference.trim(), title.trim());
      setReference('');
      setTitle('');
      setCreating(false);
      load();
    } catch {
      setError('Could not create the deliverable — check the reference is unique and scheme-compliant.');
    }
  }

  async function generate() {
    // a minimal code-builder call: prompt for each non-serial field value, then
    // compose server-side. The full field-picker UI is the schema surface (T-156).
    if (!scheme) return;
    const values: Record<string, string> = {};
    for (const f of scheme.fields.filter((x) => !x.isSerial)) {
      const hint = f.allowedValues?.length ? ` (${f.allowedValues.join(' / ')})` : '';
      const v = window.prompt(`${f.label}${hint}`, f.allowedValues?.[0] ?? '');
      if (v === null) return;
      values[f.key] = v;
    }
    try {
      const out = await api.generateReference(projectId, values);
      setReference(out.reference);
    } catch {
      setError('The code-builder rejected those values — check them against the scheme.');
    }
  }

  return (
    <div className="content">
      <h1 className="page">{isOwner ? 'Project schedule (MIDP)' : 'Deliverable plan (TIDP)'}</h1>
      <p className="page-sub">
        {isOwner
          ? 'Every organisation’s planned deliverables, consolidated. Each row is a container; status is event-driven.'
          : 'Your organisation’s planned deliverables. Add a row to reserve a coded container; draft it in the sandbox, then bind and promote.'}
        {' '}
        <Link to={`/projects/${projectId}/plan/scheme`}>Coding scheme →</Link>
      </p>

      <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <Button onClick={() => setCreating((v) => !v)}>
          <Plus size={14} strokeWidth={2} /> New deliverable
        </Button>
      </div>

      {creating && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <input
            className="input mono"
            placeholder="Reference (e.g. WA-BB-GEO-004)"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            style={{ minWidth: 220 }}
          />
          {scheme && (
            <Button variant="quiet" onClick={() => void generate()}>
              Build code
            </Button>
          )}
          <input
            className="input"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ minWidth: 260 }}
          />
          <Button onClick={() => void create()} disabled={!reference.trim() || !title.trim()}>
            Create
          </Button>
        </div>
      )}
      {error && <p style={{ color: 'var(--danger, #c0392b)' }}>{error}</p>}

      {grouped.map(([org, orgRows]) => (
        <div key={org}>
          <SectionLabel>{org}</SectionLabel>
          <Table>
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Revision</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {orgRows.map((r) => (
                  <tr key={r.containerId}>
                    <td>
                      <span className="ficon"><FileText size={14} strokeWidth={2} /></span>
                      <span className="mono">{r.documentReference}</span>
                    </td>
                    <td>
                      {r.workItem ? (
                        <Link to={`/projects/${projectId}/work-items/${r.workItem.id}`}>{r.workItem.title}</Link>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Reference material</span>
                      )}
                    </td>
                    <td>
                      <Badge tone={stateTone(r.state)}>{r.workItem?.status ?? r.state}</Badge>
                    </td>
                    <td className="mono">{r.currentVersion?.versionReference ?? '—'}</td>
                    <td>{r.deliverableCode ? `${r.deliverableCode.code} · ${r.deliverableCode.description}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Table>
        </div>
      ))}
      {rows !== null && rows.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>No deliverables planned yet.</p>
      )}
    </div>
  );
}
