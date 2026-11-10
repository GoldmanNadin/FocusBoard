import { app, dialog } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { writeAtomic } from '../shared/atomicWrite';
import { prepareDocumentForDisk, serializeDocument, validateDocument } from '../shared/document';
import {
  containedPath,
  externalEditIsNewer,
  freshBoard,
  idFromFileName,
  libraryFileName,
  previewLines,
  previewOf,
  remapDocument,
  rootTitle,
  uniqueTitle,
  withRootTitle,
  type LibraryEntry,
} from '../shared/library';
import { MSG } from '../shared/limits';
import type { WhiteboardDocument } from '../shared/model';

const SETTINGS = 'library-settings.json';
const TRASH = 'Papierkorb';

type Settings = { folder: string | null; recent: { id: string; at: number }[] };

function settingsPath(): string {
  return path.join(app.getPath('userData'), SETTINGS);
}

async function readSettings(): Promise<Settings> {
  try {
    const raw = JSON.parse(await fs.readFile(settingsPath(), 'utf8')) as Partial<Settings>;
    return {
      folder: typeof raw.folder === 'string' ? raw.folder : null,
      recent: Array.isArray(raw.recent)
        ? raw.recent.flatMap((item) => (item && typeof item.id === 'string' && typeof item.at === 'number' ? [{ id: item.id, at: item.at }] : [])).slice(0, 8)
        : [],
    };
  } catch {
    return { folder: null, recent: [] };
  }
}

async function writeSettings(settings: Settings): Promise<void> {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await writeAtomic(settingsPath(), JSON.stringify(settings));
}

export async function libraryRoot(): Promise<string> {
  const settings = await readSettings();
  if (settings.folder) return path.resolve(settings.folder);
  if (process.env.WHITEBOARD_LIBRARY_DIR) return path.resolve(process.env.WHITEBOARD_LIBRARY_DIR);
  return path.join(app.getPath('documents'), 'FocusBoard');
}

async function trashRoot(): Promise<string> {
  return path.join(await libraryRoot(), TRASH);
}

export async function libraryFilePath(id: string): Promise<string | null> {
  return resolveEntry(await libraryRoot(), id, false);
}

function resolveEntry(root: string, id: string, trashed: boolean): string | null {
  const name = libraryFileName(id);
  if (!name) return null;
  const target = path.resolve(trashed ? path.join(root, TRASH, name) : path.join(root, name));
  return containedPath(trashed ? path.join(root, TRASH) : root, target) ? target : null;
}

async function readDoc(file: string): Promise<{ doc: WhiteboardDocument; json: string; mtime: number } | null> {
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > 40 * 1024 * 1024) return null;
    const json = await fs.readFile(file, 'utf8');
    const prepared = prepareDocumentForDisk(json);
    if (!prepared.ok) return null;
    const validated = validateDocument(prepared.json);
    if (!validated.ok) return null;
    return { doc: validated.doc, json: prepared.json, mtime: stat.mtimeMs };
  } catch {
    return null;
  }
}

async function titlesIn(dir: string): Promise<string[]> {
  const names = await fs.readdir(dir).catch(() => []);
  const titles: string[] = [];
  for (const name of names) {
    const id = idFromFileName(name);
    if (!id) continue;
    const loaded = await readDoc(path.join(dir, name));
    if (loaded) titles.push(rootTitle(loaded.doc));
  }
  return titles;
}

export async function listLibrary(trashed: boolean): Promise<LibraryEntry[]> {
  const root = trashed ? await trashRoot() : await libraryRoot();
  await fs.mkdir(root, { recursive: true });
  const names = await fs.readdir(root).catch(() => []);
  const entries: LibraryEntry[] = [];
  for (const name of names) {
    const id = idFromFileName(name);
    if (!id) continue;
    const loaded = await readDoc(path.join(root, name));
    if (!loaded) continue;
    entries.push({
      id,
      title: rootTitle(loaded.doc),
      modifiedAt: loaded.mtime,
      preview: previewOf(loaded.doc),
      lines: previewLines(loaded.doc),
      trashed,
    });
  }
  entries.sort((a, b) => b.modifiedAt - a.modifiedAt);
  return entries;
}

export async function recentLibrary(): Promise<LibraryEntry[]> {
  const settings = await readSettings();
  const live = await listLibrary(false);
  const byId = new Map(live.map((entry) => [entry.id, entry]));
  return settings.recent.flatMap((item) => {
    const entry = byId.get(item.id);
    return entry ? [entry] : [];
  });
}

