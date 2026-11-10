import { describe, expect, it } from 'vitest';
import { addColumn, addImageCard, addSubboard, addTextCard, createEmptyDocument, imageCardSize } from '../src/shared/boardOps';
import { addLinkCard, copyCards, pasteClip, reorderCards, updateLink } from '../src/shared/clipboard';
import { placeInColumn } from '../src/shared/columns';
import { normalizeUrl, serializeDocument, validateDocument } from '../src/shared/document';
import { addCanvasLine } from '../src/shared/lines';
import type { WhiteboardDocument } from '../src/shared/model';

function docOf(result: { ok: true; doc: WhiteboardDocument } | { ok: false; error: string }): WhiteboardDocument {
  if (!result.ok) throw new Error(result.error);
  return result.doc;
}

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function sample(): WhiteboardDocument {
  let doc = createEmptyDocument({ rootId: 'rootboard' });
  doc = docOf(addTextCard(doc, 'rootboard', 'Eins', { x: 0, y: 0 }, { cardId: 'textcard1' }));
  doc = docOf(addTextCard(doc, 'rootboard', 'Zwei', { x: 400, y: 0 }, { cardId: 'textcard2' }));
  doc = docOf(addCanvasLine(doc, 'rootboard', { kind: 'card', cardId: 'textcard1', side: 'right', t: 0.5 }, { kind: 'card', cardId: 'textcard2', side: 'left', t: 0.5 }, { id: 'lineone01' }));
  doc = docOf(addSubboard(doc, 'rootboard', 'Projekt', { x: 0, y: 300 }, { cardId: 'boardcard1', boardId: 'childboard' }));
  doc = docOf(addImageCard(doc, 'childboard', { fileName: 'a.png', dataUrl: PNG }, { x: 0, y: 0 }, { cardId: 'imagecard1', fileId: 'imagefile1' }));
  doc = docOf(addColumn(doc, 'rootboard', { x: 800, y: 0 }, { cardId: 'column001' }));
  doc = docOf(addTextCard(doc, 'rootboard', 'In Spalte', { x: 1200, y: 0 }, { cardId: 'textcard3' }));
  doc = docOf(placeInColumn(doc, 'rootboard', 'textcard3', 'column001', 0));
  return doc;
}

