import { addColumn, addImageCard, addSticker, addSubboard, addTextCard, addTodoCard, createEmptyDocument, setTheme } from '../../shared/boardOps';
import { placeInColumn } from '../../shared/columns';
import { addCanvasLine } from '../../shared/lines';
import { addTodoItem, setTodoItemText, setTodoTitle, toggleTodoItem } from '../../shared/todos';
import type { NoteColor, ThemeName, WhiteboardDocument } from '../../shared/model';

export function drawSamplePng(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#f6f1e8';
  ctx.fillRect(0, 0, 640, 400);
  ctx.fillStyle = '#2f5d9f';
  ctx.fillRect(48, 56, 230, 150);
  ctx.fillStyle = '#2f6f5e';
  ctx.beginPath();
  ctx.arc(450, 140, 78, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#b85c38';
  ctx.lineWidth = 18;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(70, 310);
  ctx.lineTo(560, 310);
  ctx.stroke();
  return canvas.toDataURL('image/png');
}

export function buildDemoDocument(dataUrl: string, theme: ThemeName = 'light'): WhiteboardDocument {
  let doc = createEmptyDocument({ rootId: 'rootdemo1' });
  const themed = setTheme(doc, theme);
  if (themed.ok) doc = themed.doc;
  const heading = addTextCard(doc, doc.rootBoardId, 'Ideen', { x: 36, y: 20 }, { cardId: 'headdemo1' }, { style: 'heading', color: null });
  if (heading.ok) doc = heading.doc;
  const sub = addTextCard(doc, doc.rootBoardId, 'Tafel', { x: 400, y: 28 }, { cardId: 'subdemo01' }, { style: 'subheading', color: null });
  if (sub.ok) doc = sub.doc;
  const colors: NoteColor[] = ['yellow', 'pink', 'turquoise', 'green', 'orange'];
  colors.forEach((color, index) => {
    const note = addTextCard(
      doc,
      doc.rootBoardId,
      index === 0 ? 'Äpfel, Öfen, Straße' : color,
      { x: 36 + index * 248, y: 120 },
      { cardId: `notedemo${index}` },
      { style: 'note', color },
    );
    if (note.ok) doc = note.doc;
  });
  const sticker = addSticker(doc, doc.rootBoardId, 'star', { x: 1260, y: 16 }, { cardId: 'startdemo' });
  if (sticker.ok) doc = sticker.doc;
  const column = addColumn(doc, doc.rootBoardId, { x: 36, y: 320 }, { cardId: 'columndem' });
  if (!column.ok) return doc;
  doc = column.doc;
  const inside = addTextCard(doc, doc.rootBoardId, 'In der Spalte', { x: 800, y: 600 }, { cardId: 'colnote01' }, { style: 'note', color: 'turquoise' });
  if (!inside.ok) return doc;
  doc = inside.doc;
  const placed = placeInColumn(doc, doc.rootBoardId, 'colnote01', 'columndem', 0);
  if (placed.ok) doc = placed.doc;
  const todo = addTodoCard(doc, doc.rootBoardId, { x: 360, y: 320 }, { cardId: 'tododemo1' });
  if (!todo.ok) return doc;
  doc = todo.doc;
  const titled = setTodoTitle(doc, doc.rootBoardId, 'tododemo1', 'Zu tun');
  if (titled.ok) doc = titled.doc;
  const firstItem = doc.boards[0]?.cards.find((card) => card.id === 'tododemo1');
  const firstId = firstItem?.type === 'todo' ? firstItem.items[0]?.id : undefined;
  if (firstId) {
    const written = setTodoItemText(doc, doc.rootBoardId, 'tododemo1', firstId, 'Milch');
    if (written.ok) doc = written.doc;
    const checked = toggleTodoItem(doc, doc.rootBoardId, 'tododemo1', firstId);
    if (checked.ok) doc = checked.doc;
  }
  const extra = addTodoItem(doc, doc.rootBoardId, 'tododemo1');
  if (extra.ok) {
    doc = extra.doc;
    const second = doc.boards[0]?.cards.find((card) => card.id === 'tododemo1');
    const secondId = second?.type === 'todo' ? second.items[1]?.id : undefined;
    if (secondId) {
      const written = setTodoItemText(doc, doc.rootBoardId, 'tododemo1', secondId, 'Brot');
      if (written.ok) doc = written.doc;
    }
  }
  const image = addImageCard(
    doc,
    doc.rootBoardId,
    { fileName: 'skizze.png', dataUrl },
    { x: 660, y: 320 },
    { cardId: 'imgdemo01', fileId: 'filedemo1' },
  );
  if (!image.ok) return doc;
  doc = image.doc;
  const child = addSubboard(doc, doc.rootBoardId, 'Hausaufgaben', { x: 980, y: 340 }, {
    cardId: 'boarddem1',
    boardId: 'childdem1',
  });
  if (!child.ok) return doc;
  doc = child.doc;
  const inner = addTextCard(doc, 'childdem1', 'Matheblatt fotografieren und hier ablegen.', { x: 80, y: 80 }, { cardId: 'childtxt1' });
  if (!inner.ok) return doc;
  doc = inner.doc;
  const link = addCanvasLine(
    doc,
    doc.rootBoardId,
    { kind: 'card', cardId: 'notedemo0', side: 'bottom', t: 0.5 },
    { kind: 'card', cardId: 'notedemo1', side: 'bottom', t: 0.5 },
    { id: 'linkdemo1', color: 'orange', arrowhead: true },
  );
  return link.ok ? link.doc : doc;
}
