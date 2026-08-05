/* Editor — document canvas plus the run/chat panel. Two floating panes. */
function EditorCanvas({ accepted, onAccept, onReject }) {
  const { PaneHeader, Button, Prose, SuggestionCard } = window.DS;
  return (
    <>
      <PaneHeader location="▧ Project sandbox" title="Statement of Community Consultation"
        action={<Button variant="primary">⇧ Promote</Button>} />
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 36px 32px' }}>
        <Prose>
          <h2>4. Consultation Approach</h2>
          <p>The scheme's consultation strategy follows the staged approach set out in the Section 47 statement,
            beginning with a non-statutory phase to establish the affected community and landowner list.</p>
          <p>Feedback from the first drop-in session <mark>indicated concern over construction traffic routing
            through Calder Lane</mark>, addressed in the revised access strategy below.</p>

          {accepted === null && (
            <div style={{ margin: '14px 0' }}>
              <SuggestionCard title="Suggestion ready · pending your decision"
                actions={<>
                  <Button variant="primary" size="sm" onClick={onAccept}>✓ Accept</Button>
                  <Button size="sm">✎ Edit</Button>
                  <Button size="sm" onClick={onReject}>Reject</Button>
                </>}>
                A revised construction traffic management plan will route HGV movements via the A414 slip road
                rather than Calder Lane during the peak consultation-response period.
              </SuggestionCard>
            </div>
          )}
          {accepted === true && (
            <p>A revised construction traffic management plan <span className="ins">will route HGV movements via the
              A414 slip road rather than Calder Lane</span> during the peak consultation-response period.</p>
          )}

          <p style={{ margin: 0 }}>A night-working restriction on the Calder Lane frontage{' '}
            <span className="del">may need to be considered</span>{' '}
            <span className="ins">remains available</span> as a fallback, subject to the noise assessment in Appendix C.</p>
        </Prose>
      </div>
    </>
  );
}

function EditorPanel({ sent, onSend, draft, setDraft }) {
  const { SectionLabel, CollapseToggle, RunTrace, ChatBubble, ChatComposer } = window.DS;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
        <SectionLabel>This run</SectionLabel>
        <span style={{ marginLeft: 'auto' }}><CollapseToggle direction="right" label="Collapse panel" /></span>
      </div>
      <div style={{ marginBottom: 18 }}>
        <RunTrace steps={[
          { label: 'Retrieved sources' },
          { label: 'Ground-checked claims' },
          { label: 'Suggestion drafted', pending: true },
        ]} />
      </div>
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12,
        borderTop: '1px solid var(--border-default)', paddingTop: 14 }}>
        <ChatBubble>Draft a mitigation for the Calder Lane traffic feedback</ChatBubble>
        <ChatBubble from="agent">Done — 1 suggestion on the document, grounded on the Traffic Management Plan v2.</ChatBubble>
        {sent.map((m, i) => <ChatBubble key={i}>{m}</ChatBubble>)}
      </div>
      <div style={{ marginTop: 14 }}>
        <ChatComposer value={draft} onChange={setDraft} onSend={onSend}
          placeholder="Ask for a draft into this document" />
      </div>
    </>
  );
}
