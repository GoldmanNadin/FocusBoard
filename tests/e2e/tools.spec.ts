import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// New tools and gestures from docs/FEEDBACK_0.4.md, section D1/D2.

async function launch() {
  const userData = mkdtempSync(path.join(tmpdir(), 'whiteboard-tools-'));
  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: { ...process.env, WHITEBOARD_E2E: '1', WHITEBOARD_USER_DATA: userData },
  });
  const page = await app.firstWindow();
  await page.getByTestId('tool-note').waitFor({ timeout: 30_000 });
  return { app, page };
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
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
}

async function writeClipboard(app: ElectronApplication, kind: 'text' | 'image', value: string) {
  await app.evaluate(({ clipboard, nativeImage }, [k, v]) => {
    if (k === 'text') clipboard.writeText(v);
    else clipboard.writeImage(nativeImage.createFromDataURL(v));
  }, [kind, value] as const);
}

/** 200 × 100 PNG drawn in the page, so the test has a real picture with a known aspect ratio. */
async function widePng(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#2f5d9b';
    ctx.fillRect(0, 0, 200, 100);
    return canvas.toDataURL('image/png');
  });
}

test('toolbar shows labels, empty boards explain what to do', async () => {
  const { app, page } = await launch();
  await expect(page.getByTestId('empty-hint')).toBeVisible();
  for (const label of ['Notiz', 'Titel', 'Bild', 'Link', 'Board', 'Spalte', 'Liste', 'Linie']) {
    await expect(page.locator('.tool-label', { hasText: new RegExp(`^${label}$`) })).toBeVisible();
  }
  await expect(page.getByTestId('tool-note')).toHaveAttribute('title', 'Notiz (N)');
  const b = await pane(page);
  await page.mouse.dblclick(b.x + 200, b.y + 150);
  await expect(page.getByTestId('card-editor')).toBeFocused();
  await page.keyboard.type('Per Doppelklick');
  await page.keyboard.press('Escape');
  await expect(page.locator('.text-note')).toHaveCount(1);
  await expect(page.getByTestId('empty-hint')).toHaveCount(0);
  await app.close();
});

test('copy, paste, duplicate and undo cards', async () => {
  const { app, page } = await launch();
  await addNote(page, 200, 150, 'Original');
  await page.locator('.text-note').click();
  await page.keyboard.press('Control+C');
  const b = await pane(page);
  await page.mouse.move(b.x + 600, b.y + 400);
  await page.keyboard.press('Control+V');
  await expect(page.locator('.text-note')).toHaveCount(2);
  await expect(page.locator('.text-note', { hasText: 'Original' })).toHaveCount(2);
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(1);
  await page.keyboard.press('Control+D');
  await expect(page.locator('.text-note')).toHaveCount(3);
  await page.keyboard.press('Control+Z');
  await expect(page.locator('.text-note')).toHaveCount(2);
  await page.locator('.react-flow__node:has(.text-note)').last().click();
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(1);
  await page.keyboard.press('Control+X');
  await expect(page.locator('.text-note')).toHaveCount(1);
  await page.keyboard.press('Control+V');
  await expect(page.locator('.text-note')).toHaveCount(2);
  await app.close();
});

test('pasting text makes a note, a web address makes a link card', async () => {
  const { app, page } = await launch();
  const b = await pane(page);
  await page.mouse.move(b.x + 300, b.y + 200);
  await writeClipboard(app, 'text', 'Aus der Zwischenablage');
  await page.keyboard.press('Control+V');
  await expect(page.locator('.text-note', { hasText: 'Aus der Zwischenablage' })).toBeVisible();
  await page.mouse.move(b.x + 700, b.y + 200);
  await writeClipboard(app, 'text', 'www.example.com/seite');
  await page.keyboard.press('Control+V');
  await expect(page.locator('.card-link')).toHaveAttribute('data-url', 'https://www.example.com/seite');
  await expect(page.locator('.card-link .link-title')).toHaveText('example.com');
  await app.close();
});

test('pasting and dropping pictures keeps their aspect ratio', async () => {
  const { app, page } = await launch();
  const png = await widePng(page);
  const b = await pane(page);
  await page.mouse.move(b.x + 200, b.y + 150);
  await writeClipboard(app, 'image', png);
  await page.keyboard.press('Control+V');
  const node = page.locator('.react-flow__node:has(.card-image)');
  await expect(node).toHaveCount(1);
  const box = await node.boundingBox();
  expect(box!.width / box!.height).toBeCloseTo(2, 1);

  await page.evaluate(
    async ([dataUrl, x, y]) => {
      const blob = await (await fetch(dataUrl)).blob();
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], 'foto.png', { type: 'image/png' }));
      transfer.items.add(new File([blob], 'zweites.png', { type: 'image/png' }));
      const target = document.querySelector('.flow-shell')!;
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: transfer }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: transfer }));
    },
    [png, b.x + 500, b.y + 300] as const,
  );
  await expect(node).toHaveCount(3);
  await app.close();
});

