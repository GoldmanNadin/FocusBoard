import { createId } from './ids';
import { COORD_LIMIT, MAX_CARDS_PER_BOARD, MSG } from './limits';
import type { Board, DocResult, TableCard, WhiteboardDocument } from './model';

export const MAX_TABLE_ROWS = 40;
export const MAX_TABLE_COLS = 10;
export const MAX_CELL_LENGTH = 300;
export const TABLE_ROW_HEIGHT = 34;
export const TABLE_COL_WIDTH = 120;

function getBoard(doc: WhiteboardDocument, id: string): Board | undefined {
  return doc.boards.find((board) => board.id === id);
}

/** Height that shows every row plus the small toolbar above the grid. */
export function tableHeight(rows: number): number {
  return 20 + Math.max(1, rows) * TABLE_ROW_HEIGHT;
}

function withTable(doc: WhiteboardDocument, boardId: string, cardId: string, change: (card: TableCard) => TableCard | null): DocResult {
  const board = getBoard(doc, boardId);
  const card = board?.cards.find((item) => item.id === cardId);
  if (!board || card?.type !== 'table') return { ok: false, error: MSG.invalidStructure };
  const next = change(card);
  if (!next) return { ok: true, doc };
  const sized = { ...next, height: Math.max(next.height, tableHeight(next.rows.length)) };
  return { ok: true, doc: { ...doc, boards: doc.boards.map((item) => (item.id === boardId ? { ...board, cards: board.cards.map((entry) => (entry.id === cardId ? sized : entry)) } : item)) } };
}

export function addTableCard(doc: WhiteboardDocument, boardId: string, position: { x: number; y: number }): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return { ok: false, error: MSG.missingBoard };
  if (board.cards.length >= MAX_CARDS_PER_BOARD) return { ok: false, error: MSG.tooManyCards };
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || Math.abs(position.x) > COORD_LIMIT || Math.abs(position.y) > COORD_LIMIT) {
    return { ok: false, error: MSG.badGeometry };
  }
  const rows = [
    ['', '', ''],
    ['', '', ''],
    ['', '', ''],
  ];
  const card: TableCard = { id: createId(), type: 'table', x: position.x, y: position.y, width: 3 * TABLE_COL_WIDTH + 16, height: tableHeight(3) + 8, rows, columnId: null };
  return { ok: true, doc: { ...doc, boards: doc.boards.map((item) => (item.id === boardId ? { ...board, cards: [...board.cards, card] } : item)) } };
}

export function setCell(doc: WhiteboardDocument, boardId: string, cardId: string, row: number, col: number, text: string): DocResult {
  return withTable(doc, boardId, cardId, (card) => {
    if (!card.rows[row] || col < 0 || col >= card.rows[row]!.length) return null;
    const clean = text.replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, MAX_CELL_LENGTH);
    return { ...card, rows: card.rows.map((cells, r) => (r === row ? cells.map((cell, c) => (c === col ? clean : cell)) : cells)) };
  });
}

export function addTableRow(doc: WhiteboardDocument, boardId: string, cardId: string, after?: number): DocResult {
  return withTable(doc, boardId, cardId, (card) => {
    if (card.rows.length >= MAX_TABLE_ROWS) return null;
    const at = after === undefined ? card.rows.length : Math.max(0, Math.min(card.rows.length, after + 1));
    const rows = card.rows.slice();
    rows.splice(at, 0, new Array(card.rows[0]?.length ?? 1).fill(''));
    return { ...card, rows };
  });
}

export function addTableColumn(doc: WhiteboardDocument, boardId: string, cardId: string): DocResult {
  return withTable(doc, boardId, cardId, (card) => {
    if ((card.rows[0]?.length ?? 0) >= MAX_TABLE_COLS) return null;
    return { ...card, rows: card.rows.map((cells) => [...cells, '']), width: card.width + TABLE_COL_WIDTH };
  });
}

export function removeTableRow(doc: WhiteboardDocument, boardId: string, cardId: string): DocResult {
  return withTable(doc, boardId, cardId, (card) => (card.rows.length <= 1 ? null : { ...card, rows: card.rows.slice(0, -1), height: tableHeight(card.rows.length - 1) + 8 }));
}

export function removeTableColumn(doc: WhiteboardDocument, boardId: string, cardId: string): DocResult {
  return withTable(doc, boardId, cardId, (card) =>
    (card.rows[0]?.length ?? 0) <= 1 ? null : { ...card, rows: card.rows.map((cells) => cells.slice(0, -1)), width: Math.max(160, card.width - TABLE_COL_WIDTH) },
  );
}
