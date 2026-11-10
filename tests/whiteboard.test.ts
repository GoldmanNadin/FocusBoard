import { describe, expect, it } from 'vitest';
import {
  addConnector,
  addImageCard,
  addSubboard,
  addTextCard,
  boardDepth,
  breadcrumb,
  createEmptyDocument,
  deleteCards,
  deleteConnectors,
  getBoard,
  moveCards,
  placeCardTopLeft,
  renameBoard,
  resizeCards,
  updateText,
  updateViewport,
} from '../src/shared/boardOps';
import { prepareDocumentForDisk, serializeDocument, validateDocument } from '../src/shared/document';
import {
  wheelAction,
  deleteBoardsMessage,
  nextZoomFromDelta,
  panViewport,
  placementTopLeft,
  resolveClose,
  windowTitle,
  zoomViewportAtPoint,
} from '../src/shared/gestures';
import { detectImageMime, inspectImageBytes, inspectImageDataUrl, sanitizeFileName } from '../src/shared/images';
import { MAX_IMAGE_BYTES, MAX_TEXT_LENGTH, MIN_TEXT_SIZE, MSG } from '../src/shared/limits';
import type { DocResult, WhiteboardDocument } from '../src/shared/model';
import { normalizeCardText, normalizeTitle } from '../src/shared/text';

const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function pngBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from(TINY_PNG, 'base64'));
}

function pngDataUrl(): string {
  return `data:image/png;base64,${TINY_PNG}`;
}

function ok(result: DocResult): WhiteboardDocument {
  if (!result.ok) throw new Error(result.error);
  return result.doc;
}

function mustValidate(input: unknown): WhiteboardDocument {
  const result = validateDocument(input);
  if (!result.ok) throw new Error(result.error);
  return result.doc;
}

describe('text', () => {
  it('keeps German letters, newlines and tabs', () => {
    const result = normalizeCardText('Äpfel\nÖfen\tStraße und ß');
    expect(result).toEqual({ ok: true, text: 'Äpfel\nÖfen\tStraße und ß' });
  });

  it('rejects empty text and text that is only whitespace', () => {
    expect(normalizeCardText('   \n\t')).toEqual({ ok: false, error: MSG.emptyText });
  });

  it('strips control characters and enforces the length limit', () => {
    expect(normalizeCardText('a\u0000b')).toEqual({ ok: true, text: 'ab' });
    const tooLong = 'ä'.repeat(MAX_TEXT_LENGTH + 1);
    expect(normalizeCardText(tooLong).ok).toBe(false);
    expect(normalizeCardText('ä'.repeat(MAX_TEXT_LENGTH)).ok).toBe(true);
  });

  it('normalizes board titles by code point', () => {
    expect(normalizeTitle('  Hausaufgaben \n morgen ')).toBe('Hausaufgaben morgen');
    expect(normalizeTitle('   ')).toBe('Neues Board');
    expect(normalizeTitle('ä'.repeat(90)).length).toBe(80);
  });
});

describe('images', () => {
  it('detects png, jpeg, gif and webp by magic bytes', () => {
    expect(detectImageMime(pngBytes())).toBe('image/png');
    expect(detectImageMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))).toBe('image/jpeg');
    expect(detectImageMime(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0]))).toBe('image/gif');
    const webp = new Uint8Array(12);
    webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(detectImageMime(webp)).toBe('image/webp');
    expect(detectImageMime(Uint8Array.from([1, 2, 3, 4]))).toBeNull();
  });

  it('rejects empty, oversized, mismatched extension and non-images', () => {
    expect(inspectImageBytes(new Uint8Array(), 'a.png').ok).toBe(false);
    const huge = new Uint8Array(MAX_IMAGE_BYTES + 1);
    huge.set(pngBytes());
    expect(inspectImageBytes(huge, 'a.png')).toMatchObject({ ok: false, error: MSG.imageSize });
    expect(inspectImageBytes(pngBytes(), 'foto.jpg')).toMatchObject({ ok: false, error: MSG.imageExtension });
    expect(inspectImageBytes(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), 'a.png')).toMatchObject({
      ok: false,
      error: MSG.imageType,
    });
  });

  it('sanitizes file names and checks data URLs', () => {
    expect(sanitizeFileName('C:\\Users\\Ada\\skizze.png')).toBe('skizze.png');
    expect(sanitizeFileName('../geheim.png')).toBe('geheim.png');
    const inspected = inspectImageDataUrl(pngDataUrl(), 'punkt.png');
    expect(inspected.ok).toBe(true);
    if (inspected.ok) expect(inspected.image.byteSize).toBe(pngBytes().byteLength);
    expect(inspectImageDataUrl('data:image/png;base64,/9j/4AAQ', 'a.png').ok).toBe(false);
    expect(inspectImageDataUrl('data:image/svg+xml;base64,PHN2Zz4=', 'a.svg').ok).toBe(false);
  });
});

