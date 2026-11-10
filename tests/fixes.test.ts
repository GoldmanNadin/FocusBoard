import { describe, expect, it } from 'vitest';
import { addColumn, addImageCard, addTextCard, addTodoCard, createEmptyDocument, setTheme } from '../src/shared/boardOps';
import { placeInColumn } from '../src/shared/columns';
import { contentSignature, keepViewports } from '../src/shared/history';
import { addCanvasLine } from '../src/shared/lines';
import { MAX_CARDS_PER_BOARD, MAX_CONNECTORS_PER_BOARD, MSG } from '../src/shared/limits';
import { addTodoItem, deleteTodoItem } from '../src/shared/todos';
import type { TodoCard, WhiteboardDocument } from '../src/shared/model';

// Regression tests for docs/FEEDBACK_0.4.md (sections A and B).

function docOf(result: { ok: true; doc: WhiteboardDocument } | { ok: false; error: string }): WhiteboardDocument {
  if (!result.ok) throw new Error(result.error);
  return result.doc;
}

function todoOf(doc: WhiteboardDocument, id: string): TodoCard {
  const card = doc.boards[0]!.cards.find((item) => item.id === id);
  if (card?.type !== 'todo') throw new Error('no todo');
  return card;
}

describe('fixes from the 0.4 review', () => {
  it('A3: deleting the last todo item only clears it', () => {
    let doc = createEmptyDocument({ rootId: 'rootboard' });
    doc = docOf(addTodoCard(doc, 'rootboard', { x: 0, y: 0 }, { cardId: 'todocard1' }));
    const only = todoOf(doc, 'todocard1').items[0]!;
    doc = docOf(deleteTodoItem(doc, 'rootboard', 'todocard1', only.id));
    expect(todoOf(doc, 'todocard1').items).toHaveLength(1);
    doc = docOf(addTodoItem(doc, 'rootboard', 'todocard1', only.id));
    const second = todoOf(doc, 'todocard1').items[1]!;
    doc = docOf(deleteTodoItem(doc, 'rootboard', 'todocard1', second.id));
    expect(todoOf(doc, 'todocard1').items.map((item) => item.id)).toEqual([only.id]);
  });

  it('A5: a todo that grows inside a column pushes the next card down', () => {
    let doc = createEmptyDocument({ rootId: 'rootboard' });
    doc = docOf(addColumn(doc, 'rootboard', { x: 0, y: 0 }, { cardId: 'column001' }));
    doc = docOf(addTodoCard(doc, 'rootboard', { x: 400, y: 0 }, { cardId: 'todocard1' }));
    doc = docOf(addTextCard(doc, 'rootboard', 'Unten', { x: 400, y: 400 }, { cardId: 'textcard1' }));
    doc = docOf(placeInColumn(doc, 'rootboard', 'todocard1', 'column001', 0));
    doc = docOf(placeInColumn(doc, 'rootboard', 'textcard1', 'column001', 1));
    for (let i = 0; i < 6; i += 1) {
      const last = todoOf(doc, 'todocard1').items.at(-1)!;
      doc = docOf(addTodoItem(doc, 'rootboard', 'todocard1', last.id));
    }
    const todo = todoOf(doc, 'todocard1');
    const note = doc.boards[0]!.cards.find((card) => card.id === 'textcard1')!;
    expect(todo.y + todo.height).toBeLessThanOrEqual(note.y);
  });

  it('B6: columns, todos and lines respect the board limits', () => {
    let doc = createEmptyDocument({ rootId: 'rootboard' });
    const board = doc.boards[0]!;
    const filler = Array.from({ length: MAX_CARDS_PER_BOARD }, (_, i) => ({
      id: `filler${String(i).padStart(4, '0')}`,
      type: 'text' as const,
      x: 0,
      y: 0,
      width: 220,
      height: 160,
      text: '',
      style: 'note' as const,
      color: 'yellow' as const,
      columnId: null,
    }));
    doc = { ...doc, boards: [{ ...board, cards: filler }] };
    expect(addColumn(doc, 'rootboard', { x: 0, y: 0 })).toEqual({ ok: false, error: MSG.tooManyCards });
    expect(addTodoCard(doc, 'rootboard', { x: 0, y: 0 })).toEqual({ ok: false, error: MSG.tooManyCards });
    expect(addColumn(createEmptyDocument(), createEmptyDocument().rootBoardId, { x: Number.NaN, y: 0 }).ok).toBe(false);

    let lines = createEmptyDocument({ rootId: 'rootboard' });
    const full = Array.from({ length: MAX_CONNECTORS_PER_BOARD }, (_, i) => ({
      id: `line${i}`,
      source: { kind: 'point' as const, x: 0, y: 0 },
      target: { kind: 'point' as const, x: 10, y: 10 },
      color: 'ink' as const,
      arrowhead: true,
    }));
    lines = { ...lines, boards: [{ ...lines.boards[0]!, lines: full }] };
    const result = addCanvasLine(lines, 'rootboard', { kind: 'point', x: 0, y: 0 }, { kind: 'point', x: 5, y: 5 });
    expect(result).toEqual({ ok: false, error: MSG.tooManyConnectors });
  });

  it('A9: the theme is not content and survives undo', () => {
    const light = createEmptyDocument({ rootId: 'rootboard' });
    const dark = docOf(setTheme(light, 'dark'));
    expect(contentSignature(dark)).toBe(contentSignature(light));
    expect(keepViewports(light, dark).theme).toBe('dark');
  });

  it('B1: the signature does not carry image bytes', () => {
    let doc = createEmptyDocument({ rootId: 'rootboard' });
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    doc = docOf(addImageCard(doc, 'rootboard', { fileName: 'a.png', dataUrl: png }, { x: 0, y: 0 }));
    expect(contentSignature(doc)).not.toContain('base64');
  });
});
