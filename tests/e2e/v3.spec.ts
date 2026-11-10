import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function launch(extra: Record<string, string> = {}) {
  const userData = mkdtempSync(path.join(tmpdir(), 'whiteboard-v3-'));
  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: { ...process.env, WHITEBOARD_E2E: '1', WHITEBOARD_USER_DATA: userData, ...extra },
  });
  const page = await app.firstWindow();
  await page.getByTestId('tool-note').waitFor({ timeout: 30_000 });
  return { app, page, userData };
}

async function paneBox(page: Page) {
  const pane = page.locator('.react-flow__pane');
  const box = await pane.boundingBox();
  if (!box) throw new Error('Fläche fehlt');
  return box;
}

async function dropTool(page: Page, id: string, x: number, y: number) {
  await page.getByTestId(id).dragTo(page.locator('.react-flow__pane'), { targetPosition: { x, y } });
}

async function flowAt(page: Page, x: number, y: number) {
  const readout = page.getByTestId('zoom-readout');
  const zoom = Number(await readout.getAttribute('data-zoom'));
  const vx = Number(await readout.getAttribute('data-vx'));
  const vy = Number(await readout.getAttribute('data-vy'));
  return { x: (x - vx) / zoom, y: (y - vy) / zoom };
}

test('toolbar drop lands at 50, 100 and 200 percent and after pan, then types immediately', async () => {
  const { app, page } = await launch();
  await expect(page.getByTestId('tool-column')).toBeVisible();
  await expect(page.getByTestId('tool-todo')).toBeVisible();
  await expect(page.getByTestId('tool-line')).toBeVisible();
  await page.getByTestId('tool-more').click();
  await expect(page.getByTestId('more-connect')).toHaveCount(0);
  await page.keyboard.press('Escape');

  for (const zoom of ['50', '100', '200']) {
    await page.getByTestId(`zoom-${zoom}`).click();
    await expect(page.getByTestId('zoom-readout')).toHaveText(`${zoom} %`);
    const spot = { x: 220, y: 160 };
    await dropTool(page, 'tool-note', spot.x, spot.y);
    const expected = await flowAt(page, spot.x, spot.y);
    const note = page.locator('.text-note').last();
    await expect(note).toBeVisible();
    const modelX = Number(await note.getAttribute('data-model-x'));
    const modelY = Number(await note.getAttribute('data-model-y'));
    expect(Math.abs(modelX - expected.x)).toBeLessThan(4);
    expect(Math.abs(modelY - expected.y)).toBeLessThan(4);
    const editor = page.getByTestId('card-editor');
    await expect(editor).toBeFocused();
    await editor.fill(`Zoom ${zoom}`);
    await page.keyboard.press('Escape');
  }

  await page.getByTestId('zoom-100').click();
  const before = await paneBox(page);
  await page.mouse.move(before.x + 360, before.y + 240);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(before.x + 460, before.y + 200, { steps: 6 });
  await page.mouse.up({ button: 'middle' });
  const spot = { x: 300, y: 220 };
  await dropTool(page, 'tool-heading', spot.x, spot.y);
  const expected = await flowAt(page, spot.x, spot.y);
  const heading = page.locator('.text-heading').last();
  await expect(heading).toBeVisible();
  expect(Math.abs(Number(await heading.getAttribute('data-model-x')) - expected.x)).toBeLessThan(4);
  expect(Math.abs(Number(await heading.getAttribute('data-model-y')) - expected.y)).toBeLessThan(4);
  await expect(page.getByTestId('card-editor')).toBeFocused();
  await page.keyboard.press('Escape');

  await page.getByTestId('tool-note').click();
  await page.locator('.react-flow__pane').click({ position: { x: 140, y: 280 } });
  await expect(page.getByTestId('card-editor')).toBeFocused();
  await app.close();
});

test('cancels a line draft and an image drop without leaving a ghost', async () => {
  const { app, page } = await launch({ WHITEBOARD_E2E_IMAGE: 'cancel' });
  await page.getByTestId('tool-line').click();
  const pane = page.locator('.react-flow__pane');
  await pane.click({ position: { x: 180, y: 160 } });
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid=canvas-line]')).toHaveCount(0);
  await pane.click({ position: { x: 260, y: 220 } });
  await expect(page.locator('[data-testid=canvas-line]')).toHaveCount(0);

  const before = await page.locator('.react-flow__node').count();
  await dropTool(page, 'tool-image', 240, 180);
  await expect(page.locator('.card-image')).toHaveCount(0);
  expect(await page.locator('.react-flow__node').count()).toBe(before);
  await app.close();
});

