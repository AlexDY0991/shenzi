# Assets

| File | Used in | Source |
| --- | --- | --- |
| `logo.svg` | end card | Traced from the CoolFly logo PNG supplied by the client (`tools/vectorize_logo.py`). Orange = `#FF5A00`. |
| `urban_studio.jpg` | shot 4 (Urban, dark studio) | coolflyaircraft.com — `2026/09/45°.png` |
| `urban_goldengate.jpg` | shot 3 (Meet CoolFly Urban) | coolflyaircraft.com — homepage hero render |
| `urban_cutout.webp` | end card | coolflyaircraft.com — `2026/08/45°侧俯视_00000.png` (transparent) |
| `urban_pilot_cutout.webp` | shots 6, 11 | coolflyaircraft.com — `2026/09/透明底.png` (transparent) |
| `dreampro_studio.jpg` | shot 7 (Dream Pro reveal) | coolflyaircraft.com — `2026/09/20260410-164245.jpg` |
| `dreampro_cutout.webp` | shots 8–11 | coolflyaircraft.com — Dream Pro page, `2026/02/二代飞行器图片.png` (transparent) |

The photos were downscaled to 2560 px wide (JPG q88); cut-outs were trimmed to their
alpha bounds and saved as WebP with lossless alpha.

To replace an image, keep the same file name (or update `src/assets.js`) and re-render.