test('link tool asks for an address and refuses non-web addresses', async () => {
  const { app, page } = await launch();
  const b = await pane(page);
  await page.keyboard.press('k');
  await expect(page.getByTestId('tool-link')).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.click(b.x + 300, b.y + 200);
  const input = page.getByTestId('link-input');
  await expect(input).toBeFocused();
  await input.fill('javascript:alert(1)');
  await page.keyboard.press('Enter');
  await expect(page.locator('.link-error')).toBeVisible();
  await input.fill('example.org');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('link-prompt')).toHaveCount(0);
  const card = page.locator('.card-link');
  await expect(card).toHaveAttribute('data-url', 'https://example.org/');
  await page.getByTestId('open-link').click();
  await expect(page.locator('.banner')).toHaveCount(0);
  await page.locator('.react-flow__node:has(.card-link)').dblclick({ position: { x: 20, y: 40 } });
  await page.getByTestId('link-input').fill('https://example.net/neu');
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('data-url', 'https://example.net/neu');
  await app.close();
});

test('right-click menu: duplicate, color, order, delete with undo, paste on the pane', async () => {
  const { app, page } = await launch();
  await addNote(page, 200, 150, 'Menü');
  // Selected cards are drawn on top; the duplicate overlaps the original, so target the selected one.
  const note = page.locator('.react-flow__node.selected:has(.text-note)');
  await page.locator('.react-flow__node:has(.text-note)').click();
  await note.click({ button: 'right' });
  await expect(page.getByTestId('context-menu')).toBeVisible();
  await page.getByTestId('menu-duplicate').click();
  await expect(page.locator('.text-note')).toHaveCount(2);

  await note.click({ button: 'right' });
  await page.getByTestId('menu-color-green').click();
  await expect(page.locator('.text-note[data-color="green"]')).toHaveCount(1);

  await note.click({ button: 'right' });
  await page.getByTestId('menu-copy').click();
  const b = await pane(page);
  await page.mouse.click(b.x + 800, b.y + 450, { button: 'right' });
  await page.getByTestId('menu-paste').click();
  await expect(page.locator('.text-note')).toHaveCount(3);

  await note.click({ button: 'right' });
  await page.getByTestId('menu-delete').click();
  await expect(page.locator('.text-note')).toHaveCount(2);
  await expect(page.getByTestId('toast')).toContainText('Karte gelöscht');
  await page.getByTestId('toast-undo').click();
  await expect(page.locator('.text-note')).toHaveCount(3);

  await page.keyboard.press('Escape');
  await page.mouse.click(b.x + 900, b.y + 100, { button: 'right' });
  await expect(page.getByTestId('context-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('context-menu')).toHaveCount(0);
  await app.close();
});

test('double-click opens a sub-board, the Edit menu acts on the board', async () => {
  const { app, page } = await launch();
  const b = await pane(page);
  await page.keyboard.press('b');
  await page.mouse.click(b.x + 300, b.y + 200);
  await page.keyboard.type('Projekt');
  await page.keyboard.press('Enter');
  await page.locator('.react-flow__node:has(.card-board)').dblclick({ position: { x: 30, y: 20 } });
  await expect(page.locator('.crumb')).toHaveCount(2);
  await expect(page.getByLabel('Titel dieses Boards')).toHaveValue('Projekt');
  await page.getByRole('button', { name: 'Hauptboard', exact: true }).click();

  const clickMenu = (label: string) =>
    app.evaluate(({ Menu, BrowserWindow }, name) => {
      const edit = Menu.getApplicationMenu()!.items.find((item) => item.label === 'Bearbeiten')!;
      const entry = edit.submenu!.items.find((item) => item.label === name)!;
      entry.click(undefined, BrowserWindow.getAllWindows()[0], undefined);
    }, label);
  await page.locator('.react-flow__node:has(.card-board)').click();
  await clickMenu('Duplizieren');
  await expect(page.locator('.card-board')).toHaveCount(2);
  await clickMenu('Rückgängig');
  await expect(page.locator('.card-board')).toHaveCount(1);
  await clickMenu('Alles auswählen');
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(1);
  await app.close();
});

test('Ctrl+Z inside a note undoes typing only, not board changes', async () => {
  const { app, page } = await launch();
  await addNote(page, 200, 150, 'Erste');
  await page.locator('.text-note').dblclick();
  await expect(page.getByTestId('card-editor')).toBeFocused();
  // The cursor starts at the end of the existing text.
  await page.keyboard.type(' Zeile zwei');
  await page.keyboard.press('Control+Z');
  // Whole words are undone; the board itself stays untouched.
  await expect(page.getByTestId('card-editor')).toHaveValue('Erste Zeile');
  await page.keyboard.press('Control+Z');
  await expect(page.getByTestId('card-editor')).toHaveValue('Erste');
  await page.keyboard.press('Control+Y');
  await expect(page.getByTestId('card-editor')).toHaveValue('Erste Zeile');
  await expect(page.getByTestId('card-editor')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.text-note')).toHaveCount(1);
  await expect(page.locator('.text-note .card-copy')).toContainText('Erste');
  await app.close();
});

test('after the first save, changes are written to the file automatically', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'whiteboard-auto-'));
  const target = path.join(userData, 'board.json');
  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: { ...process.env, WHITEBOARD_E2E: '1', WHITEBOARD_USER_DATA: userData, WHITEBOARD_E2E_SAVE: target },
  });
  const page = await app.firstWindow();
  await page.getByTestId('tool-note').waitFor({ timeout: 30_000 });
  await addNote(page, 200, 150, 'Zuerst');
  await page.keyboard.press('Control+S');
  await expect(page.getByTestId('save-state')).toHaveText('Alle Änderungen gespeichert');
  await addNote(page, 500, 150, 'Automatisch in der Datei');
  await expect.poll(() => readFileSync(target, 'utf8').includes('Automatisch in der Datei'), { timeout: 6000 }).toBe(true);
  await expect(page.getByTestId('save-state')).toHaveText('Alle Änderungen gespeichert');
  await app.close();
});

