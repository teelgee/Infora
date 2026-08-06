import React from 'react';
import { Chip } from '../core/Chip.jsx';
import { IconButton } from '../core/IconButton.jsx';

/** The controlled composer: textarea, attach chips, send. */
export function ChatComposer({ value, onChange, onSend, placeholder, pending, sources }) {
  return (
    <div className="composer">
      <textarea rows={1} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }} />
      <div className="row">
        {sources ?? <><Chip>📎 Files</Chip><Chip>▤ Sources</Chip></>}
        <span className="send">
          <IconButton variant="primary" aria-label={pending ? 'Sending' : 'Send'} disabled={pending} onClick={onSend}>→</IconButton>
        </span>
      </div>
    </div>
  );
}
