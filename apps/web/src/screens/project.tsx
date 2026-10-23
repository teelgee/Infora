// The project shell (T-050) per the legacy mockup docs/design/mockups-legacy/project-home.html (removed 2026-08-04; in git history)
// (historical build reference — superseded by design-tokens.json/design-rules.md): the
// rail (Home · Ask · Editor · Documents · Review · Sandbox · Tools · Apps ·
// History — component 8's set plus the T-108 History log; Workflows renamed
// Tools, owner-ruled 2026-07-13/T-109: a tool is the packaged capability you
// launch, a workflow is the codified sequence it runs; **Knowledge joined the
// rail 2026-09-02, T-422/ADR-0054 decision 1**, having been staged out of the
// v1 nav until three stores had a screen), the topbar crumb, and the home
// content. Review and
// Tools ship as empty states (ruled 2026-07-06); Ask/Editor/Documents/
// Sandbox fill with their tickets.
import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router';
import type { LibraryItem, MeResponse, SandboxDocument, WorkItem } from '@infora/contracts';
import { Archive, Bell, BookMarked, BookOpen, ClipboardCheck, ClipboardList, History as HistoryIcon, Home, LayoutGrid, PenLine, Sparkles, Wrench } from 'lucide-react';
import {
  Badge,
  CommandBar,
  ProjectSwitcher,
  AppFrame,
  Rail,
  RailNav,
  RailSpacer,
  SectionLabel,
  Table,
  UserChip,
  WorkspaceZone,
} from '@infora/ui';
import type { RailNavItem } from '@infora/ui';
import { api } from '../api';
import { useAiFeaturesOff } from '../ai-features';
import { useMe } from '../session';
import { NeedsYouPanel, useNotifications } from './notifications';
import { greeting, initialsOf, statusBadge } from './shared';

type Participation = MeResponse['participants'][number];
type ShellContext = { participant: Participation };

const ICON_SIZE = 15;
const ICON_STROKE = 2;

const NAV = [
  { label: 'Home', glyph: <Home size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: '' },
  { label: 'Ask', glyph: <Sparkles size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: 'ask' },
  { label: 'Editor', glyph: <PenLine size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: 'editor' },
  { label: 'Plan', glyph: <ClipboardList size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: 'plan' }, // TIDP/MIDP (T-155)
  { label: 'Project library', glyph: <BookOpen size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: 'documents' },
  { label: 'Review', glyph: <ClipboardCheck size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: 'review' },
  // T-331 (ADR-0049 §6a) — alongside Home and Review, and carrying the unread
  // count. This is the placement that survives WHEREVER the user is, which is
  // the whole argument for it: the person a round-issued event most needs to
  // reach will not visit a home page today.
  { label: 'Notifications', glyph: <Bell size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: 'notifications' },
  { label: 'Sandbox', glyph: <Archive size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: 'sandbox' },
  { label: 'Tools', glyph: <Wrench size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: 'tools' }, // Workflows renamed (T-109)
  // T-450 (ADR-0058 decision 2) — Apps, beside Tools and no longer on its
  // shelf: tools are what you run, apps are standing places that hold rows
  // belonging to the firms that typed them. Navigation and words only — no
  // access rule moved.
  { label: 'Apps', glyph: <LayoutGrid size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: 'apps' },
  // T-422 (ADR-0054 decision 1) — Knowledge stops being "staged out of the v1
  // nav". It is its own rail item and NOT a panel in Settings: Settings is
  // where a person changes their own display name and theme, and a document
  // that binds every firm on a scheme is not a personal preference.
  { label: 'Knowledge', glyph: <BookMarked size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: 'knowledge' },
  { label: 'History', glyph: <HistoryIcon size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: 'history' }, // your prompted turns (T-108)
];

