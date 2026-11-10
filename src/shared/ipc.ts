export const Ipc = {
  save: 'doc:save',
  open: 'doc:open',
  pickImage: 'image:pick',
  confirmDiscard: 'dialog:confirm-discard',
  confirmDeleteBoards: 'dialog:confirm-delete-boards',
  clearPath: 'doc:clear-path',
  confirmOpened: 'doc:confirm-opened',
  rejectOpened: 'doc:reject-opened',
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

export type FixtureResult =
  | { ok: true; missing: true }
  | { ok: true; missing: false; json: string }
  | { ok: false; error: string };
