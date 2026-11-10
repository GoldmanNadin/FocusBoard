import { MSG } from './limits';
import { relayoutColumn } from './columns';
import type { Board, DocResult, TodoCard, TodoItem, WhiteboardDocument } from './model';

function getBoard(doc: WhiteboardDocument, id: string): Board | undefined {
  return doc.boards.find((board) => board.id === id);
}

function withBoard(doc: WhiteboardDocument, boardId: string, board: Board): WhiteboardDocument {
  return { ...doc, boards: doc.boards.map((item) => (item.id === boardId ? board : item)) };
}

function todo(board: Board, cardId: string): TodoCard | undefined {
  const card = board.cards.find((item) => item.id === cardId);
  return card?.type === 'todo' ? card : undefined;
}

function replaceTodo(board: Board, next: TodoCard): Board {
  const replaced = { ...board, cards: board.cards.map((card) => (card.id === next.id ? next : card)) };
  return next.columnId ? relayoutColumn(replaced, next.columnId) : replaced;
}

/** Height that shows the title, the progress line and every item without clipping. */
export function todoHeight(itemCount: number): number {
  return 96 + Math.max(1, itemCount) * 32;
}

export function todoProgress(card: TodoCard): { done: number; total: number } {
  return { done: card.items.filter((item) => item.done).length, total: card.items.length };
}

export function setTodoTitle(doc: WhiteboardDocument, boardId: string, cardId: string, title: string): DocResult {
  const board = getBoard(doc, boardId);
  const card = board && todo(board, cardId);
  if (!board || !card) return { ok: false, error: MSG.missingBoard };
  const clean = title.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 120);
  return { ok: true, doc: withBoard(doc, boardId, replaceTodo(board, { ...card, title: clean })) };
}

export function setTodoItemText(
  doc: WhiteboardDocument,
  boardId: string,
  cardId: string,
  itemId: string,
  text: string,
): DocResult {
  const board = getBoard(doc, boardId);
  const card = board && todo(board, cardId);
  if (!board || !card) return { ok: false, error: MSG.missingBoard };
  const items = card.items.map((item) => (item.id === itemId ? { ...item, text: text.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 400) } : item));
  return { ok: true, doc: withBoard(doc, boardId, replaceTodo(board, { ...card, items })) };
}

export function addTodoItem(doc: WhiteboardDocument, boardId: string, cardId: string, afterId?: string): DocResult {
  const board = getBoard(doc, boardId);
  const card = board && todo(board, cardId);
  if (!board || !card) return { ok: false, error: MSG.missingBoard };
  const item: TodoItem = { id: crypto.randomUUID(), text: '', done: false };
  const items = card.items.slice();
  const index = afterId ? items.findIndex((entry) => entry.id === afterId) : items.length - 1;
  items.splice(index + 1, 0, item);
  const height = Math.max(card.height, todoHeight(items.length));
  return { ok: true, doc: withBoard(doc, boardId, replaceTodo(board, { ...card, items, height })), itemId: item.id } as DocResult & {
    itemId?: string;
  };
}

export function toggleTodoItem(doc: WhiteboardDocument, boardId: string, cardId: string, itemId: string): DocResult {
  const board = getBoard(doc, boardId);
  const card = board && todo(board, cardId);
  if (!board || !card) return { ok: false, error: MSG.missingBoard };
  const items = card.items.map((item) => (item.id === itemId ? { ...item, done: !item.done } : item));
  return { ok: true, doc: withBoard(doc, boardId, replaceTodo(board, { ...card, items })) };
}

export function deleteTodoItem(doc: WhiteboardDocument, boardId: string, cardId: string, itemId: string): DocResult {
  const board = getBoard(doc, boardId);
  const card = board && todo(board, cardId);
  if (!board || !card) return { ok: false, error: MSG.missingBoard };
  if (!card.items.some((item) => item.id === itemId)) return { ok: true, doc };
  // The last item is only cleared, never removed: an empty list would have no field left to type in.
  const items =
    card.items.length <= 1
      ? card.items.map((item) => ({ ...item, text: '', done: false }))
      : card.items.filter((item) => item.id !== itemId);
  return { ok: true, doc: withBoard(doc, boardId, replaceTodo(board, { ...card, items })) };
}
