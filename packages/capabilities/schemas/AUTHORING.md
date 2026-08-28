# Authoring an extraction schema

*The named schemas the `extractor` worker (T-274) extracts against.* These are
**domain content, not code** — the same standing as
[`packages/lenses/definitions/`](../../lenses/definitions/), owned by the same
specialists and versioned in the same repository. **Adding a schema is adding a
file.** The extractor's code does not change, and no ticket is needed to add
one.

Read this before adding or editing a file. The loader validates every schema at
startup and a **validation failure is a build failure, never a degradation** —
the deployment refuses to start rather than quietly offering five schemas where
six were authored.

## The file

One YAML file per schema, named for its `name`. Fields:

| Field | Meaning |
|---|---|
| `name` | snake_case, matches the filename, **never reused** — it is what a caller asks for |
| `version` | integer, **bumped on any change**, recorded on every extraction it produces |
| `label` | what a person calls it |
| `description` | one line, what this schema is a register of |
| `retrieval_hint` | the words used to find the passages this schema extracts from, when the caller gave a document scope rather than a question. Domain vocabulary, not a prompt |
| `fields[]` | the columns of the register; see below |

Each field carries `name` (snake_case), `type` (`string` \| `number` \| `date`),
`required` (boolean) and `description` — **user-facing wording**, because it is
what the model is told the column means and what a person reads when a row
fails to parse.

## Three rules that are not style

**A schema states what the register must contain, never how confident to be
about it.** There is no `confidence` field and no `optional_if`. `strict`
extraction either produces a conforming row or produces a **failure** carrying
the partial row and the reason — and the failure is the useful output, because
the whole value of a commitments register is that it is complete and checkable.
A silently coerced commitment is worse than no record.

**Every record carries its source and its locator, and no schema declares
them.** They are not columns you author — the extractor attaches them from the
passage the row came from, so a schema cannot forget them and cannot pretend to
supply them itself. This is non-negotiable 1 applied to structured output.

**A field's `description` is read by a domain expert on a bad day.** It appears
verbatim in the failure that says a row did not conform. "ISO date" is a
schema; "the date the commitment must be met by, as it appears in the document"
is an instruction someone can act on.

## Adding one

1. Write the file. 2. `pnpm --filter @infora/capabilities run test` — the
definitions suite validates every shipped schema and will name the file, the
field and the rule if something is wrong. 3. That is all: no registry entry, no
code change, no ticket.
