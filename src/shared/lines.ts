import { COORD_LIMIT, MAX_CONNECTORS_PER_BOARD, MSG } from './limits';
import type { Board, CanvasLine, Card, DocResult, HandleSide, LineAnchor, LineColor, WhiteboardDocument } from './model';
import { isColumn } from './columns';

function getBoard(doc: WhiteboardDocument, id: string): Board | undefined {
  return doc.boards.find((board) => board.id === id);
}

const SIDES: HandleSide[] = ['top', 'right', 'bottom', 'left'];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function withBoard(doc: WhiteboardDocument, boardId: string, board: Board): WhiteboardDocument {
  return { ...doc, boards: doc.boards.map((item) => (item.id === boardId ? board : item)) };
}

export const LINE_END_GAP = 6;

export function visibleLineEnds(
  start: { x: number; y: number },
  end: { x: number; y: number },
  sourceKind: LineAnchor['kind'],
  targetKind: LineAnchor['kind'],
): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < LINE_END_GAP * 2 + 1) return { start, end };
  const ux = dx / length;
  const uy = dy / length;
  return {
    start: sourceKind === 'card' ? { x: start.x + ux * LINE_END_GAP, y: start.y + uy * LINE_END_GAP } : start,
    end: targetKind === 'card' ? { x: end.x - ux * LINE_END_GAP, y: end.y - uy * LINE_END_GAP } : end,
  };
}

export function anchorPosition(anchor: LineAnchor, cards: Card[]): { x: number; y: number } | null {
  if (anchor.kind === 'point') {
    if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return null;
    return { x: anchor.x, y: anchor.y };
  }
  const card = cards.find((item) => item.id === anchor.cardId);
  if (!card) return null;
  const host =
    card.type !== 'column' && card.columnId
      ? cards.find((item) => item.id === card.columnId && isColumn(item) && item.collapsed)
      : undefined;
  const box = host && isColumn(host) ? host : card;
  const t = clamp01(anchor.t);
  if (anchor.side === 'left') return { x: box.x, y: box.y + box.height * t };
  if (anchor.side === 'right') return { x: box.x + box.width, y: box.y + box.height * t };
  if (anchor.side === 'top') return { x: box.x + box.width * t, y: box.y };
  return { x: box.x + box.width * t, y: box.y + box.height };
}

export function snapAnchor(point: { x: number; y: number }, cards: Card[], zoom: number): LineAnchor {
  const threshold = 22 / (zoom || 1);
  let best: { dist: number; anchor: LineAnchor } | null = null;
  for (const card of cards) {
    if (card.type !== 'column' && card.columnId) {
      const parent = cards.find((item) => item.id === card.columnId);
      if (parent && isColumn(parent) && parent.collapsed) continue;
    }
    const candidates: { side: HandleSide; x: number; y: number; t: number }[] = [
      { side: 'top', x: point.x, y: card.y, t: (point.x - card.x) / card.width },
      { side: 'bottom', x: point.x, y: card.y + card.height, t: (point.x - card.x) / card.width },
      { side: 'left', x: card.x, y: point.y, t: (point.y - card.y) / card.height },
      { side: 'right', x: card.x + card.width, y: point.y, t: (point.y - card.y) / card.height },
    ];
    for (const candidate of candidates) {
      if (candidate.t < -0.05 || candidate.t > 1.05) continue;
      const t = clamp01(candidate.t);
      const dist = Math.hypot(point.x - candidate.x, point.y - candidate.y);
      if (dist > threshold) continue;
      if (!best || dist < best.dist) {
        best = { dist, anchor: { kind: 'card', cardId: card.id, side: candidate.side, t } };
      }
    }
  }
  return best?.anchor ?? { kind: 'point', x: point.x, y: point.y };
}

export function addCanvasLine(
  doc: WhiteboardDocument,
  boardId: string,
  source: LineAnchor,
  target: LineAnchor,
  options?: { color?: LineColor; arrowhead?: boolean; id?: string },
): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return { ok: false, error: MSG.missingBoard };
  if (board.lines.length >= MAX_CONNECTORS_PER_BOARD) return { ok: false, error: MSG.tooManyConnectors };
  for (const anchor of [source, target]) {
    if (anchor.kind === 'point' && (Math.abs(anchor.x) > COORD_LIMIT || Math.abs(anchor.y) > COORD_LIMIT)) {
      return { ok: false, error: MSG.badLine };
    }
  }
  if (!anchorPosition(source, board.cards) || !anchorPosition(target, board.cards)) {
    return { ok: false, error: MSG.badLine };
  }
  if (source.kind === 'card' && target.kind === 'card' && source.cardId === target.cardId) {
    return { ok: false, error: MSG.selfConnect };
  }
  const line: CanvasLine = {
    id: options?.id ?? crypto.randomUUID(),
    source,
    target,
    color: options?.color ?? 'ink',
    arrowhead: options?.arrowhead !== false,
  };
  return { ok: true, doc: withBoard(doc, boardId, { ...board, lines: [...board.lines, line] }) };
}