describe('clipboard, links and ordering', () => {
  it('copies cards with the line between them and pastes them at the pointer with new ids', () => {
    const doc = sample();
    const clip = copyCards(doc, 'rootboard', ['textcard1', 'textcard2'])!;
    expect(clip.lines).toHaveLength(1);
    const result = pasteClip(doc, 'rootboard', clip, { x: 1000, y: 1000 });
    if (!result.ok) throw new Error(result.error);
    const root = result.doc.boards.find((board) => board.id === 'rootboard')!;
    const pasted = root.cards.filter((card) => result.cardIds.includes(card.id));
    expect(pasted.map((card) => [card.x, card.y])).toEqual([[1000, 1000], [1400, 1000]]);
    expect(result.cardIds).not.toContain('textcard1');
    const newLine = root.lines.at(-1)!;
    expect(newLine.source.kind === 'card' && result.cardIds.includes(newLine.source.cardId)).toBe(true);
    expect(validateDocument(serializeDocument(result.doc)).ok).toBe(true);
  });

  it('pasting a sub-board copies its whole content, sharing the image file', () => {
    const doc = sample();
    const clip = copyCards(doc, 'rootboard', ['boardcard1'])!;
    const result = pasteClip(doc, 'rootboard', clip, { x: 0, y: 600 });
    if (!result.ok) throw new Error(result.error);
    expect(result.doc.boards).toHaveLength(doc.boards.length + 1);
    expect(result.doc.files).toHaveLength(1);
    const copy = result.doc.boards.at(-1)!;
    expect(copy.id).not.toBe('childboard');
    expect(copy.parentBoardId).toBe('rootboard');
    expect(copy.cards[0]!.type).toBe('image');
    expect(validateDocument(serializeDocument(result.doc)).ok).toBe(true);
  });

  it('copying a column brings its cards and keeps them stacked', () => {
    const doc = sample();
    const clip = copyCards(doc, 'rootboard', ['column001'])!;
    expect(clip.cards.map((card) => card.id).sort()).toEqual(['column001', 'textcard3']);
    const result = pasteClip(doc, 'rootboard', clip, { x: 0, y: 2000 });
    if (!result.ok) throw new Error(result.error);
    expect(validateDocument(serializeDocument(result.doc)).ok).toBe(true);
  });

  it('pastes into another document and brings the image along', () => {
    const doc = sample();
    const clip = copyCards(doc, 'childboard', ['imagecard1'])!;
    const other = createEmptyDocument({ rootId: 'otherroot' });
    const result = pasteClip(other, 'otherroot', clip, { x: 10, y: 10 });
    if (!result.ok) throw new Error(result.error);
    expect(result.doc.files).toHaveLength(1);
    expect(validateDocument(serializeDocument(result.doc)).ok).toBe(true);
  });

  it('accepts only web addresses for links', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com/');
    expect(normalizeUrl('http://localhost:3000/x')).toBe('http://localhost:3000/x');
    for (const bad of ['javascript:alert(1)', 'file:///C:/Windows', 'hallo welt', '', 'mailto:a@b.de']) expect(normalizeUrl(bad)).toBeNull();
    let doc = createEmptyDocument({ rootId: 'rootboard' });
    doc = docOf(addLinkCard(doc, 'rootboard', 'www.example.org/a', { x: 0, y: 0 }, { cardId: 'linkcard1' }));
    const link = doc.boards[0]!.cards[0]!;
    expect(link).toMatchObject({ type: 'link', url: 'https://www.example.org/a', title: 'example.org' });
    expect(updateLink(doc, 'rootboard', 'linkcard1', { url: 'javascript:void(0)' }).ok).toBe(false);
    expect(validateDocument(serializeDocument(doc)).ok).toBe(true);
    const tampered = serializeDocument(doc).replace('https://www.example.org/a', 'javascript:alert(1)');
    expect(validateDocument(tampered).ok).toBe(false);
  });

  it('keeps the picture aspect ratio for image cards', () => {
    expect(imageCardSize({ width: 2000, height: 1000 })).toEqual({ width: 280, height: 140 });
    expect(imageCardSize({ width: 1000, height: 2000 })).toEqual({ width: 140, height: 280 });
    const wide = imageCardSize({ width: 4000, height: 400 });
    expect(wide.height).toBeGreaterThanOrEqual(96);
    expect(wide.width / wide.height).toBeCloseTo(10, 0);
  });

  it('brings cards to the front and sends them to the back', () => {
    const doc = sample();
    const front = docOf(reorderCards(doc, 'rootboard', ['textcard1'], 'front'));
    expect(front.boards[0]!.cards.at(-1)!.id).toBe('textcard1');
    const back = docOf(reorderCards(front, 'rootboard', ['textcard1'], 'back'));
    expect(back.boards[0]!.cards[0]!.id).toBe('textcard1');
  });
});

import { searchDocument } from '../src/shared/search';
import { insertTemplate } from '../src/shared/templates';

