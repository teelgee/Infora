import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider, useParams } from 'react-router';
import '@infora/ui/styles.css';
import { SessionGate } from './session';
import { AppScreen, AppsScreen } from './screens/apps';
import { AppBuilderScreen } from './screens/app-builder';
import { AskScreen } from './screens/ask';
import { EditorScreen } from './screens/editor';
import { ExternalDocumentScreen } from './screens/external-document';
import { HistoryScreen } from './screens/history';
import { KnowledgeScreen } from './screens/knowledge';
import { NewStyleGuideScreen, StyleGuideScreen } from './screens/style-guide';
import { LibraryScreen } from './screens/library';
import { DocumentScreen } from './screens/document';
import { ProjectHome, ProjectShell } from './screens/project';
import { DocumentCreatorScreen, QaCheckerScreen, ToolsScreen } from './screens/tools';
import { NotificationsScreen } from './screens/notifications';
import { PlanScreen } from './screens/plan';
import { SchemaScreen } from './screens/schema';
import { CycleScreen } from './screens/cycle';
import { DeliverableStatusScreen } from './screens/deliverable-status';
import { ReviewRecordScreen } from './screens/review-record';
import { ReviewScreen } from './screens/review';
import { SandboxScreen } from './screens/sandbox';
import { EditingPaneScreen } from './screens/editing-pane';
import { SettingsScreen } from './screens/settings';
import { WorkItemScreen } from './screens/work-item';
import { WorkspaceLanding, WorkspaceSection } from './screens/workspace';

// T-431 (ADR-0055) — the recipient's page. OUTSIDE the project shell and, at
// the foot of this file, outside the session gate: whoever holds this link has
// no Infora account, so there is no session to resolve and nothing else in the
// application for them to reach.
const externalPath = '/external/';

const router = createBrowserRouter([
  { path: '/', element: <WorkspaceLanding /> },
  { path: '/external/:token', element: <ExternalDocumentScreen /> },
  { path: '/settings', element: <SettingsScreen /> },
  { path: '/workspace/:section', element: <WorkspaceSection /> },
  {
    path: '/projects/:projectId',
    element: <ProjectShell />,
    children: [
      { index: true, element: <ProjectHome /> },
      { path: 'ask', element: <AskScreen /> },
      { path: 'editor', element: <EditorScreen /> },
      { path: 'editor/:documentId', element: <EditorScreen /> },
      { path: 'plan', element: <PlanScreen /> },
      { path: 'plan/scheme', element: <SchemaScreen /> },
      { path: 'documents', element: <LibraryScreen /> },
      // T-457 — the document page: one page per container, where every row,
      // chip and link about a deliverable lands
      { path: 'documents/:containerId', element: <DocumentScreen /> },
      { path: 'notifications', element: <NotificationsScreen /> },
      { path: 'review', element: <ReviewScreen /> },
      // T-348 — the schedule click-through lands on the status page; the
      // round tray (the review itself) is one deliberate step deeper
      { path: 'review/:containerId', element: <DeliverableStatusScreen /> },
      { path: 'review/:containerId/cycle', element: <CycleScreen /> },
      // T-375 — the review record: one appended table spanning every round, a
      // place you can send someone rather than a view of a screen. Drawn as its
      // own pane in the approved mockup; the placement fork it raised is Q-041.
      { path: 'review/:containerId/record', element: <ReviewRecordScreen /> },
      { path: 'sandbox', element: <SandboxScreen /> },
      // T-454 — an uploaded Office file open in the browser editor
      { path: 'sandbox/edit/:documentId', element: <EditingPaneScreen /> },
      { path: 'history', element: <HistoryScreen /> },
      { path: 'work-items/:workItemId', element: <WorkItemScreen /> },
      // T-334 — the Tools section stops being an empty state. The 2026-07-06
      // "tool launch is post-skeleton" deferral expired with ADR-0053; the
      // builder (org-built and user-built tools) is `Q-014` and stays post-V1.
      { path: 'tools', element: <ToolsScreen /> },
      // T-335 — the first tool that lives in it
      { path: 'tools/document-creation', element: <DocumentCreatorScreen /> },
      // T-336 — the checker's launcher. The EDITOR route is this route with its
      // first step pre-filled (`?documentId=`), not a second flow: one run
      // shape, and one place the scope is stated (ADR-0053 §1).
      { path: 'tools/qa-check', element: <QaCheckerScreen /> },
      // T-450 (ADR-0058 decision 2) — apps leave the Tools shelf for a section
      // of their own, beside it: a tool is something you run, an app somewhere
      // you go. The section, one app, and the building screen.
      { path: 'apps', element: <AppsScreen /> },
      { path: 'apps/:appId', element: <AppScreen /> },
      // the building screen: a route of its own rather than a mode of the app
      // screen — the app screen is what its people open, and the building
      // screen is where its working copy is edited by the people who may
      { path: 'apps/:appId/build', element: <AppBuilderScreen /> },
      // the T-440–T-449 addresses under `tools/`, kept as redirects so a link
      // somebody saved still lands on the app rather than on nothing
      { path: 'tools/apps/:appId', element: <MovedApp /> },
      { path: 'tools/apps/:appId/build', element: <MovedApp build /> },
      // T-422 (ADR-0054 decision 1) — Knowledge: the two shelves. Its own rail
      // item rather than a panel in Settings, which is personal.
      { path: 'knowledge', element: <KnowledgeScreen /> },
      // T-424/T-425 — the rules workbench: create, then review, then save. One
      // route, because the review step is not a place you can arrive at: it is
      // what the extraction hands back, and it is stored nowhere.
      { path: 'knowledge/style-guides/new', element: <NewStyleGuideScreen /> },
      { path: 'knowledge/style-guides/:styleGuideId', element: <StyleGuideScreen /> },
    ],
  },
]);

/** T-450 — an app address from before apps left the Tools shelf, sent on to
 * where the app now lives. */
function MovedApp(props: { build?: boolean }) {
  const { projectId, appId } = useParams();
  return <Navigate replace to={`/projects/${projectId}/apps/${appId}${props.build ? '/build' : ''}`} />;
}

// The gate is applied here rather than around the whole tree, because the
// external document is the one route that must render for somebody who is not
// logged in — wrapping it would send a landowner to a login screen for an
// account they will never have.
const isExternal = window.location.pathname.startsWith(externalPath);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isExternal ? (
      <RouterProvider router={router} />
    ) : (
      <SessionGate>
        <RouterProvider router={router} />
      </SessionGate>
    )}
  </StrictMode>,
);
