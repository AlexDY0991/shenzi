// 展示页脚本：机制插图直接复用游戏的绘制代码，保证和游戏里一模一样
import { ropeCurve } from '../src/core/geometry';
import { LEVELS } from '../src/game/levels';
import { yarnColor } from '../src/render/colors';
import { drawLock, drawKitten } from '../src/render/mechanics';
import { pawPrint } from '../src/render/shapes';
import { drawButton, drawYarn } from '../src/render/yarn';

type Ctx = CanvasRenderingContext2D;

function setup(canvas: HTMLCanvasElement): { ctx: Ctx; w: number; h: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

/** 背景上淡淡的猫爪印 */
function drawPaws(): void {
  const c = document.getElementById('paws') as HTMLCanvasElement;
  c.style.width = '100%';
  c.style.height = '100%';
  const { ctx, w, h } = setup(c);
  ctx.clearRect(0, 0, w, h);
  let row = 0;
  for (let y = 30; y < h + 80; y += 70, row++) {
    for (let x = (row % 2) * 50 + 20; x < w + 80; x += 100) {
      pawPrint(ctx, x, y, 12, 'rgba(240,180,160,0.22)', ((x * 7 + y * 13) % 10) / 10 - 0.5);
    }
  }
}

function yarnBetween(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color: string): void {
  const u = 50;
  const pts = ropeCurve(x1 / u, y1 / u, x2 / u, y2 / u).map((p) => ({ x: p.x * u, y: p.y * u }));
  drawYarn(ctx, pts, color, { width: 9 });
}

function drawMech(canvas: HTMLCanvasElement, kind: string, t: number): void {
  const { ctx, w, h } = setup(canvas);
  ctx.clearRect(0, 0, w, h);
  // 插图按 150×96 设计，窄卡片里等比缩小
  const k = Math.min(1, w / 150, h / 96);
  ctx.translate(w / 2, h / 2 + 6);
  ctx.scale(k, k);
  const cx = 0;
  const cy = 0;
  if (kind === 'fixed') {
    yarnBetween(ctx, cx - 50, cy + 14, cx + 46, cy - 18, yarnColor(6));
    drawButton(ctx, cx - 50, cy + 14, 15, yarnColor(6), { sewn: true });
    drawButton(ctx, cx + 46, cy - 18, 15, yarnColor(6), { lift: (Math.sin(t * 2) + 1) / 2 });
  } else if (kind === 'sleepers') {
    yarnBetween(ctx, cx - 56, cy + 4, cx + 56, cy + 4, yarnColor(5));
    drawButton(ctx, cx - 56, cy + 4, 14, yarnColor(5));
    drawButton(ctx, cx + 56, cy + 4, 14, yarnColor(5));
    drawKitten(ctx, cx, cy - 2, 24, t, 2);
  } else {
    drawLock(ctx, cx - 30, cy, 18, yarnColor(7), t);
    yarnBetween(ctx, cx + 6, cy - 22, cx + 58, cy + 18, yarnColor(7));
    drawButton(ctx, cx + 6, cy - 22, 13, yarnColor(7));
    drawButton(ctx, cx + 58, cy + 18, 13, yarnColor(7));
  }
}

// 各机制从第几关开始出现，以关卡数据为准
for (const el of document.querySelectorAll<HTMLElement>('[data-from]')) {
  const key = el.dataset.from as 'fixed' | 'sleepers' | 'locks';
  const i = LEVELS.findIndex((lv) => (lv[key]?.length ?? 0) > 0);
  if (i >= 0) el.textContent = `第 ${i + 1} 关起`;
}

const mechs = [...document.querySelectorAll<HTMLCanvasElement>('canvas[data-mech]')];
const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function frame(now: number): void {
  for (const c of mechs) drawMech(c, c.dataset.mech!, now / 1000);
  if (!still) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
drawPaws();
window.addEventListener('resize', drawPaws);

// 试玩页带上版本号，避免浏览器拿缓存里的旧版
const playUrl = `play.html?v=${encodeURIComponent(__BUILD__)}`;
(document.getElementById('play-link') as HTMLAnchorElement).href = playUrl;
document.getElementById('build')!.textContent = __BUILD__;
document.querySelectorAll<HTMLAnchorElement>('a[data-proto]').forEach((a) => {
  a.href = `${a.getAttribute('href')}?v=${encodeURIComponent(__BUILD__)}`;
});

// 只有宽屏才在页面里嵌入试玩（窄屏直接点按钮进全屏试玩页）
const wide = window.matchMedia('(min-width: 861px)');
const frameEl = document.getElementById('play-frame') as HTMLIFrameElement;
const loadFrame = () => {
  if (wide.matches && !frameEl.src) frameEl.src = playUrl;
};
loadFrame();
wide.addEventListener('change', loadFrame);

// 桌面端显示二维码，方便手机扫码
declare const qrcode: undefined | ((type: number, level: string) => { addData(s: string): void; make(): void; createSvgTag(o: object): string });
if (typeof qrcode === 'function' && window.matchMedia('(min-width: 861px)').matches) {
  try {
    const q = qrcode(0, 'M');
    q.addData(new URL('play.html', location.href).href);
    q.make();
    document.getElementById('qr-code')!.innerHTML = q.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
    document.getElementById('qr')!.hidden = false;
  } catch {
    // 生成失败就不显示二维码
  }
}
