import { placementTopLeft } from './gestures';
import { createId, isValidId } from './ids';
import { inspectImageDataUrl } from './images';
import {
  COORD_LIMIT,
  MAX_BOARD_DEPTH,
  MAX_BOARDS,
  MAX_CARD_EDGE,
  MAX_CARDS_PER_BOARD,
  MAX_CONNECTORS_PER_BOARD,
  MAX_FILES,
  MAX_ZOOM,
  MIN_ZOOM,
  MSG,
  VIEWPORT_LIMIT,
  defaultSizeFor,
  minSizeFor,
} from './limits';
import {
  DEFAULT_HEADING_SIZE,
  DEFAULT_STICKER_SIZE,
  DEFAULT_SUBHEADING_SIZE,
  DEFAULT_TEXT_SIZE,
} from './limits';
import type {
  Board,
  BoardCard,
  Card,
  DocResult,
  HandleSide,
  ImageCard,
  NoteColor,
  StickerCard,
  StickerKind,
  TextCard,
  TextStyle,
  ThemeName,
  WhiteboardDocument,
} from './model';
import { APP_VERSION, FORMAT, FORMAT_VERSION } from './limits';
import { lineUsesCard } from './lines';
import { normalizeStoredText, normalizeTitle } from './text';
import type { CanvasLine, ColumnCard, TodoCard } from './model';

const HANDLES = new Set<HandleSide>(['top', 'right', 'bottom', 'left']);

export function createEmptyDocument(ids?: { rootId?: string }): WhiteboardDocument {
  const rootId = ids?.rootId ?? createId();
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    appVersion: APP_VERSION,
    rootBoardId: rootId,
    boards: [
      {
        id: rootId,
        title: 'Hauptboard',
        parentBoardId: null,
        cards: [],
        connectors: [],
        lines: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    ],
    files: [],
    theme: 'light',
  };
}

export function getBoard(doc: WhiteboardDocument, id: string): Board | undefined {
  return doc.boards.find((board) => board.id === id);
}

export function breadcrumb(
  doc: WhiteboardDocument,
  boardId: string,
): { id: string; title: string }[] {
  const path: { id: string; title: string }[] = [];
  let current = getBoard(doc, boardId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.push({ id: current.id, title: current.title });
    current = current.parentBoardId ? getBoard(doc, current.parentBoardId) : undefined;
  }
  return path.reverse();
}

export function boardDepth(doc: WhiteboardDocument, boardId: string): number {
  let depth = 0;
  let current = getBoard(doc, boardId);
  const seen = new Set<string>();
  while (current?.parentBoardId) {
    if (seen.has(current.id)) return MAX_BOARD_DEPTH + 1;
    seen.add(current.id);
    depth += 1;
    current = getBoard(doc, current.parentBoardId);
    if (!current) break;
  }
  return depth;
}

function fail(error: string): DocResult {
  return { ok: false, error };
}

function withBoard(doc: WhiteboardDocument, boardId: string, board: Board): WhiteboardDocument {
  return {
    ...doc,
    boards: doc.boards.map((item) => (item.id === boardId ? board : item)),
  };
}

function geometryError(x: number, y: number, width: number, height: number, type: Card['type']): string | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > COORD_LIMIT || Math.abs(y) > COORD_LIMIT) {
    return MSG.badGeometry;
  }
  const min = minSizeFor(type);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < min.width ||
    height < min.height ||
    width > MAX_CARD_EDGE ||
    height > MAX_CARD_EDGE
  ) {
    return MSG.badGeometry;
  }
  return null;
}

function takeId(preferred: string | undefined, used: Set<string>): string | null {
  if (preferred) {
    if (!isValidId(preferred) || used.has(preferred)) return null;
    used.add(preferred);
    return preferred;
  }
  let id = createId();
  while (used.has(id) || !isValidId(id)) id = createId();
  used.add(id);
  return id;
}

function usedIds(doc: WhiteboardDocument): Set<string> {
  const ids = new Set<string>();
  for (const board of doc.boards) {
    ids.add(board.id);
    for (const card of board.cards) ids.add(card.id);
    for (const connector of board.connectors) ids.add(connector.id);
  }
  for (const file of doc.files) ids.add(file.id);
  return ids;
}