test('Ctrl+F finds cards on every board and jumps there', async () => {
  const { app, page } = await launch();
  const b = await pane(page);
  await page.keyboard.press('b');
  await page.mouse.click(b.x + 300, b.y + 200);
  await page.keyboard.type('Urlaub');
  await page.keyboard.press('Enter');
  await page.locator('.react-flow__node:has(.card-board)').dblclick({ position: { x: 30, y: 20 } });
  await addNote(page, 900, 500, 'Strandkörbe für Österreich');
  await page.getByRole('button', { name: 'Hauptboard', exact: true }).click();
  await expect(page.locator('.text-note')).toHaveCount(0);

  await page.keyboard.press('Control+F');
  await page.getByTestId('search-input').fill('osterreich');
  await expect(page.getByTestId('search-hit')).toHaveCount(1);
  await expect(page.getByTestId('search-hit')).toContainText('Notiz · Urlaub');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Titel dieses Boards')).toHaveValue('Urlaub');
  await expect(page.locator('.react-flow__node.selected:has(.text-note)')).toBeInViewport();
  await page.getByTestId('search-input').fill('gibt es nicht');
  await expect(page.locator('.search-empty')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('search-panel')).toHaveCount(0);
  await app.close();
});

test('templates insert ready-made boards', async () => {
  const { app, page } = await launch();
  await page.getByTestId('tool-more').click();
  await page.getByTestId('template-kanban').click();
  await expect(page.locator('.card-column')).toHaveCount(3);
  await expect(page.locator('.column-title', { hasText: 'Erledigt' })).toBeVisible();
  await expect(page.locator('.text-note', { hasText: 'Erste Aufgabe' })).not.toHaveAttribute('data-column', '');
  await page.keyboard.press('Control+Z');
  await expect(page.locator('.card-column')).toHaveCount(0);
  await page.getByTestId('tool-more').click();
  await page.getByTestId('template-week').click();
  await expect(page.locator('.card-column')).toHaveCount(7);
  await app.close();
});

test('a line end can be dragged onto a card and docks there', async () => {
  const { app, page } = await launch();
  await addNote(page, 500, 150, 'Ziel');
  const b = await pane(page);
  await page.getByTestId('tool-line').click();
  await page.mouse.move(b.x + 150, b.y + 450);
  await page.mouse.down();
  await page.mouse.move(b.x + 300, b.y + 480, { steps: 6 });
  await page.mouse.up();
  const line = page.getByTestId('canvas-line');
  await expect(line).toHaveAttribute('data-target', 'point');
  await line.click({ force: true });
  const end = page.getByTestId('line-end-target');
  const handle = await end.boundingBox();
  const note = await page.locator('.react-flow__node:has(.text-note)').boundingBox();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(note!.x + note!.width / 2, note!.y + note!.height - 1, { steps: 8 });
  await page.mouse.up();
  await expect(line).toHaveAttribute('data-target', 'card');
  await page.keyboard.press('Control+Z');
  await expect(line).toHaveAttribute('data-target', 'point');
  await app.close();
});

