import { MSG } from './limits';
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
  return { ...board, cards: board.cards.map((card) => (card.id === next.id ? next : card)) };
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
  const height = Math.max(card.height, 88 + items.length * 36);
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
  return {
    ok: true,
    doc: withBoard(doc, boardId, replaceTodo(board, { ...card, items: card.items.filter((item) => item.id !== itemId) })),
  };
}
