/**
 * S5 / S6 — the editor on the bound draft (`09-editor`), then frozen
 * (`11-frozen`). Text = WT_MST_TEXT.v01, reflowed (DEV: the seed's hard
 * newlines dropped).
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, type F } from '../../shared';
import { WT_DOC, WT_MST_TEXT } from '../../data/wrenfield';
import { EditorBar, EditorBody, PanelComposer, Prose } from '../shared';
import { fade, InlineBanner } from './parts';

export const EditorCanvasText: React.FC = () => (
  <Prose style={{ margin: '8px auto 0' }}>
    {WT_MST_TEXT.v01.map((s, i) => (
      <div key={i} style={{ marginBottom: 26.7 }}>
        {s.heading ? <div>{s.heading}</div> : null}
        {s.text.split('\n').map((l, j) => (
          <div key={j}>{l}</div>
        ))}
      </div>
    ))}
  </Prose>
);

/** The second bar (built quirk `Calder & Hale — project sandbox`) on its own, for the Shell's `secondBar`. */
export const EditorSecondBar: React.FC<{ frozenAt?: F; freezeHover?: boolean }> = ({ frozenAt, freezeHover }) => {
  const f = useCurrentFrame();
  const frozen = frozenAt !== undefined && f >= frozenAt;
  return <EditorBar location={WT_DOC.location} docRef={WT_DOC.ref} title={WT_DOC.title} bound frozen={frozen} hover={freezeHover && !frozen ? 'freeze' : undefined} />;
};

/** The body: frozen banner band (y 128–182) pushes the panes down 70 (ui, 5 f). */
export const EditorScreenBody: React.FC<{ frozenAt?: F }> = ({ frozenAt }) => {
  const f = useCurrentFrame();
  const p = frozenAt === undefined ? 0 : fade(f, frozenAt);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.sunken, minWidth: 0 }}>
      {p > 0 ? (
        <div style={{ height: 70 * p, flex: 'none', overflow: 'hidden', background: C.pane }}>
          <div style={{ padding: '8px 0 0', opacity: p }}>
            <InlineBanner text="Frozen as v0.1 in the internal series." style={{ borderRadius: 0, height: 54, padding: '0 16px' }} />
          </div>
        </div>
      ) : null}
      <EditorBody
        canvas={<EditorCanvasText />}
        tabs={{ active: 'Chat' }}
        panel={<PanelComposer />}
      />
    </div>
  );
};
