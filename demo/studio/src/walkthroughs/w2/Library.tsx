/**
 * Chapter 1: the Project library (BUILT 26-library) with the VISION
 * `List · How it connects` switch, and the GIR document modal (BUILT-NP
 * library.tsx 89–180) with the VISION revision strip (W2 §4.2, §4.3).
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Download, X } from 'lucide-react';
import { C, FONT, RADIUS, SHADOW, ui, type F } from '../../shared';
import { WT_ASK, WT_GIR_PDF_P1, WT_GIR_V1, WT_LIB } from '../../data/wrenfield';
import { Btn, LibraryPage, PdfPage, Segmented, Shell, StatusPill } from '../shared';
import { Abs, PlateLayer } from './common';

/** The VISION switch at the header's right (W2 §4.2: x 1196–1398, y 102–132). Right edge at 1398. */
export const LibrarySwitch: React.FC<{ active: 'List' | 'How it connects'; hover?: string; scrollY?: number }> = ({ active, hover, scrollY = 0 }) => (
  <div style={{ position: 'absolute', right: 1536 - 1398, top: 101 - scrollY, fontFamily: FONT.sans }}>
    <Segmented options={WT_ASK.ontology.switchLabels} active={active} hover={hover} />
  </div>
);

// ------------------------------------------------------------------ revision strip

export const RevisionStrip: React.FC = () => (
  <div style={{ background: C.sunken, padding: '10px 24px', display: 'grid', gap: 6, fontSize: 12.5, lineHeight: '18px' }}>
    {WT_GIR_V1.strip.map((r) => (
      <div key={r.rev} style={{ display: 'flex', alignItems: 'center', gap: 8, color: r.live ? C.text : C.muted }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            boxSizing: 'border-box',
            background: r.live ? C.success.dot : 'transparent',
            border: r.live ? 'none' : `1.5px solid ${C.faint}`,
            flex: 'none',
          }}
        />
        <span style={{ fontWeight: r.live ? 500 : 400 }}>{r.label}</span>
      </div>
    ))}
  </div>
);

// ------------------------------------------------------------------ document modal

/** W2 §4.3: x 382–1358, y 60–804; header 60–116, strip 116–176, body 176–744, footer 744–804. */
export const DocumentModal: React.FC<{ at: F; exitAt?: F; closeHover?: boolean; closePressAt?: F }> = ({ at, exitAt, closeHover, closePressAt }) => {
  const f = useCurrentFrame();
  const o = ui(f, at) * (exitAt === undefined ? 1 : 1 - ui(f, exitAt));
  if (o <= 0) return null;
  const gir = WT_LIB.GIR;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: o, fontFamily: FONT.sans, color: C.text }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,20,20,.28)' }} />
      <Abs x={382} y={60} w={976} h={744} style={{ background: C.pane, borderRadius: RADIUS.lg, boxShadow: SHADOW.overlay, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* header y 60–116 */}
        <div style={{ height: 56, flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '0 24px', borderBottom: `1px solid ${C.border}`, boxSizing: 'border-box' }}>
          <span style={{ fontFamily: FONT.mono, fontSize: 14, fontWeight: 700 }}>{gir.ref}</span>
          <span style={{ fontFamily: FONT.mono, fontSize: 13, color: C.text2 }}>{gir.rev}</span>
          <StatusPill tone="success" label="Live" />
          <span style={{ marginLeft: 'auto', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: -6 }}>
            <X size={16} strokeWidth={1.8} color={C.muted} />
          </span>
        </div>
        {/* strip y 116–176 */}
        <div style={{ height: 60, flex: 'none', boxSizing: 'border-box' }}>
          <RevisionStrip />
        </div>
        {/* body y 176–744: the PDF viewer x 406–1334, y 188–732 */}
        <div style={{ height: 568, flex: 'none', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 24, top: 12, width: 928, height: 544, background: C.sunken, border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden', boxSizing: 'border-box' }}>
            <div style={{ position: 'absolute', left: 640 - 406 - 1, top: 204 - 188 - 1 }}>
              <PdfPage
                runningHead={WT_GIR_PDF_P1.runningHead}
                cover={{ title: WT_GIR_PDF_P1.title, lines: [WT_GIR_PDF_P1.subtitle, WT_GIR_PDF_P1.revision] }}
                sections={[{ heading: WT_GIR_PDF_P1.heading, text: WT_GIR_PDF_P1.body }]}
                width={460}
                height={540}
              />
            </div>
          </div>
        </div>
        {/* footer y 744–804 */}
        <div style={{ height: 60, flex: 'none', display: 'flex', alignItems: 'center', gap: 22, padding: '0 24px', borderTop: `1px solid ${C.border}`, boxSizing: 'border-box', fontSize: 13, color: C.text2 }}>
          {WT_GIR_PDF_P1.footerLinks.map((l) => (
            <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: C.faint }}>
              <Download size={13} strokeWidth={1.8} />
              {l.replace(/^⤓\s*/, '')}
            </span>
          ))}
          {/* Close: centre (1302, 774) → right edge 1334 */}
          <span style={{ marginLeft: 'auto' }}>
            <Btn variant="quiet" label={WT_GIR_PDF_P1.close} hover={closeHover} pressAt={closePressAt} style={{ padding: '5px 16px' }} />
          </span>
        </div>
      </Abs>
    </div>
  );
};

// ------------------------------------------------------------------ the chapter-1 screen

export interface LibrarySceneProps {
  hoverRow?: { table: 'live' | 'ref'; row: number };
  switchHover?: boolean;
  modal?: { at: F; exitAt: F; closeHover?: boolean; closePressAt?: F };
  /** Page scroll (native px): the switch scrolls with the header, clipped by the pane. */
  scrollY?: number;
}

export const LibraryScene: React.FC<LibrarySceneProps> = ({ hoverRow, switchHover, modal, scrollY = 0 }) => (
  <Shell
    seat="RACHEL"
    nav="Project library"
    overlay={modal ? <DocumentModal at={modal.at} exitAt={modal.exitAt} closeHover={modal.closeHover} closePressAt={modal.closePressAt} /> : undefined}
  >
    <LibraryPage owner hoverRow={hoverRow} scrollY={scrollY} />
    <PlateLayer>
      <LibrarySwitch active="List" hover={switchHover ? 'How it connects' : undefined} scrollY={scrollY} />
    </PlateLayer>
  </Shell>
);
