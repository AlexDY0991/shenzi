// 猫咪排队出门：可玩样张
import { Ctx2D, Platform, ScreenInfo } from '../../src/platform/types';
import { THEME } from '../../src/render/colors';
import { fillCircle, pawPrint, roundRectPath, text } from '../../src/render/shapes';
import { roundButton } from '../../src/render/ui';
import { Buttons, Fx, Game, backOut, clamp, drawCozyBackground, easeIn, easeOut, endPanel, heartShape, restartButton, run } from '../common';
import { CatPose, FURS, drawCatTop } from './cat-top';
import { Cat, DX, DY, Room, generate } from './logic';

const HEARTS = 3;
const HINTS = 3;

interface View {
  cat: Cat;
  state: 'idle' | 'exit' | 'bump' | 'gone';
  t: number;
  /** 沿脸的方向偏移了几格 */
  off: number;
  gap: number;
  blocker: number;
  hit: boolean;
  pose: CatPose;
  blinkIn: number;
  moodT: number;
  shake: number;
  press: number;
}

function levelSpec(n: number) {
  if (n === 1) return { cols: 6, rows: 8, seed: 11, fatRate: 0.12, targetFree: 5 };
  if (n === 2) return { cols: 7, rows: 9, seed: 202, fatRate: 0.16, targetFree: 4 };
  return { cols: 7, rows: 10, seed: 300 + n * 17, fatRate: 0.2, targetFree: 4 };
}

class CatJam implements Game {
  private s!: ScreenInfo;
  private btns = new Buttons();
  private fx = new Fx();
  private level = 1;
  private room!: Room;
  private views: View[] = [];
  private cell = 40;
  private gx = 0;
  private gy = 0;
  private hearts = HEARTS;
  private heartAnim: number[] = [];
  private hints = HINTS;
  private hintCat = -1;
  private hintT = 0;
  private combo = 0;
  private lastExit = -9;
  private time = 0;
  private result: 'win' | 'lose' | null = null;
  private resultT = 0;
  private resultDelay = 0;
  private tutorial = true;
  private shakeScreen = 0;
  private outCount = 0;

  constructor(private p: Platform) {
    this.start(1);
  }

  private start(level: number): void {
    this.level = level;
    const spec = levelSpec(level);
    const cats = generate(spec);
    this.room = new Room(spec.cols, spec.rows, cats);
    this.views = cats.map((c) => ({
      cat: c,
      state: 'idle',
      t: 0,
      off: 0,
      gap: 0,
      blocker: -1,
      hit: false,
      pose: { blink: 0, tail: Math.random() * 6, gait: 0, walk: 0, squash: 0, mood: 'idle', spin: 0, seed: c.id * 7 + c.fur },
      blinkIn: 1 + Math.random() * 4,
      moodT: 0,
      shake: 0,
      press: 0,
    }));
    this.hearts = HEARTS;
    this.heartAnim = [0, 0, 0];
    this.hints = HINTS;
    this.hintCat = -1;
    this.combo = 0;
    this.result = null;
    this.resultT = 0;
    this.outCount = 0;
    if (this.s) this.layout();
  }

  resize(s: ScreenInfo): void {
    this.s = s;
    this.layout();
  }

  private layout(): void {
    const { width: w, height: h, safeTop, safeBottom } = this.s;
    const top = safeTop + 112;
    const bottom = safeBottom + 96;
    const { cols, rows } = this.room;
    this.cell = Math.floor(Math.min((w - 36) / cols, (h - top - bottom) / rows, 66));
    this.gx = Math.round((w - cols * this.cell) / 2);
    this.gy = Math.round(top + (h - top - bottom - rows * this.cell) / 2);
  }

  /** 猫身体中心的屏幕坐标 */
  private catPos(v: View): { x: number; y: number } {
    const c = v.cat;
    const back = (c.len - 1) / 2;
    const ox = c.x - DX[c.dir] * back + DX[c.dir] * v.off;
    const oy = c.y - DY[c.dir] * back + DY[c.dir] * v.off;
    return { x: this.gx + (ox + 0.5) * this.cell, y: this.gy + (oy + 0.5) * this.cell };
  }

