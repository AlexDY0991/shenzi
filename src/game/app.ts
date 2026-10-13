import { Ctx2D, Platform, ScreenInfo, Surface } from '../platform/types';
import { drawBackground } from '../render/board';
import { loadSave, SaveData, writeSave } from './save';
import { Scene } from './scene';
import { TitleScene } from './title-scene';

export class App {
  info: ScreenInfo;
  save: SaveData;
  private scene: Scene;
  private last = 0;

  constructor(readonly platform: Platform) {
    this.info = platform.getScreenInfo();
    this.save = loadSave(platform);
    platform.sfx.enabled = this.save.sound;
    this.scene = new TitleScene(this);
    platform.onResize(() => {
      this.info = platform.getScreenInfo();
      this.scene.onResize();
    });
    platform.onTouch({
      start: (x, y) => this.scene.down(x, y),
      move: (x, y) => this.scene.move(x, y),
      end: (x, y) => this.scene.up(x, y),
    });
    this.last = platform.now();
    platform.requestFrame(this.frame);
  }

  private bg: Surface | null = null;
  private bgKey = '';

  /** 背景画一次缓存到离屏画布 */
  drawBackground(ctx: Ctx2D): void {
    const { width: w, height: h, dpr } = this.info;
    if (w < 1 || h < 1) return;
    const key = `${w}x${h}@${dpr}`;
    if (!this.bg || this.bgKey !== key) {
      this.bg = this.platform.createOffscreen(Math.round(w * dpr), Math.round(h * dpr));
      this.bg.ctx.scale(dpr, dpr);
      drawBackground(this.bg.ctx, w, h);
      this.bgKey = key;
    }
    ctx.drawImage(this.bg.canvas, 0, 0, w, h);
  }

  private fade = 0;

  go(scene: Scene): void {
    this.scene = scene;
    this.fade = 1;
  }

  persist(): void {
    writeSave(this.platform, this.save);
  }

  private frame = (): void => {
    const now = this.platform.now();
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.scene.update(dt);
    const { ctx } = this.platform.screen;
    const { dpr, width, height } = this.info;
    if (width < 1 || height < 1) {
      // 画布不可见（例如被隐藏的 iframe）时跳过绘制
      this.platform.requestFrame(this.frame);
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.scene.render(ctx);
    if (this.fade > 0) {
      // 切换场景时淡入
      ctx.fillStyle = `rgba(255,244,232,${this.fade})`;
      ctx.fillRect(0, 0, this.info.width, this.info.height);
      this.fade = Math.max(0, this.fade - dt * 4);
    }
    this.platform.requestFrame(this.frame);
  };
}
