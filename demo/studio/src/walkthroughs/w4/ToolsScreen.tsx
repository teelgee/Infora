/**
 * S1 / S5 · the Tools page (BUILT t1-01, BUILT-NP apps.tsx 105–117) and, in
 * Rachel's seat, the VISION `New app` composer in the Apps card.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { ArrowUp, ClipboardCheck, FileText } from 'lucide-react';
import { AgentGlyph, C, FONT, RADIUS, SHADOW, pressScale, type F } from '../../shared';
import { WT_TOOLS } from '../../data/wrenfield';
import { HumanTyped, Shell } from '../shared';
import { At, Micro, Probe, Sunken } from './kit';

const T = WT_TOOLS.page;

const ToolCard: React.FC<{ x: number; icon: React.ReactNode; title: string; body: string; hover?: boolean; pressAt?: F; a?: string }> = ({ x, icon, title, body, hover, pressAt, a }) => {
  const f = useCurrentFrame();
  return (
    <At x={x} y={176} w={343} h={124} a={a}>
      <div
        style={{
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          padding: '14px 16px',
          background: hover ? C.neutral50 : C.pane,
          border: `1px solid ${C.border}`,
          borderRadius: RADIUS.lg,
          boxShadow: SHADOW.soft,
          transform: `scale(${pressScale(f, pressAt)})`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14.5, fontWeight: 700, color: C.text }}>
          <span style={{ color: C.text2, display: 'inline-flex' }}>{icon}</span>
          {title}
        </div>
        <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: '17px', color: C.text2 }}>{body}</div>
      </div>
    </At>
  );
};

export interface ToolsScreenProps {
  seat: 'ELEANOR' | 'RACHEL';
  /** Eleanor: hover / press on the QA checker card. */
  qaHoverFrom?: F;
  qaPressAt?: F;
  /** Rachel: the composer. */
  composer?: { focusAt: F; typeFrom: F; seed: number; enterAt: F };
}

export const ToolsScreen: React.FC<ToolsScreenProps> = ({ seat, qaHoverFrom, qaPressAt, composer }) => {
  const f = useCurrentFrame();
  const rachel = seat === 'RACHEL';
  return (
    <Shell seat={seat} nav="Tools" overlay={<Probe tag="tools" />}>
      <div style={{ position: 'relative', flex: 1, fontFamily: FONT.sans }}>
        <At x={342} y={97}>
          <div style={{ fontFamily: FONT.serif, fontSize: 29, fontWeight: 500, lineHeight: '38px', color: C.text, letterSpacing: 0.1 }}>{T.title}</div>
        </At>
        <At x={342} y={143} w={1000}>
          <div style={{ fontSize: 13, lineHeight: '20px', color: C.muted }}>{T.sub}</div>
        </At>
        <ToolCard x={342} icon={<FileText size={15} strokeWidth={1.8} />} title="Document creator" body={T.creator} />
        <ToolCard
          x={698}
          a="tool-qa"
          icon={<ClipboardCheck size={15} strokeWidth={1.8} />}
          title="QA checker"
          body={T.checker}
          hover={qaHoverFrom !== undefined && f >= qaHoverFrom}
          pressAt={qaPressAt}
        />
        <At x={342} y={322}>
          <Micro>{T.appsLabel}</Micro>
        </At>
        <At x={342} y={344} w={1056}>
          <Sunken style={{ padding: '16px 16px 18px', height: rachel ? 198 : 88 }}>
            <div style={{ fontSize: 13, lineHeight: '19px', color: C.text2, maxWidth: 820 }}>{T.appsSub}</div>
            <div style={{ marginTop: 10, fontSize: 13, color: C.muted }}>{T.appsEmpty}</div>
          </Sunken>
        </At>
        {rachel && composer ? <AppsComposer {...composer} /> : null}
      </div>
    </Shell>
  );
};

/** VISION: the `New app` composer (white, r12, popout shadow; ✦; 30 px round send). */
const AppsComposer: React.FC<{ focusAt: F; typeFrom: F; seed: number; enterAt: F }> = ({ focusAt, typeFrom, seed, enterAt }) => {
  const f = useCurrentFrame();
  const focused = f >= focusAt;
  const typing = f >= typeFrom;
  return (
    <>
      <At x={358} y={428}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: C.text2, letterSpacing: 0.1 }}>{T.newAppLabel}</div>
      </At>
      <At x={358} y={448} w={752} h={78} a="apps-compose">
        <div
          style={{
            width: '100%',
            height: '100%',
            boxSizing: 'border-box',
            background: C.pane,
            borderRadius: 12,
            border: `1px solid ${focused ? C.faint : C.borderStrong}`,
            boxShadow: focused ? `${SHADOW.popout}, 0 0 0 3px rgba(28,27,24,.06)` : SHADOW.popout,
            position: 'relative',
          }}
        >
          <AgentGlyph size={13} colour={C.text2} style={{ position: 'absolute', left: 16, top: 15 }} />
          <div style={{ position: 'absolute', left: 38, top: 10, width: 660, fontSize: 14.5, lineHeight: '22px', color: C.text }}>
            {typing ? (
              <HumanTyped text={WT_TOOLS.builder.prompt} from={typeFrom} seed={seed} caretFrom={focusAt} caretUntil={enterAt + 2} />
            ) : focused ? (
              <HumanTyped text="" from={focusAt} caretFrom={focusAt} caretUntil={typeFrom} placeholder={T.newAppPlaceholder} />
            ) : (
              <span style={{ color: C.muted }}>{T.newAppPlaceholder}</span>
            )}
          </div>
          <span
            style={{
              position: 'absolute',
              left: 718 - 15,
              top: 58 - 15,
              width: 30,
              height: 30,
              borderRadius: 999,
              background: typing ? C.ink : C.faint,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: `scale(${pressScale(f, enterAt)})`,
            }}
          >
            <ArrowUp size={15} color="#fff" strokeWidth={2.4} />
          </span>
        </div>
      </At>
    </>
  );
};
