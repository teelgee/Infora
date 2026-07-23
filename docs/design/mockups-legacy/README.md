# Legacy mockups — superseded

These HTML mockups (`ask.html`, `editor.html`, `library.html`, `owner-audit.html`,
`project-home.html`, `review.html`, `sandbox.html`, `workspace-landing.html`,
`styles.css`) predate the token system in `docs/design/design-tokens.json` /
`docs/design/design-rules.md`. They use the old CSS vars (`--ink`, `--accent`,
`--hairline`, `--mono`, etc.) and reflect earlier build tickets (T-050, T-086,
and others) — several still cited by comments in `apps/web/src/screens/*.tsx`
for that build-provenance history, not as current visual spec.

**Do not treat anything in this folder as the current design reference.**
The live app, `design-tokens.json`, and `design-rules.md` are authoritative.
Where this folder's styling conflicts with those — e.g. its plain-text
`.crumb` breadcrumb vs. the current project-name chip — the newer source
wins.

The current mockup source is `../mockups/workspace-redesign.dc.html`
(turns 4–11, cited in `design-rules.md`).
