// The chat/draft prose renderer (T-088): agent output is markdown-ish —
// paragraphs, headings, emphasis, lists — and reads as formatted text, not a
// single block. Styling rides .md in styles.css so every surface renders it
// the same way.
import ReactMarkdown from 'react-markdown';

export function Markdown(props: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown>{props.children}</ReactMarkdown>
    </div>
  );
}
