# Reference — Retool, Lovable and Nomic: what a builder and a viewer see (observed)

**What this is.** The UI companion to [app-builder-landscape.md](app-builder-landscape.md).
That document asked what the outside world has learned about *governing* apps
people build themselves; this one asks what the screens *look like* — how two
products that already let a person build an app arrange the job, how each
separates building from using, where their model is not Infora's, and what a
third company, Nomic, actually sells. Commissioned by T-437 (owner's
instruction, 2026-09-06: *"we should look at what their interfaces and
workflows look like first before trying to define the interface for infora"*)
to ground the two drawings of T-438. **Context, never authority, and never a
citation in an ADR.** Where it pushes against a ruling, it says so in §6 and
the push goes to the owner as a proposal.

**Status and honesty.** Written 2026-09-06 from the three vendors' own
documentation and product pages, fetched that day. Nothing here is from
hands-on use of any product, and no screenshot was downloaded: where a screen
is described, the page that carries the picture is named so a reader can go
and look. Each claim is tagged **[documented]** (the vendor's own docs page,
named), **[vendor copy]** (a marketing page — positioning, not necessarily
in-app text), or **[inferred]**. Literal interface labels are in **bold**.
Two of the three products changed shape in 2026 — Retool renamed its
drag-and-drop editor "classic" in May and is removing its in-editor AI
assistant on 30 September; Lovable renamed both its modes — so a page or
tutorial older than mid-2026 will use different words for the same things.
§7 lists what could not be verified and where the sources disagree.

**How to use it.** §5 answers T-437's "done when": for each step of the
builder in ADR-0056's shape, which product's pattern (if any) the drawing
starts from. §4 takes Nomic's catalogue apart and says which of its agents a
firm could build on Infora as a playbook, and what the builder would need to
offer. §6 is the part that may change something: findings that push on the
ADRs or the build order, separated from the observations.

---

## The two-minute read

- **Both app builders are now chat-first with a live preview, and neither
  has a wizard.** Retool's new builder (May 2026) is three tabs — **Chat**,
  **Data**, **Code** — beside a preview canvas; Lovable has always been a chat
  on the left and the running app on the right. The stepped, walk-me-through
  shape ADR-0056 §2b asks for has no direct precedent in either. The closest
  things are Lovable's **Plan** mode, where the agent asks clarifying questions
  *before* building, and Nomic's workflow builder, which asks three questions:
  what the workflow should do, what files it needs, what output it produces.
- **Building and using are cleanly two seats in Retool and nearly one seat in
  Lovable.** Retool's **Use** permission is literally "Interact with the app as
  an end user. Cannot open the editor." Lovable's end user is a visitor to a
  published URL with an **Edit with Lovable** badge on it unless the builder
  pays to hide it; anything about *who* that visitor is, is code the AI wrote.
- **Neither has a row that belongs to the organisation that entered it.**
  Retool's row rules are your own query filter, a PostgreSQL-only access policy
  configured per resource, or the database's own. Lovable's are row-level
  security policies the AI writes, read-only in the interface, changed by
  asking the chat — the mechanism behind its 2025 security incident. Both
  assume one organisation. Retool's answer to "several organisations" is
  *cloning* the whole workspace (**Spaces**), not sharing one record.
- **A template carries structure, not data, in both.** Lovable's **Remix**
  copies "tables and schema, not the records in them" and never secrets.
  Retool copies apps between Spaces with permissions stripped. The owner's
  2026-09-06 playbook rule is the market's own shape.
- **Nomic is real, the catalogue is real, and the "not an app builder" half
  is wrong.** Nomic AI pivoted publicly to architecture, engineering and
  construction on 3 November 2025. It sells the agents the board named —
  drawing review, submittal review, code compliance, project research (where
  RFI research lives) — over documents where they already sit, *and* it ships
  a plain-language workflow builder and a developer API. Most of what it sells
  maps to Infora's **existing tools** (the QA checker, Ask, the extractor)
  rather than to an app with tables; two of its agents are buildable as
  playbooks if the builder gains a document-input step and a marked-up-PDF
  output.

---

## 1. The builder's flow — the order each product puts the steps in

The five things ADR-0056 §10 names, in the owner's words: *connect data,
define tables, draw the interface, set how often it runs, write what the
agent does*. Where each product puts them, and where its AI sits.

### 1a. Retool — two builders, one platform

**Which builder.** Since 28 May 2026 Retool has two. The drag-and-drop editor
it has had for years is now called a **classic app** ("Apps built using
Retool's drag-and-drop IDE are now called classic apps" — [changelog, 28 May
2026](https://docs.retool.com/changelog/app-builder)) **[documented]**. The
new **app builder** "build[s] production-ready React apps using natural
language": a chat tab "where you describe changes in natural language and an
AI agent plans and executes them", running on React 19 (same page)
**[documented]**. The classic editor's own AI panel, **Assist**, is being
withdrawn: "The public beta for Assist concludes on September 30, 2026, and
Assist will be removed for all users on that date"
([Assist prompting](https://docs.retool.com/apps/guides/assist/prompt))
**[documented]**. A screenshot of Assist is a screenshot of something that
stops existing this month.

**No fixed order.** Retool does not impose a sequence across connect → tables →
interface → schedule → agent; each is its own area reached from the home
page. The classic quickstart's own headings run interface first, then
resources, then queries — you can draw before you connect data
([quickstart](https://docs.retool.com/apps/quickstart)) **[documented]**.

| The owner's step | Where it happens in Retool | What the screen is |
|---|---|---|
| Connect data | The **Resources** page: **Create new → Resource**, pick a type (e.g. **REST API**), fill the form, **Create resource** ([create a resource](https://docs.retool.com/data-sources/tutorials/create-resource)) **[documented]**. In the new builder the **Data** tab lists connected resources and the typed functions the agent wrote over them ([app builder concepts](https://docs.retool.com/build/apps/concepts/app-builder)) **[documented]**. | A list of connections, each a form; the browser never holds a credential ("only Retool directly connects to a data source, not your users" — landscape §1). |
| Define tables | The **Database** tab, Retool Database: "Create an empty table, import existing data in CSV format, or generate a table schema with AI"; add a field with **Add**, options **Nullable**, **Unique**, **Default value**; a table without a primary key is read-only ([Retool Database tutorial](https://docs.retool.com/data-sources/tutorials/retool-database), [manage fields](https://docs.retool.com/data-sources/guides/retool-database/manage-fields)) **[documented]**. | A spreadsheet-like grid with a table list down the side and open tables as tabs. **The closest thing either product has to Infora's table step.** No notion of a row's state or of who may read it. |
| Draw the interface | Classic: the IDE — **Canvas** (12-column grid), **Navbar**, a **Left panel** with tabs **Add UI · Pages · Component tree · Code · State · Releases and history · App settings · Assist**, the **Inspector** on the right with **Content · Interaction · Appearance**, and a **Status bar** with the environment switcher and release version ([classic IDE](https://docs.retool.com/apps/concepts/ide)) **[documented]**. New builder: a **preview canvas** with **Selection mode** ("click a component to target edits") and light/dark theming, beside **Chat · Data · Code** ([app builder concepts](https://docs.retool.com/build/apps/concepts/app-builder)) **[documented]**. | Classic is a dense five-region editor. The new builder is a conversation plus a live app; the prompt advice is to be "specific about what data should be used, what components should be placed on the page, and what you want users to be able to do" ([quickstart](https://docs.retool.com/build/apps/quickstart)) **[documented]**. |
| How often it runs | Not in apps at all. A **Workflow**'s **startTrigger** block, **Triggers** tab: **Interval** (every *n* minutes/hours/days/weeks/months) or **Cron**, shown back in words, with a timezone; "You must publish a workflow release before it can run automatically using a schedule" ([schedule a workflow](https://docs.retool.com/workflows/guides/schedule)) **[documented]**. Agents have no schedule of their own: "An agent only runs when invoked" ([agents overview](https://docs.retool.com/agents/concepts/overview)) **[documented]**. | A block on a flow canvas. The schedule is gated behind a *published release*, which is the pattern worth keeping (§5). |
| What the agent does | **Agents**: a **Configuration** tab with **Instructions** ("the canonical source of truth that tells the agent who it is, what it should do, and how it must behave"), **Model**, **+ Add Tool**, **Triggers** (Chat, Email, A2A), then **Deploy** as a Major/Minor/Patch release ([agents quickstart](https://docs.retool.com/agents/quickstart)) **[documented]**. | A form: one big instructions box, a model picker, a tools list, a test chat beside it. |

**Where the AI sits, and whether it asks.** In the classic editor Assist is a
tab at the bottom of the left panel with two modes, **Ask** ("cannot modify
your classic app") and **Build** ("can create and edit classic apps"). It
*does* ask: "Assist might ask clarifying questions about your prompt, such as
whether you'd like to connect Retool Database or use client-side mock data",
and "asks you for permission to run and save queries" — prompt every time or
auto-approve ([Assist prompting](https://docs.retool.com/apps/guides/assist/prompt))
**[documented]**. In the new builder the chat *is* the editor ("the primary
development interface of your app"); the documented pause is a
human-in-the-loop approval when a generated function would modify data, not a
clarifying question ([how it works](https://docs.retool.com/build/apps/concepts/how-it-works))
**[documented]**. I found no statement that the new builder's agent asks
before it builds **[could not verify — §7]**.

**Creating an app is one dialog, not a wizard.** Classic: **Create → App**,
a **Get started** dialog, "select the X to create a blank canvas" (a
Retool-hosted lab page, not core docs) **[documented, weakly]**. New builder:
**Create → App**, optionally pick a model, type the prompt; the name, URL and
folder are asked at **Publish** time ([publishing](https://docs.retool.com/build/apps/guides/publishing))
**[documented]**.

### 1b. Lovable — one chat, and the backend behind a menu

**The flow is explicitly not stepped.** Lovable's quick start: sign up → type
into the prompt box → land in the editor with chat on the left and preview on
the right → iterate → **Publish** → optional Git sync
([getting started](https://docs.lovable.dev/introduction/getting-started))
**[documented]**. The hierarchy is Account → Workspace → Project
([introduction](https://docs.lovable.dev/introduction)) **[documented]**.
Placeholder in the prompt box: **Ask Lovable to create…** (from the docs; the
home page itself refused the fetch) **[documented]**.

**Two modes, renamed in 2026.** **Build** mode ("previously Agent mode")
executes autonomously, with **Stop**, **Undo**, a **Details** view, and a
"credit check-in" that pauses when one message crosses a cost threshold
([Build mode](https://docs.lovable.dev/features/agent-mode)) **[documented]**.
**Plan** mode ("Plan mode was previously called Chat mode") never modifies
code, is entered with the **Plan** button next to the message input, and is
where the questions live: "Lovable may ask clarifying questions to understand
requirements, constraints, or tradeoffs before proposing a plan"; the plan is
saved to a file and an **Approve** action switches to Build
([Plan mode](https://docs.lovable.dev/features/plan-mode)) **[documented]**.
So: **questions before building, then autonomy** — the agent asks in Plan and
acts in Build.

| The owner's step | Where it happens in Lovable | What the screen is |
|---|---|---|
| Connect data | **Lovable Cloud** (built-in backend on Supabase's foundation) is on by default; when a feature needs a backend Lovable "enables Cloud automatically or asks for your approval in chat first", under per-tool permissions **Always allow / Ask each time / Never allow** ([Cloud integration](https://docs.lovable.dev/integrations/cloud)) **[documented]**. An existing Supabase project can be connected instead, one per project ([Supabase](https://docs.lovable.dev/integrations/supabase)) **[documented]**. Secrets go in through "a secure input in chat" and live under **More → Cloud → Secrets** ([secrets](https://docs.lovable.dev/features/secrets)) **[documented]**. | Mostly invisible: the backend appears when the chat needs it. The secure-input-in-chat for a key is the one piece with a screen. |
| Define tables | **More → Cloud → Database**: "your project's tables and views with their row counts"; browse and edit records; an **RLS policies** view with columns **Policy name · Command · Applies to · Rule expression**, read-only — "To change a policy, ask Lovable in chat" ([database](https://docs.lovable.dev/features/database)) **[documented]**. | A table browser you look at, not a table designer you use: the schema is whatever the chat produced. |
| Draw the interface | The chat plus the live preview. **Select elements** in the preview toolbar (shortcut `S`) attaches a chosen element to the next prompt; this replaced the earlier "Visual edits" ([select elements](https://docs.lovable.dev/features/visual-edit)) **[documented]**. A **Code** tab exists; editing it needs a paid plan ([code mode](https://docs.lovable.dev/features/code-mode)) **[documented]**. | The whole product. Pointing at a thing on the running app and saying what to change is the interaction Retool's new builder copied as **Selection mode**. |
| How often it runs | **More → Cloud → Jobs** (Cloud only, added 24 June 2026): "Jobs are scheduled background tasks"; the view shows the schedule "in plain language, for example 'Every day at 08:00 AM' or 'Every 15 minutes'", **Last run**, and a run history with **Succeeded / Failed / Running**; "Creating a job, changing its schedule, or deleting one happens by asking Lovable in chat or through SQL, not from the Jobs view" ([jobs](https://docs.lovable.dev/features/jobs), [changelog](https://docs.lovable.dev/changelog)) **[documented]**. | A read-only register of what is scheduled and how it went. **The best schedule screen of the three** (§5). |
| What the agent does | There is no "agent inside the app" as a first-class thing; AI features are code the builder asks for. Standing instructions *to Lovable* live in two plain-text fields, **Settings → Knowledge** (workspace) and **Project settings → Knowledge** (project), 10,000 characters each ([knowledge](https://docs.lovable.dev/features/knowledge)) **[documented]**. | A text box. |

**Publish.** A **Publish** button top-right with a dot for unpublished changes;
the dialog shows the **Website URL**, a visibility row, and the result of an
automatic **Basic security scan** ("No security issues found" or findings);
each publish is a snapshot ([publish](https://docs.lovable.dev/features/publish))
**[documented]**. Since 10 August 2026 the scan runs before every publish and
cannot be switched off ([changelog](https://docs.lovable.dev/changelog))
**[documented]**.

### 1c. What the two flows have in common, and what neither does

- **Chat is the front door and the preview is the proof.** Both put a
  conversation beside a running app. Retool's classic five-panel editor is the
  outlier, and Retool is moving away from it.
- **Questions come in a planning moment, if at all.** Lovable asks in Plan
  mode; Retool's (departing) Assist asks in "several planning steps"; the new
  Retool builder pauses only to approve a data-modifying function.
- **The schedule is somewhere else.** Retool puts it in Workflows, Lovable in a
  Cloud sub-menu; neither treats "how often it runs" as a step of building the
  app.
- **Neither asks a single question about the data's status.** There is no
  "is this contractual?", no submitted/accepted state, no per-table choice of
  the kind ADR-0056 §2a makes. That step has no pattern to borrow.
- **Neither surfaces "who may open each screen" while building.** Access is a
  share dialog after the fact (Retool) or code the AI wrote (Lovable).

---

## 2. The two seats — building versus using a deployed app

### 2a. Retool separates them sharply

- **Permission levels are the seat.** For apps: **Use** — "Interact with the
  app as an end user. Cannot open the editor."; **Edit** — "Build and modify
  the app. Release, rename, export, delete the app."; **Own** — Edit plus move
  between folders and "manage who has access (share the app)"
  ([permission levels](https://docs.retool.com/permissions/reference/permission-levels))
  **[documented]**.
- **Two modes of the same app.** The editor's preview button switches "to a
  view-only version of the app"; **Ctrl Alt Enter** toggles view and edit
  ([share an app](https://docs.retool.com/apps/guides/app-management/share))
  **[documented]**. The end user's URL is `/app/{name}`; embedding uses
  `/p/{name}` ([customize URLs](https://docs.retool.com/apps/guides/app-management/customize-app-urls))
  **[documented]**.
- **Draft versus live.** **Releases and history**: a new release is Major,
  Minor or Patch, created as a draft or published; a published one carries a
  **Live** label; "users in user mode see only the most recently published
  version by default" while editors keep working on the current version; a
  group can be given **Allow access to unpublished releases**; **Compare
  changes** shows a diff ([releases and history](https://docs.retool.com/apps/guides/app-management/releases-history))
  **[documented]**. The new builder's **Publish** modal carries a **Publish
  checklist** (functions approved, no conflicts with other builders' work,
  else **Integrate changes**), asks for the **App URL** and folder, and
  optionally tags a release ([publishing](https://docs.retool.com/build/apps/guides/publishing))
  **[documented]**.
- **Who may build at all.** "The app builder is available to both internal
  users and builders, but only builders can publish apps"
  ([app builder concepts](https://docs.retool.com/build/apps/concepts/app-builder))
  **[documented]**; a per-role permission **Build apps in the AI-powered app
  builder** can be withdrawn ([configuration](https://docs.retool.com/build/apps/guides/configuration))
  **[documented]**. Billing follows activity: a **builder** seat is "Enabled
  users who built or edited an app or workflow during the billing cycle"
  ([billing](https://docs.retool.com/support/billing-usage)) **[documented]**.
- **Multiplayer editing** exists for classic apps (avatars in the toolbar,
  cursors on the canvas, last-write-wins) and not for the new builder
  ([multiplayer](https://docs.retool.com/apps/concepts/multiplayer)) **[documented]**.
- **Can a user see the definition?** With Use access, no — "Cannot open the
  editor". One leak on the data side, for *editors*: "Users with Edit access
  can see all tables and columns, regardless of policy grants"
  ([access policies](https://docs.retool.com/data-sources/concepts/access-policies))
  **[documented]**.

### 2b. Lovable barely separates them

- **The end user is a visitor.** Publishing produces a snapshot at
  `*.lovable.app` or a custom domain; "publishing never exposes your source
  code, chat history, or unpublished work"; the site keeps serving with the
  editor closed ([hosting](https://docs.lovable.dev/features/hosting))
  **[documented]**. Project access (who may edit) and website access (who may
  visit) are two independent settings ([visibility](https://docs.lovable.dev/features/project-visibility))
  **[documented]**.
- **The builder's badge on the user's screen.** "The 'Edit with Lovable'
  badge shown on published apps can be hidden on paid plans" via **Project
  settings → Publishing → Hide Lovable badge**; on downgrade it returns
  ([FAQ](https://docs.lovable.dev/introduction/faq)) **[documented]**. On the
  free plan the user *is* shown the door to the editor.
- **Who may visit.** Free and Pro: public only. Business and Enterprise:
  **Public**, **Workspace** (members sign in), or **Custom** (a composed
  audience, including people invited by email from outside — added 21 July
  2026) ([publish](https://docs.lovable.dev/features/publish), [changelog](https://docs.lovable.dev/changelog))
  **[documented]**.
- **Who the visitor is, inside the app, is code.** "Ask Lovable to add login,
  and it generates the signup and login pages, wires them to your backend, and
  protects user data with row level security"; users appear under **More →
  Cloud → Users** ([authentication](https://docs.lovable.dev/features/authentication))
  **[documented]**. There is no built-in role for end users; Lovable's own
  guide tells the builder to prompt for them — "Admin can edit and delete all
  records; Editor can edit but not delete; Viewer has read-only access"
  ([admin-panel guide, 28 March 2026](https://lovable.dev/guides/how-to-build-admin-panel-without-code))
  **[vendor copy]**. The **Viewer / Editor / Admin / Owner** roles on the
  pricing page are *builder-side* workspace roles, not app roles
  ([collaboration](https://docs.lovable.dev/features/collaboration)) **[documented]**.
- **Builder-side collaboration.** Invite by email or a five-day link from the
  **Share** button; project roles Viewer / Editor / Admin / Owner, where an
  Editor may publish and add domains ([share](https://docs.lovable.dev/features/share-project))
  **[documented]**.

### 2c. What this says for Infora's two seats

Infora's rule is stronger than either: the app "acts as whoever is looking at
it" (ADR-0056 §4), so the two seats are not a permission on the app but a
consequence of what the viewer could already see. Retool's **Use** seat is
the right *feel* for the viewer — a plain app page with no editor chrome, no
door to the definition, the last published version. Lovable's badge is the
anti-pattern: a viewer's screen that advertises the builder. One thing the
research surfaces that ADR-0056 does not rule: **what a viewer sees while the
builder is mid-edit.** Retool answers with draft-versus-live releases; Infora's
drawer 9 has a `definition_version` and a note that a version-history table
is T-439's call. §6 carries this as a proposal.

---

## 3. Where their model is not ours — stated plainly, so the drawings do not import it

Each of these is a thing the two builders assume that Infora does not. Each is
a way a drawing could go wrong by copying too faithfully.

1. **One organisation.** Retool's unit is the organization: "A distinct
   collection of users and data. Organizations operate separately from one
   another" ([glossary](https://docs.retool.com/glossary)) **[documented]**.
   Everything — groups, apps, resources, the database — sits inside one.
   Lovable's is Account → Workspace → Project, one backend per project
   ([Supabase](https://docs.lovable.dev/integrations/supabase)) **[documented]**.
   Infora's app lives in a *project* that several organisations share, with a
   wall between them. **A drawing that shows "users" or "groups" as the audience
   has imported the single-firm assumption; the audience is organisations on
   the ADR-0036 ladder.**
2. **No wall inside a project.** Retool's answer to several organisations is
   **Spaces**: "multiple isolated organizations within a parent organization.
   Each space has its own subdomain, sso configuration, source control
   configuration, user accounts and permission groups" and its own database;
   apps can be *copied* between spaces with permissions stripped
   ([spaces](https://docs.retool.com/org-users/tutorials/spaces), [scaling](https://docs.retool.com/org-users/concepts/scale-organization))
   **[documented]**. That is tenancy by cloning: two organisations never look
   at one record. Retool's **external users** are second-class members of *your*
   org who "can only access external apps and public links"
   ([external users](https://docs.retool.com/org-users/concepts/external-users))
   **[documented]** — a portal, not a peer. Infora's project has three peers
   reading one table, each seeing its own rows and the owner seeing all.
3. **No organisation stamp on a row.** Retool has three ways to restrict
   rows, and every one is the builder's job: filter your own query with
   `current_user` against a `user_groups` table you keep yourself; an **access
   policy** on a PostgreSQL resource (row filters "do not validate writes";
   automated workflow runs are blocked on an enforced resource because Retool
   "cannot attribute" them to a person); or the database's own row-level
   security ([row-level security](https://docs.retool.com/queries/concepts/row-level-security),
   [access policies](https://docs.retool.com/data-sources/concepts/access-policies))
   **[documented]**. Lovable's is row-level security the AI writes, read-only in
   the interface, changed by asking the chat ([database](https://docs.lovable.dev/features/database))
   **[documented]** — and the mechanism behind CVE-2025-48757, where a scan of
   1,645 published apps found 170 with tables anyone could read or write
   ([researcher's write-up](https://mattpalmer.io/posts/2025/05/CVE-2025-48757/))
   **[documented, third party]**. Infora stamps every row with the organisation
   and person that entered it and reads it by that stamp, below any app's code
   (ADR-0056 §2). **A drawing that shows a "who can see this table" setting on
   the table has imported the access-rules-in-the-app assumption; there is no
   such setting.**
4. **Templates carry no data — the market agrees, for once.** Lovable's
   **Remix** copies "Database structure (tables and schema, not the records in
   them)" and never "Database data", secrets, domains, collaborators or
   connections; the dialog offers **Include project history** and **Include
   custom knowledge** ([remix](https://docs.lovable.dev/features/projects/remix))
   **[documented]**. Retool's cross-space copy transfers no permissions,
   releases or environment variables ([spaces](https://docs.retool.com/org-users/tutorials/spaces))
   **[documented]**. The owner's playbook rule — structure including table
   definitions, never a row of any origin (ADR-0056 §10 as amended
   2026-09-06) — is exactly Lovable's remix. Two things the market adds that
   Infora's rule does not: Lovable's remix can carry the *chat history* that
   built the app, and Retool's agent templates "are pre-populated with mock
   data" ([agent templates](https://docs.retool.com/agents/guides/create-agent-from-template))
   **[documented, snippet only]**. Neither is proposed here; both are named so
   nobody mistakes them for gaps.
5. **The scheduled run has no person.** Retool's access policies block
   scheduled workflow runs outright because the run cannot be attributed to a
   person ([access policies](https://docs.retool.com/data-sources/concepts/access-policies))
   **[documented]**. Lovable's Jobs run as the backend. Infora's run acts as
   the app's owner, narrowed to what the app declared (ADR-0056 §5) — the
   research found no product doing this, and Retool's own refusal to run
   unattributed is the nearest thing to agreement.
6. **The credential is the builder's.** Both keep keys on the server and out
   of the browser, but both let a builder connect their own database login
   and lend it to every user of the app — the landscape document's "single most
   common leak". Infora's connection is an organisation's, under a dedicated
   integration credential (ADR-0057 §1–§2), and is not built until deployment.
   **A drawing of step 3 that shows a password field has imported this; the
   step declares a requirement, and the filling happens elsewhere, later.**

---

## 4. Nomic — the catalogue view, verified

### 4a. Which Nomic, and whether the attribution was right

The board's text (T-437) called Nomic "not an app builder but a company
building specific app solutions" and listed a catalogue it flagged as
unverified. **Verdict: right company, right catalogue, wrong on the "not an
app builder" half.**

- **Nomic is Nomic AI** (nomic.ai), the company behind the Nomic Embed
  models, the Atlas data-map product and GPT4All. On **3 November 2025** it
  announced a refocused platform: "Nomic is now focused on engineering AI
  systems that will accelerate the adoption of AI in Built World industries",
  naming "Energy, Engineering, Architecture and Construction", and listing
  "code compliance checking, drawing review, submittal review, and project
  research" as its out-of-the-box workflows
  ([announcement](https://www.nomic.ai/news/announcing-a-new-nomic-platform))
  **[vendor copy]**. The home page now reads "Domain-Specific AI for
  Architecture, Engineering & Construction" ([nomic.ai](https://www.nomic.ai/))
  **[vendor copy]**. No other company called Nomic in this space surfaced.
  The older products are still live (Atlas docs, GPT4All releases in 2026);
  "Nomic is an embeddings company" is stale rather than false.
- **The catalogue is real.** The platform page names **Automated Code
  Compliance of Drawings · Automated Drawing Review · Automated Submittal
  Review · Firm-Wide Detail Search · Project Research · AI for BIM & IFC Models
  · RFI Responses · QA/QC Review · RFP Responses**
  ([platform](https://www.nomic.ai/platform)) **[vendor copy]**. "RFI research"
  is Project Research plus a documented "RFI Answer Assistant".
- **"Where they already sit" is real.** "Nomic connects to data where it
  lives, and inherits your existing security and access permissions";
  connectors named: SharePoint, Egnyte, Autodesk Construction Cloud, Bentley
  ProjectWise, Trimble ProjectSight, Fieldwire, Google Drive, Box, Dropbox,
  Teams, Outlook, Gmail (same page) **[vendor copy]**. The docs' configurable
  list is shorter — Uploads, SharePoint, Egnyte, Forma, ProjectWise,
  ProjectSight, Fieldwire ([docs](https://docs.nomic.ai/)) **[documented]**;
  treat the logo wall as marketing.
- **It is also, in a small way, a builder.** The docs describe a
  **Workflows** area: **Create workflow**, name it (their example: **ASHRAE
  90.1 envelope check**), then describe "what the workflow should do, what
  files it needs, and what output it should produce"; edit its "instructions
  and standards", add "requested files" (slots the runner fills each time) and
  "context files" (included every run); share it as **Can run** or **Can
  edit**, or promote it to everyone in the organisation (Business and
  Enterprise) ([create and edit workflows](https://docs.nomic.ai/help/workflows/create-and-edit-workflows))
  **[documented]**. And a developer API — Parse, Extract, Embed, Datasets —
  "so teams can build custom copilots, search tools, or compliance systems"
  ([developer](https://www.nomic.ai/developer)) **[vendor copy]**. **No visual
  canvas, no tables, no custom screens.** Honest characterisation: pre-built
  agents first, with a prompt-and-files workflow builder and an API on top.
- **Who buys it.** A strategic round from Aurecon and Arcadis on 3 September
  2026, with Aurecon rolling it out to 6,700 staff and Arcadis embedding it
  after a trial of about 150 engineers ([funding post](https://www.nomic.ai/news/announcing-nomics-strategic-funding-round-and-partnerships-with-aurecon-and-arcadis),
  [Arcadis](https://www.arcadis.com/en/news/global/2026/arcadis-accelerates-ai-enabled-delivery-through-investment-in-nomic/))
  **[vendor copy, both sides]**. These are design consultancies — Infora's
  own kind of customer — not contractors.

### 4b. The catalogue taken apart

For each agent: what goes in, what comes out, how a non-engineer sees it, and
where it connects. All from Nomic's use-case pages and docs, 2026-09-06.

| Agent | Takes in | Puts out | How it is shown | Source |
|---|---|---|---|---|
| **Automated Drawing Review** | A drawing set from Forma, ProjectWise, SharePoint, Egnyte or upload; optionally the firm's QA/QC checklist, standards, past markups, received RFIs | A findings table — "each with a drawing citation, the check it came from, severity, and discipline"; annotated PDF markups (Bluebeam-style callouts); spreadsheet export; findings pushed as native issues to Forma or Fieldwire | Starts as a chat ("attach a set… ask for a review"), then four phases: **Survey** (reads the sheet index) → **Scope** (asks what to optimise for; **Light / Thorough / Comprehensive**; "Cost is called out before a comprehensive pass starts") → **Review** (one sub-agent per issue class; nine discipline checklists) → **Results** streaming into the table | [use case](https://www.nomic.ai/use-cases/automated-drawing-review) **[vendor copy]**; [docs](https://docs.nomic.ai/docs/capabilities/drawing-review/overview) **[documented]** |
| **Automated Code Compliance of Drawings** | Sheets or sets; a question in words ("Does this egress path meet IBC?"); a jurisdiction | Cited answers with code section numbers and recommendations; the page claims "380+ codes and standards" and, on the same page, "102 fully supported" | Chat, or a saved workflow | [use case](https://www.nomic.ai/use-cases/code-compliance-of-drawings) **[vendor copy]** |
| **Automated Submittal Review** | A submittal package (shop drawings, product data, certificates) plus the contract drawings and specifications | A first-pass review with findings tied to a spec section and sheet; an auto-generated submittal log (Excel); annotated PDFs | A findings list cross-referenced to spec and drawing locations | [use case](https://www.nomic.ai/use-cases/submittal-review) **[vendor copy]** |
| **Project Research / RFI responses** | The connected project documents (drawings, specs, RFIs, addenda, minutes); a question, or a contractor's RFI text | Cited answers; a drafted RFI response with citations; an "RFI Anticipator" report of missing or conflicting design information | One research chat | [use case](https://www.nomic.ai/use-cases/active-project-research) **[vendor copy]** |
| **Firm-Wide Detail Search** | The firm's drawing archive (PDF, DWG, scans) in its connected stores; a plain-language query | Matching details with a visual preview, project, sheet number and position | Visual search results over drawing content | [use case](https://www.nomic.ai/use-cases/firm-wide-detail-search) **[vendor copy]** |
| **AI for BIM & IFC Models** | An IFC file | Quantity take-offs, schedules, clash and missing-opening checks | Structured tables; the user "can verify what the agent queried" | [use case](https://www.nomic.ai/use-cases/bim-ifc) **[vendor copy]** |
| **RFP Responses** | Past responses, CVs, competency data | Drafted proposal sections | Not shown beyond a caption | [platform](https://www.nomic.ai/platform) **[vendor copy]** |

**How it is priced and run**, for scale: Free, Individual $20/month, Business
$40 per user per month with a 25-seat minimum, Enterprise custom with
multi-region hosting; usage metered per token with "$0.75–2.00 per submittal
review" as the docs' own estimate ([pricing](https://www.nomic.ai/pricing),
[models and pricing](https://docs.nomic.ai/docs/models-and-pricing/overview))
**[documented]**. Models are Anthropic's and Google's plus Nomic's own parsing
and embedding models (same docs page) **[documented]**.

### 4c. Which of these a firm could build on Infora as a playbook — and what the builder would need

The board asked which of Nomic's agents could be built "as a playbook through
the stepped builder", and what the builder would have to offer. The honest
first answer is that **most of Nomic's catalogue is not an app in ADR-0056's
sense at all** — an app has tables people type into, screens over them, and
an agent producing an insight per run. Nomic's agents take a *document* in
and put a *marked-up document or a findings list* out. Three of them are
already Infora tools, or the beginning of one:

| Nomic agent | Nearest thing in Infora today | Buildable as a playbook? | What the builder would need to offer |
|---|---|---|---|
| Drawing Review / QA/QC Review | **The QA checker** (T-336, ADR-0053): a draft checked against the project style guide, the firm's own rules and the library, findings accepted one at a time | **Not as an app — as the checker's own growth.** The firm's checklist is what ADR-0054's Knowledge section already holds. Drawings are the gap: the checker reads documents, not sheets | A drawing (PDF sheet set) as a checkable thing, and findings anchored to a sheet position rather than a paragraph. That is a checker ticket, not an app-builder one |
| Project Research / RFI responses | **Ask** (grounded, cited, Lens-registered) and the document creator | **Not as an app.** Ask already answers a question over the library with citations; drafting the RFI response is the creator with an RFI as the document type | An RFI as a deliverable kind, and the incoming RFI as a source. Neither needs the app builder |
| Code Compliance of Drawings | Ask over the **authority corpus** (ADR-0023) — the standards and codes the project is bound by | **Partly, as a playbook.** A firm could define an app whose table is a *compliance register* — one row per check, each row citing a clause — with a run that fills it from a named drawing set. The judgement (which clauses apply) is the firm's IP, and that is a playbook's structure | Three things: **a document-input step** (a drawing set from the library or the sandbox, which ADR-0011's addendum allows the app to read as its viewer), **a connection to the authority corpus** as a declared requirement, and **an app table the findings land in** with a clause citation column. The PDF markup is an export (§8 — a file a person issues) |
| Submittal Review | Nothing today | **Yes, as a playbook — and it is the returns app's shape.** A contractor *submits* a package; the client's engineer *accepts or rejects* it; the decision is a record. That is ADR-0056 §2a's acceptance step with a document attached to the row instead of a figure | **A file column on an app table** (a submittal is a document, and today a row's `values` are typed scalars), the document-input step above, and a **marked-up PDF as the run's output** alongside the insight row. Findings "tied to a spec section" need the library reference as a column type |
| Firm-Wide Detail Search | Nothing; the firm's archive is not in Infora | **No.** This is search over a firm's whole drawing history in its own stores — component 7's connectors territory, not an app in a project | A connection to the firm's document store (ADR-0057, after deployment) and drawing-content indexing. Out of the builder's reach |
| BIM / IFC | **The extractor** (T-274): structured rows out of a document, with source and locator, reachable by nobody yet (`Q-049`) | **Partly.** Quantity take-offs are extraction; the `Q-049` question — where does the output land — has "an app table" as one of its named answers | Exactly `Q-049`'s ruling. If the answer is an app table, the extractor becomes the builder's document-input step for free |
| RFP Responses | The document creator over the firm's Knowledge section | **Not as an app.** A proposal is a document; the creator writes documents | Nothing from the builder |

**What this means for ADR-0056 §11's "Infora's own pre-built apps".** If
Infora supplies playbooks on the same shelf as a firm's own, the two the
research supports first are **a submittal register** (the returns app's
acceptance shape, with a document on the row) and **a compliance register**
(a table of checks each citing a clause, filled by a run over a drawing set).
Both need the same three additions to the builder — a document-input step, a
file column, a marked-up-file output — which §6 records as a finding rather
than a proposal, because none of them is in the slice as ticketed and the
owner's returns app needs none of them.

---

## 5. For each of ADR-0056's steps, the pattern the drawing starts from

T-437's "done when": name, per step, which product's pattern the drawing
should start from, or say none fits. The steps are the owner's list with the
table step and the two moments the ADR adds.

| Step | Start from | Why, and what to leave behind |
|---|---|---|
| **What the app is, and who it is open to** | **Infora's own sandbox scope picker** (ADR-0036, built) — no product pattern | Both products answer "who" with a share dialog after the fact, in terms of users and groups. Infora's audience is organisations on a ladder the product already draws. Retool's **Share** dialog (Use / Edit / Own per group) is the nearest and imports the single-firm model |
| **The tables** | **Retool Database's field editor** — a name, a type, **Nullable / Unique / Default value**, a table list beside open tables | The one place either product lets a person *design* a table rather than read one. Leave behind the spreadsheet grid of rows: at build time an Infora table is empty by rule (§10). **The acceptance question has no pattern anywhere** — draw it fresh, as the agent's question with the choice recorded in the form |
| **Data connections** | **Retool's new-builder Data tab** as a *list of declared resources* — and nothing of its forms | The list is right: a step that names what the app needs. The form is wrong for now: filling a connection is deferred to deployment (ADR-0057) and the credential's write-once entry has Lovable's "secure input in chat" as its later pattern |
| **The interface** | **Lovable's chat-plus-live-preview with Select elements**, which Retool's new builder copied as Selection mode | The agent writes the screen from a description; the builder points at what to change. Leave behind: the Code tab (Infora's viewer-side code is the agent's, not the builder's), and any per-component permission — **who may open each screen** is a question with no pattern, asked by the agent |
| **How often it runs** | **Lovable's Jobs view** — the schedule in words, **Last run**, a run history with **Succeeded / Failed / Running** — plus **Retool's gate** that nothing runs on a schedule until a release is published | The best schedule screen of the three, and it is read-only in Lovable because the chat sets it — which fits a stepped flow where the form sets it. The publish gate belongs with §6's proposal |
| **Analysis and prompts** | **Nomic's three questions** — what it should do, what files it needs, what output it produces — laid out as **Retool Agents' Configuration** form (one instructions box, a test run beside it) | Nomic's shape is the closest thing to "what a run may touch" in words a non-engineer writes. Leave behind Retool's model picker and tools list: the model is the deployment tier's (ADR-0037) and the "tools" are the declared tables |
| **The agent's own prompts to the builder** (§2b) | **Lovable's Plan mode and Retool Assist's planning phase** for the *behaviour* — ask before acting — and **Infora's document creator's "Ask the agent"** pane for the *placement* | Neither product asks the wall's questions, because neither has a wall. What they show is that a builder tolerates questions in a planning moment and expects action afterwards. The drawing puts the agent in its own pane beside the steps, per the design rule that a tool acting on a thing is its own card |
| **Check and open** (a step the owner did not list) | **Retool's new-builder Publish modal** — a checklist, the name and where it lives, then publish | A read-back before three organisations can open the app. Lovable's automatic scan-before-publish is the same instinct |
| **The viewer's seat** (drawing 2) | **Retool's user mode** — the app at `/app/{name}` with no editor chrome, the last published version, **Use** cannot open the editor | Lovable's badge is the anti-pattern. Infora's viewer screen is whatever the agent wrote, framed by the shell; the seat difference needs no control at all (§4) |
| **The playbook shelf** (not drawn) | **Lovable's Remix dialog** — name, target workspace, **Include project history**, **Include custom knowledge** — with the data line already drawn the same way | Structure not data, in both products. A later drawing; T-438 excludes it |

---

## 6. Where the research pushes on the rulings — findings and proposals, kept apart

**Findings** (observations that change nothing by themselves):

- **F1. The stepped flow has no direct precedent; the market is chat-first.**
  Both builders are a conversation beside a running preview, with questions
  confined to a planning mode. This does not contradict ADR-0056 §2b (the
  builder "walked through" the wall's choices) — it says the walk is Infora's
  own design. The drawing keeps the steps as the spine and the agent beside
  them; whether the steps should instead be *filled in by* a chat is carried on
  the mockup as an open fork for the owner (since declined-for-now, 2026-09-06 — ADR-0056's addendum, revisited at T-446), not proposed here.
- **F2. The board's description of Nomic needs one correction.** "Not an app
  builder" is half right: Nomic sells pre-built agents *and* a plain-language
  workflow builder (§4a). Recorded on T-437's moved record; no ADR touches it.
- **F3. Most of Nomic's catalogue maps to Infora's existing tools, not to the
  app builder** (§4c). Drawing review is the checker's growth; project research
  is Ask; RFP drafting is the creator. Two are buildable as playbooks — a
  submittal register and a compliance register — and both need three things
  the slice does not ticket: a document-input step, a file column on an app
  table, and a marked-up file as a run output. Named for a later session, not
  proposed, because the owner's acceptance test (T-446) is the returns app,
  which needs none of them.
- **F4. Nobody else runs a schedule as a named person.** Retool refuses to run
  a scheduled workflow under an access policy because it cannot attribute the
  run; Lovable runs jobs as the backend. ADR-0056 §5 is alone, and the research
  found nothing against it.
- **F5. The playbook rule is the market's own.** Lovable's remix and Retool's
  cross-space copy carry schema and strip data, secrets and permissions. §10
  as amended on 2026-09-06 needs no defence from this direction.
- **F6. Infora's split of screens (browser) from analysis (server) protects
  a playbook's prompts but not its screens.** In Retool, a Use-only user
  cannot open the editor; in Infora, the viewer's browser receives the screen
  code the agent wrote (§11), though never the analysis prompts, which run in
  Infora's built parts. For a consultancy's playbook, the IP that matters is
  the prompts and the table design, not the screen markup. Stated so nobody
  discovers it later as a surprise.

**PROPOSED — for the owner, never applied here — until it was: adopted 2026-09-06 as ADR-0056's addendum ruling 2 (pointer added in review):**

- **P1. Draft versus published, inside one app instance** *(proposed
  2026-09-06 from T-437; touches ADR-0056 §11 and drawer 9's `apps` row).*
  Retool's release model — editors work on a draft, users see the last
  published version, a group can be let in early — answers a question
  ADR-0056 leaves open: **what a contractor sees while the client's builder is
  mid-edit.** Today drawer 9 has a single `definition` with a version counter,
  so an edit is live the moment it is saved, in a project where three
  organisations may be filling in the form. Proposal: an app instance's
  definition has a *working* version and a *published* version; viewers see
  the published one; "Check and open" (the seventh step in drawing 1) is the
  act of publishing; and the schedule runs only against a published
  definition, which is Retool's gate. The cost is one more version column and
  a publish act; the alternative is a builder who cannot change a live form
  without its users seeing half an edit. **The drawing shows step 7 as if this
  were ruled and says so in its notes; nothing is built on it.**
- **P2. A contractor's draft row is private until submitted** *(proposed
  2026-09-06 from drawing 2, not from the research; touches ADR-0056 §2).*
  The rule as ruled reads a row by its entering organisation *and* the owner,
  and a draft is a row — so the client sees a return the contractor has not
  finished. No product researched has a submission state to compare against;
  the nearest Infora analogue is the sandbox, where unfinished work is the
  author's until it is promoted. Proposal: a row in `draft` state is read by
  its entering organisation only; `submitted` and later states by the owner as
  well. Drawn the ruled way on the mockup, quietly, with this as its first
  fork. **Not applied at writing; adopted 2026-09-06 as ADR-0056's addendum ruling 3 (pointer added in review).**

---

## 7. Honesty appendix

**Method.** Three research passes on 2026-09-06 — one per product — over the
vendors' own documentation and product pages, fetched and read by machine,
followed by my own re-fetch of the pages behind every claim this document
leans on (Retool's May 2026 changelog and app-builder concepts page, its
permission levels and Assist pages, its classic IDE page; Lovable's remix,
Plan mode, Jobs and Database pages; Nomic's November 2025 announcement, its
platform page, its workflow-builder and drawing-review docs). Where a claim
rests on a search-result snippet rather than a fetched page, it says
**[documented, snippet only]**. No product was used hands-on; no account was
created; no image was downloaded — every "screenshot" above is the page that
carries one. There is no folder of working files behind this document: what
is cited is what exists.

**Could not verify.**

1. Whether Retool's *new* builder's agent asks clarifying questions before it
   builds (only the human-in-the-loop approval for data-modifying functions is
   documented). Assist's questions are documented, and Assist is being removed.
2. What else Retool's classic **Get started** dialog offers beyond a blank
   canvas; the editor's URL pattern; whether Retool app templates ship with
   sample data.
3. Lovable's live home page (HTTP 403) and pricing table (only the FAQ
   rendered); plan prices in circulation come from third parties. The exact
   dates of the Agent→Build and Chat→Plan renames and of Visual edits →
   Select elements.
4. The mechanism under Lovable's Jobs (pg_cron or otherwise); whether Lovable
   Cloud's auth scaffolds any role at all.
5. Nomic: whether on-premises is a shipping option or "customer-managed
   cloud"; any customer beyond Aurecon and Arcadis; the round's size; whether
   Procore is a live connector (listed on a glossary page, absent from the
   docs' connector list); the "380+ codes" versus "102 fully supported" figures
   on one page.

**Where the sources disagree, or are dated.**

- **Retool has three generations of "the AI builds it"**: marketing's
  **AppGen** ("Production-ready apps from a prompt"), the classic editor's
  **Assist** (beta October 2025, removed 30 September 2026), and the **new app
  builder** (May 2026, still tagged Beta). Anything written before May 2026
  says "app" for what is now a "classic app".
- **Retool's mode names drift**: "preview mode", "view mode", "user mode" and
  (2023) "presentation mode" are one thing; the shortcut is given as Ctrl Alt
  Enter and Option Command Enter.
- **Lovable's modes**: Default + Chat (April 2025) → Agent added (June 2025)
  → Build + Plan (2026 docs). "Default mode" has vanished. Its clarifying
  questions are marketed as general ("when Lovable needs clarification, it
  will ask") and documented as Plan-mode only ("may ask").
- **Lovable's security scan**: the 2025 scanner criticised in the CVE
  write-up checked that *a* policy existed; the 2026 documented **Basic /
  Deep** scan is a different product, and "RLS by default" is a post-incident
  claim about enablement, not correctness.
- **Lovable Cloud versus Supabase**: pre-September-2025 material treats
  Supabase as *the* backend; since then Cloud is the default and Jobs, Users,
  Secrets and policy views are Cloud-only, with external Supabase deferring to
  Supabase's own dashboard.
- **Nomic's pricing** appears three ways across its own site and third
  parties (per-seat with a 25-seat floor on the pricing page; flat monthly
  tiers on a glossary page; credits on a third-party listing). The pricing
  page is taken as current. Its connector list differs between the platform
  page's logo wall and the docs' configurable sources; the docs are taken as
  what works today.
- **Nomic's pivot date**: the first AEC-titled post is November 2025, but
  Aurecon's "four-year partnership" implies the work began around 2022.

**Age caveat.** Everything here is as of 6 September 2026. Retool's classic
Assist disappears within the month; Lovable's changelog shows monthly feature
changes; Nomic's funding round was three days old at the time of writing.
Re-verify a specific claim before relying on it.
