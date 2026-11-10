import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const axe = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
// Independent accessibility and usability check with axe-core (WCAG 2.1 rules) on the main screens.
test('no axe-core violations on the main screens, light and dark', async () => {
  const app = await electron.launch({ args: ['.'], cwd: process.cwd(), env: { ...process.env, WHITEBOARD_E2E: '1', WHITEBOARD_USER_DATA: mkdtempSync(path.join(tmpdir(), 'a-')) } });
  const page = await app.firstWindow();
  await page.getByTestId('tool-note').waitFor();
  // Measure the settled screens, not half-faded menus (also covers the reduced-motion setting).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addScriptTag({ content: axe });
  const report: Record<string, unknown> = {};
  const run = async (name: string) => {
    report[name] = await page.evaluate(async () => {
      const result = await (window as any).axe.run(document, { resultTypes: ['violations'] });
      return result.violations.map((v: any) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n: any) => n.target.join(' ')) }));
    });
  };
  await run('leer');
  await page.getByTestId('tool-more').click(); await page.getByTestId('template-kanban').click(); await page.keyboard.press('Escape');
  await page.getByTestId('tool-more').click();
  await run('mehr-menue');
  await page.keyboard.press('Escape'); await page.mouse.click(5, 300);
  await page.getByTestId('tool-todo').click(); const b = (await page.locator('.react-flow__pane').boundingBox())!; await page.mouse.click(b.x + 900, b.y + 400);
  await page.getByTestId('tool-more').click(); await page.getByTestId('more-table').click(); await page.keyboard.press('Escape');
  await page.locator('.react-flow__node:has(.text-note)').first().click();
  await run('karten');
  await page.locator('.react-flow__node:has(.text-note)').first().click({ button: 'right' });
  await run('kontextmenue');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+K');
  await run('befehle');
  await page.keyboard.press('Escape');
  await page.getByTestId('theme-toggle').click();
  await run('dunkel');
  expect(report).toEqual({ leer: [], 'mehr-menue': [], karten: [], kontextmenue: [], befehle: [], dunkel: [] });
  await app.close();
});
