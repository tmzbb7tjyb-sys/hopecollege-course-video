import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outDir = path.join(ROOT, 'preview');
fs.mkdirSync(outDir, { recursive: true });

const times = process.argv.slice(2).map(Number);
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none', '--hide-scrollbars'],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
await page.goto('file://' + path.join(ROOT, 'scene.html'), { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', { timeout: 30000 });
for (const t of times) {
  await page.evaluate((tt) => window.__render(tt), t);
  await page.screenshot({ type: 'jpeg', quality: 92, path: path.join(outDir, `t${String(t).padStart(4, '0')}.jpg`) });
  console.log('snap', t);
}
await browser.close();
