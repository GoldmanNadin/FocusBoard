export const RECOVERY_FILE_NAME = 'recovery-autosave.json';

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '');
}

export function isSafeRecoveryPath(targetPath: string, userDataDir: string): boolean {
  const root = normalizePath(userDataDir);
  const target = normalizePath(targetPath);
  if (!root || root === '.' || target.includes('\0')) return false;
  return target === `${root}/${RECOVERY_FILE_NAME}`;
}

export function shouldOfferRecovery(hasFile: boolean, documentIsValid: boolean): boolean {
  return hasFile && documentIsValid;
}
