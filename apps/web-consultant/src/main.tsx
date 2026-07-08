import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import '@infora/ui/styles.css';
import { SessionGate } from './session';
import { AskScreen } from './screens/ask';
import { EditorScreen } from './screens/editor';
import { EmptyState, ProjectHome, ProjectShell } from './screens/project';
import { SandboxScreen } from './screens/sandbox';
import { WorkItemAuditScreen } from './screens/work-item';
import { WorkspaceLanding } from './screens/workspace';

const router = createBrowserRouter([
  { path: '/', element: <WorkspaceLanding /> },
  {
    path: '/projects/:projectId',
    element: <ProjectShell />,
    children: [
      { index: true, element: <ProjectHome /> },
      { path: 'ask', element: <AskScreen /> },
      { path: 'editor', element: <EditorScreen /> },
      { path: 'editor/:documentId', element: <EditorScreen /> },
      {
        path: 'documents',
        element: <EmptyState title="Documents" note="The library view arrives with its wiring." />,
      },
      {
        path: 'review',
        element: (
          <EmptyState
            title="Review"
            note="Review cycles arrive with the document-management slice (ruled 2026-07-06)."
          />
        ),
      },
      { path: 'sandbox', element: <SandboxScreen /> },
      { path: 'work-items/:workItemId', element: <WorkItemAuditScreen /> },
      {
        path: 'workflows',
        element: (
          <EmptyState
            title="Workflows"
            note="Workflow launch beyond the chat/draft path is post-skeleton (ruled 2026-07-06)."
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
