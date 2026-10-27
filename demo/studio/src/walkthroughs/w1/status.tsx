/**
 * S11 / S22 — the deliverable status page, client seat (`15a` → `16` → `20`,
 * and `27`). `DeliverableStatus` animates the appointment and acknowledgement
 * (cards collapse and the ones below rise, ui 5 f).
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { ChevronDown } from 'lucide-react';
import { C, FONT, RADIUS, SHADOW, type F } from '../../shared';
import { WT_DATES, WT_DOC } from '../../data/wrenfield';
import { Page, StatusPill } from '../shared';
import { PageTitleRow, StatusCard, SubPill, type StepState } from './cycle';
import { Av, Button, Collapse, DotText, fade, KV, Micro } from './parts';

const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ background: '#efeee9', borderRadius: RADIUS.pane, boxShadow: SHADOW.soft, padding: '14px 16px 14px', boxSizing: 'border-box', ...style }}>{children}</div>
);

const PersonRow: React.FC<{ initials: string; name: string; org: string; right: React.ReactNode }> = ({ initials, name, org, right }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, height: 34 }}>
    <Av initials={initials} />
    <div style={{ lineHeight: '15px' }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{name}</div>
      <div style={{ fontSize: 12, color: C.text2 }}>{org}</div>
    </div>
    <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 22, marginRight: 4 }}>{right}</span>
  </div>
);

const RosterSelect: React.FC = () => (
  <div
    style={{
      marginTop: 12,
      height: 33,
      background: C.pane,
      borderRadius: RADIUS.control,
      border: '1px solid rgba(20,20,20,.06)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      fontSize: 13,
      color: C.text,
    }}
  >
    Add a reviewer from the roster…
    <ChevronDown size={14} strokeWidth={1.8} color={C.text2} style={{ marginLeft: 'auto' }} />
  </div>
);

const NOT_USED = <StatusPill tone="warning" label="Not used for AI answers — not in the project library" size={12.5} />;

export interface StatusProps {
  variant: 'review' | 'accepted';
  /** review: click frames (UI responds at +2). */
  acceptAt?: F;
  ackAt?: F;
  acceptHover?: boolean;
  acceptPressAt?: F;
  ackHover?: boolean;
  ackPressAt?: F;
  /** W5: extra transmittal rows after the built one (accepted variant). Default none. */
  transmittalRows?: React.ReactNode;
  /** W5: show the owner's foot line under the transmittals table in the accepted variant. */
  ownerFoot?: boolean;
  /** W5: page scroll (native px). Default 0. */
  scrollY?: number;
}

const STEPS_SUBMITTED: StepState[] = ['current', 'todo', 'todo', 'todo'];
const STEPS_OPEN: StepState[] = ['done', 'current', 'todo', 'todo'];
const STEPS_DONE: StepState[] = ['done', 'done', 'done', 'done'];

