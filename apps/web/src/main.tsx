import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
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
      { path: 'review/:containerId', element: <CycleScreen /> },
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
