import { App } from '../game/app';
import { createWechatPlatform } from '../platform/wechat';

new App(createWechatPlatform());
