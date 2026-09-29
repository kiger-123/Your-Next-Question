"""S01 人影遮罩：只冻住那个人，其余全交给视频。

为什么不用 sky_mask.py 那张"山脊以下全静止"的图：
  它把整片地形和火堆一起钉死 —— 天空在动、40% 的画面不动，正是用户说的"像静止"；
  而且视频里火焰本来会抖，被我们挡在外面等于白买。
收窄成人的包围盒之后：
  · 人取自静图 → Hailuo 把人画歪（morph）完全看不见，视频底最大的雷被拆掉
  · 火堆、地形、热浪微扰全部还给视频 → 真动态
  · 人的轮廓以下本来就是"暗压暗"，软边落在暗地形上不可见

形状不能是"轮廓线往下填矩形"：目视标定（review/S01_person_zone.png）显示
手臂右侧有一片天空一直透到 y≈70%，填矩形会把这块天空冻住 = 再造一个框。
所以取 ridge_mask 的洪水填充暗块 lab ∩ 人的列范围 ∩ 火堆以上 ——
lab 按构造不含天空，天空那一侧永远留给视频。
用法: python person_matte.py <plate.png> <ground_npy> <out.png>
"""
import sys, json
import numpy as np
from PIL import Image, ImageFilter

W, H = 1280, 720
plate, ground_npy, out = sys.argv[1], sys.argv[2], sys.argv[3]

lab = np.load(ground_npy).astype(bool)     # 洪水填充的暗块：地形 + 人，连成一片
# 实测：背 x≈30.3%、膝/手 x≈48.4%；火堆亮核 y 80–92%
X0, X1 = int(0.295 * W), int(0.495 * W)
BOTTOM = int(0.795 * H)                    # 停在火堆上方，别把火焰一起冻住
DILATE = 3                                 # 向外胀 3px：视频里的人若被画得偏一点，也被我们盖住

region = np.zeros((H, W), bool)
region[:BOTTOM + 1, X0:X1] = True
alpha = (lab & region).astype(np.float32)

a = Image.fromarray((alpha * 255).astype(np.uint8), 'L')
# 胀边：先取最大值滤波把轮廓外扩，再羽化
a = a.filter(ImageFilter.MaxFilter(2 * DILATE + 1))
a = a.filter(ImageFilter.GaussianBlur(4))
arr = np.asarray(a).astype(np.float32)
# 底边再叠一条宽渐变：让截断线在暗地形里彻底化开
fade = np.clip((BOTTOM - np.arange(H)) / 70.0, 0, 1).astype(np.float32)[:, None]
arr = np.minimum(arr, 255 * np.maximum(fade, (np.arange(H)[:, None] < BOTTOM - 60)))
mask = np.clip(arr, 0, 255).astype(np.uint8)

rgb = np.asarray(Image.open(plate).convert('RGB'))
Image.fromarray(np.dstack([rgb, mask]), 'RGBA').save(out)

cov = (mask > 128)
ys, xs = np.nonzero(cov) if cov.any() else (np.array([0]), np.array([0]))
print(json.dumps({
    'out': out,
    'covered_pct_of_frame': round(float(cov.mean()) * 100, 2),
    'bbox_pct': {'x': [round(xs.min() / W * 100, 1), round(xs.max() / W * 100, 1)],
                 'y': [round(ys.min() / H * 100, 1), round(ys.max() / H * 100, 1)]},
    'fire_left_to_video': round(float(1 - cov[int(0.80 * H):, int(0.42 * W):int(0.56 * W)].mean()) * 100, 1),
}, ensure_ascii=False, indent=1))
print('（fire_left_to_video = 火堆区被让给视频的比例，应接近 100）')