  // ---------- 声音 ----------
  private meow(pitch: number): void {
    this.p.sfx.tone([
      { f: 520 * pitch, f2: 860 * pitch, at: 0, dur: 0.11, type: 'triangle', vol: 0.15 },
      { f: 860 * pitch, f2: 470 * pitch, at: 0.1, dur: 0.22, type: 'triangle', vol: 0.15 },
      { f: 1040 * pitch, f2: 940 * pitch, at: 0.02, dur: 0.14, type: 'sine', vol: 0.04 },
    ]);
  }
  private bonk(): void {
    this.p.sfx.tone([
      { f: 240, f2: 85, at: 0.08, dur: 0.16, type: 'sine', vol: 0.4 },
      { f: 140, f2: 70, at: 0.08, dur: 0.1, type: 'square', vol: 0.05 },
      { f: 330, f2: 300, at: 0.2, dur: 0.12, type: 'sawtooth', vol: 0.035 },
    ]);
  }

  // ---------- 输入 ----------
  down(x: number, y: number): void {
    if (this.btns.down(x, y)) return;
    if (this.result) return;
    const cx = Math.floor((x - this.gx) / this.cell);
    const cy = Math.floor((y - this.gy) / this.cell);
    const id = this.room.at(cx, cy);
    if (id < 0) return;
    const v = this.views[id];
    if (v.state !== 'idle') return;
    this.tutorial = false;
    if (this.hintCat === id) this.hintCat = -1;
    const b = this.room.blocker(v.cat);
    if (!b) {
      // 能走：马上从格子上拿掉，别的猫立刻能用这条路
      this.room.remove(v.cat);
      v.state = 'exit';
      v.t = 0;
      v.pose.mood = 'happy';
      this.combo = this.time - this.lastExit < 1.1 ? this.combo + 1 : 1;
      this.lastExit = this.time;
      this.p.haptic(this.combo >= 3 ? 'medium' : 'light');
      this.meow(1 + Math.min(8, this.combo - 1) * 0.07 + (v.cat.len > 1 ? -0.22 : 0));
      const pos = this.catPos(v);
      if (this.combo >= 2) this.fx.float(pos.x, pos.y - this.cell * 0.6, `连击 ×${this.combo}`, this.combo >= 5 ? '#E8605A' : THEME.accent, 16 + Math.min(8, this.combo));
      this.fx.burst(pos.x, pos.y, '#FFFFFF', 6, 90, 'dot', 3);
      this.outCount++;
      if (this.room.alive.size === 0) {
        this.result = 'win';
        this.resultDelay = 0.8;
      }
    } else {
      v.state = 'bump';
      v.t = 0;
      v.gap = b.gap;
      v.blocker = b.id;
      v.hit = false;
      this.hearts--;
      this.heartAnim[this.hearts] = 1;
      this.combo = 0;
      this.p.haptic('warning');
      this.bonk();
      if (this.hearts <= 0) {
        this.result = 'lose';
        this.resultDelay = 1.0;
      }
    }
  }

  up(): void {
    this.btns.up();
  }

  // ---------- 更新 ----------
  update(dt: number): void {
    this.time += dt;
    this.fx.update(dt);
    this.hintT += dt;
    this.shakeScreen = Math.max(0, this.shakeScreen - dt * 3);
    for (let i = 0; i < this.heartAnim.length; i++) this.heartAnim[i] = Math.max(0, this.heartAnim[i] - dt * 1.4);
    for (const v of this.views) this.updateView(v, dt);
    if (this.result) {
      if (this.resultDelay > 0) {
        this.resultDelay -= dt;
        if (this.resultDelay <= 0) {
          if (this.result === 'win') {
            this.p.sfx.play('win');
            this.fx.confetti(this.s.width, ['#F39A3D', '#F08BB8', '#79C267', '#5B8FE0', '#F2C84B']);
          } else this.p.sfx.play('lose');
        }
      } else this.resultT += dt;
    }
  }

