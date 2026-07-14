// Personal settings (T-092, from the 2026-07-09 QA review): the user chip
// opens this page — profile facts, an editable display name, a saved theme,
// the skeleton password change (useful as the break-glass path even after
// Entra SSO lands), and sign out (T-111). Every write here is self-scoped.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, SectionLabel } from '@infora/ui';
import { api, RequestError } from '../api';
import { useSession } from '../session';

export function SettingsScreen() {
  const { me, refresh } = useSession();
  const navigate = useNavigate();

  const [name, setName] = useState(me.name);
  const [nameState, setNameState] = useState<'idle' | 'saved'>('idle');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordState, setPasswordState] = useState<'idle' | 'saved' | 'wrong' | 'short'>('idle');

  const theme = me.preferences.theme ?? 'light';

  async function saveName(event: FormEvent) {
    event.preventDefault();
    if (name.trim() === '' || name.trim() === me.name) return;
    await api.patchMe({ name: name.trim() });
    await refresh();
    setNameState('saved');
  }

  async function setTheme(next: 'light' | 'dark') {
    if (next === theme) return;
    await api.patchMe({ preferences: { theme: next } });
    await refresh(); // the gate applies it on <html>
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 8) {
      setPasswordState('short');
      return;
    }
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setPasswordState('saved');
    } catch (error) {
      if (error instanceof RequestError && error.status === 401) setPasswordState('wrong');
      else throw error;
    }
  }

  // T-111 — the full reload lands on the login screen via the session gate
  async function signOut() {
    await api.logout();
    window.location.assign('/');
  }

  const field = {
    font: 'inherit',
    fontSize: 13,
    border: '1px solid var(--hairline)',
    borderRadius: 6,
    padding: '7px 10px',
    background: 'var(--panel)',
    color: 'var(--ink)',
  } as const;

  return (
    <div className="main" style={{ marginLeft: 0 }}>
      <div className="topbar">
        <span className="crumb">
          <b>Personal settings</b> · {me.organisationName}
        </span>
        <div className="right">
          <Button size="sm" variant="quiet" onClick={() => void navigate('/')}>
            ← Back to workspace
          </Button>
        </div>
      </div>

      <div className="content" style={{ maxWidth: 720 }}>
        <h1 className="page">Personal settings</h1>
        <p className="page-sub">Your own display and sign-in choices — nothing here affects access.</p>

        <SectionLabel>Profile</SectionLabel>
        <Card>
          <div style={{ padding: 18, display: 'grid', gap: 10, fontSize: 13 }}>
            <div>
              <span style={{ color: 'var(--muted)' }}>Email · </span>
              {/* identity, not a setting — sign-in moves to Entra SSO in production */}
              <span>{me.email}</span>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Organisation · </span>
              <span>{me.organisationName}</span>
            </div>
            <form onSubmit={saveName} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label htmlFor="display-name" style={{ color: 'var(--muted)' }}>
                Display name
              </label>
              <input
                id="display-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameState('idle');
                }}
                style={{ ...field, flex: 1 }}
              />
              <Button size="sm" variant="primary" type="submit">
                Save
              </Button>
              {nameState === 'saved' && <Badge tone="green">Saved</Badge>}
            </form>
          </div>
        </Card>

        <SectionLabel>Appearance</SectionLabel>
        <Card>
          <div style={{ padding: 18, display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <span style={{ color: 'var(--muted)' }}>Theme</span>
            <Button
              size="sm"
              variant={theme === 'light' ? 'primary' : 'quiet'}
              onClick={() => void setTheme('light')}
            >
              ☀ Light
            </Button>
            <Button
              size="sm"
              variant={theme === 'dark' ? 'primary' : 'quiet'}
              onClick={() => void setTheme('dark')}
            >
              ☾ Dark
            </Button>
            <span style={{ color: 'var(--muted)' }}>saved to your profile — follows you between devices</span>
          </div>
        </Card>

        <SectionLabel>Password</SectionLabel>
        <Card>
          <form onSubmit={changePassword} style={{ padding: 18, display: 'grid', gap: 10, maxWidth: 420 }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 12.5, color: 'var(--muted)' }}>
              Current password
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setPasswordState('idle');
                }}
                style={field}
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12.5, color: 'var(--muted)' }}>
              New password (min 8 characters)
              <input
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPasswordState('idle');
                }}
                style={field}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button size="sm" variant="primary" type="submit">
                Change password
              </Button>
              {passwordState === 'saved' && <Badge tone="green">Changed</Badge>}
              {passwordState === 'wrong' && <Badge tone="red">Current password incorrect</Badge>}
              {passwordState === 'short' && <Badge tone="red">New password too short</Badge>}
            </div>
          </form>
        </Card>

        <SectionLabel>Session</SectionLabel>
        <Card>
          <div style={{ padding: 18, display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}>
            <Button size="sm" variant="danger" onClick={() => void signOut()}>
              Sign out
            </Button>
            <span style={{ color: 'var(--muted)' }}>
              Ends this session on this device — you land back at the login screen.
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
