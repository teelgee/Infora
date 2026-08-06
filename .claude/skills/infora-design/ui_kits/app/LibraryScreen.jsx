/* Library — the project's controlled deliverables. Dense table, one pane. */
function LibraryScreen() {
  const { PaneHeader, Button, Table, Badge, SectionLabel } = window.DS;
  return (
    <>
      <PaneHeader location="▤ Project library" title="A414 Trentmoor Bypass"
        action={<Button variant="primary">Promote a draft</Button>} />
      <div style={{ flex: 1, overflow: 'auto', padding: '18px 24px 24px' }}>
        <div style={{ marginBottom: 12 }}><SectionLabel>Deliverables</SectionLabel></div>
        <Table columns={['Document', 'Version', 'Status', 'Owner', 'Updated']} rows={[
          { cells: ['Statement of Community Consultation', 'v3', <Badge tone="success">Current</Badge>, 'Trentmoor Council', '2 hours ago'], icon: '▤' },
          { cells: ['Environmental Statement — Ch. 8 Noise', 'v2', <Badge tone="warning">In review</Badge>, 'Calderhale Energy', 'Yesterday'], icon: '▤' },
          { cells: ['Traffic Management Plan', 'v2', <Badge tone="success">Current</Badge>, 'Trentmoor Council', '3 days ago'], icon: '▤' },
          { cells: ['Consultation Report — Appendix C', 'v1', <Badge tone="neutral">Draft</Badge>, 'Trentmoor Council', 'Last week'], icon: '▤' },
          { cells: ['Land Referencing Schedule', 'v4', <Badge tone="danger">Superseded</Badge>, 'Halvern Water', '2 weeks ago'], icon: '▤' },
        ]} />
      </div>
    </>
  );
}
