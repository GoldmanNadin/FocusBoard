import type { Card, WhiteboardDocument } from './model';

export type SearchHit = {
  boardId: string;
  boardTitle: string;
  cardId: string | null;
  kind: 'Board' | 'Notiz' | 'Überschrift' | 'Liste' | 'Spalte' | 'Link';
  text: string;
  center: { x: number; y: number } | null;
};

function cardTexts(card: Card, boardTitle: (id: string) => string): { kind: SearchHit['kind']; text: string }[] {
  if (card.type === 'text') return [{ kind: card.style === 'note' ? 'Notiz' : 'Überschrift', text: card.text }];
  if (card.type === 'todo') return [{ kind: 'Liste', text: [card.title, ...card.items.map((item) => item.text)].join(' · ') }];
  if (card.type === 'column') return [{ kind: 'Spalte', text: card.title }];
  if (card.type === 'link') return [{ kind: 'Link', text: `${card.title} ${card.url}` }];
  if (card.type === 'board') return [{ kind: 'Board', text: boardTitle(card.boardId) }];
  return [];
}

/** Card text without the formatting marks (#, -, [x], **, ~~, `), on one line. */
export function plain(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*(#{1,3}|[-*•]|\d+[.)]|\[[ xX]\])\s+/, ''))
    .join(' ')
    .replace(/\*\*|~~|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Case- and accent-insensitive search over every board, card text, list item, column and link. */
export function searchDocument(doc: WhiteboardDocument, query: string, limit = 50): SearchHit[] {
  const fold = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('de');
  const needle = fold(query.trim());
  if (!needle) return [];
  const titleOf = (id: string) => doc.boards.find((board) => board.id === id)?.title ?? '';
  const hits: SearchHit[] = [];
  for (const board of doc.boards) {
    if (fold(board.title).includes(needle) && board.id === doc.rootBoardId) {
      hits.push({ boardId: board.id, boardTitle: board.title, cardId: null, kind: 'Board', text: board.title, center: null });
    }
    for (const card of board.cards) {
      for (const entry of cardTexts(card, titleOf)) {
        if (!fold(entry.text).includes(needle)) continue;
        hits.push({
          boardId: board.id,
          boardTitle: board.title,
          cardId: card.id,
          kind: entry.kind,
          text: plain(entry.text).slice(0, 140),
          center: { x: card.x + card.width / 2, y: card.y + card.height / 2 },
        });
        if (hits.length >= limit) return hits;
      }
    }
  }
  return hits;
}
