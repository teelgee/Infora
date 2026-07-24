// T-175 — document presence (ADR-0039 real-time, first cut). While the editor
// is open on a document, heartbeat that we are here and poll who else is; render
// an avatar stack. A polling first step of the deferred real-time half (a full
// live-cursor / CRDT sync engine remains later).
import { useEffect, useState } from 'react';
import type { PresenceEntry } from '@infora/contracts';
import { api } from './api';

export function Presence(props: { documentId: string }) {
  const [people, setPeople] = useState<PresenceEntry[]>([]);

  useEffect(() => {
    let alive = true;
    const beat = () => void api.heartbeatPresence(props.documentId).catch(() => {});
    const poll = () =>
      void api
        .documentPresence(props.documentId)
        .then((r) => alive && setPeople(r.items))
        .catch(() => {});
    beat();
    poll();
    const b = window.setInterval(beat, 15000);
    const p = window.setInterval(poll, 10000);
    return () => {
      alive = false;
      window.clearInterval(b);
      window.clearInterval(p);
    };
  }, [props.documentId]);

  if (people.length === 0) return null;
  return (
    <span className="presence-stack" title={`${people.map((p) => p.name).join(', ')} — also here`}>
      {people.slice(0, 4).map((p) => (
        <span key={p.participantId} className="presence-avatar" title={p.name}>
          {p.initials}
        </span>
      ))}
      {people.length > 4 && <span className="presence-avatar presence-more">+{people.length - 4}</span>}
    </span>
  );
}
