import { describe, expect, it } from 'vitest';
import { addSticker, addTextCard, createEmptyDocument, setNoteColors } from '../src/shared/boardOps';
import { serializeDocument, validateDocument } from '../src/shared/document';
import { cardPositionAtPointer, flowPointOnScreen, viewportToFit, wheelAction } from '../src/shared/gestures';
import {
  commitHistory,
  contentSignature,
  createHistory,
  endGesture,
  undoHistory,
  redoHistory,
  sameContent,
} from '../src/shared/history';
import { NOTE_COLORS, NOTE_COLOR_ORDER } from '../src/shared/limits';
import { isSafeRecoveryPath } from '../src/shared/recovery';
import type { WhiteboardDocument } from '../src/shared/model';

function contrast(foreground: string, background: string): number {
  const channel = (hex: string, shift: number) => {
    const value = ((parseInt(hex.slice(1), 16) >> shift) & 255) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const lum = (hex: string) => 0.2126 * channel(hex, 16) + 0.7152 * channel(hex, 8) + 0.0722 * channel(hex, 0);
  const lighter = Math.max(lum(foreground), lum(background));
  const darker = Math.min(lum(foreground), lum(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('v2 acceptance', () => {
  it('imports a version 1 file as notes and keeps the text', () => {
    const legacy = {
      format: 'digitales-whiteboard',
      version: 1,
      appVersion: '0.1.0',
      rootBoardId: 'rootboard',
      boards: [
        {
          id: 'rootboard',
          title: 'Hauptboard',
          parentBoardId: null,
          cards: [{ id: 'textcard1', type: 'text', x: 12, y: 18, width: 220, height: 160, text: 'Äpfel' }],
          connectors: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      ],
      files: [],
    };
    const loaded = validateDocument(legacy);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.doc.version).toBe(3);
    expect(loaded.doc.boards[0]?.cards[0]).toMatchObject({ text: 'Äpfel', style: 'note', color: 'yellow' });
  });

  it('places a card at the pointer for 50, 100 and 200 percent zoom', () => {
    for (const zoom of [0.5, 1, 2]) {
      const viewport = { x: 20, y: -10, zoom };
      const point = cardPositionAtPointer(viewport, 200, 120);
      const screen = flowPointOnScreen(viewport, point.x, point.y);
      expect(screen.x).toBeCloseTo(200);
      expect(screen.y).toBeCloseTo(120);
    }
  });

  it('fits every card inside the pane', () => {
    const cards = [
      { x: -400, y: -200, width: 180, height: 80 },
      { x: 900, y: 700, width: 120, height: 120 },
    ];
    const pane = { width: 1000, height: 700 };
    const viewport = viewportToFit(cards, pane);
    for (const card of cards) {
      for (const corner of [
        [card.x, card.y],
        [card.x + card.width, card.y + card.height],
      ]) {
        const screen = flowPointOnScreen(viewport, corner[0]!, corner[1]!);
        expect(screen.x).toBeGreaterThanOrEqual(-0.5);
        expect(screen.y).toBeGreaterThanOrEqual(-0.5);
        expect(screen.x).toBeLessThanOrEqual(pane.width + 0.5);
        expect(screen.y).toBeLessThanOrEqual(pane.height + 0.5);
      }
    }
  });

  it('keeps every post-it color above the body contrast threshold', () => {
    expect(NOTE_COLOR_ORDER).toHaveLength(8);
    for (const color of NOTE_COLOR_ORDER) {
      expect(contrast(NOTE_COLORS[color].ink, NOTE_COLORS[color].fill)).toBeGreaterThan(4.5);
    }
  });

  it('groups one drag into a single undo step and still redoes text and color', () => {
    let doc = createEmptyDocument({ rootId: 'rootboard' });
    doc = expectOk(addTextCard(doc, 'rootboard', 'Hallo', { x: 0, y: 0 }, { cardId: 'textcard1' }));
    let history = createHistory(doc);
    const beforeDrag = structuredClone(history.present);
    history = { ...history, present: move(history.present, 30) };
    history = { ...history, present: move(history.present, 80) };
    history = endGesture(history, beforeDrag, history.present, sameContent);
    expect(history.past).toHaveLength(1);
    history = undoHistory(history);
    expect(history.present.boards[0]?.cards[0]).toMatchObject({ x: 0 });
    history = redoHistory(history);
    expect(history.present.boards[0]?.cards[0]).toMatchObject({ x: 80 });
    const colored = expectOk(setNoteColors(history.present, 'rootboard', ['textcard1'], 'pink'));
    history = commitHistory(history, colored, sameContent);
    history = undoHistory(history);
    expect(history.present.boards[0]?.cards[0]).toMatchObject({ color: 'yellow' });
    history = redoHistory(history);
    expect(history.present.boards[0]?.cards[0]).toMatchObject({ color: 'pink' });
  });

  it('stores stickers and refuses recovery writes outside the app data folder', () => {
    let doc = createEmptyDocument({ rootId: 'rootboard' });
    doc = expectOk(addSticker(doc, 'rootboard', 'heart', { x: 10, y: 10 }, { cardId: 'stickerc1' }));
    const loaded = validateDocument(serializeDocument(doc));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.doc.boards[0]?.cards[0]).toMatchObject({ type: 'sticker', kind: 'heart' });
    expect(isSafeRecoveryPath('/tmp/user-data/recovery-autosave.json', '/tmp/user-data')).toBe(true);
    expect(isSafeRecoveryPath('/tmp/user-data/whiteboard.json', '/tmp/user-data')).toBe(false);
    expect(isSafeRecoveryPath('/tmp/other/recovery-autosave.json', '/tmp/user-data')).toBe(false);
    expect(contentSignature(doc)).toBe(contentSignature(structuredClone(doc)));
  });

  it('does not zoom a plain wheel and ignores the wheel over an editor', () => {
    const viewport = { x: 0, y: 0, zoom: 1 };
    const plain = wheelAction({
      ctrlKey: false,
      shiftKey: false,
      deltaX: 0,
      deltaY: 120,
      deltaMode: 1,
      viewport,
      paneX: 40,
      paneY: 40,
      overEditor: false,
    });
    expect(plain.type).toBe('pan');
    if (plain.type === 'pan') expect(plain.viewport.zoom).toBe(1);
    expect(
      wheelAction({
        ctrlKey: false,
        shiftKey: false,
        deltaX: 4,
        deltaY: 6,
        deltaMode: 0,
        viewport,
        paneX: 1,
        paneY: 1,
        overEditor: true,
      }).type,
    ).toBe('ignore');
  });
});

function expectOk(result: { ok: true; doc: WhiteboardDocument } | { ok: false; error: string }): WhiteboardDocument {
  if (!result.ok) throw new Error(result.error);
  return result.doc;
}

function move(doc: WhiteboardDocument, x: number): WhiteboardDocument {
  return {
    ...doc,
    boards: doc.boards.map((board, index) =>
      index === 0
        ? { ...board, cards: board.cards.map((card) => ({ ...card, x })) }
        : board,
    ),
  };
}
