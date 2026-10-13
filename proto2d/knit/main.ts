// 拆毛衣：可玩样张
import { Ctx2D, Platform, ScreenInfo, Surface } from '../../src/platform/types';
import { THEME, shade } from '../../src/render/colors';
import { fillCircle, fillEllipse, roundRectPath, text } from '../../src/render/shapes';
import { Buttons, Fx, Game, backOut, clamp, drawCozyBackground, easeOut, endPanel, lerp, restartButton, run } from '../common';
import { COLORS, Knit, PICTURE, Spool, makeQueue } from './logic';

/** 关卡：线轴队列的随机种子和线轴位数量（离线用随机玩家模拟挑过难度） */
const LEVELS = [
  { seed: 145, slots: 5 },
  { seed: 55, slots: 4 },
  { seed: 31, slots: 4 },
];

interface SpoolView {
  s: Spool;
  got: number;
  reserved: number;
  state: 'queue' | 'in' | 'slot' | 'out' | 'gone';
  col: number;
  slot: number;
  t: number;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  spin: number;
  cd: number;
  bounce: number;
  shake: number;
}

interface Flying {
  cell: number;
  color: string;
  sx: number;
  sy: number;
  sp: SpoolView;
  t: number;
  dur: number;
  bend: number;
}

class KnitGame implements Game {
  private s!: ScreenInfo;
  private btns = new Buttons();
  private fx = new Fx();
  private level = 0;
  private knit!: Knit;
  private total = 0;
  private columns: SpoolView[][] = [];
  private slots: (SpoolView | null)[] = [];
  private spools: SpoolView[] = [];
  private flying: Flying[] = [];
  private time = 0;
  private stuckT = 0;
  private slotFlash = 0;
  private revives = 0;
  private result: 'win' | 'lose' | null = null;
  private resultT = 0;
  private resultDelay = 0;
  private tutorial = true;
  private lastTick = 0;
  private sprites = new Map<string, Surface>();
  private spriteKey = '';
  // 布局
  private cw = 24;
  private ch = 22;
  private px = 0;
  private py = 0;
  private W = 48;
  private H = 58;
  private shelfY = 0;
  private queueY = 0;
  private colX: number[] = [];

  constructor(private p: Platform) {
    this.start(0);
  }

  private start(level: number): void {
    this.level = level;
    const L = LEVELS[level % LEVELS.length];
    const seed = level < LEVELS.length ? L.seed : 1000 + level * 31;
    this.knit = new Knit(PICTURE);
    this.total = this.knit.left;
    const q = makeQueue(PICTURE, 3, seed);
    this.spools = [];
    this.columns = q.map((col, ci) =>
      col.map((s) => {
        const v: SpoolView = { s, got: 0, reserved: 0, state: 'queue', col: ci, slot: -1, t: 0, x: 0, y: 0, fromX: 0, fromY: 0, spin: 0, cd: 0, bounce: 0, shake: 0 };
        this.spools.push(v);
        return v;
      }),
    );
    this.slots = new Array(L.slots).fill(null);
    this.flying = [];
    this.stuckT = 0;
    this.revives = 0;
    this.result = null;
    this.resultT = 0;
    if (this.s) this.layout(true);
  }

  resize(s: ScreenInfo): void {
    this.s = s;
    this.layout(true);
  }

  private layout(snap: boolean): void {
    const { width: w, height: h, safeTop, safeBottom } = this.s;
    const n = this.slots.length;
    this.W = Math.floor(Math.min(54, (w - 40) / n - 10));
    this.H = Math.round(this.W * 1.18);
    const queueH = 3 * (this.H + 12) + 24;
    const shelfH = this.H + 34;
    const top = safeTop + 96;
    const bottom = h - safeBottom - 14;
    const picH = bottom - top - shelfH - queueH - 20;
    const cols = this.knit.cols;
    const rows = this.knit.rows;
    const cell = Math.min((w - 56) / cols, picH / rows / 0.9, 34);
    this.cw = Math.floor(cell);
    this.ch = Math.floor(cell * 0.9);
    this.px = Math.round((w - cols * this.cw) / 2);
    this.py = Math.round(top + (picH - rows * this.ch) / 2);
    this.shelfY = top + picH + 22 + this.H / 2;
    this.queueY = this.shelfY + this.H / 2 + 40 + this.H / 2;
    const gap = this.W + 30;
    this.colX = [w / 2 - gap, w / 2, w / 2 + gap];
    if (snap) {
      for (const v of this.spools) {
        const t = this.target(v);
        v.x = t.x;
        v.y = t.y;
      }
    }
    const key = `${this.cw}x${this.ch}@${this.s.dpr}`;
    if (key !== this.spriteKey) {
      this.spriteKey = key;
      this.sprites.clear();
    }
  }

