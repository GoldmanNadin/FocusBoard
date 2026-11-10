import { createId } from './ids';
import { normalizeUrl } from './document';
import { relayoutColumn } from './columns';
import { COORD_LIMIT, MAX_BOARD_DEPTH, MAX_BOARDS, MAX_CARDS_PER_BOARD, MAX_CONNECTORS_PER_BOARD, MAX_FILES, MSG, defaultSizeFor } from './limits';
import type { Board, CanvasLine, Card, DocResult, ImageFile, LineAnchor, LinkCard, WhiteboardDocument } from './model';

/** A copied piece of a board: the cards, the lines between them, nested boards and the images they use. */
export type Clip = {
  cards: Card[];
  lines: CanvasLine[];
  boards: Board[];
  files: ImageFile[];
};

function getBoard(doc: WhiteboardDocument, id: string): Board | undefined {
  return doc.boards.find((board) => board.id === id);
}

function withBoard(doc: WhiteboardDocument, board: Board): WhiteboardDocument {
  return { ...doc, boards: doc.boards.map((item) => (item.id === board.id ? board : item)) };
}

function depthOf(doc: WhiteboardDocument, boardId: string): number {
  let depth = 0;
  let current = getBoard(doc, boardId);
  const seen = new Set<string>();
  while (current?.parentBoardId && !seen.has(current.id)) {
    seen.add(current.id);
    depth += 1;
    current = getBoard(doc, current.parentBoardId);
  }
  return depth;
}

function subtreeHeight(boards: Board[], rootId: string): number {
  const byId = new Map(boards.map((board) => [board.id, board]));
  const walk = (id: string, seen: Set<string>): number => {
    const board = byId.get(id);
    if (!board || seen.has(id)) return 0;
    seen.add(id);
    let deepest = 0;
    for (const card of board.cards) if (card.type === 'board') deepest = Math.max(deepest, 1 + walk(card.boardId, seen));
    return deepest;
  };
  return walk(rootId, new Set());
}

/** Collects the selected cards. A column brings its cards along; a board card brings its whole subtree. */
export function copyCards(doc: WhiteboardDocument, boardId: string, cardIds: string[]): Clip | null {
  const board = getBoard(doc, boardId);
  if (!board) return null;
  const wanted = new Set(cardIds);
  for (const card of board.cards) if (wanted.has(card.id) && card.type === 'column') card.childIds.forEach((id) => wanted.add(id));
  const cards = board.cards.filter((card) => wanted.has(card.id));
  if (cards.length === 0) return null;
  const lines = board.lines.filter((line) => {
    const inside = (anchor: LineAnchor) => anchor.kind === 'card' && wanted.has(anchor.cardId);
    return inside(line.source) && inside(line.target);
  });
  const boards: Board[] = [];
  const stack = cards.flatMap((card) => (card.type === 'board' ? [card.boardId] : []));
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const nested = getBoard(doc, id);
    if (!nested) continue;
    boards.push(nested);
    for (const card of nested.cards) if (card.type === 'board') stack.push(card.boardId);
  }
  const fileIds = new Set<string>();
  for (const card of [...cards, ...boards.flatMap((item) => item.cards)]) if (card.type === 'image') fileIds.add(card.fileId);
  const files = doc.files.filter((file) => fileIds.has(file.id));
  return structuredClone({ cards, lines, boards, files });
}

/**
 * Inserts a clip with fresh ids. The clip's top-left corner lands on `at`.
 * Returns the ids of the new top-level cards so they can be selected.
 */
