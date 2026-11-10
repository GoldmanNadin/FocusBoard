import { createId } from './ids';
import { COORD_LIMIT, MAX_ATTACHMENT_BYTES, MAX_CARDS_PER_BOARD, MSG, defaultSizeFor } from './limits';
import type { Board, DocResult, FileCard, WhiteboardDocument } from './model';

/**
 * Document types that can be attached. Everything that can run code when opened (programs, scripts,
 * shortcuts, installers, HTML, Office macro formats) is deliberately missing: a shared board must
 * never be able to carry something that executes on double-click.
 */
export const ATTACHMENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  rtf: 'application/rtf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  zip: 'application/zip',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
};

export const ATTACHMENT_LABEL = 'PDF, Text, Word, Excel, PowerPoint, OpenDocument, ZIP, Audio, MP4';

export function extensionOf(name: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(name);
  return match ? match[1]!.toLowerCase() : '';
}

/** Keeps a readable file name without path parts or control characters. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[\u0000-\u001F\u007F<>:"|?*]/g, '').trim().slice(0, 120);
  return cleaned || 'Datei';
}

/** Checks name, type and size and returns the normalised attachment, or an error text. */
export function inspectAttachment(name: string, dataUrl: string): { ok: true; name: string; mime: string; size: number; data: string } | { ok: false; error: string } {
  const clean = cleanFileName(name);
  const ext = extensionOf(clean);
  const mime = ATTACHMENT_TYPES[ext];
  if (!mime) return { ok: false, error: `Dieser Dateityp kann nicht angehängt werden. Erlaubt: ${ATTACHMENT_LABEL}.` };
  const match = /^data:[^;,]*;base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
  if (!match) return { ok: false, error: MSG.imageRead };
  const payload = match[1]!;
  const size = Math.floor((payload.length * 3) / 4) - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0);
  if (size <= 0) return { ok: false, error: 'Die Datei ist leer.' };
  if (size > MAX_ATTACHMENT_BYTES) return { ok: false, error: 'Die Datei ist zu groß (höchstens 10 MB).' };
  return { ok: true, name: clean, mime, size, data: `data:${mime};base64,${payload}` };
}

export function addFileCard(doc: WhiteboardDocument, boardId: string, file: { name: string; dataUrl: string }, position: { x: number; y: number }): DocResult {
  const board: Board | undefined = doc.boards.find((item) => item.id === boardId);
  if (!board) return { ok: false, error: MSG.missingBoard };
  if (board.cards.length >= MAX_CARDS_PER_BOARD) return { ok: false, error: MSG.tooManyCards };
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || Math.abs(position.x) > COORD_LIMIT || Math.abs(position.y) > COORD_LIMIT) {
    return { ok: false, error: MSG.badGeometry };
  }
  const checked = inspectAttachment(file.name, file.dataUrl);
  if (!checked.ok) return checked;
  const size = defaultSizeFor('file');
  const card: FileCard = { id: createId(), type: 'file', x: position.x, y: position.y, width: size.width, height: size.height, name: checked.name, mime: checked.mime, size: checked.size, data: checked.data, columnId: null };
  return { ok: true, doc: { ...doc, boards: doc.boards.map((item) => (item.id === boardId ? { ...board, cards: [...board.cards, card] } : item)) } };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
