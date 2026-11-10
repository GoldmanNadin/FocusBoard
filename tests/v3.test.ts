import { describe, expect, it } from 'vitest';
import { addColumn, addTextCard, addTodoCard, createEmptyDocument, deleteCards } from '../src/shared/boardOps';
import { placeInColumn, relayoutColumn, settleCardDrop, toggleColumn, translateColumn } from '../src/shared/columns';
import { serializeDocument, validateDocument } from '../src/shared/document';
import { cardPositionAtPointer, flowPointOnScreen } from '../src/shared/gestures';
import { addCanvasLine, anchorPosition, snapAnchor } from '../src/shared/lines';
import { addTodoItem, toggleTodoItem, todoProgress } from '../src/shared/todos';
import type { WhiteboardDocument } from '../src/shared/model';

function docOf(result: { ok: true; doc: WhiteboardDocument } | { ok: false; error: string }): WhiteboardDocument {
  if (!result.ok) throw new Error(result.error);
  return result.doc;
}

describe('v3 columns, todos and lines', () => {
  it('drops at the pointer for zoom 50, 100 and 200 percent', () => {
    for (const zoom of [0.5, 1, 2]) {
      const viewport = { x: -30, y: 12, zoom };
      const point = cardPositionAtPointer(viewport, 240, 180);
      const screen = flowPointOnScreen(viewport, point.x, point.y);
      expect(screen.x).toBeCloseTo(240);
      expect(screen.y).toBeCloseTo(180);
    }
  });

  it('moves a column with its cards, reorders, ejects, and collapse keeps membership', () => {
    let doc = createEmptyDocument({ rootId: 'rootboard' });
    doc = docOf(addColumn(doc, 'rootboard', { x: 0, y: 0 }, { cardId: 'column001' }));
    doc = docOf(addTextCard(doc, 'rootboard', 'Oben', { x: 400, y: 0 }, { cardId: 'textcard1' }));
    doc = docOf(addTextCard(doc, 'rootboard', 'Unten', { x: 400, y: 200 }, { cardId: 'textcard2' }));
    doc = docOf(placeInColumn(doc, 'rootboard', 'textcard1', 'column001', 0));
    doc = docOf(placeInColumn(doc, 'rootboard', 'textcard2', 'column001', 1));
    const before = doc.boards[0]?.cards.find((card) => card.id === 'textcard1');
    doc = docOf(translateColumn(doc, 'rootboard', 'column001', 50, 20));
    const moved = doc.boards[0]?.cards.find((card) => card.id === 'textcard1');
    if (!before || !moved) throw new Error('missing card');
    expect(moved.x).toBe(before.x + 50);
    expect(moved.y).toBe(before.y + 20);
    doc = docOf(settleCardDrop(doc, 'rootboard', 'textcard2', { x: 70, y: 40 }));
    const columnNow = doc.boards[0]?.cards.find((card) => card.id === 'column001');
    expect(columnNow?.type === 'column' ? columnNow.childIds[0] : '').toBe('textcard2');
    doc = docOf(settleCardDrop(doc, 'rootboard', 'textcard2', { x: 900, y: 900 }));
    const ejected = doc.boards[0]?.cards.find((card) => card.id === 'textcard2');
    expect(ejected?.type === 'text' ? ejected.columnId : 'x').toBeNull();
    doc = docOf(placeInColumn(doc, 'rootboard', 'textcard2', 'column001', 1));
    const line = docOf(
      addCanvasLine(
        doc,
        'rootboard',
        { kind: 'card', cardId: 'textcard2', side: 'right', t: 0.5 },
        { kind: 'point', x: 10, y: 10 },
        { id: 'line00001' },
      ),
    );
    const collapsed = docOf(toggleColumn(line, 'rootboard', 'column001'));
    const column = collapsed.boards[0]?.cards.find((card) => card.id === 'column001');
    expect(column?.type === 'column' && column.collapsed).toBe(true);
    expect(column?.type === 'column' && column.childIds).toContain('textcard2');
    const anchor = anchorPosition(
      { kind: 'card', cardId: 'textcard2', side: 'right', t: 0.5 },
      collapsed.boards[0]?.cards ?? [],
    );
    expect(anchor?.x).toBe((column && column.x + column.width) || 0);
    const released = docOf(deleteCards(collapsed, 'rootboard', ['column001']));
    expect(released.boards[0]?.cards.some((card) => card.id === 'textcard2')).toBe(true);
    const freed = released.boards[0]?.cards.find((card) => card.id === 'textcard2');
    expect(freed?.type === 'text' ? freed.columnId : 'x').toBeNull();
  });

  it('rejects a column inside a column and checks todos', () => {
    let doc = createEmptyDocument({ rootId: 'rootboard' });
    doc = docOf(addColumn(doc, 'rootboard', { x: 0, y: 0 }, { cardId: 'column001' }));
    doc = docOf(addColumn(doc, 'rootboard', { x: 300, y: 0 }, { cardId: 'column002' }));
    expect(placeInColumn(doc, 'rootboard', 'column002', 'column001', 0).ok).toBe(false);
    doc = docOf(addTodoCard(doc, 'rootboard', { x: 20, y: 20 }, { cardId: 'todo00001' }));
    const added = addTodoItem(doc, 'rootboard', 'todo00001');
    doc = docOf(added);
    const itemId = doc.boards[0]?.cards.find((card) => card.type === 'todo')?.items[1]?.id ?? '';
    doc = docOf(toggleTodoItem(doc, 'rootboard', 'todo00001', itemId));
    const todo = doc.boards[0]?.cards.find((card) => card.type === 'todo');
    expect(todo && todoProgress(todo)).toEqual({ done: 1, total: 2 });
    const round = validateDocument(serializeDocument(doc));
    if (!round.ok) throw new Error(round.error);
    expect(round.ok).toBe(true);
  });

  it('imports a version 2 file and docks or frees a line', () => {
    const legacy = validateDocument({
      format: 'digitales-whiteboard',
      version: 2,
      appVersion: '0.2.0',
      rootBoardId: 'rootboard',
      theme: 'light',
      boards: [
        {
          id: 'rootboard',
          title: 'Hauptboard',
          parentBoardId: null,
          cards: [
            { id: 'textcard1', type: 'text', x: 0, y: 0, width: 220, height: 160, text: 'Alt', style: 'note', color: 'yellow' },
          ],
          connectors: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      ],
      files: [],
    });
    expect(legacy.ok).toBe(true);
    if (!legacy.ok) return;
    expect(legacy.doc.version).toBe(3);
    const cards = legacy.doc.boards[0]?.cards ?? [];
    const free = snapAnchor({ x: 800, y: 800 }, cards, 1);
    expect(free.kind).toBe('point');
    const docked = snapAnchor({ x: 0, y: 40 }, cards, 1);
    expect(docked.kind).toBe('card');
    const laid = relayoutColumn(
      {
        ...legacy.doc.boards[0]!,
        cards: [
          ...cards,
          {
            id: 'column001',
            type: 'column',
            x: 0,
            y: 0,
            width: 240,
            height: 80,
            title: 'Spalte',
            collapsed: false,
            childIds: ['textcard1'],
          },
        ],
      },
      'column001',
    );
    expect(laid.cards.find((card) => card.id === 'textcard1')?.x).toBe(8);
  });
});
