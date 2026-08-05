Every full-app screen starts here. The rail is part of the frame; the panes float.

```jsx
<AppFrame width={1280} height={828} rail={<Rail>…</Rail>}>
  <Pane variant="canvas">…</Pane>
  <Pane variant="panel">…</Pane>
</AppFrame>
```

Works with one floating pane (landing, library, sandbox) or two (editor: canvas + chat). Never give the rail a fill, radius, shadow or divider.

The content region's `gap` is 0 by design. Two panes get their 12px gutter from the `ResizeGrip` between them, or — with no grip — from the margin the stylesheet applies between adjacent panes. Do not add a gap as well; that triples the gutter.