export function textCardSize(style: TextStyle): { width: number; height: number } {
  if (style === 'heading') return DEFAULT_HEADING_SIZE;
  if (style === 'subheading') return DEFAULT_SUBHEADING_SIZE;
  return DEFAULT_TEXT_SIZE;
}

export function addTextCard(
  doc: WhiteboardDocument,
  boardId: string,
  rawText: string,
  position: { x: number; y: number },
  ids?: { cardId?: string },
  options?: { style?: TextStyle; color?: NoteColor | null },
): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return fail(MSG.missingBoard);
  if (board.cards.length >= MAX_CARDS_PER_BOARD) return fail(MSG.tooManyCards);
  const text = normalizeStoredText(rawText);
  if (!text.ok) return text;
  const style = options?.style ?? 'note';
  const color = style === 'note' ? (options?.color ?? 'yellow') : (options?.color ?? null);
  const size = textCardSize(style);
  const geometry = geometryError(position.x, position.y, size.width, size.height, 'text');
  if (geometry) return fail(geometry);
  const cardId = takeId(ids?.cardId, usedIds(doc));
  if (!cardId) return fail(MSG.duplicateId);
  const card: TextCard = {
    id: cardId,
    type: 'text',
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
    text: text.text,
    style,
    color,
    columnId: null,
  };
  return { ok: true, doc: withBoard(doc, boardId, { ...board, cards: [...board.cards, card] }) };
}

export function addSticker(
  doc: WhiteboardDocument,
  boardId: string,
  kind: StickerKind,
  position: { x: number; y: number },
  ids?: { cardId?: string },
): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return fail(MSG.missingBoard);
  if (board.cards.length >= MAX_CARDS_PER_BOARD) return fail(MSG.tooManyCards);
  const size = DEFAULT_STICKER_SIZE;
  const geometry = geometryError(position.x, position.y, size.width, size.height, 'sticker');
  if (geometry) return fail(geometry);
  const cardId = takeId(ids?.cardId, usedIds(doc));
  if (!cardId) return fail(MSG.duplicateId);
  const card: StickerCard = {
    id: cardId,
    type: 'sticker',
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
    kind,
    columnId: null,
  };
  return { ok: true, doc: withBoard(doc, boardId, { ...board, cards: [...board.cards, card] }) };
}

export function setNoteColors(
  doc: WhiteboardDocument,
  boardId: string,
  cardIds: string[],
  color: NoteColor,
): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return fail(MSG.missingBoard);
  const chosen = new Set(cardIds);
  let changed = false;
  const cards = board.cards.map((card) => {
    if (!chosen.has(card.id)) return card;
    if ((card.type === 'shape' || (card.type === 'text' && card.style === 'note')) && card.color !== color) {
      changed = true;
      return { ...card, color };
    }
    return card;
  });
  if (!changed) return { ok: true, doc };
  return { ok: true, doc: withBoard(doc, boardId, { ...board, cards }) };
}

export function setTheme(doc: WhiteboardDocument, theme: ThemeName): DocResult {
  if (doc.theme === theme) return { ok: true, doc };
  return { ok: true, doc: { ...doc, theme } };
}

export function addImageCard(
  doc: WhiteboardDocument,
  boardId: string,
  image: { fileName: string; dataUrl: string },
  position: { x: number; y: number },
  ids?: { cardId?: string; fileId?: string },
  natural?: { width: number; height: number },
): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return fail(MSG.missingBoard);
  if (board.cards.length >= MAX_CARDS_PER_BOARD) return fail(MSG.tooManyCards);
  if (doc.files.length >= MAX_FILES) return fail(MSG.tooManyFiles);
  const inspected = inspectImageDataUrl(image.dataUrl, image.fileName);
  if (!inspected.ok) return inspected;
  const size = imageCardSize(natural);
  const geometry = geometryError(position.x, position.y, size.width, size.height, 'image');
  if (geometry) return fail(geometry);
  const used = usedIds(doc);
  const fileId = takeId(ids?.fileId, used);
  const cardId = takeId(ids?.cardId, used);
  if (!fileId || !cardId) return fail(MSG.duplicateId);
  const card: ImageCard = {
    id: cardId,
    type: 'image',
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
    fileId,
    columnId: null,
  };
  return {
    ok: true,
    doc: {
      ...withBoard(doc, boardId, { ...board, cards: [...board.cards, card] }),
      files: [
        ...doc.files,
        {
          id: fileId,
          fileName: inspected.image.fileName,
          mimeType: inspected.image.mimeType,
          dataUrl: inspected.image.dataUrl,
          byteSize: inspected.image.byteSize,
        },
      ],
    },
  };
}

