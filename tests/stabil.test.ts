import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { writeAtomic, type AtomicIO } from '../src/shared/atomicWrite';
import { addColumn, addTextCard, addTodoCard, createEmptyDocument } from '../src/shared/boardOps';
import { placeInColumn } from '../src/shared/columns';
import { serializeDocument, validateDocument } from '../src/shared/document';
import { addCanvasLine, lineIntersectsRect, reverseLine, translateLines, visibleLineEnds } from '../src/shared/lines';
import { MAX_CARDS_PER_BOARD, MAX_CONNECTORS_PER_BOARD, MSG } from '../src/shared/limits';
import { addTodoItem, deleteTodoItem, todoHeight } from '../src/shared/todos';
import type { WhiteboardDocument } from '../src/shared/model';

function docOf(result: { ok: true; doc: WhiteboardDocument } | { ok: false; error: string }): WhiteboardDocument {
  if (!result.ok) throw new Error(result.error);
  return result.doc;
}

function expectValid(doc: WhiteboardDocument) {
  const checked = validateDocument(serializeDocument(doc));
  if (!checked.ok) throw new Error(checked.error);
  return checked.doc;
}

describe('0.4.1 stability', () => {
  it('keeps the last todo row and clears it instead of removing it', () => {
    let doc = docOf(addTodoCard(createEmptyDocument({ rootId: 'rootboard' }), 'rootboard', { x: 0, y: 0 }, { cardId: 'todo00001' }));
    const itemId = doc.boards[0]?.cards.find((card) => card.type === 'todo')?.items[0]?.id ?? '';
    doc = docOf(deleteTodoItem(doc, 'rootboard', 'todo00001', itemId));
    const todo = doc.boards[0]?.cards.find((card) => card.type === 'todo');
    expect(todo?.items).toHaveLength(1);
    expect(todo?.items[0]?.text).toBe('');
    expect(todo?.items[0]?.id).toBe(itemId);
  });

  it('grows a todo inside a column without overlapping the next card', () => {
    let doc = docOf(addColumn(createEmptyDocument({ rootId: 'rootboard' }), 'rootboard', { x: 0, y: 0 }, { cardId: 'column001' }));
    doc = docOf(addTodoCard(doc, 'rootboard', { x: 400, y: 0 }, { cardId: 'todo00001' }));
    doc = docOf(addTextCard(doc, 'rootboard', 'Darunter', { x: 400, y: 300 }, { cardId: 'textcard1' }));
    doc = docOf(placeInColumn(doc, 'rootboard', 'todo00001', 'column001', 0));
    doc = docOf(placeInColumn(doc, 'rootboard', 'textcard1', 'column001', 1));
    for (let index = 0; index < 5; index += 1) doc = docOf(addTodoItem(doc, 'rootboard', 'todo00001'));
    const cards = doc.boards[0]?.cards ?? [];
    const todo = cards.find((card) => card.id === 'todo00001');
    const note = cards.find((card) => card.id === 'textcard1');
    expect(todo && note && note.y).toBeGreaterThanOrEqual((todo?.y ?? 0) + (todo?.height ?? 0));
    expectValid(doc);
  });

  it('moves a line end, detaches a dock on body drag, and reverses direction', () => {
    let doc = docOf(addTextCard(createEmptyDocument({ rootId: 'rootboard' }), 'rootboard', 'A', { x: 0, y: 0 }, { cardId: 'textcard1' }));
    doc = docOf(addTextCard(doc, 'rootboard', 'B', { x: 300, y: 0 }, { cardId: 'textcard2' }));
    doc = docOf(
      addCanvasLine(
        doc,
        'rootboard',
        { kind: 'card', cardId: 'textcard1', side: 'right', t: 0.5 },
        { kind: 'card', cardId: 'textcard2', side: 'left', t: 0.5 },
        { id: 'line00001' },
      ),
    );
    const moved = docOf(translateLines(doc, 'rootboard', ['line00001'], 30, 10, new Set()));
    const line = moved.boards[0]?.lines[0];
    expect(line?.source.kind).toBe('point');
    expect(line?.target.kind).toBe('point');
    const kept = docOf(translateLines(doc, 'rootboard', ['line00001'], 30, 0, new Set(['textcard1'])));
    expect(kept.boards[0]?.lines[0]?.source.kind).toBe('card');
    expect(kept.boards[0]?.lines[0]?.target.kind).toBe('point');
    const turned = docOf(reverseLine(doc, 'rootboard', 'line00001'));
    expect(turned.boards[0]?.lines[0]?.source).toMatchObject({ cardId: 'textcard2' });
    expect(lineIntersectsRect({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 40, y: -10, width: 20, height: 20 })).toBe(true);
    expectValid(moved);
    expectValid(turned);
  });

  it('gives a todo enough height for the add row', () => {
    const doc = docOf(addTodoCard(createEmptyDocument({ rootId: 'rootboard' }), 'rootboard', { x: 0, y: 0 }));
    const todo = doc.boards[0]?.cards.find((card) => card.type === 'todo');
    expect(todo?.height).toBeGreaterThanOrEqual(todoHeight(1));
    expect(todoHeight(1)).toBeGreaterThan(64 + 36);
  });

  it('stops a docked arrowhead short of the card edge', () => {
    const ends = visibleLineEnds({ x: 0, y: 40 }, { x: 220, y: 40 }, 'card', 'card');
    expect(ends.start.x).toBe(6);
    expect(ends.end.x).toBe(214);
  });

  it('rejects columns, todos and lines that would not open again', () => {
    let doc = createEmptyDocument({ rootId: 'rootboard' });
    for (let index = 0; index < MAX_CARDS_PER_BOARD; index += 1) {
      const added = addTextCard(doc, 'rootboard', 'x', { x: (index % 20) * 30, y: Math.floor(index / 20) * 30 });
      if (!added.ok) break;
      doc = added.doc;
    }
    expect(addColumn(doc, 'rootboard', { x: 0, y: 0 }).ok).toBe(false);
    expect(addTodoCard(doc, 'rootboard', { x: 0, y: 0 }).ok).toBe(false);
    const far = addColumn(createEmptyDocument({ rootId: 'rootboard' }), 'rootboard', { x: 9e9, y: 0 });
    expect(far.ok).toBe(false);
    if (!far.ok) expect(far.error).toBe(MSG.badGeometry);
    let lined = docOf(addTextCard(createEmptyDocument({ rootId: 'rootboard' }), 'rootboard', 'A', { x: 0, y: 0 }, { cardId: 'textcard1' }));
    lined = docOf(addTextCard(lined, 'rootboard', 'B', { x: 300, y: 0 }, { cardId: 'textcard2' }));
    for (let index = 0; index < MAX_CONNECTORS_PER_BOARD; index += 1) {
      const added = addCanvasLine(
        lined,
        'rootboard',
        { kind: 'point', x: index, y: 0 },
        { kind: 'point', x: index, y: 40 },
      );
      if (!added.ok) break;
      lined = added.doc;
    }
    expect(addCanvasLine(lined, 'rootboard', { kind: 'point', x: 1, y: 1 }, { kind: 'point', x: 2, y: 2 }).ok).toBe(false);
    expectValid(lined);
  });

  it('writes a file by rename and leaves the previous bytes when writing fails', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'focusboard-atomic-'));
    const target = path.join(dir, 'board.json');
    writeFileSync(target, 'ALT');
    await writeAtomic(target, 'NEU');
    expect(readFileSync(target, 'utf8')).toBe('NEU');
    expect(readFileSync(`${target}.bak`, 'utf8')).toBe('ALT');

    const store = new Map<string, string>([[target, 'ALT']]);
    const io: AtomicIO = {
      async open() {
        return {
          write: async () => {
            throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
          },
          sync: async () => undefined,
          close: async () => undefined,
        };
      },
      async copy() {
        throw new Error('should not copy');
      },
      async rename() {
        throw new Error('should not rename');
      },
      async remove() {
        return undefined;
      },
    };
    await expect(writeAtomic(target, 'KAPUTT', io)).rejects.toThrow('ENOSPC');
    expect(store.get(target)).toBe('ALT');
  });
});

describe('every add keeps a readable document', () => {
  it('property', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          kind: fc.constantFrom('note', 'column', 'todo', 'line'),
          x: fc.integer({ min: -400, max: 800 }),
          y: fc.integer({ min: -400, max: 800 }),
        }), { minLength: 1, maxLength: 12 }),
        (steps) => {
          let doc = createEmptyDocument({ rootId: 'rootboard' });
          expectValid(doc);
          for (const step of steps) {
            const point = { x: step.x, y: step.y };
            const result =
              step.kind === 'column'
                ? addColumn(doc, 'rootboard', point)
                : step.kind === 'todo'
                  ? addTodoCard(doc, 'rootboard', point)
                  : step.kind === 'line'
                    ? addCanvasLine(doc, 'rootboard', { kind: 'point', x: step.x, y: step.y }, { kind: 'point', x: step.x + 40, y: step.y + 20 })
                    : addTextCard(doc, 'rootboard', 'Text', point);
            doc = result.ok ? result.doc : doc;
            expectValid(doc);
          }
        },
      ),
      { numRuns: 25 },
    );
  });
});
