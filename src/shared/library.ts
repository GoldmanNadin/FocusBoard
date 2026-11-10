import { createEmptyDocument, getBoard, renameBoard } from './boardOps';
import { createId } from './ids';
import { NOTE_COLORS } from './limits';
import { anchorPosition } from './lines';
import type { Card, WhiteboardDocument } from './model';

export type PreviewCard = { x: number; y: number; w: number; h: number; fill: string };
export type PreviewLine = { x1: number; y1: number; x2: number; y2: number };

export type LibraryEntry = {
  id: string;
  title: string;
  modifiedAt: number;
  preview: PreviewCard[];
  lines: PreviewLine[];
  trashed: boolean;
};

const FILE_NAME = /^[A-Za-z0-9_-]{8,80}\.json$/;

export function libraryFileName(id: string): string | null {
  const name = `${id}.json`;
  return FILE_NAME.test(name) ? name : null;
}

export function idFromFileName(name: string): string | null {
  if (!FILE_NAME.test(name)) return null;
  return name.slice(0, -'.json'.length);
}

export function containedPath(root: string, target: string): boolean {
  const norm = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '');
  const base = norm(root);
  const file = norm(target);
  if (!base || base === '.' || file.includes('\0') || file.split('/').includes('..')) return false;
  return file === base || file.startsWith(`${base}/`);
}

export function uniqueTitle(titles: string[], base: string): string {
  const clean = base.trim() || 'Neues Board';
  if (!titles.includes(clean)) return clean;
  let index = 2;
  while (titles.includes(`${clean} ${index}`)) index += 1;
  return `${clean} ${index}`;
}

export function shortFolderLabel(folder: string): string {
  const parts = folder.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length <= 2) return parts.join('/') || folder;
  return `…/${parts.slice(-2).join('/')}`;
}

export function previewOf(doc: WhiteboardDocument): PreviewCard[] {
  return layoutPreview(doc).cards;
}

export function previewLines(doc: WhiteboardDocument): PreviewLine[] {
  return layoutPreview(doc).lines;
}

function layoutPreview(doc: WhiteboardDocument): { cards: PreviewCard[]; lines: PreviewLine[] } {
  const board = getBoard(doc, doc.rootBoardId);
  if (!board || board.cards.length === 0) return { cards: [], lines: [] };
  const cards = board.cards.slice(0, 12);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const card of cards) {
    minX = Math.min(minX, card.x);
    minY = Math.min(minY, card.y);
    maxX = Math.max(maxX, card.x + card.width);
    maxY = Math.max(maxY, card.y + card.height);
  }
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const pad = 0.14;
  const place = (x: number, y: number) => ({
    x: (pad + ((x - minX) / span) * (1 - pad * 2)) * 100,
    y: (pad + ((y - minY) / span) * (1 - pad * 2)) * 100,
  });
  return {
    cards: cards.map((card) => {
      const origin = place(card.x, card.y);
      return {
        x: origin.x,
        y: origin.y,
        w: Math.max(8, (card.width / span) * (1 - pad * 2) * 100),
        h: Math.max(8, (card.height / span) * (1 - pad * 2) * 100),
        fill: fillOf(card),
      };
    }),
    lines: (board.lines ?? []).slice(0, 8).flatMap((line) => {
      const start = anchorPosition(line.source, board.cards);
      const end = anchorPosition(line.target, board.cards);
      if (!start || !end) return [];
      const a = place(start.x, start.y);
      const b = place(end.x, end.y);
      return [{ x1: a.x, y1: a.y, x2: b.x, y2: b.y }];
    }),
  };
}

function fillOf(card: Card): string {
  if (card.type === 'text' && card.color) return NOTE_COLORS[card.color].fill;
  if (card.type === 'text') return 'transparent';
  if (card.type === 'todo') return '#fffdf8';
  if (card.type === 'column') return '#f4efe4';
  if (card.type === 'image') return '#d9cfc2';
  return '#ffe14a';
}

export function rootTitle(doc: WhiteboardDocument): string {
  return getBoard(doc, doc.rootBoardId)?.title ?? 'Board';
}

export function withRootTitle(doc: WhiteboardDocument, title: string): WhiteboardDocument {
  const renamed = renameBoard(doc, doc.rootBoardId, title);
  return renamed.ok ? renamed.doc : doc;
}

export function remapDocument(doc: WhiteboardDocument): WhiteboardDocument {
  const map = new Map<string, string>();
  const next = (id: string) => {
    const existing = map.get(id);
    if (existing) return existing;
    const created = createId();
    map.set(id, created);
    return created;
  };
  next(doc.rootBoardId);
  for (const board of doc.boards) {
    next(board.id);
    for (const card of board.cards) {
      next(card.id);
      if (card.type === 'board') next(card.boardId);
      if (card.type === 'image') next(card.fileId);
      if (card.type === 'column') card.childIds.forEach(next);
      if (card.type === 'todo') card.items.forEach((item) => next(item.id));
    }
    for (const line of board.lines ?? []) next(line.id);
    for (const connector of board.connectors) next(connector.id);
  }
  for (const file of doc.files) next(file.id);
  const id = (value: string) => map.get(value) ?? value;
  return {
    ...doc,
    rootBoardId: id(doc.rootBoardId),
    files: doc.files.map((file) => ({ ...file, id: id(file.id) })),
    boards: doc.boards.map((board) => ({
      ...board,
      id: id(board.id),
      parentBoardId: board.parentBoardId ? id(board.parentBoardId) : null,
      connectors: board.connectors.map((connector) => ({
        ...connector,
        id: id(connector.id),
        source: id(connector.source),
        target: id(connector.target),
      })),
      lines: (board.lines ?? []).map((line) => ({
        ...line,
        id: id(line.id),
        source: line.source.kind === 'card' ? { ...line.source, cardId: id(line.source.cardId) } : line.source,
        target: line.target.kind === 'card' ? { ...line.target, cardId: id(line.target.cardId) } : line.target,
      })),
      cards: board.cards.map((card) => {
        const columnId = card.type === 'column' ? null : card.columnId ? id(card.columnId) : null;
        if (card.type === 'column') return { ...card, id: id(card.id), childIds: card.childIds.map(id) };
        if (card.type === 'board') return { ...card, id: id(card.id), boardId: id(card.boardId), columnId };
        if (card.type === 'image') return { ...card, id: id(card.id), fileId: id(card.fileId), columnId };
        if (card.type === 'todo') {
          return { ...card, id: id(card.id), columnId, items: card.items.map((item) => ({ ...item, id: id(item.id) })) };
        }
        return { ...card, id: id(card.id), columnId };
      }),
    })),
  };
}

export function freshBoard(title: string): WhiteboardDocument {
  return withRootTitle(createEmptyDocument(), title);
}

export function externalEditIsNewer(knownMtime: number | null, diskMtime: number, diskText: string, nextText: string): boolean {
  if (knownMtime == null) return false;
  if (diskMtime <= knownMtime + 1000) return false;
  return diskText !== nextText;
}
