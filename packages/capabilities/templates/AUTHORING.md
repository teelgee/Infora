# Authoring a document template

*The outlines `document_builder` (T-280) drafts into.* Content, not code, on the
same terms as [the extraction schemas](../schemas/AUTHORING.md) and the
[Lens definitions](../../lenses/definitions/): **adding a template is adding a
file**, validated at startup, and a validation failure is a build failure.

| Field | Meaning |
|---|---|
| `id` | kebab-case, matches the filename, **never reused** |
| `version` | integer, bumped on any change, recorded on every document it produces |
| `label` / `description` | what a person calls it, and what it is for |
| `sections[]` | `id`, `heading`, and `guidance` — what belongs in that section |

**A template says what a document is FOR, never what it concludes.** `guidance`
is an instruction about scope and register — *"state the statutory test and
whether the evidence before the examination meets it"* — and never a finding to
reach. A template that told the model what to conclude would make every
document produced from it agree with the template rather than with the sources,
which is the one thing a grounded system may not do.

**A template supplies no sources.** The builder does not retrieve: its sources
are handed to it explicitly by the orchestrator, so a template cannot smuggle a
corpus in through a `retrieval_hint` the way an extraction schema legitimately
does. That asymmetry is deliberate — an extraction schema *reads* and a template
*writes*, and only one of those should be able to choose what it sees.