/** Card size that keeps the picture's aspect ratio: 280 px on the long side, never below the minimum. */
export function imageCardSize(natural?: { width: number; height: number }): { width: number; height: number } {
  const fallback = defaultSizeFor('image');
  if (!natural || !(natural.width > 0) || !(natural.height > 0)) return fallback;
  const ratio = natural.width / natural.height;
  const long = 280;
  let width = ratio >= 1 ? long : long * ratio;
  let height = ratio >= 1 ? long / ratio : long;
  const min = minSizeFor('image');
  const grow = Math.max(min.width / width, min.height / height, 1);
  width = Math.min(MAX_CARD_EDGE, Math.round(width * grow));
  height = Math.min(MAX_CARD_EDGE, Math.round(height * grow));
  return { width, height };
}

export function addSubboard(
  doc: WhiteboardDocument,
  parentId: string,
  title: string,
  position: { x: number; y: number },
  ids?: { cardId?: string; boardId?: string },
): DocResult {
  const parent = getBoard(doc, parentId);
  if (!parent) return fail(MSG.missingBoard);
  if (doc.boards.length >= MAX_BOARDS) return fail(MSG.tooManyBoards);
  if (parent.cards.length >= MAX_CARDS_PER_BOARD) return fail(MSG.tooManyCards);
  if (boardDepth(doc, parentId) >= MAX_BOARD_DEPTH) return fail(MSG.tooDeep);
  const size = defaultSizeFor('board');
  const geometry = geometryError(position.x, position.y, size.width, size.height, 'board');
  if (geometry) return fail(geometry);
  const used = usedIds(doc);
  const childId = takeId(ids?.boardId, used);
  const cardId = takeId(ids?.cardId, used);
  if (!childId || !cardId) return fail(MSG.duplicateId);
  const card: BoardCard = {
    id: cardId,
    type: 'board',
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
    boardId: childId,
    columnId: null,
  };
  const child: Board = {
    id: childId,
    title: normalizeTitle(title),
    parentBoardId: parentId,
    cards: [],
    connectors: [],
    lines: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  return {
    ok: true,
    doc: {
      ...doc,
      boards: [...doc.boards.map((board) => (board.id === parentId ? { ...board, cards: [...board.cards, card] } : board)), child],
    },
  };
}

export function placeCardTopLeft(
  center: { x: number; y: number },
  type: Card['type'],
  stackIndex: number,
): { x: number; y: number } {
  return placementTopLeft(center, defaultSizeFor(type), stackIndex);
}

export function updateText(doc: WhiteboardDocument, boardId: string, cardId: string, rawText: string): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return fail(MSG.missingBoard);
  const text = normalizeStoredText(rawText);
  if (!text.ok) return text;
  const index = board.cards.findIndex((card) => card.id === cardId && card.type === 'text');
  if (index < 0) return fail(MSG.invalidStructure);
  const current = board.cards[index];
  if (current.type !== 'text') return fail(MSG.invalidStructure);
  if (current.text === text.text) return { ok: true, doc };
  const cards = board.cards.slice();
  cards[index] = { ...current, text: text.text };
  return { ok: true, doc: withBoard(doc, boardId, { ...board, cards }) };
}

export function renameBoard(doc: WhiteboardDocument, boardId: string, title: string): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return fail(MSG.missingBoard);
  const nextTitle = normalizeTitle(title);
  if (board.title === nextTitle) return { ok: true, doc };
  return { ok: true, doc: withBoard(doc, boardId, { ...board, title: nextTitle }) };
}

export function updateViewport(
  doc: WhiteboardDocument,
  boardId: string,
  viewport: { x: number; y: number; zoom: number },
): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return fail(MSG.missingBoard);
  if (!Number.isFinite(viewport.x) || !Number.isFinite(viewport.y) || !Number.isFinite(viewport.zoom)) {
    return fail(MSG.badGeometry);
  }
  const next = {
    x: Math.min(VIEWPORT_LIMIT, Math.max(-VIEWPORT_LIMIT, viewport.x)),
    y: Math.min(VIEWPORT_LIMIT, Math.max(-VIEWPORT_LIMIT, viewport.y)),
    zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom)),
  };
  const same =
    Math.abs(board.viewport.x - next.x) < 0.01 &&
    Math.abs(board.viewport.y - next.y) < 0.01 &&
    Math.abs(board.viewport.zoom - next.zoom) < 0.0001;
  if (same) return { ok: true, doc };
  return { ok: true, doc: withBoard(doc, boardId, { ...board, viewport: next }) };
}

