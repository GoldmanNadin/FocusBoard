import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function launch(extra: Record<string, string> = {}, userData = mkdtempSync(path.join(tmpdir(), 'focusboard-041-'))) {
  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: { ...process.env, WHITEBOARD_E2E: '1', WHITEBOARD_USER_DATA: userData, ...extra },
  });
  const page = await app.firstWindow();
  await page.getByTestId('tool-note').waitFor({ timeout: 30_000 });
  return { app, page, userData };
}

async function dropTool(page: Page, id: string, x: number, y: number) {
  await page.getByTestId(id).dragTo(page.locator('.react-flow__pane'), { targetPosition: { x, y } });
}

test('autosave continues while the recovery banner is ignored', async () => {
  const first = await launch();
  await dropTool(first.page, 'tool-note', 180, 160);
  await first.page.getByTestId('card-editor').fill('Erste Sicherung');
  await first.page.keyboard.press('Escape');
  const recovery = path.join(first.userData, 'recovery-autosave.json');
  await expect.poll(() => existsSync(recovery) && readFileSync(recovery, 'utf8').includes('Erste Sicherung'), { timeout: 8000 }).toBe(true);
  await first.app.close();

  const second = await launch({}, first.userData);
  await expect(second.page.getByTestId('recovery-banner')).toBeVisible();
  await dropTool(second.page, 'tool-note', 220, 200);
  await second.page.getByTestId('card-editor').fill('Weiterarbeit');
  await second.page.keyboard.press('Escape');
  await expect.poll(() => existsSync(recovery) && readFileSync(recovery, 'utf8').includes('Weiterarbeit'), { timeout: 8000 }).toBe(true);
  expect(second.page.getByTestId('recovery-banner')).toBeVisible();
  expect(readFileSync(path.join(first.userData, 'recovery-previous.json'), 'utf8')).toContain('Erste Sicherung');
  await second.app.close();
});

test('more menu stays clickable at 1024x680 and at 150 percent', async () => {
  const { app, page } = await launch();
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1024, 680);
  });
  await page.getByTestId('tool-more').click();
  const board = page.getByTestId('more-board');
  await expect(board).toBeVisible();
  const hit = await board.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const found = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return found === element || element.contains(found);
  });
  expect(hit).toBe(true);
  await page.keyboard.press('Escape');
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1.5);
  });
  await page.getByTestId('tool-more').click();
  await expect(page.getByTestId('more-board')).toBeVisible();
  const scaled = await page.getByTestId('more-board').evaluate((element) => {
    const box = element.getBoundingClientRect();
    const found = document.elementFromPoint(box.x + box.width / 2, box.y + 4);
    return Boolean(found && (found === element || element.contains(found)));
  });
  expect(scaled).toBe(true);
  await app.close();
});

test('todo enter, backspace and column stacking', async () => {
  const { app, page } = await launch();
  await page.getByTestId('zoom-100').click();
  await dropTool(page, 'tool-todo', 180, 140);
  const first = page.locator('.todo-item').first();
  await first.fill('Eins');
  await first.press('Enter');
  await page.locator('.todo-item').nth(1).fill('Zwei');
  await expect(page.locator('.todo-item').nth(0)).toHaveValue('Eins');
  await expect(page.locator('.todo-item').nth(1)).toHaveValue('Zwei');
  await expect(page.locator('.todo-item').nth(1)).toBeFocused();

  const solo = await launch();
  await dropTool(solo.page, 'tool-todo', 200, 160);
  const only = solo.page.locator('.todo-item').first();
  await only.fill('Weg');
  await only.fill('');
  await only.press('Backspace');
  await expect(solo.page.locator('.todo-item')).toHaveCount(1);
  await solo.page.locator('.todo-item').first().fill('Wieder da');
  await expect(solo.page.locator('.todo-item').first()).toHaveValue('Wieder da');
  await solo.app.close();

  await dropTool(page, 'tool-column', 520, 80);
  const column = page.locator('.card-column').last();
  const columnBox = await column.boundingBox();
  const pane = await page.locator('.react-flow__pane').boundingBox();
  if (!columnBox || !pane) throw new Error('Spalte fehlt');
  await dropTool(page, 'tool-todo', columnBox.x - pane.x + 30, columnBox.y - pane.y + 70);
  await page.locator('.todo-item').last().fill('Liste');
  for (let index = 0; index < 5; index += 1) await page.locator('.todo-item').last().press('Enter');
  const grown = await column.boundingBox();
  if (!grown) throw new Error('Spalte fehlt');
  await dropTool(page, 'tool-note', grown.x - pane.x + 30, grown.y - pane.y + grown.height - 24);
  await page.getByTestId('card-editor').fill('Darunter');
  await page.keyboard.press('Escape');
  const todo = page.locator('.card-todo').last();
  const note = page.locator('.text-note').last();
  const todoBottom = Number(await todo.getAttribute('data-model-y')) + Number(await todo.getAttribute('data-height'));
  expect(Number(await note.getAttribute('data-model-y'))).toBeGreaterThanOrEqual(todoBottom - 2);
  await app.close();
});