describe('gestures and close prompts', () => {
  it('scrolls with the wheel, pans both axes, and zooms only with ctrl at the pointer', () => {
    const viewport = { x: 0, y: 0, zoom: 1 };
    const vertical = wheelAction({ ctrlKey: false, shiftKey: false, deltaX: 0, deltaY: 40, deltaMode: 0, viewport, paneX: 80, paneY: 60, overEditor: false });
    expect(vertical.type).toBe('pan');
    if (vertical.type === 'pan') expect(vertical.viewport).toEqual({ x: 0, y: -40, zoom: 1 });
    const both = wheelAction({ ctrlKey: false, shiftKey: false, deltaX: 6, deltaY: 8, deltaMode: 0, viewport, paneX: 10, paneY: 10, overEditor: false });
    expect(both.type).toBe('pan');
    if (both.type === 'pan') expect(both.viewport).toEqual({ x: -6, y: -8, zoom: 1 });
    const horizontal = wheelAction({ ctrlKey: false, shiftKey: true, deltaX: 0, deltaY: 20, deltaMode: 0, viewport, paneX: 10, paneY: 10, overEditor: false });
    expect(horizontal.type).toBe('pan');
    if (horizontal.type === 'pan') expect(horizontal.viewport.y).toBe(0);
    const zoom = wheelAction({ ctrlKey: true, shiftKey: false, deltaX: 0, deltaY: 20, deltaMode: 0, viewport, paneX: 100, paneY: 80, overEditor: false });
    expect(zoom.type).toBe('zoom');
    if (zoom.type === 'zoom') {
      const anchored = 100 * zoom.viewport.zoom + zoom.viewport.x;
      expect(anchored).toBeCloseTo(100);
    }
    expect(wheelAction({ ctrlKey: true, shiftKey: false, deltaX: 0, deltaY: 20, deltaMode: 0, viewport, paneX: 0, paneY: 0, overEditor: true }).type).toBe('ignore');
  });

  it('zooms toward the pointer and pans by the wheel delta', () => {
    const zoomed = zoomViewportAtPoint({ x: 0, y: 0, zoom: 1 }, 100, 80, 2);
    expect(zoomed.zoom).toBe(2);
    expect(zoomed.x).toBeCloseTo(-100);
    expect(zoomed.y).toBeCloseTo(-80);
    const screenX = 100 * zoomed.zoom + zoomed.x;
    expect(screenX).toBeCloseTo(100);
    expect(panViewport({ x: 10, y: 5, zoom: 1 }, 4, -2)).toEqual({ x: 6, y: 7, zoom: 1 });
    expect(nextZoomFromDelta(1, 100)).toBeLessThan(1);
    expect(nextZoomFromDelta(1, -100)).toBeGreaterThan(1);
  });

  it('places a card around a point and cascades repeats', () => {
    expect(placementTopLeft({ x: 200, y: 100 }, { width: 80, height: 40 }, 0)).toEqual({ x: 160, y: 80 });
    expect(placeCardTopLeft({ x: 200, y: 100 }, 'text', 1).x).toBeGreaterThan(
      placeCardTopLeft({ x: 200, y: 100 }, 'text', 0).x,
    );
  });

  it('resolves the close dialog and board-delete copy', () => {
    expect(resolveClose(false, null)).toBe('close');
    expect(resolveClose(true, 'save')).toBe('save-then-close');
    expect(resolveClose(true, 'discard')).toBe('close');
    expect(resolveClose(true, 'cancel')).toBe('stay');
    expect(resolveClose(true, null)).toBe('stay');
    expect(deleteBoardsMessage(['Haus\naufgaben']).message).toBe('Unterboard „Haus aufgaben“ löschen?');
    expect(deleteBoardsMessage(['Eins', 'Zwei']).message).toBe('2 Unterboards löschen?');
    expect(windowTitle(null, true)).toBe('● Unbenannt — FocusBoard');
    expect(windowTitle('wand.json', false)).toBe('wand.json — FocusBoard');
  });
});

