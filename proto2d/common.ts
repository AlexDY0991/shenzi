// 新玩法样张共用的小运行时：画布、循环、按钮、粒子、结算面板。
// 只依赖 Platform 接口，以后接微信小游戏时换成 wechat 平台即可。
import { createWebPlatform } from '../src/platform/web';
import { Ctx2D, Platform, ScreenInfo } from '../src/platform/types';
import { THEME, shade } from '../src/render/colors';
import { fillCircle, pawPrint, roundRectPath, star, text } from '../src/render/shapes';
import { panel, pillButton, roundButton, iconRestart } from '../src/render/ui';

export interface Game {
  resize(s: ScreenInfo): void;
  update(dt: number): void;
  draw(ctx: Ctx2D): void;
  /** 返回 true 表示已处理（按钮优先） */
  down(x: number, y: number): void;
  move?(x: number, y: number): void;
  up?(x: number, y: number): void;
}

export function run(make: (p: Platform) => Game): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const p = createWebPlatform(canvas);
  const g = make(p);
  (globalThis as unknown as { __game: Game }).__game = g; // 调试用
  let info = p.getScreenInfo();
  g.resize(info);
  p.onResize(() => {
    info = p.getScreenInfo();
    g.resize(info);
  });
  p.onTouch({
    start: (x, y) => g.down(x, y),
    move: (x, y) => g.move?.(x, y),
    end: (x, y) => g.up?.(x, y),
  });
  const ctx = p.screen.ctx;
  let last = p.now();
  const frame = (t: number) => {
    const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
    last = t;
    g.update(dt);
    if (info.width > 0 && info.height > 0) {
      ctx.setTransform(info.dpr, 0, 0, info.dpr, 0, 0);
      g.draw(ctx);
    }
    p.requestFrame(frame);
  };
  p.requestFrame(frame);

  // 和正式版一样：发现自己是旧版本就自动刷新
  fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((v: { build?: string } | null) => {
      if (!v || !v.build || v.build === __BUILD__) return;
      const url = new URL(location.href);
      if (url.searchParams.get('v') === v.build) return;
      url.searchParams.set('v', v.build);
      location.replace(url.toString());
    })
    .catch(() => undefined);
}

// ---------- 缓动 ----------
export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);
export const easeIn = (t: number) => t * t;
/** 弹簧回弹：t 从 0 到 1，返回带过冲的 0→1 */
export const backOut = (t: number) => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

// ---------- 按钮 ----------
export interface Btn {
  x: number;
  y: number;
  w: number;
  h: number;
  onTap: () => void;
}

export class Buttons {
  private list: Btn[] = [];
  pressed: Btn | null = null;
  clear(): void {
    this.list = [];
  }
  add(b: Btn): Btn {
    this.list.push(b);
    return b;
  }
  /** 按下就触发（手感更跟手，iOS 触感也必须在触摸事件里同步调用） */
  down(x: number, y: number): boolean {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        this.pressed = b;
        b.onTap();
        return true;
      }
    }
    return false;
  }
  up(): void {
    this.pressed = null;
  }
  isPressed(b: Btn | null): boolean {
    return !!b && this.pressed === b;
  }
}

// ---------- 粒子 / 飘字 ----------
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  kind: 'dot' | 'paw' | 'star' | 'heart';
  s: number;
  rot: number;
  vr: number;
}

interface FloatText {
  x: number;
  y: number;
  str: string;
  color: string;
  size: number;
  life: number;
  max: number;
}

export class Fx {
  parts: Particle[] = [];
  texts: FloatText[] = [];
  burst(x: number, y: number, color: string, n = 10, speed = 160, kind: Particle['kind'] = 'dot', s = 4): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      const max = 0.5 + Math.random() * 0.5;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life: max, max, color, kind, s: s * (0.7 + Math.random() * 0.6), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8 });
    }
  }
  confetti(w: number, colors: string[]): void {
    for (let i = 0; i < 70; i++) {
      const max = 1.6 + Math.random() * 1.2;
      const kinds: Particle['kind'][] = ['paw', 'star', 'heart', 'dot'];
      this.parts.push({
        x: Math.random() * w,
        y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 60,
        vy: 80 + Math.random() * 120,
        life: max,
        max,
        color: colors[i % colors.length],
        kind: kinds[i % kinds.length],
        s: 6 + Math.random() * 5,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 4,
      });
    }
  }
  float(x: number, y: number, str: string, color: string, size = 18): void {
    this.texts.push({ x, y, str, color, size, life: 0.9, max: 0.9 });
  }
  update(dt: number): void {
    for (const p of this.parts) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.kind === 'dot' ? 420 : 60) * dt;
      p.rot += p.vr * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= 46 * dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
  }
  draw(ctx: Ctx2D): void {
    for (const p of this.parts) {
      ctx.globalAlpha = clamp(p.life / p.max / 0.3);
      if (p.kind === 'dot') fillCircle(ctx, p.x, p.y, p.s * (p.life / p.max), p.color);
      else if (p.kind === 'paw') pawPrint(ctx, p.x, p.y, p.s, p.color, p.rot);
      else if (p.kind === 'star') star(ctx, p.x, p.y, p.s, p.color);
      else heartShape(ctx, p.x, p.y, p.s, p.color);
    }
    ctx.globalAlpha = 1;
    for (const t of this.texts) {
      const k = t.life / t.max;
      const pop = k > 0.8 ? backOut((1 - k) / 0.2) : 1;
      ctx.globalAlpha = clamp(k / 0.3);
      text(ctx, t.str, t.x, t.y, t.size * pop, t.color, { stroke: '#FFFFFF', strokeW: 4 });
    }
    ctx.globalAlpha = 1;
  }
}

