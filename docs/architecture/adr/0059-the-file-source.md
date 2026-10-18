# ADR-0059 — The file source: an app table fed from a spreadsheet the project already holds

**Status:** Accepted (owner-directed 2026-10-18; designed and recorded by Claude on the owner's delegated authority the same day — every mechanism ruling below is on Session AD's veto list in [grill-history.md](../../grill-sessions/grill-history.md)).

**In plain terms:** a contractor keeps a cost report or a fuel-usage sheet as a
spreadsheet, and updates it each month. Today the only way those figures reach
an app is somebody retyping them. From this ADR, an app table can **point at a
spreadsheet that already lives in the project** — a sandbox document or a
library record — name the block of cells that holds the data and what each
column means, and from then on **every new version of that file refills the
table the moment it lands**, through the acceptance step where the table has
one. The contractor keeps working in Excel; the dashboard stays fed; nothing
is retyped.

**Context.** The owner's direction (2026-10-18): *"the contractor or supplier
would update the spreadsheet directly or create a new one each month. the
dashboard builder needs to be able to point at the sandbox or project library
item and then select the cells."* The owner's model is Power BI; the research
([the Power Query Excel connector and Power BI refresh documentation](https://learn.microsoft.com/en-us/power-query/connectors/excel),
read 2026-10-18, and the Foresight product pages — context, never authority)
yielded three lessons this design is built on: the reliable unit of selection
is a **table-shaped region with a header row**, not loose cells (Power BI's
own docs concede a freely-selected range "might not refresh properly" when
the sheet changes); file sources are always **imported copies**, refreshed by
re-import, never read live; and refresh must be keyed to a **stable document
identity** — Power BI's file-ID refresh breaks when a file is deleted and
recreated, and Infora's versioned documents (replace-file today, co-authoring
later) are structurally better here than OneDrive. Infora's own record had
already cleared the ground: an app reading a project file its viewer can open
is not grounding (ADR-0011's addendum), and ingest-as-a-deliberate-step is
ADR-0057's 2026-10-18 note.

## Decisions

**1. A source is a pointer at ONE project document, per table, and the
document's versions are the refresh events.** An app table may carry at most
one source: a sandbox document or a library record (exactly one of the two),
a sheet, a header-topped rectangular region, and a column mapping (source
column → the table's declared column). When a new version of that document
lands — an upload replacing the file today, a co-authoring save later — the
table re-derives: the new version's rows come in, and the previous import's
rows are superseded, prior versions kept, the platform's standing append-only
discipline. A manual "refresh from the file now" exists beside the automatic
path. Pointing at the *document* rather than a file path is the Power BI
lesson made structural: the monthly update is a new version of the same
thing, and the pointer never dangles.

**2. Imported rows belong to the firm whose file it is.** Each import's rows
are stamped `entered_by` = **the person whose act produced that file
version** — the contractor who replaced the file — and their organisation.
Not the app's builder, not a system identity: the wall inside the app keys on
the entering organisation, and the honest answer to "who entered these
figures?" is the person who submitted the spreadsheet they came from. A
machine moved the numbers; a person vouched for them, and that person is
named. (The builder who configured the mapping is stamped on the source
configuration, not on the rows.)

**3. The acceptance step applies to imports exactly as to typed rows.** On a
table with an acceptance step, an import lands **submitted** — the file
version IS the month's submission, and the client accepts or rejects as with
any return (a rejection's correction is a corrected file version). On a table
without one, imported rows are stateless, as typed rows are. Nothing about
the import bypasses the row predicate, the freeze, or any rule a typed row
obeys — an imported row is an ordinary `app_rows` row with an ordinary life.

**4. Attaching a source is the builder's act, gated by what they can read.**
Only someone who may build the app attaches a source, and only to a document
**they can open** (the sandbox or library entitlement, resolved at attach).
Deriving, though, acts on the uploader's own version of their own file —
so a builder later losing sight of the document stops them *re-configuring*,
never the contractor's own submissions from flowing. The agent gets no
source act in this round: attaching is a panel act, considered for the agent
later.

**5. The parser is in-tree first, a dependency only if that fails.** Reading
.xlsx means unzipping and parsing XML; the platform already writes .xlsx
minimally (T-358) and parses it in tests. The build extends that rather than
importing a spreadsheet library by default; if a real wall is hit, the
dependency is flagged loudly in the report and the review decides. Values
imported are **cell values** — a formula's result, never the formula — which
is also the honest reading of "the figures the firm submitted".

**6. Spreadsheets are the first format through a general door.** The source
is designed as *document + parser*, so a schedule file (the Foresight shape —
Primavera, Microsoft Project) is a later parser through the same pointer,
not a redesign. Only .xlsx is built now.

## Considered and not taken

*Loose cell selection* (the brittleness Power BI documents; a header-topped
region re-found by its header row survives sheet edits that would silently
break a coordinate range). *Live read-through to the file* (an import is a
record of what was taken and when; reading live would make the dashboard's
numbers unauditable and is the lane even Power BI declines for files).
*A system identity entering the rows* (a row nobody vouched for is not
evidence; decision 2). *Bulk upload straight into a table* (rejected by the
owner's own sharpening — the file stays the artefact, the table follows it).
*Computed measures — planned-versus-actual, variance, S-curves* (the
Foresight-grade layer; named for a round 2 designed after the owner's
acceptance walk, not smuggled into this one).

## Consequences

Drawer 9 gains `app_table_sources`, drawn in
[data-model.md](../../build/data-model.md) before any migration is written
(one migration, 0069). The personal-data register's app-rows entry gains a
dated clarification: imported rows name the file version's uploader as
enterer. The builder's panel gains a Source section per table (attach,
mapping, refresh-now, last-import receipt). Tickets T-451 and T-452 build it;
the owner's acceptance walk (T-446) gains the cost-reporting dashboard as a
second test app. The external-API source stays deferred with ADR-0057, and
the in-Infora editing of the source file is ADR-0043's own track.
