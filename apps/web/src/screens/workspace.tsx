// The workspace landing (T-050) per docs/design/mockups-legacy/workspace-landing.html
// (historical build reference — superseded by design-tokens.json/design-rules.md):
// the organisation's entry point — every project it owns or has joined, with
// per-project role badges. Every rail item routes (T-093, 2026-07-09 QA
// review): the workspace surfaces themselves arrive with their slices, so
// their pages state honestly what is coming and why it isn't here yet.
import { useNavigate, useParams } from 'react-router';
import { Archive, BookOpen, Home, PenLine, Sparkles, Wrench } from 'lucide-react';
import {
  Badge,
  Card,
  CommandBar,
  ProjectCard,
  ProjectSwitcher,
  Rail,
  RailNav,
  RailSpacer,
  SectionLabel,
  UserChip,
} from '@infora/ui';
import { useMe } from '../session';
import { greeting, initialsOf } from './shared';

const ICON_SIZE = 15;
const ICON_STROKE = 2;

// The workspace sections and the slice each is waiting on (grill tracker,
// Phase 7 QA themes, 2026-07-09).
const SECTIONS = {
  ask: {
    label: 'Ask',
    glyph: <Sparkles size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
    note: "Workspace Ask answers over your organisation's own knowledge — house style, templates, know-how — with no client project in scope. It arrives with the workspace slice, once the organisation-knowledge store lands.",
  },
  editor: {
    label: 'Editor',
    glyph: <PenLine size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
    note: 'The workspace Editor drafts on organisation knowledge only — nothing project-specific is reachable from here, by construction. It arrives with the workspace slice.',
  },
  sandbox: {
    label: 'Personal sandbox',
    glyph: <Archive size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
    note: 'Your private drive — folders and documents only you can see, never visible to the AI as context. It arrives with the sandbox drawer.',
  },
  tools: {
    label: 'Tools',
    glyph: <Wrench size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
    note: "Your organisation's toolkit — Infora's standard tools and the ones your firm builds; each tool runs a codified workflow. Building your own happens here too (proposed as its own slice, 2026-07-09); the builder's shape and the tool-scoping ruling (2026-07-13) are on the grill tracker.",
  },
  knowledge: {
    label: 'Your knowledge',
    glyph: <BookOpen size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
    note: "Organisation knowledge — where your firm's house style, templates and other guidance live and steer every draft. It arrives with the organisation-context store.",
  },
} as const;
type SectionKey = keyof typeof SECTIONS;

function WorkspaceRail(props: { active: 'home' | SectionKey }) {
  const me = useMe();
  const navigate = useNavigate();
  const go = (path: string) => (e: { preventDefault: () => void }) => {
    e.preventDefault();
    void navigate(path);
  };
  return (
    <Rail>
      <ProjectSwitcher
        kicker="Workspace"
        name={me.organisationName}
        items={[
          { label: me.organisationName, kicker: 'Workspace', current: true, onSelect: () => {} },
          ...me.participants.map((p) => ({
            label: p.projectName,
            kicker: `Project · ${p.membershipRole === 'owner' ? 'Owner' : 'Member'}`,
            onSelect: () => void navigate(`/projects/${p.projectId}`),
          })),
        ]}
      />
      <RailNav
        items={[
          {
            label: 'Home',
            glyph: <Home size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
            href: '/',
            active: props.active === 'home',
            onClick: go('/'),
          },
          ...Object.entries(SECTIONS).map(([key, section]) => ({
            label: section.label,
            glyph: section.glyph,
            href: `/workspace/${key}`,
            active: props.active === key,
            onClick: go(`/workspace/${key}`),
          })),
        ]}
      />
      <RailSpacer />
      <UserChip
        initials={initialsOf(me.name)}
        name={me.name}
        org={me.organisationName}
        onClick={() => void navigate('/settings')}
      />
    </Rail>
  );
}

/** A workspace section that hasn't landed yet — an honest, routed page. */
export function WorkspaceSection() {
  const me = useMe();
  const { section } = useParams();
  const entry = SECTIONS[(section ?? '') as SectionKey];
  if (entry === undefined) return null;

  return (
    <>
      <WorkspaceRail active={section as SectionKey} />
      <div className="main">
        <div className="topbar">
          <span className="crumb">
            <b>{me.organisationName}</b> — workspace · {entry.label}
          </span>
          <div className="right">
            <Badge tone="neutral">Org-private — no project context reachable here</Badge>
          </div>
        </div>
        <div className="content" style={{ maxWidth: 720 }}>
          <h1 className="page">{entry.label}</h1>
          <p className="page-sub">{entry.note}</p>
        </div>
      </div>
    </>
  );
}

export function WorkspaceLanding() {
  const me = useMe();
  const navigate = useNavigate();

  return (
    <>
      <WorkspaceRail active="home" />

      <div className="main">
        <div className="topbar">
          <span className="crumb">
            <b>{me.organisationName}</b> — workspace · the organisation&apos;s own environment
          </span>
          <div className="right">
            <Badge tone="neutral">Org-private — no project context reachable here</Badge>
          </div>
        </div>

        <div className="content">
          <h1 className="page">
            {greeting()}, {me.name.split(' ')[0]}
          </h1>
          <p className="page-sub">
            Your firm&apos;s workspace — its own knowledge, sandboxes and tools. No client
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
              <ProjectCard
                key={participant.projectId}
                href={`/projects/${participant.projectId}`}
                onClick={(e) => {
                  e.preventDefault();
                  void navigate(`/projects/${participant.projectId}`);
                }}
                title={participant.projectName}
                subtitle={`Owner: ${participant.ownerOrganisationName}`}
                action={
                  <Badge tone={participant.membershipRole === 'owner' ? 'info' : 'success'}>
                    {participant.membershipRole === 'owner' ? 'Owner' : 'Member'}
                  </Badge>
                }
              />
            ))}
          </div>
          {me.participants.length === 0 && (
            <Card>
              <div style={{ padding: 18, color: 'var(--text-muted)', fontSize: 13 }}>
                No project access yet — a project owner adds you as a Participant.
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