  private slotX(i: number): number {
    const n = this.slots.length;
    const gap = Math.min(this.W + 12, (this.s.width - 30) / n);
    return this.s.width / 2 + (i - (n - 1) / 2) * gap;
  }

  private target(v: SpoolView): { x: number; y: number } {
    if (v.state === 'queue') {
      const idx = this.columns[v.col].indexOf(v);
      return { x: this.colX[v.col], y: this.queueY + idx * (this.H + 12) };
    }
    return { x: this.slotX(v.slot), y: this.shelfY };
  }

  private cellPos(i: number): { x: number; y: number } {
    const x = i % this.knit.cols;
    const y = Math.floor(i / this.knit.cols);
    return { x: this.px + (x + 0.5) * this.cw, y: this.py + (y + 0.5) * this.ch };
  }

  // ---------- 输入 ----------
  down(x: number, y: number): void {
    if (this.btns.down(x, y)) return;
    if (this.result) return;
    for (let c = 0; c < this.columns.length; c++) {
      const v = this.columns[c][0];
      if (!v) continue;
      if (Math.abs(x - v.x) < this.W / 2 + 8 && Math.abs(y - v.y) < this.H / 2 + 8) {
        this.tapSpool(v);
        return;
      }
    }
  }

  up(): void {
    this.btns.up();
  }

  private tapSpool(v: SpoolView): void {
    this.tutorial = false;
    const slot = this.slots.indexOf(null);
    if (slot < 0) {
      v.shake = 1;
      this.slotFlash = 1;
      this.p.haptic('warning');
      this.p.sfx.tone([{ f: 200, f2: 150, at: 0, dur: 0.12, type: 'square', vol: 0.06 }]);
      return;
    }
    this.columns[v.col].shift();
    v.state = 'in';
    v.slot = slot;
    v.t = 0;
    v.fromX = v.x;
    v.fromY = v.y;
    v.cd = 0.3;
    this.slots[slot] = v;
    this.p.haptic('light');
    this.p.sfx.play('pick');
  }

  // ---------- 更新 ----------
  update(dt: number): void {
    this.time += dt;
    this.fx.update(dt);
    this.slotFlash = Math.max(0, this.slotFlash - dt * 2.5);

    for (const v of this.spools) {
      v.bounce = Math.max(0, v.bounce - dt * 5);
      v.shake = Math.max(0, v.shake - dt * 3);
      if (v.state === 'queue') {
        const t = this.target(v);
        v.x = lerp(v.x, t.x, 1 - Math.pow(0.0005, dt));
        v.y = lerp(v.y, t.y, 1 - Math.pow(0.0005, dt));
      } else if (v.state === 'in') {
        v.t += dt / 0.3;
        const t = this.target(v);
        const k = easeOut(clamp(v.t));
        v.x = lerp(v.fromX, t.x, k);
        v.y = lerp(v.fromY, t.y, k) - Math.sin(k * Math.PI) * 40;
        if (v.t >= 1) {
          v.state = 'slot';
          v.bounce = 1;
          this.p.sfx.play('drop');
        }
      } else if (v.state === 'slot') {
        this.pull(v, dt);
      } else if (v.state === 'out') {
        v.t += dt;
        v.y -= dt * (200 + v.t * 900);
        v.x += dt * 40 * Math.sin(v.t * 9);
        if (v.y < -this.H) v.state = 'gone';
      }
      if (v.state === 'slot' || v.state === 'in') v.spin += dt * (v.reserved > 0 ? 14 : 0);
    }

    for (const f of this.flying) {
      f.t += dt;
      if (f.t >= f.dur) this.land(f);
    }
    this.flying = this.flying.filter((f) => f.t < f.dur);

    if (!this.result) this.checkEnd(dt);
    else if (this.resultDelay > 0) {
      this.resultDelay -= dt;
      if (this.resultDelay <= 0) {
        if (this.result === 'win') {
          this.p.sfx.play('win');
          this.fx.confetti(this.s.width, Object.values(COLORS));
        } else this.p.sfx.play('lose');
      }
    } else this.resultT += dt;
  }

