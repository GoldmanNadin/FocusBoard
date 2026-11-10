import { _electron as electron, expect, test } from '@playwright/test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function launch(extra: Record<string, string> = {}) {
  const userData = extra.WHITEBOARD_USER_DATA ?? mkdtempSync(path.join(tmpdir(), 'focusboard-lib-'));
  const library = extra.WHITEBOARD_LIBRARY_DIR ?? path.join(userData, 'boards');
  mkdirSync(library, { recursive: true });
  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      WHITEBOARD_E2E: '1',
      WHITEBOARD_E2E_HOME: '1',
      WHITEBOARD_USER_DATA: userData,
      WHITEBOARD_LIBRARY_DIR: library,
      ...extra,
    },
  });
  const page = await app.firstWindow();
  await page.getByTestId('home').waitFor({ timeout: 30_000 });
  return { app, page, userData, library };
}

test('home screen creates, opens, renames, duplicates, trashes and restores', async () => {
  const { app, page } = await launch();
  await page.getByTestId('library-create').click();
  await page.getByTestId('tool-note').waitFor();
  await page.getByTestId('library-home').click();
  await expect(page.getByTestId('home')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Zuletzt verwendet' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Meine Boards' })).toBeVisible();
  await expect(page.getByTestId('recent-section')).toContainText('Neues Board');
  await expect(page.getByTestId('undo')).toHaveCount(0);
  const tile = page.locator('[data-testid^=tile-]').first();
  await expect(tile).toContainText('Neues Board');
  await tile.getByTestId(/tile-more-/).click();
  await page.getByTestId('tile-rename').click();
  await page.getByLabel('Board umbenennen').fill('Ideen');
  await page.getByLabel('Board umbenennen').press('Enter');
  await expect(page.getByTestId('home')).toContainText('Ideen');
  await page.locator('[data-testid^=tile-]').first().getByTestId(/tile-more-/).click();
  await page.getByTestId('tile-duplicate').click();
  await expect(page.getByText('Kopie von Ideen')).toBeVisible();
  await page.locator('.tile').filter({ has: page.getByRole('heading', { name: 'Ideen', exact: true }) }).getByLabel('Board-Menü').click();
  await page.getByTestId('tile-delete').click();
  await expect(page.getByText('Ideen', { exact: true })).toHaveCount(0);
  await page.getByTestId('library-trash').click();
  await expect(page.getByText('Ideen')).toBeVisible();
  await page.locator('[data-testid^=tile-]').first().getByTestId(/tile-more-/).click();
  await page.getByTestId('tile-restore').click();
  await page.getByTestId('library-trash').click();
  await expect(page.getByText('Ideen', { exact: true })).toBeVisible();
  await app.close();
});

test('autosave survives a restart and a folder change leaves the original', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'focusboard-save-'));
  const library = path.join(userData, 'boards');
  const other = path.join(userData, 'other');
  const first = await launch({ WHITEBOARD_USER_DATA: userData, WHITEBOARD_LIBRARY_DIR: library, WHITEBOARD_E2E_LIBRARY: other });
  await first.page.getByTestId('library-create').click();
  await first.page.getByTestId('tool-note').click();
  await first.page.locator('.react-flow__pane').click({ position: { x: 180, y: 160 } });
  await first.page.getByTestId('card-editor').fill('Bleibt erhalten');
  await first.page.keyboard.press('Escape');
  await expect.poll(() => {
    if (!existsSync(library)) return false;
    return readFileSync(findJson(library), 'utf8').includes('Bleibt erhalten');
  }, { timeout: 8000 }).toBe(true);
  await first.app.close();

  const second = await launch({ WHITEBOARD_USER_DATA: userData, WHITEBOARD_LIBRARY_DIR: library, WHITEBOARD_E2E_LIBRARY: other });
  await second.page.getByRole('heading', { name: 'Neues Board', exact: true }).click();
  await expect(second.page.locator('.card-copy', { hasText: 'Bleibt erhalten' })).toBeVisible();
  await second.page.getByTestId('library-home').click();
  const before = findJson(library);
  await second.page.getByTestId('library-folder').click();
  await expect(second.page.getByTestId('library-path')).toHaveAttribute('data-path', other);
  expect(existsSync(before)).toBe(true);
  await second.app.close();
});

test('offers the recovery session without deleting it', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'focusboard-adopt-'));
  const recovery = path.join(userData, 'recovery-autosave.json');
  writeFileSync(recovery, JSON.stringify({
    format: 'digitales-whiteboard',
    version: 3,
    appVersion: '0.4.2',
    rootBoardId: 'rootboard',
    theme: 'light',
    boards: [{ id: 'rootboard', title: 'Gerettet', parentBoardId: null, cards: [], connectors: [], lines: [], viewport: { x: 0, y: 0, zoom: 1 } }],
    files: [],
  }));
  const { app, page } = await launch({ WHITEBOARD_USER_DATA: userData });
  await expect(page.getByTestId('adopt-banner')).toBeVisible();
  await page.getByTestId('adopt-recovery').click();
  await expect(page.getByTestId('tool-note')).toBeVisible();
  await page.getByTestId('library-home').click();
  await expect(page.getByRole('heading', { name: 'Gerettet' })).toBeVisible();
  expect(readFileSync(recovery, 'utf8')).toContain('Gerettet');
  await app.close();
});

function findJson(dir: string): string {
  const name = readdirSync(dir).find((entry) => entry.endsWith('.json') && !entry.endsWith('.bak'));
  if (!name) throw new Error('Board fehlt');
  return path.join(dir, name);
}
