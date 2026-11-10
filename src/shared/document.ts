import { inspectImageDataUrl } from './images';
import { isValidId } from './ids';
import {
  APP_VERSION,
  COORD_LIMIT,
  FORMAT,
  FORMAT_VERSION,
  MAX_BOARD_DEPTH,
  MAX_BOARDS,
  MAX_CARD_EDGE,
  MAX_CARDS_PER_BOARD,
  MAX_CONNECTORS_PER_BOARD,
  MAX_DOCUMENT_BYTES,
  MAX_FILES,
  MAX_TEXT_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_ZOOM,
  MIN_ZOOM,
  MSG,
  NOTE_COLOR_ORDER,
  STICKER_KINDS,
  VIEWPORT_LIMIT,
  minSizeFor,
} from './limits';
import type {
  Board,
  BoardCard,
  Card,
  HandleSide,
  CanvasLine,
  ImageCard,
  ImageFile,
  LineAnchor,
  NoteColor,
  StickerCard,
  StickerKind,
  TextCard,
  TextStyle,
  ThemeName,
  WhiteboardDocument,
} from './model';
import { codePointLength } from './text';

const HANDLES = new Set<HandleSide>(['top', 'right', 'bottom', 'left']);

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(text: string): unknown {
  return JSON.parse(text, (key, value: unknown) => {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return undefined;
    return value;
  }) as unknown;
}

function numberIn(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return null;
  return value;
}

function stringField(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  if (cleaned !== value) return null;
  if (codePointLength(cleaned) < 1 || codePointLength(cleaned) > max) return null;
  return cleaned;
}

function idField(value: unknown): string | null {
  if (typeof value !== 'string' || !isValidId(value)) return null;
  return value;
}

function claim(ids: Set<string>, id: string): boolean {
  if (ids.has(id)) return false;
  ids.add(id);
  return true;
}

function readHandle(value: unknown): HandleSide | null | undefined {
  if (value == null) return null;
  if (typeof value === 'string' && HANDLES.has(value as HandleSide)) return value as HandleSide;
  return undefined;
}

function readCard(value: unknown, ids: Set<string>): Card | null {
  if (!isRecord(value)) return null;
  const id = idField(value.id);
  const type = value.type;
  if (!id || !claim(ids, id)) return null;
  const x = numberIn(value.x, -COORD_LIMIT, COORD_LIMIT);
  const y = numberIn(value.y, -COORD_LIMIT, COORD_LIMIT);
  if (x == null || y == null) return null;
  if (type !== 'text' && type !== 'image' && type !== 'board' && type !== 'sticker' && type !== 'column' && type !== 'todo') {
    return null;
  }
  const min = minSizeFor(type);
  const width = numberIn(value.width, min.width, MAX_CARD_EDGE);
  const height = numberIn(value.height, min.height, MAX_CARD_EDGE);
  if (width == null || height == null) return null;
  if (type === 'text') {
    if (typeof value.text !== 'string') return null;
    const text = value.text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    if (text !== value.text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')) return null;
    if (codePointLength(text) > MAX_TEXT_LENGTH) return null;
    const style: TextStyle =
      value.style === 'heading' || value.style === 'subheading' || value.style === 'note' ? value.style : 'note';
    const color = readNoteColor(value.color, style);
    const card: TextCard = { id, type: 'text', x, y, width, height, text, style, color, columnId: readColumnId(value.columnId) };
    return card;
  }
  if (type === 'image') {
    const fileId = idField(value.fileId);
    if (!fileId) return null;
    const card: ImageCard = { id, type: 'image', x, y, width, height, fileId, columnId: readColumnId(value.columnId) };
    return card;
  }
  if (type === 'sticker') {
    const kind = readStickerKind(value.kind);
    if (!kind) return null;
    const card: StickerCard = { id, type: 'sticker', x, y, width, height, kind, columnId: readColumnId(value.columnId) };
    return card;
  }
  if (type === 'column') {
    const title = typeof value.title === 'string' && value.title.trim() ? value.title.trim().slice(0, 80) : 'Spalte';
    const childIds = Array.isArray(value.childIds) ? value.childIds.filter((item): item is string => typeof item === 'string' && isValidId(item)) : [];
    return { id, type: 'column', x, y, width, height, title, collapsed: value.collapsed === true, childIds };
  }
  if (type === 'todo') {
    const title = typeof value.title === 'string' ? value.title.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 120) : 'Zu tun';
    const items = Array.isArray(value.items)
      ? value.items.flatMap((item) => {
          if (!isRecord(item) || typeof item.text !== 'string') return [];
          const itemId = typeof item.id === 'string' && isValidId(item.id) ? item.id : null;
          if (!itemId || !claim(ids, itemId)) return [];
          return [{ id: itemId, text: item.text.slice(0, 400), done: item.done === true }];
        })
      : [];
    return { id, type: 'todo', x, y, width, height, title, items, columnId: readColumnId(value.columnId) };
  }
  const boardId = idField(value.boardId);
  if (!boardId) return null;
  const card: BoardCard = { id, type: 'board', x, y, width, height, boardId, columnId: readColumnId(value.columnId) };
  return card;
}

