/* Workspace landing — the greeting, the ask bar, the project list. */
function WorkspaceScreen({ go }) {
  const { CommandBar, Chip, IconButton, SectionLabel, ProjectCard, Badge } = window.DS;
  return (
    <div style={{ padding: '22px 30px 30px' }}>
      <span className="location-chip" style={{ marginBottom: 16, display: 'inline-flex' }}>Trentmoor Council — workspace</span>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-700)', fontWeight: 500, margin: 0 }}>Good afternoon, Rachel</h1>
      <p style={{ color: 'var(--text-secondary)', marginTop: 6, fontSize: 'var(--text-300)' }}>
        Three active projects, one awaiting your response.
      </p>

      <div style={{ marginTop: 16 }}>
        <CommandBar hint={<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Chip>📎 Files</Chip>
          <Chip>▤ Library</Chip>
          <IconButton variant="primary" aria-label="Send">→</IconButton>
        </span>}>
          Ask across your firm's own knowledge
        </CommandBar>
      </div>

      <div style={{ margin: '28px 0 12px' }}><SectionLabel>Your projects</SectionLabel></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <ProjectCard title="A414 Trentmoor Bypass" subtitle="Owner · 7 of 11 deliverables drafted"
          count={7} action={<Badge tone="neutral" pill>Owner</Badge>} onClick={() => go('editor')} />
        <ProjectCard title="Calderhale Grid Reinforcement" subtitle="Member · Calderhale Energy owns · 3 of 10 drafted"
          count={3} countQuiet action={<Badge tone="neutral" pill>Member</Badge>} onClick={() => go('editor')} />
        <ProjectCard title="Halvern Water Treatment Upgrade" subtitle="Member · Halvern Water owns · 9 of 10 drafted"
          count={9} action={<Badge tone="neutral" pill>Member</Badge>} onClick={() => go('editor')} />
      </div>
    </div>
  );
}
