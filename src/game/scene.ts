import { Ctx2D } from '../platform/types';
import { hit, HitButton } from '../render/ui';
import type { App } from './app';

export abstract class Scene {
  private buttons: HitButton[] = [];
  private pressedId: string | null = null;
  private pressedAt = 0;
  private releasedId: string | null = null;
  private releasedAt = 0;

  constructor(protected app: App) {}

  abstract update(dt: number): void;
  abstract draw(ctx: Ctx2D): void;
  /** 未命中按钮时的触摸事件，交给具体场景处理 */
  protected pointerDown(_x: number, _y: number): void {}
  protected pointerMove(_x: number, _y: number): void {}
  protected pointerUp(_x: number, _y: number): void {}
  onResize(): void {}

  render(ctx: Ctx2D): void {
    this.buttons = [];
    this.draw(ctx);
  }

  /** 渲染时登记一个按钮，返回是否处于按下状态 */
  protected button(id: string, x: number, y: number, w: number, h: number, onTap: () => void): boolean {
    this.buttons.push({ id, x, y, w, h, onTap });
    return this.pressedId === id;
  }

  /**
   * 按钮的弹性缩放：按下时缩到 0.9，松手后带回弹地恢复。
   * 绘制按钮前用 ctx.translate + scale 套上即可。
   */
  protected buttonScale(id: string): number {
    const now = this.app.platform.now();
    if (this.pressedId === id) return 1 - 0.1 * Math.min(1, (now - this.pressedAt) / 60);
    if (this.releasedId === id) {
      const t = (now - this.releasedAt) / 1000;
      if (t < 0.45) return 1 + 0.1 * Math.exp(-t * 9) * Math.sin(t * 28) - 0.1 * Math.exp(-t * 14);
    }
    return 1;
  }

  /** 以 (cx, cy) 为中心按按钮弹性缩放后执行绘制 */
  protected withPress(ctx: Ctx2D, id: string, cx: number, cy: number, draw: () => void): void {
    const k = this.buttonScale(id);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(k, k);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }

  /** 让场景在有弹窗时屏蔽下层按钮 */
  protected clearButtons(): void {
    this.buttons = [];
  }

  down(x: number, y: number): void {
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      if (hit(this.buttons[i], x, y)) {
        // 手指一按下就给反馈：轻震 + 咔哒声，按钮同时下沉
        this.pressedId = this.buttons[i].id;
        this.pressedAt = this.app.platform.now();
        this.app.platform.haptic('light');
        this.app.platform.sfx.play('tap');
        return;
      }
    }
    this.pointerDown(x, y);
  }

  move(x: number, y: number): void {
    if (this.pressedId === null) this.pointerMove(x, y);
  }

  up(x: number, y: number): void {
    if (this.pressedId !== null) {
      const b = this.buttons.find((btn) => btn.id === this.pressedId);
      this.pressedId = null;
      if (b && hit(b, x, y)) {
        this.releasedId = b.id;
        this.releasedAt = this.app.platform.now();
        b.onTap();
      }
      return;
    }
    this.pointerUp(x, y);
  }
}
