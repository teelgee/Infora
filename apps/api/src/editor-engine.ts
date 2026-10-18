// T-454 — where the browser loads the editing engine for a file (ADR-0043).
//
// *In plain terms: an editing engine publishes a short list saying "for a
// .docx, open this page; for a .xlsx, this one". Infora reads that list and
// tells the browser which page to load, with the file's WOPI address on the
// end. Nothing here knows which engine it is talking to.*
//
// The list is WOPI DISCOVERY — `/hosting/discovery`, an XML document of
// `<action ext="…" name="edit" urlsrc="…">` entries — and it is the same
// document Microsoft Office for the web publishes, which is why swapping
// Collabora for Office after CSPP approval is a change of EDITOR_ENGINE_URL
// and nothing else (ADR-0043 §3, the dated note). Office's `urlsrc` carries
// optional `<name=VALUE&>` placeholders; they are dropped, as the protocol
// allows, rather than filled.
//
// Read at most every ten minutes, and never on the WOPI host's own path: the
// engine calling Infora never waits on Infora calling the engine.

const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; edit: Map<string, string> }>();

const decode = (value: string) =>
  value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

/** Parse discovery XML into extension → the `edit` action's urlsrc. */
export function parseDiscovery(xml: string): Map<string, string> {
  const edit = new Map<string, string>();
  for (const [tag] of xml.matchAll(/<action\b[^>]*>/g)) {
    const attr = (name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
    const ext = attr('ext');
    const urlsrc = attr('urlsrc');
    if (attr('name') === 'edit' && ext && urlsrc && !edit.has(ext)) edit.set(ext, decode(urlsrc));
  }
  return edit;
}

/** The page that edits `wopiSrc`, for this extension; null if the engine has none or cannot be reached. */
export async function editorUrlFor(engineUrl: string, ext: string, wopiSrc: string): Promise<string | null> {
  let entry = cache.get(engineUrl);
  if (!entry || Date.now() - entry.at > TTL_MS) {
    try {
      const res = await fetch(`${engineUrl.replace(/\/$/, '')}/hosting/discovery`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return null;
      entry = { at: Date.now(), edit: parseDiscovery(await res.text()) };
      cache.set(engineUrl, entry);
    } catch {
      // an engine that is down is reported as "no editor", never as a 500: the
      // rest of the sandbox does not depend on it
      return null;
    }
  }
  const urlsrc = entry.edit.get(ext);
  if (!urlsrc) return null;
  const base = urlsrc.replace(/<[^>]*>/g, '');
  const joiner = base.endsWith('?') || base.endsWith('&') ? '' : base.includes('?') ? '&' : '?';
  return `${base}${joiner}WOPISrc=${encodeURIComponent(wopiSrc)}`;
}
