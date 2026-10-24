// T-331 — the in-app notification surface (ADR-0049 §6a/§6b).
//
// **Two surfaces, and neither works alone**, which is why the ticket says build
// both. The rail REACHES you — it survives wherever you are, and the person a
// round-issued event most needs to reach has been in the editor all afternoon —
// but it does not tell you what to do. The "Needs you" panel TELLS you what to
// do, because it sits directly above the work items so a notification is beside
// the thing it is about — but only if you go and look.
//
// **The scopes differ deliberately (§6b).** The rail count is the user's own
// across every project they can reach, grouped by project; the panel is scoped
// to its project. Get this wrong and a mention on a second project is silently
// invisible, because the rail sits beneath a project switcher and would
// otherwise inherit its scope.
//
// **The panel is ABSENT at zero, never an empty state**, and that asymmetry is
// the design rather than an omission: a permanent "nothing needs you" card is a
// thing to learn to ignore, and once ignored it stops working on the day it has
// something to say.
//
// A floating panel over the canvas was rejected (§6c) — it covers the drafting
// canvas and reads as transient, against the durability the record exists for.
// That shape is for confirming an action just taken, which is a different
// mechanism and must not share this surface.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import type { ListNotificationsResponse, Notification } from '@infora/contracts';
import { Badge, Button, SectionLabel, Table } from '@infora/ui';
import { api } from '../api';
import { formatDateTime } from './shared';

/** What the event is, in the words a person would use. The event type is the
 * vocabulary; this is the sentence — and it never restates the subject, which
 * is rendered beside it and is the only place the subject's name belongs. */
export const EVENT_LABEL: Record<Notification['eventType'], string> = {
  'round-issued': 'Round issued',
  mention: 'You were mentioned',
  'record-state-changed-by-another-organisation': 'Record state changed',
  'cited-document-superseded': 'A document you cited was superseded',
};

/** Where following a notification lands. The API resolved WHICH object to open
 * (in domain terms, through the same access path that decided the row was
 * visible); this maps that to a route, which is the surface's own business. */
export function pathFor(notification: Notification): string {
  const base = `/projects/${notification.projectId}`;
  return notification.subject.opens.kind === 'container'
    ? `${base}/review/${notification.subject.opens.id}`
    : `${base}/editor/${notification.subject.opens.id}`;
}

/** Both surfaces read the same endpoint shape, so they cannot disagree about
 * what is visible; only the scope differs. */
export function useNotifications(projectId?: string) {
  const [data, setData] = useState<ListNotificationsResponse | null>(null);
  const load = useCallback(() => {
    const call = projectId === undefined ? api.notifications() : api.projectNotifications(projectId);
    void call.then(setData, () => setData({ items: [], unread: 0, unreadByProject: [] }));
  }, [projectId]);
  useEffect(load, [load]);
  return { data, reload: load };
}

function NotificationRow(props: { notification: Notification; onOpen: (n: Notification) => void }) {
  const { notification } = props;
  return (
    <tr
      onClick={() => props.onOpen(notification)}
      style={{ cursor: 'pointer', opacity: notification.readAt === null ? 1 : 0.62 }}
    >
      <td>
        <div className="title">{EVENT_LABEL[notification.eventType]}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{notification.subject.label}</div>
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(notification.createdAt)}</td>
      <td>
        {notification.readAt === null ? <Badge tone="info">Unread</Badge> : <span>—</span>}
      </td>
    </tr>
  );
}

/**
 * The "Needs you" panel — project home, directly above the work items.
 *
 * Unread only. A read notification is still a durable record and is still on
 * the Notifications screen; leaving it here would make the panel a list of
 * everything that ever happened, which is the failure mode the rail's count
 * already guards against.
 */
export function NeedsYouPanel(props: { projectId: string }) {
  const { data, reload } = useNotifications(props.projectId);
  const navigate = useNavigate();
  const unread = (data?.items ?? []).filter((n) => n.readAt === null);
  // absent at zero (§6a) — not an empty state, and not a spinner either: a
  // panel that flickers into existence on every page load is a panel that
  // moves the work items down for a moment on every page load
  if (unread.length === 0) return null;

  const open = async (notification: Notification) => {
    await api.markNotificationRead(notification.id).catch(() => undefined);
    void navigate(pathFor(notification));
  };

  return (
    <>
      <SectionLabel>Needs you</SectionLabel>
      <Table>
        <table>
          <tbody>
            {unread.map((n) => (
              <NotificationRow key={n.id} notification={n} onOpen={(x) => void open(x)} />
            ))}
            <tr>
              <td colSpan={3} style={{ textAlign: 'right' }}>
                <Button
                  variant="quiet"
                  onClick={() => {
                    void api.markAllNotificationsRead(props.projectId).then(reload);
                  }}
                >
                  Mark all read
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </Table>
    </>
  );
}

/**
 * The Notifications screen behind the rail item — **the user's own, across
 * every project they can reach, grouped by project** (§6b).
 *
 * It is reached from inside a project, so grouping is what stops the rail
 * inheriting the project switcher's scope in the reader's head as well as in
 * the query: a section headed with another project's name is the whole point.
 */
export function NotificationsScreen() {
  const { data, reload } = useNotifications();
  const navigate = useNavigate();

  const open = async (notification: Notification) => {
    await api.markNotificationRead(notification.id).catch(() => undefined);
    void navigate(pathFor(notification));
  };

  const items = data?.items ?? [];
  const projects = [...new Map(items.map((n) => [n.projectId, n.projectName])).entries()];

  return (
    <div className="content">
      <h1 className="page">Notifications</h1>
      <p className="page-sub">
        {data === null
          ? 'Loading…'
          : items.length === 0
            ? 'Nothing yet. Notifications appear here when a round is issued to you, or when someone mentions you.'
            : `${data.unread} unread across ${projects.length} project${projects.length === 1 ? '' : 's'}`}
      </p>
      {data !== null && data.unread > 0 && (
        <div style={{ marginTop: 12 }}>
          <Button
            variant="quiet"
            onClick={() => {
              void api.markAllNotificationsRead().then(reload);
            }}
          >
            Mark all read
          </Button>
        </div>
      )}
      {projects.map(([projectId, projectName]) => (
        <div key={projectId}>
          <SectionLabel>{projectName}</SectionLabel>
          <Table>
            <table>
              <tbody>
                {items
                  .filter((n) => n.projectId === projectId)
                  .map((n) => (
                    <NotificationRow key={n.id} notification={n} onOpen={(x) => void open(x)} />
                  ))}
              </tbody>
            </table>
          </Table>
        </div>
      ))}
    </div>
  );
}
