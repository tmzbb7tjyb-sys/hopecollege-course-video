import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { once } from 'events';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FFMPEG = '/Users/tendays/.local/bin/ffmpeg';
const FPS = 30;
const QUALITY = 88;

// 用法：node render_video.mjs [输出文件名] [起始秒] [结束秒]
const outName = process.argv[2] || '成片.mp4';
const tStart = parseFloat(process.argv[3] || '0');
const tEndArg = process.argv[4] ? parseFloat(process.argv[4]) : null;

const outFile = path.join(ROOT, outName);
const audioFile = path.join(ROOT, 'audio', 'narration.wav');

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none', '--hide-scrollbars'],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
await page.goto('file://' + path.join(ROOT, 'scene.html'), { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', { timeout: 30000 });
const duration = await page.evaluate(() => window.__duration);
const tEnd = Math.min(tEndArg === null ? duration : tEndArg, duration);
const total = Math.ceil((tEnd - tStart) * FPS);
console.log(`渲染 ${tStart.toFixed(2)}s → ${tEnd.toFixed(2)}s，共 ${total} 帧，直通 ffmpeg`);

const args = [
  '-y', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', String(FPS), '-i', 'pipe:0',
];
if (tStart === 0 && tEndArg === null) {
  args.push('-i', audioFile, '-c:a', 'aac', '-b:a', '192k', '-shortest');
} else {
  args.push('-an');
}
args.push('-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', outFile);

const ff = spawn(FFMPEG, args, { stdio: ['pipe', 'ignore', 'pipe'] });
let ffErr = '';
ff.stderr.on('data', d => { ffErr += d.toString(); });

const t0 = Date.now();
for (let i = 0; i < total; i++) {
  const t = tStart + i / FPS;
  await page.evaluate((tt) => window.__render(tt), t);
  const buf = await page.screenshot({ type: 'jpeg', quality: QUALITY });
  if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');
  if (i % 300 === 0) {
    const el = (Date.now() - t0) / 1000;
    console.log(`帧 ${i + 1}/${total} 用时 ${el.toFixed(0)}s 预计剩余 ${((total - i) * el / (i + 1) / 60).toFixed(1)} 分钟`);
  }
}
ff.stdin.end();
await once(ff, 'close');
await browser.close();
if (ffErr.trim()) console.log('ffmpeg 输出：', ffErr.split('\n').slice(-6).join('\n'));
console.log('完成：' + outFile);
