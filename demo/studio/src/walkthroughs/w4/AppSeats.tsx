/**
 * The app in use (RULED returns-app-two-seats.html, re-cast to the KPI app):
 *   RachelDashboard  S8 at full width, or narrow in the split's right window
 *   SamReturns       S7, Sam Kerridge's seat (split left): his form and his
 *                    own returns only — no totals, no charts, no insight.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Info } from 'lucide-react';
import { C, FONT, RADIUS, SHADOW, ui, type F } from '../../shared';
import { WT_TOOLS } from '../../data/wrenfield';
import { Btn, Shell, StatusPill } from '../shared';
import { KpiBody, MoreButton, type KpiDashboardProps } from './KpiDashboard';
import { Micro, Probe } from './kit';

const D = WT_TOOLS.dashboard;
const S = WT_TOOLS.sam;

export const RachelDashboard: React.FC<KpiDashboardProps & { runHoverFrom?: F; runPressAt?: F }> = ({ runHoverFrom, runPressAt, ...p }) => {
  const f = useCurrentFrame();
  const full = p.layout === 'full';
  const right = full ? (
    <>
      <span data-w4="dash-run" style={{ display: 'inline-flex' }}>
        <Btn variant="secondary" label={D.actions[0]} size="sm" hover={runHoverFrom !== undefined && f >= runHoverFrom && f < (runPressAt ?? 0) + 6} pressAt={runPressAt} style={{ padding: '4px 12px' }} />
      </span>
      <Btn variant="secondary" label={D.actions[1]} size="sm" style={{ padding: '4px 12px' }} />
      <Btn variant="quiet" label={D.actions[2]} size="sm" />
    </>
  ) : (
    <MoreButton />
  );
  return (
    <Shell
      seat="RACHEL"
      nav="Tools"
      width={full ? 1536 : 752}
      height={full ? 864 : 832}
      topbar={{ crumb: ['Tools', D.title] }}
      topbarRight={right}
      overlay={<Probe tag={full ? 'dash' : 'dashN'} />}
    >
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: full ? -216 : -64, top: -68 - (p.scrollY ?? 0) }}>
          <KpiBody {...p} />
        </div>
      </div>
    </Shell>
  );
};

const FormField: React.FC<{ label: string; value: string; w: number; h?: number; area?: boolean }> = ({ label, value, w, h = 34, area }) => (
  <div style={{ width: w }}>
    <div style={{ fontSize: 11.5, fontWeight: 600, color: C.text2, height: 16 }}>{label}</div>
    <div
      style={{
        height: h,
        boxSizing: 'border-box',
        background: C.pane,
        border: `1px solid ${C.border}`,
        borderRadius: RADIUS.control,
        padding: area ? '7px 10px' : '0 10px',
        display: 'flex',
        alignItems: area ? 'flex-start' : 'center',
        fontSize: 13,
        lineHeight: '17px',
        color: C.text,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {value}
    </div>
  </div>
);

export const SamReturns: React.FC<{ submitHoverFrom: F; submitPressAt: F; submittedAt: F }> = ({ submitHoverFrom, submitPressAt, submittedAt }) => {
  const f = useCurrentFrame();
  const done = f >= submittedAt;
  const v = Object.fromEntries(S.form);
  return (
    <Shell seat="SAM" nav="Tools" width={752} height={832} topbar={{ crumb: ['Tools', S.title] }} overlay={<Probe tag="sam" />}>
      <div style={{ position: 'relative', flex: 1, fontFamily: FONT.sans, color: C.text }}>
        <div style={{ position: 'absolute', left: 24, top: 29 }}>
          <div style={{ fontFamily: FONT.serif, fontSize: 29, fontWeight: 500, lineHeight: '38px', letterSpacing: 0.1 }}>{S.title}</div>
          <div style={{ width: 628, marginTop: 8, fontSize: 13, lineHeight: '17px', color: C.muted }}>{S.sub}</div>
        </div>

        {/* the form card (sunken) */}
        <div style={{ position: 'absolute', left: 24, top: 206 - 68, width: 628, height: 264, boxSizing: 'border-box', background: C.sunken, borderRadius: RADIUS.lg, boxShadow: SHADOW.popout, padding: '14px 16px' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{S.formTitle}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 192px)', columnGap: 14, rowGap: 8, marginTop: 8 }}>
            <FormField label="Month" value={v['Month']} w={192} />
            <FormField label="Deliveries due" value={v['Deliveries due']} w={192} />
            <FormField label="Delivered on time" value={v['Delivered on time']} w={192} />
            <FormField label="NCRs" value={v['NCRs']} w={192} />
            <FormField label="Safety incidents" value={v['Safety incidents']} w={192} />
            <FormField label="Carbon (tCO2e)" value={v['Carbon (tCO2e)']} w={192} />
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
            <FormField label="Local spend (£)" value={v['Local spend (£)']} w={192} h={42} />
            <FormField label="Notes" value={v['Notes']} w={398} h={42} area />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, opacity: 1 }}>
            <span style={{ opacity: done ? 0.5 : 1, display: 'inline-flex' }}>
              <Btn variant="secondary" label={S.saveDraft} />
            </span>
            <span data-w4="sam-submit" style={{ opacity: done ? 0.5 : 1, display: 'inline-flex' }}>
              <Btn variant="primary" label={S.submit} hover={f >= submitHoverFrom && f < submitPressAt + 6} pressAt={submitPressAt} />
            </span>
            <span style={{ marginLeft: 6, fontSize: 12, color: C.muted, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: done ? C.warning.dot : C.faint }} />
              {done ? S.submittedLine : S.saved}
            </span>
          </div>
        </div>

        {/* his own returns (white, hairline) */}
        <div style={{ position: 'absolute', left: 24, top: 482 - 68, width: 628, height: 236, boxSizing: 'border-box', background: C.pane, border: `1px solid ${C.border}`, borderRadius: RADIUS.lg, overflow: 'hidden' }}>
          <div style={{ height: 34, display: 'flex', alignItems: 'center', padding: '0 14px' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{S.table}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: C.muted }}>{S.tableSub}</span>
          </div>
          <div style={{ height: 26, display: 'flex', alignItems: 'center', borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: C.neutral50, padding: '0 14px' }}>
            {S.columns.map((c, i) => (
              <div key={c} style={{ width: [88, 50, 66, 52, 66, 0][i] || undefined, flex: i === 5 ? 1 : 'none', textAlign: i > 0 && i < 5 ? 'right' : 'left', paddingLeft: i === 5 ? 24 : 0 }}>
                <Micro>{c}</Micro>
              </div>
            ))}
          </div>
          {S.rows.map((r, i) => {
            const first = i === 0;
            const after = 'after' in r ? r.after : undefined;
            const state = first && done && after ? after.state : r.state;
            const stamp = first && done && after ? after.stamp : r.stamp;
            const tone = state === 'Accepted' ? 'success' : state === 'Submitted' ? 'warning' : 'neutral';
            return (
              <div key={r.month} style={{ height: 44, display: 'flex', alignItems: 'center', padding: '0 14px', borderTop: i ? `1px solid ${C.borderSubtle}` : undefined, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                <div style={{ width: 88 }}>{r.month}</div>
                <div style={{ width: 50, textAlign: 'right' }}>{r.due}</div>
                <div style={{ width: 66, textAlign: 'right' }}>{r.onTime}</div>
                <div style={{ width: 52, textAlign: 'right' }}>{r.ncrs}</div>
                <div style={{ width: 66, textAlign: 'right' }}>{r.carbon}</div>
                <div style={{ flex: 1, paddingLeft: 24, lineHeight: '15px' }}>
                  {first ? (
                    <StatusPill tone={tone} label={state} size={12} style={{ marginLeft: -10 }} flipTo={undefined} at={done ? submittedAt : undefined} />
                  ) : (
                    <StatusPill tone={tone} label={state} size={12} style={{ marginLeft: -10 }} />
                  )}
                  {stamp ? <div style={{ fontSize: 11.5, color: C.muted, opacity: first ? ui(f, submittedAt) : 1 }}>{stamp}</div> : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* the slate note: why he sees only his own rows */}
        <div
          style={{
            position: 'absolute',
            left: 24,
            top: 730 - 68,
            width: 628,
            boxSizing: 'border-box',
            background: C.info.tint,
            borderRadius: RADIUS.control,
            padding: '9px 12px 9px 34px',
            fontSize: 12,
            lineHeight: '16px',
            color: C.info.text,
          }}
        >
          <Info size={14} strokeWidth={1.8} style={{ position: 'absolute', left: 12, top: 10 }} />
          {S.note}
        </div>
      </div>
    </Shell>
  );
};
