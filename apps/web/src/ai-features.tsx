// T-463 — which AI features this project has switched off, for the launchers.
//
// *In plain terms: a feature the owner has turned off for the project is not
// shown anywhere a person could start it — the button is simply not there.*
//
// One read per project, shared by every screen through a small cache; the
// transparency page refreshes it when a switch is thrown. The server refuses
// the endpoint regardless, so this is the courtesy of absence, not the gate.
import { useEffect, useState } from 'react';
import type { AiFeatureKey, AiTransparencyResponse } from '@infora/contracts';
import { api } from './api';

const cache = new Map<string, Set<AiFeatureKey>>();
const listeners = new Set<() => void>();

export function offFeaturesFrom(table: AiTransparencyResponse): Set<AiFeatureKey> {
  return new Set(table.features.filter((f) => !f.enabled).map((f) => f.key));
}

/** the transparency page calls this after a switch so every launcher follows */
export function rememberAiFeatures(projectId: string, table: AiTransparencyResponse): void {
  cache.set(projectId, offFeaturesFrom(table));
  for (const fn of listeners) fn();
}

/** the set of features switched off on the project — empty until known */
export function useAiFeaturesOff(projectId: string): Set<AiFeatureKey> {
  const [off, setOff] = useState<Set<AiFeatureKey>>(() => cache.get(projectId) ?? new Set());
  useEffect(() => {
    const sync = () => setOff(cache.get(projectId) ?? new Set());
    listeners.add(sync);
    if (!cache.has(projectId)) {
      void api
        .aiTransparency(projectId)
        .then((table) => rememberAiFeatures(projectId, table))
        .catch(() => cache.set(projectId, new Set()));
    } else {
      sync();
    }
    return () => {
      listeners.delete(sync);
    };
  }, [projectId]);
  return off;
}