async function remember(id: string): Promise<void> {
  const settings = await readSettings();
  settings.recent = [{ id, at: Date.now() }, ...settings.recent.filter((item) => item.id !== id)].slice(0, 8);
  await writeSettings(settings);
}

export async function createLibraryBoard(title?: string): Promise<{ ok: true; id: string; json: string; mtime: number } | { ok: false; error: string }> {
  const root = await libraryRoot();
  await fs.mkdir(root, { recursive: true });
  const name = uniqueTitle(await titlesIn(root), title?.trim() || 'Neues Board');
  const doc = freshBoard(name);
  const id = doc.rootBoardId;
  const file = resolveEntry(root, id, false);
  if (!file) return { ok: false, error: MSG.saveFailed };
  const json = serializeDocument(doc);
  await writeAtomic(file, json);
  const stat = await fs.stat(file);
  await remember(id);
  return { ok: true, id, json, mtime: stat.mtimeMs };
}

export async function openLibraryBoard(id: string): Promise<{ ok: true; id: string; json: string; mtime: number; fileName: string } | { ok: false; error: string }> {
  const root = await libraryRoot();
  const file = resolveEntry(root, id, false);
  if (!file) return { ok: false, error: MSG.invalidDoc };
  const loaded = await readDoc(file);
  if (!loaded) return { ok: false, error: MSG.invalidDoc };
  await remember(id);
  return { ok: true, id, json: loaded.json, mtime: loaded.mtime, fileName: path.basename(file) };
}

export async function saveLibraryBoard(
  id: string,
  json: string,
  knownMtime: number | null,
): Promise<{ ok: true; mtime: number } | { ok: false; error: string }> {
  const root = await libraryRoot();
  const file = resolveEntry(root, id, false);
  if (!file) return { ok: false, error: MSG.saveFailed };
  const prepared = prepareDocumentForDisk(json);
  if (!prepared.ok) return prepared;
  try {
    const stat = await fs.stat(file);
    const disk = await fs.readFile(file, 'utf8');
    if (externalEditIsNewer(knownMtime, stat.mtimeMs, disk, prepared.json)) {
      return { ok: false, error: 'Die Datei wurde außerhalb geändert.' };
    }
  } catch {
    // new file
  }
  await writeAtomic(file, prepared.json);
  const next = await fs.stat(file);
  return { ok: true, mtime: next.mtimeMs };
}

export async function renameLibraryBoard(id: string, title: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const opened = await openLibraryBoard(id);
  if (!opened.ok) return opened;
  const validated = validateDocument(opened.json);
  if (!validated.ok) return validated;
  const renamed = withRootTitle(validated.doc, title);
  return saveLibraryBoard(id, serializeDocument(renamed), opened.mtime);
}

export async function duplicateLibraryBoard(id: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const opened = await openLibraryBoard(id);
  if (!opened.ok) return opened;
  const validated = validateDocument(opened.json);
  if (!validated.ok) return validated;
  const copy = withRootTitle(remapDocument(validated.doc), `Kopie von ${rootTitle(validated.doc)}`);
  const root = await libraryRoot();
  const file = resolveEntry(root, copy.rootBoardId, false);
  if (!file) return { ok: false, error: MSG.saveFailed };
  await writeAtomic(file, serializeDocument(copy));
  return { ok: true, id: copy.rootBoardId };
}

export async function trashLibraryBoard(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const root = await libraryRoot();
  const source = resolveEntry(root, id, false);
  const destDir = await trashRoot();
  const dest = resolveEntry(root, id, true);
  if (!source || !dest) return { ok: false, error: MSG.saveFailed };
  await fs.mkdir(destDir, { recursive: true });
  await fs.rename(source, dest);
  return { ok: true };
}

export async function restoreLibraryBoard(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const root = await libraryRoot();
  const source = resolveEntry(root, id, true);
  const dest = resolveEntry(root, id, false);
  if (!source || !dest) return { ok: false, error: MSG.saveFailed };
  await fs.rename(source, dest);
  return { ok: true };
}

export async function importLibraryJson(json: string, title?: string): Promise<{ ok: true; id: string; json: string; mtime: number } | { ok: false; error: string }> {
  const prepared = prepareDocumentForDisk(json);
  if (!prepared.ok) return prepared;
  const validated = validateDocument(prepared.json);
  if (!validated.ok) return validated;
  const copy = remapDocument(validated.doc);
  const named = title ? withRootTitle(copy, title) : copy;
  const root = await libraryRoot();
  await fs.mkdir(root, { recursive: true });
  const file = resolveEntry(root, named.rootBoardId, false);
  if (!file) return { ok: false, error: MSG.saveFailed };
  const text = serializeDocument(named);
  await writeAtomic(file, text);
  const stat = await fs.stat(file);
  await remember(named.rootBoardId);
  return { ok: true, id: named.rootBoardId, json: text, mtime: stat.mtimeMs };
}

