"""P0 视频通路等价测试的判据。
两条 composition 同源同帧、只差 <Img> vs <OffthreadVideo>，两层都叠同一个 GradeLayers。

判据（缺一不可）：
 1. 逐像素平均差 <3.0 —— 只允许 h264 有损编码的噪声
 2. 最大差 <30 —— 不允许出现局部结构性差异
 3. 两条通路的 1% 黑位都 ≥ 5 IRE —— 这一条才是在验"调色层叠在视频上有没有生效"：
    GradeLayers 的 BLACK_FLOOR 是 lighten 混合，生效了任何像素都不可能低于 ≈IRE 6；
    如果视频通路的黑位掉到 0，说明 mix-blend-mode 被隔离组切断了（v1 踩过的老坑）。
用法: python pathtest.py
"""
import numpy as np
from PIL import Image

A = '06_output/review/pathtest_ImagePathTest.png'
B = '06_output/review/pathtest_VideoPathTest.png'
a = np.asarray(Image.open(A).convert('RGB')).astype(np.int32)
b = np.asarray(Image.open(B).convert('RGB')).astype(np.int32)
d = np.abs(a - b)
mad, mx = d.mean(), d.max()

la = (0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2])
lb = (0.2126 * b[:, :, 0] + 0.7152 * b[:, :, 1] + 0.0722 * b[:, :, 2])
ire = lambda x: x / 255 * 100
p1a, p1b = ire(np.percentile(la, 1)), ire(np.percentile(lb, 1))

print(f'平均差 {mad:.2f}   最大差 {mx}')
print(f'1% 黑位  静图通路 {p1a:.1f} IRE   视频通路 {p1b:.1f} IRE')
for tag, arr in (('静图', la), ('视频', lb)):
    print(f'  {tag}通路最暗像素 {ire(arr.min()):.1f} IRE')

ok = mad < 3.0 and mx < 30 and p1a >= 5 and p1b >= 5
if ok:
    print('✓ 两条通路等价：视频底图的渲染链路与静图一致，调色层在视频上仍然生效')
else:
    why = []
    if mad >= 3.0:
        why.append(f'平均差 {mad:.2f} 过大')
    if mx >= 30:
        why.append(f'最大差 {mx} 有结构性差异')
    if p1a < 5 or p1b < 5:
        why.append(f'黑位 {p1a:.1f}/{p1b:.1f} IRE 不达标 —— 调色层很可能没叠在视频上')
    print('✗ 不通过：' + '；'.join(why))
raise SystemExit(0 if ok else 1)