  private updateView(v: View, dt: number): void {
    const P = v.pose;
    P.tail += dt * (v.state === 'exit' ? 9 : 1.6);
    P.spin += dt * 5;
    v.press = Math.max(0, v.press - dt * 6);
    v.shake = Math.max(0, v.shake - dt * 2.5);
    if (v.moodT > 0) {
      v.moodT -= dt;
      if (v.moodT <= 0 && v.state === 'idle') P.mood = 'idle';
    }
    // 眨眼
    v.blinkIn -= dt;
    if (v.blinkIn < 0) {
      P.blink = Math.min(1, P.blink + dt * 14);
      if (v.blinkIn < -0.14) {
        v.blinkIn = 1.5 + Math.random() * 4;
        P.blink = 0;
      }
    }
    P.squash *= Math.pow(0.002, dt);
    if (v.state === 'exit') {
      v.t += dt;
      const t = v.t;
      // 先一缩身子，再加速跑出去
      if (t < 0.08) {
        P.squash = 0.12 * (t / 0.08);
        v.off = -0.04 * (t / 0.08);
      } else {
        const u = t - 0.08;
        v.off = -0.04 + 4 * u + 15 * u * u;
        P.squash = -0.06;
      }
      P.walk = Math.min(1, P.walk + dt * 8);
      P.gait += dt * (12 + v.t * 20);
      const pos = this.catPos(v);
      const m = this.cell * 2;
      if (pos.x < -m || pos.y < -m || pos.x > this.s.width + m || pos.y > this.s.height + m) v.state = 'gone';
    } else if (v.state === 'bump') {
      v.t += dt;
      const dist = v.gap + 0.2;
      const go = Math.max(0.09, dist / 10);
      const t = v.t;
      P.walk = t < go + 0.1 ? Math.min(1, P.walk + dt * 10) : Math.max(0, P.walk - dt * 4);
      P.gait += dt * 16 * P.walk;
      if (t < go) v.off = dist * easeIn(t / go);
      else if (t < go + 0.12) {
        v.off = dist;
        if (!v.hit) {
          v.hit = true;
          P.squash = 0.28;
          P.mood = 'dizzy';
          const bv = this.views[v.blocker];
          bv.shake = 1;
          bv.pose.mood = 'angry';
          bv.moodT = 1.1;
          bv.pose.squash = -0.12;
          this.shakeScreen = 1;
          const pos = this.catPos(v);
          const fx = pos.x + DX[v.cat.dir] * this.cell * (v.cat.len / 2 + 0.05);
          const fy = pos.y + DY[v.cat.dir] * this.cell * (v.cat.len / 2 + 0.05);
          this.fx.burst(fx, fy, '#F7C24A', 8, 140, 'star', 4);
        }
      } else if (t < go + 0.45) v.off = dist * (1 - easeOut((t - go - 0.12) / 0.33));
      else {
        v.off = 0;
        v.state = 'idle';
        v.moodT = 0.9;
      }
    } else {
      P.walk = Math.max(0, P.walk - dt * 5);
    }
  }