function readColumnId(value: unknown): string | null {
  return typeof value === 'string' && isValidId(value) ? value : null;
}

function readNoteColor(value: unknown, style: TextStyle): NoteColor | null {
  const allowed = (NOTE_COLOR_ORDER as readonly string[]).includes(typeof value === 'string' ? value : '');
  if (style !== 'note') return allowed ? (value as NoteColor) : null;
  return allowed ? (value as NoteColor) : 'yellow';
}

function readStickerKind(value: unknown): StickerKind | null {
  if (typeof value === 'string' && (STICKER_KINDS as readonly string[]).includes(value)) return value as StickerKind;
  return null;
}

function readBoard(value: unknown, ids: Set<string>): Board | null {
  if (!isRecord(value) || !Array.isArray(value.cards)) return null;
  if (value.connectors != null && !Array.isArray(value.connectors)) return null;
  const id = idField(value.id);
  if (!id || !claim(ids, id)) return null;
  const title = stringField(value.title, MAX_TITLE_LENGTH);
  if (!title || title.trim().length === 0) return null;
  let parentBoardId: string | null;
  if (value.parentBoardId === null) parentBoardId = null;
  else {
    const parent = idField(value.parentBoardId);
    if (!parent) return null;
    parentBoardId = parent;
  }
  if (!isRecord(value.viewport)) return null;
  const vx = numberIn(value.viewport.x, -VIEWPORT_LIMIT, VIEWPORT_LIMIT);
  const vy = numberIn(value.viewport.y, -VIEWPORT_LIMIT, VIEWPORT_LIMIT);
  const zoom = numberIn(value.viewport.zoom, MIN_ZOOM, MAX_ZOOM);
  if (vx == null || vy == null || zoom == null) return null;
  if (value.cards.length > MAX_CARDS_PER_BOARD || (value.connectors ?? []).length > MAX_CONNECTORS_PER_BOARD) return null;
  const cards: Card[] = [];
  for (const entry of value.cards) {
    const card = readCard(entry, ids);
    if (!card) return null;
    cards.push(card);
  }
  const cardIds = new Set(cards.map((card) => card.id));
  const lines = readLines(value.lines, value.connectors ?? [], cardIds, ids);
  if (!lines || lines.length > MAX_CONNECTORS_PER_BOARD) return null;
  return {
    id,
    title,
    parentBoardId,
    cards,
    connectors: [],
    lines,
    viewport: { x: vx, y: vy, zoom },
  };
}

function readLines(linesValue: unknown, connectorsValue: unknown, cardIds: Set<string>, ids: Set<string>): CanvasLine[] | null {
  if (Array.isArray(linesValue) && linesValue.length > 0) {
    const lines: CanvasLine[] = [];
    for (const entry of linesValue) {
      const line = readLine(entry, cardIds, ids);
      if (!line) return null;
      lines.push(line);
    }
    return lines;
  }
  if (!Array.isArray(connectorsValue)) return [];
  const lines: CanvasLine[] = [];
  for (const entry of connectorsValue) {
    if (!isRecord(entry)) return null;
    const id = idField(entry.id);
    const source = idField(entry.source);
    const target = idField(entry.target);
    if (!id || !source || !target || !claim(ids, id)) return null;
    if (source === target || !cardIds.has(source) || !cardIds.has(target)) return null;
    const sourceHandle = readHandle(entry.sourceHandle);
    const targetHandle = readHandle(entry.targetHandle);
    if (sourceHandle === undefined || targetHandle === undefined) return null;
    lines.push({
      id,
      source: { kind: 'card', cardId: source, side: sourceHandle ?? 'right', t: 0.5 },
      target: { kind: 'card', cardId: target, side: targetHandle ?? 'left', t: 0.5 },
      color: 'ink',
      arrowhead: true,
    });
  }
  return lines;
}