export async function chooseLibraryFolder(): Promise<{ ok: true; folder: string } | { ok: true; canceled: true } | { ok: false; error: string }> {
  if (process.env.WHITEBOARD_E2E === '1' && process.env.WHITEBOARD_E2E_LIBRARY) {
    const folder = path.resolve(process.env.WHITEBOARD_E2E_LIBRARY);
    const settings = await readSettings();
    settings.folder = folder;
    await writeSettings(settings);
    await fs.mkdir(folder, { recursive: true });
    return { ok: true, folder };
  }
  const win = undefined;
  const result = await dialog.showOpenDialog({
    title: 'Bibliotheksordner',
    defaultPath: await libraryRoot(),
    properties: ['openDirectory', 'createDirectory'],
  });
  void win;
  if (result.canceled || result.filePaths.length === 0) return { ok: true, canceled: true };
  const folder = path.resolve(result.filePaths[0] ?? '');
  const settings = await readSettings();
  settings.folder = folder;
  await writeSettings(settings);
  await fs.mkdir(folder, { recursive: true });
  return { ok: true, folder };
}

export async function libraryFolder(): Promise<string> {
  return libraryRoot();
}

export async function seedDemoLibrary(): Promise<void> {
  const { addColumn, addImageCard, addTextCard, addTodoCard } = await import('../shared/boardOps');
  const { addCanvasLine } = await import('../shared/lines');
  const root = await libraryRoot();
  await fs.mkdir(root, { recursive: true });
  const boards = [
    () => {
      let doc = freshBoard('Ideen');
      for (const [text, color, x, y] of [
        ['Äpfel', 'yellow', 40, 40],
        ['Straße', 'pink', 280, 50],
        ['Öfen', 'orange', 80, 230],
      ] as const) {
        const added = addTextCard(doc, doc.rootBoardId, text, { x, y }, undefined, { style: 'note', color });
        if (added.ok) doc = added.doc;
      }
      return doc;
    },
    () => {
      let doc = freshBoard('Hausaufgaben');
      const column = addColumn(doc, doc.rootBoardId, { x: 30, y: 30 });
      if (column.ok) doc = column.doc;
      const note = addTextCard(doc, doc.rootBoardId, 'Mathe', { x: 320, y: 40 }, undefined, { style: 'note', color: 'turquoise' });
      if (note.ok) doc = note.doc;
      const todo = addTodoCard(doc, doc.rootBoardId, { x: 320, y: 230 });
      if (todo.ok) doc = todo.doc;
      return doc;
    },
    () => {
      let doc = freshBoard('Einkauf');
      const a = addTextCard(doc, doc.rootBoardId, 'Brot', { x: 40, y: 40 }, { cardId: 'broteink1' }, { style: 'note', color: 'pink' });
      if (a.ok) doc = a.doc;
      const b = addTextCard(doc, doc.rootBoardId, 'Milch', { x: 300, y: 160 }, { cardId: 'milcheink' }, { style: 'note', color: 'green' });
      if (b.ok) doc = b.doc;
      const line = addCanvasLine(doc, doc.rootBoardId, { kind: 'card', cardId: 'broteink1', side: 'right', t: 0.5 }, { kind: 'card', cardId: 'milcheink', side: 'left', t: 0.5 });
      if (line.ok) doc = line.doc;
      return doc;
    },
    () => {
      let doc = freshBoard('Reise');
      const a = addTextCard(doc, doc.rootBoardId, 'Zug', { x: 30, y: 180 }, undefined, { style: 'note', color: 'orange' });
      if (a.ok) doc = a.doc;
      const photo = addImageCard(
        doc,
        doc.rootBoardId,
        {
          fileName: 'karte.png',
          dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        },
        { x: 280, y: 30 },
      );
      if (photo.ok) doc = photo.doc;
      return doc;
    },
    () => freshBoard('Leer'),
  ];
  for (const make of boards) {
    const doc = make();
    const file = resolveEntry(root, doc.rootBoardId, false);
    if (!file) continue;
    await writeAtomic(file, serializeDocument(doc));
    await remember(doc.rootBoardId);
  }
}