export function moveCards(
  doc: WhiteboardDocument,
  boardId: string,
  updates: { id: string; x: number; y: number }[],
): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return fail(MSG.missingBoard);
  const byId = new Map(updates.map((item) => [item.id, item]));
  let changed = false;
  const cards = board.cards.map((card) => {
    const update = byId.get(card.id);
    if (!update) return card;
    if (!Number.isFinite(update.x) || !Number.isFinite(update.y)) return card;
    const x = Math.min(COORD_LIMIT, Math.max(-COORD_LIMIT, update.x));
    const y = Math.min(COORD_LIMIT, Math.max(-COORD_LIMIT, update.y));
    if (x === card.x && y === card.y) return card;
    changed = true;
    return { ...card, x, y };
  });
  if (!changed) return { ok: true, doc };
  return { ok: true, doc: withBoard(doc, boardId, { ...board, cards }) };
}

export function resizeCards(
  doc: WhiteboardDocument,
  boardId: string,
  updates: { id: string; width: number; height: number }[],
): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return fail(MSG.missingBoard);
  const byId = new Map(updates.map((item) => [item.id, item]));
  let changed = false;
  const cards = board.cards.map((card) => {
    const update = byId.get(card.id);
    if (!update) return card;
    if (!Number.isFinite(update.width) || !Number.isFinite(update.height)) return card;
    const min = minSizeFor(card.type);
    const width = Math.min(MAX_CARD_EDGE, Math.max(min.width, update.width));
    const height = Math.min(MAX_CARD_EDGE, Math.max(min.height, update.height));
    if (width === card.width && height === card.height) return card;
    changed = true;
    return { ...card, width, height };
  });
  if (!changed) return { ok: true, doc };
  return { ok: true, doc: withBoard(doc, boardId, { ...board, cards }) };
}

function descendantIds(doc: WhiteboardDocument, boardId: string): string[] {
  const result: string[] = [];
  const stack = [boardId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    const board = getBoard(doc, id);
    if (!board) continue;
    for (const card of board.cards) {
      if (card.type === 'board') stack.push(card.boardId);
    }
  }
  return result;
}

function referencedFiles(boards: Board[]): Set<string> {
  const used = new Set<string>();
  for (const board of boards) {
    for (const card of board.cards) {
      if (card.type === 'image') used.add(card.fileId);
    }
  }
  return used;
}

export function deleteCards(doc: WhiteboardDocument, boardId: string, cardIds: string[]): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return fail(MSG.missingBoard);
  const remove = new Set(cardIds);
  if (remove.size === 0) return { ok: true, doc };
  const dropBoards = new Set<string>();
  for (const card of board.cards) {
    if (!remove.has(card.id) || card.type !== 'board') continue;
    for (const id of descendantIds(doc, card.boardId)) dropBoards.add(id);
  }
  const removedCardIds = new Set(board.cards.filter((card) => remove.has(card.id)).map((card) => card.id));
  const cards = board.cards
    .filter((card) => !remove.has(card.id))
    .map((card) => {
      if (card.type === 'column') return { ...card, childIds: card.childIds.filter((id) => !removedCardIds.has(id)) };
      if (card.columnId && removedCardIds.has(card.columnId)) return { ...card, columnId: null };
      return card;
    });
  const connectors = board.connectors.filter(
    (connector) => !removedCardIds.has(connector.source) && !removedCardIds.has(connector.target),
  );
  const lines = (board.lines ?? []).filter((line) => ![...removedCardIds].some((id) => lineUsesCard(line, id)));
  const boards = doc.boards
    .map((item) => (item.id === boardId ? { ...item, cards, connectors, lines } : item))
    .filter((item) => !dropBoards.has(item.id));
  const used = referencedFiles(boards);
  return { ok: true, doc: { ...doc, boards, files: doc.files.filter((file) => used.has(file.id)) } };
}

function parseHandle(value: string | null | undefined): HandleSide | null | 'invalid' {
  if (value == null || value === '') return null;
  if (HANDLES.has(value as HandleSide)) return value as HandleSide;
  return 'invalid';
}