describe('board operations', () => {
  it('creates, moves, resizes, edits and deletes a text card without mutating the previous document', () => {
    const original = createEmptyDocument({ rootId: 'rootboard' });
    const snapshot = serializeDocument(original);
    const created = ok(
      addTextCard(original, 'rootboard', 'Äpfel\nund Öfen', { x: 20, y: 30 }, { cardId: 'textcard1' }),
    );
    expect(serializeDocument(original)).toBe(snapshot);
    const card = getBoard(created, 'rootboard')?.cards[0];
    expect(card).toMatchObject({ type: 'text', text: 'Äpfel\nund Öfen', x: 20, y: 30 });
    const moved = ok(moveCards(created, 'rootboard', [{ id: 'textcard1', x: 50, y: 60 }]));
    expect(getBoard(moved, 'rootboard')?.cards[0]).toMatchObject({ x: 50, y: 60 });
    const resized = ok(resizeCards(moved, 'rootboard', [{ id: 'textcard1', width: 10, height: 10 }]));
    expect(getBoard(resized, 'rootboard')?.cards[0]).toMatchObject({
      width: MIN_TEXT_SIZE.width,
      height: MIN_TEXT_SIZE.height,
    });
    const edited = ok(updateText(resized, 'rootboard', 'textcard1', 'Nur noch Straße'));
    expect(getBoard(edited, 'rootboard')?.cards[0]).toMatchObject({ text: 'Nur noch Straße' });
    expect(getBoard(ok(updateText(edited, 'rootboard', 'textcard1', '')), 'rootboard')?.cards[0]).toMatchObject({ text: '' });
    const removed = ok(deleteCards(edited, 'rootboard', ['textcard1']));
    expect(getBoard(removed, 'rootboard')?.cards).toHaveLength(0);
  });

  it('connects cards, rejects self-links and duplicate arrows, and drops links when a card goes away', () => {
    let doc = createEmptyDocument({ rootId: 'rootboard' });
    doc = ok(addTextCard(doc, 'rootboard', 'Eins', { x: 0, y: 0 }, { cardId: 'textcard1' }));
    doc = ok(addTextCard(doc, 'rootboard', 'Zwei', { x: 40, y: 40 }, { cardId: 'textcard2' }));
    doc = ok(
      addConnector(
        doc,
        'rootboard',
        { source: 'textcard1', target: 'textcard2', sourceHandle: 'right', targetHandle: 'left' },
        { connectorId: 'linkconn1' },
      ),
    );
    expect(addConnector(doc, 'rootboard', { source: 'textcard1', target: 'textcard1' }).ok).toBe(false);
    expect(
      addConnector(doc, 'rootboard', {
        source: 'textcard1',
        target: 'textcard2',
        sourceHandle: 'right',
        targetHandle: 'left',
      }),
    ).toMatchObject({ ok: false, error: MSG.duplicateConnector });
    expect(addConnector(doc, 'rootboard', { source: 'textcard1', target: 'missing01' }).ok).toBe(false);
    const removed = ok(deleteCards(doc, 'rootboard', ['textcard2']));
    expect(getBoard(removed, 'rootboard')?.lines).toHaveLength(0);
    const kept = ok(deleteConnectors(doc, 'rootboard', ['linkconn1']));
    expect(getBoard(kept, 'rootboard')?.cards).toHaveLength(2);
    expect(getBoard(kept, 'rootboard')?.lines).toHaveLength(0);
  });

  it('builds a nested board, keeps the parent, and deletes the whole subtree with its images', () => {
    let doc = createEmptyDocument({ rootId: 'rootboard' });
    doc = ok(addTextCard(doc, 'rootboard', 'Elternkarte', { x: 0, y: 0 }, { cardId: 'textcard1' }));
    doc = ok(
      addImageCard(doc, 'rootboard', { fileName: 'eltern.png', dataUrl: pngDataUrl() }, { x: 80, y: 0 }, {
        cardId: 'imagecard',
        fileId: 'fileimage',
      }),
    );
    doc = ok(
      addSubboard(doc, 'rootboard', 'Hausaufgaben', { x: 10, y: 10 }, { cardId: 'boardcard', boardId: 'child0001' }),
    );
    doc = ok(addTextCard(doc, 'child0001', 'Innen', { x: 5, y: 5 }, { cardId: 'innertext' }));
    doc = ok(
      addImageCard(doc, 'child0001', { fileName: 'innen.png', dataUrl: pngDataUrl() }, { x: 30, y: 30 }, {
        cardId: 'innerimag',
        fileId: 'innerfile',
      }),
    );
    doc = ok(
      addSubboard(doc, 'child0001', 'Detail', { x: 12, y: 12 }, { cardId: 'deepboard', boardId: 'grand0001' }),
    );
    expect(breadcrumb(doc, 'grand0001').map((item) => item.title)).toEqual(['Hauptboard', 'Hausaufgaben', 'Detail']);
    expect(boardDepth(doc, 'grand0001')).toBe(2);
    expect(getBoard(doc, 'rootboard')?.cards).toHaveLength(3);
    const removed = ok(deleteCards(doc, 'rootboard', ['boardcard']));
    expect(getBoard(removed, 'child0001')).toBeUndefined();
    expect(getBoard(removed, 'grand0001')).toBeUndefined();
    expect(removed.files.map((file) => file.id)).toEqual(['fileimage']);
    expect(getBoard(removed, 'rootboard')?.cards.map((card) => card.id)).toEqual(['textcard1', 'imagecard']);
  });

  it('stops nesting past the depth limit and renames boards', () => {
    let doc = createEmptyDocument({ rootId: 'rootboard' });
    let parent = 'rootboard';
    for (let index = 1; index <= 8; index += 1) {
      const boardId = `depth${String(index).padStart(4, '0')}`;
      const cardId = `dcard${String(index).padStart(4, '0')}`;
      doc = ok(addSubboard(doc, parent, `Ebene ${index}`, { x: 0, y: 0 }, { boardId, cardId }));
      parent = boardId;
    }
    expect(addSubboard(doc, parent, 'zu tief', { x: 0, y: 0 })).toMatchObject({ ok: false, error: MSG.tooDeep });
    const renamed = ok(renameBoard(doc, 'rootboard', '  Wandtafel  '));
    expect(getBoard(renamed, 'rootboard')?.title).toBe('Wandtafel');
  });

  it('round-trips boards, arrows, viewports and embedded images', () => {
    let doc = createEmptyDocument({ rootId: 'rootboard' });
    doc = ok(addTextCard(doc, 'rootboard', 'Äpfel, Öfen, Straße', { x: 12, y: 18 }, { cardId: 'textcard1' }));
    doc = ok(
      addImageCard(doc, 'rootboard', { fileName: 'skizze.png', dataUrl: pngDataUrl() }, { x: 90, y: 20 }, {
        cardId: 'imagecard',
        fileId: 'fileimage',
      }),
    );
    doc = ok(addSubboard(doc, 'rootboard', 'Recherche', { x: 30, y: 140 }, { cardId: 'boardcard', boardId: 'child0001' }));
    doc = ok(addTextCard(doc, 'child0001', 'Noch offen', { x: 8, y: 8 }, { cardId: 'innertext' }));
    doc = ok(
      addConnector(doc, 'rootboard', { source: 'textcard1', target: 'boardcard', sourceHandle: 'bottom', targetHandle: 'top' }, {
        connectorId: 'linkconn1',
      }),
    );
    doc = ok(updateViewport(doc, 'child0001', { x: 15, y: -8, zoom: 1.25 }));
    const loaded = mustValidate(serializeDocument(doc));
    expect(loaded).toEqual(doc);
    const again = prepareDocumentForDisk(serializeDocument(loaded));
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.doc).toEqual(doc);
  });
});

