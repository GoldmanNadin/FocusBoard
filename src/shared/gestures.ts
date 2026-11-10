import { MAX_ZOOM, MIN_ZOOM } from './limits';

export type Viewport = { x: number; y: number; zoom: number };

export type WheelKind = 'zoom' | 'pan';

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function classifyWheel(input: {
  ctrlKey: boolean;
  deltaMode: number;
  deltaX: number;
  deltaY: number;
}): WheelKind {
  if (input.ctrlKey) return 'zoom';
  return 'pan';
}

/** DOM_DELTA_LINE and DOM_DELTA_PAGE are unit conversions, not a device guess. */
export function wheelToPixels(delta: number, deltaMode: number): number {
  if (!Number.isFinite(delta)) return 0;
  if (deltaMode === 1) return delta * 16;
  if (deltaMode === 2) return delta * 480;
  return delta;
}

export type WheelResult =
  | { type: 'ignore' }
  | { type: 'zoom'; viewport: Viewport }
  | { type: 'pan'; viewport: Viewport };

export function wheelAction(input: {
  ctrlKey: boolean;
  shiftKey: boolean;
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  viewport: Viewport;
  paneX: number;
  paneY: number;
  overEditor: boolean;
}): WheelResult {
  if (input.overEditor) return { type: 'ignore' };
  const dx = wheelToPixels(input.deltaX, input.deltaMode);
  const dy = wheelToPixels(input.deltaY, input.deltaMode);
  if (dx === 0 && dy === 0) return { type: 'ignore' };
  if (input.ctrlKey) {
    const nextZoom = nextZoomFromDelta(input.viewport.zoom, dy !== 0 ? dy : dx);
    return {
      type: 'zoom',
      viewport: zoomViewportAtPoint(input.viewport, input.paneX, input.paneY, nextZoom),
    };
  }
  if (input.shiftKey) {
    const horizontal = dx !== 0 ? dx : dy;
    return { type: 'pan', viewport: panViewport(input.viewport, horizontal, 0) };
  }
  return { type: 'pan', viewport: panViewport(input.viewport, dx, dy) };
}

export function cardPositionAtPointer(viewport: Viewport, paneX: number, paneY: number): { x: number; y: number } {
  return flowPointFromPane(viewport, paneX, paneY);
}

export function viewportToFit(
  cards: { x: number; y: number; width: number; height: number }[],
  pane: { width: number; height: number },
  paddingRatio = 0.12,
): Viewport {
  if (cards.length === 0 || pane.width < 40 || pane.height < 40) return { x: 0, y: 0, zoom: 1 };
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
  const boundsW = Math.max(1, maxX - minX);
  const boundsH = Math.max(1, maxY - minY);
  const padX = Math.min(pane.width * paddingRatio, pane.width / 3);
  const padY = Math.min(pane.height * paddingRatio, pane.height / 3);
  const zoom = clampZoom(Math.min((pane.width - padX * 2) / boundsW, (pane.height - padY * 2) / boundsH));
  return {
    zoom,
    x: (pane.width - boundsW * zoom) / 2 - minX * zoom,
    y: (pane.height - boundsH * zoom) / 2 - minY * zoom,
  };
}

export function flowPointOnScreen(viewport: Viewport, flowX: number, flowY: number): { x: number; y: number } {
  return { x: flowX * viewport.zoom + viewport.x, y: flowY * viewport.zoom + viewport.y };
}

export function nextZoomFromDelta(current: number, deltaY: number): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return clampZoom(current);
  const factor = Math.exp(-deltaY * 0.0025);
  return clampZoom(current * factor);
}

export function panViewport(viewport: Viewport, deltaX: number, deltaY: number): Viewport {
  return {
    x: viewport.x - deltaX,
    y: viewport.y - deltaY,
    zoom: viewport.zoom,
  };
}

export function zoomViewportAtPoint(
  viewport: Viewport,
  paneX: number,
  paneY: number,
  nextZoom: number,
): Viewport {
  const zoom = clampZoom(nextZoom);
  const safe = viewport.zoom === 0 ? 1 : viewport.zoom;
  const flowX = (paneX - viewport.x) / safe;
  const flowY = (paneY - viewport.y) / safe;
  return {
    zoom,
    x: paneX - flowX * zoom,
    y: paneY - flowY * zoom,
  };
}

export function flowPointFromPane(
  viewport: Viewport,
  paneX: number,
  paneY: number,
): { x: number; y: number } {
  const safe = viewport.zoom === 0 ? 1 : viewport.zoom;
  return {
    x: (paneX - viewport.x) / safe,
    y: (paneY - viewport.y) / safe,
  };
}

export function placementTopLeft(
  center: { x: number; y: number },
  size: { width: number; height: number },
  stackIndex: number,
): { x: number; y: number } {
  const step = (Math.max(0, stackIndex) % 6) * 28;
  return {
    x: center.x - size.width / 2 + step,
    y: center.y - size.height / 2 + step,
  };
}

export function windowTitle(fileName: string | null, dirty: boolean): string {
  const name = fileName ?? 'Unbenannt';
  return `${dirty ? '● ' : ''}${name} — FocusBoard`;
}

export type CloseChoice = 'save' | 'discard' | 'cancel';

export function resolveClose(
  dirty: boolean,
  choice: CloseChoice | null,
): 'close' | 'save-then-close' | 'stay' {
  if (!dirty) return 'close';
  if (choice === 'save') return 'save-then-close';
  if (choice === 'discard') return 'close';
  return 'stay';
}

export function deleteBoardsMessage(titles: string[]): { message: string; detail: string } {
  const clean = titles
    .map((title) => title.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 6);
  const detail = 'Alle Karten, Verbindungen und verschachtelten Boards darin werden entfernt.';
  if (clean.length <= 1) {
    return { message: `Unterboard „${clean[0] ?? 'Ohne Titel'}“ löschen?`, detail };
  }
  return {
    message: `${clean.length} Unterboards löschen?`,
    detail: `${clean.join(', ')}. ${detail}`,
  };
}
