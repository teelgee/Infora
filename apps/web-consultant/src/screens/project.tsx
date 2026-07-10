// The project shell (T-050) per docs/design/mockups/project-home.html: the
// seven-item rail (Home · Ask · Editor · Documents · Review · Sandbox ·
// Workflows — component 8's fixed set; Knowledge is staged out of the v1
// nav), the topbar crumb, and the home content. Review and Workflows ship as
// empty states (ruled 2026-07-06); Ask/Editor/Documents/Sandbox fill with
// their tickets.
import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { LibraryItem, MeResponse, SandboxDocument, WorkItem } from '@infora/contracts';
import {
  Badge,
  Card,
  CommandBar,
  ProjectSwitcher,
  Rail,
  RailNav,
  RailSpacer,
  SectionLabel,
  UserChip,
  WorkspaceZone,
} from '@infora/ui';
import type { RailNavItem } from '@infora/ui';
import { api } from '../api';
import { useMe } from '../session';
import { SourceModal } from '../source-modal';
import { greeting, initialsOf, statusBadge } from './shared';

type Participation = MeResponse['participants'][number];
type ShellContext = { participant: Participation };

const NAV = [
  { label: 'Home', glyph: '⌂', path: '' },
  { label: 'Ask', glyph: '✦', path: 'ask' },
  { label: 'Editor', glyph: '✎', path: 'editor' },
  { label: 'Documents', glyph: '▤', path: 'documents' },
  { label: 'Review', glyph: '✓', path: 'review' },
  { label: 'Sandbox', glyph: '▧', path: 'sandbox' },
  { label: 'Workflows', glyph: '▸', path: 'workflows' },
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
  const [sourceOpen, setSourceOpen] = useState<string | null>(null);

  useEffect(() => {
    // the layers refresh when the project changes
    setExpanded({ sandbox: false, documents: false });
    setSandboxDocs(null);
    setLibraryItems(null);
  }, [projectId]);

  const participant = me.participants.find((p) => p.projectId === projectId);
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
    if (label === 'Documents') {
      return {
        onToggle: () => toggle('documents'),
        expanded: expanded.documents,
        children: (libraryItems ?? []).map((item) => ({
          label: item.documentReference,
          onClick: () => setSourceOpen(item.currentVersionId),
        })),
      };
    }
    return {};
  };

  return (
    <>
      {sourceOpen !== null && (
        <SourceModal versionId={sourceOpen} onClose={() => setSourceOpen(null)} />
      )}
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
          items={NAV.map((item) => ({
            label: item.label,
            glyph: item.glyph,
            href: `${base}/${item.path}`,
            active: activePath === item.path,
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

      <div className="main">
        <div className="topbar">
          <span className="crumb">
            <b>{participant.projectName}</b> · Owner: {participant.ownerOrganisationName}
          </span>
          <div className="right">
            <Badge tone={role === 'Owner' ? 'slate' : 'green'}>{role}</Badge>
          </div>
        </div>
        <Outlet context={{ participant } satisfies ShellContext} />
      </div>
    </>
  );
}

export function ProjectHome() {
  const me = useMe();
  const { participant } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
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

      <div style={{ marginTop: 22 }}>
        <CommandBar
          hint="⌘K"
          onClick={() => void navigate(`/projects/${participant.projectId}/ask`)}
        >
          Ask about the project — grounded on its library, every claim cited or withheld
        </CommandBar>
      </div>

      <SectionLabel>Your work items</SectionLabel>
      <Card>
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
                <td colSpan={4} style={{ color: 'var(--muted)' }}>
                  No work items yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
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
