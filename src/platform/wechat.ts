import { createSynth, AudioCtxLike } from './synth';
import { Platform, ScreenInfo, Surface, TouchHandlers } from './types';

// 微信小游戏全局对象
declare const wx: any;
declare function requestAnimationFrame(cb: (t: number) => void): number;

/** 激励视频广告位 ID：在微信公众平台开通流量主后填入 */
const REWARDED_AD_UNIT_ID = '';

export function createWechatPlatform(): Platform {
  const sys = wx.getSystemInfoSync();
  // 第一次调用 wx.createCanvas() 得到的是上屏画布
  const canvas = wx.createCanvas();
  const dpr = Math.min(sys.pixelRatio || 2, 3);
  canvas.width = Math.round(sys.windowWidth * dpr);
  canvas.height = Math.round(sys.windowHeight * dpr);
  const ctx = canvas.getContext('2d');

  let safeTop = sys.safeArea ? sys.safeArea.top : sys.statusBarHeight || 20;
  try {
    // 右上角胶囊按钮下沿，HUD 要放在它下面
    const menu = wx.getMenuButtonBoundingClientRect();
    if (menu && menu.bottom) safeTop = Math.max(safeTop, menu.bottom + 4);
  } catch {
    // 低版本基础库
  }
  const safeBottom = sys.safeArea ? Math.max(0, sys.windowHeight - sys.safeArea.bottom) : 0;

  let audio: AudioCtxLike | null = null;
  try {
    audio = wx.createWebAudioContext ? wx.createWebAudioContext() : null;
  } catch {
    audio = null;
  }

  let rewardedAd: any = null;
  if (REWARDED_AD_UNIT_ID && wx.createRewardedVideoAd) {
    rewardedAd = wx.createRewardedVideoAd({ adUnitId: REWARDED_AD_UNIT_ID });
  }

  const info = (): ScreenInfo => ({ width: sys.windowWidth, height: sys.windowHeight, dpr, safeTop, safeBottom });

  return {
    name: 'wechat',
    screen: { canvas, ctx },
    getScreenInfo: info,
    onResize: () => {
      // 小游戏固定竖屏，无需处理
    },
    onTouch(h: TouchHandlers) {
      let active: number | null = null;
      wx.onTouchStart((e: any) => {
        const t = e.changedTouches[0];
        if (active !== null || !t) return;
        active = t.identifier;
        h.start(t.clientX, t.clientY);
      });
      wx.onTouchMove((e: any) => {
        for (const t of e.changedTouches) if (t.identifier === active) h.move(t.clientX, t.clientY);
      });
      const end = (e: any) => {
        for (const t of e.changedTouches) {
          if (t.identifier === active) {
            active = null;
            h.end(t.clientX, t.clientY);
          }
        }
      };
      wx.onTouchEnd(end);
      wx.onTouchCancel(end);
    },
    requestFrame: (cb) => requestAnimationFrame(cb),
    now: () => Date.now(),
    createOffscreen(width: number, height: number): Surface {
      const c = wx.createCanvas();
      c.width = width;
      c.height = height;
      return { canvas: c, ctx: c.getContext('2d') };
    },
    storageGet(key) {
      try {
        const v = wx.getStorageSync(key);
        return v === '' || v === undefined ? null : String(v);
      } catch {
        return null;
      }
    },
    storageSet(key, value) {
      try {
        wx.setStorageSync(key, value);
      } catch {
        // 存储失败忽略
      }
    },
    vibrate(strong) {
      try {
        wx.vibrateShort({ type: strong ? 'medium' : 'light' });
      } catch {
        // 不支持震动
      }
    },
    sfx: createSynth(() => audio),
    showRewardedAd() {
      if (!rewardedAd) return Promise.resolve(true); // 未配置广告位时直接发放（开发期）
      return new Promise((resolve) => {
        const onClose = (res: any) => {
          rewardedAd.offClose(onClose);
          resolve(!!(res && res.isEnded));
        };
        rewardedAd.onClose(onClose);
        rewardedAd.show().catch(() => rewardedAd.load().then(() => rewardedAd.show()).catch(() => resolve(false)));
      });
    },
  };
}
