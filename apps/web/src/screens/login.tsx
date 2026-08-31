// Skeleton session login (T-021's endpoint; plan.md's recorded decision).
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Card } from '@infora/ui';
import { api, RequestError } from '../api';

export function Login(props: { onLoggedIn: () => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(email, password);
      await props.onLoggedIn();
    } catch (err) {
      setError(
        err instanceof RequestError && err.status === 401
          ? 'That email and password did not match.'
          : 'Something went wrong — try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ margin: 'auto', width: 360 }}>
      <div className="wordmark" style={{ textAlign: 'center', fontSize: 28, paddingBottom: 24 }}>
        In<span>fora</span>
      </div>
      <Card>
        <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 12.5, fontWeight: 600 }}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
              style={fieldStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 12.5, fontWeight: 600 }}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              style={fieldStyle}
            />
          </label>
          {error !== null && (
            <div className="withheld" style={{ margin: 0 }}>
              {error}
            </div>
          )}
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  font: 'inherit',
  fontWeight: 400,
  padding: '9px 12px',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--control-sm)',
  background: 'var(--surface-pane)',
};
