// T-484 — take the reference-intake spec's "T472-…" files back out of the seeded
// project, through the product's own doors and nothing else.
//
// *In plain terms: the intake spec adds practice standards to the library. This
// removes them the way the owner's organisation administrator would: reject a
// file nobody confirmed, withdraw a document still live, then remove the
// withdrawn document from the library for good (the owner's library-removal).*
//
// Scoped to the seeded project, by id, and to references starting "T472-".
import { ApiSession, SEEDED } from './api';

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
const PREFIX = 'T472-';

type Item = { containerId: string; documentReference: string; state: string };

export async function sweepReferenceIntake(): Promise<{ rejected: number; withdrawn: number; removed: number }> {
  // Rachel Bowen: the seeded owner organisation's admin, and a super user
  const api = await ApiSession.login(SEEDED.owner);
  try {
    const me = await api.get<{ participants: Array<{ projectId: string; projectName: string }> }>('/me');
    const projectId = me.participants.find((p) => p.projectName === PROJECT)!.projectId;
    const counts = { rejected: 0, withdrawn: 0, removed: 0 };

    // files uploaded and never confirmed
    const proposed = await api.get<{ items: Array<{ id: string; originalFilename: string }> }>(
      `/projects/${projectId}/reference-intake?status=proposed&pageSize=200`,
    );
    for (const row of proposed.items.filter((r) => r.originalFilename.startsWith(PREFIX))) {
      await api.post(`/projects/${projectId}/reference-intake/${row.id}/reject`, {});
      counts.rejected += 1;
    }

    // library documents, any state, found by their reference (not by page)
    const mine: Item[] = [];
    for (let page = 1; ; page += 1) {
      const res = await api.get<{ items: Item[]; total: number }>(
        `/projects/${projectId}/library/search?q=${PREFIX}&state=any&pageSize=200&page=${page}`,
      );
      mine.push(...res.items.filter((i) => i.documentReference.startsWith(PREFIX)));
      if (res.items.length === 0 || page * 200 >= res.total) break;
    }
    for (const item of mine) {
      if (item.state === 'live') {
        await api.post(`/containers/${item.containerId}/withdrawal`, { reason: 'removed by the reference-intake spec (T-484)' });
        counts.withdrawn += 1;
      }
      await api.post(`/projects/${projectId}/library-removals`, {
        containerId: item.containerId,
        confirmation: item.documentReference,
      });
      counts.removed += 1;
    }
    return counts;
  } finally {
    await api.dispose();
  }
}
