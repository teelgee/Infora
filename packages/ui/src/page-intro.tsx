// T-464 — ONE LINE UNDER EVERY HEADING, and "Learn more" for the rest.
//
// *In plain terms: each page opens with one sentence saying what it is for.
// Anyone who wants the longer explanation — what the AI does here, where the
// boundaries are — presses "Learn more" and reads it in place; anyone who
// knows already is not made to read it every time.*
//
// Design-rules §G: the heading, the line and the controls read as one sentence.
import { useId, useState } from 'react';
import type { ReactNode } from 'react';

export function PageIntro(props: { line: ReactNode; more?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={props.className}>
      <p className="page-sub" style={{ marginBottom: open ? 4 : undefined }}>
        {props.line}
        {props.more !== undefined && (
          <>
            {' '}
            <button type="button" className="linklike" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
              {open ? 'Show less' : 'Learn more'}
            </button>
          </>
        )}
      </p>
      {props.more !== undefined && open && (
        <p id={id} className="page-sub page-intro-more" style={{ marginTop: 0 }}>
          {props.more}
        </p>
      )}
    </div>
  );
}
