import type { WhiteboardDocument } from './model';

export type History<T> = {
  past: T[];
  present: T;
  future: T[];
};

const LIMIT = 80;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

export function contentSignature(doc: WhiteboardDocument): string {
  return JSON.stringify({
    theme: doc.theme,
    rootBoardId: doc.rootBoardId,
    boards: doc.boards.map((board) => ({
      id: board.id,
      title: board.title,
      parentBoardId: board.parentBoardId,
      cards: board.cards,
      connectors: board.connectors,
      lines: board.lines,
    })),
    files: doc.files,
  });
}

export function sameContent(a: WhiteboardDocument, b: WhiteboardDocument): boolean {
  return contentSignature(a) === contentSignature(b);
}

export function keepViewports(next: WhiteboardDocument, current: WhiteboardDocument): WhiteboardDocument {
  const views = new Map(current.boards.map((board) => [board.id, board.viewport]));
  return {
    ...next,
    boards: next.boards.map((board) => {
      const viewport = views.get(board.id);
      return viewport ? { ...board, viewport } : board;
    }),
  };
}

export function commitHistory<T>(history: History<T>, next: T, same: (a: T, b: T) => boolean): History<T> {
  if (same(history.present, next)) return { ...history, present: next };
  return { past: [...history.past, history.present].slice(-LIMIT), present: next, future: [] };
}

export function replacePresent<T>(history: History<T>, next: T): History<T> {
  return { ...history, present: next };
}

export function undoHistory<T>(history: History<T>): History<T> {
  if (history.past.length === 0) return history;
  const present = history.past[history.past.length - 1]!;
  return { past: history.past.slice(0, -1), present, future: [history.present, ...history.future] };
}

export function redoHistory<T>(history: History<T>): History<T> {
  if (history.future.length === 0) return history;
  const present = history.future[0]!;
  return { past: [...history.past, history.present], present, future: history.future.slice(1) };
}

export function endGesture<T>(
  history: History<T>,
  before: T | null,
  next: T,
  same: (a: T, b: T) => boolean,
): History<T> {
  if (!before || same(before, next)) return { ...history, present: next };
  return { past: [...history.past, before].slice(-LIMIT), present: next, future: [] };
}
