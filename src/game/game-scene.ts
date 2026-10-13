import { ropeCurve, Vec } from '../core/geometry';
import { Puzzle, RopeEnd } from '../core/puzzle';
import { Ctx2D, Surface } from '../platform/types';
import { BoardLayout, drawBoard, toScreen } from '../render/board';
import { basketBallPos, CatState, drawBasket, drawCat, newCatState } from '../render/cat';
import { shade, THEME, yarnColor } from '../render/colors';
import { ellipsePath, fillCircle, heart, pawPrint, roundRectPath, star, text } from '../render/shapes';
import { drawKitten, drawLock } from '../render/mechanics';
import { badge, catEarPanel, iconHome, iconRestart, iconScissors, iconSteps, panel, pillButton, roundButton, speechBubble } from '../render/ui';
import { drawButton, drawYarn, drawYarnBall } from '../render/yarn';
import type { App } from './app';
import { LEVELS } from './levels';
import { Scene } from './scene';
import { TitleScene } from './title-scene';

interface Ends {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

interface Drag {
  rope: number;
  end: RopeEnd;
  /** 手指位置（网格坐标） */
  gx: number;
  gy: number;
  startX: number;
  startY: number;
  moved: boolean;
}

interface Clearing {
  color: string;
  ends: Ends;
  t: number;
  slot: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  kind: 'dot' | 'heart' | 'star' | 'paw';
  color: string;
  size: number;
  rot: number;
}

const WIND_TIME = 0.32;
const FLY_TIME = 0.55;
const STEP_PROP = 5;

/** 特殊机制介绍：在第一次出现的关卡开局弹出 */
const MECHANICS = [
  {
    key: 'fixed' as const,
    title: '缝住的纽扣',
    lines: ['花边纽扣被线缝在垫子上了，', '拖不动。只能挪毛线的另一头。'],
  },
  {
    key: 'sleepers' as const,
    title: '打盹的小猫',
    lines: ['小猫趴在毛线上睡觉，这根毛线', '暂时不能动。数字是还要理顺', '几团毛线，小猫才会醒。'],
  },
  {
    key: 'locks' as const,
    title: '毛线锁',
    lines: ['上锁的孔不能放纽扣。', '理顺和锁同色的毛线，', '锁就会打开。'],
  },
];
type Mechanic = (typeof MECHANICS)[number];

interface PopAnim {
  kind: 'kitten' | 'lock';
  x: number;
  y: number;
  color: string;
  t: number;
}

const TIPS_START = ['加油喵！', '慢慢来不着急～', '毛线好乱呀…', '帮我理理毛线吧！'];
const TIPS_CLEAR = ['好耶！', '喵～理好一团！', '继续继续！', '干得漂亮喵！'];

export class GameScene extends Scene {
  private puzzle: Puzzle;
  private layout: BoardLayout = { x0: 0, y0: 0, cell: 60 };
  private boardCache: Surface | null = null;
  private disp = new Map<number, Ends>();
  private drag: Drag | null = null;
  private selected: { rope: number; end: RopeEnd } | null = null;
  private target = -1;
  private preview = new Set<number>();
  private clearing: Clearing[] = [];
  private basketBalls: string[] = [];
  private particles: Particle[] = [];
  private cat: CatState = newCatState();
  private catMoodTimer = 0;
  private blinkTimer = 2;
  private bubble = { msg: '', t: 0 };
  private scissorsMode = false;
  private state: 'play' | 'won' | 'lost' = 'play';
  private stateTime = 0;
  private stepsUsed = 0;
  private time = 0;
  private interacted = false;
  private earnedStars = 0;
  private busyAd = false;
  private intro: Mechanic | null = null;
  private shake: { rope: number; end: RopeEnd; t: number } | null = null;
  private kittenWiggle = new Map<number, number>();
  private pops: PopAnim[] = [];
  private prevSleep = new Map<number, number>();
  private prevLocks: [number, number][] = [];

  // 布局
  private topY = 0;
  private catX = 0;
  private catY = 0;
  private catS = 26;
  private basketX = 0;
  private basketY = 0;
  private basketW = 60;
  private bottomY = 0;

  constructor(app: App, private levelIndex: number) {
    super(app);
    this.puzzle = new Puzzle(LEVELS[levelIndex]);
    for (const r of this.puzzle.ropes) this.disp.set(r.id, this.holeEnds(r.a, r.b));
    this.onResize();
    this.say(levelIndex === 0 ? '拖动纽扣，把毛线解开喵～' : TIPS_START[levelIndex % TIPS_START.length], 3.5);
    this.intro = MECHANICS.find((m) => LEVELS.findIndex((lv) => (lv[m.key]?.length ?? 0) > 0) === levelIndex) ?? null;
    this.snapshotMechanics();
  }

  /** 记录小猫计数和锁的状态，用来在变化时播放动画 */
  private snapshotMechanics(): void {
    for (const r of this.puzzle.ropes) this.prevSleep.set(r.id, this.puzzle.sleepLeft(r.id));
    this.prevLocks = this.puzzle.activeLocks();
  }

  private ropeMid(id: number): Vec {
    const pts = this.screenCurve(this.disp.get(id)!);
    return pts[Math.floor(pts.length / 2)];
  }