export function heartShape(ctx: Ctx2D, x: number, y: number, s: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.1, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
  ctx.fillStyle = color;
  ctx.fill();
}

// ---------- 背景 ----------
export function drawCozyBackground(ctx: Ctx2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, THEME.bgTop);
  g.addColorStop(0.55, THEME.bg);
  g.addColorStop(1, '#FFEFD9');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // 淡淡的爪印
  for (let i = 0; i < 14; i++) {
    const x = ((i * 97) % 100) / 100 * w;
    const y = ((i * 61 + 13) % 100) / 100 * h;
    pawPrint(ctx, x, y, 9, THEME.bgPaw, i * 0.7);
  }
}

// ---------- 顶栏 ----------
export function topBar(ctx: Ctx2D, w: number, top: number, title: string, sub: string): void {
  text(ctx, title, w / 2, top + 20, 20, THEME.text, { stroke: '#FFFFFF', strokeW: 5 });
  text(ctx, sub, w / 2, top + 44, 12.5, THEME.textLight, { weight: '600' });
}

export function restartButton(ctx: Ctx2D, btns: Buttons, x: number, y: number, onTap: () => void): void {
  const b = btns.add({ x: x - 22, y: y - 22, w: 44, h: 44, onTap });
  roundButton(ctx, x, y, 20, btns.isPressed(b));
  iconRestart(ctx, x, y + (btns.isPressed(b) ? 2.5 : 0), 18);
}

// ---------- 结算面板 ----------
export interface EndPanelOpts {
  win: boolean;
  title: string;
  lines: string[];
  stars?: number;
  primary: { label: string; onTap: () => void };
  secondary?: { label: string; onTap: () => void };
  /** 0~1 出场动画进度 */
  t: number;
}

export function endPanel(ctx: Ctx2D, btns: Buttons, w: number, h: number, o: EndPanelOpts): void {
  ctx.fillStyle = `rgba(80,50,25,${0.38 * clamp(o.t * 2)})`;
  ctx.fillRect(0, 0, w, h);
  const pw = Math.min(310, w - 40);
  const ph = o.secondary ? 300 : 250;
  const k = backOut(clamp(o.t));
  const x = (w - pw) / 2;
  const y = h / 2 - ph / 2 + (1 - k) * 60;
  ctx.save();
  ctx.globalAlpha = clamp(o.t * 3);
  panel(ctx, x, y, pw, ph, 26);
  let cy = y + 44;
  if (o.stars !== undefined) {
    for (let i = 0; i < 3; i++) {
      const on = i < o.stars;
      const sk = backOut(clamp(o.t * 3 - 1 - i * 0.35));
      const sx = w / 2 + (i - 1) * 48;
      const sy = cy - (i === 1 ? 8 : 0);
      if (sk > 0) star(ctx, sx, sy, (i === 1 ? 22 : 18) * sk, on ? '#F7C24A' : '#EADBC8', on ? '#D9962B' : '#D8C6AE');
    }
    cy += 46;
  }
  text(ctx, o.title, w / 2, cy, 24, o.win ? THEME.accent : THEME.danger, { stroke: '#FFFFFF', strokeW: 5 });
  cy += 34;
  for (const l of o.lines) {
    text(ctx, l, w / 2, cy, 14, THEME.textLight, { weight: '600' });
    cy += 22;
  }
  const bw = pw - 70;
  const by = y + ph - (o.secondary ? 122 : 70);
  const pb = btns.add({ x: x + 35, y: by, w: bw, h: 48, onTap: o.primary.onTap });
  pillButton(ctx, x + 35, by, bw, 48, o.primary.label, o.win ? '#79C267' : THEME.accent, btns.isPressed(pb));
  if (o.secondary) {
    const sb = btns.add({ x: x + 35, y: by + 60, w: bw, h: 44, onTap: o.secondary.onTap });
    pillButton(ctx, x + 35, by + 60, bw, 44, o.secondary.label, '#5B8FE0', btns.isPressed(sb));
  }
  ctx.restore();
}

/** 小标签：圆角底 + 文字 */
export function chip(ctx: Ctx2D, cx: number, cy: number, label: string, color = THEME.panel, fg = THEME.text): void {
  ctx.font = `bold 13px sans-serif`;
  const w = Math.max(44, ctx.measureText(label).width + 22);
  roundRectPath(ctx, cx - w / 2, cy - 13 + 2, w, 26, 13);
  ctx.fillStyle = shade('#C88A5A', 0, 0.18);
  ctx.fill();
  roundRectPath(ctx, cx - w / 2, cy - 13, w, 26, 13);
  ctx.fillStyle = color;
  ctx.fill();
  text(ctx, label, cx, cy + 0.5, 13, fg);
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
