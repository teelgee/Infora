// The project shell (T-050) per docs/design/mockups/project-home.html: the
// seven-item rail (Home · Ask · Editor · Documents · Review · Sandbox ·
// Workflows — component 8's fixed set; Knowledge is staged out of the v1
// nav), the topbar crumb, and the home content. Review and Workflows ship as
// empty states (ruled 2026-07-06); Ask/Editor/Documents/Sandbox fill with
// their tickets.
import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { MeResponse, WorkItem } from '@infora/contracts';
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
import { api } from '../api';
import { useMe } from '../session';
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

  const participant = me.participants.find((p) => p.projectId === projectId);
  if (participant === undefined) {
    // deny reads as nonexistence on the surface too (principle 4)
    return <EmptyShell note="This project does not exist." />;
  }

  const base = `/projects/${participant.projectId}`;
  const activePath = location.pathname.slice(base.length).replace(/^\//, '');
  const role = participant.membershipRole === 'owner' ? 'Owner' : 'Member';

  return (
    <>
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
        <ProjectSwitcher name={participant.projectName} onClick={() => void navigate('/')} />
        <RailNav
          items={NAV.map((item) => ({
            label: item.label,
            glyph: item.glyph,
            href: `${base}/${item.path}`,
            active: activePath === item.path,
            onClick: (e) => {
              e.preventDefault();
              void navigate(`${base}/${item.path}`);
            },
          }))}
        />
        <RailSpacer />
        <UserChip
          initials={initialsOf(me.name)}
          name={me.name}
          org={`${me.organisationName} — ${role === 'Owner' ? 'Owner' : 'Consultant'}`}
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
        <CommandBar hint="⌘K">
          Ask anything, or start a workflow — the Ask surface arrives with T-052
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
