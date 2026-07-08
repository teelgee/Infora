// The workspace landing (T-050) per docs/design/mockups/workspace-landing.html:
// the organisation's entry point — every project it owns or has joined, with
// per-project role badges. Workspace Ask/Editor/sandbox are post-skeleton;
// their rail slots are present but inert (the mockup's staging).
import { Link, useNavigate } from 'react-router-dom';
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
} from '@infora/ui';
import { useMe } from '../session';
import { greeting, initialsOf } from './shared';

export function WorkspaceLanding() {
  const me = useMe();
  const navigate = useNavigate();

  return (
    <>
      <Rail>
        <ProjectSwitcher kicker="Workspace" name={me.organisationName} />
        <RailNav
          items={[
            { label: 'Home', glyph: '⌂', href: '/', active: true },
            { label: 'Ask', glyph: '✦', href: '#' },
            { label: 'Editor', glyph: '✎', href: '#' },
            { label: 'Personal sandbox', glyph: '▧', href: '#' },
            { label: 'Workflows', glyph: '▸', href: '#' },
          ]}
        />
        <RailSpacer />
        <UserChip initials={initialsOf(me.name)} name={me.name} org={me.organisationName} />
      </Rail>

      <div className="main">
        <div className="topbar">
          <span className="crumb">
            <b>{me.organisationName}</b> — workspace · the organisation&apos;s own environment
          </span>
          <div className="right">
            <Badge tone="grey">Org-private — no project context reachable here</Badge>
          </div>
        </div>

        <div className="content">
          <h1 className="page">
            {greeting()}, {me.name.split(' ')[0]}
          </h1>
          <p className="page-sub">
            Your firm&apos;s workspace — its own knowledge, sandboxes and workflows. No client
            project is in scope here.
          </p>

          <div style={{ marginTop: 22 }}>
            <CommandBar hint="⌘K">
              Ask across your firm&apos;s own knowledge — arrives with the workspace slice
            </CommandBar>
          </div>

          <SectionLabel>Your projects</SectionLabel>
          <div className="project-grid">
            {me.participants.map((participant) => (
              <Link
                key={participant.projectId}
                className="card project-card"
                to={`/projects/${participant.projectId}`}
                onClick={(e) => {
                  e.preventDefault();
                  void navigate(`/projects/${participant.projectId}`);
                }}
              >
                <div className="p-name">{participant.projectName}</div>
                <div className="p-meta">Owner: {participant.ownerOrganisationName}</div>
                <div className="p-badges">
                  <Badge tone={participant.membershipRole === 'owner' ? 'slate' : 'green'}>
                    {participant.membershipRole === 'owner' ? 'Owner' : 'Member'}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
          {me.participants.length === 0 && (
            <Card>
              <div style={{ padding: 18, color: 'var(--muted)', fontSize: 13 }}>
                No project access yet — a project owner adds you as a Participant.
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