  /** 状态变化后：锁打开、小猫醒来 */
  private afterChange(): void {
    const still = new Set(this.puzzle.activeLocks().map(([h]) => h));
    for (const [h, key] of this.prevLocks) {
      if (still.has(h)) continue;
      const g = this.puzzle.geo.pos(h);
      const p = toScreen(this.layout, g.x, g.y);
      this.pops.push({ kind: 'lock', x: p.x, y: p.y, color: yarnColor(this.puzzle.ropes[key].color), t: 0 });
      this.say('咔哒～锁打开啦！', 1.6);
    }
    for (const r of this.puzzle.ropes) {
      const before = this.prevSleep.get(r.id) ?? 0;
      if (before > 0 && (this.puzzle.sleepLeft(r.id) === 0 || !r.alive)) {
        const m = this.ropeMid(r.id);
        this.pops.push({ kind: 'kitten', x: m.x, y: m.y, color: '', t: 0 });
        if (r.alive) this.say('小猫醒啦，这根毛线能动了！', 2);
      }
    }
    this.snapshotMechanics();
  }

  // ───────────── 布局 ─────────────

  onResize(): void {
    const { width: W, height: H, safeTop, safeBottom } = this.app.info;
    const lv = this.puzzle.level;
    this.topY = safeTop + 10;
    const catTop = this.topY + 60;
    const catH = Math.max(78, Math.min(118, H * 0.13));
    this.catS = catH / 3.3;
    this.catX = W - 26 - this.catS * 1.6;
    this.catY = catTop + catH;
    this.basketW = this.catS * 2.8;
    this.basketX = this.catX - this.catS * 1.25 - this.basketW * 0.55;
    this.basketY = this.catY - this.basketW * 0.5;
    this.bottomY = H - safeBottom - 54;
    const boardTop = this.catY + 26;
    const boardBottom = this.bottomY - 52;
    const cell = Math.min((W - 44) / lv.cols, (boardBottom - boardTop) / lv.rows, 78);
    this.layout = {
      cell,
      x0: W / 2 - ((lv.cols - 1) / 2) * cell,
      y0: (boardTop + boardBottom) / 2 - ((lv.rows - 1) / 2) * cell,
    };
    this.boardCache = null;
  }

  private holeEnds(a: number, b: number): Ends {
    const pa = this.puzzle.geo.pos(a);
    const pb = this.puzzle.geo.pos(b);
    return { ax: pa.x, ay: pa.y, bx: pb.x, by: pb.y };
  }

  private toGrid(x: number, y: number): Vec {
    return { x: (x - this.layout.x0) / this.layout.cell, y: (y - this.layout.y0) / this.layout.cell };
  }

  private screenCurve(e: Ends): Vec[] {
    return ropeCurve(e.ax, e.ay, e.bx, e.by).map((p) => toScreen(this.layout, p.x, p.y));
  }

  // ───────────── 交互 ─────────────

  private say(msg: string, dur = 2.4): void {
    this.bubble = { msg, t: dur };
  }

  private catReact(mood: CatState['mood'], dur: number): void {
    this.cat.mood = mood;
    this.catMoodTimer = dur;
  }

  /** 找手指附近的纽扣（取最近的） */
  private pickPin(x: number, y: number): { rope: number; end: RopeEnd } | null {
    const g = this.toGrid(x, y);
    let best: { rope: number; end: RopeEnd; d: number } | null = null;
    for (const r of this.puzzle.aliveRopes) {
      const e = this.disp.get(r.id)!;
      for (const [end, px, py] of [
        ['a', e.ax, e.ay],
        ['b', e.bx, e.by],
      ] as const) {
        const d = Math.hypot(g.x - px, g.y - py);
        if (d < 0.46 && (!best || d < best.d - 0.01 || (Math.abs(d - best.d) <= 0.01 && r.z > this.puzzle.ropes[best.rope].z))) {
          best = { rope: r.id, end, d };
        }
      }
    }
    return best;
  }

  /** 找手指附近的毛线（剪刀模式），优先最上层 */
  private pickRope(x: number, y: number): number {
    const ropes = [...this.puzzle.aliveRopes].sort((p, q) => q.z - p.z);
    const reach = this.layout.cell * 0.3;
    for (const r of ropes) {
      const pts = this.screenCurve(this.disp.get(r.id)!);
      for (let i = 0; i < pts.length; i++) {
        if (Math.hypot(pts[i].x - x, pts[i].y - y) < reach) return r.id;
      }
    }
    return -1;
  }

  private nearestFreeHole(gx: number, gy: number): number {
    const geo = this.puzzle.geo;
    const c = Math.round(gx);
    const r = Math.round(gy);
    if (c < 0 || r < 0 || c >= geo.cols || r >= geo.rows) return -1;
    if (Math.hypot(gx - c, gy - r) > 0.5) return -1;
    const h = r * geo.cols + c;
    return this.puzzle.isFreeHole(h) ? h : -1;
  }

