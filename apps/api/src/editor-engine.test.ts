// T-454 — WOPI discovery read engine-neutrally: the same parser takes
// Collabora's discovery and Microsoft Office for the web's, which is what makes
// the post-CSPP swap a change of EDITOR_ENGINE_URL rather than of code.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorUrlFor, parseDiscovery } from './editor-engine';

// the shape Collabora publishes (trimmed)
const collabora = `<wopi-discovery><net-zone name="external-http">
  <app name="calc"><action default="true" ext="xlsx" name="edit" urlsrc="http://localhost:9980/browser/abc/cool.html?"/>
  <action ext="xlsx" name="view" urlsrc="http://localhost:9980/browser/abc/cool.html?"/></app>
  <app name="writer"><action ext="docx" name="edit" urlsrc="http://localhost:9980/browser/abc/cool.html?"/></app>
</net-zone></wopi-discovery>`;

// the shape Microsoft publishes: optional <name=VALUE&> placeholders, entity-escaped
const office = `<wopi-discovery><net-zone name="external-https">
  <app name="Excel"><action name="edit" ext="xlsx" urlsrc="https://excel.example/x/_layouts/xlviewerinternal.aspx?edit=1&amp;&lt;ui=UI_LLCC&amp;&gt;&lt;rs=DC_LLCC&amp;&gt;"/></app>
</net-zone></wopi-discovery>`;

let server: ReturnType<typeof createServer>;
let base: string;
beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/hosting/discovery') res.end(collabora);
    else if (req.url === '/office/hosting/discovery') res.end(office);
    else res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

describe('WOPI discovery, engine-neutral (T-454)', () => {
  it('takes the edit action per extension, not the view action', () => {
    const edit = parseDiscovery(collabora);
    expect(edit.get('xlsx')).toBe('http://localhost:9980/browser/abc/cool.html?');
    expect(edit.get('docx')).toBe('http://localhost:9980/browser/abc/cool.html?');
    expect(edit.has('pdf')).toBe(false);
  });

  it('reads Microsoft Office’s discovery too, dropping its optional placeholders', async () => {
    const edit = parseDiscovery(office);
    expect(edit.get('xlsx')).toBe('https://excel.example/x/_layouts/xlviewerinternal.aspx?edit=1&<ui=UI_LLCC&><rs=DC_LLCC&>');
    expect(await editorUrlFor(`${base}/office`, 'xlsx', 'https://api/wopi/files/f1')).toBe(
      'https://excel.example/x/_layouts/xlviewerinternal.aspx?edit=1&WOPISrc=https%3A%2F%2Fapi%2Fwopi%2Ffiles%2Ff1',
    );
  });

  it('builds the editor URL with the file’s WOPISrc on the end', async () => {
    const url = await editorUrlFor(base, 'xlsx', 'http://api:3000/wopi/files/f1');
    expect(url).toBe('http://localhost:9980/browser/abc/cool.html?WOPISrc=http%3A%2F%2Fapi%3A3000%2Fwopi%2Ffiles%2Ff1');
    expect(await editorUrlFor(base, 'pdf', 'http://api:3000/wopi/files/f1')).toBeNull();
  });

  it('an engine that cannot be reached is "no editor", never an error', async () => {
    expect(await editorUrlFor('http://localhost:1', 'xlsx', 'http://api/wopi/files/f1')).toBeNull();
  });
});
