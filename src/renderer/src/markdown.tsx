import type { ReactNode } from 'react';

/**
 * A small, safe subset of Markdown for card text. It builds React elements only (no HTML strings),
 * so card text can never inject markup.
 *
 *   # Titel            larger line
 *   - Punkt / * Punkt  bullet list
 *   1. Punkt           numbered list
 *   [ ] / [x] Aufgabe  check line
 *   **fett**  *kursiv*  _kursiv_  ~~durch~~  `code`  https://… (link)
 */
export function renderCardText(text: string, onLink: (url: string) => void): ReactNode[] {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  let list: { kind: 'ul' | 'ol'; items: ReactNode[] } | null = null;
  const flush = () => {
    if (!list) return;
    out.push(list.kind === 'ul' ? <ul key={`l${out.length}`}>{list.items}</ul> : <ol key={`l${out.length}`}>{list.items}</ol>);
    list = null;
  };
  lines.forEach((line, index) => {
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol';
      if (!list || list.kind !== kind) {
        flush();
        list = { kind, items: [] };
      }
      list.items.push(<li key={index}>{inline((bullet ?? numbered)![1]!, onLink)}</li>);
      return;
    }
    flush();
    const check = /^\s*\[( |x|X)\]\s+(.*)$/.exec(line);
    if (check) {
      const done = check[1] !== ' ';
      out.push(
        <p key={index} className={`md-check${done ? ' is-done' : ''}`}>
          <span aria-hidden="true">{done ? '☑' : '☐'}</span> {inline(check[2]!, onLink)}
        </p>,
      );
      return;
    }
    const heading = /^#{1,3}\s+(.*)$/.exec(line);
    if (heading) {
      out.push(
        <p key={index} className="md-heading">
          {inline(heading[1]!, onLink)}
        </p>,
      );
      return;
    }
    out.push(<p key={index}>{line ? inline(line, onLink) : ' '}</p>);
  });
  flush();
  return out;
}

const TOKEN = /(\*\*[^*\n]+\*\*|~~[^~\n]+~~|`[^`\n]+`|\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_|https?:\/\/[^\s<>"')\]]+)/g;

function inline(text: string, onLink: (url: string) => void): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const token = match[0];
    const at = match.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    const key = `${at}`;
    if (token.startsWith('**')) parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('~~')) parts.push(<s key={key}>{token.slice(2, -2)}</s>);
    else if (token.startsWith('`')) parts.push(<code key={key}>{token.slice(1, -1)}</code>);
    else if (token.startsWith('http')) {
      parts.push(
        <a
          key={key}
          href={token}
          className="nodrag nopan"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onLink(token);
          }}
        >
          {token}
        </a>,
      );
    } else parts.push(<em key={key}>{token.slice(1, -1)}</em>);
    last = at + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Wraps the textarea selection with a marker (Ctrl+B → **, Ctrl+I → *) and returns the new value. */
export function wrapSelection(field: HTMLTextAreaElement, marker: string): string {
  const { selectionStart: start, selectionEnd: end, value } = field;
  const selected = value.slice(start, end);
  const before = value.slice(0, start);
  const after = value.slice(end);
  if (before.endsWith(marker) && after.startsWith(marker)) {
    const next = before.slice(0, -marker.length) + selected + after.slice(marker.length);
    queueMicrotask(() => field.setSelectionRange(start - marker.length, end - marker.length));
    return next;
  }
  const next = before + marker + selected + marker + after;
  queueMicrotask(() => field.setSelectionRange(start + marker.length, end + marker.length));
  return next;
}
