"""S01 L1 星空缓旋：生成"静止地面"层的 RGBA 图，并在离线把泄漏判死。

层序（关键，反过来必漏）：
  第 1 层  底图 + 代码星点   transform = scale(s) rotate(θ)   ← 整层在天上转
  第 2 层  本脚本产出的 RGBA  transform = scale(s)（不转）      ← 山/人/火，盖住第 1 层
alpha 烘进第 2 层的图里是对的：它和第 1 层里的山共用同一个 scale(s)、且都不转，
所以遮罩和山永远对齐。要是把 alpha 烘到转着的那层上，遮罩会跟着转 1°，山尖就露出来了
（2026-09-27 主控自审抓到，GLM 复核用画面空间量测证实：交界处 2088px 比底图亮）。

去掉两层共用的 scale 之后，几何只剩"纯旋转"，所以余量按 θ·|x−640| 算，
并且要额外算斜坡：源列 sx 和输出列 x 差 Δx，top[sx]≠top[x]，坡越陡差得越多。
用法: python sky_mask.py <plate.png> <ridge_prefix> <out_rgba_png> [deg]
"""
import sys, json
import numpy as np
from PIL import Image

W, H = 1280, 720
CX, CY = W / 2, H / 2
# 羽化带宽度：静图时代 18px 没问题（两侧是同一张图）；视频底会动，
# 宽带 = 一条静止的亮边浆。6px 是"看不出接缝"和"不露亮边"之间的折中。
FEATHER = 6
path, pre, out = sys.argv[1], sys.argv[2], sys.argv[3]
DEG = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
SC = 1.0    # 第 2 层相对第 1 层只差一个旋转，尺度是共用的 → 在 u 空间里 s=1

top = np.load(pre + '_ridge.npy')
th = np.deg2rad(DEG)


def src(x, y, t):
    """u 空间里第 1 层（转着的那层）在 (x,y) 处取到的底图像素。"""
    return (CX + (np.cos(t) * (x - CX) + np.sin(t) * (y - CY)) / SC,
            CY + (-np.sin(t) * (x - CX) + np.cos(t) * (y - CY)) / SC)


# 地面 alpha 的上边界：逐列往上找第一个"对所有 θ 都不会把山搬进天空"的 y
THS = [0.0] + [th * k / 8 for k in range(1, 9)]
def safe(x, y):
    for t in THS:
        sx, sy = src(x, y, t)
        if sy > top[int(np.clip(round(sx), 0, W - 1))]:
            return False
    return True


edge = np.empty(W, dtype=np.int32)
for x in range(W):
    y = int(top[x]) - 1
    while y > 0 and not safe(x, y):
        y -= 1
    edge[x] = y
# 关键一步：把整条边界**往下蚀 FEATHER 像素**。
# 不蚀的话羽化带落在剪影上方的亮天上 —— 那几像素是"静止的亮天空"，
# 压在会动的视频天上就是一条亮边浆（09-29 那圈方框的同族问题，只是更细）。
# 蚀进去之后羽化带整段落在主体自己的暗像素上，暗压暗，看不见。
edge = np.minimum(edge + FEATHER, H - 1)

yy = np.arange(H)[:, None]
# 地面层：edge 往下全是 255，edge 往上 FEATHER 内淡出（淡出带已在主体内侧）
alpha = np.clip((yy - (edge[None, :] - FEATHER)) / FEATHER, 0, 1) * 255
alpha = alpha.astype(np.uint8)
Image.fromarray(alpha, 'L').save(pre + '_groundmask.png')
rgb = np.asarray(Image.open(path).convert('RGB'))
Image.fromarray(np.dstack([rgb, alpha]), 'RGBA').save(out)

# ── 判据 1：逆映射。地面层没盖严的地方（alpha<255），转动层不许取到轮廓以下 ──
px, py = np.meshgrid(np.arange(W, dtype=np.float64), np.arange(H, dtype=np.float64))
res = {}
# 只判动画真实经过的区间 0→+DEG。要反向转就重跑本脚本（THS 会跟着换）。
for t in (th * 0.5, th):
    sx, sy = src(px, py, t)
    sxi = np.clip(np.round(sx).astype(np.int32), 0, W - 1)
    shown = alpha < 255
    leak = shown & (sy > top[sxi])
    res[f'{np.degrees(t):+.1f}deg'] = {
        'leak_px': int(leak.sum()),
        'leak_px_alpha<64': int((leak & (alpha < 64)).sum()),
    }
# 注：u 空间里"旋出底图边界"的像素不计 here —— 那是共用 scale 的活，
# 由 Plate 里的 overscanFor(deg) 断言兜（s ≥ 1.0308 才让转）。

# ── 判据 2：像素域独立复核（不信上面的推导，直接比合成帧和底图）──────
# 两个方向分开量：山被搬进天空 / 天空被搬到山上。阈值 25 ≈ 山体(2~5)与天空(8~16+)之差。
c, s = np.cos(th), np.sin(th)
sky = Image.open(path).convert('RGB').transform(
    (W, H), Image.AFFINE,
    (c, s, CX - (c * CX + s * CY), -s, c, CY - (-s * CX + c * CY)), resample=Image.BICUBIC)
grnd = Image.fromarray(np.dstack([rgb, alpha]), 'RGBA')
comp = Image.alpha_composite(sky.convert('RGBA'), grnd).convert('RGB')
comp.save(pre + '_comp.png')

pl_l = np.asarray(Image.open(path).convert('L')).astype(np.int32)
cp_l = np.asarray(comp.convert('L')).astype(np.int32)
above = np.zeros((H, W), bool)
below = np.zeros((H, W), bool)
for x in range(W):
    above[max(0, edge[x] - 70):max(0, edge[x] - 4), x] = True
    below[edge[x]:min(edge[x] + 70, H), x] = True
# 渲染时两层都 scale≥1.031，画面最外圈 3% 本来就被裁掉；
# 而 PIL 的 AFFINE 在底图外补黑，不排除它就会把"补黑"误判成山尖。
above[: int(0.03 * H), :] = False
above[int(0.97 * H):, :] = False
above[:, : int(0.03 * W)] = False
above[:, int(0.97 * W):] = False
diff = {
    # 山搬进天空 = 合成帧在这里变成"山体级"的黑，而底图此处本来是亮的天空。
    # 不能用"比底图暗了多少"：旋转会把一颗星挪走，那也黑 200 级，全是假警报。
    'mountain_into_sky_px': int(((cp_l < 10) & (pl_l > 40) & above).sum()),
    'sky_onto_mountain_px': int(((cp_l - pl_l > 25) & below).sum()),
    'darkest_above': int(cp_l[above].min()),
    'max_brightening_below': int((cp_l - pl_l)[below].max()),
}

print(json.dumps({
    'out': out, 'deg': DEG, 'feather': FEATHER,
    'edge_pct': {'min': round(float(edge.min() / H * 100), 1),
                 'median': round(float(np.median(edge) / H * 100), 1),
                 'max': round(float(edge.max() / H * 100), 1)},
    'margin_px': {'min': int((top - edge).min()), 'median': int(np.median(top - edge)),
                  'max': int((top - edge).max())},
    'ground_area_frac': round(float((alpha > 0).mean()), 4),
    'test': res,
    'pixel_diff': diff,
}, ensure_ascii=False, indent=1))
print(f'合成预览 → {pre}_comp.png')