test('notes show simple formatting; Ctrl+B and Ctrl+I wrap the selection', async () => {
  const { app, page } = await launch();
  await page.getByTestId('tool-note').click();
  const b = await pane(page);
  await page.mouse.click(b.x + 200, b.y + 120);
  const editor = page.getByTestId('card-editor');
  await editor.fill('# Einkauf\n- Milch\n- Brot\n[x] erledigt\nSiehe https://example.com und `code`\nWichtig');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Control+B');
  await page.keyboard.press('Escape');
  const copy = page.locator('.text-note .card-copy');
  await expect(copy.locator('.md-heading')).toHaveText('Einkauf');
  await expect(copy.locator('li')).toHaveCount(2);
  await expect(copy.locator('.md-check.is-done')).toContainText('erledigt');
  await expect(copy.locator('code')).toHaveText('code');
  await expect(copy.locator('strong')).toHaveText('Wichtig');
  await expect(copy.locator('script, img')).toHaveCount(0);
  await copy.locator('a').click();
  await expect(page.locator('.banner')).toHaveCount(0);
  await expect.poll(() => copy.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  await app.close();
});

test('font choice and minimap are remembered', async () => {
  const { app, page } = await launch();
  await page.getByTestId('font-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-font', 'clear');
  await page.getByTestId('minimap-toggle').click();
  await expect(page.locator('.react-flow__minimap')).toBeVisible();
  await page.reload();
  await page.getByTestId('tool-note').waitFor();
  await expect(page.locator('html')).toHaveAttribute('data-font', 'clear');
  await expect(page.locator('.react-flow__minimap')).toBeVisible();
  await app.close();
});

test('draw a sketch with the pen, undo a stroke, finish with Escape', async () => {
  const { app, page } = await launch();
  const b = await pane(page);
  await page.keyboard.press('p');
  await page.mouse.click(b.x + 200, b.y + 120);
  const surface = page.getByTestId('sketch-surface');
  await expect(page.getByTestId('sketch-done')).toBeVisible();
  const box = (await surface.boundingBox())!;
  const stroke = async (y: number) => {
    await page.mouse.move(box.x + 30, box.y + y);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + y + 40, { steps: 10 });
    await page.mouse.up();
  };
  await stroke(40);
  await page.getByTestId('pen-pink').click();
  await stroke(120);
  const sketch = page.locator('.card-sketch');
  await expect(sketch).toHaveAttribute('data-strokes', '2');
  await page.getByTestId('sketch-undo').click();
  await expect(sketch).toHaveAttribute('data-strokes', '1');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('sketch-done')).toHaveCount(0);
  // Like notes: drawing is one undo step, placing the card another.
  await page.keyboard.press('Control+Z');
  await expect(sketch).toHaveAttribute('data-strokes', '0');
  await page.keyboard.press('Control+Z');
  await expect(page.locator('.card-sketch')).toHaveCount(0);

  // A sketch left empty disappears again.
  await page.keyboard.press('p');
  await page.mouse.click(b.x + 500, b.y + 300);
  await page.mouse.click(b.x + 1000, b.y + 600);
  await expect(page.locator('.card-sketch')).toHaveCount(0);
  await app.close();
});

test('export a board as PNG and reopen a recent board from the start screen', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'whiteboard-recent-'));
  const target = path.join(userData, 'reise.json');
  const picture = path.join(userData, 'board.png');
  const env = { ...process.env, WHITEBOARD_E2E: '1', WHITEBOARD_USER_DATA: userData, WHITEBOARD_E2E_SAVE: target, WHITEBOARD_E2E_EXPORT: picture };
  let app = await electron.launch({ args: ['.'], cwd: process.cwd(), env });
  let page = await app.firstWindow();
  await page.getByTestId('tool-note').waitFor({ timeout: 30_000 });
  await addNote(page, 200, 150, 'Reiseplan');
  await page.getByTestId('file-menu').click();
  await page.getByTestId('export-png').click();
  await expect(page.getByTestId('toast')).toContainText('board.png');
  const png = readFileSync(picture);
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.length).toBeGreaterThan(2000);
  await expect(page.getByTestId('zoom-dock')).toBeVisible();
  await page.keyboard.press('Control+S');
  await expect(page.getByTestId('save-state')).toHaveText('Alle Änderungen gespeichert');
  await app.close();

  app = await electron.launch({ args: ['.'], cwd: process.cwd(), env: { ...env, WHITEBOARD_E2E_SAVE: '' } });
  page = await app.firstWindow();
  await page.getByTestId('tool-note').waitFor({ timeout: 30_000 });
  const banner = page.getByTestId('recovery-banner');
  if (await banner.isVisible()) await banner.getByRole('button', { name: 'Verwerfen' }).click();
  await expect(page.getByTestId('recent-start-entry')).toContainText('reise.json');
  await page.getByTestId('recent-start-entry').click();
  await expect(page.locator('.text-note', { hasText: 'Reiseplan' })).toBeVisible();
  await expect(page.getByTestId('save-state')).toHaveText('Alle Änderungen gespeichert');
  await app.close();
});

