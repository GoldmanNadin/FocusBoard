import { contextBridge, ipcRenderer } from 'electron';
import {
  Ipc,
  type DisplayMetrics,
  type FixtureResult,
  type OpenResult,
  type PickImageResult,
  type RecoveryReadResult,
  type RecoveryWriteResult,
  type SaveResult,
} from '../shared/ipc';

function subscribe(channel: string, callback: () => void): () => void {
  const listener = () => callback();
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api = {
  save(payload: { json: string; saveAs: boolean }): Promise<SaveResult> {
    return ipcRenderer.invoke(Ipc.save, { json: payload.json, saveAs: payload.saveAs === true });
  },
  open(): Promise<OpenResult> {
    return ipcRenderer.invoke(Ipc.open);
  },
  pickImage(): Promise<PickImageResult> {
    return ipcRenderer.invoke(Ipc.pickImage);
  },
  confirmDiscard(): Promise<boolean> {
    return ipcRenderer.invoke(Ipc.confirmDiscard);
  },
  confirmDeleteBoards(titles: string[]): Promise<boolean> {
    return ipcRenderer.invoke(
      Ipc.confirmDeleteBoards,
      titles.filter((title) => typeof title === 'string').slice(0, 6),
    );
  },
  clearPath(): Promise<void> {
    return ipcRenderer.invoke(Ipc.clearPath);
  },
  confirmOpened(): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(Ipc.confirmOpened);
  },
  rejectOpened(): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(Ipc.rejectOpened);
  },
  setDirty(dirty: boolean): void {
    ipcRenderer.send(Ipc.dirty, dirty === true);
  },
  setWindowTitle(title: string): void {
    ipcRenderer.send(Ipc.title, title);
  },
  getDisplayMetrics(): Promise<DisplayMetrics> {
    return ipcRenderer.invoke(Ipc.display);
  },
  approveClose(): void {
    ipcRenderer.send(Ipc.approveClose);
  },
  onMenuNew(callback: () => void): () => void {
    return subscribe(Ipc.menuNew, callback);
  },
  onMenuOpen(callback: () => void): () => void {
    return subscribe(Ipc.menuOpen, callback);
  },
  onMenuSave(callback: () => void): () => void {
    return subscribe(Ipc.menuSave, callback);
  },
  onMenuSaveAs(callback: () => void): () => void {
    return subscribe(Ipc.menuSaveAs, callback);
  },
  onSaveAndClose(callback: () => void): () => void {
    return subscribe(Ipc.menuSaveAndClose, callback);
  },
  readRecovery(): Promise<RecoveryReadResult> {
    return ipcRenderer.invoke(Ipc.recoveryRead);
  },
  writeRecovery(json: string): Promise<RecoveryWriteResult> {
    return ipcRenderer.invoke(Ipc.recoveryWrite, json);
  },
  clearRecovery(): Promise<{ ok: true }> {
    return ipcRenderer.invoke(Ipc.recoveryClear);
  },
  loadFixture(): Promise<FixtureResult> {
    return ipcRenderer.invoke(Ipc.e2eFixture);
  },
  libraryList(trashed = false) {
    return ipcRenderer.invoke(Ipc.libraryList, trashed) as Promise<import('../shared/library').LibraryEntry[]>;
  },
  libraryRecent() {
    return ipcRenderer.invoke(Ipc.libraryRecent) as Promise<import('../shared/library').LibraryEntry[]>;
  },
  libraryCreate(title?: string) {
    return ipcRenderer.invoke(Ipc.libraryCreate, title) as Promise<{ ok: true; id: string; json: string; mtime: number } | { ok: false; error: string }>;
  },
  libraryOpen(id: string) {
    return ipcRenderer.invoke(Ipc.libraryOpen, id) as Promise<{ ok: true; id: string; json: string; mtime: number; fileName: string } | { ok: false; error: string }>;
  },
  librarySave(id: string, json: string, knownMtime: number | null) {
    return ipcRenderer.invoke(Ipc.librarySave, { id, json, knownMtime }) as Promise<{ ok: true; mtime: number } | { ok: false; error: string }>;
  },
  libraryRename(id: string, title: string) {
    return ipcRenderer.invoke(Ipc.libraryRename, { id, title }) as Promise<{ ok: true } | { ok: false; error: string }>;
  },
  libraryDuplicate(id: string) {
    return ipcRenderer.invoke(Ipc.libraryDuplicate, id) as Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  },
  libraryTrash(id: string) {
    return ipcRenderer.invoke(Ipc.libraryTrash, id) as Promise<{ ok: true; canceled?: boolean } | { ok: false; error: string }>;
  },
  libraryRestore(id: string) {
    return ipcRenderer.invoke(Ipc.libraryRestore, id) as Promise<{ ok: true } | { ok: false; error: string }>;
  },
  libraryImport(json: string) {
    return ipcRenderer.invoke(Ipc.libraryImport, json) as Promise<{ ok: true; id: string; json: string; mtime: number } | { ok: false; error: string }>;
  },
  libraryFolder() {
    return ipcRenderer.invoke(Ipc.libraryFolder) as Promise<string>;
  },
  libraryChoose() {
    return ipcRenderer.invoke(Ipc.libraryChoose) as Promise<{ ok: true; folder: string } | { ok: true; canceled: true } | { ok: false; error: string }>;
  },
  libraryConfirm(id: string) {
    return ipcRenderer.invoke(Ipc.libraryConfirm, id) as Promise<{ ok: boolean }>;
  },
  onLibraryFocus(callback: () => void) {
    return subscribe(Ipc.libraryFocus, callback);
  },
};

export type WhiteboardApi = typeof api;

contextBridge.exposeInMainWorld('whiteboard', api);
