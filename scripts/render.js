// Renders the film frame by frame in headless Chromium and encodes it with
// ffmpeg, then muxes in the synthesised score.
//
//   npm run render                      → out/coolfly-30s.mp4 (1920×1080, 30 fps)
//   npm run render:draft                → half resolution, faster
//   node scripts/render.js --jobs 4               render in 4 parallel chunks
//   node scripts/render.js --from 4 --to 9.5      render a time range only
//   node scripts/render.js --stills 0.8,5,11      PNG stills to out/stills/
//   node scripts/render.js --audio-only           just the score (out/coolfly-30s.wav)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] ?? true : def;
};
const scale = Number(opt('scale', 1));
const out = path.resolve(ROOT, opt('out', 'out/coolfly-30s.mp4'));
const stills = opt('stills', null);
const from = Number(opt('from', 0));
const port = Number(opt('port', 5179));

const CHROMIUM = process.env.CHROMIUM_PATH || findChromium();
function findChromium() {
  const candidates = ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'];
  return candidates.find((p) => fs.existsSync(p));
}

function run(cmd, argv, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: ['ignore', 'inherit', 'inherit'], ...opts });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

const server = await startServer(port);
const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: Math.round(1920 * scale), height: Math.round(1080 * scale) }, deviceScaleFactor: 1 });
// Software WebGL under parallel load can be slow; never give up on a frame.
page.setDefaultTimeout(0);
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', (e) => console.log('[page error]', e.message));
await page.goto(`http://127.0.0.1:${port}/?render&scale=${scale}`);
await page.evaluate(() => window.__video.ready);
const { fps, duration, width, height } = await page.evaluate(() => {
  const v = window.__video;
  return { fps: v.fps, duration: v.duration, width: v.width, height: v.height };
});
const clip = { x: 0, y: 0, width, height };

try {
  if (stills) {
    const dir = path.join(ROOT, 'out/stills');
    fs.mkdirSync(dir, { recursive: true });
    const times = stills === true ? [0.8, 3, 5, 8, 11, 14, 17, 19, 21, 23, 25, 28.5] : String(stills).split(',').map(Number);
    for (const t of times) {
      const id = await page.evaluate((t) => window.__video.renderFrame(t), t);
      const file = path.join(dir, `t${t.toFixed(2).padStart(5, '0')}-${id}.png`);
      await page.screenshot({ path: file, clip });
      console.log('still', file);
    }
  } else {
    const to = Number(opt('to', duration));
    const jobs = Number(opt('jobs', 1));
    const noAudio = args.includes('--no-audio');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const wavPath = out.replace(/\.mp4$/, '.wav');
    if (!noAudio) {
      const b64 = await page.evaluate(() => window.__video.renderAudioWav());
      fs.writeFileSync(wavPath, Buffer.from(b64, 'base64'));
      console.log('music →', path.relative(ROOT, wavPath));
      if (args.includes('--audio-only')) process.exit(0);
    }

    const first = Math.round(from * fps);
    const last = Math.round(to * fps);
    const encode = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'];

    if (jobs > 1) {
      // Split the frame range across child processes, then stitch + add music.
      // Free this process's browser so the workers get all the CPU.
      await browser.close();
      const per = Math.ceil((last - first) / jobs);
      const segs = [];
      for (let j = 0; j < jobs; j++) {
        const a = first + j * per;
        const b = Math.min(last, a + per);
        if (a >= b) break;
        segs.push({ a, b, file: out.replace(/\.mp4$/, `.seg${j}.mp4`) });
      }
      await Promise.all(segs.map((sg, j) => run(process.execPath, [
        fileURLToPath(import.meta.url), '--no-audio', '--scale', String(scale), '--from', String(sg.a / fps), '--to', String(sg.b / fps),
        '--out', sg.file, '--port', String(port + 1 + j),
      ])));
      const list = out.replace(/\.mp4$/, '.segs.txt');
      fs.writeFileSync(list, segs.map((sg) => `file '${sg.file}'`).join('\n'));
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
        '-ss', String(from), '-t', String(to - from), '-i', wavPath,
        '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-shortest', out]);
      for (const sg of segs) fs.rmSync(sg.file);
      fs.rmSync(list);
      console.log('video →', path.relative(ROOT, out));
    } else {
      const audioArgs = noAudio ? [] : ['-ss', String(from), '-t', String(to - from), '-i', wavPath];
      const ff = spawn('ffmpeg', [
        '-y', '-loglevel', 'error',
        '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
        ...audioArgs, ...encode,
        ...(noAudio ? [] : ['-c:a', 'aac', '-b:a', '256k', '-shortest']), '-movflags', '+faststart', out,
      ], { stdio: ['pipe', 'inherit', 'inherit'] });
      const done = new Promise((res, rej) => ff.on('exit', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));

      const t0 = Date.now();
      for (let f = first; f < last; f++) {
        await page.evaluate((t) => window.__video.renderFrame(t), f / fps);
        const png = await page.screenshot({ clip, type: 'png' });
        if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
        if ((f - first) % 30 === 0) {
          const n = f - first + 1;
          const eta = ((Date.now() - t0) / n) * (last - f) / 1000;
          console.log(`frame ${f}/${last}  ~${eta.toFixed(0)} s left`);
        }
      }
      ff.stdin.end();
      await done;
      console.log('video →', path.relative(ROOT, out));
    }
  }
} finally {
  await browser.close();
  server.close();
}
