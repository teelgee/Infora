/* Sandbox — free-form working area. Folder tree, no document controls. */
function SandboxScreen() {
  const { PaneHeader, Button, Table, Badge, SectionLabel, WithheldNotice } = window.DS;
  return (
    <>
      <PaneHeader location="▧ Project sandbox" title="Shared · Trentmoor + Calderhale"
        action={<Button variant="primary">New draft</Button>} />
      <div style={{ flex: 1, overflow: 'auto', padding: '18px 24px 24px' }}>
        <div style={{ marginBottom: 12 }}><SectionLabel>Working files</SectionLabel></div>
        <Table columns={['Name', 'Kind', 'Updated']} rows={[
          { cells: ['Consultation', 'Folder', '2 hours ago'], icon: '📁' },
          { cells: ['Statement of Community Consultation', 'Draft', '2 hours ago'], icon: '⌇', indent: true },
          { cells: ['Calder Lane response notes', 'Note', 'Yesterday'], icon: '⌇', indent: true },
          { cells: ['Traffic', 'Folder', '3 days ago'], icon: '📁' },
          { cells: ['HGV routing options', 'Draft', '3 days ago'], icon: '⌇', indent: true },
          { cells: ['Noise assessment working', 'Draft', 'Last week'], icon: '⌇' },
        ]} />
        <div style={{ marginTop: 16 }}>
          <WithheldNotice>2 files withheld — Calderhale Energy's private sandbox.</WithheldNotice>
        </div>
      </div>
    </>
  );
}
