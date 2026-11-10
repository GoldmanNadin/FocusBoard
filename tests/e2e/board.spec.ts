import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function launch(extra: Record<string, string> = {}) {
  const userData = mkdtempSync(path.join(tmpdir(), 'whiteboard-e2e-'));
  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      WHITEBOARD_E2E: '1',
      WHITEBOARD_USER_DATA: userData,
      ...extra,
    },
  });
  const page = await app.firstWindow();
  await page.getByTestId('tool-note').waitFor({ timeout: 30_000 });
  return { app, page, userData };
}

async function clickPane(page: Page, xRatio = 0.45, yRatio = 0.45) {
  const pane = page.locator('.react-flow__pane');
  const box = await pane.boundingBox();
  if (!box) throw new Error('Fläche fehlt');
  await pane.click({ position: { x: box.width * xRatio, y: box.height * yRatio } });
  return box;
}

test('note typing, drag undo, editor drag, wheel, colors, theme, fit, sticker, autosave', async () => {
  const { app, page, userData } = await launch();
  await expect(page.getByTestId('brand-home')).toContainText('FocusBoard');
  await expect(page.getByLabel('Text, der auf der Karte steht')).toHaveCount(0);
  await expect(page.getByTestId('tool-heading')).toBeVisible();
  await expect(page.getByTestId('tool-subheading')).toBeVisible();

  await page.getByTestId('tool-note').click();
  await clickPane(page, 0.4, 0.4);
  const editor = page.getByTestId('card-editor');
  await expect(editor).toBeVisible();
  await editor.fill('Hallo Äpfel');
  await page.keyboard.press('Escape');
  await expect(page.locator('.card-copy', { hasText: 'Hallo Äpfel' })).toBeVisible();

  const card = page.locator('.text-note');
  const modelX = async () => Number(await card.getAttribute('data-x'));
  const beforeX = await modelX();
  const box = await card.boundingBox();
  if (!box) throw new Error('Karte fehlt');
  const startX = box.x + 36;
  const startY = box.y + 28;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 140, startY + 70, { steps: 8 });
  await page.mouse.up();
  expect(await modelX()).toBeGreaterThan(beforeX + 20);
  await page.getByTestId('undo').click({ timeout: 5000 });
  await expect.poll(modelX, { timeout: 2000 }).toBe(beforeX);
  await page.getByTestId('redo').click({ timeout: 5000 });
  await expect.poll(modelX, { timeout: 5000 }).toBeGreaterThan(beforeX + 20);

  await card.dblclick({ position: { x: 40, y: 36 } });
  const editing = page.getByTestId('card-editor');
  await expect(editing).toBeVisible();
  const lockedX = await modelX();
  const editorBox = await editing.boundingBox();
  if (!editorBox) throw new Error('Editor fehlt');
  await page.mouse.move(editorBox.x + 16, editorBox.y + 16);
  await page.mouse.down();
  await page.mouse.move(editorBox.x + 90, editorBox.y + 36, { steps: 4 });
  await page.mouse.up();
  expect(await modelX()).toBe(lockedX);
  await page.keyboard.press('Escape');

  await expect(page.getByTestId('color-pink')).toBeVisible();
  await page.getByTestId('color-pink').click();
  await expect(page.locator('.text-note[data-color="pink"]')).toBeVisible();
  await page.getByTestId('undo').click();
  await expect(page.locator('.text-note[data-color="yellow"]')).toBeVisible();

  const zoom = page.getByTestId('zoom-readout');
  const initialZoom = await zoom.innerText();
  const paneBox = await page.locator('.react-flow__pane').boundingBox();
  if (!paneBox) throw new Error('Fläche fehlt');
  await page.mouse.move(paneBox.x + paneBox.width / 2, paneBox.y + paneBox.height / 2);
  await page.mouse.wheel(0, 240);
  await expect(zoom).toHaveText(initialZoom);
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 180);
  await page.keyboard.up('Shift');
  await expect(zoom).toHaveText(initialZoom);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 240);
  await page.keyboard.up('Control');
  await expect(zoom).not.toHaveText(initialZoom);

  await page.getByTestId('zoom-fit').click();
  await expect(page.locator('.card-copy', { hasText: 'Hallo Äpfel' })).toBeVisible();
  await page.getByTestId('theme-toggle').click();
  await expect.poll(async () => page.locator('.react-flow').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(18, 18, 18)');

  await page.getByTestId('tool-more').click();
  await page.getByTestId('sticker-star').click();
  await expect(page.locator('.card-sticker')).toBeVisible();

  await expect.poll(() => existsSync(path.join(userData, 'recovery-autosave.json')), { timeout: 5000 }).toBe(true);
  expect(readFileSync(path.join(userData, 'recovery-autosave.json'), 'utf8')).toContain('Hallo Äpfel');
  expect(existsSync(path.join(userData, 'whiteboard.json'))).toBe(false);
  await app.close();
});

test('imports a version 1 board', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'whiteboard-v1-'));
  const fixture = path.join(userData, 'legacy.json');
  writeFileSync(
    fixture,
    JSON.stringify({
      format: 'digitales-whiteboard',
      version: 1,
      appVersion: '0.1.0',
      rootBoardId: 'rootboard',
      boards: [
        {
          id: 'rootboard',
          title: 'Hauptboard',
          parentBoardId: null,
          cards: [{ id: 'textcard1', type: 'text', x: 40, y: 80, width: 220, height: 140, text: 'Äpfel aus Version 1' }],
          connectors: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      ],
      files: [],
    }),
  );
  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      WHITEBOARD_E2E: '1',
      WHITEBOARD_USER_DATA: userData,
      WHITEBOARD_E2E_FILE: fixture,
    },
  });
  const page = await app.firstWindow();
  await expect(page.locator('.card-copy', { hasText: 'Äpfel aus Version 1' })).toBeVisible({ timeout: 30_000 });
  await app.close();
});

test('toolbar stays inside the window at scale 2', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'whiteboard-dpi-'));
  const app: ElectronApplication = await electron.launch({
    args: ['.', '--force-device-scale-factor=2'],
    cwd: process.cwd(),
    env: { ...process.env, WHITEBOARD_E2E: '1', WHITEBOARD_USER_DATA: userData },
  });
  const page = await app.firstWindow();
  const button = page.getByTestId('tool-image');
  await button.waitFor({ timeout: 30_000 });
  const box = await button.boundingBox();
  const size = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  if (!box) throw new Error('Werkzeug fehlt');
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(size.height + 1);
  await app.close();
});
