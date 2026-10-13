import { ropeCurve } from '../core/geometry';
import { Ctx2D } from '../platform/types';
import { CatState, drawCat, newCatState } from '../render/cat';
import { THEME, yarnColor } from '../render/colors';
import { pawPrint, roundRectPath, star, text } from '../render/shapes';
import { panel, pillButton } from '../render/ui';
import { drawYarn, drawYarnBall } from '../render/yarn';
import type { App } from './app';
import { DEMO_UNLOCK_ALL, LEVELS } from './levels';
import { GameScene } from './game-scene';
import { Scene } from './scene';

export class TitleScene extends Scene {
  private time = 0;
  private cat: CatState = newCatState();
  private blinkTimer = 1.5;
  private showLevels = false;

  constructor(app: App) {
    super(app);
  }

  update(dt: number): void {
    this.time += dt;
    this.cat.tail += dt * 2.5;
    this.cat.paw = (this.time * 0.8) % 1 < 0.5 ? ((this.time * 0.8) % 1) * 2 : 0;
    this.blinkTimer -= dt;
    if (this.blinkTimer < 0) {
      this.cat.blink = 1;
      if (this.blinkTimer < -0.15) {
        this.cat.blink = 0;
        this.blinkTimer = 2 + Math.random() * 3;
      }
    }
    this.cat.lookX = 0.8;
    this.cat.lookY = 0.6;
  }

  private start(i: number): void {
    this.app.go(new GameScene(this.app, i));
  }

  draw(ctx: Ctx2D): void {
    const { width: W, height: H, safeTop } = this.app.info;
    this.app.drawBackground(ctx);

    // 标题
    const ty = safeTop + Math.max(70, H * 0.13);
    const bob = Math.sin(this.time * 2) * 3;
    text(ctx, '喵喵理毛线', W / 2, ty + bob, Math.min(48, W * 0.12), '#F39A3D', { stroke: '#FFFFFF', strokeW: 10 });
    text(ctx, '解开毛线 · 治愈烧脑', W / 2, ty + 46, 15, THEME.textLight, { weight: 'normal' });

    // 小猫拍毛线球
    const s = Math.min(58, W * 0.14, H * 0.065);
    const cx = W / 2 - s * 0.6;
    const cy = H * 0.6;
    const ballX = cx + s * 2.3;
    const ballY = cy - s * 0.35 - Math.abs(Math.sin(this.time * 2.5)) * s * 0.35;
    const pts = ropeCurve(0, 0, 1, 0.3).map((p) => ({
      x: cx + s * 0.6 + p.x * (ballX - cx - s * 0.6),
      y: cy - s * 0.15 + p.y * s * 1.2 + (ballY - cy) * p.x,
    }));
    drawYarn(ctx, pts, yarnColor(7), { width: 6 });
    drawCat(ctx, cx, cy, s, this.cat);
    drawYarnBall(ctx, ballX, ballY, s * 0.42, yarnColor(7), this.time * 2);
    drawYarnBall(ctx, cx - s * 2.1, cy - s * 0.3, s * 0.34, yarnColor(5), 0.4);
    drawYarnBall(ctx, cx - s * 1.5, cy - s * 0.25, s * 0.26, yarnColor(3), 1.2);

    // 按钮
    const bw = Math.min(260, W - 80);
    const by = H * 0.7;
    const next = Math.min(this.app.save.unlocked, LEVELS.length - 1);
    const p1 = this.button('play', W / 2 - bw / 2, by, bw, 58, () => this.start(next));
    pillButton(ctx, W / 2 - bw / 2, by, bw, 58, next === 0 ? '开始游戏' : `继续 · 第 ${next + 1} 关`, THEME.accent, p1);
    const p2 = this.button('levels', W / 2 - bw / 2, by + 74, bw, 50, () => (this.showLevels = true));
    pillButton(ctx, W / 2 - bw / 2, by + 74, bw, 50, '选择关卡', '#79C267', p2);
    const sound = this.app.save.sound;
    const p3 = this.button('sound', W / 2 - 60, by + 136, 120, 36, () => {
      this.app.save.sound = !sound;
      this.app.platform.sfx.enabled = !sound;
      this.app.persist();
    });
    text(ctx, sound ? '音效：开' : '音效：关', W / 2, by + 154 + (p3 ? 2 : 0), 14, THEME.textLight);
    text(ctx, '演示版 Demo', W / 2, H - this.app.info.safeBottom - 16, 11, '#C9AE8C', { weight: 'normal' });

    if (this.showLevels) this.drawLevelSelect(ctx);
  }

  private drawLevelSelect(ctx: Ctx2D): void {
    this.clearButtons();
    const { width: W, height: H } = this.app.info;
    ctx.fillStyle = 'rgba(80,50,25,0.45)';
    ctx.fillRect(0, 0, W, H);
    this.button('dismiss', 0, 0, W, H, () => (this.showLevels = false));
    const cols = 5;
    const rows = Math.ceil(LEVELS.length / cols);
    const pw = Math.min(W - 32, 360);
    const tile = (pw - 40) / cols;
    const ph = 84 + rows * tile + 20;
    const x = W / 2 - pw / 2;
    const y = H / 2 - ph / 2;
    panel(ctx, x, y, pw, ph, 24);
    this.button('panel', x, y, pw, ph, () => undefined);
    text(ctx, '选择关卡', W / 2, y + 34, 20, THEME.text);
    const close = this.button('close', x + pw - 50, y + 12, 40, 40, () => (this.showLevels = false));
    text(ctx, '✕', x + pw - 30, y + 32 + (close ? 2 : 0), 20, THEME.textLight);
    LEVELS.forEach((_, i) => {
      const tx = x + 20 + (i % cols) * tile;
      const ty = y + 64 + Math.floor(i / cols) * tile;
      const open = DEMO_UNLOCK_ALL || i <= this.app.save.unlocked;
      const pressed = open ? this.button(`lv${i}`, tx + 4, ty + 4, tile - 8, tile - 8, () => this.start(i)) : false;
      const dy = pressed ? 2 : 0;
      roundRectPath(ctx, tx + 4, ty + 7, tile - 8, tile - 8, 14);
      ctx.fillStyle = open ? '#E3B57A' : '#DCCDB8';
      ctx.fill();
      roundRectPath(ctx, tx + 4, ty + 4 + dy, tile - 8, tile - 8, 14);
      ctx.fillStyle = open ? '#FFE3BC' : '#EEE4D6';
      ctx.fill();
      const mx = tx + tile / 2;
      if (open) {
        text(ctx, String(i + 1), mx, ty + tile * 0.42 + dy, tile * 0.3, THEME.text);
        const got = this.app.save.stars[i] ?? 0;
        for (let k = 0; k < 3; k++) {
          star(ctx, mx + (k - 1) * tile * 0.2, ty + tile * 0.72 + dy, tile * 0.085, k < got ? '#F7C843' : '#E2CFB5');
        }
      } else {
        pawPrint(ctx, mx, ty + tile / 2, tile * 0.22, '#CBB79C');
      }
    });
  }
}
