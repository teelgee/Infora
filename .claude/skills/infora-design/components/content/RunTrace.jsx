import React from 'react';

/** The step list for an in-flight or finished run. */
export function RunTrace({ steps }) {
  return (
    <div className="trace">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <div className="trace-step" key={s.label}>
            <div className="col">
              <span className={s.pending ? 'marker pending' : 'marker'}>{s.pending ? i + 1 : '✓'}</span>
              {!last && <span className="rail-line" />}
            </div>
            <div className={s.pending ? 'label pending' : 'label'}>{s.label}</div>
          </div>
        );
      })}
    </div>
  );
}
