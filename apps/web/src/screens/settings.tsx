// Personal settings (T-092, from the 2026-07-09 QA review): the user chip
// opens this page — profile facts, an editable display name, a saved theme,
// the skeleton password change (useful as the break-glass path even after
// Entra SSO lands), and sign out (T-111). Every write here is self-scoped —
// except the Administration panel (T-117, ADR-0033), shown to org admins
// only: enrolling and removing the organisation's OWN people on its
// projects, always inside the owner-granted ceiling.
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import type {
  ConflictExclusionRecord,
  ListConflictAttestationsResponse,
  OrgUser,
  RetrospectiveConflict,
  RosterEntry,
} from '@infora/contracts';
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

  const field = fieldStyle;

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
          <div style={{ padding: 16, display: 'grid', gap: 10, fontSize: 13 }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Email · </span>
              {/* identity, not a setting — sign-in moves to Entra SSO in production */}
              <span>{me.email}</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Organisation · </span>
              <span>{me.organisationName}</span>
            </div>
            <form onSubmit={saveName} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label htmlFor="display-name" style={{ color: 'var(--text-muted)' }}>
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
              {nameState === 'saved' && <Badge tone="success">Saved</Badge>}
            </form>
          </div>
        </Card>

        <SectionLabel>Appearance</SectionLabel>
        <Card>
          <div style={{ padding: 16, display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <span style={{ color: 'var(--text-muted)' }}>Theme</span>
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
            <span style={{ color: 'var(--text-muted)' }}>saved to your profile — follows you between devices</span>
          </div>
        </Card>

        <SectionLabel>Password</SectionLabel>
        <Card>
          <form onSubmit={changePassword} style={{ padding: 16, display: 'grid', gap: 10, maxWidth: 420 }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 12.5, color: 'var(--text-muted)' }}>
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
            <label style={{ display: 'grid', gap: 4, fontSize: 12.5, color: 'var(--text-muted)' }}>
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
              {passwordState === 'saved' && <Badge tone="success">Changed</Badge>}
              {passwordState === 'wrong' && <Badge tone="danger">Current password incorrect</Badge>}
              {passwordState === 'short' && <Badge tone="danger">New password too short</Badge>}
            </div>
          </form>
        </Card>

        {me.orgRole === 'admin' && <AdministrationPanel />}
        {me.orgRole === 'admin' && <ConflictRegisterPanel />}
        {me.participants.some((p) => p.membershipRole === 'owner') && <AttestationPanel />}

        <SectionLabel>Session</SectionLabel>
        <Card>
          <div style={{ padding: 16, display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}>
            <Button size="sm" variant="danger" onClick={() => void signOut()}>
              Sign out
            </Button>
            <span style={{ color: 'var(--text-muted)' }}>
              Ends this session on this device — you land back at the login screen.
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}

const fieldStyle = {
  font: 'inherit',
  fontSize: 13,
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--control-sm)',
  padding: '7px 10px',
  background: 'var(--surface-pane)',
  color: 'var(--text-primary)',
} as const;

// T-117 (ADR-0033) — the Administration panel: an org admin staffs their
// organisation's seat on each project — enrol from the org's own users,
// remove (the interval closes; the roster keeps the row for attribution).
// Membership propose/confirm arrives with the owner surfaces (T-119).
function AdministrationPanel() {
  const { me } = useSession();
  const [projectId, setProjectId] = useState(me.participants[0]?.projectId ?? '');
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [pickedUser, setPickedUser] = useState('');

  useEffect(() => {
    void api.orgUsers().then((res) => setOrgUsers(res.items));
  }, []);
  useEffect(() => {
    if (projectId) void api.participants(projectId).then((res) => setRoster(res.items));
  }, [projectId]);

  const ownLive = roster.filter((r) => r.organisationId === me.organisationId && r.removedAt === null);
  const enrollable = orgUsers.filter((u) => !ownLive.some((r) => r.userId === u.userId));

  async function enrol() {
    if (!pickedUser || !projectId) return;
    await api.enrolParticipant(projectId, pickedUser);
    setPickedUser('');
    setRoster((await api.participants(projectId)).items);
  }

  async function remove(participantId: string) {
    await api.removeParticipant(projectId, participantId);
    setRoster((await api.participants(projectId)).items);
  }

  return (
    <>
      <SectionLabel>Administration</SectionLabel>
      <Card>
        <div style={{ padding: 16, display: 'grid', gap: 12, fontSize: 13 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Project</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={fieldStyle}>
              {me.participants.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {p.projectName}
                </option>
              ))}
            </select>
            <span style={{ color: 'var(--text-muted)' }}>
              your organisation's people on this project — the owner opens the seat, you staff it
            </span>
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {ownLive.map((r) => (
              <div key={r.participantId} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ flex: 1 }}>{r.name}</span>
                <Button size="sm" variant="quiet" onClick={() => void remove(r.participantId)}>
                  Remove
                </Button>
              </div>
            ))}
            {ownLive.length === 0 && <span style={{ color: 'var(--text-muted)' }}>No one enrolled yet.</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={pickedUser} onChange={(e) => setPickedUser(e.target.value)} style={fieldStyle}>
              <option value="">Add a colleague…</option>
              {enrollable.map((u) => (
                <option key={u.userId} value={u.userId}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
            <Button size="sm" variant="primary" onClick={() => void enrol()} disabled={!pickedUser}>
              Enrol
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}

// T-246 (ADR-0046) — the conflict register. An org admin declares this firm's
// OWN ethical walls: holding one scheme bars holding another. Two grains —
// a named person (the default, because a firm legitimately acts on both sides
// behind an internal wall with different teams) or the whole organisation.
//
// The register never leaves this organisation. No project owner and no other
// firm reads it, because it reveals which of this firm's people are walled
// from what, which is close to revealing its engagements.
function ConflictRegisterPanel() {
  const { me } = useSession();
  const [items, setItems] = useState<ConflictExclusionRecord[]>([]);
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  const [grain, setGrain] = useState<'individual' | 'organisation'>('individual');
  const [subjectUserId, setSubjectUserId] = useState('');
  const [projectAId, setProjectAId] = useState('');
  const [projectBId, setProjectBId] = useState('');
  const [reason, setReason] = useState('');
  const [reported, setReported] = useState<RetrospectiveConflict[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const projects = me.participants;

  async function reload() {
    setItems((await api.conflictExclusions(true)).items);
  }
  useEffect(() => {
    void reload();
    void api.orgUsers().then((res) => setOrgUsers(res.items));
  }, []);

  async function declare() {
    setError(null);
    setReported(null);
    if (!projectAId || !projectBId || projectAId === projectBId) {
      setError('Choose two different projects.');
      return;
    }
    if (grain === 'individual' && !subjectUserId) {
      setError('Choose the person this wall applies to.');
      return;
    }
    try {
      const res = await api.declareExclusion({
        projectAId,
        projectBId,
        grain,
        ...(grain === 'individual' ? { subjectUserId } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      // §4 — report what this now covers; nothing is revoked
      setReported(res.retrospectiveConflicts);
      setReason('');
      await reload();
    } catch (e) {
      setError(e instanceof RequestError && e.status === 409 ? 'Already declared.' : 'Could not declare.');
    }
  }

  async function withdraw(id: string) {
    await api.withdrawExclusion(id);
    await reload();
  }

  return (
    <>
      <SectionLabel>Ethical walls</SectionLabel>
      <Card>
        <div style={{ padding: 16, display: 'grid', gap: 12, fontSize: 13 }}>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            Where working on one scheme should bar working on another. Visible only inside{' '}
            {me.organisationName} — no client and no other organisation can see this register.
          </p>

          <div style={{ display: 'grid', gap: 6 }}>
            {items.map((item) => (
              <div key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ flex: 1, opacity: item.withdrawnAt ? 0.55 : 1 }}>
                  <b>{item.grain === 'individual' ? item.subjectName : 'Everyone here'}</b>
                  {' — '}
                  {item.projectAName} ↔ {item.projectBName}
                  {item.reason && <span style={{ color: 'var(--text-muted)' }}> · {item.reason}</span>}
                </span>
                {item.withdrawnAt ? (
                  <Badge tone="neutral">Withdrawn</Badge>
                ) : (
                  <Button size="sm" variant="quiet" onClick={() => void withdraw(item.id)}>
                    Withdraw
                  </Button>
                )}
              </div>
            ))}
            {items.length === 0 && (
              <span style={{ color: 'var(--text-muted)' }}>No walls declared.</span>
            )}
          </div>

          <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={grain}
                onChange={(e) => setGrain(e.target.value as 'individual' | 'organisation')}
                style={fieldStyle}
              >
                <option value="individual">One person</option>
                <option value="organisation">Everyone here</option>
              </select>
              {grain === 'individual' && (
                <select
                  value={subjectUserId}
                  onChange={(e) => setSubjectUserId(e.target.value)}
                  style={fieldStyle}
                >
                  <option value="">Who…</option>
                  {orgUsers.map((u) => (
                    <option key={u.userId} value={u.userId}>
                      {u.name}
                    </option>
                  ))}
                </select>
              )}
              <select value={projectAId} onChange={(e) => setProjectAId(e.target.value)} style={fieldStyle}>
                <option value="">Scheme…</option>
                {projects.map((p) => (
                  <option key={p.projectId} value={p.projectId}>
                    {p.projectName}
                  </option>
                ))}
              </select>
              <span style={{ color: 'var(--text-muted)' }}>may not also work</span>
              <select value={projectBId} onChange={(e) => setProjectBId(e.target.value)} style={fieldStyle}>
                <option value="">Scheme…</option>
                {projects.map((p) => (
                  <option key={p.projectId} value={p.projectId}>
                    {p.projectName}
                  </option>
                ))}
              </select>
            </div>
            {/* T-342 (ADR-0050 §3) — the minimisation half, and the cheapest
                real reduction available. This one field is what turns "a person
                and two scheme ids" into a client roster, and the register sits
                on the ADR-0018 private floor while a break-glass operator can
                read it regardless (encryption was rejected on a finding: the
                operator controls the deployment and therefore the key). The
                field STAYS — a compliance partner reviewing a two-year-old wall
                needs the why — so what narrows is its purpose, stated where it
                is typed rather than in a policy nobody reads. */}
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why — the fact, not the client (optional)"
                  style={{ ...fieldStyle, flex: 1 }}
                />
                <Button size="sm" variant="primary" onClick={() => void declare()}>
                  Declare
                </Button>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--body-dense-size)' }}>
                Record the fact, not the client — “bid team conflict” rather than naming the other
                side. Private to this organisation, and kept for whoever reviews this wall later.
              </span>
            </div>
            {error && <span style={{ color: 'var(--feedback-danger-text)' }}>{error}</span>}
          </div>

          {/* §4 — existing people this now covers are REPORTED, never removed:
              an automatic revocation could pull a specialist out mid-examination. */}
          {reported !== null && (
            <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
              {reported.length === 0 ? (
                <span style={{ color: 'var(--text-muted)' }}>
                  Declared. Nobody currently works both schemes.
                </span>
              ) : (
                <>
                  <b>Declared. These people already work both schemes:</b>
                  <ul style={{ margin: '6px 0 0 18px' }}>
                    {reported.map((r) => (
                      <li key={r.userId}>{r.userName}</li>
                    ))}
                  </ul>
                  <span style={{ color: 'var(--text-muted)' }}>
                    Nothing has been removed — decide and act on these yourself.
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </Card>
    </>
  );
}

// T-246 (ADR-0046 §8) — the owner's assurance WITHOUT the register. An owner
// cannot inspect a supplier's internal wall, so what it gets is the power to
// require each member organisation to attest that it operates one. Trust plus
// audit, deliberately: a control that pretended to more would be theatre.
function AttestationPanel() {
  const { me } = useSession();
  const owned = me.participants.filter((p) => p.membershipRole === 'owner');
  const [projectId, setProjectId] = useState(owned[0]?.projectId ?? '');
  const [data, setData] = useState<ListConflictAttestationsResponse | null>(null);

  useEffect(() => {
    if (projectId) void api.conflictAttestations(projectId).then(setData);
  }, [projectId]);

  async function toggle(required: boolean) {
    await api.setAttestationRequired(projectId, required);
    setData(await api.conflictAttestations(projectId));
  }

  return (
    <>
      <SectionLabel>Conflict attestations</SectionLabel>
      <Card>
        <div style={{ padding: 16, display: 'grid', gap: 12, fontSize: 13 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Project</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={fieldStyle}>
              {owned.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {p.projectName}
                </option>
              ))}
            </select>
          </div>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            Require each organisation on this project to confirm it operates a conflict-of-interest
            policy. You see that they have confirmed and when — never what their walls protect.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button
              size="sm"
              variant={data?.required ? 'quiet' : 'primary'}
              onClick={() => void toggle(!data?.required)}
            >
              {data?.required ? 'Stop requiring' : 'Require attestation'}
            </Button>
            {data?.required && <Badge tone="success">Required</Badge>}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {(data?.items ?? []).map((item) => (
              <div key={item.organisationId} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ flex: 1 }}>{item.organisationName}</span>
                {item.attested ? (
                  <span style={{ color: 'var(--text-muted)' }}>
                    {item.attestedByName} · {new Date(item.attestedAt!).toLocaleDateString()}
                  </span>
                ) : (
                  <Badge tone="neutral">Not confirmed</Badge>
                )}
              </div>
            ))}
            {(data?.items ?? []).length === 0 && (
              <span style={{ color: 'var(--text-muted)' }}>No other organisations on this project.</span>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}
