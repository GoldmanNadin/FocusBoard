import { createId } from './ids';
import { COORD_LIMIT, MAX_CARDS_PER_BOARD, MAX_SKETCH_POINTS, MAX_SKETCH_STROKES, MSG, defaultSizeFor } from './limits';
import type { Board, DocResult, SketchCard, SketchStroke, WhiteboardDocument } from './model';

function getBoard(doc: WhiteboardDocument, id: string): Board | undefined {
  return doc.boards.find((board) => board.id === id);
}

function withSketch(doc: WhiteboardDocument, board: Board, next: SketchCard): WhiteboardDocument {
  const updated = { ...board, cards: board.cards.map((card) => (card.id === next.id ? next : card)) };
  return { ...doc, boards: doc.boards.map((item) => (item.id === board.id ? updated : item)) };
}

function sketchOf(doc: WhiteboardDocument, boardId: string, cardId: string): { board: Board; card: SketchCard } | null {
  const board = getBoard(doc, boardId);
  const card = board?.cards.find((item) => item.id === cardId);
  return board && card?.type === 'sketch' ? { board, card } : null;
}

export function addSketchCard(doc: WhiteboardDocument, boardId: string, position: { x: number; y: number }, ids?: { cardId?: string }): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return { ok: false, error: MSG.missingBoard };
  if (board.cards.length >= MAX_CARDS_PER_BOARD) return { ok: false, error: MSG.tooManyCards };
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || Math.abs(position.x) > COORD_LIMIT || Math.abs(position.y) > COORD_LIMIT) {
    return { ok: false, error: MSG.badGeometry };
  }
  const size = defaultSizeFor('sketch');
  const card: SketchCard = { id: ids?.cardId ?? createId(), type: 'sketch', x: position.x, y: position.y, width: size.width, height: size.height, strokes: [], columnId: null };
  return { ok: true, doc: { ...doc, boards: doc.boards.map((item) => (item.id === board.id ? { ...board, cards: [...board.cards, card] } : item)) } };
}

/** Drops points that are closer than ~0.3 % of the card to the previous one and clamps everything to 0…1. */
export function simplifyPoints(points: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = Math.min(1, Math.max(0, points[i]!));
    const y = Math.min(1, Math.max(0, points[i + 1]!));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const px = out[out.length - 2];
    const py = out[out.length - 1];
    if (px !== undefined && py !== undefined && Math.hypot(x - px, y - py) < 0.003) continue;
    out.push(Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000);
  }
  if (out.length === 2) out.push(out[0]!, out[1]!);
  return out;
}

export function addStroke(doc: WhiteboardDocument, boardId: string, cardId: string, stroke: SketchStroke): DocResult {
  const found = sketchOf(doc, boardId, cardId);
  if (!found) return { ok: false, error: MSG.invalidStructure };
  const points = simplifyPoints(stroke.points);
  if (points.length < 2) return { ok: true, doc };
  const used = found.card.strokes.reduce((sum, item) => sum + item.points.length / 2, 0);
  if (found.card.strokes.length >= MAX_SKETCH_STROKES || used + points.length / 2 > MAX_SKETCH_POINTS) {
    return { ok: false, error: 'Diese Skizze ist voll. Bitte eine neue Skizze anlegen.' };
  }
  const width = Math.min(24, Math.max(1, stroke.width));
  return { ok: true, doc: withSketch(doc, found.board, { ...found.card, strokes: [...found.card.strokes, { color: stroke.color, width, points }] }) };
}

export function removeLastStroke(doc: WhiteboardDocument, boardId: string, cardId: string): DocResult {
  const found = sketchOf(doc, boardId, cardId);
  if (!found || found.card.strokes.length === 0) return { ok: true, doc };
  return { ok: true, doc: withSketch(doc, found.board, { ...found.card, strokes: found.card.strokes.slice(0, -1) }) };
}