describe('search and templates', () => {
  it('finds text in every board, ignoring case and accents', () => {
    let doc = createEmptyDocument({ rootId: 'rootboard' });
    doc = docOf(addSubboard(doc, 'rootboard', 'Urlaub', { x: 0, y: 0 }, { cardId: 'boardcard1', boardId: 'childboard' }));
    doc = docOf(addTextCard(doc, 'childboard', 'Fähre nach Österreich', { x: 40, y: 60 }, { cardId: 'textcard1' }));
    const hits = searchDocument(doc, 'OSTERREICH');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ boardId: 'childboard', boardTitle: 'Urlaub', cardId: 'textcard1', kind: 'Notiz' });
    expect(searchDocument(doc, 'urlaub').map((hit) => hit.kind)).toEqual(['Board']);
    expect(searchDocument(doc, '   ')).toEqual([]);
    doc = docOf(addTextCard(doc, 'rootboard', '# Plan\n- **Markt** am Samstag\n[x] Tickets', { x: 0, y: 400 }, { cardId: 'textcard2' }));
    expect(searchDocument(doc, 'markt')[0]!.text).toBe('Plan Markt am Samstag Tickets');
  });

  it('every template produces a valid document', () => {
    for (const name of ['kanban', 'week', 'moodboard'] as const) {
      const result = insertTemplate(createEmptyDocument({ rootId: 'rootboard' }), 'rootboard', name, { x: 0, y: 0 });
      if (!result.ok) throw new Error(result.error);
      expect(validateDocument(serializeDocument(result.doc)).ok).toBe(true);
    }
  });
});

import { addSketchCard, addStroke, removeLastStroke, simplifyPoints } from '../src/shared/sketch';

describe('sketches', () => {
  it('stores simplified, clamped strokes that survive saving and loading', () => {
    let doc = createEmptyDocument({ rootId: 'rootboard' });
    doc = docOf(addSketchCard(doc, 'rootboard', { x: 0, y: 0 }, { cardId: 'sketchcard' }));
    doc = docOf(addStroke(doc, 'rootboard', 'sketchcard', { color: 'pink', width: 3, points: [0.1, 0.1, 0.1001, 0.1001, 0.5, 0.5, 1.4, -2] }));
    const card = doc.boards[0]!.cards[0]!;
    if (card.type !== 'sketch') throw new Error('no sketch');
    expect(card.strokes[0]!.points).toEqual([0.1, 0.1, 0.5, 0.5, 1, 0]);
    expect(validateDocument(serializeDocument(doc)).ok).toBe(true);
    doc = docOf(removeLastStroke(doc, 'rootboard', 'sketchcard'));
    expect((doc.boards[0]!.cards[0] as { strokes: unknown[] }).strokes).toHaveLength(0);
  });

  it('a single tap becomes a dot, broken data is refused on load', () => {
    expect(simplifyPoints([0.3, 0.3])).toEqual([0.3, 0.3, 0.3, 0.3]);
    let doc = createEmptyDocument({ rootId: 'rootboard' });
    doc = docOf(addSketchCard(doc, 'rootboard', { x: 0, y: 0 }, { cardId: 'sketchcard' }));
    doc = docOf(addStroke(doc, 'rootboard', 'sketchcard', { color: 'ink', width: 3, points: [0.1, 0.1, 0.9, 0.9] }));
    const tamper = (change: (stroke: { color: string; points: number[] }) => void) => {
      const raw = JSON.parse(serializeDocument(doc));
      change(raw.boards[0].cards[0].strokes[0]);
      return validateDocument(JSON.stringify(raw)).ok;
    };
    expect(tamper(() => undefined)).toBe(true);
    expect(tamper((stroke) => (stroke.color = 'red'))).toBe(false);
    expect(tamper((stroke) => (stroke.points[3] = 9))).toBe(false);
    expect(tamper((stroke) => stroke.points.push(0.5))).toBe(false);
  });
});

import { addShapeCard, addSwatchCard, setShapeText, updateSwatch } from '../src/shared/shapes';