export function pasteClip(
  doc: WhiteboardDocument,
  boardId: string,
  clip: Clip,
  at: { x: number; y: number },
): { ok: true; doc: WhiteboardDocument; cardIds: string[] } | { ok: false; error: string } {
  const board = getBoard(doc, boardId);
  if (!board) return { ok: false, error: MSG.missingBoard };
  if (board.cards.length + clip.cards.length > MAX_CARDS_PER_BOARD) return { ok: false, error: MSG.tooManyCards };
  if (board.lines.length + clip.lines.length > MAX_CONNECTORS_PER_BOARD) return { ok: false, error: MSG.tooManyConnectors };
  if (doc.boards.length + clip.boards.length > MAX_BOARDS) return { ok: false, error: MSG.tooManyBoards };
  const nestedRoots = clip.cards.flatMap((card) => (card.type === 'board' ? [card.boardId] : []));
  const deepest = Math.max(0, ...nestedRoots.map((id) => 1 + subtreeHeight(clip.boards, id)));
  if (depthOf(doc, boardId) + deepest > MAX_BOARD_DEPTH) return { ok: false, error: MSG.tooDeep };
  const knownFiles = new Set(doc.files.map((file) => file.id));
  const newFiles = clip.files.filter((file) => !knownFiles.has(file.id));
  if (doc.files.length + newFiles.length > MAX_FILES) return { ok: false, error: MSG.tooManyFiles };

  const ids = new Map<string, string>();
  const fresh = (old: string) => {
    let next = ids.get(old);
    if (!next) {
      next = createId();
      ids.set(old, next);
    }
    return next;
  };
  const minX = Math.min(...clip.cards.map((card) => card.x));
  const minY = Math.min(...clip.cards.map((card) => card.y));
  const clamp = (value: number) => Math.min(COORD_LIMIT, Math.max(-COORD_LIMIT, value));

  const remapCard = (card: Card, dx: number, dy: number, keepColumns: Set<string>): Card => {
    const base = { ...card, id: fresh(card.id), x: clamp(card.x + dx), y: clamp(card.y + dy) };
    if (base.type === 'column') return { ...base, childIds: base.childIds.filter((id) => keepColumns.has(id)).map(fresh) };
    const columnId = base.columnId && keepColumns.has(base.columnId) ? fresh(base.columnId) : null;
    if (base.type === 'board') return { ...base, boardId: fresh(base.boardId), columnId };
    if (base.type === 'todo') return { ...base, items: base.items.map((item) => ({ ...item, id: createId() })), columnId };
    return { ...base, columnId };
  };
  const remapAnchor = (anchor: LineAnchor, dx: number, dy: number): LineAnchor =>
    anchor.kind === 'card' ? { ...anchor, cardId: fresh(anchor.cardId) } : { ...anchor, x: clamp(anchor.x + dx), y: clamp(anchor.y + dy) };
  const remapLines = (lines: CanvasLine[], dx: number, dy: number) =>
    lines.map((line) => ({ ...line, id: createId(), source: remapAnchor(line.source, dx, dy), target: remapAnchor(line.target, dx, dy) }));

  const dx = at.x - minX;
  const dy = at.y - minY;
  const topIds = new Set(clip.cards.map((card) => card.id));
  const pasted = clip.cards.map((card) => remapCard(card, dx, dy, topIds));
  const nested = clip.boards.map((item) => {
    const own = new Set(item.cards.map((card) => card.id));
    return {
      ...item,
      id: fresh(item.id),
      parentBoardId: item.parentBoardId ? fresh(item.parentBoardId) : boardId,
      cards: item.cards.map((card) => remapCard(card, 0, 0, own)),
      lines: remapLines(item.lines, 0, 0),
      connectors: [],
    };
  });
  // A copied sub-board's parent is either another copied board or the board we paste into.
  const pastedBoardIds = new Set(nested.map((item) => item.id));
  for (const item of nested) if (item.parentBoardId && !pastedBoardIds.has(item.parentBoardId)) item.parentBoardId = boardId;

  let target: Board = { ...board, cards: [...board.cards, ...pasted], lines: [...board.lines, ...remapLines(clip.lines, dx, dy)] };
  for (const card of pasted) if (card.type === 'column') target = relayoutColumn(target, card.id);
  const next = withBoard({ ...doc, boards: [...doc.boards, ...nested], files: [...doc.files, ...newFiles] }, target);
  return { ok: true, doc: next, cardIds: pasted.map((card) => card.id) };
}

/** Moves cards to the end (front) or start (back) of the board's drawing order. */
export function reorderCards(doc: WhiteboardDocument, boardId: string, cardIds: string[], where: 'front' | 'back'): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return { ok: false, error: MSG.missingBoard };
  const chosen = new Set(cardIds);
  const picked = board.cards.filter((card) => chosen.has(card.id));
  const rest = board.cards.filter((card) => !chosen.has(card.id));
  const cards = where === 'front' ? [...rest, ...picked] : [...picked, ...rest];
  if (cards.every((card, index) => card === board.cards[index])) return { ok: true, doc };
  return { ok: true, doc: withBoard(doc, { ...board, cards }) };
}

/** Readable default title for a link: the host without "www.". */
export function linkTitle(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function addLinkCard(
  doc: WhiteboardDocument,
  boardId: string,
  rawUrl: string,
  position: { x: number; y: number },
  ids?: { cardId?: string },
): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return { ok: false, error: MSG.missingBoard };
  if (board.cards.length >= MAX_CARDS_PER_BOARD) return { ok: false, error: MSG.tooManyCards };
  const url = normalizeUrl(rawUrl);
  if (!url) return { ok: false, error: MSG.badUrl };
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || Math.abs(position.x) > COORD_LIMIT || Math.abs(position.y) > COORD_LIMIT) {
    return { ok: false, error: MSG.badGeometry };
  }
  const size = defaultSizeFor('link');
  const card: LinkCard = {
    id: ids?.cardId ?? createId(),
    type: 'link',
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
    url,
    title: linkTitle(url),
    columnId: null,
  };
  return { ok: true, doc: withBoard(doc, { ...board, cards: [...board.cards, card] }) };
}

export function updateLink(doc: WhiteboardDocument, boardId: string, cardId: string, patch: { url?: string; title?: string }): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return { ok: false, error: MSG.missingBoard };
  const card = board.cards.find((item) => item.id === cardId);
  if (card?.type !== 'link') return { ok: false, error: MSG.invalidStructure };
  let url = card.url;
  if (patch.url !== undefined) {
    const normalized = normalizeUrl(patch.url);
    if (!normalized) return { ok: false, error: MSG.badUrl };
    url = normalized;
  }
  const title = patch.title !== undefined ? patch.title.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 200) : card.title;
  if (url === card.url && title === card.title) return { ok: true, doc };
  return { ok: true, doc: withBoard(doc, { ...board, cards: board.cards.map((item) => (item.id === cardId ? { ...card, url, title } : item)) }) };
}