test('bend a line with its middle handle; double-click straightens it', async () => {
  const { app, page } = await launch();
  const b = await pane(page);
  await page.getByTestId('tool-line').click();
  await page.mouse.move(b.x + 150, b.y + 300);
  await page.mouse.down();
  await page.mouse.move(b.x + 550, b.y + 300, { steps: 6 });
  await page.mouse.up();
  const line = page.getByTestId('canvas-line');
  await line.click({ force: true });
  const handle = (await page.getByTestId('line-bend').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 120, { steps: 6 });
  await page.mouse.up();
  const d = () => line.locator('path[data-line-path]').getAttribute('d');
  await expect.poll(d).toContain(' Q ');
  await page.getByTestId('line-bend').dblclick();
  await expect.poll(d).toContain(' L ');
  await page.keyboard.press('Control+Z');
  await expect.poll(d).toContain(' Q ');
  await app.close();
});

test('shapes and colour swatches from the More menu', async () => {
  const { app, page } = await launch();
  await page.getByTestId('tool-more').click();
  await page.getByTestId('shape-ellipse').click();
  await page.getByTestId('shape-editor').fill('Ziel');
  await page.keyboard.press('Escape');
  const shape = page.locator('.card-shape');
  await expect(shape).toHaveAttribute('data-shape', 'ellipse');
  await expect(shape.locator('.shape-text')).toHaveText('Ziel');
  await page.locator('.react-flow__node:has(.card-shape)').click();
  await page.getByTestId('color-purple').click();
  await expect(shape).toHaveAttribute('data-color', 'purple');

  await page.getByTestId('tool-more').click();
  await page.getByTestId('more-swatch').click();
  await page.getByTestId('swatch-label').fill('Meerblau');
  await page.keyboard.press('Enter');
  const swatch = page.locator('.card-swatch');
  await expect(swatch.locator('.swatch-label')).toHaveText('Meerblau');
  await expect(page.getByTestId('swatch-hex')).toHaveText('#2F5D9B');
  await page.getByTestId('swatch-hex').click();
  await expect(page.getByTestId('toast')).toContainText('#2F5D9B');

  await page.keyboard.press('Control+F');
  await page.getByTestId('search-input').fill('meerblau');
  await expect(page.getByTestId('search-hit')).toContainText('Farbe');
  await app.close();
});

test('dragging a card near another snaps it into line and shows a guide; Alt places freely', async () => {
  const { app, page } = await launch();
  await addNote(page, 200, 150, 'Fest');
  await addNote(page, 600, 400, 'Bewegt');
  const moving = page.locator('.react-flow__node:has(.text-note)').last();
  const fixed = page.locator('.text-note').first();
  const fixedY = Number(await fixed.getAttribute('data-model-y'));
  const box = (await moving.boundingBox())!;
  const fixedBox = (await page.locator('.react-flow__node:has(.text-note)').first().boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 20);
  await page.mouse.down();
  // Start the drag with a small move (React Flow uses the first move as its threshold),
  // then aim 4 px below the fixed card's top edge: the card should snap to it.
  await page.mouse.move(box.x + 30, box.y + 30, { steps: 3 });
  const during = (await moving.boundingBox())!;
  const pointerY = box.y + 30 + (fixedBox.y + 4 - during.y);
  await page.mouse.move(box.x + 30, pointerY, { steps: 12 });
  await expect(page.getByTestId('snap-guide').first()).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId('snap-guide')).toHaveCount(0);
  await expect.poll(async () => Number(await page.locator('.text-note').last().getAttribute('data-model-y'))).toBe(fixedY);

  const again = (await moving.boundingBox())!;
  await page.keyboard.down('Alt');
  await page.mouse.move(again.x + 30, again.y + 20);
  await page.mouse.down();
  await page.mouse.move(again.x + 30, again.y + 30, { steps: 3 });
  await page.mouse.move(again.x + 30, again.y + 40, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  // With Alt held the card stays a few pixels off the line instead of snapping back.
  await expect.poll(async () => Number(await page.locator('.text-note').last().getAttribute('data-model-y')) - fixedY).toBeGreaterThan(2);
  await app.close();
});

