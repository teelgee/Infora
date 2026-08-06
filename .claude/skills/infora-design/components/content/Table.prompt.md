```jsx
<Table columns={['Document', 'Version', 'Status', 'Updated']} rows={[
  { cells: ['Statement of Community Consultation', 'v3', <Badge tone="success">Current</Badge>, '2 hours ago'], icon: '▤' },
  { cells: ['Appendix C — Noise', 'v1', <Badge tone="warning">In review</Badge>, 'Yesterday'], icon: '▤', indent: true },
]} />
```

Uppercase micro headers, hairline row rules, row hover only. Empty state: one centred line plus the primary action, no table chrome.
