// Session gate: /me decides between the login screen and the app. The
// requester is resolved server-side (contracts principle 3) — this holds
// only the returned identity for display and routing. The saved theme
// preference (T-092) is applied here, on <html>, for every screen.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { MeResponse } from '@infora/contracts';
import { api, RequestError } from './api';
import { Login } from './screens/login';

type Session = { me: MeResponse; refresh: () => Promise<void> };

const SessionContext = createContext<Session | null>(null);

export function useMe(): MeResponse {
  return useSession().me;
}

/** The full session — `refresh` re-reads /me after a settings write (T-092). */
export function useSession(): Session {
  const session = useContext(SessionContext);
  if (session === null) throw new Error('useSession outside an authenticated session');
  return session;
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

  useEffect(() => {
    document.documentElement.dataset['theme'] = me?.preferences.theme ?? 'light';
  }, [me]);

  if (state === 'loading') return null;
  if (state === 'anonymous') return <Login onLoggedIn={load} />;
  return (
    <SessionContext.Provider value={{ me: me!, refresh: load }}>
      {props.children}
    </SessionContext.Provider>
  );
}
