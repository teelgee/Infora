// The owner's audited read (T-060) per docs/design/mockups/owner-audit.html,
// reached by role switch — the owner Participant uses the same app. The
// work item's live status and the full immutable Run/Step tree: chain,
// sub-agent (child run steps inline), sources, rail outcomes, prompt text.
// Work-item-bound runs are project record (ruled 2026-07-06); ad-hoc runs
// never appear here — the API's visibility rule filters them.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { GetWorkItemResponse, Run, Step } from '@infora/contracts';
import { Badge, Card, SectionLabel } from '@infora/ui';
import { api } from '../api';
import { statusBadge } from './shared';

export function WorkItemAuditScreen() {
  const { workItemId } = useParams();
  const [workItem, setWorkItem] = useState<GetWorkItemResponse | null>(null);
  const [selected, setSelected] = useState<Run | null>(null);
  const [childRuns, setChildRuns] = useState<Record<string, Run>>({});

  useEffect(() => {
    if (workItemId === undefined) return;
    void api.workItem(workItemId).then((item) => {
      setWorkItem(item);
      setSelected(item.runs.at(-1) ?? null);
    });
  }, [workItemId]);

  // the sub-agent appears as a real child Run — fetch each delegate's child
  useEffect(() => {
    if (selected === null) return;
    for (const step of selected.steps) {
      if (step.childRunId !== undefined && childRuns[step.childRunId] === undefined) {
        void api.run(step.childRunId).then((child) => {
          setChildRuns((known) => ({ ...known, [child.id]: child }));
        });
      }
    }
  }, [selected, childRuns]);

  if (workItem === null) return null;
  const status = statusBadge(workItem.status);

  return (
    <div className="content">
      <h1 className="page">{workItem.title}</h1>
      <p className="page-sub">
        Work item · {workItem.type.replaceAll('_', ' ')} ·{' '}
        {workItem.runs.length === 0
          ? 'no runs yet'
          : `${workItem.runs.length} run${workItem.runs.length === 1 ? '' : 's'} to date`}{' '}
        · <Badge tone={status.tone}>{status.label}</Badge>
      </p>

      <div className="banner" style={{ marginTop: 20 }}>
        <span>🛡</span>
        <div>
          <b>Append-only audit.</b> Every run below is the immutable record written at execution —
          nothing here can be edited or deleted, by anyone. You are seeing what your role admits:
          the work item, its runs, and their grounding evidence. Other organisations&apos; private
          sandbox content and org context are not visible and not reachable.
        </div>
      </div>

      <SectionLabel>Runs on this work item</SectionLabel>
      <Card>
        <table>
          <thead>
            <tr>
              <th>Run</th>
              <th>Trigger</th>
              <th>Agent</th>
              <th>Outcome</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {workItem.runs.map((run) => (
              <tr
                key={run.id}
                onClick={() => setSelected(run)}
                style={{ cursor: 'pointer', background: selected?.id === run.id ? '#fcfbf8' : undefined }}
              >
                <td className="mono">{run.id.slice(0, 8)}</td>
                <td>
                  <div className="title" style={{ fontWeight: 500 }}>
                    “{run.request.length > 64 ? `${run.request.slice(0, 64)}…` : run.request}”
                  </div>
                </td>
                <td>Infora · {run.agentId.replace('infora.', '').replaceAll('_', ' ')}</td>
                <td>{outcomeBadge(run)}</td>
                <td>{new Date(run.startedAt).toLocaleString()}</td>
              </tr>
            ))}
            {workItem.runs.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: 'var(--muted)' }}>
                  No runs recorded on this work item yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {selected !== null && (
        <>
          <SectionLabel>
            Run {selected.id.slice(0, 8)} — step tree (retrieve → draft → ground-check → cite)
          </SectionLabel>
          <Card>
            <div className="run-tree">
              {selected.steps.map((step) => (
                <StepRows key={step.id} step={step} child={step.childRunId !== undefined ? childRuns[step.childRunId] : undefined} />
              ))}
            </div>
          </Card>

          <div className="grid-2" style={{ marginTop: 20 }}>
            <Card>
              <div className="section-label" style={{ margin: '14px 16px 0' }}>
                Access-resolved source set (defensibility)
              </div>
              <dl className="kv">
                {sourceSetOf(selected).map((ref, at) => (
                  <SourceRow key={at} refValue={ref} run={selected} />
                ))}
                {sourceSetOf(selected).length === 0 && <dt>—</dt>}
              </dl>
            </Card>
            <Card>
              <div className="section-label" style={{ margin: '14px 16px 0' }}>
                Prompt &amp; rail outcomes (defensibility)
              </div>
              <dl className="kv">
                <dt>Prompt text</dt>
                <dd>“{selected.request}”</dd>
                {selected.steps
                  .flatMap((step) => step.railOutcomes)
                  .map((outcome, at) => (
                    <RailRow key={at} outcome={outcome} />
                  ))}
              </dl>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function outcomeBadge(run: Run) {
  if (run.state === 'failed') return <Badge tone="red">Failed</Badge>;
  if (run.state === 'running') return <Badge tone="grey">Running</Badge>;
  const resolution = run.suggestions[0]?.signal?.resolution;
  if (resolution === 'rejected') return <Badge tone="red">Completed · rejected</Badge>;
  if (resolution === undefined) return <Badge tone="green">Completed</Badge>;
  return <Badge tone="green">Completed · {resolution}</Badge>;
}

function sourceSetOf(run: Run): Step['sourceSet'] {
  return run.steps.find((step) => step.type === 'retrieve')?.sourceSet ?? [];
}

function SourceRow(props: { refValue: Step['sourceSet'][number]; run: Run }) {
  const citations = props.run.suggestions.flatMap((sg) => sg.citations);
  if ('versionId' in props.refValue) {
    const versionId = props.refValue.versionId;
    const cited = citations.find(
      (c) => 'versionId' in c.source && c.source.versionId === versionId,
    );
    const reference =
      cited !== undefined && 'versionId' in cited.source ? cited.source.documentReference : null;
    return (
      <>
        <dt className="mono">{reference ?? `${versionId.slice(0, 8)}…`}</dt>
        <dd>Live library version{reference === null ? ` · ${versionId}` : ''}</dd>
      </>
    );
  }
  return (
    <>
      <dt className="mono">{props.refValue.authorityRef}</dt>
      <dd>Authority corpus</dd>
    </>
  );
}

function RailRow(props: { outcome: Step['railOutcomes'][number] }) {
  return (
    <>
      <dt>{props.outcome.rail}</dt>
      <dd>
        {props.outcome.outcome === 'passed' ? '✓ passed' : '✕ withheld'}
        {props.outcome.detail !== undefined && ` — “${props.outcome.detail}”`}
      </dd>
    </>
  );
}

function StepRows(props: { step: Step; child: Run | undefined }) {
  const { step } = props;
  return (
    <>
      <div className="step-row">
        <span className="tick">{step.status === 'completed' ? '✓' : '✕'}</span>
        <span className="step-type">{step.type.replace('_', '-')}</span>
        <span className="detail">{stepDetail(step)}</span>
        <span className="figures">{stepFigures(step)}</span>
      </div>
      {props.child?.steps.map((childStep) => (
        <div key={childStep.id} className="step-row child">
          <span className="tick">{childStep.status === 'completed' ? '✓' : '✕'}</span>
          <span className="step-type">{childStep.type.replace('_', '-')}</span>
          <span className="detail">
            Child run · targeted retrieval through the same gateway — no direct store access exists
          </span>
          <span className="figures">{durationOf(childStep) ?? '—'}</span>
        </div>
      ))}
    </>
  );
}

function stepDetail(step: Step): string {
  const withheld = step.railOutcomes.filter((o) => o.outcome === 'withheld');
  switch (step.type) {
    case 'retrieve':
      return `Baseline assembly via the Context gateway · access-resolved · ${step.sourceSet.length} source${step.sourceSet.length === 1 ? '' : 's'} admitted`;
    case 'delegate':
      return `Retrieval sub-agent spawned as child run ${step.childRunId?.slice(0, 8) ?? '—'}`;
    case 'draft':
      return 'Grounded generation · the one model step in the chain';
    case 'ground_check':
      return withheld.length === 0
        ? 'Deterministic verifier · every claim resolved to a source'
        : `Deterministic verifier · ${withheld.length} withheld (${withheld.map((o) => `“${o.detail ?? ''}”`).join(', ')})`;
    case 'cite':
      return 'Citations resolved to grounded sources only';
  }
}

function stepFigures(step: Step): string {
  if (step.type === 'draft' && step.model !== undefined) {
    const usage =
      step.usage !== undefined
        ? ` · ${step.usage.tokensPrompt.toLocaleString()} / ${step.usage.tokensCompletion.toLocaleString()} tok`
        : '';
    return `${step.model.id}${usage}`;
  }
  if (step.type === 'ground_check') {
    return `withheld: ${step.railOutcomes.filter((o) => o.outcome === 'withheld').length}`;
  }
  return durationOf(step) ?? '—';
}

function durationOf(step: Step): string | null {
  if (step.endedAt === null) return null;
  const ms = new Date(step.endedAt).getTime() - new Date(step.startedAt).getTime();
  return `${(ms / 1000).toFixed(1)} s`;
}
