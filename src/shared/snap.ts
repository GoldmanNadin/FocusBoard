export type Rect = { x: number; y: number; width: number; height: number };
export type Guide = { axis: 'x' | 'y'; at: number; from: number; to: number };

/**
 * Snaps a moving card to the left/centre/right and top/middle/bottom lines of the other cards
 * when it comes within `threshold` board units. Returns the adjusted position and the guide
 * lines to draw.
 */
export function snapRect(moving: Rect, others: Rect[], threshold: number): { x: number; y: number; guides: Guide[] } {
  const xs = (rect: Rect) => [rect.x, rect.x + rect.width / 2, rect.x + rect.width];
  const ys = (rect: Rect) => [rect.y, rect.y + rect.height / 2, rect.y + rect.height];
  let bestX: { delta: number; at: number } | null = null;
  let bestY: { delta: number; at: number } | null = null;
  for (const other of others) {
    for (const target of xs(other)) {
      for (const own of xs(moving)) {
        const delta = target - own;
        if (Math.abs(delta) <= threshold && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) bestX = { delta, at: target };
      }
    }
    for (const target of ys(other)) {
      for (const own of ys(moving)) {
        const delta = target - own;
        if (Math.abs(delta) <= threshold && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) bestY = { delta, at: target };
      }
    }
  }
  const x = moving.x + (bestX?.delta ?? 0);
  const y = moving.y + (bestY?.delta ?? 0);
  const placed = { ...moving, x, y };
  const guides: Guide[] = [];
  if (bestX) {
    const touching = others.filter((other) => xs(other).some((value) => Math.abs(value - bestX!.at) < 0.5));
    const top = Math.min(placed.y, ...touching.map((other) => other.y));
    const bottom = Math.max(placed.y + placed.height, ...touching.map((other) => other.y + other.height));
    guides.push({ axis: 'x', at: bestX.at, from: top, to: bottom });
  }
  if (bestY) {
    const touching = others.filter((other) => ys(other).some((value) => Math.abs(value - bestY!.at) < 0.5));
    const left = Math.min(placed.x, ...touching.map((other) => other.x));
    const right = Math.max(placed.x + placed.width, ...touching.map((other) => other.x + other.width));
    guides.push({ axis: 'y', at: bestY.at, from: left, to: right });
  }
  return { x, y, guides };
}

/** Moves a new card down and right in small steps until it no longer covers an existing card. */
export function freeSpot(at: { x: number; y: number }, size: { width: number; height: number }, cards: Rect[]): { x: number; y: number } {
  const overlaps = (x: number, y: number) =>
    cards.some((card) => x < card.x + card.width && x + size.width > card.x && y < card.y + card.height && y + size.height > card.y);
  for (let step = 0; step < 40; step += 1) {
    const x = at.x + step * 24;
    const y = at.y + step * 24;
    if (!overlaps(x, y)) return { x, y };
  }
  return at;
}
