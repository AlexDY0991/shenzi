# 喵喵理毛线

解绳子类益智小游戏（猫咪毛线球主题）。拖动毛线两端的纽扣换到空孔里，一根毛线不再和任何毛线交叉、也不压在别人的纽扣上，就会被理顺，卷成毛线球收进猫咪的篮子。在步数用完前理顺全部毛线即过关。

美术全部由代码绘制，没有图片和音频资源，音效实时合成。

**在线试玩**：https://alexdy0991.github.io/shenzi/ （GitHub Pages，见下文"发布展示页"）

## 关卡与机制

15 关：第 1～5 关入门，之后步数余量逐渐收紧，并依次引入三种机制：

| 机制 | 首次出现 | 规则 |
|---|---|---|
| 缝住的纽扣 | 第 6 关 | 花边纽扣不能拖动，只能挪毛线另一头 |
| 打盹的小猫 | 第 9 关 | 再理顺 N 根毛线前，小猫压着的毛线两端都不能动 |
| 毛线锁 | 第 12 关 | 上锁的孔不能放纽扣，理顺同色毛线后打开 |

所有纽扣都动不了时判为卡死，可以用剪刀救场或重来。第 5、8、11、15 关是困难关，进关时有横幅提示。

## 地图与手感

- **自由形状地图**：每关由弧形布条、直布条、猫头 / 爱心 / 鱼 / 云朵 / 爪垫等布垫拼成，孔沿布片排布（`tools/maps.ts`）。猫头布垫上有会眨眼的刺绣表情。
- **毛线物理**：每根毛线是一串 Verlet 质点（`src/game/rope-sim.ts`），拖动时有惯性和拉伸变细，落孔时纽扣压扁回弹、毛线抖动。
- **环扣**：交叉的两根毛线在交点互相勾住，拖动一根会扯动另一根；交叉消失时环扣滑脱，毛线弹回。
- 物理只负责表现，规则判定仍以两孔之间的直线是否交叉为准，所以求解器的结论和画面一致。
- **触感**：`Platform.haptic()` 分轻 / 中 / 重 / 成功 / 警告五档。微信用 `wx.vibrateShort`；安卓浏览器用 `navigator.vibrate`；iOS 浏览器不支持震动接口，改为在触摸时切换隐藏的系统开关控件（`<input switch>`，iOS 18 起会给轻触反馈）。按钮在手指按下时就震动、出声并下沉，松手回弹。

## 常用命令

```bash
npm install
npm run build      # 构建网页版 + 微信小游戏工程
npm run dev        # 监听模式
npm test           # 核心逻辑测试（含"所有关卡可解"校验）
npm run typecheck
npm run levels     # 重新生成关卡（约 40 秒）
```

构建产物：

| 路径 | 用途 |
|---|---|
| `dist/web/index.html` | 网页版，单文件，浏览器直接打开 |
| `dist/wechat/` | 微信小游戏工程，用微信开发者工具"导入项目"打开 |
| `dist/site/` | GitHub Pages 站点：展示页 `index.html` + 全屏试玩页 `play.html` |
| `dist/artifact/yarn-cat.html` | 发布到 claude.ai 的试玩页 |

## 目录结构

```
src/
  core/        纯逻辑，不依赖任何平台：几何判定、规则（含特殊机制）、关卡状态、求解器
  render/      Canvas 2D 绘制：毛线、纽扣、棋盘、猫、篮子、UI 控件
  game/        场景与交互：标题页、关卡页、存档
  platform/    平台适配层：web.ts（浏览器 / iOS WebView）、wechat.ts（微信小游戏）
  entry/       各平台入口
  levels/      关卡数据（由 tools/gen-levels.ts 生成）
site/          GitHub Pages 展示页（插图复用游戏的绘制代码）
tools/         构建脚本、关卡生成器
wechat/        微信小游戏配置模板
```

## 跨平台约定

- 游戏代码只通过 `src/platform/types.ts` 里的 `Platform` 接口访问平台能力（画布、触摸、存储、震动、音频、广告）。
- `core/`、`render/`、`game/` 里禁止直接使用 `window`、`document`、`localStorage`、`navigator`。
- 绘制时不用 `Path2D`、`ctx.roundRect`、`ctx.ellipse`（微信小游戏支持不稳定），圆角和椭圆用 `render/shapes.ts` 里的实现。
- `npm run build` 会检查微信包里是否出现上述 API，出现则构建失败。

## 关卡生成

`tools/gen-levels.ts` 的流程：

1. 在 `tools/maps.ts` 的地图模板上随机摆放毛线，要求每根开局都缠着，按关卡计划加上特殊机制。
2. 用束搜索求解器（`src/core/solver.ts`）算参考步数，再爬山微调布局，把参考步数推到目标区间的上限。
3. 用更宽的束复核参考步数。

给玩家的步数 = 参考步数 + 余量（前期 2 步，后期 1 步）。过关星级按实际步数与参考步数比较。游戏和求解器共用 `src/core/rules.ts` 里的同一套规则。

## 发布展示页（GitHub Pages）

`.github/workflows/pages.yml` 在推送到 `main` 时自动构建并发布 `dist/site/`。首次使用需要在仓库 **Settings → Pages → Build and deployment → Source** 里选 **GitHub Actions**。发布后地址为 `https://<用户名>.github.io/<仓库名>/`。

## 上微信前还要做的

- 在 `wechat/project.config.json` 填入真实 AppID。
- 在 `src/platform/wechat.ts` 填激励视频广告位 ID（未填时道具直接发放）。
- 在微信开发者工具和真机上实测（目前只在浏览器里模拟 `wx` 环境验证过）。
- 把 `src/game/levels.ts` 里的 `DEMO_UNLOCK_ALL` 改为 `false`，恢复逐关解锁。
