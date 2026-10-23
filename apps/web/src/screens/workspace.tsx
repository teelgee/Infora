// The workspace landing (T-050) per the legacy mockup docs/design/mockups-legacy/workspace-landing.html (removed 2026-08-04; in git history)
// (historical build reference — superseded by design-tokens.json/design-rules.md):
// the organisation's entry point — every project it owns or has joined, with
// per-project role badges. Every rail item routes (T-093, 2026-07-09 QA
// review): the workspace surfaces themselves arrive with their slices, so
// their pages state honestly what is coming and why it isn't here yet.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Archive, BookOpen, Home, LayoutTemplate, PenLine, Sparkles, Wrench, ShieldCheck } from 'lucide-react';
import {
  AppFrame,
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
import type { AiTransparencyResponse } from '@infora/contracts';
import { api } from '../api';
import { TransparencyTable } from './ai-transparency';
import { useMe } from '../session';
import { FirmShelfPane } from './knowledge';
import type { FirmShelf } from './knowledge';
import { PlaybookShelfPane } from './playbooks';
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
  // T-422 (ADR-0054 decision 1) — the placeholder stops being a note. This is
  // the SAME SHELF the project's Knowledge screen shows, reached through the
  // second of its two doors, and **no project material is shown here at all**.
  knowledge: {
    label: 'Your knowledge',
    glyph: <BookOpen size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
    note: "Your firm's own material — the manuals and playbooks that steer every draft, and the starting outlines your colleagues kept. It is the same shelf you see inside a project, and no client project is in scope here.",
  },
  // T-445 (ADR-0056 §10) — the apps your firm kept as templates, beside the
  // rest of its own material. Same kind of thing: org-private, the same on
  // every project, belonging to none of them.
  // T-463 — the deployment's AI facts, readable with no project in scope
  ai: {
    label: 'How the AI works',
    glyph: <ShieldCheck size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
    note: 'Every AI feature this deployment carries — what it reads, what it may write, where it runs, what it keeps, and that none of it ever trains a model. Per-project switches are set inside each project.',
  },
  playbooks: {
    label: 'Kept apps',
    glyph: <LayoutTemplate size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
    note: "Apps your firm built and kept as templates, ready to deploy into the next project. A template carries the shape of the work and not one row of anybody's data — deploying one makes a fresh app with empty tables.",
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
  const [firm, setFirm] = useState<FirmShelf>({ rulebooks: null, outlines: null });
  const knowledge = section === 'knowledge';
  const playbooks = section === 'playbooks';
  const ai = section === 'ai';
  const [aiTable, setAiTable] = useState<AiTransparencyResponse | null>(null);
  useEffect(() => {
    if (ai) void api.workspaceAiTransparency().then(setAiTable, () => setAiTable(null));
  }, [ai]);

  useEffect(() => {
    if (!knowledge) return;
    // T-422 — the firm's shelf, through the workspace door. The rulebooks
    // read has no project in it by construction (ADR-0020), which is what
    // makes ONE shelf reachable from two doors rather than two shelves. The
    // saved outlines are deliberately NOT fetched here: their route is the
    // document creator's, so listing them runs a project entitlement check
    // that has no answer outside a project, and the shelf says so in words.
    void api
      .rulebooks()
      .then((res) => setFirm({ rulebooks: res.items, outlines: null }))
      .catch(() => setFirm({ rulebooks: null, outlines: null }));
  }, [knowledge]);
  // T-456 — the same two doors the project door offers: one shelf, curated once
  const reloadRulebooks = () =>
    api
      .rulebooks()
      .then((res) => setFirm({ rulebooks: res.items, outlines: null }))
      .catch(() => setFirm({ rulebooks: null, outlines: null }));
  const curation =
    me.orgRole === 'admin'
      ? {
          onLoad: (file: File, title: string) => api.loadRulebook(file, title).then(reloadRulebooks),
          onRetire: (id: string) => api.retireRulebook(id).then(reloadRulebooks),
        }
      : undefined;

  if (entry === undefined) return null;

  return (
    <AppFrame rail={<WorkspaceRail active={section as SectionKey} />}>
      <div className="main">
        <div className="topbar">
          <span className="crumb">
            <b>{me.organisationName}</b> — workspace · {entry.label}
          </span>
          <div className="right">
            <Badge tone="neutral">Org-private — no project context reachable here</Badge>
          </div>
        </div>
        <div className="content" style={knowledge || playbooks || ai ? undefined : { maxWidth: 720 }}>
          <h1 className="page">{entry.label}</h1>
          <p className="page-sub">{entry.note}</p>
          {knowledge && <FirmShelfPane shelf={firm} door="workspace" {...(curation && { curation })} />}
          {playbooks && <PlaybookShelfPane />}
          {ai && aiTable && <TransparencyTable table={aiTable} />}
        </div>
      </div>
    </AppFrame>
  );
}

export function WorkspaceLanding() {
  const me = useMe();
  const navigate = useNavigate();

  return (
    <AppFrame rail={<WorkspaceRail active="home" />}>
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
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                No project access yet — a project owner adds you as a Participant.
              </div>
            </Card>
          )}
        </div>
      </div>
    </AppFrame>
  );
}
