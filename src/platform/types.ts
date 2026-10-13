// 平台适配接口：游戏代码只依赖这里，网页 / 微信小游戏 / iOS(WebView) 各自实现。
// 注意：游戏代码中禁止直接使用 window / document / localStorage / navigator 等浏览器全局对象。

export type Ctx2D = CanvasRenderingContext2D;

export interface Surface {
  canvas: HTMLCanvasElement; // 微信中是 wx.createCanvas() 的返回值，API 兼容
  ctx: Ctx2D;
}

export interface ScreenInfo {
  /** 逻辑宽高（CSS 像素） */
  width: number;
  height: number;
  dpr: number;
  /** 顶部安全区（刘海 / 微信胶囊按钮下沿） */
  safeTop: number;
  safeBottom: number;
}

export interface TouchHandlers {
  start(x: number, y: number): void;
  move(x: number, y: number): void;
  end(x: number, y: number): void;
}

export interface Sfx {
  /** 播放一个合成音效（无音频资源，全部实时合成） */
  play(name: 'pick' | 'drop' | 'clear' | 'win' | 'lose' | 'tap' | 'snip'): void;
  enabled: boolean;
}

export interface Platform {
  readonly name: 'web' | 'wechat';
  readonly screen: Surface;
  getScreenInfo(): ScreenInfo;
  onResize(cb: () => void): void;
  onTouch(h: TouchHandlers): void;
  requestFrame(cb: (t: number) => void): void;
  now(): number;
  createOffscreen(width: number, height: number): Surface;
  storageGet(key: string): string | null;
  storageSet(key: string, value: string): void;
  vibrate(strong?: boolean): void;
  sfx: Sfx;
  /** 激励视频广告；网页版用模拟，微信版接 wx.createRewardedVideoAd */
  showRewardedAd(): Promise<boolean>;
}
