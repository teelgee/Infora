// Session gate: /me decides between the login screen and the app. The
// requester is resolved server-side (contracts principle 3) — this holds
// only the returned identity for display and routing.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { MeResponse } from '@infora/contracts';
import { api, RequestError } from './api';
import { Login } from './screens/login';

const SessionContext = createContext<MeResponse | null>(null);

export function useMe(): MeResponse {
  const me = useContext(SessionContext);
  if (me === null) throw new Error('useMe outside an authenticated session');
  return me;
}

export function SessionGate(props: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [state, setState] = useState<'loading' | 'anonymous' | 'ready'>('loading');

  const load = useCallback(async () => {
    try {
      setMe(await api.me());
      setState('ready');
    } catch (error) {
      if (error instanceof RequestError && error.status === 401) setState('anonymous');
      else throw error;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === 'loading') return null;
  if (state === 'anonymous') return <Login onLoggedIn={load} />;
  return <SessionContext.Provider value={me}>{props.children}</SessionContext.Provider>;
}
