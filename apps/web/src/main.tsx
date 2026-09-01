import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import '@infora/ui/styles.css';
import { SessionGate } from './session';
import { AskScreen } from './screens/ask';
import { EditorScreen } from './screens/editor';
import { HistoryScreen } from './screens/history';
import { KnowledgeScreen } from './screens/knowledge';
import { LibraryScreen } from './screens/library';
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
import { SettingsScreen } from './screens/settings';
import { WorkItemScreen } from './screens/work-item';
import { WorkspaceLanding, WorkspaceSection } from './screens/workspace';

const router = createBrowserRouter([
  { path: '/', element: <WorkspaceLanding /> },
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
      // T-422 (ADR-0054 decision 1) — Knowledge: the two shelves. Its own rail
      // item rather than a panel in Settings, which is personal.
      { path: 'knowledge', element: <KnowledgeScreen /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionGate>
      <RouterProvider router={router} />
    </SessionGate>
  </StrictMode>,
);