test('export as PDF, open a board given on the command line, load a dropped board file', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'whiteboard-pdf-'));
  const board = path.join(userData, 'start.focusboard');
  const picture = path.join(userData, 'board.png');
  // Build a small board file through the app's own save first.
  let app = await electron.launch({ args: ['.'], cwd: process.cwd(), env: { ...process.env, WHITEBOARD_E2E: '1', WHITEBOARD_USER_DATA: userData, WHITEBOARD_E2E_SAVE: board, WHITEBOARD_E2E_EXPORT: picture } });
  let page = await app.firstWindow();
  await page.getByTestId('tool-note').waitFor({ timeout: 30_000 });
  await addNote(page, 200, 150, 'Aus der Kommandozeile');
  await page.getByTestId('file-menu').click();
  await page.getByTestId('export-pdf').click();
  await expect(page.getByTestId('toast')).toContainText('board.pdf');
  expect(readFileSync(path.join(userData, 'board.pdf')).subarray(0, 5).toString()).toBe('%PDF-');
  await page.keyboard.press('Control+S');
  await expect(page.getByTestId('save-state')).toHaveText('Alle Änderungen gespeichert');
  const json = readFileSync(board, 'utf8');
  await app.close();

  app = await electron.launch({ args: ['.', board], cwd: process.cwd(), env: { ...process.env, WHITEBOARD_E2E: '1', WHITEBOARD_USER_DATA: mkdtempSync(path.join(tmpdir(), 'whiteboard-arg-')) } });
  page = await app.firstWindow();
  await expect(page.locator('.text-note', { hasText: 'Aus der Kommandozeile' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('save-state')).toHaveText('Alle Änderungen gespeichert');
  await page.getByTestId('file-menu').click();
  await page.getByTestId('file-menu').click();
  await app.close();

  app = await electron.launch({ args: ['.'], cwd: process.cwd(), env: { ...process.env, WHITEBOARD_E2E: '1', WHITEBOARD_USER_DATA: mkdtempSync(path.join(tmpdir(), 'whiteboard-drop-')) } });
  page = await app.firstWindow();
  await page.getByTestId('tool-note').waitFor({ timeout: 30_000 });
  const b = await pane(page);
  await page.evaluate(
    ([text, x, y]) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], 'geteilt.focusboard', { type: '' }));
      const target = document.querySelector('.flow-shell')!;
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: transfer }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: transfer }));
    },
    [json, b.x + 300, b.y + 300] as const,
  );
  await expect(page.locator('.text-note', { hasText: 'Aus der Kommandozeile' })).toBeVisible();
  await expect(page.getByTestId('toast')).toContainText('geteilt.focusboard');
  await app.close();
});

test('comments and tables from the More menu', async () => {
  const { app, page } = await launch();
  await page.getByTestId('tool-more').click();
  await page.getByTestId('more-comment').click();
  await page.keyboard.type('Bitte nachfragen');
  await page.keyboard.press('Escape');
  await expect(page.locator('.text-comment .card-copy')).toHaveText('Bitte nachfragen');

  await page.getByTestId('tool-more').click();
  await page.getByTestId('more-table').click();
  const table = page.locator('.card-table');
  await expect(table).toHaveAttribute('data-rows', '3');
  await expect(page.getByLabel('Zeile 1, Spalte 1')).toBeFocused();
  await page.keyboard.type('Name');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Preis');
  await page.keyboard.press('Enter');
  await page.keyboard.type('5 €');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(table).toHaveAttribute('data-rows', '4');
  await expect(page.getByLabel('Zeile 4, Spalte 2')).toBeFocused();
  await expect(page.getByLabel('Zeile 2, Spalte 2')).toHaveValue('5 €');
  await page.locator('.react-flow__node:has(.card-table)').click({ position: { x: 4, y: 4 } });
  await page.getByTestId('table-add-col').click();
  await expect(table).toHaveAttribute('data-cols', '4');
  await page.keyboard.press('Control+Z');
  await expect(table).toHaveAttribute('data-cols', '3');

  await page.keyboard.press('Control+F');
  await page.getByTestId('search-input').fill('preis');
  await expect(page.getByTestId('search-hit')).toContainText('Tabelle');
  await page.getByTestId('search-input').fill('nachfragen');
  await expect(page.getByTestId('search-hit')).toContainText('Kommentar');
  await app.close();
});

async function dropFiles(page: Page, files: { name: string; text: string; type?: string }[], x: number, y: number) {
  await page.evaluate(
    ([list, px, py]) => {
      const transfer = new DataTransfer();
      for (const file of list) transfer.items.add(new File([file.text], file.name, { type: file.type ?? '' }));
      const target = document.querySelector('.flow-shell')!;
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: px, clientY: py, dataTransfer: transfer }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: px, clientY: py, dataTransfer: transfer }));
    },
    [files, x, y] as const,
  );
}

