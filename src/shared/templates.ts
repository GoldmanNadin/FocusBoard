import { pasteClip, type Clip } from './clipboard';
import { relayoutColumn } from './columns';
import { createId } from './ids';
import { COLUMN_HEADER, COLUMN_PAD, DEFAULT_COLUMN_SIZE, DEFAULT_HEADING_SIZE, DEFAULT_TEXT_SIZE, DEFAULT_TODO_SIZE } from './limits';
import type { Board, Card, ColumnCard, NoteColor, TextCard, TodoCard, WhiteboardDocument } from './model';

export type TemplateName = 'kanban' | 'week' | 'moodboard';

export const TEMPLATES: { name: TemplateName; label: string }[] = [
  { name: 'kanban', label: 'Kanban (3 Spalten)' },
  { name: 'week', label: 'Wochenplan' },
  { name: 'moodboard', label: 'Moodboard' },
];

function column(title: string, x: number, y: number): ColumnCard {
  return { id: createId(), type: 'column', x, y, width: DEFAULT_COLUMN_SIZE.width, height: DEFAULT_COLUMN_SIZE.height, title, collapsed: false, childIds: [] };
}

function text(value: string, x: number, y: number, style: TextCard['style'], color: NoteColor | null): TextCard {
  const size = style === 'heading' ? DEFAULT_HEADING_SIZE : DEFAULT_TEXT_SIZE;
  return { id: createId(), type: 'text', x, y, width: size.width, height: size.height, text: value, style, color, columnId: null };
}

function inColumn(col: ColumnCard, card: TextCard | TodoCard): Card {
  col.childIds.push(card.id);
  return { ...card, columnId: col.id, x: col.x + COLUMN_PAD, y: col.y + COLUMN_HEADER };
}

/** Builds the template's cards as a clip, so it is inserted exactly like pasted content. */
export function templateClip(name: TemplateName): Clip {
  const cards: Card[] = [];
  if (name === 'kanban') {
    const titles = ['Zu tun', 'In Arbeit', 'Erledigt'];
    cards.push(text('Projekt', 0, 0, 'heading', null));
    titles.forEach((title, index) => {
      const col = column(title, index * 290, 100);
      const note = text(index === 0 ? 'Erste Aufgabe' : '', 0, 0, 'note', 'yellow');
      if (index === 0) cards.push(col, inColumn(col, note));
      else cards.push(col);
    });
  } else if (name === 'week') {
    cards.push(text('Wochenplan', 0, 0, 'heading', null));
    ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'].forEach((day, index) => {
      cards.push(column(day, index * 290, 100));
    });
    const todo: TodoCard = {
      id: createId(),
      type: 'todo',
      x: 0,
      y: 420,
      width: DEFAULT_TODO_SIZE.width,
      height: DEFAULT_TODO_SIZE.height,
      title: 'Diese Woche',
      items: [{ id: createId(), text: '', done: false }],
      columnId: null,
    };
    cards.push(todo);
  } else {
    cards.push(text('Moodboard', 0, 0, 'heading', null));
    const ideas: [string, NoteColor][] = [
      ['Stimmung', 'pink'],
      ['Farben', 'orange'],
      ['Materialien', 'turquoise'],
      ['Vorbilder', 'green'],
      ['Ideen', 'yellow'],
    ];
    ideas.forEach(([label, color], index) => cards.push(text(label, (index % 3) * 250, 100 + Math.floor(index / 3) * 190, 'note', color)));
  }
  let board: Board = { id: 'template', title: 'Vorlage', parentBoardId: null, cards, connectors: [], lines: [], viewport: { x: 0, y: 0, zoom: 1 } };
  for (const card of cards) if (card.type === 'column') board = relayoutColumn(board, card.id);
  return { cards: board.cards, lines: [], boards: [], files: [] };
}

export function insertTemplate(doc: WhiteboardDocument, boardId: string, name: TemplateName, at: { x: number; y: number }) {
  return pasteClip(doc, boardId, templateClip(name), at);
}