describe('shapes, swatches and curved lines', () => {
  it('round-trips through the file format and rejects bad values', () => {
    let doc = createEmptyDocument({ rootId: 'rootboard' });
    doc = docOf(addShapeCard(doc, 'rootboard', 'diamond', { x: 0, y: 0 }, 'purple'));
    const shapeId = doc.boards[0]!.cards[0]!.id;
    doc = docOf(setShapeText(doc, 'rootboard', shapeId, 'Entscheidung?'));
    doc = docOf(addSwatchCard(doc, 'rootboard', { x: 300, y: 0 }));
    const swatchId = doc.boards[0]!.cards[1]!.id;
    doc = docOf(updateSwatch(doc, 'rootboard', swatchId, { color: '#FFAA00', label: 'Sonne' }));
    expect(updateSwatch(doc, 'rootboard', swatchId, { color: 'red' }).ok).toBe(false);
    doc = docOf(addCanvasLine(doc, 'rootboard', { kind: 'point', x: 0, y: 0 }, { kind: 'point', x: 100, y: 0 }, { id: 'curvedline1' }));
    const json = serializeDocument(doc);
    const loaded = validateDocument(json);
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.doc.boards[0]!.cards).toMatchObject([
      { type: 'shape', shape: 'diamond', color: 'purple', text: 'Entscheidung?' },
      { type: 'swatch', color: '#ffaa00', label: 'Sonne' },
    ]);
    const raw = JSON.parse(json);
    raw.boards[0].cards[1].color = 'javascript:alert(1)';
    expect(validateDocument(JSON.stringify(raw)).ok).toBe(false);
    const bent = JSON.parse(json);
    bent.boards[0].lines[0].bend = 40;
    const curved = validateDocument(JSON.stringify(bent));
    expect(curved.ok && curved.doc.boards[0]!.lines[0]!.bend).toBe(40);
  });
});

import { snapRect } from '../src/shared/snap';
import { addTableCard, addTableColumn, addTableRow, removeTableRow, setCell } from '../src/shared/table';

describe('snapping and tables', () => {
  it('snaps to the nearest edge or centre within the threshold only', () => {
    const other = { x: 0, y: 0, width: 200, height: 100 };
    expect(snapRect({ x: 303, y: 4, width: 100, height: 50 }, [other], 6)).toMatchObject({ x: 303, y: 0 });
    expect(snapRect({ x: 47, y: 300, width: 100, height: 50 }, [other], 6)).toMatchObject({ x: 50, y: 300 });
    expect(snapRect({ x: 320, y: 320, width: 100, height: 50 }, [other], 6)).toMatchObject({ x: 320, y: 320, guides: [] });
  });

  it('edits tables and keeps them valid', () => {
    let doc = createEmptyDocument({ rootId: 'rootboard' });
    doc = docOf(addTableCard(doc, 'rootboard', { x: 0, y: 0 }));
    const id = doc.boards[0]!.cards[0]!.id;
    doc = docOf(setCell(doc, 'rootboard', id, 0, 1, 'Preis'));
    doc = docOf(addTableRow(doc, 'rootboard', id));
    doc = docOf(addTableColumn(doc, 'rootboard', id));
    doc = docOf(removeTableRow(doc, 'rootboard', id));
    const table = doc.boards[0]!.cards[0]!;
    if (table.type !== 'table') throw new Error('no table');
    expect(table.rows).toHaveLength(3);
    expect(table.rows.every((row) => row.length === 4)).toBe(true);
    expect(table.rows[0]![1]).toBe('Preis');
    expect(validateDocument(serializeDocument(doc)).ok).toBe(true);
    const raw = JSON.parse(serializeDocument(doc));
    raw.boards[0].cards[0].rows[1].push('zu viel');
    expect(validateDocument(JSON.stringify(raw)).ok).toBe(false);
  });
});

import { freeSpot } from '../src/shared/snap';

describe('placement', () => {
  it('finds a free spot instead of stacking on an existing card', () => {
    const taken = [{ x: 0, y: 0, width: 200, height: 100 }];
    const spot = freeSpot({ x: 0, y: 0 }, { width: 100, height: 60 }, taken);
    expect(spot.x >= 200 || spot.y >= 100).toBe(true);
    expect(freeSpot({ x: 500, y: 500 }, { width: 100, height: 60 }, taken)).toEqual({ x: 500, y: 500 });
  });
});
