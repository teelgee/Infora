// T-467 — THE WORK QUEUE: what is waiting on you, one click from where it is done.
//
// *In plain terms: the home opens with a list of the things waiting on you on
// this project — a reviewer to confirm, an appointment to accept, a transmittal
// to acknowledge, a request to decide, comments to answer, findings to close.
// Each is a link to the screen where that act is done. Under it: the documents
// that moved most recently, and the views you saved. The workspace home shows
// the same across every project you are on.*
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import type { GetWorkQueueResponse, RecentDocument, WorkQueueItem } from '@infora/contracts';
import { Badge, SectionLabel } from '@infora/ui';
import { api } from './api';
import { formatDate } from './screens/shared';

/** the register a saved view belongs to, as a path with the view's own query */
export function savedViewHref(projectId: string, view: GetWorkQueueResponse['views'][number]): string {
  const register = view.register === 'library' ? 'documents' : view.register === 'review' ? 'review' : view.register === 'sandbox' ? 'sandbox' : 'plan';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(view.filter)) {
    if (v === null || v === undefined || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length > 0) params.set(k, v.map(String).join(','));
    } else if (k === 'producerId') params.set('producer', String(v));
    else if (k !== 'view') params.set(k, String(v));
  }
  params.set('view', view.name);
  return `/projects/${projectId}/${register}?${params.toString()}`;
}

export function useWorkQueue(projectId: string): GetWorkQueueResponse | null {
  const [data, setData] = useState<GetWorkQueueResponse | null>(null);
  useEffect(() => {
    let live = true;
    void api.workQueue(projectId).then((q) => live && setData(q), () => live && setData({ items: [], recent: [], views: [] }));
    return () => {
      live = false;
    };
  }, [projectId]);
  return data;
}

export function WorkQueuePanel(props: { projectId: string; queue: GetWorkQueueResponse | null; projectName?: string }) {
  const navigate = useNavigate();
  const q = props.queue;
  const go = (href: string) => void navigate(href.startsWith('/') ? href : `/projects/${props.projectId}/${href}`);
  return (
    <>
      <SectionLabel>Waiting on you{props.projectName ? ` — ${props.projectName}` : ''}</SectionLabel>
      {q === null ? (
        <p className="field-hint">Looking…</p>
      ) : q.items.length === 0 ? (
        <p className="field-hint">Nothing is waiting on you here.</p>
      ) : (
        <ul className="shelf-rows" aria-label={`Waiting on you${props.projectName ? ` — ${props.projectName}` : ''}`}>
          {q.items.map((item, i) => (
            <li key={`${item.kind}-${i}`}>
              <QueueRow item={item} onOpen={() => go(item.href)} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function QueueRow(props: { item: WorkQueueItem; onOpen: () => void }) {
  return (
    <button type="button" className="linklike shelf-row-title" style={{ fontWeight: 500, textAlign: 'left' }} onClick={props.onOpen}>
      {props.item.label}
      {props.item.at && <span className="shelf-row-note" style={{ marginLeft: 8, fontWeight: 400 }}>{formatDate(props.item.at)}</span>}
    </button>
  );
}

export function RecentDocumentsPanel(props: { projectId: string; recent: RecentDocument[] | null }) {
  const navigate = useNavigate();
  if (props.recent !== null && props.recent.length === 0) return null;
  return (
    <>
      <SectionLabel>Recent documents</SectionLabel>
      {props.recent === null ? (
        <p className="field-hint">Looking…</p>
      ) : (
        <ul className="shelf-rows" aria-label="Recent documents">
          {props.recent.map((d) => (
            <li key={d.href}>
              <button type="button" className="linklike shelf-row-title" style={{ textAlign: 'left' }} onClick={() => void navigate(`/projects/${props.projectId}/${d.href}`)}>
                {d.reference && <span className="mono" style={{ marginRight: 8 }}>{d.reference}</span>}
                {d.label}
              </button>
              <span className="shelf-row-note">
                <Badge tone="neutral">{d.kind === 'library' ? 'Library' : 'Working draft'}</Badge> {formatDate(d.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function SavedViewsPanel(props: { projectId: string; views: GetWorkQueueResponse['views'] | null }) {
  const navigate = useNavigate();
  if (props.views === null || props.views.length === 0) return null;
  return (
    <>
      <SectionLabel>Your saved views</SectionLabel>
      <ul className="shelf-rows" aria-label="Your saved views">
        {props.views.map((v) => (
          <li key={v.id}>
            <button type="button" className="linklike shelf-row-title" style={{ textAlign: 'left' }} onClick={() => void navigate(savedViewHref(props.projectId, v))}>
              {v.name}
            </button>
            <span className="shelf-row-note">
              {v.register === 'library' ? 'Project library' : v.register === 'review' ? 'Review' : v.register === 'plan' ? 'Plan' : 'Sandbox'}
              {v.shared ? (v.mine ? ' · shared with your firm' : ' · shared by a colleague') : ''}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
