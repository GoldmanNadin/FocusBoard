import { contextBridge, ipcRenderer } from 'electron';
import {
  Ipc,
  type DisplayMetrics,
  type FixtureResult,
  type OpenResult,
  type PickImageResult,
  type RecentBoard,
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
  takePendingOpen(): Promise<OpenResult> {
    return ipcRenderer.invoke(Ipc.takePendingOpen);
  },
  onOpenRequest(callback: () => void): () => void {
    return subscribe(Ipc.openRequest, callback);
  },
  listRecent(): Promise<RecentBoard[]> {
    return ipcRenderer.invoke(Ipc.recentList);
  },
  openRecent(filePath: string): Promise<OpenResult> {
    return ipcRenderer.invoke(Ipc.recentOpen, typeof filePath === 'string' ? filePath : '');
  },
  exportPng(box: { x: number; y: number; width: number; height: number; name: string; format?: 'png' | 'pdf' }): Promise<SaveResult> {
    return ipcRenderer.invoke(Ipc.exportPng, box);
  },
  copyText(text: string): Promise<boolean> {
    return ipcRenderer.invoke(Ipc.copyText, typeof text === 'string' ? text.slice(0, 10_000) : '');
  },
  openExternal(url: string): Promise<boolean> {
    return ipcRenderer.invoke(Ipc.openExternal, typeof url === 'string' ? url : '');
  },
  onMenuCommand(callback: (command: string) => void): () => void {
    const listener = (_event: unknown, command: unknown) => {
      if (typeof command === 'string') callback(command);
    };
    ipcRenderer.on(Ipc.menuCommand, listener);
    return () => ipcRenderer.removeListener(Ipc.menuCommand, listener);
  },
  loadFixture(): Promise<FixtureResult> {
    return ipcRenderer.invoke(Ipc.e2eFixture);
  },
};

export type WhiteboardApi = typeof api;

contextBridge.exposeInMainWorld('whiteboard', api);