  protected pointerDown(x: number, y: number): void {
    if (this.state !== 'play' || this.intro) return;
    if (this.scissorsMode) {
      const id = this.pickRope(x, y);
      if (id >= 0) this.useScissorsOn(id);
      return;
    }
    const pin = this.pickPin(x, y);
    if (pin && !this.puzzle.canLift(pin.rope, pin.end)) {
      // 拿不起来：缝住或小猫在睡觉
      this.app.platform.vibrate(true);
      this.app.platform.sfx.play('tap');
      const nap = this.puzzle.sleepLeft(pin.rope);
      if (nap > 0) {
        this.kittenWiggle.set(pin.rope, 1);
        this.say(`嘘…小猫在睡觉，再理顺 ${nap} 团就醒`, 2.2);
      } else {
        this.shake = { ...pin, t: 1 };
        this.say('这颗纽扣被缝住啦，挪另一头试试', 2.2);
      }
      return;
    }
    if (pin) {
      const g = this.toGrid(x, y);
      this.drag = { ...pin, gx: g.x, gy: g.y, startX: x, startY: y, moved: false };
      this.app.platform.sfx.play('pick');
      this.app.platform.vibrate();
      this.interacted = true;
      return;
    }
    // 点选模式：先点纽扣，再点空孔
    if (this.selected) {
      const g = this.toGrid(x, y);
      const h = this.nearestFreeHole(g.x, g.y);
      if (h >= 0) this.commitMove(this.selected.rope, this.selected.end, h);
      this.selected = null;
    }
  }

  protected pointerMove(x: number, y: number): void {
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(x - d.startX, y - d.startY) > 8) {
      d.moved = true;
      this.selected = null;
    }
    const g = this.toGrid(x, y);
    d.gx = g.x;
    d.gy = g.y;
    if (!d.moved) return;
    const e = this.disp.get(d.rope)!;
    if (d.end === 'a') {
      e.ax = g.x;
      e.ay = g.y;
    } else {
      e.bx = g.x;
      e.by = g.y;
    }
    const h = this.nearestFreeHole(g.x, g.y);
    if (h !== this.target) {
      this.target = h;
      this.preview = new Set(h >= 0 ? this.puzzle.previewCleared(d.rope, d.end, h) : []);
      if (h >= 0) this.app.platform.vibrate();
    }
  }

