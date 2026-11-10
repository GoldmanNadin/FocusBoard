import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, screen, session, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeUrl, prepareDocumentForDisk } from '../shared/document';
import { inspectAttachment } from '../shared/attachments';
import { randomUUID } from 'node:crypto';
import { isSafeRecoveryPath, RECOVERY_FILE_NAME } from '../shared/recovery';
import { deleteBoardsMessage } from '../shared/gestures';
import { inspectImageBytes } from '../shared/images';
import { Ipc } from '../shared/ipc';
import { aboutCopy, legacyUserDataPath, PRODUCT_NAME } from '../shared/identity';
import { APP_VERSION, MAX_DOCUMENT_BYTES, MAX_IMAGE_BYTES, MSG } from '../shared/limits';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.setName(PRODUCT_NAME);
// Test hook only: lets the e2e suite run at Windows-like display scaling (e.g. 1.5 = 150 %).
if (process.env.WHITEBOARD_E2E === '1' && process.env.WHITEBOARD_SCALE && /^[12](\.\d+)?$/.test(process.env.WHITEBOARD_SCALE)) {
  app.commandLine.appendSwitch('force-device-scale-factor', process.env.WHITEBOARD_SCALE);
}
if (process.env.WHITEBOARD_E2E === '1' && process.env.WHITEBOARD_USER_DATA) {
  app.setPath('userData', process.env.WHITEBOARD_USER_DATA);
} else {
  app.setPath('userData', legacyUserDataPath(app.getPath('appData')));
}

function windowIconPath(): string {
  const fileName = process.platform === 'win32' ? 'icon.ico' : 'icon-256.png';
  if (app.isPackaged) return path.join(process.resourcesPath, 'brand', fileName);
  return path.join(__dirname, '../../assets/brand', fileName);
}

let mainWindow: BrowserWindow | null = null;
let currentPath: string | null = null;
let dirty = false;
let allowClose = false;
let closePromptOpen = false;

function isAllowedAppUrl(target: string, current: string): boolean {
  try {
    const next = new URL(target);
    const now = new URL(current);
    if (next.origin !== now.origin) return false;
    if (next.protocol === 'file:' && next.pathname !== now.pathname) return false;
    return next.protocol === 'file:' || next.protocol === 'http:' || next.protocol === 'https:';
  } catch {
    return false;
  }
}

function lockContents(contents: Electron.WebContents): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    const current = contents.getURL();
    if (!current || isAllowedAppUrl(url, current)) return;
    event.preventDefault();
  });
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
}

function applyProductionGuards(): void {
  if (!app.isPackaged) return;
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url;
    if (url.startsWith('file:') || url.startsWith('devtools:') || url.startsWith('data:')) {
      callback({});
      return;
    }
    callback({ cancel: true });
  });
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    headers['Content-Security-Policy'] = [
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; worker-src 'self' blob:",
    ];
    callback({ responseHeaders: headers });
  });
}

