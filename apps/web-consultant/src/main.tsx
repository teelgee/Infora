import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import '@infora/ui/styles.css';
import { SessionGate } from './session';
import { EmptyState, ProjectHome, ProjectShell } from './screens/project';
import { SandboxScreen } from './screens/sandbox';
import { WorkspaceLanding } from './screens/workspace';

const router = createBrowserRouter([
  { path: '/', element: <WorkspaceLanding /> },
  {
    path: '/projects/:projectId',
    element: <ProjectShell />,
    children: [
      { index: true, element: <ProjectHome /> },
      {
        path: 'ask',
        element: <EmptyState title="Ask" note="The chat surface arrives with T-052." />,
      },
      {
        path: 'editor',
        element: <EmptyState title="Editor" note="The document canvas arrives with T-082." />,
      },
      {
        path: 'editor/:documentId',
        element: <EmptyState title="Editor" note="The document canvas arrives with T-082." />,
      },
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
