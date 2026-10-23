// T-464 — one line under the heading, the rest behind "Learn more"
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PageIntro } from './page-intro';

describe('PageIntro', () => {
  it('shows the line and offers Learn more; without more there is no button', () => {
    const html = renderToStaticMarkup(<PageIntro line="One sentence." more="The rest." />);
    expect(html).toContain('One sentence.');
    expect(html).toContain('Learn more');
    expect(html).not.toContain('The rest.');
    const bare = renderToStaticMarkup(<PageIntro line="One sentence." />);
    expect(bare).not.toContain('Learn more');
  });
});