test('attach documents; programs and scripts are refused; open and save attachments', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'whiteboard-attach-'));
  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: { ...process.env, WHITEBOARD_E2E: '1', WHITEBOARD_USER_DATA: userData, WHITEBOARD_E2E_EXPORT: path.join(userData, 'export.png') },
  });
  const page = await app.firstWindow();
  await page.getByTestId('tool-note').waitFor({ timeout: 30_000 });
  const b = await pane(page);
  await dropFiles(page, [{ name: 'Angebot.pdf', text: '%PDF-1.4 test' }, { name: 'liste.txt', text: 'Milch\nBrot' }, { name: 'virus.exe', text: 'MZ' }, { name: 'skript.js', text: 'alert(1)' }], b.x + 200, b.y + 150);
  await expect(page.locator('.card-file')).toHaveCount(2);
  await expect(page.locator('.banner')).toContainText('virus.exe, skript.js');
  await expect(page.locator('.card-file[data-name="Angebot.pdf"]')).toContainText('PDF');
  await page.locator('.card-file[data-name="Angebot.pdf"]').getByTestId('file-open').click();
  await expect(page.locator('.banner')).not.toContainText('nicht geöffnet');
  await page.locator('.card-file[data-name="liste.txt"]').getByTestId('file-save').click();
  await expect(page.getByTestId('toast')).toContainText('liste.txt');
  expect(readFileSync(path.join(userData, 'liste.txt'), 'utf8')).toBe('Milch\nBrot');
  await page.keyboard.press('Control+F');
  await page.getByTestId('search-input').fill('angebot');
  await expect(page.getByTestId('search-hit')).toContainText('Datei');
  await app.close();
});

test('deleted cards go to the trash and can be restored after a restart', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'whiteboard-trash-'));
  const env = { ...process.env, WHITEBOARD_E2E: '1', WHITEBOARD_USER_DATA: userData };
  let app = await electron.launch({ args: ['.'], cwd: process.cwd(), env });
  let page = await app.firstWindow();
  await page.getByTestId('tool-note').waitFor({ timeout: 30_000 });
  await addNote(page, 200, 150, 'Wichtige Idee');
  await page.locator('.react-flow__node:has(.text-note)').click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.text-note')).toHaveCount(0);
  await app.close();

  app = await electron.launch({ args: ['.'], cwd: process.cwd(), env });
  page = await app.firstWindow();
  await page.getByTestId('tool-note').waitFor({ timeout: 30_000 });
  const banner = page.getByTestId('recovery-banner');
  if (await banner.isVisible()) await banner.getByRole('button', { name: 'Verwerfen' }).click();
  await page.getByTestId('file-menu').click();
  await page.getByTestId('open-trash').click();
  await expect(page.getByTestId('trash-entry')).toContainText('Wichtige Idee');
  await page.getByTestId('trash-restore').click();
  await expect(page.locator('.text-note', { hasText: 'Wichtige Idee' })).toBeVisible();
  await expect(page.getByTestId('trash-entry')).toHaveCount(0);
  await expect(page.locator('.search-empty')).toHaveText('Der Papierkorb ist leer.');
  await app.close();
});

test('undoing a deletion takes it out of the trash, redo puts it back', async () => {
  const { app, page } = await launch();
  await addNote(page, 200, 150, 'Hin und her');
  await page.locator('.react-flow__node:has(.text-note)').click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.text-note')).toHaveCount(0);
  const trashCount = async () => {
    await page.getByTestId('file-menu').click();
    await page.getByTestId('open-trash').click();
    const count = await page.getByTestId('trash-entry').count();
    await page.getByRole('button', { name: 'Papierkorb schließen' }).click();
    return count;
  };
  await expect.poll(trashCount).toBe(1);
  await page.keyboard.press('Control+Z');
  await expect(page.locator('.text-note')).toHaveCount(1);
  await expect.poll(trashCount).toBe(0);
  await page.keyboard.press('Control+Y');
  await expect(page.locator('.text-note')).toHaveCount(0);
  await expect.poll(trashCount).toBe(1);
  await app.close();
});

test('several selected cards dragged onto a column all go into it', async () => {
  const { app, page } = await launch();
  const b = await pane(page);
  await page.getByTestId('tool-column').click();
  await page.mouse.click(b.x + 700, b.y + 80);
  await addNote(page, 100, 300, 'Eins');
  await addNote(page, 100, 520, 'Zwei');
  await page.locator('.react-flow__node:has(.text-note)').first().click();
  await page.keyboard.down('Shift');
  await page.locator('.react-flow__node:has(.text-note)').last().click();
  await page.keyboard.up('Shift');
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  const first = (await page.locator('.react-flow__node:has(.text-note)').first().boundingBox())!;
  const column = (await page.locator('.react-flow__node:has(.card-column)').boundingBox())!;
  await page.mouse.move(first.x + 30, first.y + 20);
  await page.mouse.down();
  await page.mouse.move(first.x + 40, first.y + 30, { steps: 3 });
  await page.mouse.move(column.x + column.width / 2, column.y + column.height - 10, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('.text-note[data-column=""]')).toHaveCount(0);
  await expect(page.locator('.card-column')).toHaveAttribute('data-children', /\S+ \S+/);
  await app.close();
});

