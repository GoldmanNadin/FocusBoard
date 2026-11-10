export const Ipc = {
  save: 'doc:save',
  open: 'doc:open',
  pickImage: 'image:pick',
  confirmDiscard: 'dialog:confirm-discard',
  confirmDeleteBoards: 'dialog:confirm-delete-boards',
  clearPath: 'doc:clear-path',
  dirty: 'doc:dirty',
  title: 'window:title',
  display: 'system:display',
  approveClose: 'app:approve-close',
  menuNew: 'menu:new',
  menuOpen: 'menu:open',
  menuSave: 'menu:save',
  menuSaveAs: 'menu:save-as',
  menuSaveAndClose: 'menu:save-and-close',
  recoveryRead: 'recovery:read',
  recoveryWrite: 'recovery:write',
  recoveryClear: 'recovery:clear',
  e2eFixture: 'e2e:fixture',
  openExternal: 'link:open',
  menuCommand: 'menu:command',
  recentList: 'recent:list',
  recentOpen: 'recent:open',
  exportPng: 'export:png',
  copyText: 'clipboard:copy-text',
  takePendingOpen: 'doc:take-pending-open',
  openRequest: 'doc:open-request',
  openAttachment: 'attachment:open',
  saveAttachment: 'attachment:save',
  trashAdd: 'trash:add',
  trashList: 'trash:list',
  trashTake: 'trash:take',
  trashDelete: 'trash:delete',
} as const;

export type SaveResult =
  | { ok: true; canceled: true }
  | { ok: true; canceled: false; fileName: string }
  | { ok: false; error: string };

export type OpenResult =
  | { ok: true; canceled: true }
  | { ok: true; canceled: false; fileName: string; json: string }
  | { ok: false; error: string };

export type PickImageResult =
  | { ok: true; canceled: true }
  | { ok: true; canceled: false; fileName: string; dataUrl: string }
  | { ok: false; error: string };

export type DisplayMetrics = {
  scaleFactor: number;
  width: number;
  height: number;
};

export type RecoveryReadResult =
  | { ok: true; missing: true }
  | { ok: true; missing: false; json: string }
  | { ok: false; error: string };

export type RecoveryWriteResult = { ok: true } | { ok: false; error: string };

export type TrashEntry = { id: string; at: number; title: string; count: number };

export type RecentBoard = { path: string; name: string; folder: string; at: number; exists: boolean };

export type FixtureResult =
  | { ok: true; missing: true }
  | { ok: true; missing: false; json: string }
  | { ok: false; error: string };