  /** 挂在线轴位上的线轴：每隔一小会儿抽一针露在外边的同色毛线 */
  private pull(v: SpoolView, dt: number): void {
    v.cd -= dt;
    if (v.cd > 0 || v.got + v.reserved >= v.s.cap) return;
    const cand = this.knit.exposedOf(v.s.color);
    if (!cand.length) return;
    // 挑离线轴最近的那针，线看起来是被顺着拽过来的
    let best = cand[0];
    let bd = Infinity;
    for (const i of cand) {
      const p = this.cellPos(i);
      const d = Math.hypot(p.x - v.x, p.y - v.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    this.knit.take(best);
    v.reserved++;
    const p = this.cellPos(best);
    this.flying.push({ cell: best, color: v.s.color, sx: p.x, sy: p.y, sp: v, t: 0, dur: 0.34 + bd / 2200, bend: (Math.random() - 0.5) * 80 });
    v.cd = 0.07;
  }

  private land(f: Flying): void {
    const v = f.sp;
    v.reserved--;
    v.got++;
    v.bounce = 0.6;
    if (this.time - this.lastTick > 0.028) {
      this.lastTick = this.time;
      const k = v.got / v.s.cap;
      this.p.sfx.tone([{ f: 620 + k * 560, at: 0, dur: 0.05, type: 'sine', vol: 0.11 }]);
    }
    if (v.got >= v.s.cap) {
      // 卷满：飞走，腾出线轴位
      v.state = 'out';
      v.t = 0;
      this.slots[v.slot] = null;
      this.fx.burst(v.x, v.y, COLORS[v.s.color], 14, 200, 'dot', 4);
      this.fx.burst(v.x, v.y, '#F7C24A', 5, 150, 'star', 5);
      this.fx.float(v.x, v.y - this.H * 0.7, '卷满啦', THEME.accent, 15);
      this.p.sfx.play('clear');
      this.p.haptic('light');
    }
  }

  private checkEnd(dt: number): void {
    if (this.knit.left === 0 && !this.flying.length && this.spools.every((v) => v.state === 'gone' || v.state === 'out' || v.state === 'queue')) {
      this.result = 'win';
      this.resultDelay = 0.7;
      this.p.haptic('success');
      return;
    }
    const full = this.slots.every((v) => v !== null);
    const busy = this.flying.length > 0 || this.slots.some((v) => v && (v.state === 'in' || this.knit.exposedOf(v.s.color).length > 0));
    if (full && !busy) {
      this.stuckT += dt;
      if (this.stuckT > 0.6) {
        this.result = 'lose';
        this.resultDelay = 0.3;
        this.p.haptic('warning');
      }
    } else this.stuckT = 0;
  }

  // ---------- 绘制 ----------
  draw(ctx: Ctx2D): void {
    const { width: w, height: h, safeTop } = this.s;
    this.btns.clear();
    drawCozyBackground(ctx, w, h);
    this.drawHeader(ctx, w, safeTop);
    this.drawPicture(ctx);
    this.drawShelf(ctx);
    for (const c of this.columns) {
      for (let i = Math.min(c.length, 3) - 1; i >= 0; i--) this.drawSpoolView(ctx, c[i], i);
      if (c.length > 3) {
        const x = this.colX[c[0].col];
        const y = this.queueY + 3 * (this.H + 12) - this.H / 2 + 4;
        text(ctx, `+${c.length - 3}`, x, y, 12, THEME.textLight);
      }
    }
    for (const v of this.spools) if (v.state === 'in' || v.state === 'slot' || v.state === 'out') this.drawSpoolView(ctx, v, 0);
    this.drawFlying(ctx);
    if (this.tutorial) this.drawTutorial(ctx, w);
    if (this.result && this.resultDelay <= 0) {
      const win = this.result === 'win';
      endPanel(ctx, this.btns, w, h, {
        win,
        t: this.resultT * 2.2,
        stars: win ? 3 - Math.min(2, this.revives) : undefined,
        title: win ? '毛衣拆完啦！' : '线轴位满了',
        lines: win
          ? [`拆出 ${this.total} 针毛线，卷了 ${this.spools.length} 卷`, '猫咪可以用它们织新东西了']
          : ['挂着的线轴都抽不到线了', `已经拆了 ${Math.round((1 - this.knit.left / this.total) * 100)}%`],
        primary: win ? { label: '下一关', onTap: () => this.go(this.level + 1) } : { label: '再试一次', onTap: () => this.go(this.level) },
        secondary: win ? { label: '重玩本关', onTap: () => this.go(this.level) } : { label: '看广告 +1 个线轴位', onTap: () => this.revive() },
      });
    }
    this.fx.draw(ctx);
  }

  private go(level: number): void {
    this.p.haptic('medium');
    this.p.sfx.play('tap');
    this.start(level);
  }

  private revive(): void {
    this.p.haptic('medium');
    this.p.sfx.play('tap');
    this.revives++;
    this.slots.push(null);
    this.result = null;
    this.resultT = 0;
    this.stuckT = 0;
    this.layout(false);
  }

  private drawHeader(ctx: Ctx2D, w: number, safeTop: number): void {
    const top = safeTop + 10;
    text(ctx, '拆毛衣', w / 2, top + 22, 21, THEME.text, { stroke: '#FFFFFF', strokeW: 5 });
    text(ctx, `第 ${this.level + 1} 关`, w / 2, top + 46, 12.5, THEME.textLight, { weight: '600' });
    restartButton(ctx, this.btns, w - 36, top + 26, () => this.go(this.level));
    // 进度条
    const bw = Math.min(240, w - 120);
    const bx = w / 2 - bw / 2;
    const by = top + 64;
    const k = 1 - this.knit.left / this.total;
    roundRectPath(ctx, bx, by, bw, 12, 6);
    ctx.fillStyle = '#EED8BC';
    ctx.fill();
    if (k > 0) {
      roundRectPath(ctx, bx, by, Math.max(12, bw * k), 12, 6);
      ctx.fillStyle = '#79C267';
      ctx.fill();
      roundRectPath(ctx, bx + 3, by + 2, Math.max(6, bw * k - 6), 3.5, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fill();
    }
    text(ctx, `${Math.round(k * 100)}%`, bx + bw + 22, by + 6.5, 12, THEME.textLight);
  }

  private stitchSprite(color: string): Surface {
    let s = this.sprites.get(color);
    if (s) return s;
    const dpr = this.s.dpr;
    const w = this.cw;
    const h = this.ch;
    s = this.p.createOffscreen(Math.ceil(w * dpr), Math.ceil(h * 1.25 * dpr));
    const c = s.ctx;
    c.scale(dpr, dpr);
    c.translate(w / 2, h * 0.55);
    // 平针的一个“V”：左右两片斜着的线圈
    for (const k of [-1, 1]) {
      c.save();
      c.translate(k * w * 0.2, 0);
      c.rotate(-k * 0.5);
      fillEllipse(c, 0, h * 0.04, w * 0.22, h * 0.56, shade(color, -0.28));
      fillEllipse(c, 0, 0, w * 0.2, h * 0.52, color);
      fillEllipse(c, -k * w * 0.04, -h * 0.12, w * 0.07, h * 0.28, 'rgba(255,255,255,0.35)');
      c.beginPath();
      c.moveTo(-w * 0.12, h * 0.1);
      c.quadraticCurveTo(0, h * 0.24, w * 0.12, h * 0.1);
      c.strokeStyle = shade(color, -0.15);
      c.lineWidth = Math.max(1, w * 0.04);
      c.stroke();
      c.restore();
    }
    this.sprites.set(color, s);
    return s;
  }

  private drawPicture(ctx: Ctx2D): void {
    const k = this.knit;
    const x0 = this.px;
    const y0 = this.py;
    const W = k.cols * this.cw;
    const H = k.rows * this.ch;
    // 底布 + 罗纹边
    const pad = 10;
    roundRectPath(ctx, x0 - pad, y0 - pad + 5, W + pad * 2, H + pad * 2 + 10, 16);
    ctx.fillStyle = 'rgba(190,110,70,0.18)';
    ctx.fill();
    roundRectPath(ctx, x0 - pad, y0 - pad, W + pad * 2, H + pad * 2 + 10, 16);
    ctx.fillStyle = '#F4E3CC';
    ctx.fill();
    // 罗纹下摆
    for (let x = x0 - pad + 8; x < x0 + W + pad - 4; x += 7) {
      roundRectPath(ctx, x, y0 + H + 4, 4, pad + 2, 2);
      ctx.fillStyle = '#E7CDAE';
      ctx.fill();
    }
    // 空位：浅浅的针眼
    for (let i = 0; i < k.cells.length; i++) {
      if (k.cells[i]) continue;
      const p = this.cellPos(i);
      fillEllipse(ctx, p.x, p.y, this.cw * 0.18, this.ch * 0.12, 'rgba(200,160,120,0.25)');
    }
    // 针脚
    const dpr = this.s.dpr;
    for (let i = 0; i < k.cells.length; i++) {
      const c = k.cells[i];
      if (!c) continue;
      const p = this.cellPos(i);
      const spr = this.stitchSprite(COLORS[c]);
      ctx.drawImage(spr.canvas, p.x - this.cw / 2, p.y - this.ch * 0.55, spr.canvas.width / dpr, spr.canvas.height / dpr);
    }
  }

  private drawShelf(ctx: Ctx2D): void {
    const n = this.slots.length;
    const x0 = this.slotX(0) - this.W / 2 - 12;
    const x1 = this.slotX(n - 1) + this.W / 2 + 12;
    const y = this.shelfY + this.H / 2 + 2;
    // 木架
    roundRectPath(ctx, x0, y + 4, x1 - x0, 14, 7);
    ctx.fillStyle = 'rgba(150,90,50,0.25)';
    ctx.fill();
    roundRectPath(ctx, x0, y, x1 - x0, 14, 7);
    ctx.fillStyle = '#D9A06A';
    ctx.fill();
    roundRectPath(ctx, x0 + 4, y + 2, x1 - x0 - 8, 4, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fill();
    for (let i = 0; i < n; i++) {
      const x = this.slotX(i);
      // 线轴位：空着时是虚线框 + 小木桩
      if (!this.slots[i]) {
        ctx.save();
        roundRectPath(ctx, x - this.W / 2, this.shelfY - this.H / 2, this.W, this.H, 10);
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = this.slotFlash > 0 ? `rgba(232,96,90,${0.4 + this.slotFlash * 0.6})` : 'rgba(200,140,100,0.55)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
        roundRectPath(ctx, x - 3, this.shelfY - this.H * 0.18, 6, this.H * 0.68, 3);
        ctx.fillStyle = '#E6C29A';
        ctx.fill();
      } else if (this.slotFlash > 0) {
        roundRectPath(ctx, x - this.W / 2 - 3, this.shelfY - this.H / 2 - 3, this.W + 6, this.H + 6, 12);
        ctx.strokeStyle = `rgba(232,96,90,${this.slotFlash})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
  }

  private drawSpoolView(ctx: Ctx2D, v: SpoolView, depth: number): void {
    let x = v.x + Math.sin(this.time * 50) * v.shake * 5;
    const y = v.y;
    const front = v.state === 'queue' && depth === 0;
    const scale = (v.state === 'queue' ? (front ? 1 : 0.9) : 1) * (1 + v.bounce * 0.08);
    if (v.state === 'queue' && !front) x += 0;
    ctx.save();
    ctx.globalAlpha = v.state === 'queue' && !front ? 0.75 : 1;
    if (front && !this.result) {
      const k = 0.5 + 0.5 * Math.sin(this.time * 4 + v.col);
      fillEllipse(ctx, x, y + this.H * 0.45, this.W * 0.62, this.H * 0.12, `rgba(247,181,74,${0.2 + k * 0.2})`);
    }
    const waiting = v.state === 'slot' && v.reserved === 0 && this.knit.exposedOf(v.s.color).length === 0;
    drawSpool(ctx, x, y, this.W * scale, this.H * scale, COLORS[v.s.color], v.got / v.s.cap, v.spin, v.s.cap - v.got, waiting ? 0.5 + 0.5 * Math.sin(this.time * 5) : 0);
    ctx.restore();
  }

  private drawFlying(ctx: Ctx2D): void {
    for (const f of this.flying) {
      const k = easeOut(clamp(f.t / f.dur));
      const tx = f.sp.x;
      const ty = f.sp.y;
      const cx = (f.sx + tx) / 2 + f.bend;
      const cy = Math.min(f.sy, ty) - 30;
      const pt = (u: number) => ({
        x: (1 - u) * (1 - u) * f.sx + 2 * (1 - u) * u * cx + u * u * tx,
        y: (1 - u) * (1 - u) * f.sy + 2 * (1 - u) * u * cy + u * u * ty,
      });
      // 被拽着的毛线：从针脚当前的位置一直连到线轴上
      const col = COLORS[f.color];
      ctx.beginPath();
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const u = k + ((1 - k) * i) / steps;
        const p = pt(u);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = shade(col, -0.25);
      ctx.lineWidth = 3.4;
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      // 线头：一小团正在散开的针脚
      const p = pt(k);
      const r = this.cw * 0.22 * (1 - k * 0.6);
      fillCircle(ctx, p.x, p.y, r + 1, shade(col, -0.25));
      fillCircle(ctx, p.x, p.y, r, col);
    }
  }

  private drawTutorial(ctx: Ctx2D, w: number): void {
    const k = backOut(clamp(this.time * 2));
    const bw = Math.min(w - 32, 310);
    const bx = w / 2 - bw / 2;
    const ty = this.shelfY - this.H / 2 - 74 + (1 - k) * 16;
    ctx.globalAlpha = clamp(this.time * 3);
    roundRectPath(ctx, bx, ty + 3, bw, 58, 18);
    ctx.fillStyle = 'rgba(200,120,90,0.2)';
    ctx.fill();
    roundRectPath(ctx, bx, ty, bw, 58, 18);
    ctx.fillStyle = '#FFFDF8';
    ctx.fill();
    text(ctx, '点下面的线轴，它会抽走露在边上的同色毛线', w / 2, ty + 20, 13, THEME.text);
    text(ctx, '线轴位挂满了又抽不到线，就输了', w / 2, ty + 40, 12, THEME.textLight, { weight: '600' });
    ctx.globalAlpha = 1;
  }
}

/** 线轴（正面）：上下木头边，中间卷着毛线，越卷越粗 */
function drawSpool(ctx: Ctx2D, x: number, y: number, W: number, H: number, color: string, fill: number, spin: number, left: number, waiting: number): void {
  fillEllipse(ctx, x, y + H / 2 + 3, W * 0.5, 5, 'rgba(120,70,30,0.18)');
  const coreW = W * 0.34;
  const yarnW = W * (0.5 + 0.38 * fill);
  const yh = H - 16;
  // 木芯
  roundRectPath(ctx, x - coreW / 2, y - yh / 2, coreW, yh, 3);
  ctx.fillStyle = '#E9C9A0';
  ctx.fill();
  // 毛线
  roundRectPath(ctx, x - yarnW / 2, y - yh / 2, yarnW, yh, Math.min(10, yarnW * 0.3));
  ctx.fillStyle = color;
  ctx.fill();
  ctx.save();
  roundRectPath(ctx, x - yarnW / 2, y - yh / 2, yarnW, yh, Math.min(10, yarnW * 0.3));
  ctx.clip();
  ctx.strokeStyle = shade(color, -0.2);
  ctx.lineWidth = 1.6;
  const step = 5;
  const off = (spin * 6) % step;
  for (let yy = y - yh / 2 - step + off; yy < y + yh / 2 + step; yy += step) {
    ctx.beginPath();
    ctx.moveTo(x - yarnW / 2, yy);
    ctx.lineTo(x + yarnW / 2, yy + 3);
    ctx.stroke();
  }
  // 圆柱的明暗
  const g = ctx.createLinearGradient(x - yarnW / 2, 0, x + yarnW / 2, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.12)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = g;
  ctx.fillRect(x - yarnW / 2, y - yh / 2, yarnW, yh);
  ctx.restore();
  // 上下木边
  for (const k of [-1, 1]) {
    const fy = y + (k * (H - 8)) / 2 - 4;
    roundRectPath(ctx, x - W / 2, fy + 2, W, 8, 4);
    ctx.fillStyle = '#B97C47';
    ctx.fill();
    roundRectPath(ctx, x - W / 2, fy, W, 8, 4);
    ctx.fillStyle = '#D9A06A';
    ctx.fill();
    roundRectPath(ctx, x - W / 2 + 3, fy + 1.5, W - 6, 2.5, 1.2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();
  }
  // 还要几针
  if (left > 0) {
    const r = Math.max(9, W * 0.2);
    fillCircle(ctx, x, y, r + 1.5, shade(color, -0.3));
    fillCircle(ctx, x, y, r, '#FFFFFF');
    text(ctx, String(left), x, y + 0.5, r * 1.1, shade(color, -0.45));
  }
  // 等待中（抽不到线）：头上一个小问号
  if (waiting > 0) {
    ctx.globalAlpha = 0.5 + waiting * 0.5;
    text(ctx, '…', x, y - H / 2 - 10, 16, THEME.textLight);
    ctx.globalAlpha = 1;
  }
}

run((p) => new KnitGame(p));
