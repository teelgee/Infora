// T-468 — clicking a citation lands on the passage, on the document page.
//
// The document page is addressed by container, and a citation carries a
// version, so the container is looked up first (the passage read the hover card
// already made is cached; otherwise the version read). If the lookup fails the
// caller's fallback (the older source panel/modal) opens instead — never a dead
// click.
import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api } from './api';
import { loadPassage } from './source-card';

export function passageLocation(projectId: string, containerId: string, versionId: string, chunkId?: string): string {
  const query = new URLSearchParams({ version: versionId });
  if (chunkId !== undefined) query.set('passage', chunkId);
  return `/projects/${projectId}/documents/${containerId}?${query.toString()}`;
}

export function useOpenCitation(fallback?: (versionId: string, chunkId?: string) => void) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  return useCallback(
    (versionId: string, chunkId?: string) => {
      if (projectId === undefined) {
        fallback?.(versionId, chunkId);
        return;
      }
      const container =
        chunkId !== undefined
          ? loadPassage(versionId, chunkId).then((read) => read.containerId)
          : api.version(versionId).then((read) => read.containerId);
      container.then(
        (containerId) => void navigate(passageLocation(projectId, containerId, versionId, chunkId)),
        () => fallback?.(versionId, chunkId),
      );
    },
    [projectId, navigate, fallback],
  );
}
