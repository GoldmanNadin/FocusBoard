import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function launch() {
  const userData = mkdtempSync(path.join(tmpdir(), 'focusboard-042-'));
  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: { ...process.env, WHITEBOARD_E2E: '1', WHITEBOARD_USER_DATA: userData },
  });
  const page = await app.firstWindow();
  await page.getByTestId('tool-note').waitFor({ timeout: 30_000 });
  await page.getByTestId('zoom-100').click();
  return { app, page };
}

async function dropTool(page: Page, id: string, x: number, y: number) {
  await page.getByTestId(id).dragTo(page.locator('.react-flow__pane'), { targetPosition: { x, y } });
}

test('handles, dock highlight, body drag, preview, marquee and reverse', async () => {
  const { app, page } = await launch();
  const pane = page.locator('.react-flow__pane');
  await dropTool(page, 'tool-note', 140, 160);
  await page.getByTestId('card-editor').fill('Links');
  await page.keyboard.press('Escape');
  await dropTool(page, 'tool-note', 460, 160);
  await page.getByTestId('card-editor').fill('Rechts');
  await page.keyboard.press('Escape');

  await page.getByTestId('tool-line').click();
  await pane.click({ position: { x: 80, y: 80 } });
  await page.mouse.move(200, 200);
  await expect(page.getByTestId('line-preview')).toBeVisible();
  const paneBox = await pane.boundingBox();
  if (!paneBox) throw new Error('Fläche fehlt');
  await pane.click({ position: { x: 220, y: 120 } });
  const line = page.locator('[data-testid=canvas-line]').last();
  await line.click({ force: true });
  await expect(page.getByTestId('line-handle-source')).toBeVisible();
  await expect(page.getByTestId('line-handle-target')).toBeVisible();

  const target = await page.getByTestId('line-handle-target').boundingBox();
  const right = await page.locator('.text-note', { hasText: 'Rechts' }).boundingBox();
  if (!target || !right) throw new Error('Griff fehlt');
  await page.mouse.move(target.x + 4, target.y + 4);
  await page.mouse.down();
  await page.mouse.move(right.x + right.width / 2, right.y + 20, { steps: 8 });
  await expect(page.getByTestId('dock-highlight')).toBeVisible();
  await page.mouse.up();
  await expect(line).toHaveAttribute('data-target', 'card');

  const body = await line.boundingBox();
  if (!body) throw new Error('Linie fehlt');
  const before = await line.getAttribute('data-source');
  await page.mouse.move(body.x + body.width / 2, body.y + body.height / 2);
  await page.mouse.down();
  await page.mouse.move(body.x + body.width / 2 + 40, body.y + body.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  expect(before).toBe('point');
  await expect(line).toHaveAttribute('data-source', 'point');
  await expect(line).toHaveAttribute('data-target', 'point');

  const x1 = await line.locator('line').nth(1).getAttribute('x1');
  const x2 = await line.locator('line').nth(1).getAttribute('x2');
  await page.getByTestId('line-reverse').click();
  await expect.poll(async () => line.locator('line').nth(1).getAttribute('x1')).toBe(x2);
  await expect.poll(async () => line.locator('line').nth(1).getAttribute('x2')).toBe(x1);
  await page.getByTestId('undo').click();
  await expect.poll(async () => line.locator('line').nth(1).getAttribute('x1')).toBe(x1);

  const note = await page.locator('.text-note', { hasText: 'Links' }).boundingBox();
  if (!note) throw new Error('Karte fehlt');
  await page.mouse.move(note.x - 30, note.y - 30);
  await page.mouse.down();
  await page.mouse.move(note.x + note.width + 40, note.y + note.height + 40, { steps: 6 });
  await page.mouse.up();
  const past = await page.getByTestId('undo').getAttribute('data-past');
  const noteBox = await page.locator('.text-note', { hasText: 'Links' }).boundingBox();
  if (!noteBox) throw new Error('Karte fehlt');
  await page.mouse.move(noteBox.x + 24, noteBox.y + 24);
  await page.mouse.down();
  await page.mouse.move(noteBox.x + 90, noteBox.y + 70, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => page.getByTestId('undo').getAttribute('data-past')).not.toBe(past);
  await app.close();
});

test('the todo add row stays inside the card', async () => {
  const { app, page } = await launch();
  await page.getByTestId('tool-todo').dragTo(page.locator('.react-flow__pane'), { targetPosition: { x: 200, y: 160 } });
  const card = page.locator('.card-todo');
  const add = page.getByTestId('todo-add');
  const cardBox = await card.boundingBox();
  const addBox = await add.boundingBox();
  if (!cardBox || !addBox) throw new Error('Liste fehlt');
  expect(addBox.y + addBox.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);
  await app.close();
});
