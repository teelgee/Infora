Sits between resizable siblings.

```jsx
<div style={{ display: 'flex', gap: 0 }}>
  <Pane variant="canvas">…</Pane>
  <ResizeGrip onPointerDown={startDrag} />
  <Pane variant="panel">…</Pane>
</div>
```

The row's gap must be 0 — the grip is the gap.
