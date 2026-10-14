// Deterministic frame renderer: Playwright (pre-installed Chromium) -> FFmpeg.
// Usage:
//   node render.js stills <out_dir> <t1> <t2> ...      # PNG stills for inspection
//   node render.js video <out.mp4> [start] [end] [workers]  # silent H.264 video
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const TL = JSON.parse(fs.readFileSync(path.join(SRC, 'timeline.json'), 'utf8'));
const URL = 'file://' + path.join(SRC, 'composition.html');

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: TL.width, height: TL.height }, deviceScaleFactor: 1 });
  await page.addInitScript((tl) => { window.TL = tl; }, TL);
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => window.__setup());
  return page;
}

function ffmpegSegment(out) {
  return spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(TL.fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(TL.fps),
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', out],
    { stdio: ['pipe', 'inherit', 'inherit'] });
}

async function renderRange(browser, f0, f1, out) {
  const page = await openPage(browser);
  const ff = ffmpegSegment(out);
  for (let f = f0; f < f1; f++) {
    await page.evaluate((t) => window.render(t), f / TL.fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 96 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if ((f - f0) % 150 === 0) console.log(`[${path.basename(out)}] frame ${f}/${f1}`);
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error('ffmpeg ' + c)))));
  await page.close();
}

(async () => {
  const [mode, out, ...rest] = process.argv.slice(2);
  const browser = await chromium.launch();
  if (mode === 'stills') {
    fs.mkdirSync(out, { recursive: true });
    const page = await openPage(browser);
    for (const ts of rest) {
      await page.evaluate((t) => window.render(t), Number(ts));
      await page.screenshot({ path: path.join(out, `t${String(ts).padStart(5, '0')}.png`) });
    }
  } else {
    const start = Number(rest[0] ?? 0), end = Number(rest[1] ?? TL.duration), workers = Number(rest[2] ?? 4);
    const F0 = Math.round(start * TL.fps), F1 = Math.round(end * TL.fps);
    const per = Math.ceil((F1 - F0) / workers);
    const tmp = path.resolve(out + '.parts'); fs.mkdirSync(tmp, { recursive: true });
    const parts = [];
    const jobs = [];
    for (let i = 0; i < workers; i++) {
      const a = F0 + i * per, b = Math.min(F1, a + per);
      if (a >= b) break;
      const p = path.join(tmp, `part${i}.mp4`); parts.push(p);
      jobs.push(renderRange(browser, a, b, p));
    }
    await Promise.all(jobs);
    fs.writeFileSync(path.join(tmp, 'list.txt'), parts.map((p) => `file '${p}'`).join('\n'));
    await new Promise((r, j) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'), '-c', 'copy', '-movflags', '+faststart', out], { stdio: 'inherit' })
      .on('close', (c) => (c === 0 ? r() : j(new Error('concat ' + c)))));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