  protected pointerUp(): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (!d.moved) {
      // 轻点：选中这颗纽扣，再点空孔即可移动
      const same = this.selected && this.selected.rope === d.rope && this.selected.end === d.end;
      this.selected = same ? null : { rope: d.rope, end: d.end };
    } else if (this.target >= 0) {
      this.commitMove(d.rope, d.end, this.target);
    } else {
      this.app.platform.sfx.play('drop');
    }
    this.target = -1;
    this.preview.clear();
  }

  private commitMove(rope: number, end: RopeEnd, hole: number): void {
    if (!this.puzzle.canMove(rope, end, hole)) return;
    const cleared = this.puzzle.move(rope, end, hole);
    this.stepsUsed++;
    this.app.platform.sfx.play('drop');
    this.app.platform.vibrate();
    if (cleared.length) {
      this.startClearing(cleared);
      this.afterChange();
    } else if (this.puzzle.stepsLeft <= 2 && this.puzzle.stepsLeft > 0) this.say('步数不多了喵！');
  }

  private startClearing(ids: number[]): void {
    ids.forEach((id, i) => {
      const r = this.puzzle.ropes[id];
      this.clearing.push({ color: yarnColor(r.color), ends: { ...this.disp.get(id)! }, t: -i * 0.12, slot: this.basketBalls.length + i });
    });
    this.app.platform.sfx.play('clear');
    this.app.platform.vibrate(true);
    this.catReact('happy', 1.2);
    if (!this.puzzle.isWon) this.say(TIPS_CLEAR[Math.floor(this.time * 7) % TIPS_CLEAR.length], 1.6);
  }

  // ───────────── 道具 ─────────────

  private async withProp(kind: 'scissors' | 'steps', use: () => void): Promise<void> {
    if (this.busyAd) return;
    const save = this.app.save;
    if (save[kind] <= 0) {
      this.busyAd = true;
      this.say('看个广告领道具…（演示版模拟）', 1.5);
      const ok = await this.app.platform.showRewardedAd();
      this.busyAd = false;
      if (!ok) return;
      save[kind]++;
    }
    use();
  }

  private toggleScissors(): void {
    if (this.state !== 'play' || this.clearing.length) return;
    if (this.scissorsMode) {
      this.scissorsMode = false;
      this.say('不剪啦～', 1);
      return;
    }
    this.withProp('scissors', () => {
      this.scissorsMode = true;
      this.selected = null;
      this.say('点一根要剪掉的毛线', 3);
    });
  }

  private useScissorsOn(id: number): void {
    this.app.save.scissors--;
    this.app.persist();
    this.scissorsMode = false;
    this.app.platform.sfx.play('snip');
    this.startClearing(this.puzzle.cut(id));
    this.afterChange();
  }

  private useSteps(): void {
    this.withProp('steps', () => {
      this.app.save.steps--;
      this.app.persist();
      this.puzzle.addSteps(STEP_PROP);
      this.say(`步数 +${STEP_PROP}，继续加油喵！`);
      if (this.state === 'lost') {
        this.state = 'play';
        this.cat.mood = 'idle';
      }
    });
  }

  private restart(): void {
    this.app.go(new GameScene(this.app, this.levelIndex));
  }

  // ───────────── 更新 ─────────────

  update(dt: number): void {
    this.time += dt;
    this.stateTime += dt;

    // 纽扣位置平滑地跟随目标孔位（松手后回弹 / 吸附）
    const k = 1 - Math.exp(-dt * 20);
    for (const r of this.puzzle.ropes) {
      const e = this.disp.get(r.id)!;
      const tgt = this.holeEnds(r.a, r.b);
      const dragging = this.drag && this.drag.moved && this.drag.rope === r.id ? this.drag.end : null;
      if (dragging !== 'a') {
        e.ax += (tgt.ax - e.ax) * k;
        e.ay += (tgt.ay - e.ay) * k;
      }
      if (dragging !== 'b') {
        e.bx += (tgt.bx - e.bx) * k;
        e.by += (tgt.by - e.by) * k;
      }
    }

    if (this.shake) {
      this.shake.t -= dt * 2.5;
      if (this.shake.t <= 0) this.shake = null;
    }
    for (const [id, w] of this.kittenWiggle) {
      if (w - dt * 2.5 <= 0) this.kittenWiggle.delete(id);
      else this.kittenWiggle.set(id, w - dt * 2.5);
    }
    for (const p of this.pops) p.t += dt * 1.4;
    this.pops = this.pops.filter((p) => p.t < 1);

    // 理顺的毛线：卷成球 -> 飞进篮子
    for (const c of this.clearing) {
      const before = c.t;
      c.t += dt;
      if (before < WIND_TIME + FLY_TIME && c.t >= WIND_TIME + FLY_TIME) {
        this.basketBalls.push(c.color);
        const p = basketBallPos(this.basketX, this.basketY, this.basketW, c.slot);
        this.burst(p.x, p.y, c.color, 8);
        this.cat.paw = 0.001;
      }
    }
    this.clearing = this.clearing.filter((c) => c.t < WIND_TIME + FLY_TIME);

    // 胜负判定（等动画放完）
    if (this.state === 'play' && this.clearing.length === 0 && !this.drag) {
      if (this.puzzle.isWon) this.win();
      else if (this.puzzle.isLost) this.lose();
    }

    this.updateCat(dt);
    this.updateParticles(dt);
    if (this.bubble.t > 0) this.bubble.t -= dt;
  }

  private win(): void {
    this.state = 'won';
    this.stateTime = 0;
    const par = this.puzzle.level.par;
    this.earnedStars = this.stepsUsed <= par ? 3 : this.stepsUsed <= par + 2 ? 2 : 1;
    const save = this.app.save;
    save.stars[this.levelIndex] = Math.max(save.stars[this.levelIndex] ?? 0, this.earnedStars);
    save.unlocked = Math.max(save.unlocked, Math.min(this.levelIndex + 1, LEVELS.length - 1));
    this.app.persist();
    this.app.platform.sfx.play('win');
    this.catReact('happy', 999);
    this.say('全部理好啦！', 3);
    const { width: W } = this.app.info;
    for (let i = 0; i < 36; i++) {
      const kinds: Particle['kind'][] = ['heart', 'star', 'paw', 'dot'];
      this.particles.push({
        x: W * Math.random(),
        y: this.topY - 20,
        vx: (Math.random() - 0.5) * 80,
        vy: 60 + Math.random() * 120,
        life: 0,
        max: 2.4 + Math.random(),
        kind: kinds[i % 4],
        color: yarnColor(i),
        size: 7 + Math.random() * 6,
        rot: Math.random() * 6,
      });
    }
  }

  private lose(): void {
    this.state = 'lost';
    this.stateTime = 0;
    this.app.platform.sfx.play('lose');
    this.catReact('sad', 999);
    this.scissorsMode = false;
    this.selected = null;
  }

  private updateCat(dt: number): void {
    const cat = this.cat;
    cat.tail += dt * (cat.mood === 'happy' ? 6 : 2.2);
    this.blinkTimer -= dt;
    if (this.blinkTimer < 0) {
      cat.blink = Math.min(1, cat.blink + dt * 12);
      if (this.blinkTimer < -0.16) {
        this.blinkTimer = 2 + Math.random() * 3;
        cat.blink = 0;
      }
    }
    if (cat.paw > 0) {
      cat.paw += dt * 3;
      if (cat.paw >= 1) cat.paw = 0;
    }
    if (this.catMoodTimer > 0) {
      this.catMoodTimer -= dt;
      if (this.catMoodTimer <= 0 && this.state === 'play') cat.mood = 'idle';
    }
    if (this.state === 'play' && this.drag?.moved && cat.mood === 'idle') cat.mood = 'surprised';
    if (this.state === 'play' && !this.drag && cat.mood === 'surprised') cat.mood = 'idle';
    cat.hop = this.state === 'won' ? Math.abs(Math.sin(this.stateTime * 6)) * Math.max(0, 1 - this.stateTime / 2.5) : 0;

    // 眼睛看手指 / 看篮子
    let lx = 0;
    let ly = 0;
    if (this.drag) {
      const p = toScreen(this.layout, this.drag.gx, this.drag.gy);
      const dx = p.x - this.catX;
      const dy = p.y - (this.catY - this.catS * 2);
      const l = Math.hypot(dx, dy) || 1;
      lx = dx / l;
      ly = dy / l;
    } else if (this.clearing.length) {
      lx = -1;
      ly = 0.3;
    }
    cat.lookX += (lx - cat.lookX) * Math.min(1, dt * 8);
    cat.lookY += (ly - cat.lookY) * Math.min(1, dt * 8);
  }

  private burst(x: number, y: number, color: string, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const v = 60 + Math.random() * 80;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 40,
        life: 0,
        max: 0.6 + Math.random() * 0.3,
        kind: i % 3 === 0 ? 'heart' : 'dot',
        color,
        size: 3 + Math.random() * 3,
        rot: 0,
      });
    }
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.kind === 'dot' ? 260 : 40) * dt;
      p.rot += dt * 2;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
  }

  // ───────────── 绘制 ─────────────

  draw(ctx: Ctx2D): void {
    this.app.drawBackground(ctx);
    this.drawBoardCached(ctx);
    this.drawLocks(ctx);
    this.drawHoleHints(ctx);
    this.drawRopes(ctx);
    this.drawKittens(ctx);
    this.drawClearing(ctx);
    this.drawPops(ctx);
    this.drawTutorialHand(ctx);
    this.drawCatArea(ctx);
    this.drawTopBar(ctx);
    this.drawProps(ctx);
    this.drawParticles(ctx);
    if (this.state === 'won' && this.stateTime > 0.9) this.drawWinPanel(ctx);
    if (this.state === 'lost' && this.stateTime > 0.5) this.drawLosePanel(ctx);
    if (this.intro) this.drawIntro(ctx, this.intro);
  }

  private drawLocks(ctx: Ctx2D): void {
    const r = this.layout.cell * 0.25;
    for (const [h, key] of this.puzzle.activeLocks()) {
      const g = this.puzzle.geo.pos(h);
      const p = toScreen(this.layout, g.x, g.y);
      drawLock(ctx, p.x, p.y, r, yarnColor(this.puzzle.ropes[key].color), this.time + h);
    }
  }

  private drawKittens(ctx: Ctx2D): void {
    const s = this.layout.cell * 0.36;
    for (const r of this.puzzle.aliveRopes) {
      const n = this.puzzle.sleepLeft(r.id);
      if (n <= 0) continue;
      const m = this.ropeMid(r.id);
      drawKitten(ctx, m.x, m.y - s * 0.1, s, this.time + r.id, n, 0, this.kittenWiggle.get(r.id) ?? 0);
    }
  }

  private drawPops(ctx: Ctx2D): void {
    for (const p of this.pops) {
      if (p.kind === 'lock') drawLock(ctx, p.x, p.y, this.layout.cell * 0.25, p.color, this.time, p.t);
      else drawKitten(ctx, p.x + p.t * this.layout.cell * 0.8, p.y, this.layout.cell * 0.36, this.time, 0, Math.max(0.01, p.t));
    }
  }

  /** 新机制介绍卡片 */
  private drawIntro(ctx: Ctx2D, m: Mechanic): void {
    this.clearButtons();
    const { width: W, height: H } = this.app.info;
    this.dim(ctx, 1);
    const pw = Math.min(W - 48, 320);
    const ph = 250 + m.lines.length * 22;
    const x = W / 2 - pw / 2;
    const y = H / 2 - ph / 2;
    panel(ctx, x, y, pw, ph, 26);
    roundRectFill(ctx, W / 2 - 46, y - 14, 92, 28, 14, THEME.accent);
    text(ctx, '新玩法', W / 2, y, 14, '#FFFFFF');
    text(ctx, m.title, W / 2, y + 40, 22, THEME.text);
    const cy = y + 104;
    const r = 26;
    fillCircle(ctx, W / 2, cy, 50, THEME.board);
    if (m.key === 'fixed') drawButton(ctx, W / 2, cy, r, yarnColor(6), { sewn: true });
    else if (m.key === 'sleepers') {
      drawYarn(ctx, [{ x: W / 2 - 46, y: cy + 6 }, { x: W / 2 + 46, y: cy + 6 }], yarnColor(5), { width: 9 });
      drawKitten(ctx, W / 2, cy, 30, this.time, 2);
    } else drawLock(ctx, W / 2, cy + 4, r, yarnColor(7), this.time);
    m.lines.forEach((ln, i) => text(ctx, ln, W / 2, y + 172 + i * 22, 15, THEME.textLight, { weight: 'normal' }));
    const by = y + ph - 70;
    const p = this.button('intro-ok', x + 40, by, pw - 80, 50, () => (this.intro = null));
    pillButton(ctx, x + 40, by, pw - 80, 50, '知道了', '#79C267', p);
  }

  /** 卡死时用剪刀救场 */
  private rescueWithScissors(): void {
    this.state = 'play';
    this.cat.mood = 'idle';
    this.toggleScissors();
  }

  private drawBoardCached(ctx: Ctx2D): void {
    const { width: W, height: H, dpr } = this.app.info;
    if (!this.boardCache) {
      this.boardCache = this.app.platform.createOffscreen(Math.round(W * dpr), Math.round(H * dpr));
      this.boardCache.ctx.scale(dpr, dpr);
      drawBoard(this.boardCache.ctx, this.puzzle.geo, this.layout);
    }
    ctx.drawImage(this.boardCache.canvas, 0, 0, W, H);
  }

  /** 拖动或选中纽扣时，提示可以放的空孔 */
  private drawHoleHints(ctx: Ctx2D): void {
    const active = this.drag?.moved ? this.drag : this.selected;
    if (!active) return;
    const color = yarnColor(this.puzzle.ropes[active.rope].color);
    const geo = this.puzzle.geo;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 6);
    for (let h = 0; h < geo.holeCount; h++) {
      if (!this.puzzle.isFreeHole(h)) continue;
      const g = geo.pos(h);
      const p = toScreen(this.layout, g.x, g.y);
      const r = this.layout.cell * 0.25;
      if (h === this.target) {
        fillCircle(ctx, p.x, p.y, r * 1.45, shade(color, 0.3, 0.55));
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 1.45, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        fillCircle(ctx, p.x, p.y, r * (0.45 + pulse * 0.1), 'rgba(255,255,255,0.75)');
      }
    }
  }

  private drawRopes(ctx: Ctx2D): void {
    const cell = this.layout.cell;
    const yarnW = cell * 0.17;
    const pinR = cell * 0.25;
    const draggingId = this.drag?.moved ? this.drag.rope : -1;
    const ropes = this.puzzle.aliveRopes.sort((p, q) => {
      if (p.id === draggingId) return 1;
      if (q.id === draggingId) return -1;
      return p.z - q.z;
    });
    const scissorPulse = this.scissorsMode ? 0.5 + 0.5 * Math.sin(this.time * 8) : 0;
    for (const r of ropes) {
      const e = this.disp.get(r.id)!;
      const color = yarnColor(r.color);
      const lifted = r.id === draggingId;
      drawYarn(ctx, this.screenCurve(e), color, {
        width: yarnW,
        lift: lifted ? 1 : 0,
        glow: this.preview.has(r.id) || (this.scissorsMode && scissorPulse > 0.5),
      });
      const pa = toScreen(this.layout, e.ax, e.ay);
      const pb = toScreen(this.layout, e.bx, e.by);
      const sel = this.selected && this.selected.rope === r.id ? this.selected.end : null;
      const dragEnd = lifted ? this.drag!.end : null;
      const ring = 'rgba(255,255,255,0.95)';
      const sh = (end: RopeEnd) => (this.shake && this.shake.rope === r.id && this.shake.end === end ? this.shake.t : 0);
      drawButton(ctx, pa.x, pa.y, pinR, color, {
        lift: dragEnd === 'a' ? 1 : 0,
        ring: sel === 'a' ? ring : undefined,
        sewn: this.puzzle.isFixed(r.id, 'a'),
        shake: sh('a'),
      });
      drawButton(ctx, pb.x, pb.y, pinR, color, {
        lift: dragEnd === 'b' ? 1 : 0,
        ring: sel === 'b' ? ring : undefined,
        sewn: this.puzzle.isFixed(r.id, 'b'),
        shake: sh('b'),
      });
    }
  }

  private drawClearing(ctx: Ctx2D): void {
    const cell = this.layout.cell;
    for (const c of this.clearing) {
      if (c.t < 0) {
        // 排队中：照常显示
        drawYarn(ctx, this.screenCurve(c.ends), c.color, { width: cell * 0.17, glow: true });
        continue;
      }
      const full = this.screenCurve(c.ends);
      const mid = full[Math.floor(full.length / 2)];
      const ballR = cell * 0.22;
      if (c.t < WIND_TIME) {
        // 毛线两端向中间收，中间长出一个毛线球
        const u = c.t / WIND_TIME;
        const n = full.length - 1;
        const cut = Math.floor((n / 2) * u);
        const pts = full.slice(cut, n - cut + 1);
        if (pts.length >= 2) drawYarn(ctx, pts, c.color, { width: cell * 0.17 });
        drawYarnBall(ctx, mid.x, mid.y, ballR * Math.min(1, u * 1.4), c.color, u * 8);
      } else {
        // 抛物线飞进篮子
        const u = Math.min(1, (c.t - WIND_TIME) / FLY_TIME);
        const e = u * u * (3 - 2 * u);
        const dst = basketBallPos(this.basketX, this.basketY, this.basketW, c.slot);
        const cx = (mid.x + dst.x) / 2;
        const cy = Math.min(mid.y, dst.y) - 90;
        const x = (1 - e) * (1 - e) * mid.x + 2 * (1 - e) * e * cx + e * e * dst.x;
        const y = (1 - e) * (1 - e) * mid.y + 2 * (1 - e) * e * cy + e * e * dst.y;
        drawYarnBall(ctx, x, y, ballR + (dst.r - ballR) * e, c.color, 2.5 + u * 10);
      }
    }
  }

  /** 第一关的新手引导：手指示范把左下角纽扣拖到右边的空孔 */
  private drawTutorialHand(ctx: Ctx2D): void {
    if (this.levelIndex !== 0 || this.interacted || this.state !== 'play') return;
    const t = (this.time % 2.2) / 2.2;
    const from = toScreen(this.layout, 0, 2);
    const to = toScreen(this.layout, 2, 1);
    const u = Math.max(0, Math.min(1, (t - 0.15) / 0.6));
    const e = u * u * (3 - 2 * u);
    const x = from.x + (to.x - from.x) * e;
    const y = from.y + (to.y - from.y) * e;
    const alpha = t > 0.85 ? (1 - t) / 0.15 : 1;
    ctx.save();
    ctx.globalAlpha = alpha * 0.9;
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);
    // 小猫爪当手指
    fillCircle(ctx, x + 10, y + 14, 20, 'rgba(255,255,255,0.85)');
    pawPrint(ctx, x + 10, y + 16, 18, THEME.catBody, 0.3);
    ctx.restore();
  }

  private drawCatArea(ctx: Ctx2D): void {
    drawBasket(ctx, this.basketX, this.basketY, this.basketW, this.basketBalls);
    const total = this.puzzle.ropes.length;
    text(ctx, `${this.basketBalls.length}/${total}`, this.basketX, this.basketY + this.basketW * 0.3, 13, '#FFFFFF', {
      stroke: THEME.basketDark,
      strokeW: 4,
    });
    drawCat(ctx, this.catX, this.catY, this.catS, this.cat);
    const alpha = Math.min(1, this.bubble.t * 3);
    speechBubble(ctx, this.basketX - this.basketW * 0.55 - 6, this.catY - this.catS * 1.9, this.bubble.msg, alpha);
  }

  private drawTopBar(ctx: Ctx2D): void {
    const { width: W } = this.app.info;
    const y = this.topY;
    // 步数
    const steps = this.puzzle.stepsLeft;
    const low = steps <= Math.min(2, this.puzzle.level.steps - 2);
    catEarPanel(ctx, 14, y + 4, 78, 50, 16);
    text(ctx, '步数', 53, y + 18, 12, THEME.textLight);
    const pop = low ? 1 + 0.08 * Math.sin(this.time * 10) : 1;
    text(ctx, String(steps), 53, y + 37, 22 * pop, low ? THEME.danger : THEME.text);
    // 关卡
    panel(ctx, W / 2 - 52, y + 8, 104, 36, 18);
    text(ctx, `第 ${this.levelIndex + 1} 关`, W / 2, y + 26, 17, THEME.text);
    // 重来、首页
    const r = 22;
    const rx = W - 14 - r;
    const pr = this.button('restart', rx - r, y + 4, r * 2, r * 2, () => this.restart());
    roundButton(ctx, rx, y + 4 + r, r, pr);
    iconRestart(ctx, rx, y + 4 + r + (pr ? 2 : 0), r * 0.85);
    const hx = rx - r * 2 - 10;
    const ph = this.button('home', hx - r, y + 4, r * 2, r * 2, () => this.app.go(new TitleScene(this.app)));
    roundButton(ctx, hx, y + 4 + r, r, ph);
    iconHome(ctx, hx, y + 4 + r + (ph ? 2 : 0), r * 0.8);
  }

  private drawProps(ctx: Ctx2D): void {
    const { width: W } = this.app.info;
    const y = this.bottomY;
    const r = 28;
    const save = this.app.save;
    const sx = W / 2 - 50;
    const ps = this.button('scissors', sx - r, y - r, r * 2, r * 2, () => this.toggleScissors());
    roundButton(ctx, sx, y, r, ps, this.scissorsMode);
    iconScissors(ctx, sx, y + (ps ? 2 : 0), r * 1.1);
    badge(ctx, sx + r * 0.75, y - r * 0.7, save.scissors > 0 ? String(save.scissors) : '▶', save.scissors > 0 ? THEME.danger : '#79C267');
    text(ctx, '剪刀', sx, y + r + 12, 12, THEME.textLight);

    const tx = W / 2 + 50;
    const pt = this.button('steps', tx - r, y - r, r * 2, r * 2, () => this.useSteps());
    roundButton(ctx, tx, y, r, pt);
    iconSteps(ctx, tx, y + (pt ? 2 : 0), r * 1.1);
    badge(ctx, tx + r * 0.75, y - r * 0.7, save.steps > 0 ? String(save.steps) : '▶', save.steps > 0 ? THEME.danger : '#79C267');
    text(ctx, '加步数', tx, y + r + 12, 12, THEME.textLight);
  }

  private drawParticles(ctx: Ctx2D): void {
    for (const p of this.particles) {
      const a = 1 - p.life / p.max;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, a * 1.5));
      if (p.kind === 'heart') heart(ctx, p.x, p.y, p.size, p.color);
      else if (p.kind === 'star') star(ctx, p.x, p.y, p.size, p.color);
      else if (p.kind === 'paw') pawPrint(ctx, p.x, p.y, p.size, p.color, p.rot);
      else fillCircle(ctx, p.x, p.y, p.size * 0.6, p.color);
      ctx.restore();
    }
  }

  private dim(ctx: Ctx2D, t: number): void {
    const { width: W, height: H } = this.app.info;
    ctx.fillStyle = `rgba(80,50,25,${Math.min(0.45, t * 1.2)})`;
    ctx.fillRect(0, 0, W, H);
  }

  private drawWinPanel(ctx: Ctx2D): void {
    const t = this.stateTime - 0.9;
    this.clearButtons();
    this.dim(ctx, t);
    const { width: W, height: H } = this.app.info;
    const pw = Math.min(W - 48, 320);
    const ph = 290;
    const s = Math.min(1, t * 4);
    const pop = 1 + Math.sin(s * Math.PI) * 0.08;
    const x = W / 2 - pw / 2;
    const y = H / 2 - ph / 2;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(s * pop, s * pop);
    ctx.translate(-W / 2, -H / 2);
    const peek = { ...this.cat, mood: 'happy' as const, hop: 0, paw: 0 };
    drawCat(ctx, W / 2, y + 44, 28, peek);
    panel(ctx, x, y, pw, ph, 26);
    for (const side of [-1, 1]) {
      // 搭在卡片边上的两只小爪子
      ellipseFill(ctx, W / 2 + side * 22, y + 2, 13, 9, THEME.catCream, THEME.catLine);
    }
    const last = this.levelIndex >= LEVELS.length - 1;
    text(ctx, last ? '全部通关啦！' : '理好啦！', W / 2, y + 44, 26, THEME.text);
    for (let i = 0; i < 3; i++) {
      const on = i < this.earnedStars && t > 0.25 + i * 0.2;
      const sx = W / 2 + (i - 1) * 58;
      const sy = y + 102 - (i === 1 ? 10 : 0);
      star(ctx, sx, sy, i === 1 ? 28 : 23, on ? '#F7C843' : '#EADBC6', on ? '#D9962B' : '#D8C6AE');
    }
    text(ctx, `用了 ${this.stepsUsed} 步 · 参考 ${this.puzzle.level.par} 步`, W / 2, y + 152, 14, THEME.textLight, { weight: 'normal' });
    ctx.restore();
    if (s < 1) return;
    const bw = pw - 64;
    if (last) {
      const p = this.button('home2', x + 32, y + 182, bw, 52, () => this.app.go(new TitleScene(this.app)));
      pillButton(ctx, x + 32, y + 182, bw, 52, '回到首页', THEME.accent, p);
    } else {
      const p = this.button('next', x + 32, y + 182, bw, 52, () => this.app.go(new GameScene(this.app, this.levelIndex + 1)));
      pillButton(ctx, x + 32, y + 182, bw, 52, '下一关', THEME.accent, p);
    }
    const pr = this.button('replay', W / 2 - 60, y + 244, 120, 34, () => this.restart());
    text(ctx, '再玩一次', W / 2, y + 261 + (pr ? 2 : 0), 15, THEME.textLight);
  }

  private drawLosePanel(ctx: Ctx2D): void {
    const t = this.stateTime - 0.5;
    this.clearButtons();
    this.dim(ctx, t);
    const { width: W, height: H } = this.app.info;
    const pw = Math.min(W - 48, 320);
    const ph = 300;
    const s = Math.min(1, t * 4);
    const x = W / 2 - pw / 2;
    const y = H / 2 - ph / 2;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(s, s);
    ctx.translate(-W / 2, -H / 2);
    panel(ctx, x, y, pw, ph, 26);
    const stuck = this.puzzle.stepsLeft > 0;
    text(ctx, stuck ? '没有能动的纽扣了…' : '步数用完啦…', W / 2, y + 42, 22, THEME.text);
    const left = this.puzzle.aliveRopes;
    text(ctx, `还有 ${left.length} 团毛线没理好`, W / 2, y + 78, 14, THEME.textLight, { weight: 'normal' });
    left.slice(0, 6).forEach((r, i) => {
      const n = Math.min(6, left.length);
      drawYarnBall(ctx, W / 2 + (i - (n - 1) / 2) * 34, y + 118, 13, yarnColor(r.color), i);
    });
    ctx.restore();
    if (s < 1) return;
    const bw = pw - 64;
    const label = stuck
      ? this.app.save.scissors > 0
        ? `用剪刀剪一根（剩 ${this.app.save.scissors}）`
        : '看广告领剪刀'
      : this.app.save.steps > 0
        ? `用道具 +${STEP_PROP} 步（剩 ${this.app.save.steps}）`
        : `看广告 +${STEP_PROP} 步`;
    const p1 = this.button('more', x + 32, y + 160, bw, 52, () => (stuck ? this.rescueWithScissors() : this.useSteps()));
    pillButton(ctx, x + 32, y + 160, bw, 52, label, '#79C267', p1);
    const p2 = this.button('retry', x + 32, y + 226, bw, 48, () => this.restart());
    pillButton(ctx, x + 32, y + 226, bw, 48, '重新开始', THEME.accent, p2);
  }
}

function roundRectFill(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number, color: string): void {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function ellipseFill(ctx: Ctx2D, x: number, y: number, rx: number, ry: number, fill: string, stroke: string): void {
  ellipsePath(ctx, x, y, rx, ry);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
}
