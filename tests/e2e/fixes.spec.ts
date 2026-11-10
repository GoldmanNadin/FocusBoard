import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Regression tests for the bugs listed in docs/FEEDBACK_0.4.md, section A.

async function launch(userData?: string, extra: Record<string, string> = {}) {
  const dir = userData ?? mkdtempSync(path.join(tmpdir(), 'whiteboard-fix-'));
  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: { ...process.env, WHITEBOARD_E2E: '1', WHITEBOARD_USER_DATA: dir, ...extra },
  });
  const page = await app.firstWindow();
  await page.getByTestId('tool-note').waitFor({ timeout: 30_000 });
  return { app, page, dir };
}

async function pane(page: Page) {
  const box = await page.locator('.react-flow__pane').boundingBox();
  if (!box) throw new Error('Fläche fehlt');
  return box;
}

async function addNote(page: Page, x: number, y: number, text: string) {
  await page.getByTestId('tool-note').click();
  const b = await pane(page);
  await page.mouse.click(b.x + x, b.y + y);
  await page.getByTestId('card-editor').waitFor();
  if (text) await page.keyboard.type(text);
  await page.keyboard.press('Escape');
}

const itemTexts = (page: Page) => page.getByLabel('Eintrag').evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));

test('A1: autosave keeps running while the restore prompt is open, the earlier session is kept', async () => {
  const first = await launch();
  await addNote(first.page, 200, 150, 'Erste Sitzung');
  const file = path.join(first.dir, 'recovery-autosave.json');
  await expect.poll(() => existsSync(file) && readFileSync(file, 'utf8').includes('Erste Sitzung'), { timeout: 5000 }).toBe(true);
  await first.app.close();

  const second = await launch(first.dir);
  await expect(second.page.getByTestId('recovery-banner')).toBeVisible();
  await addNote(second.page, 400, 300, 'Zweite Sitzung');
  await expect.poll(() => readFileSync(file, 'utf8').includes('Zweite Sitzung'), { timeout: 5000 }).toBe(true);
  expect(readFileSync(`${file}.previous`, 'utf8')).toContain('Erste Sitzung');
  await second.app.close();
});

test('A2: the More menu is fully visible and clickable', async () => {
  const { app, page } = await launch();
  await page.getByTestId('tool-more').click();
  const hits = await page.evaluate(() =>
    ['more-board', 'sticker-star', 'sticker-arrow'].map((id) => {
      const el = document.querySelector(`[data-testid=${id}]`) as HTMLElement;
      const r = el.getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el;
    }),
  );
  expect(hits).toEqual([true, true, true]);
  const menu = await page.getByTestId('more-menu').boundingBox();
  expect(menu!.height).toBeLessThan(160);
  await page.getByTestId('sticker-star').click();
  await expect(page.locator('.card-sticker')).toHaveCount(1);
  await app.close();
});

test('A3/A4: todo Enter moves the cursor down, Backspace never leaves an empty list', async () => {
  const { app, page } = await launch();
  const b = await pane(page);
  await page.getByTestId('tool-todo').click();
  await page.mouse.click(b.x + 300, b.y + 200);
  await page.getByLabel('Eintrag').first().click();
  await page.keyboard.type('Eins');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Zwei');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Drei');
  await expect.poll(() => itemTexts(page)).toEqual(['Eins', 'Zwei', 'Drei']);

  await page.keyboard.press('ArrowUp');
  await page.keyboard.type('!');
  await expect.poll(() => itemTexts(page)).toEqual(['Eins', 'Zwei!', 'Drei']);

  for (let i = 0; i < 30; i += 1) await page.keyboard.press('Backspace');
  await expect.poll(() => itemTexts(page)).toEqual(['']);
  await page.keyboard.type('Neu');
  await expect.poll(() => itemTexts(page)).toEqual(['Neu']);
  await app.close();
});

test('A5: a growing todo list pushes the next card in its column down', async () => {
  const { app, page } = await launch();
  const b = await pane(page);
  await page.getByTestId('tool-column').click();
  await page.mouse.click(b.x + 200, b.y + 80);
  await page.getByTestId('tool-todo').dragTo(page.locator('.react-flow__pane'), { targetPosition: { x: 260, y: 150 } });
  const column = await page.locator('.react-flow__node:has(.card-column)').boundingBox();
  await page
    .getByTestId('tool-note')
    .dragTo(page.locator('.react-flow__pane'), { targetPosition: { x: 260, y: column!.y - b.y + column!.height - 10 } });
  await page.keyboard.type('Darunter');
  await page.keyboard.press('Escape');
  await expect(page.locator('.text-note')).not.toHaveAttribute('data-column', '');

  await page.getByLabel('Eintrag').first().click();
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.type(`Punkt ${i}`);
    await page.keyboard.press('Enter');
  }
  await expect.poll(async () => {
    const todo = await page.locator('.react-flow__node:has(.card-todo)').boundingBox();
    const note = await page.locator('.react-flow__node:has(.text-note)').boundingBox();
    return Boolean(todo && note && todo.y + todo.height <= note.y + 1);
  }).toBe(true);
  await app.close();
});

