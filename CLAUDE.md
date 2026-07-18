# CLAUDE.md

## Diagrams (`.tldr` files) — do not read as text

`docs/architecture/diagrams/*.tldr` are tldraw's native JSON format. Each is
40–75 KB of shape/coordinate records with almost no human-readable signal, so
reading one directly dumps tens of thousands of tokens for near-zero
comprehension. **Never `Read`, `cat`, or otherwise load a `.tldr` file's raw
contents.**

When a task seems to need a diagram's contents:

1. Ask the user first — confirm the diagram is actually needed before spending
   anything on it.
2. On confirmation, render it to a **PNG** and `Read` that image (the Read tool
   renders PNGs visually), rather than reading the raw JSON or asking the user
   to export it by hand.

The `.tldr` files stay the editable source of truth; the PNG is a throwaway
view for interpretation only.

> A repo converter that renders `.tldr` → PNG locally (parsing the JSON, no
> tldraw or network, rasterising with the Chromium already installed under
> `e2e/`) is a planned follow-up — not yet built. Until it exists, ask the user
> how they want a specific diagram rendered.