export function addConnector(
  doc: WhiteboardDocument,
  boardId: string,
  input: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null },
  ids?: { connectorId?: string },
): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return fail(MSG.missingBoard);
  if ((board.lines ?? []).length >= MAX_CONNECTORS_PER_BOARD) return fail(MSG.tooManyConnectors);
  if (!input.source || !input.target) return fail(MSG.badConnector);
  if (input.source === input.target) return fail(MSG.selfConnect);
  const cardIds = new Set(board.cards.map((card) => card.id));
  if (!cardIds.has(input.source) || !cardIds.has(input.target)) return fail(MSG.badConnector);
  const sourceHandle = parseHandle(input.sourceHandle);
  const targetHandle = parseHandle(input.targetHandle);
  if (sourceHandle === 'invalid' || targetHandle === 'invalid') return fail(MSG.badConnector);
  const duplicate = board.connectors.some(
    (connector) =>
      connector.source === input.source &&
      connector.target === input.target &&
      connector.sourceHandle === sourceHandle &&
      connector.targetHandle === targetHandle,
  );
  if (duplicate) return fail(MSG.duplicateConnector);
  const connectorId = takeId(ids?.connectorId, usedIds(doc));
  if (!connectorId) return fail(MSG.duplicateId);
  const line: CanvasLine = {
    id: connectorId,
    source: { kind: 'card', cardId: input.source, side: sourceHandle ?? 'right', t: 0.5 },
    target: { kind: 'card', cardId: input.target, side: targetHandle ?? 'left', t: 0.5 },
    color: 'ink',
    arrowhead: true,
  };
  const duplicateLine = (board.lines ?? []).some(
    (item) => JSON.stringify(item.source) === JSON.stringify(line.source) && JSON.stringify(item.target) === JSON.stringify(line.target),
  );
  if (duplicateLine) return fail(MSG.duplicateConnector);
  return {
    ok: true,
    doc: withBoard(doc, boardId, { ...board, lines: [...(board.lines ?? []), line] }),
  };
}

export function deleteConnectors(doc: WhiteboardDocument, boardId: string, connectorIds: string[]): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return fail(MSG.missingBoard);
  const remove = new Set(connectorIds);
  const connectors = board.connectors.filter((connector) => !remove.has(connector.id));
  const lines = (board.lines ?? []).filter((line) => !remove.has(line.id));
  if (connectors.length === board.connectors.length && lines.length === (board.lines ?? []).length) return { ok: true, doc };
  return { ok: true, doc: withBoard(doc, boardId, { ...board, connectors, lines }) };
}

export function addColumn(
  doc: WhiteboardDocument,
  boardId: string,
  position: { x: number; y: number },
  ids?: { cardId?: string },
): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return fail(MSG.missingBoard);
  if (board.cards.length >= MAX_CARDS_PER_BOARD) return fail(MSG.tooManyCards);
  const size = defaultSizeFor('column');
  const geometry = geometryError(position.x, position.y, size.width, size.height, 'column');
  if (geometry) return fail(geometry);
  const cardId = takeId(ids?.cardId, usedIds(doc));
  if (!cardId) return fail(MSG.duplicateId);
  const card: ColumnCard = {
    id: cardId,
    type: 'column',
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
    title: 'Spalte',
    collapsed: false,
    childIds: [],
  };
  return { ok: true, doc: withBoard(doc, boardId, { ...board, cards: [...board.cards, card] }) };
}

export function addTodoCard(
  doc: WhiteboardDocument,
  boardId: string,
  position: { x: number; y: number },
  ids?: { cardId?: string },
): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return fail(MSG.missingBoard);
  if (board.cards.length >= MAX_CARDS_PER_BOARD) return fail(MSG.tooManyCards);
  const size = defaultSizeFor('todo');
  const geometry = geometryError(position.x, position.y, size.width, size.height, 'todo');
  if (geometry) return fail(geometry);
  const cardId = takeId(ids?.cardId, usedIds(doc));
  if (!cardId) return fail(MSG.duplicateId);
  const card: TodoCard = {
    id: cardId,
    type: 'todo',
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
    title: 'Zu tun',
    items: [{ id: crypto.randomUUID(), text: '', done: false }],
    columnId: null,
  };
  return { ok: true, doc: withBoard(doc, boardId, { ...board, cards: [...board.cards, card] }) };
}