function readLine(value: unknown, cardIds: Set<string>, ids: Set<string>): CanvasLine | null {
  if (!isRecord(value)) return null;
  const id = idField(value.id);
  if (!id || !claim(ids, id)) return null;
  const source = readAnchor(value.source, cardIds);
  const target = readAnchor(value.target, cardIds);
  if (!source || !target) return null;
  if (source.kind === 'card' && target.kind === 'card' && source.cardId === target.cardId) return null;
  const color = value.color === 'ink' || (NOTE_COLOR_ORDER as readonly string[]).includes(String(value.color)) ? value.color : 'ink';
  return {
    id,
    source,
    target,
    color: color as CanvasLine['color'],
    arrowhead: value.arrowhead !== false,
  };
}

function readAnchor(value: unknown, cardIds: Set<string>): LineAnchor | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'point' && typeof value.x === 'number' && typeof value.y === 'number' && Number.isFinite(value.x) && Number.isFinite(value.y)) {
    return { kind: 'point', x: value.x, y: value.y };
  }
  if (value.kind === 'card' && typeof value.cardId === 'string' && cardIds.has(value.cardId)) {
    const side = readHandle(value.side);
    if (!side) return null;
    const t = typeof value.t === 'number' && Number.isFinite(value.t) ? Math.min(1, Math.max(0, value.t)) : 0.5;
    return { kind: 'card', cardId: value.cardId, side, t };
  }
  return null;
}

function readFile(value: unknown, ids: Set<string>): ImageFile | null {
  if (!isRecord(value)) return null;
  const id = idField(value.id);
  if (!id || !claim(ids, id)) return null;
  if (typeof value.fileName !== 'string' || typeof value.dataUrl !== 'string') return null;
  const inspected = inspectImageDataUrl(value.dataUrl, value.fileName);
  if (!inspected.ok) return null;
  if (typeof value.byteSize !== 'number' || value.byteSize !== inspected.image.byteSize) return null;
  if (value.mimeType !== inspected.image.mimeType) return null;
  return {
    id,
    fileName: inspected.image.fileName,
    mimeType: inspected.image.mimeType,
    dataUrl: inspected.image.dataUrl,
    byteSize: inspected.image.byteSize,
  };
}

function treeError(doc: WhiteboardDocument): string | null {
  const boards = new Map(doc.boards.map((board) => [board.id, board]));
  const root = boards.get(doc.rootBoardId);
  if (!root || root.parentBoardId !== null) return MSG.invalidStructure;
  for (const board of doc.boards) {
    if (board.id === doc.rootBoardId) continue;
    if (!board.parentBoardId || !boards.has(board.parentBoardId)) return MSG.orphanBoard;
    const seen = new Set<string>();
    let cursor: Board | undefined = board;
    let hops = 0;
    while (cursor?.parentBoardId) {
      if (seen.has(cursor.id)) return MSG.cycle;
      seen.add(cursor.id);
      hops += 1;
      if (hops > MAX_BOARD_DEPTH) return MSG.tooDeep;
      cursor = boards.get(cursor.parentBoardId);
      if (!cursor) return MSG.invalidStructure;
    }
  }
  const referenced = new Map<string, string>();
  for (const board of doc.boards) {
    for (const card of board.cards) {
      if (card.type !== 'board') continue;
      if (card.boardId === board.id || card.boardId === doc.rootBoardId) return MSG.invalidStructure;
      const child = boards.get(card.boardId);
      if (!child || child.parentBoardId !== board.id) return MSG.invalidStructure;
      if (referenced.has(card.boardId)) return MSG.invalidStructure;
      referenced.set(card.boardId, board.id);
    }
    for (const connector of board.connectors) {
      const ids = new Set(board.cards.map((card) => card.id));
      if (!ids.has(connector.source) || !ids.has(connector.target)) return MSG.danglingEdge;
    }
  }
  for (const board of doc.boards) {
    if (board.id === doc.rootBoardId) continue;
    if (referenced.get(board.id) !== board.parentBoardId) return MSG.orphanBoard;
  }
  const fileIds = new Set(doc.files.map((file) => file.id));
  const used = new Set<string>();
  for (const board of doc.boards) {
    for (const card of board.cards) {
      if (card.type !== 'image') continue;
      if (!fileIds.has(card.fileId)) return MSG.badImage;
      used.add(card.fileId);
    }
  }
  if (doc.files.some((file) => !used.has(file.id))) return MSG.unusedImage;
  for (const board of doc.boards) {
    for (const card of board.cards) {
      if (card.type === 'column') {
        for (const childId of card.childIds) {
          const child = board.cards.find((item) => item.id === childId);
          if (!child || child.type === 'column' || child.columnId !== card.id) return MSG.invalidStructure;
        }
      } else if (card.columnId) {
        const column = board.cards.find((item) => item.id === card.columnId);
        if (!column || column.type !== 'column' || !column.childIds.includes(card.id)) return MSG.invalidStructure;
      }
    }
    for (const line of board.lines) {
      if (!anchorOk(line.source, board.cards) || !anchorOk(line.target, board.cards)) return MSG.badLine;
    }
  }
  return null;
}