describe('document validation', () => {
  it('rejects malformed files', () => {
    expect(validateDocument('not json')).toMatchObject({ ok: false, error: MSG.invalidJson });
    expect(validateDocument('{')).toMatchObject({ ok: false, error: MSG.invalidJson });
    expect(validateDocument('{"format":"other","version":1}')).toMatchObject({ ok: false, error: MSG.invalidDoc });
    const doc = createEmptyDocument({ rootId: 'rootboard' });
    const wrongVersion = serializeDocument(doc).replace('"version": 3', '"version": 9');
    expect(validateDocument(wrongVersion)).toMatchObject({ ok: false, error: MSG.unsupportedVersion });
    expect(validateDocument(serializeDocument(doc), { maxBytes: 20 })).toMatchObject({ ok: false, error: MSG.fileTooBig });
  });

  it('strips prototype keys and rejects broken links, orphans and unused images', () => {
    const doc = ok(addTextCard(createEmptyDocument({ rootId: 'rootboard' }), 'rootboard', 'Hallo', { x: 0, y: 0 }, { cardId: 'textcard1' }));
    const polluted = serializeDocument(doc).replace('"format"', '"__proto__": {"polluted": true}, "format"');
    const clean = validateDocument(polluted);
    expect(clean.ok).toBe(true);
    expect((Object.prototype as { polluted?: boolean }).polluted).toBeUndefined();

    const raw = JSON.parse(serializeDocument(doc)) as {
      boards: { cards: { id: string }[]; connectors: unknown[]; parentBoardId: string | null; id: string }[];
      files: unknown[];
    };
    raw.boards[0].connectors = [
      { id: 'linkconn1', source: 'textcard1', target: 'textcard1', sourceHandle: null, targetHandle: null },
    ];
    expect(validateDocument(raw).ok).toBe(false);

    const orphan = JSON.parse(serializeDocument(doc)) as typeof raw;
    orphan.boards.push({
      id: 'orphan001',
      title: 'Verwaist',
      parentBoardId: 'rootboard',
      cards: [],
      connectors: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    } as unknown as (typeof raw.boards)[number]);
    expect(validateDocument(orphan)).toMatchObject({ ok: false, error: MSG.orphanBoard });

    const withImage = ok(
      addImageCard(doc, 'rootboard', { fileName: 'a.png', dataUrl: pngDataUrl() }, { x: 40, y: 40 }, {
        cardId: 'imagecard',
        fileId: 'fileimage',
      }),
    );
    const imageRaw = JSON.parse(serializeDocument(withImage)) as { boards: { cards: object[] }[]; files: object[] };
    imageRaw.boards[0].cards = imageRaw.boards[0].cards.filter((card) => (card as { type?: string }).type !== 'image');
    expect(validateDocument(imageRaw)).toMatchObject({ ok: false, error: MSG.unusedImage });
  });

  it('keeps a shared image file until the last card is deleted', () => {
    const doc = ok(
      addImageCard(createEmptyDocument({ rootId: 'rootboard' }), 'rootboard', { fileName: 'a.png', dataUrl: pngDataUrl() }, { x: 0, y: 0 }, {
        cardId: 'imagecard',
        fileId: 'fileimage',
      }),
    );
    const raw = JSON.parse(serializeDocument(doc)) as { boards: { cards: Record<string, unknown>[] }[] };
    raw.boards[0].cards.push({ ...raw.boards[0].cards[0], id: 'imagecd02', x: 80, y: 80 });
    const shared = mustValidate(raw);
    expect(shared.files).toHaveLength(1);
    const oneLeft = ok(deleteCards(shared, 'rootboard', ['imagecard']));
    expect(oneLeft.files).toHaveLength(1);
    const none = ok(deleteCards(oneLeft, 'rootboard', ['imagecd02']));
    expect(none.files).toHaveLength(0);
  });
});
