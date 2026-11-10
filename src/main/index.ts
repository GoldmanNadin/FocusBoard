import { app, BrowserWindow, dialog, ipcMain, Menu, screen, session } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareDocumentForDisk } from '../shared/document';
import { isSafeRecoveryPath, RECOVERY_FILE_NAME } from '../shared/recovery';
import { deleteBoardsMessage } from '../shared/gestures';
import { inspectImageBytes } from '../shared/images';
import { Ipc } from '../shared/ipc';
import { aboutCopy, legacyUserDataPath, PRODUCT_NAME } from '../shared/identity';
import { APP_VERSION, MAX_DOCUMENT_BYTES, MAX_IMAGE_BYTES, MSG } from '../shared/limits';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.setName(PRODUCT_NAME);
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
    void win.loadURL(url.toString());
  } else {
    const query: Record<string, string> = {};
    if (demo) query.demo = '1';
    if (process.env.WHITEBOARD_THEME === 'dark' || process.env.WHITEBOARD_THEME === 'light') {
      query.theme = process.env.WHITEBOARD_THEME;
    }
    if (process.env.WHITEBOARD_E2E === '1') query.e2e = '1';
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
        { role: 'undo', label: 'Rückgängig' },
        { role: 'redo', label: 'Wiederholen' },
        { type: 'separator' },
        { role: 'cut', label: 'Ausschneiden' },
        { role: 'copy', label: 'Kopieren' },
        { role: 'paste', label: 'Einfügen' },
        { role: 'selectAll', label: 'Alles auswählen' },
        { type: 'separator' },
        { role: 'delete', label: 'Löschen' },
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

function ensureJson(filePath: string): string {
  return filePath.toLowerCase().endsWith('.json') ? filePath : `${filePath}.json`;
}

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
        filters: [{ name: 'Whiteboard-Datei', extensions: ['json'] }],
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      });
      if (result.canceled || !result.filePath) return { ok: true, canceled: true };
      target = ensureJson(result.filePath);
    }
    try {
      await fs.writeFile(target, prepared.json, 'utf8');
    } catch {
      return { ok: false, error: MSG.saveFailed };
    }
    currentPath = target;
    return { ok: true, canceled: false, fileName: path.basename(target) };
  });

  ipcMain.handle(Ipc.open, async () => {
    const win = mainWindow;
    if (!win) return { ok: false, error: MSG.invalidDoc };
    const result = await dialog.showOpenDialog(win, {
      title: 'Whiteboard öffnen',
      filters: [{ name: 'Whiteboard-Datei', extensions: ['json'] }],
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
