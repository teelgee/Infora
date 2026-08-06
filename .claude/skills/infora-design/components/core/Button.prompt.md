Use `Button` for every action; `variant="primary"` marks the one main action per view.

```jsx
<Button variant="primary" onClick={promote}>Promote</Button>
<Button onClick={edit}>Edit</Button>
<Button variant="quiet" onClick={dismiss}>Dismiss</Button>
<Button variant="danger" onClick={remove}>Remove</Button>
```

Variants: `primary` (near-black — the monochrome accent, never green), default bordered, `quiet` (borderless), `danger` (red label, tinted hover). `size="sm"` for table rows. Disabled drops to 35% opacity and `cursor: not-allowed`. Never colour a primary button with a feedback hue.