function anchorInRange(anchor: LineAnchor): boolean {
  if (anchor.kind === 'point') return Math.abs(anchor.x) <= COORD_LIMIT && Math.abs(anchor.y) <= COORD_LIMIT;
  return Number.isFinite(anchor.t);
}

export function lineIntersectsRect(
  start: { x: number; y: number },
  end: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number },
): boolean {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const inside = (point: { x: number; y: number }) =>
    point.x >= Math.min(rect.x, right) &&
    point.x <= Math.max(rect.x, right) &&
    point.y >= Math.min(rect.y, bottom) &&
    point.y <= Math.max(rect.y, bottom);
  if (inside(start) || inside(end)) return true;
  const edges: [{ x: number; y: number }, { x: number; y: number }][] = [
    [{ x: rect.x, y: rect.y }, { x: right, y: rect.y }],
    [{ x: right, y: rect.y }, { x: right, y: bottom }],
    [{ x: right, y: bottom }, { x: rect.x, y: bottom }],
    [{ x: rect.x, y: bottom }, { x: rect.x, y: rect.y }],
  ];
  const crosses = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }) => {
    const orient = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
      Math.sign((q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y));
    return orient(a, b, c) !== orient(a, b, d) && orient(c, d, a) !== orient(c, d, b);
  };
  return edges.some(([c, d]) => crosses(start, end, c, d));
}

function shiftedAnchor(anchor: LineAnchor, dx: number, dy: number, cards: Card[], keepDocked: Set<string>): LineAnchor {
  if (anchor.kind === 'card' && keepDocked.has(anchor.cardId)) return anchor;
  const pos = anchorPosition(anchor, cards);
  if (!pos) return anchor;
  return { kind: 'point', x: pos.x + dx, y: pos.y + dy };
}

export function translateLines(
  doc: WhiteboardDocument,
  boardId: string,
  lineIds: string[],
  dx: number,
  dy: number,
  keepDocked: Set<string>,
): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return { ok: false, error: MSG.missingBoard };
  if (dx === 0 && dy === 0) return { ok: true, doc };
  const chosen = new Set(lineIds);
  const lines = board.lines.map((line) => {
    if (!chosen.has(line.id)) return line;
    return {
      ...line,
      source: shiftedAnchor(line.source, dx, dy, board.cards, keepDocked),
      target: shiftedAnchor(line.target, dx, dy, board.cards, keepDocked),
    };
  });
  return { ok: true, doc: withBoard(doc, boardId, { ...board, lines }) };
}

export function reverseLine(doc: WhiteboardDocument, boardId: string, lineId: string): DocResult {
  const board = getBoard(doc, boardId);
  const line = board?.lines.find((item) => item.id === lineId);
  if (!board || !line) return { ok: false, error: MSG.badLine };
  return updateLine(doc, boardId, lineId, { source: line.target, target: line.source });
}

export function updateLine(
  doc: WhiteboardDocument,
  boardId: string,
  lineId: string,
  patch: Partial<Pick<CanvasLine, 'color' | 'arrowhead' | 'source' | 'target'>>,
): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return { ok: false, error: MSG.missingBoard };
  let found = false;
  const lines = board.lines.map((line) => {
    if (line.id !== lineId) return line;
    found = true;
    return { ...line, ...patch };
  });
  if (!found) return { ok: false, error: MSG.badLine };
  const next = lines.find((line) => line.id === lineId);
  if (!next || !anchorInRange(next.source) || !anchorInRange(next.target)) return { ok: false, error: MSG.badLine };
  if (next.source.kind === 'card' && next.target.kind === 'card' && next.source.cardId === next.target.cardId) {
    return { ok: false, error: MSG.selfConnect };
  }
  if (!anchorPosition(next.source, board.cards) || !anchorPosition(next.target, board.cards)) {
    return { ok: false, error: MSG.badLine };
  }
  return { ok: true, doc: withBoard(doc, boardId, { ...board, lines }) };
}

export function deleteLines(doc: WhiteboardDocument, boardId: string, lineIds: string[]): DocResult {
  const board = getBoard(doc, boardId);
  if (!board) return { ok: false, error: MSG.missingBoard };
  const remove = new Set(lineIds);
  return { ok: true, doc: withBoard(doc, boardId, { ...board, lines: board.lines.filter((line) => !remove.has(line.id)) }) };
}

export function lineUsesCard(line: CanvasLine, cardId: string): boolean {
  return (
    (line.source.kind === 'card' && line.source.cardId === cardId) ||
    (line.target.kind === 'card' && line.target.cardId === cardId)
  );
}

export { SIDES };