function anchorOk(anchor: LineAnchor, cards: Card[]): boolean {
  if (anchor.kind === 'point') return Number.isFinite(anchor.x) && Number.isFinite(anchor.y);
  return cards.some((card) => card.id === anchor.cardId);
}

export function validateDocument(
  input: unknown,
  options?: { maxBytes?: number },
): { ok: true; doc: WhiteboardDocument } | { ok: false; error: string } {
  const maxBytes = options?.maxBytes ?? MAX_DOCUMENT_BYTES;
  let value = input;
  if (typeof input === 'string') {
    if (utf8ByteLength(input) > maxBytes) return { ok: false, error: MSG.fileTooBig };
    try {
      value = parseJson(input);
    } catch {
      return { ok: false, error: MSG.invalidJson };
    }
  }
  if (!isRecord(value)) return { ok: false, error: MSG.invalidDoc };
  if (value.format !== FORMAT) return { ok: false, error: MSG.invalidDoc };
  if (value.version !== 1 && value.version !== 2 && value.version !== FORMAT_VERSION) {
    return { ok: false, error: MSG.unsupportedVersion };
  }
  const theme: ThemeName = value.theme === 'dark' ? 'dark' : 'light';
  const rootBoardId = idField(value.rootBoardId);
  if (!rootBoardId) return { ok: false, error: MSG.invalidStructure };
  if (!Array.isArray(value.boards) || !Array.isArray(value.files)) return { ok: false, error: MSG.invalidStructure };
  if (value.boards.length < 1 || value.boards.length > MAX_BOARDS) return { ok: false, error: MSG.invalidStructure };
  if (value.files.length > MAX_FILES) return { ok: false, error: MSG.tooManyFiles };
  const appVersion =
    typeof value.appVersion === 'string' && value.appVersion.length > 0 && value.appVersion.length <= 20
      ? value.appVersion
      : APP_VERSION;
  const ids = new Set<string>();
  const boards: Board[] = [];
  for (const entry of value.boards) {
    const board = readBoard(entry, ids);
    if (!board) return { ok: false, error: MSG.invalidStructure };
    boards.push(board);
  }
  if (!boards.some((board) => board.id === rootBoardId)) return { ok: false, error: MSG.invalidStructure };
  const files: ImageFile[] = [];
  for (const entry of value.files) {
    const file = readFile(entry, ids);
    if (!file) return { ok: false, error: MSG.badImage };
    files.push(file);
  }
  const doc: WhiteboardDocument = {
    format: FORMAT,
    version: FORMAT_VERSION,
    appVersion,
    rootBoardId,
    theme,
    boards,
    files,
  };
  const tree = treeError(doc);
  if (tree) return { ok: false, error: tree };
  const serialized = serializeDocument(doc);
  if (utf8ByteLength(serialized) > maxBytes) return { ok: false, error: MSG.fileTooBig };
  return { ok: true, doc };
}

export function serializeDocument(doc: WhiteboardDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function prepareDocumentForDisk(
  json: string,
): { ok: true; json: string; doc: WhiteboardDocument } | { ok: false; error: string } {
  const validated = validateDocument(json);
  if (!validated.ok) return validated;
  return { ok: true, json: serializeDocument(validated.doc), doc: validated.doc };
}
