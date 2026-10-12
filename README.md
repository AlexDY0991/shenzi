# CoolFly 30s 宣传片（JavaScript 生成）

一支 30 秒横屏（1920×1080，30fps）宣传片：主推 **CoolFly Urban**，其次是 **Dream Pro**。
画面用 **Three.js** 渲染，配乐用 **Web Audio API** 合成（原创曲目，没有用到任何采样，因此不涉及版权）。
最后由 Playwright 驱动无头 Chromium 逐帧导出，再用 ffmpeg 编码成 MP4。

运镜和剪辑节奏参考了 Roborock Q8 Max+ 广告：
- 先抛出痛点问题，再揭晓产品，产品名用品牌色点亮；
- 功能点用 CG 内部结构特写来讲；
- 推镜头先快后慢（speed ramp）；
- 字幕放在左下角，主标题加小号副标题；
- 每个镜头约 2 秒，切点卡在音乐节拍上；
- 收尾回到明亮的影棚定版。

## 分镜（时间点见 `src/timeline.js`）

| 时间 | 镜头 | 文案 |
| --- | --- | --- |
| 0.0–2.0 | 黄昏城市车流光轨，低机位推镜 | Stuck on the same road? |
| 2.0–4.0 | 机位从街道直升到俯视 | Rise above it. |
| 4.0–6.5 | 金门大桥上空的 Urban，冲击音配合快推镜 | Meet CoolFly **Urban** |
| 6.5–9.5 | Urban 暗场棚拍，扫光，浮尘 | WORLD'S FIRST / Standing-Position Manned Aircraft |
| 9.5–13.0 | CG 涵道风扇特写：橙色扫描线构建模型，展示气流 | Enclosed Ducted Fans |
| 13.0–15.5 | Urban 在云海上空飞行（音乐留白段） | — |
| 15.5–18.0 | Dream Pro 暗场揭幕 | GO FURTHER / CoolFly Dream **Pro** |
| 18.0–20.0 | 参数一：白色灯柱影棚 | **40 min** Flight Time |
| 20.0–22.0 | 参数二：橙色灯柱、低机位 | **120 kg** Max Payload |
| 22.0–24.0 | 参数三：云层上高速飞行 | **100 km/h** Top Speed |
| 24.0–26.5 | Urban 与 Dream Pro 在日落云海中编队飞行 | The sky is your **road.** |
| 26.5–30.0 | 白色影棚定版：Logo 逐块入场 | CoolFly · Fly by Instinct · coolflyaircraft.com |

Urban 只写了"封闭式涵道风扇"和"全球首款站姿载人飞行器"两点，没有写任何数据。
Dream Pro 的参数和官网一致：续航 40 分钟、最大载重 120 kg、最高速度 100 km/h。

## 使用

```bash
npm install
npm run preview          # 浏览器打开 http://localhost:5173 实时预览（带配乐），可拖动时间轴
                         # 加 ?t=18 可跳到第 18 秒，加 ?scale=0.5 可让预览更流畅
npm run render           # 成片 → out/coolfly-30s.mp4（4 进程并行）
npm run render:draft     # 半分辨率草稿 → out/coolfly-draft.mp4
npm run stills           # 每个镜头导出一张静帧 → out/stills/
node scripts/render.js --audio-only   # 只导出配乐 → out/coolfly-30s.wav
```

渲染需要 Chromium（自动查找 `/opt/pw-browsers/chromium` 等常见路径，也可以用环境变量 `CHROMIUM_PATH` 指定）以及 ffmpeg。

## 改哪里

- **改时长或切点**：改 `src/timeline.js`，画面、字幕和配乐会一起同步。
- **改文案**：在 `src/shots/*.js` 里，每个镜头的 `ui()` 函数中。
- **换图片**：替换 `assets/` 下的同名文件（来源见 `assets/README.md`）。
- **改配乐**：改 `src/music.js`，可以调和弦、鼓组、冲击音和音量。
- **改调色和光效**：每个镜头的 `fx()`，可调泛光、暗角、颗粒和曝光。

## 关于 3D 模型

目前所有产品画面都来自官网的渲染图和透明底图，做的是 2.5D 运镜（前景层和背景层之间有真实视差）。
如果能提供 Urban 的 3D 模型，就可以做真正的环绕镜头。160 MB 的 OBJ 可以这样压缩后再上传：

1. **Blender**（推荐）：导入 OBJ → 修改器加 Decimate（Ratio 0.1–0.2）→ 导出 glTF Binary（`.glb`），勾选 **Draco 压缩**。一般能压到 5–20 MB。
2. **命令行**：`npx obj2gltf -i urban.obj -o urban.glb`，然后 `npx @gltf-transform/cli optimize urban.glb urban-small.glb --compress draco --texture-compress webp`。
3. **实在不方便**：OBJ 是纯文本，直接打成 zip 通常能缩小 70% 左右，也可以分卷压缩后分几次上传。

模型放到 `assets/urban.glb` 即可（静态服务器已经支持 `.glb`）。
