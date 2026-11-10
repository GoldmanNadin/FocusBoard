export const PRODUCT_NAME = 'FocusBoard';
export const LEGACY_USER_DATA_DIR = 'Digitales Whiteboard';

export function legacyUserDataPath(appDataDir: string): string {
  const root = appDataDir.replace(/[\\/]+$/, '');
  const separator = root.includes('\\') ? '\\' : '/';
  return `${root}${separator}${LEGACY_USER_DATA_DIR}`;
}

export function aboutCopy(version: string): { title: string; message: string; detail: string } {
  return {
    title: PRODUCT_NAME,
    message: `${PRODUCT_NAME} ${version}`,
    detail:
      'MIT-Lizenz. Das Dateiformat heißt weiterhin digitales-whiteboard, Version 3. Dateien aus 0.1, 0.2 und 0.3 lassen sich öffnen. Die automatische Sicherung bleibt im Datenordner Digitales Whiteboard.',
  };
}