test('A6: the line toolbar closes on pane click, Escape and board change; Delete removes the line', async () => {
  const { app, page } = await launch();
  const b = await pane(page);
  const drawLine = async (y: number) => {
    await page.getByTestId('tool-line').click();
    await page.mouse.move(b.x + 200, b.y + y);
    await page.mouse.down();
    await page.mouse.move(b.x + 450, b.y + y + 40, { steps: 6 });
    await page.mouse.up();
  };
  const toolbar = page.getByRole('toolbar', { name: 'Linie' });
  await drawLine(200);
  const line = page.getByTestId('canvas-line').first();
  await line.click({ force: true });
  await expect(toolbar).toBeVisible();
  await page.mouse.click(b.x + 700, b.y + 500);
  await expect(toolbar).toHaveCount(0);

  await line.click({ force: true });
  await expect(toolbar).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toolbar).toHaveCount(0);

  await line.click({ force: true });
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('canvas-line')).toHaveCount(0);
  await expect(toolbar).toHaveCount(0);

  await drawLine(200);
  await page.getByTestId('canvas-line').first().click({ force: true });
  await page.getByTestId('tool-more').click();
  await page.getByTestId('more-board').click();
  await page.mouse.click(b.x + 300, b.y + 450);
  await page.keyboard.press('Escape');
  await page.locator('.open-board').click();
  await expect(page.locator('.crumb')).toHaveCount(2);
  await expect(toolbar).toHaveCount(0);
  await app.close();
});

test('A7: Ctrl+A selects every card instead of the page text', async () => {
  const { app, page } = await launch();
  await addNote(page, 200, 150, 'Eins');
  await addNote(page, 500, 150, 'Zwei');
  const b = await pane(page);
  await page.mouse.click(b.x + b.width - 60, b.y + b.height - 160);
  await page.keyboard.press('Control+A');
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
  await app.close();
});

test('A8: Enter and Escape in the board title stay in the title', async () => {
  const { app, page } = await launch();
  await addNote(page, 200, 150, 'Karte');
  await page.locator('.text-note').click();
  const title = page.getByLabel('Titel dieses Boards');
  await title.click();
  await title.fill('Projekt');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('card-editor')).toHaveCount(0);
  await expect(title).not.toBeFocused();
  await expect(title).toHaveValue('Projekt');
  await title.click();
  await title.fill('Verworfen');
  await page.keyboard.press('Escape');
  await expect(title).toHaveValue('Projekt');
  await app.close();
});

test('A9: switching the theme is not undoable and does not mark the board as changed', async () => {
  const { app, page } = await launch();
  await expect(page.getByTestId('save-state')).toHaveText('Keine Änderungen');
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByTestId('save-state')).toHaveText('Keine Änderungen');
  await expect(page.getByTestId('undo')).toBeDisabled();
  await addNote(page, 200, 150, 'Text');
  await page.getByTestId('undo').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await app.close();
});

test('A10/A11: an empty new note disappears, a long note grows instead of scrolling', async () => {
  const { app, page } = await launch();
  await addNote(page, 200, 150, '');
  await expect(page.locator('.text-note')).toHaveCount(0);
  await expect(page.getByTestId('undo')).toBeDisabled();

  await page.getByTestId('tool-note').click();
  const b = await pane(page);
  await page.mouse.click(b.x + 500, b.y + 100);
  await page.getByTestId('card-editor').fill(Array.from({ length: 30 }, (_, i) => `Zeile ${i + 1}`).join('\n'));
  await page.keyboard.press('Escape');
  const copy = page.locator('.text-note .card-copy');
  await expect(copy).toContainText('Zeile 30');
  await expect.poll(() => copy.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  await app.close();
});

test('A12: the save state tells the truth', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'whiteboard-fix-'));
  const { app, page } = await launch(userData, { WHITEBOARD_E2E_SAVE: path.join(userData, 'board.json') });
  const state = page.getByTestId('save-state');
  await expect(state).toHaveText('Keine Änderungen');
  await addNote(page, 200, 150, 'Eins');
  await expect(state).toContainText('Noch nicht als Datei gespeichert');
  await page.keyboard.press('Control+S');
  await expect(state).toHaveText('Alle Änderungen gespeichert');
  await addNote(page, 500, 150, 'Zwei');
  await expect(state).toContainText('Nicht in Datei gespeichert');
  await app.close();
});

test('A13: lines are drawn above cards', async () => {
  const { app, page } = await launch();
  await addNote(page, 200, 150, 'Karte');
  const z = await page.locator('.line-layer').evaluate((el) => getComputedStyle(el).zIndex);
  expect(Number(z)).toBeGreaterThan(2);
  await app.close();
});