export const DeliverableStatus: React.FC<StatusProps> = ({ variant, acceptAt, ackAt, acceptHover, acceptPressAt, ackHover, ackPressAt, transmittalRows, ownerFoot, scrollY }) => {
  const f = useCurrentFrame();
  const accepted = variant === 'accepted';
  const appointed = acceptAt !== undefined && f >= acceptAt;
  const acked = ackAt !== undefined && f >= ackAt;
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
      <Page scrollY={scrollY}>
        <PageTitleRow
          title={WT_DOC.ref}
          sub={
            <>
              {WT_DOC.title} · produced by Calder &amp; Hale · {accepted ? <SubPill tone="success" label="Accepted" /> : <SubPill tone="info" label="In review" />}
            </>
          }
          under={accepted ? undefined : NOT_USED}
          actions={[{ label: 'Review record' }, { label: 'Open the review', kind: 'primary' }]}
        />
        <div style={{ marginTop: accepted ? 1 : 4 }}>
          {accepted ? (
            <StatusCard
              label="P02 · Round 2"
              steps={[[0, STEPS_DONE]]}
              pill={{ tone: 'success', label: 'Accepted' }}
              line2={
                <>
                  <b style={{ fontWeight: 600, color: C.text }}>Round 1</b> · P01 — issued S0 · 3 of 3 answered
                </>
              }
            />
          ) : (
            <StatusCard
              label="P01 · Round 1"
              steps={[
                [0, STEPS_SUBMITTED],
                [ackAt ?? 1e9, STEPS_OPEN],
              ]}
              target={`Review period target ${WT_DATES.round1OpenMeta}`}
              pill={{ tone: 'info', label: 'Cycle active' }}
              ack={{ inkAt: acceptAt, goneAt: ackAt, hover: ackHover, pressAt: ackPressAt }}
            />
          )}
        </div>

        {!accepted ? (
          <>
            {/* The appointment card (y 288–510) + its 13 px gap = 235 */}
            <Collapse at={acceptAt} h={235}>
              <div style={{ paddingTop: 12 }}>
                <Card style={{ height: 223, padding: '14px 16px' }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: C.text, lineHeight: '19px' }}>You have been named lead reviewer</div>
                  <div style={{ fontSize: 12.5, color: C.text2, marginTop: 2 }}>Proposed by Eleanor Price, Calder &amp; Hale — Sep 02, 2026</div>
                  <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: '21px', color: C.text }}>
                    <li>You set the authoritative deliverable code on every round.</li>
                    <li>Only you close a round. No count of comments closes it.</li>
                    <li>You hold the accepting code that makes this a contractual revision.</li>
                    <li>You may propose and revoke reviewers on this deliverable.</li>
                  </ul>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 13 }}>
                    <Button kind="primary" label="Accept the appointment" hover={acceptHover} pressAt={acceptPressAt} pad="4px 12px" style={{ height: 27 }} />
                    <Button label="Decline" />
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 10 }}>
                    Your access was confirmed by the owner organisation; this is the undertaking itself. Declining asks for a reason and leaves the deliverable waiting for someone else to be named.
                  </div>
                </Card>
              </div>
            </Collapse>
            {/* SUBMISSION (goes on acknowledgement) */}
            <Collapse at={ackAt} h={appointed ? 180 : 224}>
              <div style={{ paddingTop: 12 }}>
                <Card style={{ padding: '14px 16px 10px' }}>
                  <Micro>Submission</Micro>
                  <div style={{ marginTop: 6 }}>
                    <KV k="Version" v="P01" />
                    <KV k="Submitted" v="Sep 02, 2026 · Eleanor Price" />
                    <KV k="Review period" v={`target ${WT_DATES.round1Target}`} />
                    <KV k="Round state" v="Submitted, not yet open" last />
                  </div>
                  <Collapse at={acceptAt} h={44}>
                    <div style={{ fontSize: 12, lineHeight: '17px', color: C.muted, marginTop: 10 }}>
                      Nobody can acknowledge this submission until the lead reviewer has accepted the appointment — a super user of the owner organisation included. If they are away, name a different lead reviewer rather than acknowledging in their place.
                    </div>
                  </Collapse>
                </Card>
              </div>
            </Collapse>
          </>
        ) : null}

        {/* REVIEWERS · AUTHORS */}
        <div style={{ display: 'flex', gap: 14, marginTop: 12, alignItems: 'flex-start' }}>
          <Card style={{ width: 521 }}>
            <Micro>Reviewers</Micro>
            <PersonRow
              initials="RB"
              name="Rachel Bowen"
              org="Trentmoor Energy"
              right={
                <>
                  <DotText label="Lead reviewer" />
                  {accepted || appointed ? (
                    <StatusPill tone="success" label="Accepted" size={12.5} at={accepted ? undefined : acceptAt} />
                  ) : (
                    <StatusPill tone="warning" label="Awaiting your acceptance" size={12.5} />
                  )}
                </>
              }
            />
            <RosterSelect />
          </Card>
          <Card style={{ flex: 1 }}>
            <Micro>Authors</Micro>
            <PersonRow initials="EP" name="Eleanor Price" org="Calder & Hale" right={<DotText label="Lead author" />} />
          </Card>
        </div>

        {/* DELIVERABLE · DOCUMENTS */}
        <div style={{ display: 'flex', gap: 14, marginTop: 24, alignItems: 'flex-start' }}>
          <Card style={{ width: 521 }}>
            <Micro>Deliverable</Micro>
            <div style={{ marginTop: 6 }}>
              <KV k="Reference" v={WT_DOC.ref} mono />
              <KV k="Producing organisation" v="Calder & Hale" />
              <KV k="State" v={<DotText label="Live" />} h={34} />
              {accepted ? (
                <>
                  <KV k="Current revision" v="C01 — issued on acceptance" h={34} />
                  <KV k="Verdict" v="A1 — Published — authorized and accepted" />
                  <KV k="On acceptance" v={<span style={{ display: 'inline-block', maxWidth: 350, lineHeight: '15px', padding: '7px 0' }}>Contractual — the C revision was issued from the accepted content.</span>} last />
                </>
              ) : (
                <KV k="Current revision" v={acked ? 'P01 — round 1 open' : 'P01 — round 1 submitted'} h={34} last />
              )}
            </div>
          </Card>
          <Card style={{ flex: 1 }}>
            <Micro>Documents</Micro>
            <div style={{ marginTop: 6 }}>
              {accepted ? (
                <>
                  <KV k="P02" v="Round 2 — issued · native .docx · PDF" />
                  <KV k="P01" v="Round 1 — responded · native .docx · PDF" />
                  <KV k="C01" v={`Issued ${WT_DATES.acceptedDay} — current · native .docx · PDF`} last />
                </>
              ) : (
                <KV k="P01" v={acked ? 'Round 1 — open · native .docx · PDF' : 'Round 1 — submitted · native .docx · PDF'} last />
              )}
            </div>
          </Card>
        </div>

        {/* TRANSMITTALS */}
        <Card style={{ marginTop: 24, padding: '14px 16px 16px' }}>
          <Micro>Transmittals and acknowledgements</Micro>
          <div style={{ marginTop: 12, background: C.pane, borderRadius: 4, fontSize: 13 }}>
            <div style={{ display: 'flex', height: 36, alignItems: 'center', padding: '0 16px', borderBottom: `1px solid ${C.border}` }}>
              {[
                ['Date', 113],
                ['Kind', 136],
                ['Version', 88],
                ['Issued by', 112],
                ['Recipient', 115],
                ['Acknowledgement', 0],
              ].map(([l, w]) => (
                <Micro key={l as string} style={{ width: (w as number) || undefined, letterSpacing: 0.8 }}>
                  {l}
                </Micro>
              ))}
            </div>
            {accepted || acked ? (
              <div style={{ display: 'flex', alignItems: 'center', minHeight: 60, padding: '0 16px', lineHeight: '16px' }}>
                <span style={{ width: 113, whiteSpace: 'nowrap' }}>{accepted ? 'Sep 29, 2026' : 'Sep 02, 2026'}</span>
                <span style={{ width: 136, whiteSpace: 'nowrap' }}>
                  Review —{' '}
                  {accepted ? 'issued' : 'submitted'}
                </span>
                <span style={{ width: 88, fontFamily: FONT.mono, fontSize: 12.5 }}>{accepted ? 'P02' : 'P01'}</span>
                <span style={{ width: 112, whiteSpace: 'nowrap' }}>{accepted ? 'Rachel Bowen' : 'Eleanor Price'}</span>
                <span style={{ width: 115, whiteSpace: 'nowrap' }}>{accepted ? 'Authoring team' : 'Review group'}</span>
                <span>
                  {accepted ? (
                    <DotText label="Not required" size={13} />
                  ) : (
                    <StatusPill tone="success" label={`Acknowledged — Rachel Bowen for Trentmoor Energy, ${WT_DATES.round1Acknowledged}`} size={12.5} at={ackAt} />
                  )}
                </span>
              </div>
            ) : null}
            {transmittalRows}
          </div>
          {accepted && ownerFoot ? <div style={{ fontSize: 12, color: C.muted, marginTop: 12 }}>The full distribution record — every recipient organisation and its acknowledgement state.</div> : null}
          {!accepted && acked ? <div style={{ fontSize: 12, color: C.muted, marginTop: 12, opacity: fade(f, ackAt) }}>The full distribution record — every recipient organisation and its acknowledgement state.</div> : null}
        </Card>
      </Page>
    </div>
  );
};
