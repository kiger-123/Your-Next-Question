"""S01 山脊轮廓量测 —— 给 L1「只转天空」当 clip/遮罩边界。

判据：山体是**又暗又没有星**的大块。单用绝对亮度不行（天空均值 16~43、山体 2~9，
在 20 附近重叠），所以两条一起卡：9px 局部均值 < 12 且 15px 局部最大值 < 40。
再从底边 4-邻域洪水填充（自动绕过火堆亮池那种"地上的洞"），逐列取分量上界。
用法: python ridge_mask.py <plate.png> [out_prefix]
"""
import sys, json
import numpy as np
from PIL import Image, ImageFilter
from collections import deque

W, H = 1280, 720
path = sys.argv[1]
pre = sys.argv[2] if len(sys.argv) > 2 else '06_output/review/S01'

g = Image.open(path).convert('L')
lmean = np.asarray(g.filter(ImageFilter.BoxBlur(9))).astype(np.int32)
lmax = np.asarray(g.filter(ImageFilter.MaxFilter(15))).astype(np.int32)
dark = (lmean < 12) & (lmax < 40)

lab = np.zeros((H, W), bool)
q = deque()
for x in range(W):
    if dark[H - 1, x]:
        lab[H - 1, x] = True
        q.append((H - 1, x))
while q:
    y, x = q.popleft()
    for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
        if 0 <= ny < H and 0 <= nx < W and dark[ny, nx] and not lab[ny, nx]:
            lab[ny, nx] = True
            q.append((ny, nx))

top = np.full(W, H, dtype=np.int32)
for x in range(W):
    c = np.flatnonzero(lab[:, x])
    if c.size >= 12:          # 少于 12px 的分量是岩缝触须，不算地平线
        top[x] = c[0]
idx = np.arange(W)
miss = top >= H
if miss.any():
    top[miss] = np.interp(idx[miss], idx[~miss], top[~miss])

# ── 三道先验修正（都在目视标定之后写死，不是调参调出来的）────────────
# ① 山体最高点实测在 y=38%（x=0 那截山尖），任何列的边界都不许高于 34.5%。
#    洪水填充会顺着左上角"又暗又没星"的天空爬到 y=0，这条先验把它按住。
CEIL = int(0.345 * H)
top = np.maximum(top, CEIL)
# ② 火堆亮池会把暗带打断 → 那几列的边界掉到 92%（掉进地里）。
#    用 ±140 列的宽中位数当参考，越界的拉回 [med-45, med+45]。
W1, D = 140, 45
med = np.array([np.median(top[max(0, x - W1):x + W1 + 1]) for x in range(W)])
top = np.clip(top, med - D, med + D)
# ③ 人头必须留在静止层里 —— 但**绝不能压一条水平保护线**。
#    09-27 那版在 x31–42% 压了一条 46.5% 平线，于是遮罩在头顶顶出一块矩形凸起，
#    凸起里填的是原始静图的天空。静图时代这块凸起和底下是同一张图，肉眼零破绽；
#    一旦换成会动的视频底，"静止的一块天"压在"流动的一片天"上就是肉眼可见的方框
#    （2026-09-29 实测框内比框外亮 +8 级）。正解是逐列沿剪影走。
#    判据（2026-09-29 逐列剖面实测校准）：头顶及身体 1–4，紧贴头顶之上的天空 32–47，
#    所以阈值取 **25**，不是 60 —— 60 会把那片暗天也当成"人"，一路爬到画顶。
#    也不设"暗区宽度"闸门：人身体内部横向本来就是一整片暗，那种判据第一帧就 break。
#    范围只圈头肩 x32–41%（人影唯一高对比区），上下各留一道硬边界兜底。
PX0, PX1 = int(0.32 * W), int(0.41 * W)
sil = np.asarray(g.filter(ImageFilter.BoxBlur(2))).astype(np.int32)
FLOOR, DARK = int(0.44 * H), 25
for x in range(PX0, PX1):
    y = int(top[x])
    while y > FLOOR and sil[y - 1, x] < DARK:
        y -= 1
    top[x] = min(top[x], y)
# ④ 去抖窗口收窄到 5 列：剪影要贴边，抹平了又是一块凸起
top = np.array([np.median(top[max(0, x - 2):x + 3]) for x in range(W)], dtype=np.int32)

pct = top / H * 100
print(json.dumps({
    'plate': path, 'filled_frac': round(float(lab.mean()), 4),
    'naive_cols': int(miss.sum()),
    'ridge_pct': {'min': round(float(pct.min()), 1), 'p25': round(float(np.percentile(pct, 25)), 1),
                  'median': round(float(np.median(pct)), 1), 'p75': round(float(np.percentile(pct, 75)), 1),
                  'max': round(float(pct.max()), 1)},
    'by_decile_x': {f'x{i * 10}-{i * 10 + 9}%': round(float(np.median(pct[i * 128:(i + 1) * 128])), 1)
                    for i in range(10)},
}, ensure_ascii=False, indent=1))
np.save(pre + '_ridge.npy', top)
np.save(pre + '_ground.npy', lab)

vis = np.asarray(Image.open(path).convert('RGB')).copy()
for x in range(W):
    for d in range(-1, 2):
        vis[int(np.clip(top[x] + d, 0, H - 1)), x] = [255, 0, 255]
Image.fromarray(vis).save(pre + '_ridge.png')
print(f'轮廓预览 → {pre}_ridge.png  轮廓 npy → {pre}_ridge.npy')
