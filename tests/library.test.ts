import { describe, expect, it } from 'vitest';
import { addSubboard, addTextCard, addTodoCard, createEmptyDocument } from '../src/shared/boardOps';
import { serializeDocument, validateDocument } from '../src/shared/document';
import { containedPath, externalEditIsNewer, freshBoard, previewLines, previewOf, remapDocument, shortFolderLabel, uniqueTitle, withRootTitle } from '../src/shared/library';
import { addCanvasLine } from '../src/shared/lines';
import type { WhiteboardDocument } from '../src/shared/model';

function docOf(result: { ok: true; doc: WhiteboardDocument } | { ok: false; error: string }): WhiteboardDocument {
  if (!result.ok) throw new Error(result.error);
  return result.doc;
}

describe('library', () => {
  it('keeps names unique and paths inside the folder', () => {
    expect(uniqueTitle(['Ideen', 'Ideen 2'], 'Ideen')).toBe('Ideen 3');
    expect(uniqueTitle([], '  ')).toBe('Neues Board');
    expect(containedPath('/docs/FocusBoard', '/docs/FocusBoard/board.json')).toBe(true);
    expect(containedPath('/docs/FocusBoard', '/docs/FocusBoard/../secret.json')).toBe(false);
    expect(containedPath('/docs/FocusBoard', '/tmp/other.json')).toBe(false);
  });

  it('remaps every id when a board is duplicated and still validates', () => {
    let doc = docOf(addTextCard(createEmptyDocument({ rootId: 'rootboard' }), 'rootboard', 'Hallo', { x: 10, y: 10 }, { cardId: 'textcard1' }));
    doc = docOf(addTodoCard(doc, 'rootboard', { x: 40, y: 40 }, { cardId: 'todo00001' }));
    doc = docOf(addSubboard(doc, 'rootboard', 'Innen', { x: 80, y: 80 }, { cardId: 'boarddem1', boardId: 'childdem1' }));
    doc = docOf(addCanvasLine(doc, 'rootboard', { kind: 'card', cardId: 'textcard1', side: 'right', t: 0.5 }, { kind: 'point', x: 200, y: 40 }, { id: 'line00001' }));
    const copy = withRootTitle(remapDocument(doc), 'Kopie von Hauptboard');
    const checked = validateDocument(serializeDocument(copy));
    expect(checked.ok).toBe(true);
    expect(copy.rootBoardId).not.toBe(doc.rootBoardId);
    const oldIds = new Set(doc.boards.flatMap((board) => [board.id, ...board.cards.map((card) => card.id)]));
    const newIds = copy.boards.flatMap((board) => [board.id, ...board.cards.map((card) => card.id)]);
    expect(newIds.some((id) => oldIds.has(id))).toBe(false);
    expect(copy.boards[0]?.lines[0]?.source).toMatchObject({ kind: 'card' });
  });

  it('does not treat an unchanged file as an external edit', () => {
    expect(externalEditIsNewer(1000, 5000, 'alt', 'neu')).toBe(true);
    expect(externalEditIsNewer(1000, 5000, 'gleich', 'gleich')).toBe(false);
    expect(externalEditIsNewer(null, 5000, 'alt', 'neu')).toBe(false);
  });

  it('builds a preview and a fresh titled board', () => {
    const base = freshBoard('Ideen');
    const doc = docOf(addTextCard(base, base.rootBoardId, 'Notiz', { x: 0, y: 0 }, undefined, { color: 'pink' }));
    const card = previewOf(doc)[0];
    expect(card?.fill).toBe('#FF8FBE');
    expect(card && card.w).toBeLessThan(80);
    expect(card && card.x).toBeGreaterThan(10);
    const second = docOf(addTextCard(doc, doc.rootBoardId, 'Daneben', { x: 400, y: 20 }, undefined, { color: 'green' }));
    const shapes = previewOf(second);
    expect(shapes).toHaveLength(2);
    expect(shapes[0]?.x).not.toBe(shapes[1]?.x);
    expect(shapes.every((shape) => shape.w < 80 && shape.h < 80)).toBe(true);
    const linked = docOf(addCanvasLine(second, second.rootBoardId, { kind: 'card', cardId: second.boards[0]!.cards[0]!.id, side: 'right', t: 0.5 }, { kind: 'card', cardId: second.boards[0]!.cards[1]!.id, side: 'left', t: 0.5 }));
    expect(previewLines(linked)).toHaveLength(1);
    expect(previewOf(freshBoard('Leer'))).toEqual([]);
    expect(shortFolderLabel('/home/nadin/Documents/FocusBoard')).toBe('…/Documents/FocusBoard');
  });
});
