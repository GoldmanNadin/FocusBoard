import { COLUMN_GAP, COLUMN_HEADER, COLUMN_PAD, MSG } from './limits';
import type { Board, Card, ColumnCard, DocResult, WhiteboardDocument } from './model';

function getBoard(doc: WhiteboardDocument, id: string): Board | undefined {
  return doc.boards.find((board) => board.id === id);
}

export function isColumn(card: Card | undefined): card is ColumnCard {
  return card?.type === 'column';
}

export function columnsOf(board: Board): ColumnCard[] {
  return board.cards.filter(isColumn);
}

function withBoard(doc: WhiteboardDocument, boardId: string, board: Board): WhiteboardDocument {
  return { ...doc, boards: doc.boards.map((item) => (item.id === boardId ? board : item)) };
}

export function relayoutColumn(board: Board, columnId: string): Board {
  const column = board.cards.find((card) => card.id === columnId);
  if (!isColumn(column)) return board;
  if (column.collapsed) {
    return {
      ...board,
      cards: board.cards.map((card) => (card.id === column.id ? { ...column, height: COLUMN_HEADER + COLUMN_PAD } : card)),
    };
  }
  let cursor = COLUMN_HEADER;
  const inner = Math.max(64, column.width - COLUMN_PAD * 2);
  const next = board.cards.map((card) => card);
  const copy = next.slice();
  for (const childId of column.childIds) {
    const index = copy.findIndex((card) => card.id === childId);
    if (index < 0 || copy[index]?.type === 'column') continue;
    const child = copy[index]!;
    copy[index] = {
      ...child,
      x: column.x + COLUMN_PAD,
      y: column.y + cursor,
      width: inner,
      columnId: column.id,
    };
    cursor += child.height + COLUMN_GAP;
  }
  const height = Math.max(COLUMN_HEADER + COLUMN_PAD, cursor + COLUMN_PAD);
  return {
    ...board,
    cards: copy.map((card) => (card.id === column.id ? { ...column, height } : card)),
  };
}

export function insertionIndex(column: ColumnCard, board: Board, pointerY: number): number {
  const children = column.childIds
    .map((id) => board.cards.find((card) => card.id === id))
    .filter((card): card is Card => Boolean(card) && card?.type !== 'column');
  let index = 0;
  for (const child of children) {
    const mid = child.y + child.height / 2;
    if (pointerY > mid) index += 1;
  }
  return index;
}

export function columnAtPoint(board: Board, point: { x: number; y: number }): ColumnCard | null {
  const hits = columnsOf(board).filter(
    (column) => point.x >= column.x && point.x <= column.x + column.width && point.y >= column.y && point.y <= column.y + column.height,
  );
  hits.sort((a, b) => a.width * a.height - b.width * b.height);
  return hits[0] ?? null;
}

function stripFromColumns(board: Board, cardId: string): Board {
  return {
    ...board,
    cards: board.cards.map((card) => {
      if (card.type !== 'column' || !card.childIds.includes(cardId)) return card;
      return { ...card, childIds: card.childIds.filter((id) => id !== cardId) };
    }),
  };
}

export function placeInColumn(
  doc: WhiteboardDocument,
  boardId: string,
  cardId: string,
  columnId: string,
  index: number,
): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return { ok: false, error: MSG.missingBoard };
  const card = board.cards.find((item) => item.id === cardId);
  const column = board.cards.find((item) => item.id === columnId);
  if (!card || !isColumn(column)) return { ok: false, error: MSG.missingBoard };
  if (card.type === 'column') return { ok: false, error: MSG.nestedColumn };
  let next = stripFromColumns(board, cardId);
  next = {
    ...next,
    cards: next.cards.map((item) => {
      if (item.id === columnId && item.type === 'column') {
        const childIds = item.childIds.filter((id) => id !== cardId);
        const at = Math.max(0, Math.min(index, childIds.length));
        childIds.splice(at, 0, cardId);
        return { ...item, childIds };
      }
      if (item.id === cardId && item.type !== 'column') return { ...item, columnId };
      return item;
    }),
  };
  next = relayoutColumn(next, columnId);
  return { ok: true, doc: withBoard(doc, boardId, next) };
}

export function takeOutOfColumn(doc: WhiteboardDocument, boardId: string, cardId: string): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return { ok: false, error: MSG.missingBoard };
  const card = board.cards.find((item) => item.id === cardId);
  if (!card || card.type === 'column' || !card.columnId) return { ok: true, doc };
  const columnId = card.columnId;
  let next = stripFromColumns(board, cardId);
  next = {
    ...next,
    cards: next.cards.map((item) => (item.id === cardId && item.type !== 'column' ? { ...item, columnId: null } : item)),
  };
  next = relayoutColumn(next, columnId);
  return { ok: true, doc: withBoard(doc, boardId, next) };
}

export function settleCardDrop(
  doc: WhiteboardDocument,
  boardId: string,
  cardId: string,
  pointer: { x: number; y: number },
): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return { ok: false, error: MSG.missingBoard };
  const card = board.cards.find((item) => item.id === cardId);
  if (!card) return { ok: false, error: MSG.missingBoard };
  if (card.type === 'column') return { ok: true, doc };
  const target = columnAtPoint(board, pointer);
  if (target) {
    const index = insertionIndex(target, board, pointer.y);
    return placeInColumn(doc, boardId, cardId, target.id, index);
  }
  if (card.columnId) return takeOutOfColumn(doc, boardId, cardId);
  return { ok: true, doc };
}

export function translateColumn(doc: WhiteboardDocument, boardId: string, columnId: string, dx: number, dy: number): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return { ok: false, error: MSG.missingBoard };
  const column = board.cards.find((card) => card.id === columnId);
  if (!isColumn(column) || (dx === 0 && dy === 0)) return { ok: true, doc };
  const children = new Set(column.childIds);
  const cards = board.cards.map((card) => {
    if (card.id === columnId || children.has(card.id)) return { ...card, x: card.x + dx, y: card.y + dy };
    return card;
  });
  return { ok: true, doc: withBoard(doc, boardId, relayoutColumn({ ...board, cards }, columnId)) };
}

export function setColumnWidth(doc: WhiteboardDocument, boardId: string, columnId: string, width: number): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return { ok: false, error: MSG.missingBoard };
  const nextWidth = Math.min(4000, Math.max(180, width));
  const cards = board.cards.map((card) => (card.id === columnId && card.type === 'column' ? { ...card, width: nextWidth } : card));
  return { ok: true, doc: withBoard(doc, boardId, relayoutColumn({ ...board, cards }, columnId)) };
}

export function toggleColumn(doc: WhiteboardDocument, boardId: string, columnId: string): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return { ok: false, error: MSG.missingBoard };
  const cards = board.cards.map((card) =>
    card.id === columnId && card.type === 'column' ? { ...card, collapsed: !card.collapsed } : card,
  );
  return { ok: true, doc: withBoard(doc, boardId, relayoutColumn({ ...board, cards }, columnId)) };
}

export function renameColumn(doc: WhiteboardDocument, boardId: string, columnId: string, title: string): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return { ok: false, error: MSG.missingBoard };
  const clean = title.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Spalte';
  const cards = board.cards.map((card) => (card.id === columnId && card.type === 'column' ? { ...card, title: clean } : card));
  return { ok: true, doc: withBoard(doc, boardId, { ...board, cards }) };
}
