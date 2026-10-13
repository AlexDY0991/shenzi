import { Ctx2D } from '../platform/types';
import { hit, HitButton } from '../render/ui';
import type { App } from './app';

export abstract class Scene {
  private buttons: HitButton[] = [];
  private pressedId: string | null = null;

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

  /** 让场景在有弹窗时屏蔽下层按钮 */
  protected clearButtons(): void {
    this.buttons = [];
  }

  down(x: number, y: number): void {
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      if (hit(this.buttons[i], x, y)) {
        this.pressedId = this.buttons[i].id;
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
        this.app.platform.sfx.play('tap');
        b.onTap();
      }
      return;
    }
    this.pointerUp(x, y);
  }
}