test('a long, realistic session runs without a single script error', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'whiteboard-journey-'));
  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: { ...process.env, WHITEBOARD_E2E: '1', WHITEBOARD_USER_DATA: userData, WHITEBOARD_E2E_SAVE: path.join(userData, 'reise.focusboard'), WHITEBOARD_E2E_EXPORT: path.join(userData, 'reise.png') },
  });
  const page = await app.firstWindow();
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  await page.getByTestId('tool-note').waitFor({ timeout: 30_000 });
  const b = await pane(page);
  const pick = async (testId: string) => {
    await page.getByTestId('tool-more').click();
    await page.getByTestId(testId).click();
  };

  // Plan a trip like a real user would.
  await page.getByTestId('tool-more').click();
  await page.getByTestId('template-kanban').click();
  await page.keyboard.press('Escape');
  await page.mouse.dblclick(b.x + 1000, b.y + 120);
  await expect(page.getByTestId('card-editor')).toBeFocused();
  await page.keyboard.type('# Packliste\n- Pass\n- **Ladekabel**');
  await page.keyboard.press('Escape');
  await page.keyboard.press('b');
  await page.mouse.click(b.x + 1000, b.y + 420);
  await page.keyboard.type('Unterkünfte');
  await page.keyboard.press('Enter');
  await page.locator('.react-flow__node:has(.card-board)').dblclick({ position: { x: 20, y: 20 } });
  await page.keyboard.press('k');
  await page.mouse.click(b.x + 200, b.y + 200);
  await page.getByTestId('link-input').fill('www.example.com/hotel');
  await page.keyboard.press('Enter');
  await pick('more-table');
  await page.keyboard.type('Hotel');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Preis');
  await page.keyboard.press('Escape');
  await page.getByTestId('brand-home').click();
  await expect(page.locator('.crumb')).toHaveCount(1);

  // Draw, comment, shape, swatch, attach, line.
  await page.keyboard.press('p');
  await page.mouse.click(b.x + 600, b.y + 450);
  const surface = (await page.getByTestId('sketch-surface').boundingBox())!;
  await page.mouse.move(surface.x + 20, surface.y + 20);
  await page.mouse.down();
  await page.mouse.move(surface.x + 150, surface.y + 120, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press('Escape');
  await pick('more-comment');
  await page.keyboard.type('Visum prüfen');
  await page.keyboard.press('Escape');
  await pick('shape-diamond');
  await page.keyboard.type('Budget?');
  await page.keyboard.press('Escape');
  await pick('more-swatch');
  await page.keyboard.press('Enter');
  await dropFiles(page, [{ name: 'Buchung.pdf', text: '%PDF-1.4' }], b.x + 300, b.y + 600);
  await page.getByTestId('tool-line').click();
  await page.mouse.move(b.x + 120, b.y + 650);
  await page.mouse.down();
  await page.mouse.move(b.x + 420, b.y + 700, { steps: 6 });
  await page.mouse.up();

  // Copy, paste, duplicate, delete, undo, redo, search, zoom, theme, font, minimap, save, export.
  await page.locator('.react-flow__node:has(.text-note)').last().click();
  await page.keyboard.press('Control+C');
  await page.mouse.move(b.x + 900, b.y + 650);
  await page.keyboard.press('Control+V');
  await page.keyboard.press('Control+D');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Control+Z');
  await page.keyboard.press('Control+Y');
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+F');
  await page.getByTestId('search-input').fill('hotel');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Titel dieses Boards')).toHaveValue('Unterkünfte');
  await page.keyboard.press('Escape');
  await page.getByTestId('brand-home').click();
  await page.getByTestId('zoom-fit').click();
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('font-toggle').click();
  await page.getByTestId('minimap-toggle').click();
  await page.keyboard.press('Control+S');
  await expect(page.getByTestId('save-state')).toHaveText('Alle Änderungen gespeichert');
  await page.getByTestId('file-menu').click();
  await page.getByTestId('export-png').click();
  await expect(page.getByTestId('toast')).toContainText('reise.png');

  // The saved file opens again and is valid.
  const saved = readFileSync(path.join(userData, 'reise.focusboard'), 'utf8');
  expect(saved).toContain('Packliste');
  expect(saved).toContain('Buchung.pdf');

  expect(problems).toEqual([]);
  await app.close();
});

test('the undo button works while writing: it ends editing and takes the typing back', async () => {
  const { app, page } = await launch();
  await addNote(page, 200, 150, 'Bleibt');
  await page.locator('.text-note').dblclick();
  await expect(page.getByTestId('card-editor')).toBeFocused();
  await page.keyboard.type(' und weg');
  await expect(page.getByTestId('undo')).toBeEnabled();
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('card-editor')).toHaveCount(0);
  await expect(page.locator('.text-note .card-copy')).toHaveText('Bleibt');
  await page.getByTestId('redo').click();
  await expect(page.locator('.text-note .card-copy')).toHaveText('Bleibt und weg');
  await app.close();
});
