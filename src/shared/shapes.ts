import { createId } from './ids';
import { COORD_LIMIT, MAX_CARDS_PER_BOARD, MSG, defaultSizeFor } from './limits';
import type { Board, Card, DocResult, NoteColor, ShapeCard, ShapeKind, SwatchCard, WhiteboardDocument } from './model';
import { normalizeStoredText } from './text';

function getBoard(doc: WhiteboardDocument, id: string): Board | undefined {
  return doc.boards.find((board) => board.id === id);
}

function addCard(doc: WhiteboardDocument, boardId: string, card: Card): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return { ok: false, error: MSG.missingBoard };
  if (board.cards.length >= MAX_CARDS_PER_BOARD) return { ok: false, error: MSG.tooManyCards };
  if (!Number.isFinite(card.x) || !Number.isFinite(card.y) || Math.abs(card.x) > COORD_LIMIT || Math.abs(card.y) > COORD_LIMIT) {
    return { ok: false, error: MSG.badGeometry };
  }
  return { ok: true, doc: { ...doc, boards: doc.boards.map((item) => (item.id === boardId ? { ...board, cards: [...board.cards, card] } : item)) } };
}

function patchCard<T extends Card>(doc: WhiteboardDocument, boardId: string, cardId: string, type: T['type'], change: (card: T) => T | null): DocResult {
  const board = getBoard(doc, boardId);
  const card = board?.cards.find((item) => item.id === cardId);
  if (!board || !card || card.type !== type) return { ok: false, error: MSG.invalidStructure };
  const next = change(card as T);
  if (!next) return { ok: false, error: MSG.invalidStructure };
  return { ok: true, doc: { ...doc, boards: doc.boards.map((item) => (item.id === boardId ? { ...board, cards: board.cards.map((entry) => (entry.id === cardId ? next : entry)) } : item)) } };
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

export function addSwatchCard(doc: WhiteboardDocument, boardId: string, position: { x: number; y: number }, color = '#2f5d9b'): DocResult {
  const size = defaultSizeFor('swatch');
  const card: SwatchCard = { id: createId(), type: 'swatch', x: position.x, y: position.y, width: size.width, height: size.height, color: isHexColor(color) ? color.toLowerCase() : '#2f5d9b', label: '', columnId: null };
  return addCard(doc, boardId, card);
}

export function updateSwatch(doc: WhiteboardDocument, boardId: string, cardId: string, patch: { color?: string; label?: string }): DocResult {
  return patchCard<SwatchCard>(doc, boardId, cardId, 'swatch', (card) => {
    if (patch.color !== undefined && !isHexColor(patch.color)) return null;
    return {
      ...card,
      color: patch.color !== undefined ? patch.color.toLowerCase() : card.color,
      label: patch.label !== undefined ? patch.label.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 80) : card.label,
    };
  });
}

export function addShapeCard(doc: WhiteboardDocument, boardId: string, shape: ShapeKind, position: { x: number; y: number }, color: NoteColor = 'blue'): DocResult {
  const size = defaultSizeFor('shape');
  const square = shape === 'ellipse' || shape === 'diamond' ? { width: 160, height: 160 } : size;
  const card: ShapeCard = { id: createId(), type: 'shape', x: position.x, y: position.y, width: square.width, height: square.height, shape, color, text: '', columnId: null };
  return addCard(doc, boardId, card);
}

export function setShapeText(doc: WhiteboardDocument, boardId: string, cardId: string, raw: string): DocResult {
  const text = normalizeStoredText(raw);
  if (!text.ok) return text;
  return patchCard<ShapeCard>(doc, boardId, cardId, 'shape', (card) => ({ ...card, text: text.text }));
}