export function ProjectShell() {
  const me = useMe();
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId } = useParams();

  // T-099 — drill-down layers beneath Sandbox and Documents, fetched on
  // first expand; a library child opens its current version in place
  const [expanded, setExpanded] = useState<{ sandbox: boolean; documents: boolean }>({
    sandbox: false,
    documents: false,
  });
  const [sandboxDocs, setSandboxDocs] = useState<SandboxDocument[] | null>(null);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[] | null>(null);
  // §6b — the rail's count is the USER'S OWN, across every project they can
  // reach, and deliberately not this project's: the rail sits beneath a project
  // switcher and would otherwise inherit its scope, making a mention on a
  // second project silently invisible.
  const { data: notifications } = useNotifications();

  useEffect(() => {
    // the layers refresh when the project changes
    setExpanded({ sandbox: false, documents: false });
    setSandboxDocs(null);
    setLibraryItems(null);
  }, [projectId]);

  const participant = me.participants.find((p) => p.projectId === projectId);
  // T-463 — a feature the project switched off is absent from the rail, not greyed
  const aiOff = useAiFeaturesOff(projectId ?? '');
  if (participant === undefined) {
    // deny reads as nonexistence on the surface too (principle 4)
    return <EmptyShell note="This project does not exist." />;
  }

  const base = `/projects/${participant.projectId}`;
  const activePath = location.pathname.slice(base.length).replace(/^\//, '');
  const role = participant.membershipRole === 'owner' ? 'Owner' : 'Member';

  const toggle = (key: 'sandbox' | 'documents') => {
    const opening = !expanded[key];
    setExpanded((state) => ({ ...state, [key]: opening }));
    if (!opening) return;
    if (key === 'sandbox' && sandboxDocs === null) {
      void api.sandboxDocuments(participant.projectId).then((res) => setSandboxDocs(res.items));
    }
    if (key === 'documents' && libraryItems === null) {
      void api.library(participant.projectId).then((res) => setLibraryItems(res.items));
    }
  };

  const drilldown = (label: string): Partial<RailNavItem> => {
    if (label === 'Sandbox') {
      return {
        onToggle: () => toggle('sandbox'),
        expanded: expanded.sandbox,
        children: (sandboxDocs ?? []).map((doc) => ({
          label: doc.title,
          active: location.pathname === `${base}/editor/${doc.id}`,
          onClick: () => void navigate(`${base}/editor/${doc.id}`),
        })),
      };
    }
    if (label === 'Project library') {
      return {
        onToggle: () => toggle('documents'),
        expanded: expanded.documents,
        children: (libraryItems ?? []).map((item) => ({
          label: item.documentReference,
          active: location.pathname === `${base}/documents/${item.containerId}`,
          // T-457 — the drilldown lands on the document page
          onClick: () => void navigate(`${base}/documents/${item.containerId}`),
        })),
      };
    }
    return {};
  };

  const rail = (
    <Rail>
        <WorkspaceZone
          organisation={me.organisationName}
          action={
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                void navigate('/');
              }}
            >
              All projects ▸
            </a>
          }
        />
        <ProjectSwitcher
          name={participant.projectName}
          items={[
            { label: me.organisationName, kicker: 'Workspace', onSelect: () => void navigate('/') },
            ...me.participants.map((p) => ({
              label: p.projectName,
              kicker: `Project · ${p.membershipRole === 'owner' ? 'Owner' : 'Member'}`,
              current: p.projectId === participant.projectId,
              onSelect: () => void navigate(`/projects/${p.projectId}`),
            })),
          ]}
        />
        <RailNav
          items={NAV.filter((item) => !(item.path === 'ask' && aiOff.has('ask'))).map((item) => ({
            label: item.label,
            glyph: item.glyph,
            href: `${base}/${item.path}`,
            active: activePath === item.path,
            ...(item.path === 'notifications' && notifications !== null
              ? { count: notifications.unread }
              : {}),
            onClick: (e: { preventDefault: () => void }) => {
              e.preventDefault();
              void navigate(`${base}/${item.path}`);
            },
            ...drilldown(item.label),
          }))}
        />
        <RailSpacer />
        <UserChip
          initials={initialsOf(me.name)}
          name={me.name}
          org={`${me.organisationName} — ${role === 'Owner' ? 'Owner' : 'Consultant'}`}
          onClick={() => void navigate('/settings')}
        />
    </Rail>
  );

  return (
    <>
      <AppFrame rail={rail}>
      <div className="main">
        <div className="topbar">
          <span className="crumb">
            <b className="project-chip">{participant.projectName}</b> · Owner:{' '}
            {participant.ownerOrganisationName}
          </span>
          <div className="right">
            <Badge tone={role === 'Owner' ? 'info' : 'success'}>{role}</Badge>
          </div>
        </div>
        <Outlet context={{ participant } satisfies ShellContext} />
      </div>
      </AppFrame>
    </>
  );
}

export function ProjectHome() {
  const me = useMe();
  const { participant } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const aiOff = useAiFeaturesOff(participant.projectId);
  const [items, setItems] = useState<WorkItem[] | null>(null);

  useEffect(() => {
    void api.workItems(participant.projectId).then((res) => setItems(res.items));
  }, [participant.projectId]);

  return (
    <div className="content">
      <h1 className="page">
        {greeting()}, {me.name.split(' ')[0]}
      </h1>
      <p className="page-sub">
        {items === null
          ? 'Loading the project…'
          : `${items.length} work item${items.length === 1 ? '' : 's'} on the project`}
      </p>

      {!aiOff.has('ask') && (
        <div style={{ marginTop: 22 }}>
          <CommandBar
            hint="⌘K"
            onClick={() => void navigate(`/projects/${participant.projectId}/ask`)}
          >
            Ask about the project — grounded on its library, every claim cited or withheld
          </CommandBar>
        </div>
      )}

      {/* T-463 — the page an owner asks for on day one, one click from home */}
      <p style={{ margin: '10px 0 0', fontSize: 12.5 }}>
        <button className="linklike" onClick={() => void navigate(`/projects/${participant.projectId}/ai`)}>
          How the AI works here
        </button>
        <span style={{ color: 'var(--text-muted)' }}> — what each feature reads, writes and keeps, and the project’s switches.</span>
      </p>

      {/* §6a — directly above the work items, so a notification sits beside the
          thing it is about. Absent at zero, never an empty state. */}
      <NeedsYouPanel projectId={participant.projectId} />

      <SectionLabel>Your work items</SectionLabel>
      <Table>
        <table>
          <thead>
            <tr>
              <th>Deliverable</th>
              <th>Workflow</th>
              <th>Status</th>
              <th>Assignee</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((item) => {
              const status = statusBadge(item.status);
              return (
                <tr
                  key={item.id}
                  onClick={() =>
                    void navigate(`/projects/${participant.projectId}/work-items/${item.id}`)
                  }
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <div className="title">{item.title}</div>
                  </td>
                  <td>{item.type.replaceAll('_', ' ')}</td>
                  <td>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </td>
                  <td>{item.assigneeParticipantId === participant.participantId ? 'You' : '—'}</td>
                </tr>
              );
            })}
            {items !== null && items.length === 0 && (
              <tr>
                <td colSpan={4} style={{ color: 'var(--text-muted)' }}>
                  No work items yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Table>
    </div>
  );
}

export function EmptyState(props: { title: string; note: string }) {
  return (
    <div className="content">
      <h1 className="page">{props.title}</h1>
      <p className="page-sub">{props.note}</p>
    </div>
  );
}

function EmptyShell(props: { note: string }) {
  return (
    <div className="main">
      <div className="content">
        <h1 className="page">Not found</h1>
        <p className="page-sub">{props.note}</p>
      </div>
    </div>
  );
}