test('column enter, reorder, exit, move, resize and collapse', async () => {
  const { app, page } = await launch();
  await page.getByTestId('zoom-100').click();
  await dropTool(page, 'tool-column', 80, 70);
  const column = page.locator('.card-column');
  await expect(column).toBeVisible();
  const box = await column.boundingBox();
  const pane = await paneBox(page);
  if (!box) throw new Error('Spalte fehlt');
  const inside = (dx: number, dy: number) => ({ x: box.x - pane.x + dx, y: box.y - pane.y + dy });

  await dropTool(page, 'tool-note', inside(40, 60).x, inside(40, 60).y);
  await page.getByTestId('card-editor').fill('Eins');
  await page.keyboard.press('Escape');
  await expect(page.locator('.text-note', { hasText: 'Eins' })).not.toHaveAttribute('data-column', '');

  const grown = await column.boundingBox();
  if (!grown) throw new Error('Spalte fehlt');
  await dropTool(page, 'tool-note', grown.x - pane.x + 40, grown.y - pane.y + grown.height - 30);
  await page.getByTestId('card-editor').fill('Zwei');
  await page.keyboard.press('Escape');
  const first = page.locator('.text-note', { hasText: 'Eins' });
  const second = page.locator('.text-note', { hasText: 'Zwei' });
  const y1 = Number(await first.getAttribute('data-model-y'));
  const y2 = Number(await second.getAttribute('data-model-y'));
  expect(y2).toBeGreaterThan(y1);

  const secondBox = await second.boundingBox();
  if (!secondBox) throw new Error('Karte fehlt');
  await page.mouse.move(secondBox.x + 30, secondBox.y + 24);
  await page.mouse.down();
  await page.mouse.move(secondBox.x + 30, secondBox.y - 120, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Number(await first.getAttribute('data-model-y'))).toBeGreaterThan(Number(await second.getAttribute('data-model-y')));

  const movedSecond = await second.boundingBox();
  if (!movedSecond) throw new Error('Karte fehlt');
  await page.mouse.move(movedSecond.x + 30, movedSecond.y + 24);
  await page.mouse.down();
  await page.mouse.move(movedSecond.x + 420, movedSecond.y + 24, { steps: 8 });
  await page.mouse.up();
  await expect(second).toHaveAttribute('data-column', '');

  const childX = Number(await first.getAttribute('data-model-x'));
  const columnX = Number(await column.getAttribute('data-model-x'));
  const handle = page.locator('.column-handle');
  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error('Kopf fehlt');
  await page.mouse.move(handleBox.x + 24, handleBox.y + 16);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 140, handleBox.y + 16, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Number(await column.getAttribute('data-model-x'))).toBeGreaterThan(columnX + 40);
  await expect.poll(async () => Number(await first.getAttribute('data-model-x'))).toBeGreaterThan(childX + 40);

  const width = Number(await column.getAttribute('data-width'));
  const grip = page.getByLabel('Spaltenbreite');
  const gripBox = await grip.boundingBox();
  if (!gripBox) throw new Error('Griff fehlt');
  await page.mouse.move(gripBox.x + 4, gripBox.y + 8);
  await page.mouse.down();
  await page.mouse.move(gripBox.x + 90, gripBox.y + 8, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Number(await column.getAttribute('data-width'))).toBeGreaterThan(width + 30);

  await page.getByLabel('Zuklappen').click();
  await expect(column).toHaveAttribute('data-collapsed', '1');
  await expect(first).toBeHidden();
  await expect(column).toHaveAttribute('data-children', /.+/);
  await page.getByLabel('Aufklappen').click();
  await expect(first).toBeVisible();
  await app.close();
});

test('todo enter, check and undo', async () => {
  const { app, page, userData } = await launch();
  await dropTool(page, 'tool-todo', 200, 140);
  const item = page.locator('.todo-item').first();
  await item.click();
  await item.fill('Lesen');
  await item.press('Enter');
  await expect(page.locator('.todo-item')).toHaveCount(2);
  await page.locator('.todo-item').nth(1).fill('Schreiben');
  await page.locator('input[type=checkbox]').first().check();
  await expect(page.locator('.todo-progress')).toHaveText('1/2');
  await expect(page.locator('.todo-item.is-done')).toHaveCount(1);
  await page.getByTestId('undo').click();
  await expect(page.locator('.todo-progress')).toHaveText('0/2');
  await page.getByTestId('redo').click();
  await expect(page.locator('.todo-progress')).toHaveText('1/2');
  await expect.poll(() => existsSync(path.join(userData, 'recovery-autosave.json')), { timeout: 5000 }).toBe(true);
  expect(readFileSync(path.join(userData, 'recovery-autosave.json'), 'utf8')).toContain('Lesen');
  await app.close();
});