  // ---------- 绘制 ----------
  draw(ctx: Ctx2D): void {
    const { width: w, height: h, safeTop, safeBottom } = this.s;
    this.btns.clear();
    drawCozyBackground(ctx, w, h);

    ctx.save();
    if (this.shakeScreen > 0) {
      const k = this.shakeScreen * this.shakeScreen * 4;
      ctx.translate(Math.sin(this.time * 70) * k, Math.cos(this.time * 61) * k * 0.6);
    }
    this.drawRug(ctx);

    // 先画趴着的，再画走动的（走动的在上面）
    const order = this.views.filter((v) => v.state !== 'gone');
    order.sort((a, b) => (a.state === 'idle' ? 0 : 1) - (b.state === 'idle' ? 0 : 1) || a.cat.y - b.cat.y);
    for (const v of order) {
      const pos = this.catPos(v);
      let x = pos.x;
      let y = pos.y;
      if (v.shake > 0) {
        x += Math.sin(this.time * 60) * v.shake * this.cell * 0.05;
        y += Math.cos(this.time * 53) * v.shake * this.cell * 0.03;
      }
      if (v.cat.id === this.hintCat && v.state === 'idle') {
        const k = 0.5 + 0.5 * Math.sin(this.hintT * 7);
        ctx.beginPath();
        ctx.arc(x, y, this.cell * (0.42 * v.cat.len + 0.12 + k * 0.08), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(247,181,74,${0.5 + k * 0.5})`;
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      drawCatTop(ctx, x, y, v.cat.dir, this.cell * (1 - v.press * 0.08), v.cat.len, FURS[v.cat.fur], v.pose);
    }
    ctx.restore();

    this.drawHud(ctx, w, h, safeTop, safeBottom);

    if (this.result && this.resultDelay <= 0) {
      const win = this.result === 'win';
      endPanel(ctx, this.btns, w, h, {
        win,
        t: this.resultT * 2.2,
        stars: win ? this.hearts : undefined,
        title: win ? '全部出门啦！' : '猫猫们生气了',
        lines: win ? [`${this.views.length} 只猫都跑出去玩了`, this.hearts === HEARTS ? '一次都没撞头，厉害！' : `撞了 ${HEARTS - this.hearts} 次头`] : ['撞头太多次了', `已经放走 ${this.outCount} / ${this.views.length} 只`],
        primary: win ? { label: '下一关', onTap: () => this.tapNext() } : { label: '再试一次', onTap: () => this.tapRetry() },
        secondary: win ? { label: '重玩本关', onTap: () => this.tapRetry() } : { label: '看广告 +1 颗心', onTap: () => this.revive() },
      });
    }
    this.fx.draw(ctx);
  }

  private tapNext(): void {
    this.p.haptic('medium');
    this.p.sfx.play('tap');
    this.start(this.level + 1);
  }
  private tapRetry(): void {
    this.p.haptic('medium');
    this.p.sfx.play('tap');
    this.start(this.level);
  }
  private revive(): void {
    this.p.haptic('medium');
    this.p.sfx.play('tap');
    this.hearts = 1;
    this.heartAnim = [0, 0, 0];
    this.result = null;
    this.resultT = 0;
  }

  private drawRug(ctx: Ctx2D): void {
    const { cols, rows } = this.room;
    const c = this.cell;
    const pad = c * 0.28;
    const x = this.gx - pad;
    const y = this.gy - pad;
    const w = cols * c + pad * 2;
    const h = rows * c + pad * 2;
    // 地毯：阴影、毛边、编织纹
    roundRectPath(ctx, x, y + 6, w, h, c * 0.45);
    ctx.fillStyle = 'rgba(190,110,70,0.18)';
    ctx.fill();
    roundRectPath(ctx, x, y, w, h, c * 0.45);
    ctx.fillStyle = '#F6C9A0';
    ctx.fill();
    roundRectPath(ctx, x + 5, y + 5, w - 10, h - 10, c * 0.4);
    ctx.fillStyle = '#FFF1E0';
    ctx.fill();
    ctx.save();
    roundRectPath(ctx, x + 9, y + 9, w - 18, h - 18, c * 0.36);
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#F0B898';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
    // 格子：浅浅的棋盘纹，帮助看清直线
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        if ((i + j) % 2) continue;
        roundRectPath(ctx, this.gx + i * c + 2, this.gy + j * c + 2, c - 4, c - 4, c * 0.2);
        ctx.fillStyle = 'rgba(246,201,160,0.25)';
        ctx.fill();
      }
    }
    // 四边的出口小爪印
    for (let i = 0; i < cols; i++) {
      pawPrint(ctx, this.gx + (i + 0.5) * c, y + pad * 0.45, c * 0.08, 'rgba(230,160,120,0.45)', 0);
      pawPrint(ctx, this.gx + (i + 0.5) * c, y + h - pad * 0.45, c * 0.08, 'rgba(230,160,120,0.45)', Math.PI);
    }
    for (let j = 0; j < rows; j++) {
      pawPrint(ctx, x + pad * 0.45, this.gy + (j + 0.5) * c, c * 0.08, 'rgba(230,160,120,0.45)', -Math.PI / 2);
      pawPrint(ctx, x + w - pad * 0.45, this.gy + (j + 0.5) * c, c * 0.08, 'rgba(230,160,120,0.45)', Math.PI / 2);
    }
  }

  private drawHud(ctx: Ctx2D, w: number, h: number, safeTop: number, safeBottom: number): void {
    const top = safeTop + 10;
    text(ctx, '猫咪排队出门', w / 2, top + 22, 21, THEME.text, { stroke: '#FFFFFF', strokeW: 5 });
    text(ctx, `第 ${this.level} 关`, w / 2, top + 46, 12.5, THEME.textLight, { weight: '600' });
    restartButton(ctx, this.btns, w - 36, top + 26, () => this.tapRetry());

    // 心
    for (let i = 0; i < HEARTS; i++) {
      const x = 26 + i * 30;
      const y = top + 26;
      const alive = i < this.hearts;
      const a = this.heartAnim[i];
      if (alive) {
        heartShape(ctx, x, y + 1.5, 11, '#C9465A');
        heartShape(ctx, x, y, 11, '#F0627A');
        fillCircle(ctx, x - 4, y - 4, 2.6, 'rgba(255,255,255,0.7)');
      } else {
        heartShape(ctx, x, y, 11, '#EADBC8');
        if (a > 0) {
          // 碎掉的心：两半飞开
          ctx.save();
          ctx.globalAlpha = a;
          const d = (1 - a) * 16;
          ctx.translate(-d, (1 - a) * 10);
          ctx.rotate(-(1 - a) * 0.6);
          heartShape(ctx, x, y, 11 * (1 + (1 - a) * 0.3), '#F0627A');
          ctx.restore();
        }
      }
    }

    // 剩余数量
    const left = this.room.alive.size;
    const y = top + 80;
    roundRectPath(ctx, w / 2 - 70, y - 15 + 2, 140, 30, 15);
    ctx.fillStyle = 'rgba(200,120,90,0.16)';
    ctx.fill();
    roundRectPath(ctx, w / 2 - 70, y - 15, 140, 30, 15);
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    text(ctx, `还有 ${left} 只猫在屋里`, w / 2, y + 0.5, 13.5, THEME.text);

    // 底部：提示按钮 + 说明
    const by = h - safeBottom - 48;
    const hb = this.btns.add({
      x: w / 2 - 30,
      y: by - 30,
      w: 60,
      h: 60,
      onTap: () => this.useHint(),
    });
    roundButton(ctx, w / 2, by, 26, this.btns.isPressed(hb), this.hints > 0);
    const dy = this.btns.isPressed(hb) ? 2.5 : 0;
    // 灯泡
    fillCircle(ctx, w / 2, by - 3 + dy, 8.5, this.hints > 0 ? '#F7C24A' : '#D8C6AE');
    roundRectPath(ctx, w / 2 - 4.5, by + 4 + dy, 9, 7, 2);
    ctx.fillStyle = '#A88E72';
    ctx.fill();
    fillCircle(ctx, w / 2 - 2.5, by - 5.5 + dy, 2.4, 'rgba(255,255,255,0.8)');
    fillCircle(ctx, w / 2 + 19, by - 19, 10, this.hints > 0 ? THEME.danger : '#C8B8A4');
    text(ctx, String(this.hints), w / 2 + 19, by - 18.5, 12, '#FFFFFF');

    if (this.tutorial) {
      const k = backOut(clamp(this.time * 2));
      const msg = '点猫咪，它会朝着脸的方向走出去';
      const msg2 = '前面有猫挡着就会撞头，扣一颗心';
      const bw = Math.min(w - 32, 300);
      const bx = w / 2 - bw / 2;
      const ty = by - 112 + (1 - k) * 20;
      ctx.globalAlpha = clamp(this.time * 3);
      roundRectPath(ctx, bx, ty + 3, bw, 56, 18);
      ctx.fillStyle = 'rgba(200,120,90,0.18)';
      ctx.fill();
      roundRectPath(ctx, bx, ty, bw, 56, 18);
      ctx.fillStyle = '#FFFDF8';
      ctx.fill();
      text(ctx, msg, w / 2, ty + 19, 14, THEME.text);
      text(ctx, msg2, w / 2, ty + 39, 12.5, THEME.textLight, { weight: '600' });
      ctx.globalAlpha = 1;
    }
  }

  private useHint(): void {
    if (this.result) return;
    if (this.hints <= 0) {
      this.p.haptic('warning');
      return;
    }
    const free = this.room.freeCats().filter((c) => this.views[c.id].state === 'idle');
    if (!free.length) return;
    this.p.haptic('light');
    this.p.sfx.play('pick');
    this.hints--;
    this.hintCat = free[Math.floor(Math.random() * free.length)].id;
    this.hintT = 0;
  }
}

run((p) => new CatJam(p));