test('line toolbar closes and delete removes the line', async () => {
  const { app, page } = await launch();
  await page.getByTestId('tool-line').click();
  const pane = page.locator('.react-flow__pane');
  await pane.click({ position: { x: 160, y: 180 } });
  await pane.click({ position: { x: 360, y: 240 } });
  await page.locator('[data-testid=canvas-line]').click({ force: true });
  await expect(page.getByTestId('line-delete')).toBeVisible();
  await pane.click({ position: { x: 40, y: 40 } });
  await expect(page.getByTestId('line-delete')).toHaveCount(0);

  await page.locator('[data-testid=canvas-line]').click({ force: true });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('line-delete')).toHaveCount(0);
  await page.locator('[data-testid=canvas-line]').click({ force: true });
  await page.getByTestId('tool-more').click();
  await page.getByTestId('more-board').click();
  await pane.click({ position: { x: 480, y: 420 } });
  await page.getByRole('button', { name: 'Öffnen' }).click();
  await expect(page.getByTestId('line-delete')).toHaveCount(0);
  await page.getByRole('button', { name: 'Zurück' }).click();

  await page.locator('[data-testid=canvas-line]').click({ force: true });
  await page.keyboard.press('Delete');
  await expect(page.locator('[data-testid=canvas-line]')).toHaveCount(0);

  await page.getByTestId('tool-line').click();
  await pane.click({ position: { x: 120, y: 120 } });
  await page.getByTestId('tool-select').click();
  await page.getByTestId('tool-line').click();
  await pane.click({ position: { x: 180, y: 160 } });
  await pane.click({ position: { x: 280, y: 200 } });
  await expect(page.locator('[data-testid=canvas-line]')).toHaveCount(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await app.close();
});

test('ctrl+a selects cards, titles take enter, notes grow, and theme is not undo', async () => {
  const { app, page, userData } = await launch();
  await expect(page.getByTestId('save-state')).toHaveText('Alle Änderungen gespeichert');
  await page.getByTestId('theme-toggle').click();
  await expect(page.getByTestId('undo')).toHaveAttribute('data-past', '0');
  await expect(page.getByTestId('save-state')).toHaveText('Alle Änderungen gespeichert');
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');

  await dropTool(page, 'tool-note', 160, 150);
  await page.getByTestId('card-editor').fill('Eins');
  await page.keyboard.press('Escape');
  await dropTool(page, 'tool-note', 420, 150);
  await page.getByTestId('card-editor').fill('Zwei');
  await page.keyboard.press('Escape');
  await page.locator('.react-flow__pane').click({ position: { x: 30, y: 30 } });
  await page.keyboard.press('Control+A');
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  const selectedText = await page.evaluate(() => window.getSelection()?.toString() ?? '');
  expect(selectedText).toBe('');

  const title = page.getByLabel('Titel dieses Boards');
  await title.fill('Neues Board');
  await title.press('Enter');
  await expect(page.getByTestId('card-editor')).toHaveCount(0);
  await expect(title).toHaveValue('Neues Board');
  await title.fill('Abbrechen');
  await title.press('Escape');
  await expect(title).toHaveValue('Neues Board');

  await page.getByTestId('tool-note').click();
  await page.locator('.react-flow__pane').click({ position: { x: 200, y: 360 } });
  await page.keyboard.press('Escape');
  await expect(page.locator('.text-note', { hasText: 'Notiz' })).toHaveCount(0);

  await dropTool(page, 'tool-note', 640, 360);
  await page.getByTestId('card-editor').fill(Array.from({ length: 30 }, (_, index) => `Zeile ${index + 1}`).join('\n'));
  const grown = page.locator('.text-note').last();
  await expect.poll(async () => Number(await grown.getAttribute('data-height')), { timeout: 4000 }).toBeGreaterThan(400);
  const scrolls = await page.getByTestId('card-editor').evaluate((element) => element.scrollHeight - element.clientHeight);
  expect(scrolls).toBeLessThan(8);

  await expect(page.getByTestId('save-state')).toContainText('Nicht in Datei gespeichert');
  await app.close();
  const again = await launch({}, userData);
  await expect.poll(async () => again.page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await again.app.close();
});

test('a rejected open does not become the save target', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'focusboard-open-'));
  const bad = path.join(userData, 'bad.json');
  const saved = path.join(userData, 'neu.json');
  writeFileSync(bad, '{');
  const { app, page } = await launch({ WHITEBOARD_E2E_OPEN: bad, WHITEBOARD_E2E_SAVE: saved }, userData);
  await page.getByTestId('file-menu').click();
  await page.getByRole('button', { name: 'Öffnen' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await dropTool(page, 'tool-note', 180, 160);
  await page.getByTestId('card-editor').fill('Sicher');
  await page.keyboard.press('Escape');
  const saveButton = page.getByRole('button', { name: 'Speichern', exact: true });
  if (!(await saveButton.isVisible())) await page.getByTestId('file-menu').click();
  await saveButton.click();
  await expect.poll(() => existsSync(saved) && readFileSync(saved, 'utf8').includes('Sicher'), { timeout: 8000 }).toBe(true);
  expect(readFileSync(bad, 'utf8')).toBe('{');
  await app.close();
});