test('docked and standalone lines, color, arrowhead and undo', async () => {
  const { app, page } = await launch();
  await page.getByTestId('zoom-100').click();
  await page.getByTestId('tool-note').click();
  const pane = page.locator('.react-flow__pane');
  await pane.click({ position: { x: 160, y: 180 } });
  await page.keyboard.type('Links');
  await page.keyboard.press('Escape');
  await page.getByTestId('tool-note').click();
  await pane.click({ position: { x: 460, y: 180 } });
  await page.keyboard.type('Rechts');
  await page.keyboard.press('Escape');

  await page.getByTestId('tool-line').click();
  const left = page.locator('.text-note').first();
  const right = page.locator('.text-note').last();
  const leftBox = await left.boundingBox();
  const rightBox = await right.boundingBox();
  const paneBounds = await paneBox(page);
  if (!leftBox || !rightBox) throw new Error('Karten fehlen');
  await pane.click({ position: { x: leftBox.x - paneBounds.x + leftBox.width + 4, y: leftBox.y - paneBounds.y + leftBox.height / 2 } });
  await pane.click({ position: { x: rightBox.x - paneBounds.x - 4, y: rightBox.y - paneBounds.y + rightBox.height / 2 } });
  const docked = page.locator('[data-testid=canvas-line][data-source=card][data-target=card]');
  await expect(docked).toHaveCount(1);
  // Lines are SVG paths ("M x y L …" or "M x y Q …"); the start x is the second token.
  const x1 = async () => Number((await docked.locator('path[data-line-path]').getAttribute('d'))!.split(' ')[1]);
  const before = await x1();
  const drag = await left.boundingBox();
  if (!drag) throw new Error('Karte fehlt');
  await page.mouse.move(drag.x + 30, drag.y + 24);
  await page.mouse.down();
  await page.mouse.move(drag.x - 40, drag.y + 24, { steps: 6 });
  await page.mouse.up();
  await expect.poll(x1).not.toBe(before);

  await page.getByTestId('tool-line').click();
  await page.mouse.move(paneBounds.x + 180, paneBounds.y + 420);
  await page.mouse.down();
  await page.mouse.move(paneBounds.x + 340, paneBounds.y + 460, { steps: 8 });
  await page.mouse.up();
  const free = page.locator('[data-testid=canvas-line][data-source=point][data-target=point]');
  await expect(free).toHaveCount(1);
  await free.click({ force: true });
  await page.getByTestId('line-color-pink').click();
  await expect(free).toHaveAttribute('data-color', 'pink');
  await page.getByTestId('line-arrow').click();
  await expect(free).toHaveAttribute('data-arrow', '0');
  await page.getByTestId('undo').click();
  await expect(free).toHaveAttribute('data-arrow', '1');
  await page.getByTestId('undo').click();
  await expect(free).toHaveAttribute('data-color', 'ink');
  await app.close();
});

test('saves a version 3 file and imports a version 2 board', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'whiteboard-v3-save-'));
  const savePath = path.join(userData, 'runde.json');
  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      WHITEBOARD_E2E: '1',
      WHITEBOARD_USER_DATA: userData,
      WHITEBOARD_E2E_SAVE: savePath,
    },
  });
  const page = await app.firstWindow();
  await page.getByTestId('tool-note').waitFor({ timeout: 30_000 });
  await dropTool(page, 'tool-note', 200, 160);
  await page.getByTestId('card-editor').fill('Runde Äpfel');
  await page.keyboard.press('Escape');
  await page.getByTestId('file-menu').click();
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect.poll(() => existsSync(savePath)).toBe(true);
  const saved = JSON.parse(readFileSync(savePath, 'utf8')) as { version: number; boards: { lines: unknown[] }[] };
  expect(saved.version).toBe(3);
  await app.close();

  const legacyPath = path.join(userData, 'alt.json');
  writeFileSync(
    legacyPath,
    JSON.stringify({
      format: 'digitales-whiteboard',
      version: 2,
      appVersion: '0.2.0',
      theme: 'light',
      rootBoardId: 'rootboard',
      boards: [
        {
          id: 'rootboard',
          title: 'Hauptboard',
          parentBoardId: null,
          cards: [
            { id: 'textcard1', type: 'text', x: 40, y: 80, width: 220, height: 160, text: 'Alt aus V2', style: 'note', color: 'pink' },
            { id: 'textcard2', type: 'text', x: 320, y: 80, width: 220, height: 160, text: 'Ziel', style: 'note', color: 'green' },
          ],
          connectors: [{ id: 'conn00001', source: 'textcard1', target: 'textcard2', sourceHandle: 'right', targetHandle: 'left' }],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      ],
      files: [],
    }),
  );
  const imported = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      WHITEBOARD_E2E: '1',
      WHITEBOARD_USER_DATA: mkdtempSync(path.join(tmpdir(), 'whiteboard-v3-v2-')),
      WHITEBOARD_E2E_FILE: legacyPath,
    },
  });
  const importedPage = await imported.firstWindow();
  await expect(importedPage.locator('.card-copy', { hasText: 'Alt aus V2' })).toBeVisible({ timeout: 30_000 });
  await expect(importedPage.locator('[data-testid=canvas-line][data-source=card][data-target=card]')).toHaveCount(1);
  await imported.close();
});
