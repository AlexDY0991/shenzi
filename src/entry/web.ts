import { App } from '../game/app';
import { createWebPlatform } from '../platform/web';

const canvas = document.getElementById('game') as HTMLCanvasElement;
new App(createWebPlatform(canvas));
