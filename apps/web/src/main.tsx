import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import '@infora/ui/styles.css';
import { SessionGate } from './session';
import { AskScreen } from './screens/ask';
import { EditorScreen } from './screens/editor';
import { HistoryScreen } from './screens/history';
import { LibraryScreen } from './screens/library';
import { EmptyState, ProjectHome, ProjectShell } from './screens/project';
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
      {
        path: 'tools',
        element: (
          <EmptyState
            title="Tools"
            note="Infora's standard tools, your organisation's own, and the ones you build — each tool runs a codified workflow. Tool launch beyond the chat/draft path is post-skeleton (ruled 2026-07-06); the builder's shape is on the grill tracker."
          />
        ),
      },
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