function createWindow(): BrowserWindow {
  const demo = process.env.WHITEBOARD_DEMO === '1';
  const screenshot = process.env.WHITEBOARD_SCREENSHOT;
  const win = new BrowserWindow({
    width: screenshot ? 1440 : 1360,
    height: screenshot ? 900 : 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#ffffff',
    title: PRODUCT_NAME,
    icon: windowIconPath(),
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,
      spellcheck: true,
    },
  });
  mainWindow = win;
  win.webContents.setVisualZoomLevelLimits(1, 1).catch(() => undefined);
  lockContents(win.webContents);
  win.once('ready-to-show', () => {
    win.show();
    if (!screenshot) return;
    setTimeout(() => {
      void (async () => {
        try {
          if (demo) {
            const text = await win.webContents.executeJavaScript('document.body.innerText');
            const required = ['Äpfel', 'Hausaufgaben', 'Ideen'];
            const missing = required.filter((item) => !String(text).includes(item));
            if (missing.length > 0) {
              console.error(`Demo-Inhalt fehlt: ${missing.join(', ')}`);
              app.exit(1);
              return;
            }
          }
          const image = await win.webContents.capturePage();
          await fs.writeFile(screenshot, image.toPNG());
          app.exit(0);
        } catch (error) {
          console.error(error);
          app.exit(1);
        }
      })();
    }, 2500);
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    const url = new URL(devUrl);
    if (demo) url.searchParams.set('demo', '1');
    if (process.env.WHITEBOARD_THEME === 'dark' || process.env.WHITEBOARD_THEME === 'light') {
      url.searchParams.set('theme', process.env.WHITEBOARD_THEME);
    }
    if (process.env.WHITEBOARD_E2E === '1') url.searchParams.set('e2e', '1');
    if (process.env.WHITEBOARD_E2E === '1' && process.env.WHITEBOARD_E2E_INTRO === '1') url.searchParams.set('intro', '1');
    void win.loadURL(url.toString());
  } else {
    const query: Record<string, string> = {};
    if (demo) query.demo = '1';
    if (process.env.WHITEBOARD_THEME === 'dark' || process.env.WHITEBOARD_THEME === 'light') {
      query.theme = process.env.WHITEBOARD_THEME;
    }
    if (process.env.WHITEBOARD_E2E === '1') query.e2e = '1';
    if (process.env.WHITEBOARD_E2E === '1' && process.env.WHITEBOARD_E2E_INTRO === '1') query.intro = '1';
    void win.loadFile(path.join(__dirname, '../renderer/index.html'), { query });
  }

  win.on('close', (event) => {
    if (process.env.WHITEBOARD_E2E === '1') return;
    if (allowClose || !dirty) return;
    event.preventDefault();
    if (closePromptOpen) return;
    closePromptOpen = true;
    void dialog
      .showMessageBox(win, {
        type: 'warning',
        buttons: ['Speichern', 'Nicht speichern', 'Abbrechen'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
        title: PRODUCT_NAME,
        icon: windowIconPath(),
        message: 'Änderungen sind noch nicht gespeichert.',
        detail: 'Speichern schreibt die JSON-Datei. Nicht speichern verwirft die Änderungen.',
      })
      .then((result) => {
        closePromptOpen = false;
        if (result.response === 0) win.webContents.send(Ipc.menuSaveAndClose);
        else if (result.response === 1) {
          allowClose = true;
          win.close();
        }
      })
      .catch(() => {
        closePromptOpen = false;
      });
  });

  return win;
}

function buildMenu(win: BrowserWindow): Menu {
  return Menu.buildFromTemplate([
    {
      label: 'Datei',
      submenu: [
        { label: 'Neu', accelerator: 'CmdOrCtrl+N', click: () => win.webContents.send(Ipc.menuNew) },
        { label: 'Öffnen…', accelerator: 'CmdOrCtrl+O', click: () => win.webContents.send(Ipc.menuOpen) },
        { type: 'separator' },
        { label: 'Speichern', accelerator: 'CmdOrCtrl+S', click: () => win.webContents.send(Ipc.menuSave) },
        {
          label: 'Speichern unter…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => win.webContents.send(Ipc.menuSaveAs),
        },
        { type: 'separator' },
        { role: 'quit', label: 'Beenden' },
      ],
    },
    {
      label: 'Bearbeiten',
      submenu: [
        // Undo, select all, duplicate and delete go to the board unless a text field has focus
        // (the renderer decides). Cut, copy and paste stay native roles: they fire DOM clipboard
        // events, which the board handles too.
        { label: 'Rückgängig', accelerator: 'CmdOrCtrl+Z', click: () => win.webContents.send(Ipc.menuCommand, 'undo') },
        { label: 'Wiederholen', accelerator: 'CmdOrCtrl+Y', click: () => win.webContents.send(Ipc.menuCommand, 'redo') },
        { type: 'separator' },
        { role: 'cut', label: 'Ausschneiden' },
        { role: 'copy', label: 'Kopieren' },
        { role: 'paste', label: 'Einfügen' },
        { label: 'Duplizieren', accelerator: 'CmdOrCtrl+D', click: () => win.webContents.send(Ipc.menuCommand, 'duplicate') },
        { label: 'Alles auswählen', accelerator: 'CmdOrCtrl+A', click: () => win.webContents.send(Ipc.menuCommand, 'selectAll') },
        { type: 'separator' },
        { label: 'Löschen', click: () => win.webContents.send(Ipc.menuCommand, 'delete') },
      ],
    },
    {
      label: 'Hilfe',
      submenu: [
        {
          label: `Über ${PRODUCT_NAME}`,
          click: () => {
            const copy = aboutCopy(APP_VERSION);
            void dialog.showMessageBox(win, {
              type: 'info',
              buttons: ['Schließen'],
              title: copy.title,
              message: copy.message,
              detail: copy.detail,
              icon: windowIconPath(),
            });
          },
        },
      ],
    },
  ]);
}

/** Write next to the target and rename, so a crash or a full disk never leaves a half-written board. */
async function writeAtomically(target: string, content: string | Buffer): Promise<void> {
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    const handle = await fs.open(temporary, 'w');
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** Lays the captured board out on one landscape A4 page, using an invisible, locked-down window. */
async function pngToPdf(dataUrl: string, size: { width: number; height: number }): Promise<Buffer> {
  const page = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false },
  });
  lockContents(page.webContents);
  try {
    const landscape = size.width >= size.height;
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 10mm; }
      html, body { margin: 0; height: 100%; }
      body { display: flex; align-items: center; justify-content: center; }
      img { max-width: 100%; max-height: 100%; object-fit: contain; }
    </style></head><body><img src="${dataUrl}"></body></html>`;
    await page.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await page.webContents.printToPDF({ landscape, pageSize: 'A4', printBackground: true, margins: { marginType: 'none' } });
  } finally {
    page.destroy();
  }
}

const TRASH_FILE = 'trash.json';
const TRASH_MAX_ENTRIES = 50;
const TRASH_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const TRASH_MAX_BYTES = 60 * 1024 * 1024;

type StoredTrash = { id: string; at: number; title: string; count: number; clip: string };

/** Trash reads and writes run one after another; otherwise a quick delete + add could overwrite each other. */
let trashQueue: Promise<unknown> = Promise.resolve();
function withTrash<T>(work: () => Promise<T>): Promise<T> {
  const next = trashQueue.then(work, work);
  trashQueue = next.catch(() => undefined);
  return next;
}

async function readTrash(): Promise<StoredTrash[]> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), TRASH_FILE), 'utf8')) as unknown;
    if (!Array.isArray(raw)) return [];
    const now = Date.now();
    return raw.filter(
      (item): item is StoredTrash =>
        typeof item?.id === 'string' && typeof item.at === 'number' && now - item.at < TRASH_MAX_AGE &&
        typeof item.title === 'string' && typeof item.count === 'number' && typeof item.clip === 'string',
    );
  } catch {
    return [];
  }
}

async function writeTrash(entries: StoredTrash[]): Promise<void> {
  // Newest first; drop the oldest entries beyond the count and size limits.
  const kept: StoredTrash[] = [];
  let bytes = 0;
  for (const entry of entries.slice(0, TRASH_MAX_ENTRIES)) {
    bytes += entry.clip.length;
    if (bytes > TRASH_MAX_BYTES) break;
    kept.push(entry);
  }
  await writeAtomically(path.join(app.getPath('userData'), TRASH_FILE), JSON.stringify(kept));
}

const RECENT_FILE = 'recent-boards.json';
const MAX_RECENT = 8;

async function readRecent(): Promise<{ path: string; at: number }[]> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), RECENT_FILE), 'utf8')) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item): item is { path: string; at: number } => typeof item?.path === 'string' && path.isAbsolute(item.path) && typeof item.at === 'number')
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

async function rememberRecent(filePath: string): Promise<void> {
  const list = (await readRecent()).filter((item) => item.path !== filePath);
  list.unshift({ path: filePath, at: Date.now() });
  try {
    await writeAtomically(path.join(app.getPath('userData'), RECENT_FILE), JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
    // the list is a convenience; never fail a save because of it
  }
}

async function readBoardFile(filePath: string) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) return { ok: false as const, error: MSG.invalidDoc };
  if (stat.size > MAX_DOCUMENT_BYTES) return { ok: false as const, error: MSG.fileTooBig };
  const json = await fs.readFile(filePath, 'utf8');
  return prepareDocumentForDisk(json);
}

function ensureJson(filePath: string): string {
  const lower = filePath.toLowerCase();
  return lower.endsWith('.json') || lower.endsWith('.focusboard') ? filePath : `${filePath}.json`;
}

const BOARD_FILTERS = [{ name: 'FocusBoard-Datei', extensions: ['json', 'focusboard'] }];

/** A board file given on the command line ("Öffnen mit", file dropped on the program icon). */
function boardFileFromArgs(argv: string[]): string | null {
  for (const arg of argv.slice(1)) {
    if (!arg || arg.startsWith('-')) continue;
    const ext = path.extname(arg).toLowerCase();
    if ((ext !== '.json' && ext !== '.focusboard') || path.basename(arg).toLowerCase() === 'package.json') continue;
    const full = path.resolve(arg);
    return full;
  }
  return null;
}

/** Set only by the main process from the command line; the renderer can only ask for this one file. */
let pendingOpen: string | null = boardFileFromArgs(process.argv);

function registerIpc(): void {
  ipcMain.handle(Ipc.save, async (_event, payload: unknown) => {
    const win = mainWindow;
    if (!win) return { ok: false, error: MSG.saveFailed };
    if (!payload || typeof payload !== 'object') return { ok: false, error: MSG.saveFailed };
    const json = (payload as { json?: unknown }).json;
    const saveAs = (payload as { saveAs?: unknown }).saveAs === true;
    if (typeof json !== 'string') return { ok: false, error: MSG.invalidDoc };
    const prepared = prepareDocumentForDisk(json);
    if (!prepared.ok) return prepared;
    let target = !saveAs ? currentPath : null;
    if (!target && process.env.WHITEBOARD_E2E === '1' && process.env.WHITEBOARD_E2E_SAVE) {
      const requested = path.resolve(process.env.WHITEBOARD_E2E_SAVE);
      const root = path.resolve(app.getPath('userData'));
      if (requested === root || requested.startsWith(root + path.sep)) target = ensureJson(requested);
    }
    if (!target) {
      const result = await dialog.showSaveDialog(win, {
        title: 'Whiteboard speichern',
        defaultPath: path.join(app.getPath('documents'), 'whiteboard.json'),
        filters: BOARD_FILTERS,
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      });
      if (result.canceled || !result.filePath) return { ok: true, canceled: true };
      target = ensureJson(result.filePath);
    }
    try {
      await writeAtomically(target, prepared.json);
    } catch {
      return { ok: false, error: MSG.saveFailed };
    }
    currentPath = target;
    await rememberRecent(target);
    return { ok: true, canceled: false, fileName: path.basename(target) };
  });

  ipcMain.handle(Ipc.open, async () => {
    const win = mainWindow;
    if (!win) return { ok: false, error: MSG.invalidDoc };
    const result = await dialog.showOpenDialog(win, {
      title: 'Whiteboard öffnen',
      filters: BOARD_FILTERS,
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { ok: true, canceled: true };
    const filePath = result.filePaths[0];
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) return { ok: false, error: MSG.invalidDoc };
      if (stat.size > MAX_DOCUMENT_BYTES) return { ok: false, error: MSG.fileTooBig };
      const json = await fs.readFile(filePath, 'utf8');
      const prepared = prepareDocumentForDisk(json);
      if (!prepared.ok) return prepared;
      currentPath = filePath;
      await rememberRecent(filePath);
      return { ok: true, canceled: false, fileName: path.basename(filePath), json: prepared.json };
    } catch {
      return { ok: false, error: MSG.invalidDoc };
    }
  });

  ipcMain.handle(Ipc.pickImage, async () => {
    if (process.env.WHITEBOARD_E2E_IMAGE === 'cancel') return { ok: true, canceled: true };
    const win = mainWindow;
    if (!win) return { ok: false, error: MSG.imageRead };
    const result = await dialog.showOpenDialog(win, {
      title: 'Bild für eine Karte wählen',
      filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { ok: true, canceled: true };
    const filePath = result.filePaths[0];
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) return { ok: false, error: MSG.imageRead };
      if (stat.size <= 0) return { ok: false, error: MSG.imageEmpty };
      if (stat.size > MAX_IMAGE_BYTES) return { ok: false, error: MSG.imageSize };
      const bytes = new Uint8Array(await fs.readFile(filePath));
      const inspected = inspectImageBytes(bytes, path.basename(filePath));
      if (!inspected.ok) return inspected;
      return {
        ok: true,
        canceled: false,
        fileName: inspected.image.fileName,
        dataUrl: inspected.image.dataUrl,
      };
    } catch {
      return { ok: false, error: MSG.imageRead };
    }
  });

  ipcMain.handle(Ipc.confirmDiscard, async () => {
    const win = mainWindow;
    if (!win) return false;
    const result = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Abbrechen', 'Verwerfen'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: PRODUCT_NAME,
    icon: windowIconPath(),
      message: 'Ungespeicherte Änderungen verwerfen?',
      detail: 'Die Änderungen an dieser Fläche gehen verloren.',
    });
    return result.response === 1;
  });

  ipcMain.handle(Ipc.confirmDeleteBoards, async (_event, payload: unknown) => {
    const win = mainWindow;
    if (!win) return false;
    const titles = Array.isArray(payload)
      ? payload.filter((item): item is string => typeof item === 'string').slice(0, 6)
      : [];
    const copy = deleteBoardsMessage(titles);
    const result = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Abbrechen', 'Löschen'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: PRODUCT_NAME,
    icon: windowIconPath(),
      message: copy.message,
      detail: copy.detail,
    });
    return result.response === 1;
  });

  ipcMain.handle(Ipc.clearPath, () => {
    currentPath = null;
  });

  const recoveryPath = () => path.join(app.getPath('userData'), RECOVERY_FILE_NAME);

  ipcMain.handle(Ipc.recoveryRead, async () => {
    const target = recoveryPath();
    if (!isSafeRecoveryPath(target, app.getPath('userData'))) return { ok: false, error: 'recovery' };
    try {
      const json = await fs.readFile(target, 'utf8');
      const prepared = prepareDocumentForDisk(json);
      if (!prepared.ok) return { ok: true, missing: true };
      // Keep a copy: the running session keeps autosaving into the same file while the
      // restore prompt is still open, so the earlier session must survive elsewhere.
      await fs.writeFile(`${target}.previous`, prepared.json, 'utf8').catch(() => undefined);
      return { ok: true, missing: false, json: prepared.json };
    } catch {
      return { ok: true, missing: true };
    }
  });

  ipcMain.handle(Ipc.recoveryWrite, async (_event, payload: unknown) => {
    if (typeof payload !== 'string') return { ok: false, error: 'recovery' };
    const prepared = prepareDocumentForDisk(payload);
    if (!prepared.ok) return prepared;
    const target = recoveryPath();
    if (!isSafeRecoveryPath(target, app.getPath('userData'))) return { ok: false, error: 'recovery' };
    const temporary = `${target}.tmp`;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(temporary, prepared.json, 'utf8');
    await fs.rename(temporary, target);
    return { ok: true };
  });

  ipcMain.handle(Ipc.recoveryClear, async () => {
    const target = recoveryPath();
    if (!isSafeRecoveryPath(target, app.getPath('userData'))) return { ok: true };
    await fs.rm(target, { force: true });
    await fs.rm(`${target}.tmp`, { force: true });
    return { ok: true };
  });

  const attachmentFrom = (payload: unknown) => {
    if (!payload || typeof payload !== 'object') return null;
    const { name, data } = payload as { name?: unknown; data?: unknown };
    if (typeof name !== 'string' || typeof data !== 'string') return null;
    const checked = inspectAttachment(name, data);
    return checked.ok ? checked : null;
  };

  ipcMain.handle(Ipc.openAttachment, async (_event, payload: unknown) => {
    // Checked again here: the type allow-list decides what may be handed to the system.
    const file = attachmentFrom(payload);
    if (!file) return { ok: false, error: 'Dieser Anhang kann nicht geöffnet werden.' };
    const folder = path.join(app.getPath('temp'), 'FocusBoard', randomUUID());
    const target = path.join(folder, file.name);
    try {
      await fs.mkdir(folder, { recursive: true });
      await fs.writeFile(target, Buffer.from(file.data.slice(file.data.indexOf(',') + 1), 'base64'));
      if (process.env.WHITEBOARD_E2E === '1') return { ok: true };
      const error = await shell.openPath(target);
      return error ? { ok: false, error: `Kein Programm zum Öffnen gefunden (${error}).` } : { ok: true };
    } catch {
      return { ok: false, error: 'Der Anhang konnte nicht geöffnet werden.' };
    }
  });

  ipcMain.handle(Ipc.saveAttachment, async (_event, payload: unknown) => {
    const win = mainWindow;
    const file = attachmentFrom(payload);
    if (!win || !file) return { ok: false, error: 'Dieser Anhang kann nicht gespeichert werden.' };
    let target: string | null = null;
    if (process.env.WHITEBOARD_E2E === '1' && process.env.WHITEBOARD_E2E_EXPORT) target = path.join(path.dirname(process.env.WHITEBOARD_E2E_EXPORT), file.name);
    if (!target) {
      const result = await dialog.showSaveDialog(win, {
        title: 'Anhang speichern',
        defaultPath: path.join(app.getPath('downloads'), file.name),
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      });
      if (result.canceled || !result.filePath) return { ok: true, canceled: true };
      target = result.filePath;
    }
    try {
      await writeAtomically(target, Buffer.from(file.data.slice(file.data.indexOf(',') + 1), 'base64'));
      return { ok: true, canceled: false, fileName: path.basename(target) };
    } catch {
      return { ok: false, error: 'Der Anhang konnte nicht gespeichert werden.' };
    }
  });

  ipcMain.handle(Ipc.trashAdd, async (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') return null;
    const { title, count, clip } = payload as { title?: unknown; count?: unknown; clip?: unknown };
    if (typeof title !== 'string' || typeof count !== 'number' || typeof clip !== 'string' || clip.length > 40 * 1024 * 1024) return null;
    try {
      return await withTrash(async () => {
        const entries = await readTrash();
        const id = randomUUID();
        entries.unshift({ id, at: Date.now(), title: title.slice(0, 120), count: Math.max(1, Math.round(count)), clip });
        await writeTrash(entries);
        return id;
      });
    } catch {
      return null;
    }
  });

  ipcMain.handle(Ipc.trashList, async () => withTrash(async () => (await readTrash()).map(({ id, at, title, count }) => ({ id, at, title, count }))));

  ipcMain.handle(Ipc.trashTake, async (_event, id: unknown) =>
    withTrash(async () => {
      const entries = await readTrash();
      const entry = entries.find((item) => item.id === id);
      if (!entry) return { ok: false, error: 'Dieser Eintrag ist nicht mehr im Papierkorb.' };
      await writeTrash(entries.filter((item) => item.id !== id));
      return { ok: true, clip: entry.clip };
    }),
  );

  ipcMain.handle(Ipc.trashDelete, async (_event, id: unknown) =>
    withTrash(async () => {
      const entries = await readTrash();
      await writeTrash(id === 'all' ? [] : entries.filter((item) => item.id !== id));
      return true;
    }),
  );

  ipcMain.handle(Ipc.takePendingOpen, async () => {
    const target = pendingOpen;
    pendingOpen = null;
    if (!target) return { ok: true, canceled: true };
    try {
      const prepared = await readBoardFile(target);
      if (!prepared.ok) return prepared;
      currentPath = target;
      await rememberRecent(target);
      return { ok: true, canceled: false, fileName: path.basename(target), json: prepared.json };
    } catch {
      return { ok: false, error: 'Die Datei kann nicht geöffnet werden.' };
    }
  });

  ipcMain.handle(Ipc.recentList, async () => {
    const list = await readRecent();
    return Promise.all(
      list.map(async (item) => ({
        path: item.path,
        name: path.basename(item.path),
        folder: path.dirname(item.path),
        at: item.at,
        exists: await fs.stat(item.path).then((stat) => stat.isFile(), () => false),
      })),
    );
  });

  ipcMain.handle(Ipc.recentOpen, async (_event, payload: unknown) => {
    // Only paths the main process itself put on the list can be opened this way.
    const list = await readRecent();
    const entry = list.find((item) => item.path === payload);
    if (!entry) return { ok: false, error: MSG.invalidDoc };
    try {
      const prepared = await readBoardFile(entry.path);
      if (!prepared.ok) return prepared;
      currentPath = entry.path;
      await rememberRecent(entry.path);
      return { ok: true, canceled: false, fileName: path.basename(entry.path), json: prepared.json };
    } catch {
      return { ok: false, error: 'Die Datei gibt es nicht mehr oder sie kann nicht gelesen werden.' };
    }
  });

  ipcMain.handle(Ipc.exportPng, async (_event, payload: unknown) => {
    const win = mainWindow;
    if (!win || !payload || typeof payload !== 'object') return { ok: false, error: 'Export nicht möglich.' };
    const box = payload as Record<string, unknown>;
    const nums = ['x', 'y', 'width', 'height'].map((key) => Number(box[key]));
    if (nums.some((value) => !Number.isFinite(value)) || nums[2]! < 10 || nums[3]! < 10) return { ok: false, error: 'Export nicht möglich.' };
    const [x, y, width, height] = nums.map((value) => Math.round(value)) as [number, number, number, number];
    const format = box.format === 'pdf' ? 'pdf' : 'png';
    const image = await win.webContents.capturePage({ x, y, width, height });
    let target: string | null = null;
    if (process.env.WHITEBOARD_E2E === '1' && process.env.WHITEBOARD_E2E_EXPORT) {
      target = process.env.WHITEBOARD_E2E_EXPORT.replace(/\.(png|pdf)$/i, '') + `.${format}`;
    }
    if (!target) {
      const base = typeof box.name === 'string' ? box.name.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) : '';
      const result = await dialog.showSaveDialog(win, {
        title: format === 'pdf' ? 'Board als PDF speichern' : 'Board als Bild speichern',
        defaultPath: path.join(app.getPath(format === 'pdf' ? 'documents' : 'pictures'), `${base || 'Board'}.${format}`),
        filters: [format === 'pdf' ? { name: 'PDF-Dokument', extensions: ['pdf'] } : { name: 'PNG-Bild', extensions: ['png'] }],
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      });
      if (result.canceled || !result.filePath) return { ok: true, canceled: true };
      target = result.filePath.toLowerCase().endsWith(`.${format}`) ? result.filePath : `${result.filePath}.${format}`;
    }
    try {
      if (format === 'pdf') {
        await fs.writeFile(target, await pngToPdf(image.toDataURL(), image.getSize()));
        return { ok: true, canceled: false, fileName: path.basename(target) };
      }
      await fs.writeFile(target, image.toPNG());
      return { ok: true, canceled: false, fileName: path.basename(target) };
    } catch {
      return { ok: false, error: 'Das Bild konnte nicht gespeichert werden.' };
    }
  });

  ipcMain.handle(Ipc.copyText, async (_event, payload: unknown) => {
    if (typeof payload !== 'string' || payload.length > 10_000) return false;
    clipboard.writeText(payload);
    return true;
  });

  ipcMain.handle(Ipc.openExternal, async (_event, payload: unknown) => {
    if (typeof payload !== 'string') return false;
    const url = normalizeUrl(payload);
    if (!url) return false;
    if (process.env.WHITEBOARD_E2E === '1') return true;
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle(Ipc.e2eFixture, async () => {
    if (process.env.WHITEBOARD_E2E !== '1') return { ok: false, error: 'disabled' };
    const file = process.env.WHITEBOARD_E2E_FILE;
    if (!file) return { ok: true, missing: true };
    try {
      const json = await fs.readFile(file, 'utf8');
      const prepared = prepareDocumentForDisk(json);
      if (!prepared.ok) return prepared;
      return { ok: true, missing: false, json: prepared.json };
    } catch {
      return { ok: true, missing: true };
    }
  });

  ipcMain.on(Ipc.dirty, (_event, value: unknown) => {
    dirty = value === true;
  });

  ipcMain.on(Ipc.title, (_event, value: unknown) => {
    if (!mainWindow || typeof value !== 'string') return;
    const title = value.replace(/[\r\n]+/g, ' ').slice(0, 180);
    mainWindow.setTitle(title || PRODUCT_NAME);
  });

  ipcMain.handle(Ipc.display, () => {
    const display = screen.getPrimaryDisplay();
    return {
      scaleFactor: display.scaleFactor,
      width: display.size.width,
      height: display.size.height,
    };
  });

  ipcMain.on(Ipc.approveClose, () => {
    allowClose = true;
    dirty = false;
    mainWindow?.close();
  });
}

// DPI follows the operating system. Do not force a device scale factor.
// One FocusBoard window: opening a second board file hands it to the running window.
if (process.env.WHITEBOARD_E2E !== '1' && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const file = boardFileFromArgs(argv);
    const win = mainWindow;
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    if (file) {
      pendingOpen = file;
      win.webContents.send(Ipc.openRequest);
    }
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  applyProductionGuards();
  registerIpc();
  const win = createWindow();
  Menu.setApplicationMenu(buildMenu(win));
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const next = createWindow();
      Menu.setApplicationMenu(buildMenu(next));
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('web-contents-created', (_event, contents) => {
  lockContents(contents);
});
